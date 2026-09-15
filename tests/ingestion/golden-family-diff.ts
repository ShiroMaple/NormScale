/* ==========================================================================
   golden 规则族对账工具（T4 配套）：输入两份切片集，输出规则族级 diff
   - 清单条目：property_key + rule_type + 关键 criteria（完整 criteria 快照）
   - 对齐键：spec_key/rule_id；比对内容：property_key/rule_type/requirement_level/
     trigger_condition/criteria（递归 key 排序稳定序列化，容忍 JSON key 顺序差异）
   - 纯函数、零依赖：vitest 用例与 scratch 一次性导出脚本共用
   ========================================================================== */

export const RECONCILE_FAMILIES = ['process', 'metallographic', 'corrosion', 'ndt', 'surface'] as const;

export interface FamilyRuleEntry {
  rule_id: string;
  category: string;
  property_key: string;
  rule_type: string;
  requirement_level: string;
  trigger_condition?: string;
  /** 关键 criteria 完整快照（人工精校数据，规模可控） */
  criteria: unknown;
}

export interface SliceFamilyRules {
  spec_key: string;
  primary_grade?: string;
  rules: FamilyRuleEntry[];
}

export interface FamilyDiffEntry {
  family: string;
  spec_key: string;
  rule_id: string;
  kind: 'added' | 'lost' | 'changed';
  detail: string;
}

export interface FamilyRuleDiff {
  added: FamilyDiffEntry[];
  lost: FamilyDiffEntry[];
  changed: FamilyDiffEntry[];
}

/** 递归 key 排序的稳定序列化（比对只依赖内容，不依赖 JSON key 顺序） */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  const body = Object.keys(record)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`)
    .join(',');
  return `{${body}}`;
}

interface RawSlice {
  spec_key: string;
  primary_grade?: string;
  evaluation_rules?: Array<Record<string, unknown>>;
}

/** 从切片集抽取目标规则族清单（golden 切片与管线产物共用同一入口） */
export function extractFamilyRulesFromSlices(slices: RawSlice[], families: readonly string[] = RECONCILE_FAMILIES): SliceFamilyRules[] {
  const familySet = new Set<string>(families);
  const out: SliceFamilyRules[] = [];
  for (const slice of slices) {
    const rules = (slice.evaluation_rules ?? [])
      .filter((r) => familySet.has(String(r.category ?? '')))
      .map((r) => {
        const entry: FamilyRuleEntry = {
          rule_id: String(r.rule_id ?? ''),
          category: String(r.category ?? ''),
          property_key: String(r.property_key ?? ''),
          rule_type: String(r.rule_type ?? ''),
          requirement_level: String(r.requirement_level ?? 'MANDATORY'),
          criteria: r.criteria ?? {},
        };
        if (typeof r.trigger_condition === 'string' && r.trigger_condition.length > 0) {
          entry.trigger_condition = r.trigger_condition;
        }
        return entry;
      })
      .sort((a, b) => a.rule_id.localeCompare(b.rule_id));
    if (rules.length > 0) {
      out.push({ spec_key: slice.spec_key, primary_grade: slice.primary_grade, rules });
    }
  }
  return out.sort((a, b) => a.spec_key.localeCompare(b.spec_key));
}

/** 规则内容比对指纹：property_key + rule_type + 级别/触发条件 + criteria 数值快照 */
function ruleFingerprint(entry: FamilyRuleEntry): string {
  return stableStringify({
    property_key: entry.property_key,
    rule_type: entry.rule_type,
    requirement_level: entry.requirement_level,
    trigger_condition: entry.trigger_condition ?? null,
    criteria: entry.criteria ?? {},
  });
}

/**
 * 规则族级 diff（base=基准清单，candidate=待对账产物）：
 * - added：candidate 新增 rule_id；lost：candidate 丢失 rule_id
 * - changed：rule_id 对齐但内容指纹不一致
 * 条目携带 family（category），供按族汇总与报告
 */
export function diffFamilyRules(base: SliceFamilyRules[], candidate: SliceFamilyRules[]): FamilyRuleDiff {
  const diff: FamilyRuleDiff = { added: [], lost: [], changed: [] };
  const index = (slices: SliceFamilyRules[]): Map<string, { specKey: string; rule: FamilyRuleEntry }> => {
    const map = new Map<string, { specKey: string; rule: FamilyRuleEntry }>();
    for (const slice of slices) {
      for (const rule of slice.rules) {
        map.set(`${slice.spec_key}/${rule.rule_id}`, { specKey: slice.spec_key, rule });
      }
    }
    return map;
  };
  const baseIdx = index(base);
  const candidateIdx = index(candidate);

  for (const [key, baseEntry] of baseIdx) {
    const candidateEntry = candidateIdx.get(key);
    if (!candidateEntry) {
      diff.lost.push({
        family: baseEntry.rule.category,
        spec_key: baseEntry.specKey,
        rule_id: baseEntry.rule.rule_id,
        kind: 'lost',
        detail: `规则丢失: ${key} (${baseEntry.rule.property_key}/${baseEntry.rule.rule_type})`,
      });
      continue;
    }
    if (ruleFingerprint(baseEntry.rule) !== ruleFingerprint(candidateEntry.rule)) {
      diff.changed.push({
        family: baseEntry.rule.category,
        spec_key: baseEntry.specKey,
        rule_id: baseEntry.rule.rule_id,
        kind: 'changed',
        detail: `规则变更: ${key} 基准指纹 ${ruleFingerprint(baseEntry.rule)} -> 候选指纹 ${ruleFingerprint(candidateEntry.rule)}`,
      });
    }
  }
  for (const [key, candidateEntry] of candidateIdx) {
    if (baseIdx.has(key)) continue;
    diff.added.push({
      family: candidateEntry.rule.category,
      spec_key: candidateEntry.specKey,
      rule_id: candidateEntry.rule.rule_id,
      kind: 'added',
      detail: `新增规则: ${key} (${candidateEntry.rule.property_key}/${candidateEntry.rule.rule_type})`,
    });
  }
  return diff;
}
