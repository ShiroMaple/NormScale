import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  RECONCILE_FAMILIES,
  diffFamilyRules,
  extractFamilyRulesFromSlices,
  stableStringify,
  type SliceFamilyRules,
} from './golden-family-diff';

/* golden 规则族对账（offline，无 LLM，只读 data/standards）：
   1. 清单结构自检（字段齐备、rule_id 切片内唯一、族范围正确）
   2. 清单 vs golden 实库零 diff（守护清单新鲜度；真实 E2E 时以同一 diff 工具比对管线产物）
   3. diff 工具行为测试（新增/丢失/变更/键序容忍） */

const REPO_ROOT = process.cwd();
const GOLDEN_DIR = path.join(REPO_ROOT, 'data/standards/NB_T_47019_5_2021/slices');
const MANIFEST_PATH = path.join(REPO_ROOT, 'tests/fixtures/nb-golden-family-rules.json');

interface GoldenSlice {
  spec_key: string;
  primary_grade?: string;
  evaluation_rules: Array<Record<string, unknown>>;
}

function loadGoldenSlices(): GoldenSlice[] {
  return fs
    .readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, f), 'utf8')) as GoldenSlice);
}

interface Manifest {
  standard_id: string;
  families: string[];
  slice_count: number;
  rule_count: number;
  slices: SliceFamilyRules[];
}

function loadManifest(): Manifest {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
}

describe('golden 规则族对账清单（NB/T 47019.5-2021 全量切片）', () => {
  it('清单结构自检：字段齐备、rule_id 切片内唯一、族范围限定五族、计数一致', () => {
    const manifest = loadManifest();
    expect(manifest.standard_id).toBe('NB/T 47019.5-2021');
    expect(manifest.families).toEqual([...RECONCILE_FAMILIES]);
    // v1.7.4 promote 后正式库为管线全量产物（22 切片）；清单由导出脚本生成，计数以其为准
    expect(manifest.slice_count).toBe(22);
    expect(manifest.slice_count).toBe(manifest.slices.length);

    let ruleCount = 0;
    for (const slice of manifest.slices) {
      const seen = new Set<string>();
      for (const rule of slice.rules) {
        expect(rule.rule_id.length).toBeGreaterThan(0);
        expect(RECONCILE_FAMILIES).toContain(rule.category);
        expect(rule.property_key.length).toBeGreaterThan(0);
        expect(rule.rule_type.length).toBeGreaterThan(0);
        expect(seen.has(rule.rule_id)).toBe(false);
        seen.add(rule.rule_id);
        ruleCount += 1;
      }
    }
    expect(manifest.rule_count).toBe(ruleCount);
    expect(ruleCount).toBeGreaterThan(0);
  });

  it('清单 vs golden 实库零 diff（清单新鲜度守护；真实 E2E 以同一工具比对管线产物）', () => {
    const manifest = loadManifest();
    // 与导出脚本同口径：含 ndt 族规则的精校切片
    const curated = loadGoldenSlices().filter((s) => s.evaluation_rules.some((r) => r.category === 'ndt'));
    const goldenExtract = extractFamilyRulesFromSlices(curated as never);

    const diff = diffFamilyRules(manifest.slices, goldenExtract);
    expect(diff.added).toEqual([]);
    expect(diff.lost).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it('diff 工具：新增/丢失/变更可检出，criteria 键序差异不误判', () => {
    const manifest = loadManifest();
    const base = manifest.slices;

    // 变更：改写首条规则的 criteria 数值
    const mutated: SliceFamilyRules[] = JSON.parse(JSON.stringify(base));
    const firstRule = mutated[0]!.rules[0]!;
    (firstRule.criteria as Record<string, unknown>)['expected'] = 'MUTATED';
    const changedDiff = diffFamilyRules(base, mutated);
    expect(changedDiff.changed.length).toBe(1);
    expect(changedDiff.changed[0]!.rule_id).toBe(firstRule.rule_id);
    expect(changedDiff.changed[0]!.family).toBe(firstRule.category);

    // 丢失：删除末条规则
    const shrunk: SliceFamilyRules[] = JSON.parse(JSON.stringify(base));
    const lastSlice = shrunk[shrunk.length - 1]!;
    const dropped = lastSlice.rules.pop()!;
    const lostDiff = diffFamilyRules(base, shrunk);
    expect(lostDiff.lost.length).toBe(1);
    expect(lostDiff.lost[0]!.rule_id).toBe(dropped.rule_id);

    // 新增：注入新规则
    const grown: SliceFamilyRules[] = JSON.parse(JSON.stringify(base));
    grown[0]!.rules.push({
      rule_id: 'PROC_NEW_TEST_RULE',
      category: 'process',
      property_key: 'flattening',
      rule_type: 'dynamic_formula_pass',
      requirement_level: 'MANDATORY',
      criteria: { formula_distance_H: '(1 + 0.09) * S / (0.09 + S / D)', expected_visual_result: 'NO_CRACKS' },
    });
    const addedDiff = diffFamilyRules(base, grown);
    expect(addedDiff.added.length).toBe(1);
    expect(addedDiff.added[0]!.rule_id).toBe('PROC_NEW_TEST_RULE');

    // 键序差异不误判（stableStringify 递归排序）
    const reordered: SliceFamilyRules[] = JSON.parse(JSON.stringify(base));
    for (const slice of reordered) {
      for (const rule of slice.rules) {
        if (rule.criteria && typeof rule.criteria === 'object' && !Array.isArray(rule.criteria)) {
          const entries = Object.entries(rule.criteria as Record<string, unknown>).reverse();
          rule.criteria = Object.fromEntries(entries);
        }
      }
    }
    expect(diffFamilyRules(base, reordered)).toEqual({ added: [], lost: [], changed: [] });
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  });
});
