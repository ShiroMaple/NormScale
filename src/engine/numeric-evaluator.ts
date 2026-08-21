import { EvaluationRule, NumericRangeCriteria } from '../schemas/standard.schema';
import { TestRecord, CertificateHeader } from '../schemas/certificate.schema';
import { RuleEvaluationItemResult, AuditStatus } from '../schemas/report.schema';
import { roundGbt8170 } from './rounding';
import BigNumber from 'bignumber.js';

/* ==========================================================================
   一、核验上下文环境接口定义 (Evaluation Context)
   - 封装整单核验所需的全局背景数据，包含质保书表头、实测记录映射表及理化指标快照
   ========================================================================== */

// 校验与执行规则求值时的上下文依赖对象（供条件修正、动态公式计算及交叉关联使用）
export interface EvaluationContext {
  header: CertificateHeader;                // 质保书抬头及生产工艺元数据（用于判定交货状态、工艺触发条件等）
  recordsMap: Map<string, TestRecord>;      // 质保书所有检验项的键值索引映射表（方便 O(1) 快速检索）
  chemical: Record<string, number>;         // 化学成分实测数值快照表（例如：{ C: 0.042, Cr: 18.2, Ni: 8.05 }）
  mechanical: Record<string, number>;       // 力学性能实测数值快照表（例如：{ Rm: 565, Rp02: 245 }）
  dimensions: Record<string, number>;       // 几何尺寸实测数值快照表（例如：{ wall_thickness_mm: 2.0, outer_diameter_mm: 25.0 }）
}


/* ==========================================================================
   二、定量数值区间核心核验器 (Numeric Range Evaluator)
   - 执行理化成分、力学性能等定量指标的缺失扫描、GB/T 8170修约、工况微调及超标判定
   ========================================================================== */

/**
 * 定量数值区间规则评定函数
 * @param rule 标准中定义的评定规则项（包含上下限数值、修约位数、工况偏移等）
 * @param record 质保书中提取出的对应检测项实测记录
 * @param context 当前质保书的全局上下文环境
 * @returns 单项规则的完整比对与裁决结果对象
 */
export function evaluateNumericRange(
  rule: EvaluationRule,
  record: TestRecord | undefined,
  context: EvaluationContext
): RuleEvaluationItemResult {
  const criteria = rule.criteria as NumericRangeCriteria;
  const displayName = rule.display_name;
  const propKey = rule.property_key;

  // --------------------------------------------------------------------------
  // 步骤 1：实测记录缺失与漏检判断 (Missing / Skipped Detection)
  // --------------------------------------------------------------------------
  if (!record || record.measured_value_num === undefined || record.measured_value_num === null) {
    // 强制项 (MANDATORY) 或条件触发项 (CONDITIONAL) 未报送标记为漏检 (MISSING)，协议/选做项标记为跳过 (SKIPPED)
    const isMandatory = rule.requirement_level === 'MANDATORY' || rule.requirement_level === 'CONDITIONAL';
    return {
      rule_id: rule.rule_id,
      category: rule.category,
      property_key: propKey,
      display_name: displayName,
      status: isMandatory ? 'MISSING' : 'SKIPPED',
      requirement_level: rule.requirement_level,
      standard_requirement_text: formatRangeRequirement(criteria),
      actual_value_text: record?.measured_value_raw || '未报送',
      measured_value_raw: record?.measured_value_raw,
      measured_value_num: null,
      message: isMandatory
        ? `强制检验项【${displayName}】未在质保书中报送实测值`
        : `协议/可选检验项【${displayName}】未报送`,
    };
  }

  const rawNum = record.measured_value_num;
  const roundingDecimals = criteria.rounding_decimals;

  // --------------------------------------------------------------------------
  // 步骤 2：执行 GB/T 8170-2008 国家标准数值修约 (Data Rounding)
  // --------------------------------------------------------------------------
  // 若标准指定了修约精度，则采用“四舍六入五考虑、奇进偶舍”进行修约，消除末位浮点噪声
  const roundedVal = (roundingDecimals !== undefined && roundingDecimals !== null)
    ? roundGbt8170(rawNum, roundingDecimals)
    : rawNum;

  // --------------------------------------------------------------------------
  // 步骤 3：计算标准指标限值与工况动态修正 (Standard Bounds & Condition Adjustments)
  // --------------------------------------------------------------------------
  // 获取基础上下限值，并处理特定工艺/交货状态带来的指标浮动（如热挤压工艺抗拉强度指标下调 20MPa）
  let standardMin = criteria.min !== undefined ? criteria.min : null;
  let standardMax = criteria.max !== undefined ? criteria.max : null;

  if (criteria.condition_adjustments && criteria.condition_adjustments.length > 0) {
    for (const adj of criteria.condition_adjustments) {
      if (checkCondition(adj.when, context)) {
        if (adj.min_offset !== undefined && standardMin !== null) {
          standardMin += adj.min_offset;
        }
        if (adj.max_offset !== undefined && standardMax !== null) {
          standardMax += adj.max_offset;
        }
      }
    }
  }

  const minInclusive = criteria.min_inclusive ?? true; // 是否包含下限 (默认 >=)
  const maxInclusive = criteria.max_inclusive ?? true; // 是否包含上限 (默认 <=)

  // --------------------------------------------------------------------------
  // 步骤 4：高精度数值比对与超标/不达标偏差分析 (High-Precision Comparison)
  // --------------------------------------------------------------------------
  const valBn = new BigNumber(roundedVal);
  let isPass = true;
  let deviation: number | null = null;
  let message = `合格: 实测修约值 ${roundedVal}${criteria.unit || ''}`;

  // 检查下限指标（如屈服强度、断后伸长率下限）
  if (standardMin !== null && standardMin !== undefined) {
    const minBn = new BigNumber(standardMin);
    const passesMin = minInclusive ? valBn.isGreaterThanOrEqualTo(minBn) : valBn.isGreaterThan(minBn);
    if (!passesMin) {
      isPass = false;
      deviation = minBn.minus(valBn).toNumber(); // 欠达标差值 (标准下限 - 实际值)
      message = `不合格: 实测修约值 ${roundedVal}${criteria.unit || ''} 低于标准下限 ${standardMin}${criteria.unit || ''} (差值 -${deviation})`;
    }
  }

  // 检查上限指标（如碳、硫、磷等杂质元素含量上限）
  if (isPass && standardMax !== null && standardMax !== undefined) {
    const maxBn = new BigNumber(standardMax);
    const passesMax = maxInclusive ? valBn.isLessThanOrEqualTo(maxBn) : valBn.isLessThan(maxBn);
    if (!passesMax) {
      isPass = false;
      deviation = valBn.minus(maxBn).toNumber(); // 超标量 (实际值 - 标准上限)
      message = `不合格: 实测修约值 ${roundedVal}${criteria.unit || ''} 超出标准上限 ${standardMax}${criteria.unit || ''} (超标 +${deviation})`;
    }
  }

  // --------------------------------------------------------------------------
  // 步骤 5：组装单项比对裁决明细报告 (Assemble Final Item Result)
  // --------------------------------------------------------------------------
  const status: AuditStatus = isPass ? 'PASS' : 'FAIL';
  const devPercent = (deviation !== null && (standardMax || standardMin))
    ? Math.abs(Number(((deviation / (standardMax || standardMin || 1)) * 100).toFixed(2)))
    : null;

  return {
    rule_id: rule.rule_id,
    category: rule.category,
    property_key: propKey,
    display_name: displayName,
    status,
    requirement_level: rule.requirement_level,
    standard_requirement_text: formatRangeRequirement({ ...criteria, min: standardMin, max: standardMax }),
    actual_value_text: `${record.measured_value_raw || rawNum} (修约: ${roundedVal}${criteria.unit || ''})`,
    measured_value_raw: record.measured_value_raw,
    measured_value_num: rawNum,
    rounded_value: roundedVal,
    rounding_decimals: roundingDecimals,
    standard_min: standardMin,
    standard_max: standardMax,
    deviation,
    deviation_percentage: devPercent,
    message,
  };
}


/* ==========================================================================
   三、辅助格式化与安全条件判定工具 (Helper Utilities)
   - 负责生成人机友好的技术指标文本，并安全执行上下文属性条件判断
   ========================================================================== */

/**
 * 格式化标准数值区间技术要求文本
 * 例如生成：">= 520 MPa"、"0.040 ~ 0.080 %" 或 "<= 0.030 %"
 */
function formatRangeRequirement(criteria: { min?: number | null; max?: number | null; unit?: string }): string {
  const unit = criteria.unit || '';
  const min = criteria.min;
  const max = criteria.max;

  // 上下限同时存在时格式化为闭区间
  if (min !== null && min !== undefined && max !== null && max !== undefined) {
    return `${min} ~ ${max} ${unit}`.trim();
  }
  // 仅有下限时格式化为大于等于
  if (min !== null && min !== undefined) {
    return `>= ${min} ${unit}`.trim();
  }
  // 仅有上限时格式化为小于等于
  if (max !== null && max !== undefined) {
    return `<= ${max} ${unit}`.trim();
  }
  return '无具体范围限制';
}

/**
 * 基于正则的安全上下文条件求值器
 * 仅支持特定安全的头部字段比对（如工艺匹配），杜绝 eval/Function 带来的代码注入风险
 * 例如解析："ctx.header.manufacturing_process == 'hot_extrusion'"
 */
function checkCondition(conditionStr: string, context: EvaluationContext): boolean {
  try {
    // 匹配类似 ctx.header.fieldName == 'value' 的简易条件表达式
    const match = conditionStr.match(/ctx\.header\.(\w+)\s*(==|!=)\s*['"]([^'"]+)['"]/);
    if (match) {
      const field = match[1] as keyof CertificateHeader;
      const op = match[2];
      const targetVal = match[3];
      const actualVal = context.header[field];
      if (op === '==') return actualVal === targetVal;
      if (op === '!=') return actualVal !== targetVal;
    }
    return false;
  } catch {
    return false;
  }
}