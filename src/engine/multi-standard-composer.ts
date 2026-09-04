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
  category?: StandardCategory;
  priority?: number;
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
  is_structural_tightened?: boolean;
  non_participating_standards?: string[];
  is_statutory_relaxation_risk?: boolean;
  statutory_baseline?: string;
  statutory_relaxation_warning?: string;
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

export type StandardCategory = 'technical_agreement' | 'industry_standard' | 'national_standard' | 'enterprise_standard';

export interface SliceWithStandardMeta {
  slice: SpecificationSlice;
  standardId: string;
  standardName?: string;
  category?: StandardCategory;
  priority?: number;
}

/**
 * 推断标准的默认分类与优先级 (技术协议 1 > 行业订货标 2 > 企标 3 > 国家基础标 4)
 */
export function inferStandardCategoryAndPriority(meta: {
  standardId: string;
  category?: StandardCategory;
  priority?: number;
}): { category: StandardCategory; priority: number } {
  let cat = meta.category;
  if (!cat) {
    const id = meta.standardId.toUpperCase();
    if (id.startsWith('TA-') || id.includes('TA_') || id.includes('协议') || id.includes('AGREEMENT') || id.includes('SPECIFICATION')) {
      cat = 'technical_agreement';
    } else if (id.includes('NB/T') || id.includes('NB_T') || id.includes('HG/T') || id.includes('HG_T') || id.includes('JB/T') || id.includes('JB_T')) {
      cat = 'industry_standard';
    } else if (id.includes('GB/T') || id.includes('GB_T') || id.startsWith('GB')) {
      cat = 'national_standard';
    } else if (id.startsWith('Q/') || id.startsWith('Q_')) {
      cat = 'enterprise_standard';
    } else {
      cat = 'national_standard';
    }
  }

  let pri = meta.priority;
  if (pri === undefined) {
    switch (cat) {
      case 'technical_agreement':
        pri = 1;
        break;
      case 'industry_standard':
        pri = 2;
        break;
      case 'enterprise_standard':
        pri = 3;
        break;
      case 'national_standard':
      default:
        pri = 4;
        break;
    }
  }

  return { category: cat, priority: pri };
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
 * 格式化标准代号（保留包含年份的完整代号，例如 "NB/T 47019.5-2021"、"GB/T 13296-2023"，杜绝法规歧义）
 */
export function getStandardShortCode(standardId: string): string {
  return standardId.trim();
}

/**
 * 清理动态公式中的系统内部变量名（如 ctx.chemical.C -> C）
 */
export function cleanFormulaVariableNames(expr?: string): string | undefined {
  if (!expr) return expr;
  return expr
    .replace(/ctx\.chemical\.([A-Za-z0-9]+)/g, '$1')
    .replace(/ctx\.mechanical\.([A-Za-z0-9_]+)/g, '$1')
    .replace(/ctx\.dimensions\.([A-Za-z0-9_]+)/g, '$1')
    .replace(/\s*\*\s*/g, '×')
    .replace(/\s*\+\s*/g, '+');
}

/**
 * 美化动态公式中的代码变量，并将实测代入后的具体计算比较值注入要求文本中
 */
export function humanizeDynamicFormulaText(
  rawText: string,
  calculatedBound?: number | null,
  unit?: string
): string {
  if (!rawText) return rawText;

  let text = cleanFormulaVariableNames(rawText) || rawText;

  if (calculatedBound !== null && calculatedBound !== undefined && !isNaN(calculatedBound)) {
    const unitStr = unit || '%';
    if (!text.includes('[即')) {
      if (text.includes('且')) {
        text = text.replace(/^(≥\s*[^且]+?)\s*且\s*/, `$1 [即 ≥ ${calculatedBound}${unitStr}] 且 `);
      } else {
        const prefix = text.includes('≤') ? '≤' : (text.includes('≥') ? '≥' : '');
        text = `${text.trim()} [即 ${prefix} ${calculatedBound}${unitStr}]`;
      }
    }
  }

  return text.replace(/\s{2,}/g, ' ').trim();
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
    const fMin = cleanFormulaVariableNames(rule.criteria['formula_min']);
    const fMax = cleanFormulaVariableNames(rule.criteria['formula_max']);
    const max = rule.criteria['max'];
    const min = rule.criteria['min'];
    if (fMin && max) return `≥ ${fMin} 且 ≤ ${max}%`;
    if (fMin) return `≥ ${fMin}`;
    if (fMax) return `≤ ${fMax}`;
    if (min) return `≥ ${min}`;
    return cleanFormulaVariableNames(rule.criteria['note']) || '公式动态计算';
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
    const exp = rule.criteria['expected'];
    if (exp === 'NO_CORROSION_TREND' || rule.property_key === 'intergranular_corrosion') {
      const method = rule.criteria['method'] || 'Method_E';
      return `按 ${method} 检验无晶间腐蚀倾向`;
    }
    return exp || '定性试验合格';
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

  // 1. 规范化各切片优先级与分类，并按优先级从高到低排序 (数值越小优先级越高: 1 > 2 > 3)
  const normalizedSlices = slicesWithMeta.map((s, idx) => {
    const { category, priority } = inferStandardCategoryAndPriority({
      standardId: s.standardId,
      category: s.category,
      priority: s.priority,
    });
    return {
      ...s,
      category,
      priority,
      originalIndex: idx,
    };
  });
  normalizedSlices.sort((a, b) => a.priority - b.priority || a.originalIndex - b.originalIndex);

  const sourceStandards = slicesWithMeta.map(s => s.standardId || s.slice.standard_code || 'STANDARD');
  const sourceStandardsNames = slicesWithMeta.map(s => s.standardName || s.standardId || s.slice.display_name);

  // 2. 选取基准切片元数据（优先取原始声明的主申报标准切片）
  const primarySlice = slicesWithMeta[0]!.slice;

  // 3. 收集所有规则，按规范化属性键 (canonical_property_key) 分组
  interface RuleGroupItem {
    rule: EvaluationRule;
    standardId: string;
    standardName?: string;
    category: StandardCategory;
    priority: number;
  }
  const groupedRules = new Map<string, RuleGroupItem[]>();

  for (const item of normalizedSlices) {
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
        category: item.category,
        priority: item.priority,
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

      // 判断是否存在未考核该项的参与标准 (如基础国标 GB/T 13296 未考核晶粒度，而订货标 NB/T 47019.5 独占考核)
      const otherStandards = sourceStandards.filter(s => s !== single.standardId);
      const isStructuralTightened = otherStandards.length > 0;

      const composed: CompositeEvaluationRule = {
        ...single.rule,
        property_key: canonicalKey, // 统一为规范键名
        composite_trace: {
          canonical_property_key: canonicalKey,
          display_name: single.rule.display_name,
          sources: [sourceTrace],
          governing_standard_id: single.standardId,
          governing_standard_name: single.standardName || single.standardId,
          is_tightened: isStructuralTightened,
          is_structural_tightened: isStructuralTightened,
          non_participating_standards: isStructuralTightened ? otherStandards : undefined,
          dual_standard_requirement_text: isStructuralTightened
            ? `${reqText} [${stdShort} 独占加严]`
            : `${reqText} [${stdShort}]`,
          arbitration_reason: isStructuralTightened
            ? `依据订货加严标准 ${single.standardId} 独占条款要求执行 (基础标准无此强制指标)`
            : `依据 ${single.standardId} 条款要求执行`,
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
  items: Array<{
    rule: EvaluationRule;
    standardId: string;
    standardName?: string;
    category: StandardCategory;
    priority: number;
  }>
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
 * 合成数值区间规则 (下限取 max, 上限取 min，并检测技术协议放宽法标风险)
 */
function composeNumericRangeRule(
  canonicalKey: string,
  items: Array<{
    rule: EvaluationRule;
    standardId: string;
    standardName?: string;
    category: StandardCategory;
    priority: number;
  }>,
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
      category: item.category,
      priority: item.priority,
      is_governing_strict: false, // 稍后标记
      raw_rule: item.rule,
    });
  }

  // 检查是否存在技术协议放宽法定底线的风险 (分级管控)
  let isStatutoryRelaxationRisk = false;
  let statutoryBaselineText: string | undefined;
  let statutoryRelaxationWarning: string | undefined;

  const topItem = items[0]!;
  const topMin = typeof topItem.rule.criteria['min'] === 'number' ? topItem.rule.criteria['min'] : null;
  const topMax = typeof topItem.rule.criteria['max'] === 'number' ? topItem.rule.criteria['max'] : null;

  const statutoryItems = items.slice(1).filter(i => i.category === 'national_standard' || i.category === 'industry_standard');
  const statutoryMins = statutoryItems.map(i => i.rule.criteria['min']).filter((v): v is number => typeof v === 'number');
  const statutoryMaxs = statutoryItems.map(i => i.rule.criteria['max']).filter((v): v is number => typeof v === 'number');
  const statutoryMinBaseline = statutoryMins.length > 0 ? Math.max(...statutoryMins) : null;
  const statutoryMaxBaseline = statutoryMaxs.length > 0 ? Math.min(...statutoryMaxs) : null;

  const isMinRelaxed = topItem.category === 'technical_agreement' && topMin !== null && statutoryMinBaseline !== null && topMin < statutoryMinBaseline;
  const isMaxRelaxed = topItem.category === 'technical_agreement' && topMax !== null && statutoryMaxBaseline !== null && topMax > statutoryMaxBaseline;

  let governingStdId = minGoverningStdId;
  let arbitrationReason = '多标准技术指标一致';
  let isTightened = false;

  if (isMinRelaxed || isMaxRelaxed) {
    // 技术协议放宽了法定标准底线：采纳技术协议指标，但标记放宽风险
    isStatutoryRelaxationRisk = true;
    strictMin = topMin !== null ? topMin : statutoryMinBaseline;
    strictMax = topMax !== null ? topMax : statutoryMaxBaseline;
    governingStdId = topItem.standardId;
    isTightened = true;

    const minPart = statutoryMinBaseline !== null ? `≥${statutoryMinBaseline}${commonUnit}` : '';
    const maxPart = statutoryMaxBaseline !== null ? `≤${statutoryMaxBaseline}${commonUnit}` : '';
    statutoryBaselineText = [minPart, maxPart].filter(Boolean).join(' 且 ');
    statutoryRelaxationWarning = `高优先级采购技术协议放宽了法定标准底线要求 (${getStandardShortCode(topItem.standardId)} 规定 ${formatRuleRequirementText(topItem.rule)}，宽于法定标准 ${statutoryBaselineText})，请核验特种设备设计合规与风险备案`;
    arbitrationReason = `技术协议优先采纳 (放宽法标风险)：${statutoryRelaxationWarning}`;
  } else {
    // 正常严苛包络线判定
    const mins = sources.map(s => s.min).filter(v => v !== null && v !== undefined) as number[];
    const maxs = sources.map(s => s.max).filter(v => v !== null && v !== undefined) as number[];
    const minDiff = mins.length > 1 && Math.max(...mins) !== Math.min(...mins);
    const maxDiff = maxs.length > 1 && Math.max(...maxs) !== Math.min(...maxs);
    isTightened = minDiff || maxDiff;

    governingStdId = minDiff ? minGoverningStdId : (maxDiff ? maxGoverningStdId : items[0]!.standardId);

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
  }

  // 标记主导加严/主导优先标准
  for (const src of sources) {
    if (src.standard_id === governingStdId) {
      src.is_governing_strict = true;
    }
  }

  // 组装双标/多标紧凑展示文本
  const dualRequirementText = sources
    .map(s => `${s.requirement_text} [${s.standard_short_code}]`)
    .join(' / ');

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
      is_statutory_relaxation_risk: isStatutoryRelaxationRisk,
      statutory_baseline: statutoryBaselineText,
      statutory_relaxation_warning: statutoryRelaxationWarning,
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
