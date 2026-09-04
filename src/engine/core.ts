import { StandardRuleSet, GradeRule, EvaluationRule, SpecificationSlice } from '../schemas/standard.schema';
import { CertificateExtract, TestRecord } from '../schemas/certificate.schema';
import { AuditReport, RuleEvaluationItemResult, AuditSummary, SingleStandardEvaluationVerdict } from '../schemas/report.schema';
import { EvaluationContext, evaluateNumericRange } from './numeric-evaluator';
import { evaluateDynamicExpression } from './dynamic-evaluator';
import { evaluateOrChoiceGroup, evaluateAlternativeGroup, evaluateQualitativeEnum, evaluateExemption } from './logic-evaluator';
import { isRuleTriggered } from './missing-scanner';
import { logger as defaultLogger, ILogger, ITraceCollector } from '../logger';
import { PerformanceProfiler } from '../logger/profiler';
import { CompositeSlice, CompositeEvaluationRule } from './multi-standard-composer';
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
      const normResult = PropertyKeyNormalizer.normalize(record.property_key, record.category);
      const canonicalKey = normResult.property_key || record.property_key;

      // 支持按原始属性名、归一化属性名、类别前缀组合等多维度索引检索
      recordsMap.set(record.property_key, record);
      recordsMap.set(canonicalKey, record);
      recordsMap.set(`${record.category}_${record.property_key}`, record);
      recordsMap.set(`${record.category}_${canonicalKey}`, record);
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
   * 单条评定规则求值调度器
   */
  private static evaluateSingleRule(
    rule: EvaluationRule,
    context: EvaluationContext
  ): RuleEvaluationItemResult {
    // --------------------------------------------------------------------------
    // 步骤 1：前置激活条件扫描 (如壁厚 >= 1.7mm 才触发硬度检验，否则跳过)
    // --------------------------------------------------------------------------
    const triggered = isRuleTriggered(rule, context);
    if (!triggered) {
      return {
        rule_id: rule.rule_id,
        category: rule.category,
        property_key: rule.property_key,
        display_name: rule.display_name,
        status: 'SKIPPED',
        requirement_level: rule.requirement_level,
        standard_requirement_text: '条件未激活',
        actual_value_text: '不适用',
        message: `前置条件【${rule.trigger_condition}】未激活，该检验项自动跳过`,
      };
    }

    // --------------------------------------------------------------------------
    // 步骤 2：根据规则类型分发至对应的专用原子评估器
    const normKey = PropertyKeyNormalizer.normalize(rule.property_key, rule.category).property_key;
    const record =
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
      case 'dynamic_expression':
        result = evaluateDynamicExpression(rule, record, context);
        break;

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
        // 判定文本中是否明确包含合格、PASS 或无裂纹特征
        const isPass =
          record.qualitative_result === 'PASS' ||
          record.qualitative_result === '合格' ||
          record.conclusion_text?.includes('合格') ||
          record.conclusion_text?.includes('无裂');
        result = {
          rule_id: rule.rule_id,
          category: rule.category,
          property_key: rule.property_key,
          display_name: rule.display_name,
          status: isPass ? 'PASS' : 'FAIL',
          requirement_level: rule.requirement_level,
          standard_requirement_text: '试验后无裂纹或裂口',
          actual_value_text: record.conclusion_text || record.qualitative_result || '已报送',
          message: isPass ? `合格: ${record.conclusion_text || '试验合格无裂纹'}` : '不合格: 工艺试验未达标',
        };
        break;
      }

      default:
        throw new Error(`Unsupported rule_type '${rule.rule_type}' for rule_id '${rule.rule_id}'`);
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

        multiEvals.push({
          standard_id: src.standard_id,
          standard_short: src.standard_short_code,
          requirement_text: src.requirement_text,
          status: singleStatus,
          deviation: singleDeviation,
          is_governing: src.is_governing_strict,
          message: singleResult.message,
        });
      }

      result.multi_standard_evaluations = multiEvals;
      result.is_scissors_difference = false;

      // 加严剪刀差判定：全局判定为 FAIL，但至少有 1 份标准通过（例如满足通用国标但不满足订货加严标）
      if (result.status === 'FAIL' && passedStds.length > 0 && failedStds.length > 0) {
        result.is_scissors_difference = true;
        const attribution = `满足 ${passedStds.join('、')} 要求，但未满足 ${failedStds.join('、')} 承压订货加严要求，按严苛就高原则判定不合格。责任归属于 ${failedStds.join('、')} 订货加严条款。`;
        result.scissors_attribution = attribution;
        result.message = `${attribution} (实测值: ${result.actual_value_text})`;
      } else if (result.status === 'PASS' && trace.sources.length > 1) {
        result.message = `合格: 实测值 ${result.actual_value_text} 满足所有标准综合严苛要求 (${trace.dual_standard_requirement_text})`;
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
}