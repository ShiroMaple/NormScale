import { StandardRuleSet, GradeRule, EvaluationRule } from '../schemas/standard.schema';
import { CertificateExtract, TestRecord } from '../schemas/certificate.schema';
import { AuditReport, RuleEvaluationItemResult, AuditSummary } from '../schemas/report.schema';
import { EvaluationContext, evaluateNumericRange } from './numeric-evaluator';
import { evaluateDynamicExpression } from './dynamic-evaluator';
import { evaluateOrChoiceGroup, evaluateAlternativeGroup, evaluateQualitativeEnum, evaluateExemption } from './logic-evaluator';
import { isRuleTriggered } from './missing-scanner';

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
   * @returns 包含各单项明细与全局决策的完整核验报告
   */
  public static evaluate(
    standardRuleSet: StandardRuleSet,
    certificate: CertificateExtract
  ): AuditReport {
    const header = certificate.header;
    const declaredGrade = header.declared_grade.trim();

    // --------------------------------------------------------------------------
    // 步骤 1：牌号规则路由与切片命中 (Grade Resolution & Slice Routing)
    // --------------------------------------------------------------------------
    // 根据质保书声称的牌号（如 "06Cr19Ni10"、"S30408"、"SUS304"），在标准库中精确定位对应的规则切片
    const gradeRule = this.resolveGradeRule(standardRuleSet, declaredGrade);
    if (!gradeRule) {
      throw new Error(
        `Standard '${standardRuleSet.standard_meta.standard_id}' does not contain rules for grade '${declaredGrade}'`
      );
    }

    // --------------------------------------------------------------------------
    // 步骤 2：构建全局核验上下文数据图谱 (Build Evaluation Context)
    // --------------------------------------------------------------------------
    // 预聚合化学成分、力学性能与几何尺寸实测值，建立 O(1) 快速索引表，支撑跨字段关联
    const context = this.buildContext(certificate);

    // --------------------------------------------------------------------------
    // 步骤 3：逐项执行原子规则评估流水线 (Execute Rule Evaluator Pipeline)
    // --------------------------------------------------------------------------
    const itemResults: RuleEvaluationItemResult[] = [];
    const missingMandatory: string[] = [];
    const evaluatedPropertyKeys = new Set<string>(); // 记录已核验的属性键集合，供后续比对额外报送项

    for (const rule of gradeRule.evaluation_rules) {
      // 调度单条规则评估器（包含前置条件激活检查与各类型求值）
      const result = this.evaluateSingleRule(rule, context);
      itemResults.push(result);
      evaluatedPropertyKeys.add(rule.property_key);

      // 处理复合逻辑组（多选一组 / 替代检验组）的候选键覆盖，避免误判为额外报送
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

      // 强制项 (MANDATORY) 或条件触发项 (CONDITIONAL) 漏检时记录到强制漏检清单
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

    // --------------------------------------------------------------------------
    // 步骤 5：全局决策汇总与一票否决裁决 (Decision Aggregation & Gatekeeping)
    // --------------------------------------------------------------------------
    const summary = this.buildSummary(itemResults, missingMandatory);

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
    };
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
      // 支持按属性名、类别+属性名、属性名+子标尺多维度索引检索
      recordsMap.set(record.property_key, record);
      recordsMap.set(`${record.category}_${record.property_key}`, record);
      if (record.sub_property) {
        recordsMap.set(`${record.property_key}_${record.sub_property}`, record);
      }

      // 提取连续数值到对应大类的数值快照表中（用于动态公式求值，如 Ti >= 4*(C+N)）
      if (record.measured_value_num !== undefined && record.measured_value_num !== null) {
        if (record.category === 'chemical') {
          chemical[record.property_key] = record.measured_value_num;
        } else if (record.category === 'mechanical') {
          mechanical[record.property_key] = record.measured_value_num;
          if (record.sub_property) {
            mechanical[`${record.property_key}_${record.sub_property}`] = record.measured_value_num;
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
    // --------------------------------------------------------------------------
    const record = context.recordsMap.get(rule.property_key) || context.recordsMap.get(`${rule.category}_${rule.property_key}`);

    switch (rule.rule_type) {
      // 1. 免做豁免规则 (例如：超低碳不锈钢免做晶间腐蚀试验)
      case 'exemption':
        return evaluateExemption(rule);

      // 2. 定量数值区间规则 (例如：化学成分、抗拉强度、屈服强度)
      case 'numeric_range':
        return evaluateNumericRange(rule, record, context);

      // 3. 跨字段动态公式规则 (例如：Ti >= 4*(C+N) 或 Cr当量计算)
      case 'dynamic_expression':
        return evaluateDynamicExpression(rule, record, context);

      // 4. 多选一组合规则 (例如：硬度试验在 HRB / HBW / HV 中任选一种合格即可)
      case 'or_choice_group':
        return evaluateOrChoiceGroup(rule, context);

      // 5. 替代检验组规则 (例如：涡流探伤合格放行以替代液压试验)
      case 'alternative_group':
        return evaluateAlternativeGroup(rule, context);

      // 6. 定性评级/枚举合格规则 (例如：超声探伤达到 U2 级、晶间腐蚀评定合格)
      case 'qualitative_enum':
      case 'qualitative_pass':
      case 'enum_acceptance':
        return evaluateQualitativeEnum(rule, record);

      // 7. 工艺试验复合评定 (例如：压扁试验、扩口试验无裂纹/裂口要求)
      case 'dynamic_formula_pass':
      case 'qualitative_and_numeric': {
        if (!record) {
          return {
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
        }
        // 判定文本中是否明确包含合格、PASS 或无裂纹特征
        const isPass =
          record.qualitative_result === 'PASS' ||
          record.qualitative_result === '合格' ||
          record.conclusion_text?.includes('合格') ||
          record.conclusion_text?.includes('无裂');
        return {
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
      }

      default:
        throw new Error(`Unsupported rule_type '${rule.rule_type}' for rule_id '${rule.rule_id}'`);
    }
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