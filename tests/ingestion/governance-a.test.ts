import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { mountRulesByGrades } from '@/ingestion/llm-extract';
import { runGates } from '@/ingestion/gates';
import type { GateInput } from '@/ingestion/gates';
import { mergeTableNotes } from '@/ingestion/segmenter';
import { scanPropertyKeyCatalog } from '@/ingestion/promote';
import { PropertyKeyNormalizer } from '@/normalizer/property-key-normalizer';
import type { DraftRule, DraftSlice, TextBlock } from '@/ingestion/types';

/* 阶段 A 治理项 2-5 测试：注册表归一化碰撞、expected_visual_result 闭集、定性规则原文层、
   ORG:type:OTHERS 组织类型兜底挂载、表注归属合并。严禁真实 LLM。 */

function makeRule(overrides: Partial<DraftRule>): DraftRule {
  return {
    rule_id: 'R1',
    category: 'process',
    property_key: 'flattening_test',
    display_name: '压扁试验',
    rule_type: 'dynamic_formula_pass',
    requirement_level: 'MANDATORY',
    criteria: { formula_distance_H: '(1 + 0.09) * S / (0.09 + S / D)', expected_visual_result: 'NO_CRACKS' },
    source_clause: '7.6.1',
    ...overrides,
  };
}

function makeSlice(specKey: string, structureType: string, rules: DraftRule[] = [], grade?: string): DraftSlice {
  return {
    spec_key: specKey,
    spec_type: 'grade',
    standard_code: 'GB/T 13296-2023',
    display_name: `${grade || specKey} (${specKey})`,
    primary_grade: grade || specKey,
    structure_type: structureType,
    description: `${grade || specKey} 试验切片`,
    aliases: [],
    evaluation_rules: rules,
  };
}

function gateInput(overrides: Partial<GateInput>): GateInput {
  return {
    meta: { standard_id: 'GB/T 13296-2023', standard_name: '锅炉、热交换器用不锈钢无缝钢管', version: '2023', description: '本文件规定了技术要求。', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] },
    slices: [],
    clauses: [],
    clauseTextIndex: {},
    expectedGradeRows: null,
    ...overrides,
  };
}

describe('项2：注册表归一化碰撞检测（WARN，不阻塞）', () => {
  it('flattening 与 flattening_test 并存 -> 碰撞 WARN（以归一化输出为 canonical 基准）', () => {
    const result = runGates(gateInput({ propertyKeyRegistry: ['flattening', 'flattening_test', 'C'], declaredFamilies: ['chemical', 'mechanical'] }));
    const collision = result.issues.find((i) => i.code === 'LINT_PROPERTY_KEY_COLLISION');
    expect(collision).toBeDefined();
    expect(collision!.severity).toBe('WARN');
    expect(collision!.message).toContain('flattening_test');
    expect(result.passed).toBe(true);
  });

  it('无碰撞注册表不报；空注册表跳过', () => {
    const clean = runGates(gateInput({ propertyKeyRegistry: ['flattening_test', 'flaring_test', 'C'], declaredFamilies: ['chemical', 'mechanical'] }));
    expect(clean.issues.some((i) => i.code === 'LINT_PROPERTY_KEY_COLLISION')).toBe(false);
    const empty = runGates(gateInput({ propertyKeyRegistry: [] }));
    expect(empty.issues.some((i) => i.code === 'LINT_PROPERTY_KEY_COLLISION')).toBe(false);
  });

  it('真实标准库注册表无归一化碰撞（flattening/flaring 双 canonical 已合并）', () => {
    const catalog = scanPropertyKeyCatalog(path.resolve(process.cwd(), 'data/standards'));
    const canonicalToKeys = new Map<string, string[]>();
    for (const key of catalog.keys()) {
      const canonical = PropertyKeyNormalizer.normalize(key).property_key;
      canonicalToKeys.set(canonical, [...(canonicalToKeys.get(canonical) ?? []), key]);
    }
    const collisions = [...canonicalToKeys.entries()].filter(([, keys]) => keys.length > 1);
    expect(collisions).toEqual([]);
    expect(catalog.has('flattening_test')).toBe(true);
    expect(catalog.has('flaring_test')).toBe(true);
    expect(catalog.has('flattening')).toBe(false);
    expect(catalog.has('flaring')).toBe(false);
  });
});

describe('项3.1：expected_visual_result 闭集白名单', () => {
  it('闭集内取值（NO_CRACKS/NO_CRACKS_OR_SPLITS/NO_LEAKS/CLEAN_PASS）与缺省均通过', () => {
    const rules = [
      makeRule({ rule_id: 'A', criteria: { formula_distance_H: '(1 + 0.09) * S / (0.09 + S / D)', expected_visual_result: 'NO_CRACKS' } }),
      makeRule({ rule_id: 'B', rule_type: 'qualitative_and_numeric', property_key: 'flaring_test', criteria: { cone_angle_deg: 60, expected_visual_result: 'NO_CRACKS_OR_SPLITS' } }),
      makeRule({ rule_id: 'C', criteria: { formula_distance_H: '(1 + 0.09) * S / (0.09 + S / D)' } }),
    ];
    const result = runGates(gateInput({ slices: [makeSlice('S30408', 'austenitic', rules)], declaredFamilies: ['process'] }));
    expect(result.issues.some((i) => i.code === 'LINT_VISUAL_RESULT')).toBe(false);
    expect(result.passed).toBe(true);
  });

  it('集外机器码被 LINT_VISUAL_RESULT 拦截（MANUAL_REVIEW）', () => {
    const rule = makeRule({ criteria: { formula_distance_H: '(1 + 0.09) * S / (0.09 + S / D)', expected_visual_result: 'NO_CRACK' } });
    const result = runGates(gateInput({ slices: [makeSlice('S30408', 'austenitic', [rule])], declaredFamilies: ['process'] }));
    expect(result.issues.some((i) => i.code === 'LINT_VISUAL_RESULT' && i.message.includes('NO_CRACK'))).toBe(true);
    expect(result.passed).toBe(false);
  });
});

describe('项3.2：定性规则原文双层记录（description/criteria_description 含 CJK）', () => {
  it('qualitative_pass/qualitative_enum/exemption 携带 CJK description 或通过 criteria_description 承载', () => {
    const rules = [
      makeRule({ rule_id: 'Q1', category: 'surface', rule_type: 'qualitative_pass', property_key: 'surface_quality', criteria: { expected: 'CLEAN_PASS' }, description: '依据 GB/T 13296-2023 第6.11条，内外表面无裂缝、折叠' }),
      makeRule({ rule_id: 'Q2', category: 'corrosion', rule_type: 'qualitative_enum', property_key: 'intergranular_corrosion', criteria: { method: 'Method_E', expected: 'NO_CORROSION_TREND', criteria_description: '依据第7.7条，按 GB/T 4334-2020 方法 E 试验无晶间腐蚀倾向' } }),
      makeRule({ rule_id: 'Q3', category: 'corrosion', rule_type: 'exemption', property_key: 'intergranular_corrosion', requirement_level: 'EXEMPT', criteria: { reason: '标准 7.7.1 明确豁免' }, description: '依据第 7.7.1 条，该牌号可不进行晶间腐蚀试验' }),
    ];
    const result = runGates(gateInput({ slices: [makeSlice('S30408', 'austenitic', rules)], declaredFamilies: ['surface', 'corrosion'] }));
    expect(result.issues.some((i) => i.code === 'LINT_QUALITATIVE_DESCRIPTION')).toBe(false);
    expect(result.passed).toBe(true);
  });

  it('缺失描述性字段或被译为英文（无 CJK）被 LINT_QUALITATIVE_DESCRIPTION 拦截', () => {
    const noDesc = makeRule({ rule_id: 'Q1', category: 'surface', rule_type: 'qualitative_pass', property_key: 'surface_quality', criteria: { expected: 'CLEAN_PASS' } });
    const english = makeRule({ rule_id: 'Q2', category: 'surface', rule_type: 'qualitative_pass', property_key: 'surface_quality', criteria: { expected: 'CLEAN_PASS' }, description: 'Surface shall be free of cracks' });
    const result = runGates(gateInput({
      slices: [
        makeSlice('S30408', 'austenitic', [noDesc]),
        makeSlice('S30409', 'austenitic', [english]),
      ],
      declaredFamilies: ['surface'],
    }));
    const issues = result.issues.filter((i) => i.code === 'LINT_QUALITATIVE_DESCRIPTION');
    expect(issues.length).toBe(2);
    expect(issues.some((i) => i.message.includes('缺少语义真相原文层'))).toBe(true);
    expect(issues.some((i) => i.message.includes('不含 CJK'))).toBe(true);
    expect(result.passed).toBe(false);
  });
});

describe('项4：ORG:type:OTHERS 组织类型兜底挂载', () => {
  const slices = (): DraftSlice[] => [
    makeSlice('S30408', 'austenitic', [], '06Cr19Ni10'), // 显式列名
    makeSlice('S30409', 'austenitic', [], '07Cr19Ni10'), // 未被显式列名 -> OTHERS 覆盖
    makeSlice('S11306', 'ferritic', [], '06Cr13'),       // 组织类型不符
  ];

  it('ORG:austenitic:OTHERS 展开为：该组织类型且未被本表显式列名的切片', () => {
    const explicit = makeRule({ rule_id: 'MECH_HARDNESS_EXPLICIT', category: 'mechanical', property_key: 'hardness', rule_type: 'or_choice_group', source_clause: '表5', applies_to_grades: ['06Cr19Ni10'] });
    const orgOthers = makeRule({ rule_id: 'MECH_HARDNESS_OTHERS', category: 'mechanical', property_key: 'hardness', rule_type: 'or_choice_group', source_clause: '表5', applies_to_grades: ['ORG:austenitic:OTHERS'] });
    const { perSlice, unmounted } = mountRulesByGrades([explicit, orgOthers], slices());
    expect(unmounted).toEqual([]);
    const ids = (i: number) => perSlice[i]!.map((r) => r.rule_id);
    // 显式规则只挂 S30408；OTHERS 挂 S30409（ austenitic 且未被显式列名），不挂铁素体
    expect(ids(0)).toEqual(['MECH_HARDNESS_EXPLICIT_S30408']);
    expect(ids(1)).toEqual(['MECH_HARDNESS_OTHERS_S30409']);
    expect(ids(2)).toEqual([]);
  });

  it('无显式规则同键竞争时 OTHERS 覆盖该组织类型全部切片；组织类型不符不挂', () => {
    const orgOthers = makeRule({ rule_id: 'H', category: 'mechanical', property_key: 'hardness', rule_type: 'or_choice_group', source_clause: '表5', applies_to_grades: ['ORG:ferritic:OTHERS'] });
    const { perSlice, unmounted } = mountRulesByGrades([orgOthers], slices());
    expect(unmounted).toEqual([]);
    expect(perSlice[0]).toEqual([]);
    expect(perSlice[1]).toEqual([]);
    expect(perSlice[2]!.map((r) => r.rule_id)).toEqual(['H_S11306']);
  });

  it('非法 ORG 标记（无匹配/形态非法）走 unmounted / gates 拦截', () => {
    const badType = makeRule({ rule_id: 'H1', category: 'mechanical', property_key: 'hardness', rule_type: 'or_choice_group', source_clause: '表5', applies_to_grades: ['ORG:superalloy:OTHERS'] });
    const { unmounted } = mountRulesByGrades([badType], slices());
    expect(unmounted.map((r) => r.rule_id)).toEqual(['H1']);

    // 挂载后残留合法形态标记：白名单校验兼容（不判未知牌号）；非法形态标记被拦截
    const validMarker = makeRule({ rule_id: 'H2', category: 'mechanical', property_key: 'hardness', rule_type: 'or_choice_group', source_clause: '表5', applies_to_grades: ['ORG:austenitic:OTHERS'] });
    const invalidMarker = makeRule({ rule_id: 'H3', category: 'mechanical', property_key: 'hardness', rule_type: 'or_choice_group', source_clause: '表5', applies_to_grades: ['ORG::OTHERS'] });
    const ok = runGates(gateInput({ slices: [makeSlice('S30408', 'austenitic', [validMarker])], declaredFamilies: ['mechanical'] }));
    expect(ok.issues.some((i) => i.code === 'LINT_APPLIES_TO_GRADES')).toBe(false);
    const bad = runGates(gateInput({ slices: [makeSlice('S30408', 'austenitic', [invalidMarker])], declaredFamilies: ['mechanical'] }));
    expect(bad.issues.some((i) => i.code === 'LINT_APPLIES_TO_GRADES' && i.message.includes('ORG::OTHERS'))).toBe(true);
  });
});

describe('项5：表注归属合并（穿透 vision【第 N 页】锚点块）', () => {
  it('表块后的注块合并回表块；无归属表块时保留', () => {
    const blocks: TextBlock[] = [
      { blockType: 'mechanical_table', clauseRef: '表4', text: '表4 力学性能\n1 06Cr19Ni10 S30408 520 205 35' },
      { blockType: 'other', clauseRef: '未锚定', text: '注：热挤压钢管的抗拉强度可降低20 MPa。' },
      { blockType: 'process_ndt_clauses', clauseRef: '7.9', text: '7.9 超声检测' },
      { blockType: 'other', clauseRef: '未锚定', text: '注：本条不属任何表。' },
    ];
    const merged = mergeTableNotes(blocks);
    expect(merged.length).toBe(3);
    expect(merged[0]!.text).toContain('可降低20 MPa');
    expect(merged[1]!.clauseRef).toBe('7.9');
    expect(merged[2]!.text).toBe('注：本条不属任何表。');
    // 幂等：重跑不再变化
    const again = mergeTableNotes(merged);
    expect(again).toEqual(merged);
  });

  it('vision 页锚块可穿透：表块 -> 【第 N 页】 -> 注块，注合并回表块且页锚保留', () => {
    const blocks: TextBlock[] = [
      { blockType: 'mechanical_table', clauseRef: '表4', text: '表4 力学性能\n1 06Cr19Ni10 S30408 520 205 35' },
      { blockType: 'other', clauseRef: '未锚定', text: '【第 2 页】' },
      { blockType: 'other', clauseRef: '未锚定', text: '注1：热挤压钢管的抗拉强度可降低20 MPa。\n注2：表4 注记多行形态。' },
    ];
    const merged = mergeTableNotes(blocks);
    expect(merged.length).toBe(2);
    expect(merged[0]!.clauseRef).toBe('表4');
    expect(merged[0]!.text).toContain('注1：');
    expect(merged[0]!.text).toContain('注2：');
    expect(merged[1]!.text).toBe('【第 2 页】');
  });

  it('非注块（含注前缀行但混有其他内容）不合并；表自身块的注行本就在块内', () => {
    const mixed: TextBlock[] = [
      { blockType: 'mechanical_table', clauseRef: '表4', text: '表4 力学性能\n520 205 35' },
      { blockType: 'other', clauseRef: '7.4', text: '注：折页续行混入正文说明。\n7.4.1 力学性能应符合表4的规定。' },
    ];
    const merged = mergeTableNotes(mixed);
    expect(merged.length).toBe(2);
    expect(merged[0]!.text).not.toContain('折页续行');
  });
});

describe('项2/3 prompt 同步断言', () => {
  it('process prompt 含 expected_visual_result 闭集与定性规则原文双层记录指令（mock 捕获）', async () => {
    const { extractAll } = await import('@/ingestion/llm-extract');
    const contents = new Map<string, string>();
    const chat: import('@/ingestion/types').ChatClient = async (messages, opts) => {
      const content = messages[1]?.content;
      contents.set(opts.task, typeof content === 'string' ? content : '');
      switch (opts.task) {
        case 'meta':
          return JSON.stringify({ standard_id: 'GB/T 13296-2023', standard_name: '试验标准', version: '2023', description: '描述。', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] });
        case 'slices_chemical':
          return JSON.stringify({ slices: [{ spec_key: 'S30408', primary_grade: '06Cr19Ni10', structure_type: 'austenitic', display_name: '06Cr19Ni10 (S30408)', aliases: [], chemical_rules: [{ rule_id: 'CHEM_C', category: 'chemical', property_key: 'C', display_name: 'C含量', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: '表3' }] }] });
        case 'slices_mechanical':
          return JSON.stringify({ slices: [] });
        case 'clauses':
          return JSON.stringify({ clauses: [] });
        case 'process_rules':
        case 'dynamic_formulas':
          return JSON.stringify({ rules: [] });
        case 'tolerance_tables':
          return JSON.stringify({ tables: [] });
        default:
          throw new Error(`未知任务类型: ${opts.task}`);
      }
    };
    const chemBlock: TextBlock = { blockType: 'chemistry_table', clauseRef: '表3', text: '表3 化学成分\n1 06Cr19Ni10 S30408 0.08' };
    const processBlock: TextBlock = { blockType: 'process_ndt_clauses', clauseRef: '7.6.1', text: '7.6.1 压扁' };
    await extractAll([chemBlock, processBlock], chat);
    const prompt = contents.get('process_rules') ?? '';
    expect(prompt).toContain('expected_visual_result 闭集');
    expect(prompt).toContain('NO_CRACKS_OR_SPLITS');
    expect(prompt).toContain('NO_LEAKS');
    expect(prompt).toContain('定性规则原文双层记录');
    expect(prompt).toContain('description（或 criteria.criteria_description）');
  });
});
