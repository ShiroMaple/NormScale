import {
  SpecificationSlice,
  EvaluationRule,
  RequirementLevel,
} from '../schemas/standard.schema';
import { PropertyKeyNormalizer } from '../normalizer/property-key-normalizer';

/**
 * 单来源标准规则溯源明细
 */
export interface SourceRuleTrace {
  standard_id: string;
  standard_short_code: string;
  rule_id: string;
  requirement_level: RequirementLevel;
  requirement_text: string;
  min?: number | null;
  max?: number | null;
  unit?: string;
  is_governing_strict: boolean;
  raw_rule: EvaluationRule;
}

/**
 * 多标尺综合追溯元数据
 */
export interface MultiStandardRuleTrace {
  canonical_property_key: string;
  display_name: string;
  sources: SourceRuleTrace[];
  governing_standard_id: string;
  governing_standard_name?: string;
  is_tightened: boolean;
  dual_standard_requirement_text: string;
  arbitration_reason: string;
}

/**
 * 带有双标尺/多标尺追溯元数据的合成规则
 */
export interface CompositeEvaluationRule extends EvaluationRule {
  composite_trace?: MultiStandardRuleTrace;
}

/**
 * 合成切片顶层元数据
 */
export interface CompositeSliceMeta {
  source_standards: string[];
  source_standards_names?: string[];
  synthesized_at: string;
  rules_count: number;
}

/**
 * 多标准规则合成切片实体
 */
export interface CompositeSlice extends SpecificationSlice {
  composite_meta: CompositeSliceMeta;
  evaluation_rules: CompositeEvaluationRule[];
}

export interface SliceWithStandardMeta {
  slice: SpecificationSlice;
  standardId: string;
  standardName?: string;
}

/** 检验要求等级严格度权重排序：MANDATORY > CONDITIONAL > OPTIONAL_AGREED > EXEMPT */
const REQUIREMENT_LEVEL_RANK: Record<RequirementLevel, number> = {
  MANDATORY: 4,
  CONDITIONAL: 3,
  OPTIONAL_AGREED: 2,
  EXEMPT: 1,
};

/** 涡流探伤等级灵敏度权重 (E2H 灵敏度高于 E3H) */
const EDDY_CURRENT_LEVEL_RANK: Record<string, number> = {
  E1H: 4,
  E2H: 3,
  E3H: 2,
  E4H: 1,
};

/** 超声波探伤等级灵敏度权重 (U2 灵敏度高于 U3) */
const ULTRASONIC_LEVEL_RANK: Record<string, number> = {
  U1: 4,
  U2: 3,
  U25: 2,
  U3: 1,
};

/**
 * 格式化标准代号简写 (例如 "NB/T 47019.5-2021" -> "NB/T 47019.5", "GB/T 13296-2023" -> "GB/T 13296")
 */
export function getStandardShortCode(standardId: string): string {
  const trimmed = standardId.trim();
  const yearMatch = trimmed.match(/^(.*?)(?:-\d{4})?$/);
  return yearMatch ? yearMatch[1] || trimmed : trimmed;
}

/**
 * 从单条规则生成人类可读的要求文本
 */
export function formatRuleRequirementText(rule: EvaluationRule): string {
  if (rule.rule_type === 'numeric_range') {
    const min = rule.criteria['min'];
    const max = rule.criteria['max'];
    const unit = rule.criteria['unit'] || '';
    if (min !== null && min !== undefined && max !== null && max !== undefined) {
      return `${min} ~ ${max} ${unit}`.trim();
    }
    if (min !== null && min !== undefined) {
      return `≥ ${min} ${unit}`.trim();
    }
    if (max !== null && max !== undefined) {
      return `≤ ${max} ${unit}`.trim();
    }
    return '定量考核';
  }

  if (rule.rule_type === 'dynamic_expression') {
    const fMin = rule.criteria['formula_min'];
    const fMax = rule.criteria['formula_max'];
    const max = rule.criteria['max'];
    const min = rule.criteria['min'];
    if (fMin && max) return `≥ ${fMin} 且 ≤ ${max}%`;
    if (fMin) return `≥ ${fMin}`;
    if (fMax) return `≤ ${fMax}`;
    if (min) return `≥ ${min}`;
    return rule.criteria['note'] || '公式动态计算';
  }

  if (rule.rule_type === 'dynamic_formula_pass') {
    return '压扁试样两平板间距H合格，无裂纹';
  }

  if (rule.rule_type === 'qualitative_and_numeric') {
    const rate = rule.criteria['flaring_rate_min_percent'];
    return rate ? `扩口率 ≥ ${rate}% 无裂口` : '扩口试验无裂纹';
  }

  if (rule.rule_type === 'qualitative_enum' || rule.rule_type === 'enum_acceptance') {
    const reqLevel = rule.criteria['required_level'];
    const minLevel = rule.criteria['min_level'];
    if (reqLevel) return `验收等级 ${reqLevel} 级`;
    if (minLevel) return `评级 ≥ ${minLevel} 级`;
    return rule.criteria['expected'] || '定性试验合格';
  }

  if (rule.rule_type === 'qualitative_pass') {
    const method = rule.criteria['method'];
    return method ? `按 ${method} 检验无晶间腐蚀倾向` : '表面检验合格';
  }

  if (rule.rule_type === 'alternative_group') {
    return '逐根水压或替代高等级涡流合格';
  }

  if (rule.rule_type === 'or_choice_group') {
    return '硬度指标合格 (HRB/HBW/HV)';
  }

  return '符合标准技术规范';
}

/**
 * ============================================================================
 * 多标准规则切片纯函数合成器 (Multi-Standard Slice Composer)
 * ============================================================================
 * 
 * 核心原理：
 * 1. 检验项目取全量并集（Union）：涵盖所有参与标准中规定的所有检验项目；
 * 2. 共有检验项目取严苛交集（Strict Superiority / Envelope Principle）：
 *    - 数值下限取 max (如伸长率 40% 严于 35%)；
 *    - 数值上限取 min (如硫杂质 0.005% 严于 0.015%)；
 *    - 检验要求等级取最高级 (MANDATORY > CONDITIONAL > OPTIONAL > EXEMPT)；
 *    - 探伤验收等级取最高缺陷检出灵敏度 (E2H > E3H, U2 > U3)；
 * 3. 结构化双标尺/多标尺追溯元数据（composite_trace）：
 *    记录每份标准的原始指标、哪份标准起主导加严作用与归因解释文本。
 * ============================================================================
 */
export function composeMultiStandardSlices(
  slicesWithMeta: SliceWithStandardMeta[]
): CompositeSlice | undefined {
  if (!slicesWithMeta || slicesWithMeta.length === 0) {
    return undefined;
  }

  // 1. 整理各来源标准信息
  const sourceStandards = slicesWithMeta.map(s => s.standardId || s.slice.standard_code || 'STANDARD');
  const sourceStandardsNames = slicesWithMeta.map(s => s.standardName || s.standardId || s.slice.display_name);

  // 2. 选取基准切片元数据（优先取第一个，通常是主申报标准）
  const primarySlice = slicesWithMeta[0]!.slice;

  // 3. 收集所有规则，按规范化属性键 (canonical_property_key) 分组
  interface RuleGroupItem {
    rule: EvaluationRule;
    standardId: string;
    standardName?: string;
  }
  const groupedRules = new Map<string, RuleGroupItem[]>();

  for (const item of slicesWithMeta) {
    const stdId = item.standardId || item.slice.standard_code || 'STANDARD';
    for (const rule of item.slice.evaluation_rules) {
      const normResult = PropertyKeyNormalizer.normalize(rule.property_key, rule.category);
      const canonicalKey = normResult.property_key || rule.property_key;

      if (!groupedRules.has(canonicalKey)) {
        groupedRules.set(canonicalKey, []);
      }
      groupedRules.get(canonicalKey)!.push({
        rule,
        standardId: stdId,
        standardName: item.standardName,
      });
    }
  }

  // 4. 逐个检验项目合成最严包络线规则并生成多标尺追溯元数据
  const composedRules: CompositeEvaluationRule[] = [];

  for (const [canonicalKey, items] of groupedRules.entries()) {
    if (items.length === 1) {
      // 独占检验项目（仅在某一标准中要求，例如 NB/T 专属的扩口试验或晶粒度）
      const single = items[0]!;
      const stdShort = getStandardShortCode(single.standardId);
      const reqText = formatRuleRequirementText(single.rule);

      const sourceTrace: SourceRuleTrace = {
        standard_id: single.standardId,
        standard_short_code: stdShort,
        rule_id: single.rule.rule_id,
        requirement_level: single.rule.requirement_level,
        requirement_text: reqText,
        min: single.rule.criteria['min'] ?? null,
        max: single.rule.criteria['max'] ?? null,
        unit: single.rule.criteria['unit'],
        is_governing_strict: true,
        raw_rule: single.rule,
      };

      const composed: CompositeEvaluationRule = {
        ...single.rule,
        property_key: canonicalKey, // 统一为规范键名
        composite_trace: {
          canonical_property_key: canonicalKey,
          display_name: single.rule.display_name,
          sources: [sourceTrace],
          governing_standard_id: single.standardId,
          governing_standard_name: single.standardName || single.standardId,
          is_tightened: false,
          dual_standard_requirement_text: `${reqText} [${stdShort}]`,
          arbitration_reason: `依据 ${single.standardId} 条款要求执行`,
        },
      };

      composedRules.push(composed);
      continue;
    }

    // 共有检验项目（在多份标准中均有规定，执行严苛交集合成）
    const composed = composeCommonRule(canonicalKey, items);
    composedRules.push(composed);
  }

  return {
    ...primarySlice,
    display_name: `${primarySlice.display_name} (多标准合成切片)`,
    description: `多标准严苛交集切片 (${sourceStandards.join(' + ')})`,
    composite_meta: {
      source_standards: sourceStandards,
      source_standards_names: sourceStandardsNames,
      synthesized_at: new Date().toISOString(),
      rules_count: composedRules.length,
    },
    evaluation_rules: composedRules,
  };
}

/**
 * 合成共有规则（跨多标准共有项目的包络线计算）
 */
function composeCommonRule(
  canonicalKey: string,
  items: Array<{ rule: EvaluationRule; standardId: string; standardName?: string }>
): CompositeEvaluationRule {
  const baseRule = items[0]!.rule;

  // 1. 确定最高等级 requirement_level
  let highestLevel: RequirementLevel = 'EXEMPT';
  let highestLevelRank = 0;
  for (const item of items) {
    const rLevel = item.rule.requirement_level || 'MANDATORY';
    const rank = REQUIREMENT_LEVEL_RANK[rLevel] || 0;
    if (rank > highestLevelRank) {
      highestLevelRank = rank;
      highestLevel = rLevel;
    }
  }

  // 2. 处理数值型区间规则 (numeric_range)
  const isAllNumeric = items.every(i => i.rule.rule_type === 'numeric_range');
  if (isAllNumeric) {
    return composeNumericRangeRule(canonicalKey, items, highestLevel);
  }

  // 3. 处理替代检验组 (alternative_group, 如水压/涡流替代)
  const hasAlternativeGroup = items.some(i => i.rule.rule_type === 'alternative_group');
  if (hasAlternativeGroup) {
    return composeAlternativeGroupRule(canonicalKey, items, highestLevel);
  }

  // 4. 处理定性评定或枚举规则
  return composeQualitativeRule(canonicalKey, items, highestLevel, baseRule);
}

/**
 * 合成数值区间规则 (下限取 max, 上限取 min)
 */
function composeNumericRangeRule(
  canonicalKey: string,
  items: Array<{ rule: EvaluationRule; standardId: string; standardName?: string }>,
  highestLevel: RequirementLevel
): CompositeEvaluationRule {
  let strictMin: number | null = null;
  let strictMax: number | null = null;
  let minGoverningStdId = items[0]!.standardId;
  let maxGoverningStdId = items[0]!.standardId;
  let commonUnit = items[0]!.rule.criteria['unit'] || '';
  let maxDecimals = 2;

  // 收集各来源原始限值
  const sources: SourceRuleTrace[] = [];

  for (const item of items) {
    const c = item.rule.criteria;
    const itemMin = typeof c['min'] === 'number' ? c['min'] : null;
    const itemMax = typeof c['max'] === 'number' ? c['max'] : null;
    if (c['unit']) commonUnit = c['unit'];
    if (typeof c['rounding_decimals'] === 'number' && c['rounding_decimals'] > maxDecimals) {
      maxDecimals = c['rounding_decimals'];
    }

    // 比较下限：取 max (严苛下限)
    if (itemMin !== null) {
      if (strictMin === null || itemMin > strictMin) {
        strictMin = itemMin;
        minGoverningStdId = item.standardId;
      }
    }

    // 比较上限：取 min (严苛上限)
    if (itemMax !== null) {
      if (strictMax === null || itemMax < strictMax) {
        strictMax = itemMax;
        maxGoverningStdId = item.standardId;
      }
    }

    sources.push({
      standard_id: item.standardId,
      standard_short_code: getStandardShortCode(item.standardId),
      rule_id: item.rule.rule_id,
      requirement_level: item.rule.requirement_level,
      requirement_text: formatRuleRequirementText(item.rule),
      min: itemMin,
      max: itemMax,
      unit: c['unit'],
      is_governing_strict: false, // 稍后标记
      raw_rule: item.rule,
    });
  }

  // 判定是否出现加严剪刀差（各标准要求不一致）
  const mins = sources.map(s => s.min).filter(v => v !== null && v !== undefined) as number[];
  const maxs = sources.map(s => s.max).filter(v => v !== null && v !== undefined) as number[];
  const minDiff = mins.length > 1 && Math.max(...mins) !== Math.min(...mins);
  const maxDiff = maxs.length > 1 && Math.max(...maxs) !== Math.min(...maxs);
  const isTightened = minDiff || maxDiff;

  // 确定最终主导标准 ID
  const governingStdId = minDiff ? minGoverningStdId : (maxDiff ? maxGoverningStdId : items[0]!.standardId);

  // 标记主导加严标准
  for (const src of sources) {
    if (src.standard_id === governingStdId) {
      src.is_governing_strict = true;
    }
  }

  // 组装双标/多标紧凑展示文本 (如 "≥ 40.0% [NB/T 47019.5] / ≥ 35.0% [GB/T 13296]")
  const dualRequirementText = sources
    .map(s => `${s.requirement_text} [${s.standard_short_code}]`)
    .join(' / ');

  // 组装仲裁说明
  let arbitrationReason = '多标准技术指标一致';
  if (minDiff) {
    const govShort = getStandardShortCode(governingStdId);
    const otherSources = sources.filter(s => s.standard_id !== governingStdId);
    const otherDesc = otherSources.map(s => `${s.standard_short_code} 的 ${s.requirement_text}`).join('、');
    arbitrationReason = `取严苛下限值：${govShort} (≥${strictMin}${commonUnit}) 严于 ${otherDesc}`;
  } else if (maxDiff) {
    const govShort = getStandardShortCode(governingStdId);
    const otherSources = sources.filter(s => s.standard_id !== governingStdId);
    const otherDesc = otherSources.map(s => `${s.standard_short_code} 的 ${s.requirement_text}`).join('、');
    arbitrationReason = `取严苛上限值：${govShort} (≤${strictMax}${commonUnit}) 严于 ${otherDesc}`;
  }

  const baseRule = items[0]!.rule;

  return {
    ...baseRule,
    property_key: canonicalKey,
    requirement_level: highestLevel,
    criteria: {
      min: strictMin,
      max: strictMax,
      unit: commonUnit,
      rounding_decimals: maxDecimals,
      min_inclusive: true,
      max_inclusive: true,
    },
    composite_trace: {
      canonical_property_key: canonicalKey,
      display_name: baseRule.display_name,
      sources,
      governing_standard_id: governingStdId,
      is_tightened: isTightened,
      dual_standard_requirement_text: dualRequirementText,
      arbitration_reason: arbitrationReason,
    },
  };
}

/**
 * 合成替代检验组 (如致密性水压与高等级涡流替代)
 */
function composeAlternativeGroupRule(
  canonicalKey: string,
  items: Array<{ rule: EvaluationRule; standardId: string; standardName?: string }>,
  highestLevel: RequirementLevel
): CompositeEvaluationRule {
  const sources: SourceRuleTrace[] = items.map(item => ({
    standard_id: item.standardId,
    standard_short_code: getStandardShortCode(item.standardId),
    rule_id: item.rule.rule_id,
    requirement_level: item.rule.requirement_level,
    requirement_text: formatRuleRequirementText(item.rule),
    is_governing_strict: false,
    raw_rule: item.rule,
  }));

  // 寻找是否存在加严涡流替代 (如 E2H 严于 E3H)
  let bestEddyLevel = 'E3H';
  let governingStdId = items[0]!.standardId;

  for (const item of items) {
    const cand = item.rule.criteria['candidates'];
    if (Array.isArray(cand)) {
      for (const c of cand) {
        const reqL = c.required_level;
        if (reqL && (EDDY_CURRENT_LEVEL_RANK[reqL] || 0) > (EDDY_CURRENT_LEVEL_RANK[bestEddyLevel] || 0)) {
          bestEddyLevel = reqL;
          governingStdId = item.standardId;
        }
      }
    }
  }

  // 标记加严来源
  for (const src of sources) {
    if (src.standard_id === governingStdId) {
      src.is_governing_strict = true;
    }
  }

  const dualRequirementText = sources
    .map(s => `${s.requirement_text} [${s.standard_short_code}]`)
    .join(' / ');

  const govShort = getStandardShortCode(governingStdId);
  const baseRule = items[0]!.rule;

  return {
    ...baseRule,
    property_key: canonicalKey,
    requirement_level: highestLevel,
    criteria: {
      group_logic: 'AT_LEAST_ONE_PASS',
      candidates: [
        {
          candidate_key: 'hydraulic_test',
          display_name: '逐根液压/水压试验',
          test_standard: 'GB/T 241',
          max_pressure_cap: 20,
          min_holding_time_s: 10,
          criteria_description: '试验压力按公式计算，最大试验压力不超过 20MPa，稳压时间不少于 10s 无渗漏',
        },
        {
          candidate_key: 'eddy_current_test',
          display_name: `高等级涡流探伤替代 (${bestEddyLevel} 级)`,
          test_standard: 'GB/T 7735-2016',
          required_level: bestEddyLevel,
          criteria_description: `外径<=25mm人工缺陷通孔0.8mm；外径>25mm符合 GB/T 7735 ${bestEddyLevel} 级要求`,
        },
      ],
    },
    composite_trace: {
      canonical_property_key: canonicalKey,
      display_name: baseRule.display_name,
      sources,
      governing_standard_id: governingStdId,
      is_tightened: bestEddyLevel !== 'E3H',
      dual_standard_requirement_text: dualRequirementText,
      arbitration_reason: `采用 ${govShort} 严苛替代要求：涡流验收等级提升至 ${bestEddyLevel} 级`,
    },
  };
}

/**
 * 合成定性规则或动态公式
 */
function composeQualitativeRule(
  canonicalKey: string,
  items: Array<{ rule: EvaluationRule; standardId: string; standardName?: string }>,
  highestLevel: RequirementLevel,
  baseRule: EvaluationRule
): CompositeEvaluationRule {
  const sources: SourceRuleTrace[] = items.map(item => ({
    standard_id: item.standardId,
    standard_short_code: getStandardShortCode(item.standardId),
    rule_id: item.rule.rule_id,
    requirement_level: item.rule.requirement_level,
    requirement_text: formatRuleRequirementText(item.rule),
    is_governing_strict: false,
    raw_rule: item.rule,
  }));

  // 检查探伤验收等级 (如 U2)
  let bestUltrasonicLevel = 'U3';
  let governingStdId = items[0]!.standardId;

  for (const item of items) {
    const reqL = item.rule.criteria['required_level'];
    if (reqL && (ULTRASONIC_LEVEL_RANK[reqL] || 0) > (ULTRASONIC_LEVEL_RANK[bestUltrasonicLevel] || 0)) {
      bestUltrasonicLevel = reqL;
      governingStdId = item.standardId;
    }
  }

  for (const src of sources) {
    if (src.standard_id === governingStdId) {
      src.is_governing_strict = true;
    }
  }

  const dualRequirementText = sources
    .map(s => `${s.requirement_text} [${s.standard_short_code}]`)
    .join(' / ');

  return {
    ...baseRule,
    property_key: canonicalKey,
    requirement_level: highestLevel,
    composite_trace: {
      canonical_property_key: canonicalKey,
      display_name: baseRule.display_name,
      sources,
      governing_standard_id: governingStdId,
      is_tightened: false,
      dual_standard_requirement_text: dualRequirementText,
      arbitration_reason: '多标准定性试验或方法要求一致',
    },
  };
}
