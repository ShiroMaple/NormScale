import { StandardRuleSet, GradeRule, EvaluationRule, SpecificationSlice } from '../schemas/standard.schema';
import { CertificateExtract, TestRecord } from '../schemas/certificate.schema';
import { AuditReport, RuleEvaluationItemResult, AuditSummary, SingleStandardEvaluationVerdict } from '../schemas/report.schema';
import { EvaluationContext, evaluateNumericRange } from './numeric-evaluator';
import { evaluateDynamicExpression } from './dynamic-evaluator';
import { evaluateOrChoiceGroup, evaluateAlternativeGroup, evaluateQualitativeEnum, evaluateExemption } from './logic-evaluator';
import { isRuleTriggered, formatConditionHumanText } from './missing-scanner';
import { logger as defaultLogger, ILogger, ITraceCollector } from '../logger';
import { PerformanceProfiler } from '../logger/profiler';
import { CompositeSlice, CompositeEvaluationRule, getStandardShortCode, humanizeDynamicFormulaText } from './multi-standard-composer';
import { PropertyKeyNormalizer } from '../normalizer/property-key-normalizer';

export interface EngineEvaluationOptions {
  logger?: ILogger;
  collector?: ITraceCollector;
}

/* ==========================================================================
   合规性核验核心调度引擎 (Compliance Verification Engine)
   - 整合标准规则集与质保书数据，调度原子核验器，执行一票否决制全局判定
   ========================================================================== */

export class ComplianceEngine {
  /* ==========================================================================
     一、核心核验主流水线调度 (Evaluation Pipeline)
     - 串联牌号解析、上下文图谱构建、规则循环评估、漏检扫描与裁决汇总
     ========================================================================== */

  /**
   * 执行质保书合规性核验的主入口函数
   * @param standardRuleSet 命中的标准规则全集（如 GB/T 13296-2023）
   * @param certificate 结构化提取出的质保书实测数据
   * @param options 可选的日志器与内存审计轨迹收集器
   * @returns 包含各单项明细、全局决策与审计轨迹的完整核验报告
   */
  public static evaluate(
    standardRuleSet: StandardRuleSet,
    certificate: CertificateExtract,
    options?: EngineEvaluationOptions
  ): AuditReport {
    const log = options?.logger || defaultLogger;
    const collector = options?.collector;
    const header = certificate.header;
    const declaredGrade = header.declared_grade.trim();

    log.info('ENGINE', `启动合规性核验引擎: 质保书 [${header.certificate_no}]，标准 [${header.declared_standard}]，牌号 [${declaredGrade}]`);

    return PerformanceProfiler.profileSync('ENGINE', '质保书规则核验主流水线', () => {
      // --------------------------------------------------------------------------
      // 步骤 1：牌号规则路由与切片命中 (Grade Resolution & Slice Routing)
      // --------------------------------------------------------------------------
      const gradeRule = this.resolveGradeRule(standardRuleSet, declaredGrade);
      if (!gradeRule) {
        log.error('ENGINE', `标准 [${standardRuleSet.standard_meta.standard_id}] 未找到牌号 [${declaredGrade}] 的核验规则`);
        if (collector) collector.addTrace('ENGINE', 'error', `未收录牌号: ${declaredGrade}`);
        throw new Error(
          `Standard '${standardRuleSet.standard_meta.standard_id}' does not contain rules for grade '${declaredGrade}'`
        );
      }

      if (collector) {
        collector.addTrace('ENGINE', 'info', `命中标准规则切片: [${standardRuleSet.standard_meta.standard_id}] -> [${gradeRule.grade_info.primary_grade}] (包含 ${gradeRule.evaluation_rules.length} 条检验规则)`);
      }

      // --------------------------------------------------------------------------
      // 步骤 2：构建全局核验上下文数据图谱 (Build Evaluation Context)
      // --------------------------------------------------------------------------
      const context = this.buildContext(certificate);

      // --------------------------------------------------------------------------
      // 步骤 3：逐项执行原子规则评估流水线 (Execute Rule Evaluator Pipeline)
      // --------------------------------------------------------------------------
      const itemResults: RuleEvaluationItemResult[] = [];
      const missingMandatory: string[] = [];
      const evaluatedPropertyKeys = new Set<string>();

      for (const rule of gradeRule.evaluation_rules) {
        const result = this.evaluateSingleRule(rule, context);
        itemResults.push(result);
        evaluatedPropertyKeys.add(rule.property_key);

        // 处理复合逻辑组候选键覆盖
        if (rule.rule_type === 'alternative_group' && Array.isArray(rule.criteria['candidates'])) {
          for (const cand of rule.criteria['candidates']) {
            if (cand.candidate_key) evaluatedPropertyKeys.add(cand.candidate_key);
          }
        }
        if (rule.rule_type === 'or_choice_group' && Array.isArray(rule.criteria['options'])) {
          for (const opt of rule.criteria['options']) {
            if (opt.sub_key) {
              evaluatedPropertyKeys.add(opt.sub_key);
              evaluatedPropertyKeys.add(`${rule.property_key}_${opt.sub_key}`);
            }
          }
        }

        // 记录单项审验日志与轨迹
        if (result.status === 'FAIL') {
          log.warn('ENGINE', `[不合格] ${rule.display_name}: ${result.message}`);
          if (collector) collector.addTrace('ENGINE', 'warn', `[不合格] ${rule.display_name}: ${result.message}`);
        } else if (result.status === 'MISSING') {
          log.warn('ENGINE', `[漏检] ${rule.display_name}: ${result.message}`);
          if (collector) collector.addTrace('ENGINE', 'warn', `[漏检] ${rule.display_name}: ${result.message}`);
        } else if (result.status === 'PASS') {
          log.debug('ENGINE', `[合格] ${rule.display_name}: ${result.message}`);
        }

        // 强制项或条件触发项漏检时记录到强制漏检清单
        if (result.status === 'MISSING' && (rule.requirement_level === 'MANDATORY' || rule.requirement_level === 'CONDITIONAL')) {
          missingMandatory.push(`${rule.display_name} (${rule.property_key})`);
        }
      }

      // --------------------------------------------------------------------------
      // 步骤 4：统计质保书中未被标准规则覆盖的额外检测项 (Extra Reported Items)
      // --------------------------------------------------------------------------
      const unmatchedRecords: TestRecord[] = [];
      for (const rec of certificate.test_records) {
        if (!evaluatedPropertyKeys.has(rec.property_key)) {
          unmatchedRecords.push(rec);
        }
      }
      if (unmatchedRecords.length > 0 && collector) {
        collector.addTrace('ENGINE', 'info', `发现 ${unmatchedRecords.length} 项标准未强制要求的额外报送检测项`);
      }

      // --------------------------------------------------------------------------
      // 步骤 5：全局决策汇总与一票否决裁决 (Decision Aggregation & Gatekeeping)
      // --------------------------------------------------------------------------
      const summary = this.buildSummary(itemResults, missingMandatory);

      log.info(
        'ENGINE',
        `核验决策完成: 全局结论 [${summary.overall_status}] (共评估 ${summary.total_rules_evaluated} 项，合格 ${summary.pass_count} 项，不合格 ${summary.fail_count} 项，漏检 ${summary.missing_count} 项)`
      );

      if (collector) {
        collector.addTrace(
          'ENGINE',
          summary.overall_status === 'PASS' ? 'info' : 'warn',
          `全局裁决结论: [${summary.overall_status}] (合格: ${summary.pass_count}, 不合格: ${summary.fail_count}, 漏检: ${summary.missing_count})`
        );
      }

      const dualVerdicts = this.computeDualVerdicts(itemResults, summary);

      return {
        certificate_no: header.certificate_no,
        declared_standard: header.declared_standard,
        declared_grade: declaredGrade,
        matched_standard_id: standardRuleSet.standard_meta.standard_id,
        matched_grade: gradeRule.grade_info.primary_grade,
        audit_timestamp: new Date().toISOString(),
        summary,
        item_results: itemResults,
        missing_mandatory_items: missingMandatory,
        unmatched_certificate_records: unmatchedRecords.length > 0 ? unmatchedRecords : undefined,
        audit_traces: collector?.getTraces(),
        performance_metrics: collector?.getPerformanceMetrics(),
        standard_compliance_verdict: dualVerdicts.standard_compliance_verdict,
        agreement_compliance_verdict: dualVerdicts.agreement_compliance_verdict,
        statutory_risk_flag: dualVerdicts.statutory_risk_flag,
      };
    }, log, collector).result;
  }

  /**
   * 直接基于规格切片 (SpecificationSlice 或 CompositeSlice) 执行合规性核验
   * 支持多标准规则叠加后的综合严苛比对与双标尺透明追溯
   */
  public static evaluateSlice(
    slice: SpecificationSlice | CompositeSlice,
    certificate: CertificateExtract,
    options?: EngineEvaluationOptions
  ): AuditReport {
    const log = options?.logger || defaultLogger;
    const collector = options?.collector;
    const header = certificate.header;
    const declaredGrade = header.declared_grade.trim();

    const isComposite = 'composite_meta' in slice && !!(slice as CompositeSlice).composite_meta;
    const standardId = isComposite
      ? (slice as CompositeSlice).composite_meta.source_standards.join(' + ')
      : (slice.standard_code || header.declared_standard);

    log.info('ENGINE', `启动合规性核验引擎 (切片模式): 质保书 [${header.certificate_no}]，标准 [${standardId}]，切片 [${slice.display_name}]`);

    return PerformanceProfiler.profileSync('ENGINE', '质保书切片规则核验流水线', () => {
      if (collector) {
        collector.addTrace('ENGINE', 'info', `命中规则切片: [${standardId}] -> [${slice.display_name}] (包含 ${slice.evaluation_rules.length} 条检验规则)`);
      }

      const context = this.buildContext(certificate);
      const itemResults: RuleEvaluationItemResult[] = [];
      const missingMandatory: string[] = [];
      const evaluatedPropertyKeys = new Set<string>();

      for (const rule of slice.evaluation_rules) {
        const result = this.evaluateSingleRule(rule, context);
        itemResults.push(result);
        evaluatedPropertyKeys.add(rule.property_key);

        if (rule.rule_type === 'alternative_group' && Array.isArray(rule.criteria['candidates'])) {
          for (const cand of rule.criteria['candidates']) {
            if (cand.candidate_key) evaluatedPropertyKeys.add(cand.candidate_key);
          }
        }
        if (rule.rule_type === 'or_choice_group' && Array.isArray(rule.criteria['options'])) {
          for (const opt of rule.criteria['options']) {
            if (opt.sub_key) {
              evaluatedPropertyKeys.add(opt.sub_key);
              evaluatedPropertyKeys.add(`${rule.property_key}_${opt.sub_key}`);
            }
          }
        }

        if (result.status === 'FAIL') {
          log.warn('ENGINE', `[不合格] ${rule.display_name}: ${result.message}`);
          if (collector) collector.addTrace('ENGINE', 'warn', `[不合格] ${rule.display_name}: ${result.message}`);
        } else if (result.status === 'MISSING') {
          log.warn('ENGINE', `[漏检] ${rule.display_name}: ${result.message}`);
          if (collector) collector.addTrace('ENGINE', 'warn', `[漏检] ${rule.display_name}: ${result.message}`);
        } else if (result.status === 'PASS') {
          log.debug('ENGINE', `[合格] ${rule.display_name}: ${result.message}`);
        }

        if (result.status === 'MISSING' && (rule.requirement_level === 'MANDATORY' || rule.requirement_level === 'CONDITIONAL')) {
          missingMandatory.push(`${rule.display_name} (${rule.property_key})`);
        }
      }

      const unmatchedRecords: TestRecord[] = [];
      for (const rec of certificate.test_records) {
        if (!evaluatedPropertyKeys.has(rec.property_key)) {
          unmatchedRecords.push(rec);
        }
      }

      const summary = this.buildSummary(itemResults, missingMandatory);

      log.info(
        'ENGINE',
        `核验决策完成: 全局结论 [${summary.overall_status}] (评估 ${summary.total_rules_evaluated} 项，合格 ${summary.pass_count} 项，不合格 ${summary.fail_count} 项，漏检 ${summary.missing_count} 项)`
      );

      if (collector) {
        collector.addTrace(
          'ENGINE',
          summary.overall_status === 'PASS' ? 'info' : 'warn',
          `全局裁决结论: [${summary.overall_status}] (合格: ${summary.pass_count}, 不合格: ${summary.fail_count}, 漏检: ${summary.missing_count})`
        );
      }

      const dualVerdicts = this.computeDualVerdicts(itemResults, summary);

      return {
        certificate_no: header.certificate_no,
        declared_standard: header.declared_standard,
        declared_grade: declaredGrade,
        matched_standard_id: standardId,
        matched_grade: slice.primary_grade || slice.spec_key,
        audit_timestamp: new Date().toISOString(),
        summary,
        item_results: itemResults,
        missing_mandatory_items: missingMandatory,
        unmatched_certificate_records: unmatchedRecords.length > 0 ? unmatchedRecords : undefined,
        audit_traces: collector?.getTraces(),
        performance_metrics: collector?.getPerformanceMetrics(),
        standard_compliance_verdict: dualVerdicts.standard_compliance_verdict,
        agreement_compliance_verdict: dualVerdicts.agreement_compliance_verdict,
        statutory_risk_flag: dualVerdicts.statutory_risk_flag,
      };
    }, log, collector).result;
  }


  /* ==========================================================================
     二、材料牌号路由与多别名归一化匹配 (Grade Resolution)
     - 消除空格与连接符，支持主牌号、统一数字代号、标准代号及外标别名字典匹配
     ========================================================================== */

  /**
   * 根据质保书声称牌号在标准规则库中定位具体牌号规则切片
   * 例如："06Cr19Ni10"、"S30408"、"SUS304"、"TP304" 均能归一化命中 S30408 规则
   */
  public static resolveGradeRule(
    standardRuleSet: StandardRuleSet,
    declaredGrade: string
  ): GradeRule | undefined {
    // 归一化处理：转大写并移除空格、下划线及连字符
    const normalized = declaredGrade.toUpperCase().replace(/[\s-_]/g, '');

    for (const gr of standardRuleSet.grade_rules) {
      const primary = gr.grade_info.primary_grade.toUpperCase().replace(/[\s-_]/g, '');
      const unified = gr.grade_info.unified_code?.toUpperCase().replace(/[\s-_]/g, '');
      const standardCode = gr.grade_info.standard_code?.toUpperCase().replace(/[\s-_]/g, '');
      const aliases = gr.grade_info.aliases?.map(a => a.toUpperCase().replace(/[\s-_]/g, '')) || [];

      // 依次比对：主牌号、统一数字代号、标准代号、历史/跨国别名列表
      if (
        primary === normalized ||
        unified === normalized ||
        standardCode === normalized ||
        aliases.includes(normalized)
      ) {
        return gr;
      }
    }
    return undefined;
  }


  /* ==========================================================================
     三、核验上下文数据图谱构建 (Build Evaluation Context)
     - 提取几何尺寸并建立检验项的键值索引快照，为动态公式与条件判断提供数据基底
     ========================================================================== */

  /**
   * 将质保书解析结果组装为结构化的核验上下文环境
   */
  private static buildContext(certificate: CertificateExtract): EvaluationContext {
    const recordsMap = new Map<string, TestRecord>();
    const chemical: Record<string, number> = {};
    const mechanical: Record<string, number> = {};
    const dimensions: Record<string, number> = {};

    // 1. 提取几何尺寸数值（外径、壁厚、长度等）
    if (certificate.header.dimensions) {
      for (const [k, v] of Object.entries(certificate.header.dimensions)) {
        if (typeof v === 'number') {
          dimensions[k] = v;
        }
      }
    }

    // 2. 建立实测记录索引映射表并提取理化数值快照
    for (const record of certificate.test_records) {
      const normResult = PropertyKeyNormalizer.normalize(
        record.property_key,
        record.category,
        { measuredRaw: record.measured_value_raw ?? record.measured_value_num, unit: record.unit }
      );
      const canonicalKey = normResult.property_key || record.property_key;
      const isNumeric = record.measured_value_num !== undefined && record.measured_value_num !== null;
      const isQualitative = Boolean(record.qualitative_result || record.conclusion_text);

      const keysToIndex = [
        record.property_key,
        canonicalKey,
        `${record.category}_${record.property_key}`,
        `${record.category}_${canonicalKey}`,
      ];

      for (const k of keysToIndex) {
        // 防冲毁机制：若槽位已存在定性/定量异构记录，优先保留两者在类型专用槽位，主槽位不发生静默抹杀
        if (recordsMap.has(k)) {
          const existing = recordsMap.get(k)!;
          const existingIsNumeric = existing.measured_value_num !== undefined && existing.measured_value_num !== null;
          const existingIsQual = Boolean(existing.qualitative_result || existing.conclusion_text);

          if (existingIsQual && !existingIsNumeric && isNumeric) {
            recordsMap.set(`${k}#qual`, existing);
            recordsMap.set(`${k}#num`, record);
          } else if (existingIsNumeric && !existingIsQual && isQualitative) {
            recordsMap.set(`${k}#num`, existing);
            recordsMap.set(`${k}#qual`, record);
          } else {
            recordsMap.set(k, record);
          }
        } else {
          recordsMap.set(k, record);
        }

        if (isNumeric) recordsMap.set(`${k}#num`, record);
        if (isQualitative) recordsMap.set(`${k}#qual`, record);
      }

      if (record.sub_property) {
        recordsMap.set(`${record.property_key}_${record.sub_property}`, record);
        recordsMap.set(`${canonicalKey}_${record.sub_property}`, record);
      }

      // 提取连续数值到对应大类的数值快照表中（用于动态公式求值，如 Ti >= 4*(C+N)）
      if (record.measured_value_num !== undefined && record.measured_value_num !== null) {
        if (record.category === 'chemical') {
          chemical[record.property_key] = record.measured_value_num;
          chemical[canonicalKey] = record.measured_value_num;
        } else if (record.category === 'mechanical') {
          mechanical[record.property_key] = record.measured_value_num;
          mechanical[canonicalKey] = record.measured_value_num;
          if (record.sub_property) {
            mechanical[`${record.property_key}_${record.sub_property}`] = record.measured_value_num;
            mechanical[`${canonicalKey}_${record.sub_property}`] = record.measured_value_num;
          }
        }
      }
    }

    return {
      header: certificate.header,
      recordsMap,
      chemical,
      mechanical,
      dimensions,
    };
  }


  /* ==========================================================================
     四、原子规则求值分发与前置触发扫描 (Single Rule Evaluation Dispatcher)
     - 先行判定前置几何/工艺触发条件，再分发至各专用原子求值器（数值、公式、定性等）
     ========================================================================== */

  /**
   * 检查质保书实测数据中是否存在针对当前规则的主动报送记录
   */
  private static hasReportedTestRecord(
    rule: EvaluationRule,
    context: EvaluationContext
  ): boolean {
    const normKey = PropertyKeyNormalizer.normalize(rule.property_key, rule.category).property_key;
    const isRuleNumeric = rule.rule_type === 'numeric_range' || rule.rule_type === 'dynamic_expression';
    const isRuleQualitative = rule.rule_type === 'qualitative_pass' || rule.rule_type === 'qualitative_enum';

    // 1. 检查直接命中的 record (含类型专用槽位)
    const directKeys = [
      ...(isRuleNumeric ? [`${rule.property_key}#num`, `${normKey}#num`] : []),
      ...(isRuleQualitative ? [`${rule.property_key}#qual`, `${normKey}#qual`] : []),
      rule.property_key,
      normKey,
      `${rule.category}_${rule.property_key}`,
      `${rule.category}_${normKey}`,
    ];

    for (const k of directKeys) {
      const rec = context.recordsMap.get(k);
      if (rec && this.isRecordNonEmpty(rec)) {
        return true;
      }
    }

    // 2. 针对 or_choice_group (如硬度) 检查其 options 子键
    if (rule.rule_type === 'or_choice_group' && rule.criteria && Array.isArray((rule.criteria as Record<string, unknown>).options)) {
      const options = (rule.criteria as Record<string, unknown>).options as Array<{ sub_key?: string }>;
      for (const opt of options) {
        const subKey = opt.sub_key;
        if (!subKey) continue;
        const candidateKeys = [
          `${rule.property_key}_${subKey}`,
          subKey,
          `hardness_${subKey}`,
        ];
        for (const ck of candidateKeys) {
          const rec = context.recordsMap.get(ck);
          if (rec && this.isRecordNonEmpty(rec)) {
            return true;
          }
        }
      }
    }

    // 3. 针对 alternative_group 检查 candidates
    if (rule.rule_type === 'alternative_group' && rule.criteria && Array.isArray((rule.criteria as Record<string, unknown>).candidates)) {
      const candidates = (rule.criteria as Record<string, unknown>).candidates as Array<{ candidate_key?: string }>;
      for (const cand of candidates) {
        const cKey = cand.candidate_key;
        if (!cKey) continue;
        const rec = context.recordsMap.get(cKey) || context.recordsMap.get(`${rule.category}_${cKey}`);
        if (rec && this.isRecordNonEmpty(rec)) {
          return true;
        }
      }
    }

    return false;
  }

  private static isRecordNonEmpty(rec: TestRecord): boolean {
    if (rec.measured_value_num !== undefined && rec.measured_value_num !== null) return true;
    if (rec.measured_value_raw && rec.measured_value_raw.trim() !== '') return true;
    if (rec.qualitative_result && rec.qualitative_result.trim() !== '') return true;
    if (rec.conclusion_text && rec.conclusion_text.trim() !== '') return true;
    return false;
  }

  /**
   * 单条评定规则求值调度器
   */
  private static evaluateSingleRule(
    rule: EvaluationRule,
    context: EvaluationContext
  ): RuleEvaluationItemResult {
    // --------------------------------------------------------------------------
    // 步骤 1：前置激活条件扫描与“条件免检，报送即检”双轨调度
    // --------------------------------------------------------------------------
    const triggered = isRuleTriggered(rule, context);
    const hasReported = this.hasReportedTestRecord(rule, context);
    const humanCondition = formatConditionHumanText(rule.trigger_condition, context);

    if (!triggered && !hasReported) {
      // 场景 A：前置条件未满足，且供方未主动报送 -> 依法自动豁免跳过 (SKIPPED)
      return {
        rule_id: rule.rule_id,
        category: rule.category,
        property_key: rule.property_key,
        display_name: rule.display_name,
        status: 'SKIPPED',
        requirement_level: rule.requirement_level,
        standard_requirement_text: `${humanCondition} 强制考核`,
        actual_value_text: '法定免检 / 未报送',
        message: `前置条件【${humanCondition}】未激活（法定免检），供方未报送实测数据，该检验项自动跳过`,
      };
    }

    // --------------------------------------------------------------------------
    // 步骤 2：根据规则类型分发至对应的专用原子评估器
    const normKey = PropertyKeyNormalizer.normalize(rule.property_key, rule.category).property_key;
    const isRuleNumeric = rule.rule_type === 'numeric_range' || rule.rule_type === 'dynamic_expression';
    const isRuleQualitative = rule.rule_type === 'qualitative_pass' || rule.rule_type === 'qualitative_enum';

    const record =
      (isRuleNumeric ? (context.recordsMap.get(`${rule.property_key}#num`) || context.recordsMap.get(`${normKey}#num`)) : undefined) ||
      (isRuleQualitative ? (context.recordsMap.get(`${rule.property_key}#qual`) || context.recordsMap.get(`${normKey}#qual`)) : undefined) ||
      context.recordsMap.get(rule.property_key) ||
      context.recordsMap.get(normKey) ||
      context.recordsMap.get(`${rule.category}_${rule.property_key}`) ||
      context.recordsMap.get(`${rule.category}_${normKey}`);

    let result: RuleEvaluationItemResult;

    switch (rule.rule_type) {
      // 1. 免做豁免规则 (例如：超低碳不锈钢免做晶间腐蚀试验)
      case 'exemption':
        result = evaluateExemption(rule);
        break;

      // 2. 定量数值区间规则 (例如：化学成分、抗拉强度、屈服强度)
      case 'numeric_range':
        result = evaluateNumericRange(rule, record, context);
        break;

      // 3. 跨字段动态公式规则 (例如：Ti >= 4*(C+N) 或 Cr当量计算)
      case 'dynamic_expression': {
        result = evaluateDynamicExpression(rule, record, context);
        result.standard_requirement_text = humanizeDynamicFormulaText(
          result.standard_requirement_text,
          result.formula_calculated_bound,
          (rule.criteria as Record<string, unknown>)?.['unit'] as string | undefined
        );
        break;
      }

      // 4. 多选一组合规则 (例如：硬度试验在 HRB / HBW / HV 中任选一种合格即可)
      case 'or_choice_group':
        result = evaluateOrChoiceGroup(rule, context);
        break;

      // 5. 替代检验组规则 (例如：涡流探伤合格放行以替代液压试验)
      case 'alternative_group':
        result = evaluateAlternativeGroup(rule, context);
        break;

      // 6. 定性评级/枚举合格规则 (例如：超声探伤达到 U2 级、晶间腐蚀评定合格)
      case 'qualitative_enum':
      case 'qualitative_pass':
      case 'enum_acceptance':
        result = evaluateQualitativeEnum(rule, record);
        break;

      // 7. 工艺试验复合评定 (例如：压扁试验、扩口试验无裂纹/裂口要求)
      case 'dynamic_formula_pass':
      case 'qualitative_and_numeric': {
        if (!record) {
          result = {
            rule_id: rule.rule_id,
            category: rule.category,
            property_key: rule.property_key,
            display_name: rule.display_name,
            status: rule.requirement_level === 'MANDATORY' ? 'MISSING' : 'SKIPPED',
            requirement_level: rule.requirement_level,
            standard_requirement_text: '无裂缝或裂口合格',
            actual_value_text: '未报送',
            message: `工艺试验【${rule.display_name}】未报送试验结果`,
          };
          break;
        }
        // 判定文本中是否包含合格、PASS、OK、无裂特征，且排除不合格与开裂等否定词
        const rawText = `${record.qualitative_result || ''} ${record.conclusion_text || ''}`.trim();
        const hasNegative = /不合格|开裂|未通过|未达标|有裂纹|有裂口|有腐蚀|UNQUALIFIED|\bFAIL\b/i.test(rawText);
        const hasPositive = /合格|PASS|OK|无裂|QUALIFIED|NO_CRACK|NO_CORROSION/i.test(rawText);
        const isPass = hasPositive && !hasNegative;
        result = {
          rule_id: rule.rule_id,
          category: rule.category,
          property_key: rule.property_key,
          display_name: rule.display_name,
          status: isPass ? 'PASS' : 'FAIL',
          requirement_level: rule.requirement_level,
          standard_requirement_text: '试验后无裂纹或裂口',
          actual_value_text: record.measured_value_raw || record.conclusion_text || record.qualitative_result || '已报送',
          message: isPass ? `合格: ${record.conclusion_text || record.qualitative_result || '试验合格无裂纹'}` : '不合格: 工艺试验未达标',
        };
        break;
      }

      default:
        throw new Error(`Unsupported rule_type '${rule.rule_type}' for rule_id '${rule.rule_id}'`);
    }

    // 若属于“法定免检但供方主动报送实测值”，追加明确的豁免与实质比对说明
    if (!triggered && hasReported) {
      if (result.status === 'PASS') {
        result.message = `合格: 标准要求${humanCondition}时强制考核，当前规格法定免检（豁免）；供方主动报送实测数据且检验合格，予以认可通过 (${result.message})`;
      } else if (result.status === 'FAIL') {
        result.message = `不合格: 规格虽属于法定免检范围 (${humanCondition})，但供方主动报送的实测数据超出标准限值要求 (${result.message})，判定不合格`;
      }
    }

    // --------------------------------------------------------------------------
    // 步骤 3：多标准双标尺透明追溯与剪刀差归因分析 (Dual-Ruler Traceability)
    // --------------------------------------------------------------------------
    const compRule = rule as CompositeEvaluationRule;
    if (compRule.composite_trace && compRule.composite_trace.sources.length > 0) {
      const trace = compRule.composite_trace;
      result.dual_standard_requirement_text = trace.dual_standard_requirement_text;
      result.strict_standard_id = trace.governing_standard_id;

      const multiEvals: SingleStandardEvaluationVerdict[] = [];
      const passedStds: string[] = [];
      const failedStds: string[] = [];

      for (const src of trace.sources) {
        // 使用单来源规则对同一 context 进行独立求值 (单来源 raw_rule 无 composite_trace，杜绝循环调用)
        const singleResult = this.evaluateSingleRule(src.raw_rule, context);
        const singleStatus = singleResult.status;
        const singleDeviation = singleResult.deviation;

        if (singleStatus === 'PASS') {
          passedStds.push(src.standard_short_code);
        } else if (singleStatus === 'FAIL') {
          failedStds.push(src.standard_short_code);
        }

        let reqText = src.requirement_text;
        if (src.raw_rule.rule_type === 'dynamic_expression') {
          reqText = humanizeDynamicFormulaText(
            src.requirement_text,
            singleResult.formula_calculated_bound,
            (src.raw_rule.criteria as Record<string, unknown>)?.['unit'] as string | undefined
          );
        }

        multiEvals.push({
          standard_id: src.standard_id,
          standard_short: src.standard_short_code,
          requirement_text: reqText,
          status: singleStatus,
          deviation: singleDeviation,
          is_governing: src.is_governing_strict,
          message: singleResult.message,
        });
      }

      // 若属于独占加严规则，将未参与该项考核的标准作为“无要求 / 自动符合基础制造标准”注入 multiEvals 与 passedStds
      if (trace.is_structural_tightened && Array.isArray(trace.non_participating_standards)) {
        for (const nonPart of trace.non_participating_standards) {
          const nonPartShort = getStandardShortCode(nonPart);
          passedStds.push(nonPartShort);
          multiEvals.push({
            standard_id: nonPart,
            standard_short: nonPartShort,
            requirement_text: '无强制指标 / 不考核',
            status: 'PASS',
            is_governing: false,
            message: `基础制造标准【${nonPart}】未对本项提出强制检验要求`,
          });
        }
      }

      result.multi_standard_evaluations = multiEvals;
      result.is_scissors_difference = false;
      result.is_statutory_relaxation_risk = Boolean(trace.is_statutory_relaxation_risk);
      result.statutory_baseline = trace.statutory_baseline;
      result.statutory_relaxation_warning = trace.statutory_relaxation_warning;

      // 组装精炼的多标准指标比对文本（带入动态公式实测计算值，去除冗余套话）
      const activeEvals = multiEvals.filter(e => !e.requirement_text.includes('无强制指标'));
      const comparisonText = (activeEvals.length > 0 ? activeEvals : multiEvals)
        .map(ev => `${ev.requirement_text} [${ev.standard_short}${trace.is_structural_tightened ? ' 独占加严' : ''}]`)
        .join(' / ');

      // 加严剪刀差判定：全局判定为 FAIL，但至少有 1 份标准通过（例如满足通用国标但不满足订货加严标）
      if (result.status === 'FAIL' && passedStds.length > 0 && failedStds.length > 0) {
        result.is_scissors_difference = true;
        const attribution = trace.is_structural_tightened
          ? `基础制造标准 ${passedStds.join('、')} 无此项强制指标，但承压订货标准 ${failedStds.join('、')} 强制要求，按严苛就高原则判定不合格。责任归属于 ${failedStds.join('、')} 订货加严条款。`
          : `满足 ${passedStds.join('、')} 要求，但未满足 ${failedStds.join('、')} 承压订货加严要求，按严苛就高原则判定不合格。责任归属于 ${failedStds.join('、')} 订货加严条款。`;
        result.scissors_attribution = attribution;
        result.message = `不合格: 实测值 ${result.actual_value_text}  (${comparisonText})`;
      } else if (result.status === 'PASS' && trace.is_statutory_relaxation_risk) {
        result.message = `合格: 实测值 ${result.actual_value_text}  (${comparisonText})【提示：合同放宽法标底线，需特批/风险备案】`;
      } else if (result.status === 'PASS') {
        if (!triggered && hasReported) {
          result.message = `合格: 标准要求${humanCondition}时强制考核，当前规格法定免检；供方主动报送实测数据且检验合格  (${comparisonText})，予以认可放行`;
        } else {
          result.message = `合格: 实测值 ${result.actual_value_text}  (${comparisonText})`;
        }
      }
    }

    return result;
  }


  /* ==========================================================================
     五、决策统计与一票否决门禁裁决 (Audit Summary & Decision Maker)
     - 汇总各状态计数，并依据“单项超标或强制项漏检即全单不合格”执行一票否决
     ========================================================================== */

  /**
   * 汇总核验结果指标并生成全局决策
   */
  private static buildSummary(
    itemResults: RuleEvaluationItemResult[],
    missingMandatory: string[]
  ): AuditSummary {
    let passCount = 0;
    let failCount = 0;
    let missingCount = 0;
    let exemptCount = 0;
    let skippedCount = 0;
    let warningCount = 0;

    // 统计各项判定状态数量分布
    for (const r of itemResults) {
      switch (r.status) {
        case 'PASS': passCount++; break;
        case 'FAIL': failCount++; break;
        case 'MISSING': missingCount++; break;
        case 'EXEMPT': exemptCount++; break;
        case 'SKIPPED': skippedCount++; break;
        case 'WARNING': warningCount++; break;
      }
    }

    // 门禁逻辑：存在任何一项不合格 (FAIL) 或强制项漏检 (MISSING) 即触发一票否决
    const hasCriticalFail = failCount > 0 || missingMandatory.length > 0;
    const overallStatus = hasCriticalFail ? 'FAIL' : 'PASS';

    return {
      overall_status: overallStatus,
      total_rules_evaluated: itemResults.length,
      pass_count: passCount,
      fail_count: failCount,
      missing_count: missingCount,
      exempt_count: exemptCount,
      skipped_count: skippedCount,
      warning_count: warningCount,
      has_critical_fail: hasCriticalFail,
    };
  }

  /**
   * 汇总双层符合性主结论（法定/制造标准符合性 vs 采购技术协议符合性）
   */
  private static computeDualVerdicts(
    itemResults: RuleEvaluationItemResult[],
    summary: AuditSummary
  ): {
    standard_compliance_verdict: 'PASS' | 'FAIL' | 'MANUAL_REVIEW';
    agreement_compliance_verdict: 'PASS' | 'FAIL' | 'MANUAL_REVIEW' | 'NOT_APPLICABLE';
    statutory_risk_flag: boolean;
  } {
    const statutory_risk_flag = itemResults.some(r => r.is_statutory_relaxation_risk);

    let hasAgreement = false;
    let agreementFails = 0;
    let statutoryFails = 0;

    for (const item of itemResults) {
      if (item.multi_standard_evaluations && item.multi_standard_evaluations.length > 0) {
        for (const ev of item.multi_standard_evaluations) {
          const id = ev.standard_id.toUpperCase();
          const isTA = id.startsWith('TA-') || id.includes('TA_') || id.includes('协议') || id.includes('SPECIFICATION') || id.includes('AGREEMENT');
          if (isTA) {
            hasAgreement = true;
            if (ev.status === 'FAIL') agreementFails++;
          } else {
            if (ev.status === 'FAIL') statutoryFails++;
          }
        }
      }
    }

    if (!hasAgreement) {
      return {
        standard_compliance_verdict: summary.overall_status,
        agreement_compliance_verdict: 'NOT_APPLICABLE',
        statutory_risk_flag,
      };
    }

    return {
      standard_compliance_verdict: statutoryFails > 0 ? 'FAIL' : 'PASS',
      agreement_compliance_verdict: agreementFails > 0 ? 'FAIL' : 'PASS',
      statutory_risk_flag,
    };
  }
}