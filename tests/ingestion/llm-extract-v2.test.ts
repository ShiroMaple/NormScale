import { describe, it, expect } from 'vitest';
import { extractAll, mountRulesByGrades } from '@/ingestion/llm-extract';
import { buildClauseTextIndex, runGates } from '@/ingestion/gates';
import { DimensionToleranceTableSchema, SpecificationSliceSchema } from '@/schemas/standard.schema';
import type { ChatClient, DraftRule, DraftSlice, TextBlock } from '@/ingestion/types';

/* v2 提取任务专项测试（T4.18-21）：process_rules / dynamic_formulas / tolerance_tables。
   工艺/探伤条款文本片段取自 NB/T 47019.5-2021 真实切块缓存
   （.cache/standard-ingest/e97b0d02e5e10e9e7c239b0dfa2413c3/blocks.json），
   严禁真实 LLM 调用，严禁触碰 data/standards。 */

// 真实切块片段：6.5.1 压扁 / 6.5.2 扩口 / 6.6 水压（含涡流替代）/ 6.8 晶间腐蚀 / 6.10.1.1 超声 U2
const NB_PROCESS_BLOCKS: TextBlock[] = [
  { blockType: 'process_ndt_clauses', clauseRef: '6.5.1', text: '6.5.1 压扁\n壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。' },
  {
    blockType: 'process_ndt_clauses',
    clauseRef: '6.5.2',
    text: '6.5.2 扩口\n6.5.2.1 壁厚不大于 10mm 的无缝管应进行扩口试验。扩口试验的顶心锥度为 60°，扩口后试样的\n外径扩口率应为：奥氏体型管子不小于 18%，铁素体型管子不小于 15%。扩口试验后的试样不应出\n现裂缝或裂口。',
  },
  {
    blockType: 'process_ndt_clauses',
    clauseRef: '6.6',
    text: '6.6 水压试验\n6.6.1 无缝管应逐根进行水压试验，水压试验应符合 NB/T 47019.1—2021 中 7.5 的规定，最大试\n验压力不超过 20MPa，稳压时间不小于 10s。\n6.6.3 经供需双方协商确定，可用涡流检测代替水压试验。无缝管外径≤25mm 的对比样管人工缺陷\n为通孔直径 0.8mm。外径＞25mm 的对比样管，人工缺陷和验收等级应符合 GB/T 7735—2016 中 E2H\n级的规定。',
  },
  { blockType: 'process_ndt_clauses', clauseRef: '6.8', text: '6.8 腐蚀试验\n管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀\n倾向。根据需方要求并在合同中注明，也可采用其他腐蚀试验方法。' },
  { blockType: 'process_ndt_clauses', clauseRef: '6.10.1.1', text: '6.10.1.1 无缝管应逐根进行超声检测，对比样管纵向刻槽深度等级应符合 GB/T 5777—2019 中\nU2 级的规定。' },
];

// 真实切块片段：表1 化学表（含"其他"列 Ti：5（C+N）～0.70，PDF 断行形态）
const NB_CHEM_BLOCK: TextBlock = {
  blockType: 'chemistry_table',
  clauseRef: '表1',
  text: '表 1 钢的牌号和化学成分\n组织\n类型\n序\n号 牌号 统一数字代号\n化学成分（质量分数）\nC Si Mn P S Ni Cr Mo 其他\n奥氏体型\n15 06Cr18Ni11Ti S32168 0.08 1.00 2.00 0.035 0.015 9.00～\n12.00\n17.00～\n19.00 — Ti：5（C+N）～\n0.70\n2 06Cr19Ni10 S30408 0.08 1.00 2.00 0.035 0.015 8.00～\n11.00\n18.00～\n20.00 — —',
};

// 真实切块片段：6.9 晶粒度 / 6.12 表面粗糙度（v2 路由关键字覆盖的族条款）
const NB_SURFACE_BLOCKS: TextBlock[] = [
  { blockType: 'process_ndt_clauses', clauseRef: '6.9', text: '6.9 晶粒度\n07Cr19Ni10、07Cr17Ni12Mo2、07Cr19Ni11Ti、07Cr18Ni11Nb 牌号管子的晶粒度级别为 4 级～7 级。' },
  { blockType: 'process_ndt_clauses', clauseRef: '6.12', text: '6.12 表面粗糙度\n管子内外表面粗糙度 Ra 应符合 NB/T 47019.1—2021 中 7.11.4 的规定。' },
];

const META = {
  standard_id: 'NB/T 47019.5-2021',
  standard_name: '锅炉、热交换器用管订货技术条件 第5部分：不锈钢',
  version: '2021',
  description: '本文件规定了锅炉、热交换器用不锈钢无缝和焊接管的订货技术要求。',
  status: 'CURRENT',
  material_category: 'ferrous_pipe',
  applies_to_forms: ['tube_seamless'],
};

/** 预制工艺/探伤规则（对齐 golden S32168 范式），逐任务可覆盖 */
function createExtractMock(overrides: { processRules?: Record<string, unknown>[]; dynamicFormulas?: Record<string, unknown>[]; toleranceTables?: Record<string, unknown>[] } = {}): ChatClient {
  const processRules = overrides.processRules ?? [
    { rule_id: 'PROC_FLATTENING', category: 'process', property_key: 'flattening_test', display_name: '压扁试验', rule_type: 'dynamic_formula_pass', requirement_level: 'MANDATORY', criteria: { formula_distance_H: '(1 + 0.09) * S / (0.09 + S / D)', expected_visual_result: 'NO_CRACKS', test_standard: 'GB/T 246' }, source_clause: '6.5.1', applies_to_grades: 'ALL' },
    { rule_id: 'PROC_FLARING', category: 'process', property_key: 'flaring_test', display_name: '扩口试验', rule_type: 'qualitative_and_numeric', requirement_level: 'MANDATORY', criteria: { cone_angle_deg: 60, flaring_rate_min_percent: 18, expected_visual_result: 'NO_CRACKS', test_standard: 'GB/T 242' }, source_clause: '6.5.2', applies_to_grades: ['06Cr18Ni11Ti', 'S32168'] },
    { rule_id: 'NDT_TIGHTNESS', category: 'ndt', property_key: 'pressure_tightness', display_name: '致密性/水压试验组', rule_type: 'alternative_group', requirement_level: 'MANDATORY', criteria: { group_logic: 'AT_LEAST_ONE_PASS', candidates: [{ candidate_key: 'hydraulic_test', display_name: '逐根水压试验', test_standard: 'GB/T 241', calc_pressure_formula: 'P = 2SR/D', max_pressure_cap: 20, min_holding_time_s: 10, criteria_description: '试验压力按式计算，最大试验压力不超过 20MPa，稳压时间不小于 10s' }, { candidate_key: 'eddy_current_test', display_name: '涡流探伤替代', test_standard: 'GB/T 7735-2016', required_level: 'E2H', criteria_description: '外径≤25mm 通孔 0.8mm；外径＞25mm 达 E2H 级' }] }, source_clause: '6.6', applies_to_grades: 'ALL' },
    { rule_id: 'CORR_INTERGRANULAR', category: 'corrosion', property_key: 'intergranular_corrosion', display_name: '晶间腐蚀试验', rule_type: 'qualitative_enum', requirement_level: 'MANDATORY', description: '依据 NB/T 47019.5-2021 第6.8条，按 GB/T 4334-2020 方法 E 晶间腐蚀试验无晶间腐蚀倾向', criteria: { method: 'Method_E', test_standard: 'GB/T 4334-2020', expected: 'NO_CORROSION_TREND' }, source_clause: '6.8', applies_to_grades: 'ALL' },
    { rule_id: 'NDT_ULTRASONIC', category: 'ndt', property_key: 'ultrasonic_test', display_name: '超声检测', rule_type: 'qualitative_enum', requirement_level: 'MANDATORY', description: '依据 NB/T 47019.5-2021 第6.10.1.1条，逐根超声检测验收等级 U2', criteria: { required_level: 'U2', test_standard: 'GB/T 5777-2019' }, source_clause: '6.10.1.1', applies_to_grades: 'ALL' },
    { rule_id: 'META_GRAIN_SIZE', category: 'metallographic', property_key: 'grain_size', display_name: '晶粒度', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 4, max: 7, unit: '级' }, source_clause: '6.9', applies_to_grades: ['07Cr19Ni11Ti', '07Cr17Ni12Mo2', '07Cr19Ni11Ti', '07Cr18Ni11Nb'] },
  ];
  const dynamicFormulas = overrides.dynamicFormulas ?? [
    { rule_id: 'CHEM_TI_STABILIZED', category: 'chemical', property_key: 'Ti', display_name: '钛含量 (Ti)', rule_type: 'dynamic_expression', requirement_level: 'MANDATORY', criteria: { formula_min: '5 * (ctx.chemical.C + ctx.chemical.N)', formula_max: null, min: null, max: 0.7, unit: '%', rounding_decimals: 3, note: 'Ti: 5(C+N) ~ 0.70%' }, source_clause: '表1', applies_to_grades: ['06Cr18Ni11Ti'] },
  ];
  const toleranceTables = overrides.toleranceTables ?? [];
  return async (messages, opts) => {
    switch (opts.task) {
      case 'meta':
        return JSON.stringify(META);
      case 'slices_chemical':
        return JSON.stringify({
          slices: [
            { spec_key: 'S32168', primary_grade: '06Cr18Ni11Ti', structure_type: 'austenitic', display_name: '06Cr18Ni11Ti (S32168)', aliases: [], chemical_rules: [{ rule_id: 'CHEM_S32168_C', category: 'chemical', property_key: 'C', display_name: 'C含量 (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: '表1' }] },
            { spec_key: 'S30408', primary_grade: '06Cr19Ni10', structure_type: 'austenitic', display_name: '06Cr19Ni10 (S30408)', aliases: [], chemical_rules: [{ rule_id: 'CHEM_S30408_C', category: 'chemical', property_key: 'C', display_name: 'C含量 (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: '表1' }] },
          ],
        });
      case 'slices_mechanical':
        return JSON.stringify({ slices: [] });
      case 'clauses':
        return JSON.stringify({ clauses: [] });
      case 'process_rules':
        // 逐块调用契约：仅返回所给文本块（【条款号 X】）来源的规则，避免跨块重复挂载
        return JSON.stringify({ rules: processRules.filter((r) => String(messages[1]?.content ?? '').includes(`【条款号 ${(r as { source_clause: string }).source_clause}】`)) });
      case 'dynamic_formulas':
        return JSON.stringify({ rules: dynamicFormulas });
      case 'tolerance_tables':
        return JSON.stringify({ tables: toleranceTables });
      default:
        throw new Error(`未知任务类型: ${opts.task}`);
    }
  };
}

describe('S2 v2：process_rules 提取与 applies_to_grades 确定性展开（真实 NB 切块片段）', () => {
  it('rule_type 结构合法；ALL 挂全部切片，限定牌号只挂对应切片，rule_id 追加 _{spec_key}', async () => {
    const blocks = [NB_CHEM_BLOCK, ...NB_PROCESS_BLOCKS, ...NB_SURFACE_BLOCKS];
    const drafts = await extractAll(blocks, createExtractMock());

    expect(drafts.slices.length).toBe(2);
    const byKey = new Map(drafts.slices.map((s) => [s.spec_key, s]));
    const s32168 = byKey.get('S32168')!;
    const s30408 = byKey.get('S30408')!;

    // 挂载产物通过切片契约校验（EvaluationRuleSchema 的 rule_type 枚举在内）
    expect(() => SpecificationSliceSchema.parse({ ...s32168, evaluation_rules: s32168.evaluation_rules.map(({ source_clause: _s, applies_to_grades: _a, ...r }) => r) })).not.toThrow();

    const ids = (s: DraftSlice) => s.evaluation_rules.map((r) => r.rule_id);
    // ALL 规则展开到全部切片（含 ndt/corrosion/process 族）
    for (const slice of [s32168, s30408]) {
      const key = slice.spec_key;
      expect(ids(slice)).toContain(`PROC_FLATTENING_${key}`);
      expect(ids(slice)).toContain(`NDT_TIGHTNESS_${key}`);
      expect(ids(slice)).toContain(`CORR_INTERGRANULAR_${key}`);
      expect(ids(slice)).toContain(`NDT_ULTRASONIC_${key}`);
    }
    // 限定牌号（牌号或统一代号均可匹配）：扩口只挂 06Cr18Ni11Ti/S32168 切片
    expect(ids(s32168)).toContain('PROC_FLARING_S32168');
    expect(ids(s30408)).not.toContain('PROC_FLARING_S30408');
    // 晶粒度限定四个 07 系牌号 -> 当前切片全集无匹配：确定性法条模式（NB 6.9 句式）产出
    // DET_GRAIN_SIZE 经挂载未命中移交 unmounted（不静默丢弃；原 LLM META_GRAIN_SIZE 规则随块剔除不再产出）
    expect(drafts.unmounted_rules?.some((r) => r.rule_id === 'DET_GRAIN_SIZE')).toBe(true);

    // 结构断言：替代组携带 calc_pressure_formula/max_pressure_cap，定性枚举携带 method/required_level
    const tightness = s32168.evaluation_rules.find((r) => r.rule_id === 'NDT_TIGHTNESS_S32168')!;
    expect(tightness.rule_type).toBe('alternative_group');
    expect(tightness.criteria.candidates).toMatchObject([
      { candidate_key: 'hydraulic_test', calc_pressure_formula: 'P = 2SR/D', max_pressure_cap: 20, min_holding_time_s: 10 },
      { candidate_key: 'eddy_current_test', required_level: 'E2H' },
    ]);
    expect(s32168.evaluation_rules.find((r) => r.rule_id === 'CORR_INTERGRANULAR_S32168')!.criteria.method).toBe('Method_E');
    expect(s32168.evaluation_rules.find((r) => r.rule_id === 'NDT_ULTRASONIC_S32168')!.criteria.required_level).toBe('U2');
    const flaring = s32168.evaluation_rules.find((r) => r.rule_id === 'PROC_FLARING_S32168')!;
    expect(flaring.rule_type).toBe('qualitative_and_numeric');
    expect(flaring.criteria).toMatchObject({ cone_angle_deg: 60, flaring_rate_min_percent: 18, expected_visual_result: 'NO_CRACKS' });
    // 挂载后仍保留 applies_to_grades 供 S3 白名单校验（落盘时剥离）
    expect(tightness.applies_to_grades).toEqual(['ALL']);
    expect(flaring.applies_to_grades).toEqual(['06Cr18Ni11Ti', 'S32168']);
  });

  it('挂载规则过全量溯源门禁：数值与公式常量均在真实原文片段中字面出现', async () => {
    const blocks = [NB_CHEM_BLOCK, ...NB_PROCESS_BLOCKS, ...NB_SURFACE_BLOCKS];
    const drafts = await extractAll(blocks, createExtractMock());
    const clauseTextIndex = buildClauseTextIndex(blocks);
    // 晶粒度规则因限定牌号（07 系四牌号）不在当前切片全集被 unmounted 拦截：
    // 挂载规则溯源断言全绿（本用例聚焦挂载规则，unmounted 拦截由 gates 专项覆盖）
    const gate = runGates({
      meta: drafts.meta,
      slices: drafts.slices,
      clauses: drafts.clauses,
      clauseTextIndex,
      expectedGradeRows: null,
      declaredFamilies: ['chemical', 'process', 'corrosion', 'ndt'],
      toleranceTables: drafts.tolerance_tables,
      unmountedRules: [],
    });
    expect(gate.issues.filter((i) => i.code === 'TRACE_NUMBER_LITERAL' || i.code === 'TRACE_FORMULA_LITERAL' || i.code === 'LINT_FORMULA')).toEqual([]);
    expect(gate.passed).toBe(true);
  });
});

describe('S2 v2：dynamic_formulas 提取（真实表1 Ti 公式片段）', () => {
  it('Ti ≥ 5×(C+N) 公式解析、挂载并过公式 lint 与数值溯源', async () => {
    const blocks = [NB_CHEM_BLOCK];
    const drafts = await extractAll(blocks, createExtractMock());
    const s32168 = drafts.slices.find((s) => s.spec_key === 'S32168')!;
    const tiRule = s32168.evaluation_rules.find((r) => r.rule_id === 'CHEM_TI_STABILIZED_S32168')!;
    expect(tiRule.rule_type).toBe('dynamic_expression');
    expect(tiRule.property_key).toBe('Ti');
    expect(tiRule.criteria.formula_min).toBe('5 * (ctx.chemical.C + ctx.chemical.N)');
    expect(tiRule.criteria.max).toBe(0.7);
    expect(tiRule.criteria.rounding_decimals).toBe(3);

    const gate = runGates({
      meta: drafts.meta,
      slices: drafts.slices,
      clauses: [],
      clauseTextIndex: buildClauseTextIndex(blocks),
      expectedGradeRows: null,
      declaredFamilies: ['chemical'],
      unmountedRules: [],
    });
    expect(gate.issues.filter((i) => i.code === 'LINT_FORMULA' || i.code === 'TRACE_FORMULA_LITERAL')).toEqual([]);
  });

  it('白名单外变量（ctx.header.X）被公式 lint 拦截', async () => {
    const blocks = [NB_CHEM_BLOCK];
    const drafts = await extractAll(blocks, createExtractMock({
      dynamicFormulas: [{ rule_id: 'CHEM_TI_STABILIZED', category: 'chemical', property_key: 'Ti', display_name: '钛含量 (Ti)', rule_type: 'dynamic_expression', requirement_level: 'MANDATORY', criteria: { formula_min: 'ctx.header.X * 5', formula_max: null, min: null, max: 0.7, unit: '%', rounding_decimals: 3 }, source_clause: '表1', applies_to_grades: ['06Cr18Ni11Ti'] }],
    }));
    const gate = runGates({
      meta: drafts.meta,
      slices: drafts.slices,
      clauses: [],
      clauseTextIndex: buildClauseTextIndex(blocks),
      expectedGradeRows: null,
      declaredFamilies: ['chemical'],
      unmountedRules: [],
    });
    expect(gate.issues.some((i) => i.code === 'LINT_FORMULA' && i.message.includes('ctx.header.X'))).toBe(true);
  });

  it('公式常量溯源缺失（0.80 未在原文出现）被拒', async () => {
    const blocks = [NB_CHEM_BLOCK];
    const drafts = await extractAll(blocks, createExtractMock({
      dynamicFormulas: [{ rule_id: 'CHEM_TI_STABILIZED', category: 'chemical', property_key: 'Ti', display_name: '钛含量 (Ti)', rule_type: 'dynamic_expression', requirement_level: 'MANDATORY', criteria: { formula_min: '0.8 * (ctx.chemical.C + ctx.chemical.N)', formula_max: null, min: null, max: 0.7, unit: '%', rounding_decimals: 3 }, source_clause: '表1', applies_to_grades: ['06Cr18Ni11Ti'] }],
    }));
    const gate = runGates({
      meta: drafts.meta,
      slices: drafts.slices,
      clauses: [],
      clauseTextIndex: buildClauseTextIndex(blocks),
      expectedGradeRows: null,
      declaredFamilies: ['chemical'],
      unmountedRules: [],
    });
    expect(gate.issues.some((i) => i.code === 'TRACE_FORMULA_LITERAL' && i.message.includes('0.8'))).toBe(true);
  });
});

describe('S2 v2：tolerance_tables 提取（阶梯表 + 跨标准外部引用）', () => {
  const TOLERANCE_BLOCK: TextBlock = {
    blockType: 'tolerance_table',
    clauseRef: '表1',
    text: '表 1 钢管公称外径的允许偏差\n钢管公称尺寸 mm 允许偏差\n6~38 ±0.40\n38~50 ±0.50',
  };

  const STEPPED_TABLE = {
    table_id: 'TABLE_1',
    table_name: '表1 钢管公称外径的允许偏差',
    rules: [
      { dimension_property: 'outer_diameter', process: 'cold_drawn', delivery_mode: 'min_wall', range_min: 6, range_max: 38, plus_tolerance_value: 0.4, plus_tolerance_is_percent: false, minus_tolerance_value: -0.4, minus_tolerance_is_percent: false, note: '外径 6~38mm：±0.40mm' },
      { dimension_property: 'outer_diameter', process: 'cold_drawn', delivery_mode: 'min_wall', range_min: 38, range_max: 50, plus_tolerance_value: 0.5, plus_tolerance_is_percent: false, minus_tolerance_value: -0.5, minus_tolerance_is_percent: false, note: '外径 38~50mm：±0.50mm' },
    ],
  };

  it('正常阶梯表提取：结构对齐 DimensionToleranceTableSchema，来源锚点保留供溯源', async () => {
    const blocks = [NB_CHEM_BLOCK, TOLERANCE_BLOCK];
    const drafts = await extractAll(blocks, createExtractMock({ toleranceTables: [STEPPED_TABLE] }));
    expect(drafts.tolerance_tables.length).toBe(1);
    const table = drafts.tolerance_tables[0]!;
    expect(table.source_block).toBe('表1');
    expect(table.rules.length).toBe(2);
    expect(() => DimensionToleranceTableSchema.parse({ table_id: table.table_id, table_name: table.table_name, rules: table.rules })).not.toThrow();

    const gate = runGates({
      meta: drafts.meta,
      slices: drafts.slices,
      clauses: [],
      clauseTextIndex: buildClauseTextIndex(blocks),
      expectedGradeRows: null,
      declaredFamilies: ['chemical'],
      toleranceTables: drafts.tolerance_tables,
      unmountedRules: [],
    });
    expect(gate.issues.filter((i) => i.code === 'LINT_TOLERANCE_TABLE' || i.code === 'EXTERNAL_TOLERANCE_REFERENCE')).toEqual([]);
  });

  it('外部引用（NB/T 47019.1 表2）：rules 为空不产生臆造数据，门禁产生 MANUAL_REVIEW 级 issue', async () => {
    const blocks = [NB_CHEM_BLOCK, TOLERANCE_BLOCK];
    const drafts = await extractAll(blocks, createExtractMock({
      toleranceTables: [{ table_id: 'NB_T_47019_1_TABLE_2', table_name: 'NB/T 47019.1 表2 冷拔(轧)无缝管公称外径允许偏差', external_reference: 'NB/T 47019.1 表2', rules: [] }],
    }));
    const table = drafts.tolerance_tables[0]!;
    expect(table.external_reference).toBe('NB/T 47019.1 表2');
    expect(table.rules).toEqual([]);

    const gate = runGates({
      meta: drafts.meta,
      slices: drafts.slices,
      clauses: [],
      clauseTextIndex: buildClauseTextIndex(blocks),
      expectedGradeRows: null,
      declaredFamilies: ['chemical'],
      toleranceTables: drafts.tolerance_tables,
      unmountedRules: [],
    });
    expect(gate.issues.some((i) => i.code === 'EXTERNAL_TOLERANCE_REFERENCE' && i.message.includes('NB/T 47019.1 表2'))).toBe(true);
    expect(gate.requiresManualReview).toBe(true);
  });
});

describe('S2 v2：mountRulesByGrades 纯函数展开', () => {
  const slices: DraftSlice[] = [
    { spec_key: 'S32168', primary_grade: '06Cr18Ni11Ti', display_name: '06Cr18Ni11Ti (S32168)', evaluation_rules: [] },
    { spec_key: 'S30408', primary_grade: '06Cr19Ni10', display_name: '06Cr19Ni10 (S30408)', evaluation_rules: [] },
  ];
  const baseRule = (applies: string[]): DraftRule => ({
    rule_id: 'PROC_X',
    category: 'process',
    property_key: 'x',
    display_name: 'X',
    rule_type: 'qualitative_pass',
    criteria: {},
    source_clause: '6.5.1',
    applies_to_grades: applies,
  });

  it('ALL 展开到全部切片且 rule_id 追加 spec_key 保证唯一', () => {
    const { perSlice, unmounted } = mountRulesByGrades([baseRule(['ALL'])], slices);
    expect(unmounted).toEqual([]);
    expect(perSlice[0]!.map((r) => r.rule_id)).toEqual(['PROC_X_S32168']);
    expect(perSlice[1]!.map((r) => r.rule_id)).toEqual(['PROC_X_S30408']);
  });

  it('牌号/统一代号匹配：primary_grade 与 spec_key 令牌均可命中', () => {
    const { perSlice, unmounted } = mountRulesByGrades([baseRule(['06Cr19Ni10'])], slices);
    expect(unmounted).toEqual([]);
    expect(perSlice[0]!).toEqual([]);
    expect(perSlice[1]!.length).toBe(1);
    const { perSlice: perSlice2 } = mountRulesByGrades([baseRule(['S32168'])], slices);
    expect(perSlice2[0]!.length).toBe(1);
    expect(perSlice2[1]!).toEqual([]);
  });

  it('无匹配牌号进入 unmounted（移交 S3 拦截，不静默丢弃）', () => {
    const { perSlice, unmounted } = mountRulesByGrades([baseRule(['S00000'])], slices);
    expect(perSlice[0]!).toEqual([]);
    expect(perSlice[1]!).toEqual([]);
    expect(unmounted.map((r) => r.rule_id)).toEqual(['PROC_X']);
  });
});
