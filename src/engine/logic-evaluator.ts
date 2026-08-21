import {
  EvaluationRule,
  OrChoiceGroupCriteria,
  AlternativeGroupCriteria,
  QualitativeEnumCriteria,
  ExemptionCriteria,
} from '../schemas/standard.schema';
import { TestRecord } from '../schemas/certificate.schema';
import { RuleEvaluationItemResult, AuditStatus } from '../schemas/report.schema';
import { EvaluationContext } from './numeric-evaluator';
import { roundGbt8170 } from './rounding';
import BigNumber from 'bignumber.js';

/**
 * 多选一逻辑组评估器 (如硬度 HRB / HBW / HV 三选一)
 */
export function evaluateOrChoiceGroup(
  rule: EvaluationRule,
  context: EvaluationContext
): RuleEvaluationItemResult {
  const criteria = rule.criteria as OrChoiceGroupCriteria;
  const displayName = rule.display_name;
  const propKey = rule.property_key;

  // 收集属于该 property_key 的所有测试记录 (例如 property_key='hardness', sub_property='HRB')
  const matchedRecords: Array<{ option: typeof criteria.options[0]; record: TestRecord }> = [];

  for (const option of criteria.options) {
    // 优先匹配 sub_property 或 property_key
    const record =
      context.recordsMap.get(`${propKey}_${option.sub_key}`) ||
      context.recordsMap.get(option.sub_key) ||
      context.recordsMap.get(propKey);

    if (record && (record.sub_property === option.sub_key || !record.sub_property || record.property_key === option.sub_key)) {
      matchedRecords.push({ option, record });
    }
  }

  // 1. 如果没有报送任何一个选项
  if (matchedRecords.length === 0) {
    const isMandatory = rule.requirement_level === 'MANDATORY' || rule.requirement_level === 'CONDITIONAL';
    return {
      rule_id: rule.rule_id,
      category: rule.category,
      property_key: propKey,
      display_name: displayName,
      status: isMandatory ? 'MISSING' : 'SKIPPED',
      requirement_level: rule.requirement_level,
      standard_requirement_text: criteria.options.map(o => `${o.sub_key} <= ${o.criteria.max}`).join(' 或 '),
      actual_value_text: '未报送',
      message: isMandatory ? `强制检验项【${displayName}】未提供任何有效指标` : `协议/可选检验项【${displayName}】未报送`,
    };
  }

  // 2. 对已报送的选项逐一校验
  let anyPass = false;
  let anyFail = false;
  const details: string[] = [];
  let firstPassRecord: TestRecord | undefined;
  let firstPassRounded = 0;

  for (const { option, record } of matchedRecords) {
    const val = record.measured_value_num;
    if (val === undefined || val === null) continue;

    const roundingDecimals = option.criteria.rounding_decimals ?? 0;
    const rounded = roundGbt8170(val, roundingDecimals);
    const max = option.criteria.max;
    const min = option.criteria.min;

    let pass = true;
    if (max !== undefined && max !== null && new BigNumber(rounded).isGreaterThan(new BigNumber(max))) {
      pass = false;
    }
    if (min !== undefined && min !== null && new BigNumber(rounded).isLessThan(new BigNumber(min))) {
      pass = false;
    }

    if (pass) {
      anyPass = true;
      if (!firstPassRecord) {
        firstPassRecord = record;
        firstPassRounded = rounded;
      }
      details.push(`${option.sub_key}: ${record.measured_value_raw || rounded} (合格)`);
    } else {
      anyFail = true;
      details.push(`${option.sub_key}: ${record.measured_value_raw || rounded} (超标, 标准要求 <= ${max})`);
    }
  }

  const status: AuditStatus = anyPass ? 'PASS' : anyFail ? 'FAIL' : 'SKIPPED';
  const message = anyPass
    ? `合格: 多选一满足要求 (${details.join('; ')})`
    : `不合格: 实测指标均未达标 (${details.join('; ')})`;

  return {
    rule_id: rule.rule_id,
    category: rule.category,
    property_key: propKey,
    display_name: displayName,
    status,
    requirement_level: rule.requirement_level,
    standard_requirement_text: criteria.options.map(o => `${o.sub_key} <= ${o.criteria.max}`).join(' 或 '),
    actual_value_text: details.join('; '),
    measured_value_raw: firstPassRecord?.measured_value_raw,
    measured_value_num: firstPassRecord?.measured_value_num ?? null,
    rounded_value: firstPassRecord ? firstPassRounded : null,
    message,
  };
}

/**
 * 替代检验组评估器 (如涡流检测代替液压试验)
 */
export function evaluateAlternativeGroup(
  rule: EvaluationRule,
  context: EvaluationContext
): RuleEvaluationItemResult {
  const criteria = rule.criteria as AlternativeGroupCriteria;
  const displayName = rule.display_name;
  const propKey = rule.property_key;

  const candidateResults: Array<{ name: string; isPass: boolean; text: string }> = [];

  for (const candidate of criteria.candidates) {
    const key = candidate.candidate_key;
    const record = context.recordsMap.get(key) || context.recordsMap.get(propKey);

    if (record && (record.property_key === key || record.property_key === propKey)) {
      // 检查定性结果或等级
      const isQualified =
        record.qualitative_result === 'PASS' ||
        record.qualitative_result === '合格' ||
        record.qualitative_result === 'QUALIFIED' ||
        (candidate.required_level && record.measured_level_claimed === candidate.required_level) ||
        (record.conclusion_text && (record.conclusion_text.includes('合格') || record.conclusion_text.includes('PASS')));

      candidateResults.push({
        name: candidate.display_name || key,
        isPass: Boolean(isQualified),
        text: `${candidate.display_name || key}: ${record.conclusion_text || record.measured_level_claimed || record.qualitative_result || '已测'} (${isQualified ? '合格' : '不合格'})`,
      });
    }
  }

  // 1. 如果没有报送任何替代项
  if (candidateResults.length === 0) {
    const isMandatory = rule.requirement_level === 'MANDATORY';
    return {
      rule_id: rule.rule_id,
      category: rule.category,
      property_key: propKey,
      display_name: displayName,
      status: isMandatory ? 'MISSING' : 'SKIPPED',
      requirement_level: rule.requirement_level,
      standard_requirement_text: criteria.candidates.map(c => c.display_name || c.candidate_key).join(' 或 '),
      actual_value_text: '未报送',
      message: isMandatory ? `强制检验项【${displayName}】未提供任何替代方案的实测证明` : `协议/可选检验项【${displayName}】未报送`,
    };
  }

  // 2. 检查满足条件
  const atLeastOnePass = candidateResults.some(c => c.isPass);
  const status: AuditStatus = atLeastOnePass ? 'PASS' : 'FAIL';
  const summaryText = candidateResults.map(c => c.text).join('; ');

  return {
    rule_id: rule.rule_id,
    category: rule.category,
    property_key: propKey,
    display_name: displayName,
    status,
    requirement_level: rule.requirement_level,
    standard_requirement_text: criteria.candidates.map(c => c.display_name || c.candidate_key).join(' 或 '),
    actual_value_text: summaryText,
    message: atLeastOnePass ? `合格: 满足替代检验要求 (${summaryText})` : `不合格: 替代检验项均未通过 (${summaryText})`,
  };
}

/**
 * 定性/评级评估器 (如超声波探伤 U2 级、晶间腐蚀 E 法无腐蚀倾向)
 */
export function evaluateQualitativeEnum(
  rule: EvaluationRule,
  record: TestRecord | undefined
): RuleEvaluationItemResult {
  const criteria = rule.criteria as QualitativeEnumCriteria;
  const displayName = rule.display_name;
  const propKey = rule.property_key;

  if (!record) {
    const isMandatory = rule.requirement_level === 'MANDATORY';
    return {
      rule_id: rule.rule_id,
      category: rule.category,
      property_key: propKey,
      display_name: displayName,
      status: isMandatory ? 'MISSING' : 'SKIPPED',
      requirement_level: rule.requirement_level,
      standard_requirement_text: criteria.required_level || criteria.expected || '合格要求',
      actual_value_text: '未报送',
      message: `定性检验项【${displayName}】未在质保书中报送`,
    };
  }

  // 等级比对 (如 U2 级)
  const reqLevel = criteria.required_level;
  const claimedLevel = record.measured_level_claimed;

  let isPass = false;
  if (reqLevel && claimedLevel) {
    isPass = (claimedLevel.trim().toUpperCase() === reqLevel.trim().toUpperCase());
  } else if (record.qualitative_result) {
    const q = record.qualitative_result.toUpperCase();
    isPass = (q === 'PASS' || q === '合格' || q === 'QUALIFIED');
  } else if (record.conclusion_text) {
    isPass = record.conclusion_text.includes('合格') || record.conclusion_text.includes('PASS');
  }

  const status: AuditStatus = isPass ? 'PASS' : 'FAIL';
  const reqText = [criteria.test_standard, criteria.required_level, criteria.method, criteria.expected]
    .filter(Boolean)
    .join(' ');

  return {
    rule_id: rule.rule_id,
    category: rule.category,
    property_key: propKey,
    display_name: displayName,
    status,
    requirement_level: rule.requirement_level,
    standard_requirement_text: reqText || '定性合格',
    actual_value_text: record.conclusion_text || record.measured_level_claimed || record.qualitative_result || '已报送',
    message: isPass ? `合格: 符合标准 ${reqText}` : `不合格: 未达到标准要求 ${reqText}`,
  };
}

/**
 * 豁免评估器 (Exemption)
 */
export function evaluateExemption(
  rule: EvaluationRule
): RuleEvaluationItemResult {
  const criteria = rule.criteria as ExemptionCriteria;
  return {
    rule_id: rule.rule_id,
    category: rule.category,
    property_key: rule.property_key,
    display_name: rule.display_name,
    status: 'EXEMPT',
    requirement_level: 'EXEMPT',
    standard_requirement_text: '标准免做项',
    actual_value_text: '免做',
    message: `标准明确免做/豁免: ${criteria.reason || '无需进行该项检验'}`,
  };
}
