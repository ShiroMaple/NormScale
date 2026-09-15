import { describe, it, expect } from 'vitest';
import { runGates, buildClauseTextIndex } from '@/ingestion/gates';
import type { GateInput } from '@/ingestion/gates';
import type { DraftRule, DraftSlice, TextBlock } from '@/ingestion/types';

/* 溯源断言用原文索引（数值字面取自其中） */
const CLAUSE_TEXT_INDEX: Record<string, string> = {
  表2: '表2 钢的牌号和化学成分\n1 06Cr19Ni10 S30408 0.08 1.00 2.00 0.035 0.015 8.00~11.00 18.00~20.00\n2 022Cr19Ni10 S30403 0.030 1.00 2.00 0.035 0.015 8.00~12.00 18.00~20.00',
  表3: '表3 室温力学性能\n1 06Cr19Ni10 S30408 520 205 35\n2 022Cr19Ni10 S30403 480 175 35',
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
    evaluation_rules: [
      makeRule(),
      makeRule({ rule_id: 'MECH_S30408_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', criteria: { min: 520, max: null, unit: 'MPa' }, source_clause: '表3' }),
      makeRule({ rule_id: 'MECH_S30408_RP02', category: 'mechanical', property_key: 'yield_strength_rp02', display_name: '规定塑性延伸强度 (Rp0.2)', criteria: { min: 205, max: null, unit: 'MPa' }, source_clause: '表3' }),
    ],
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
    const result = runGates(makeGateInput({ slices: [slice], propertyKeyRegistry: ['C', 'tensile_strength', 'yield_strength_rp02'] }));
    expect(result.issues.some((i) => i.code === 'LINT_PROPERTY_KEY_REGISTRY' && i.message.includes('tensile_str'))).toBe(true);
    expect(result.requiresManualReview).toBe(true);
  });

  it('命中注册表的 key 通过；命中即放行其余检查', () => {
    const result = runGates(
      makeGateInput({ propertyKeyRegistry: new Set(['C', 'tensile_strength', 'yield_strength_rp02', 'elongation_A']) }),
    );
    expect(result.issues.some((i) => i.code === 'LINT_PROPERTY_KEY_REGISTRY')).toBe(false);
    expect(result.passed).toBe(true);
  });

  it('注册表为空（全新标准库）时跳过 lint，品类扩张合法', () => {
    const slice = makeSlice({
      evaluation_rules: [makeRule({ property_key: 'brand_new_key' }), makeRule({ rule_id: 'MECH_S30408_RM', category: 'mechanical', property_key: 'tensile_strength', criteria: { min: 520, max: null, unit: 'MPa' }, source_clause: '表3' })],
    });
    const result = runGates(makeGateInput({ slices: [slice], propertyKeyRegistry: [] }));
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

  it('declaredFamilies 扩充到 process 时，缺少 process 类规则被拦截', () => {
    const slice = makeSlice();
    const result = runGates(makeGateInput({ slices: [slice], declaredFamilies: ['chemical', 'mechanical', 'process'] }));
    const coverage = result.issues.find((i) => i.code === 'LINT_CATEGORY_COVERAGE');
    expect(coverage).toBeDefined();
    expect(coverage!.message).toContain('process');
    expect(coverage!.message).toContain('声明提取范围');
  });

  it('declaredFamilies 为空数组时回退缺省 chemical+mechanical', () => {
    const slice = makeSlice({ evaluation_rules: [makeRule()] });
    const result = runGates(makeGateInput({ slices: [slice], declaredFamilies: [] }));
    expect(result.issues.some((i) => i.code === 'LINT_CATEGORY_COVERAGE' && i.message.includes('mechanical'))).toBe(true);
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
