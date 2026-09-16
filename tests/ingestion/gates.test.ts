import { describe, it, expect } from 'vitest';
import { runGates, buildClauseTextIndex } from '@/ingestion/gates';
import type { GateInput } from '@/ingestion/gates';
import type { DraftRule, DraftSlice, TextBlock } from '@/ingestion/types';

/* 溯源断言用原文索引（数值字面取自其中） */
const CLAUSE_TEXT_INDEX: Record<string, string> = {
  表1: '表1 钢的牌号和化学成分\n15 06Cr18Ni11Ti S32168 0.08 1.00 2.00 0.035 0.015 9.00～12.00 17.00～19.00 — Ti：5（C+N）～0.70',
  表2: '表2 钢的牌号和化学成分\n1 06Cr19Ni10 S30408 0.08 1.00 2.00 0.035 0.015 8.00~11.00 18.00~20.00\n2 022Cr19Ni10 S30403 0.030 1.00 2.00 0.035 0.015 8.00~12.00 18.00~20.00',
  表3: '表3 室温力学性能\n1 06Cr19Ni10 S30408 520 205 35\n2 022Cr19Ni10 S30403 480 175 35',
  '6.5.1': '6.5.1 压扁\n壁厚不大于 10mm 的管子应按 NB/T 47019.1 的规定进行压扁试验。',
  '6.8': '6.8 腐蚀试验\n管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀倾向。',
  '6.9': '6.9 晶粒度\n07Cr19Ni10、07Cr17Ni12Mo2、07Cr19Ni11Ti、07Cr18Ni11Nb 牌号管子的晶粒度级别为 4 级～7 级。',
  '6.10.1.1': '6.10.1.1 无缝管应逐根进行超声检测，对比样管纵向刻槽深度等级应符合 GB/T 5777—2019 中U2级的规定。',
  '6.12': '6.12 表面粗糙度\n管子内外表面粗糙度 Ra 应不大于 0.8μm，并符合 NB/T 47019.1—2021 中 7.11.4 的规定。',
  '7.5.1': '7.5.1 钢管应逐根进行液压试验，最大试验压力不超过 20 MPa，稳压时间不少于 10s。',
};

function makeRule(overrides: Partial<DraftRule> = {}): DraftRule {
  return {
    rule_id: 'CHEM_S30408_C',
    category: 'chemical',
    property_key: 'C',
    display_name: 'C含量 (C)',
    rule_type: 'numeric_range',
    requirement_level: 'MANDATORY',
    criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 },
    source_clause: '表2',
    ...overrides,
  };
}

// v2 全量七族规则基线：覆盖 chemical/mechanical/process/metallographic/corrosion/ndt/surface，
// 与 gates 缺省声明族（FULL_RULE_FAMILIES）对齐，数值均可溯源至 CLAUSE_TEXT_INDEX
function makeFullFamilyRules(): DraftRule[] {
  return [
    makeRule(),
    makeRule({ rule_id: 'MECH_S30408_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', criteria: { min: 520, max: null, unit: 'MPa' }, source_clause: '表3' }),
    makeRule({ rule_id: 'MECH_S30408_RP02', category: 'mechanical', property_key: 'yield_strength_rp02', display_name: '规定塑性延伸强度 (Rp0.2)', criteria: { min: 205, max: null, unit: 'MPa' }, source_clause: '表3' }),
    makeRule({
      rule_id: 'PROC_S30408_FLATTENING',
      category: 'process',
      property_key: 'flattening',
      display_name: '压扁试验',
      rule_type: 'dynamic_formula_pass',
      criteria: { formula_distance_H: '(1 + 0.09) * S / (0.09 + S / D)', expected_visual_result: 'NO_CRACKS', test_standard: 'GB/T 246' },
      source_clause: '6.5.1',
    }),
    makeRule({
      rule_id: 'META_S30408_GRAIN_SIZE',
      category: 'metallographic',
      property_key: 'grain_size',
      display_name: '晶粒度',
      criteria: { min: 4, max: 7, unit: '级' },
      source_clause: '6.9',
    }),
    makeRule({
      rule_id: 'CORR_S30408_INTERGRANULAR',
      category: 'corrosion',
      property_key: 'intergranular_corrosion',
      display_name: '晶间腐蚀试验',
      rule_type: 'qualitative_enum',
      criteria: { method: 'Method_E', test_standard: 'GB/T 4334-2020', expected: 'NO_CORROSION_TREND' },
      source_clause: '6.8',
    }),
    makeRule({
      rule_id: 'NDT_S30408_ULTRASONIC',
      category: 'ndt',
      property_key: 'ultrasonic_test',
      display_name: '超声检测',
      rule_type: 'qualitative_enum',
      criteria: { required_level: 'U2', test_standard: 'GB/T 5777-2019' },
      source_clause: '6.10.1.1',
    }),
    makeRule({
      rule_id: 'SURF_S30408_ROUGHNESS',
      category: 'surface',
      property_key: 'surface_roughness',
      display_name: '表面粗糙度 (Ra)',
      requirement_level: 'OPTIONAL_AGREED',
      criteria: { min: null, max: 0.8, unit: 'μm', rounding_decimals: 2 },
      source_clause: '6.12',
    }),
  ];
}

function makeSlice(overrides: Partial<DraftSlice> = {}): DraftSlice {
  return {
    spec_key: 'S30408',
    spec_type: 'grade',
    standard_code: 'GB/T 99999-2024',
    display_name: '06Cr19Ni10 (S30408) 不锈钢管',
    primary_grade: '06Cr19Ni10',
    structure_type: 'austenitic',
    description: 'GB/T 99999-2024 表2/表3 试验切片',
    aliases: [],
    evaluation_rules: makeFullFamilyRules(),
    ...overrides,
  };
}

function makeGateInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    meta: {
      standard_id: 'GB/T 99999-2024',
      standard_name: '试验用不锈钢无缝钢管标准',
      version: '2024',
      description: '本文件适用于锅炉、热交换器用不锈钢无缝钢管。',
      status: 'CURRENT',
      material_category: 'ferrous_pipe',
      applies_to_forms: ['tube_seamless'],
    },
    slices: [makeSlice()],
    clauses: [{ clause_id: '7.5.1', title: '液压试验', text: '钢管应逐根进行液压试验。', source_block: '7.5.1' }],
    clauseTextIndex: { ...CLAUSE_TEXT_INDEX },
    expectedGradeRows: 1,
    ...overrides,
  };
}

describe('S3 质量门禁：全绿基线', () => {
  it('合法草稿全部门禁通过', () => {
    const result = runGates(makeGateInput());
    expect(result.issues).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.requiresManualReview).toBe(false);
  });

  it('数值字面出现在原文（含空白噪声）即通过溯源断言', () => {
    // 原文中 "8.00~11.00" 被 PDF 提取断行，断言需容忍空白
    const index = { 表2: '表2 化学成分\n1 06Cr19Ni10 S30408 0.08 8.00~\n11.00', 表3: CLAUSE_TEXT_INDEX['表3']! };
    const result = runGates(
      makeGateInput({
        slices: [
          makeSlice({
            evaluation_rules: [
              makeRule({ criteria: { min: 8, max: 11, unit: '%' } }),
              makeRule({ rule_id: 'MECH_S30408_RM', category: 'mechanical', property_key: 'tensile_strength', criteria: { min: 520, max: null, unit: 'MPa' }, source_clause: '表3' }),
            ],
          }),
        ],
        clauseTextIndex: index,
        declaredFamilies: ['chemical', 'mechanical'],
        expectedGradeRows: 1,
      }),
    );
    expect(result.passed).toBe(true);
  });
});

describe('S3 质量门禁：Zod 契约校验', () => {
  it('meta 契约失败报 SCHEMA', () => {
    const result = runGates(makeGateInput({ meta: { standard_id: 123 } as unknown as Record<string, unknown> }));
    expect(result.issues.some((i) => i.code === 'SCHEMA')).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.requiresManualReview).toBe(true);
  });

  it('切片规则类别非法报 SCHEMA', () => {
    const bad = makeSlice({ evaluation_rules: [makeRule({ category: 'magic' })] });
    const result = runGates(makeGateInput({ slices: [bad] }));
    expect(result.issues.some((i) => i.code === 'SCHEMA')).toBe(true);
  });
});

describe('S3 质量门禁：领域 linter', () => {
  it('numeric min > max 被拒', () => {
    const slice = makeSlice({ evaluation_rules: [makeRule({ criteria: { min: 0.1, max: 0.05, unit: '%' } })] });
    const result = runGates(makeGateInput({ slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'LINT_NUMERIC_RANGE')).toBe(true);
  });

  it('化学成分数值超出 [0,100] 被拒', () => {
    const slice = makeSlice({ evaluation_rules: [makeRule({ criteria: { min: null, max: 120, unit: '%' } })] });
    const result = runGates(makeGateInput({ slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'LINT_CHEMICAL_BOUND')).toBe(true);
  });

  it('rule_id 全局重复被拒（跨切片）', () => {
    const other = makeSlice({ spec_key: 'S30403', display_name: '022Cr19Ni10 (S30403)', primary_grade: '022Cr19Ni10' });
    other.evaluation_rules = [makeRule({ rule_id: 'CHEM_S30408_C' })];
    const result = runGates(makeGateInput({ slices: [makeSlice(), other] }));
    expect(result.issues.some((i) => i.code === 'LINT_DUP_RULE_ID')).toBe(true);
  });

  it('单位不在白名单被拒', () => {
    const slice = makeSlice({ evaluation_rules: [makeRule({ criteria: { min: 520, max: null, unit: 'Furlong' } })] });
    const result = runGates(makeGateInput({ slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'LINT_UNIT')).toBe(true);
  });

  it('切片缺少 mechanical 类别被拒', () => {
    const slice = makeSlice({ evaluation_rules: [makeRule()] });
    const result = runGates(makeGateInput({ slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'LINT_CATEGORY_COVERAGE')).toBe(true);
  });
});

describe('S3 质量门禁：中文标准文本字段语言一致性', () => {
  it('中文标准切片 display_name 被译为英文（无 CJK）被拒', () => {
    const slice = makeSlice({ display_name: 'Austenitic stainless steel tube' });
    const result = runGates(makeGateInput({ slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'LINT_LANGUAGE_CONSISTENCY' && i.message.includes('display_name'))).toBe(true);
    expect(result.requiresManualReview).toBe(true);
  });

  it('中文标准 meta.standard_name 无 CJK 被拒', () => {
    const meta = { ...makeGateInput().meta, standard_name: 'Seamless stainless steel tubes for boiler' };
    const result = runGates(makeGateInput({ meta }));
    expect(result.issues.some((i) => i.code === 'LINT_LANGUAGE_CONSISTENCY' && i.message.includes('standard_name'))).toBe(true);
  });

  it('中文标准 description 无 CJK 被拒（meta 与切片同时检查）', () => {
    const meta = { ...makeGateInput().meta, description: 'This standard specifies technical requirements.' };
    const slice = makeSlice({ description: 'Grade slice for test only.' });
    const result = runGates(makeGateInput({ meta, slices: [slice] }));
    const langIssues = result.issues.filter((i) => i.code === 'LINT_LANGUAGE_CONSISTENCY');
    expect(langIssues.some((i) => i.message.includes('meta.description'))).toBe(true);
    expect(langIssues.some((i) => i.message.includes('切片') && i.message.includes('description'))).toBe(true);
  });

  it('非中文标准（如 ASTM）不适用 CJK lint', () => {
    const meta = {
      ...makeGateInput().meta,
      standard_id: 'ASTM A999-24',
      standard_name: 'Seamless stainless steel tubes',
      description: 'Standard specification for test purposes.',
    };
    const slice = makeSlice({ display_name: 'S30400 (304)', description: 'Grade slice.' });
    const result = runGates(makeGateInput({ meta, slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'LINT_LANGUAGE_CONSISTENCY')).toBe(false);
  });

  it('description 缺省/为空时跳过语言 lint（只 lint 实际给出的文本）', () => {
    const meta = { ...makeGateInput().meta, description: undefined };
    const slice = makeSlice({ description: undefined });
    const result = runGates(makeGateInput({ meta, slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'LINT_LANGUAGE_CONSISTENCY')).toBe(false);
  });
});

describe('S3 质量门禁：切片关键字段 strict 必填', () => {
  it.each(['spec_type', 'standard_code', 'description', 'display_name'] as const)('切片缺少 %s 报 LINT_REQUIRED_FIELDS（Zod 缺省不兜底）', (field) => {
    const slice = makeSlice();
    delete (slice as unknown as Record<string, unknown>)[field];
    const result = runGates(makeGateInput({ slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'LINT_REQUIRED_FIELDS' && i.message.includes(field))).toBe(true);
    expect(result.passed).toBe(false);
  });
});

describe('S3 质量门禁：property_key 注册表（命名漂移防护）', () => {
  it('注册表外的 property_key 报 LINT_PROPERTY_KEY_REGISTRY', () => {
    const slice = makeSlice({
      evaluation_rules: [
        makeRule(),
        makeRule({ rule_id: 'MECH_S30408_RM', category: 'mechanical', property_key: 'tensile_str', display_name: '抗拉强度 (Rm)', criteria: { min: 520, max: null, unit: 'MPa' }, source_clause: '表3' }),
      ],
    });
    const result = runGates(makeGateInput({ slices: [slice], declaredFamilies: ['chemical', 'mechanical'], propertyKeyRegistry: ['C', 'tensile_strength', 'yield_strength_rp02'] }));
    expect(result.issues.some((i) => i.code === 'LINT_PROPERTY_KEY_REGISTRY' && i.message.includes('tensile_str'))).toBe(true);
    expect(result.requiresManualReview).toBe(true);
  });

  it('命中注册表的 key 通过；命中即放行其余检查', () => {
    const result = runGates(
      makeGateInput({
        propertyKeyRegistry: new Set([
          'C', 'tensile_strength', 'yield_strength_rp02', 'elongation_A',
          'flattening', 'grain_size', 'intergranular_corrosion', 'ultrasonic_test', 'surface_roughness',
        ]),
      }),
    );
    expect(result.issues.some((i) => i.code === 'LINT_PROPERTY_KEY_REGISTRY')).toBe(false);
    expect(result.passed).toBe(true);
  });

  it('注册表为空（全新标准库）时跳过 lint，品类扩张合法', () => {
    const slice = makeSlice({
      evaluation_rules: [makeRule({ property_key: 'brand_new_key' }), makeRule({ rule_id: 'MECH_S30408_RM', category: 'mechanical', property_key: 'tensile_strength', criteria: { min: 520, max: null, unit: 'MPa' }, source_clause: '表3' })],
    });
    const result = runGates(makeGateInput({ slices: [slice], declaredFamilies: ['chemical', 'mechanical'], propertyKeyRegistry: [] }));
    expect(result.issues.some((i) => i.code === 'LINT_PROPERTY_KEY_REGISTRY')).toBe(false);
  });

  it('未提供注册表时跳过 lint（纯函数缺省行为不变）', () => {
    const result = runGates(makeGateInput());
    expect(result.issues.some((i) => i.code === 'LINT_PROPERTY_KEY_REGISTRY')).toBe(false);
  });
});

describe('S3 质量门禁：类别覆盖由声明规则族驱动', () => {
  it('declaredFamilies 只声明 chemical 时，缺 mechanical 不拦截', () => {
    const slice = makeSlice({ evaluation_rules: [makeRule()] });
    const result = runGates(makeGateInput({ slices: [slice], declaredFamilies: ['chemical'] }));
    expect(result.issues.some((i) => i.code === 'LINT_CATEGORY_COVERAGE')).toBe(false);
    expect(result.passed).toBe(true);
  });

  it('declaredFamilies 扩充到 process 且全库零 process 规则时，按整族漏提拦截（标准级检查）', () => {
    // 仅含 chemical+mechanical 的切片，声明三族 -> process 在全库零规则，整族漏提被拦截
    const slice = makeSlice({
      evaluation_rules: [
        makeRule(),
        makeRule({ rule_id: 'MECH_S30408_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', criteria: { min: 520, max: null, unit: 'MPa' }, source_clause: '表3' }),
      ],
    });
    const result = runGates(makeGateInput({ slices: [slice], declaredFamilies: ['chemical', 'mechanical', 'process'] }));
    const coverage = result.issues.find((i) => i.code === 'LINT_CATEGORY_COVERAGE');
    expect(coverage).toBeDefined();
    expect(coverage!.message).toContain('process');
    expect(coverage!.message).toContain('零规则');
  });

  it('条件适用族仅在部分切片存在时不逐切片拦截（晶粒度仅 07 系四牌号场景）', () => {
    // metallographic 仅一个切片持有：合法的条件适用，不得产生覆盖 issue
    const withGrain = makeSlice({
      evaluation_rules: [
        makeRule(),
        makeRule({ rule_id: 'MECH_S30408_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', criteria: { min: 520, max: null, unit: 'MPa' }, source_clause: '表3' }),
        makeRule({ rule_id: 'METALLO_S30409_GRAIN', category: 'metallographic', property_key: 'grain_size', display_name: '晶粒度级别', criteria: { min: 4, max: 7, unit: '级' }, source_clause: '6.9' }),
      ],
    });
    const withoutGrain = makeSlice({
      spec_key: 'S32168',
      primary_grade: '06Cr18Ni11Ti',
      evaluation_rules: [
        makeRule({ rule_id: 'CHEM_S32168_C' }),
        makeRule({ rule_id: 'MECH_S32168_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', criteria: { min: 520, max: null, unit: 'MPa' }, source_clause: '表3' }),
      ],
    });
    const result = runGates(makeGateInput({ slices: [withGrain, withoutGrain], declaredFamilies: ['chemical', 'mechanical', 'metallographic'] }));
    expect(result.issues.filter((i) => i.code === 'LINT_CATEGORY_COVERAGE')).toEqual([]);
  });

  it('declaredFamilies 为空数组时回退缺省 v2 全量七族', () => {
    const slice = makeSlice({ evaluation_rules: [makeRule()] });
    const result = runGates(makeGateInput({ slices: [slice], declaredFamilies: [] }));
    expect(result.issues.some((i) => i.code === 'LINT_CATEGORY_COVERAGE' && i.message.includes('mechanical'))).toBe(true);
    // v2 全量缺省：ndt/surface 等其余新族同样被声明，一并拦截
    expect(result.issues.some((i) => i.code === 'LINT_CATEGORY_COVERAGE' && i.message.includes('ndt'))).toBe(true);
    expect(result.issues.some((i) => i.code === 'LINT_CATEGORY_COVERAGE' && i.message.includes('surface'))).toBe(true);
  });
});

describe('S3 质量门禁：溯源断言（防幻觉）', () => {
  it('数值不在声明来源条款原文中 -> 判幻觉拒绝', () => {
    const slice = makeSlice({ evaluation_rules: [makeRule({ criteria: { min: null, max: 0.09, unit: '%' } })] });
    const result = runGates(makeGateInput({ slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'TRACE_NUMBER_LITERAL' && i.message.includes('0.09'))).toBe(true);
    expect(result.requiresManualReview).toBe(true);
  });

  it('声明的 source_clause 在原文切块中不存在 -> 拒绝', () => {
    const slice = makeSlice({ evaluation_rules: [makeRule({ source_clause: '表9' })] });
    const result = runGates(makeGateInput({ slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'TRACE_SOURCE_CLAUSE')).toBe(true);
  });

  it('缺少 source_clause -> 拒绝', () => {
    const { source_clause: _sourceClause, ...ruleWithoutSource } = makeRule();
    const slice = makeSlice({ evaluation_rules: [ruleWithoutSource as DraftRule] });
    const result = runGates(makeGateInput({ slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'TRACE_SOURCE_CLAUSE')).toBe(true);
  });

  it('两级溯源①：声明条款块未命中但全文档拼接文本命中 -> WARN（块边界漂移），passed 仍 true', () => {
    // 模拟跨页续表：值 515 存在于全文档（表4 续块），但声明条款"表4"索引只剩残段
    const index = { 表4: '表4 力学性能（续前页）\n组织类型 牌号 Rm Rp0.2 A' };
    const fullDocumentText = '表4 力学性能\n16 S31653 022Cr17Ni12Mo2N 515 205 35\n表4 力学性能（续前页）\n组织类型 牌号 Rm Rp0.2 A';
    const slice = makeSlice({
      evaluation_rules: [
        makeRule({ rule_id: 'MECH_S31653_RM', category: 'mechanical', property_key: 'tensile_strength', criteria: { min: 515, max: null, unit: 'MPa' }, source_clause: '表4' }),
      ],
    });
    const result = runGates(makeGateInput({ slices: [slice], clauseTextIndex: index, declaredFamilies: ['mechanical'], fullDocumentText }));
    const warnIssue = result.issues.find((i) => i.code === 'TRACE_BLOCK_BOUNDARY');
    expect(warnIssue).toBeDefined();
    expect(warnIssue!.severity).toBe('WARN');
    expect(warnIssue!.message).toContain('块边界漂移');
    expect(result.issues.some((i) => i.code === 'TRACE_NUMBER_LITERAL')).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.requiresManualReview).toBe(false);
  });

  it('两级溯源②：声明条款与全文档拼接文本均未命中 -> 维持 ERROR（真幻觉）', () => {
    const index = { 表4: '表4 力学性能\n1 06Cr19Ni10 S30408 520 205 35' };
    const fullDocumentText = '表4 力学性能\n1 06Cr19Ni10 S30408 520 205 35\n7.4 力学性能';
    const slice = makeSlice({
      evaluation_rules: [
        makeRule({ rule_id: 'MECH_X_RM', category: 'mechanical', property_key: 'tensile_strength', criteria: { min: 999, max: null, unit: 'MPa' }, source_clause: '表4' }),
      ],
    });
    const result = runGates(makeGateInput({ slices: [slice], clauseTextIndex: index, declaredFamilies: ['mechanical'], fullDocumentText }));
    expect(result.issues.some((i) => i.code === 'TRACE_NUMBER_LITERAL' && i.severity === 'ERROR')).toBe(true);
    expect(result.issues.some((i) => i.code === 'TRACE_BLOCK_BOUNDARY')).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('两级溯源③：未提供全文档文本时保持单级行为（未命中即 ERROR）', () => {
    const index = { 表4: '表4 力学性能（续前页）' };
    const slice = makeSlice({
      evaluation_rules: [
        makeRule({ rule_id: 'MECH_X_RM', category: 'mechanical', property_key: 'tensile_strength', criteria: { min: 515, max: null, unit: 'MPa' }, source_clause: '表4' }),
      ],
    });
    const result = runGates(makeGateInput({ slices: [slice], clauseTextIndex: index, declaredFamilies: ['mechanical'] }));
    expect(result.issues.some((i) => i.code === 'TRACE_NUMBER_LITERAL')).toBe(true);
    expect(result.issues.some((i) => i.code === 'TRACE_BLOCK_BOUNDARY')).toBe(false);
  });

  it('两级溯源④：公式常量同样两级（声明条款未命中、全文档命中 -> WARN 而非 TRACE_FORMULA_LITERAL）', () => {
    const index = { 表1: '表1 化学成分（残段，无 Ti 行）' };
    const fullDocumentText = '表1 化学成分\n15 06Cr18Ni11Ti S32168 — Ti：5（C+N）～0.70';
    const tiRule = makeRule({
      rule_id: 'CHEM_TI', category: 'chemical', property_key: 'Ti', rule_type: 'dynamic_expression',
      criteria: { formula_min: '5 * (ctx.chemical.C + ctx.chemical.N)', formula_max: null, min: null, max: 0.7, unit: '%', rounding_decimals: 3 },
      source_clause: '表1',
    });
    const slice = makeSlice({ evaluation_rules: [tiRule] });
    const result = runGates(makeGateInput({ slices: [slice], clauseTextIndex: index, declaredFamilies: ['chemical'], fullDocumentText }));
    expect(result.issues.some((i) => i.code === 'TRACE_BLOCK_BOUNDARY' && i.severity === 'WARN')).toBe(true);
    expect(result.issues.some((i) => i.code === 'TRACE_FORMULA_LITERAL')).toBe(false);
    expect(result.passed).toBe(true);
  });
});

describe('S3 质量门禁：牌号行数对账', () => {
  it('原文牌号行数与切片数不一致 -> 拒绝', () => {
    const result = runGates(makeGateInput({ expectedGradeRows: 2 }));
    expect(result.issues.some((i) => i.code === 'RECONCILE_GRADE_COUNT')).toBe(true);
  });

  it('expectedGradeRows 为 null 时跳过对账', () => {
    const result = runGates(makeGateInput({ expectedGradeRows: null }));
    expect(result.passed).toBe(true);
  });
});

describe('S3 质量门禁：动态公式 lint（v2）', () => {
  interface TiRuleOverrides {
    rule_id?: string;
    source_clause?: string;
    criteria?: Record<string, unknown>;
  }

  const tiRule = (overrides: TiRuleOverrides = {}): DraftRule => {
    const { criteria: criteriaOverrides, ...rest } = overrides;
    return makeRule({
      rule_id: 'CHEM_S32168_Ti',
      category: 'chemical',
      property_key: 'Ti',
      display_name: '钛含量 (Ti)',
      rule_type: 'dynamic_expression',
      criteria: { formula_min: '5 * (ctx.chemical.C + ctx.chemical.N)', formula_max: null, min: null, max: 0.7, unit: '%', rounding_decimals: 3, ...criteriaOverrides },
      source_clause: '表1',
      ...rest,
    });
  };

  it('白名单公式（ctx.chemical.<元素>/数字/四则/括号）通过 lint 与数值溯源', () => {
    const slice = makeSlice({ evaluation_rules: [...makeFullFamilyRules(), tiRule()] });
    const result = runGates(makeGateInput({ slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'LINT_FORMULA')).toBe(false);
    expect(result.issues.some((i) => i.code === 'TRACE_FORMULA_LITERAL')).toBe(false);
    expect(result.passed).toBe(true);
  });

  it('白名单外标识符（ctx.header.X / 函数调用）被 LINT_FORMULA 拦截', () => {
    const bad1 = tiRule({ rule_id: 'CHEM_S32168_Ti_A', criteria: { formula_min: 'ctx.header.X * 5' } });
    const bad2 = tiRule({ rule_id: 'CHEM_S32168_Ti_B', criteria: { formula_min: 'max(5 * (ctx.chemical.C + ctx.chemical.N), 0.1)' } });
    const slice = makeSlice({ evaluation_rules: [...makeFullFamilyRules(), bad1, bad2] });
    const result = runGates(makeGateInput({ slices: [slice] }));
    const formulaIssues = result.issues.filter((i) => i.code === 'LINT_FORMULA');
    expect(formulaIssues.length).toBeGreaterThanOrEqual(2);
    expect(formulaIssues.some((i) => i.message.includes('ctx.header.X'))).toBe(true);
    expect(formulaIssues.some((i) => i.message.includes('max'))).toBe(true);
  });

  it('formula_min/formula_max 均为空时被拦截（应降级为 numeric_range，禁止静默放行）', () => {
    const bad = tiRule({ rule_id: 'CHEM_S32168_Ti_C', criteria: { formula_min: null, formula_max: '' } });
    const slice = makeSlice({ evaluation_rules: [...makeFullFamilyRules(), bad] });
    const result = runGates(makeGateInput({ slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'LINT_FORMULA' && i.message.includes('缺少非空 formula_min/formula_max'))).toBe(true);
  });

  it('公式数值溯源：常量未在声明来源条款原文中字面出现判为幻觉', () => {
    // 原文为 0.70，公式常量 0.8 未字面出现 -> 拦截
    const bad = tiRule({ rule_id: 'CHEM_S32168_Ti_D', criteria: { formula_min: '0.8 * (ctx.chemical.C + ctx.chemical.N)' } });
    const slice = makeSlice({ evaluation_rules: [...makeFullFamilyRules(), bad] });
    const result = runGates(makeGateInput({ slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'TRACE_FORMULA_LITERAL' && i.message.includes('0.8'))).toBe(true);
    expect(result.requiresManualReview).toBe(true);
  });

  it('dynamic_expression 声明的 source_clause 不存在 -> TRACE_SOURCE_CLAUSE', () => {
    const bad = tiRule({ source_clause: '表9' });
    const slice = makeSlice({ evaluation_rules: [...makeFullFamilyRules(), bad] });
    const result = runGates(makeGateInput({ slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'TRACE_SOURCE_CLAUSE')).toBe(true);
  });
});

describe('S3 质量门禁：牌号适用性白名单校验（v2 防臆造牌号）', () => {
  it('applies_to_grades 含切片牌号全集外的牌号被拦截', () => {
    const rule = makeRule({
      rule_id: 'PROC_S30408_FLATTENING',
      category: 'process',
      property_key: 'flattening',
      display_name: '压扁试验',
      rule_type: 'dynamic_formula_pass',
      criteria: { formula_distance_H: '(1 + 0.09) * S / (0.09 + S / D)', expected_visual_result: 'NO_CRACKS' },
      source_clause: '6.5.1',
      applies_to_grades: ['S30408', 'S99999'],
    });
    const slice = makeSlice({ evaluation_rules: [...makeFullFamilyRules(), rule] });
    const result = runGates(makeGateInput({ slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'LINT_APPLIES_TO_GRADES' && i.message.includes('S99999'))).toBe(true);
    expect(result.requiresManualReview).toBe(true);
  });

  it('applies_to_grades 为 ALL 或 ⊆ 全集时通过', () => {
    const allRule = makeRule({
      rule_id: 'PROC_ALL_SURFACE',
      category: 'surface',
      property_key: 'surface_quality',
      display_name: '表面外观质量',
      rule_type: 'qualitative_pass',
      criteria: { expected: 'CLEAN_PASS' },
      source_clause: '6.12',
      applies_to_grades: ['ALL'],
    });
    const gradeRule = { ...allRule, rule_id: 'PROC_PARTIAL_SURFACE', applies_to_grades: ['06Cr19Ni10', 'S30408'] };
    const slice = makeSlice({ evaluation_rules: [...makeFullFamilyRules(), allRule, gradeRule] });
    const result = runGates(makeGateInput({ slices: [slice] }));
    expect(result.issues.some((i) => i.code === 'LINT_APPLIES_TO_GRADES')).toBe(false);
  });

  it('S2 展开后未挂载到任何切片的规则被拦截（严禁静默丢弃）', () => {
    const orphan = makeRule({
      rule_id: 'PROC_ORPHAN',
      category: 'process',
      property_key: 'flaring',
      display_name: '扩口试验',
      rule_type: 'qualitative_and_numeric',
      criteria: { cone_angle_deg: 60, flaring_rate_min_percent: 18, expected_visual_result: 'NO_CRACKS' },
      source_clause: '6.5.1',
      applies_to_grades: ['S00000'],
    });
    const result = runGates(makeGateInput({ unmountedRules: [orphan] }));
    expect(result.issues.some((i) => i.code === 'LINT_APPLIES_TO_GRADES' && i.message.includes('未匹配到任何切片'))).toBe(true);
    expect(result.requiresManualReview).toBe(true);
  });
});

describe('S3 质量门禁：尺寸公差表 lint（v2）', () => {
  const validTable = {
    table_id: 'TABLE_1',
    table_name: '表1 钢管公称外径的允许偏差',
    source_block: '表1',
    rules: [
      {
        dimension_property: 'outer_diameter',
        process: 'cold_drawn',
        delivery_mode: 'min_wall',
        range_min: 6,
        range_max: 38,
        plus_tolerance_value: 0.4,
        plus_tolerance_is_percent: false,
        minus_tolerance_value: -0.4,
        minus_tolerance_is_percent: false,
        note: '外径 6~38mm: ±0.40mm',
      },
    ],
  };

  it('结构合法的公差表通过契约校验', () => {
    const result = runGates(makeGateInput({ toleranceTables: [validTable] }));
    expect(result.issues.some((i) => i.code === 'LINT_TOLERANCE_TABLE')).toBe(false);
    expect(result.passed).toBe(true);
  });

  it('结构非法的公差表（dimension_property 越枚举）被拦截', () => {
    const bad = {
      ...validTable,
      table_id: 'TABLE_BAD',
      rules: [{ ...validTable.rules[0]!, dimension_property: 'length' }],
    };
    const result = runGates(makeGateInput({ toleranceTables: [bad] }));
    expect(result.issues.some((i) => i.code === 'LINT_TOLERANCE_TABLE' && i.message.includes('TABLE_BAD'))).toBe(true);
  });

  it('跨标准外部引用：rules 为空产生 MANUAL_REVIEW 级 issue 提示补录被引标准', () => {
    const external = {
      table_id: 'NB_T_47019_1_TABLE_2',
      table_name: 'NB/T 47019.1 表2 冷拔(轧)无缝管公称外径允许偏差',
      source_block: '表1',
      external_reference: 'NB/T 47019.1 表2',
      rules: [],
    };
    const result = runGates(makeGateInput({ toleranceTables: [external] }));
    expect(result.issues.some((i) => i.code === 'EXTERNAL_TOLERANCE_REFERENCE' && i.message.includes('NB/T 47019.1 表2'))).toBe(true);
    expect(result.requiresManualReview).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('外部引用携带臆造 rules 被 LINT_TOLERANCE_TABLE 拦截（严禁臆造被引标准数据）', () => {
    const fabricated = {
      ...validTable,
      table_id: 'NB_T_47019_1_TABLE_2',
      external_reference: 'NB/T 47019.1 表2',
    };
    const result = runGates(makeGateInput({ toleranceTables: [fabricated] }));
    expect(result.issues.some((i) => i.code === 'LINT_TOLERANCE_TABLE' && i.message.includes('严禁臆造'))).toBe(true);
    expect(result.issues.some((i) => i.code === 'EXTERNAL_TOLERANCE_REFERENCE')).toBe(true);
  });
});

describe('S3 条款文本索引构建', () => {
  it('块内嵌套章节号按行区间登记索引', () => {
    const blocks: TextBlock[] = [
      { blockType: 'other', clauseRef: '表4', text: '表4 硬度\n组织类型 牌号 HBW\n奥氏体型 06Cr19Ni10 192\n6.4.2 壁厚不小于 1.7mm 的管子可做硬度试验，其值应符合表4的规定。' },
      { blockType: 'garbled', clauseRef: '乱码区块1', text: ', #-./,. ,/"),0($1 .2,3 ,2.. /2.. .2.-3' },
    ];
    const index = buildClauseTextIndex(blocks);
    expect(index['表4']).toContain('192');
    expect(index['表4']).not.toContain('6.4.2');
    expect(index['6.4.2']).toContain('1.7');
    expect(index['乱码区块1']).toBeUndefined();
  });
});
