import { describe, it, expect } from 'vitest';
import { extractAll } from '@/ingestion/llm-extract';
import { runGates } from '@/ingestion/gates';
import { classifyBlock } from '@/ingestion/segmenter';
import type { ChatClient, DraftRule, DraftSlice, TextBlock } from '@/ingestion/types';

/* golden（GB_T_13296_2023，Gemini 无门禁产出）8 项差距对齐测试。
   每项：prompt 内容断言（mock chat 捕获）+ 目标结构 gates 通过 + 错误结构 gates 拦截。严禁真实 LLM。 */

const CHEM_BLOCK: TextBlock = {
  blockType: 'chemistry_table',
  clauseRef: '表3',
  text: '表 3 钢的牌号和化学成分\n15 06Cr18Ni11Ti S32168 0.08 1.00 2.00 0.035 0.015 9.00～12.00 17.00～19.00 — Ti：5（C+N）～0.70',
};

// prompt 捕获用：含力学表块与工艺条款块，确保 slices_mechanical / process_rules 任务被调用
const MECH_BLOCK: TextBlock = {
  blockType: 'mechanical_table',
  clauseRef: '表4',
  text: '表 4 力学性能\n22 06Cr18Ni11Ti S32168 520 205 35\n注：热挤压钢管抗拉强度允许降低20MPa。',
};
const PROCESS_BLOCK: TextBlock = {
  blockType: 'process_ndt_clauses',
  clauseRef: '7.6.1',
  text: '7.6.1 壁厚不大于 10mm 的钢管应进行压扁试验，压扁间距 H=(1+α)S/(α+S/D)，α=0.09，试样无裂纹。',
};

const PROMPT_CAPTURE_BLOCKS = [CHEM_BLOCK, MECH_BLOCK, PROCESS_BLOCK];

function captureCalls(): { chat: ChatClient; userOf: (task: string) => string } {
  const contents = new Map<string, string>();
  const chat: ChatClient = async (messages, opts) => {
    const content = messages[1]?.content;
    contents.set(opts.task, typeof content === 'string' ? content : JSON.stringify(content));
    switch (opts.task) {
      case 'meta':
        return JSON.stringify({ standard_id: 'GB/T 13296-2023', standard_name: '锅炉、热交换器用不锈钢无缝钢管', version: '2023', description: '本文件规定了技术要求。', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] });
      case 'slices_chemical':
        return JSON.stringify({ slices: [{ spec_key: 'S32168', primary_grade: '06Cr18Ni11Ti', structure_type: 'austenitic', display_name: '06Cr18Ni11Ti (S32168)', aliases: ['SUS321', 'TP321', '0Cr18Ni10Ti'], chemical_rules: [{ rule_id: 'CHEM_S32168_C', category: 'chemical', property_key: 'C', display_name: 'C含量 (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: '表3' }] }] });
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
  return { chat, userOf: (task) => contents.get(task) ?? '' };
}

describe('差距 1/2/6：mechanical prompt——硬度 or_choice 恢复、condition_adjustments、aliases', () => {
  it('mechanical prompt 任务框架泛化（拉伸 + 硬度多选一，不得因"非拉伸"跳过硬度表）', async () => {
    const { chat, userOf } = captureCalls();
    await extractAll(PROMPT_CAPTURE_BLOCKS, chat);
    const prompt = userOf('slices_mechanical');
    expect(prompt).toContain('室温拉伸性能 + 硬度多选一等');
    expect(prompt).toContain('不得因"非拉伸"跳过硬度表');
    // 表5 硬度块须产出 or_choice_group + trigger_condition + CONDITIONAL
    expect(prompt).toContain('or_choice_group');
    expect(prompt).toContain('property_key="hardness"');
    expect(prompt).toContain('ctx.header.dimensions.wall_thickness_mm >= 1.7');
    expect(prompt).toContain('CONDITIONAL');
  });

  it('mechanical prompt：硬度表按组织类型给值时映射到对应组织类型切片；表注扫描为强制项', async () => {
    const { chat, userOf } = captureCalls();
    await extractAll(PROMPT_CAPTURE_BLOCKS, chat);
    const prompt = userOf('slices_mechanical');
    expect(prompt).toContain('按组织类型（如"奥氏体型""其他""铁素体型"行）');
    expect(prompt).toContain('表注扫描（强制，不得遗漏）');
  });

  it('mechanical prompt 含 condition_adjustments 指令（when 表达式惯例 + 热挤压示例）', async () => {
    const { chat, userOf } = captureCalls();
    await extractAll(PROMPT_CAPTURE_BLOCKS, chat);
    const prompt = userOf('slices_mechanical');
    expect(prompt).toContain('condition_adjustments');
    expect(prompt).toContain('ctx.header.manufacturing_process');
    expect(prompt).toContain('hot_extrusion');
    expect(prompt).toContain('允许降低20MPa');
  });

  it('chemical/mechanical prompt 允许 aliases 世界知识填充（不再强制留空）', async () => {
    const { chat, userOf } = captureCalls();
    const drafts = await extractAll([CHEM_BLOCK], chat);
    expect(userOf('slices_chemical')).toContain('SUS304');
    expect(userOf('slices_chemical')).toContain('别名不参与原文数值溯源');
    expect(userOf('slices_chemical')).not.toContain('aliases 留空数组');
    // 抽取产物保留 aliases（世界知识，非原文数值）
    expect(drafts.slices[0]!.aliases).toEqual(['SUS321', 'TP321', '0Cr18Ni10Ti']);
  });

  it('segmenter：表5 硬度块（牌号行 + HBW/HRB/HV）路由 mechanical_table', () => {
    expect(classifyBlock('表5', '表 5 钢管的硬度\n组织类型 牌号 HBW HRB HV\n奥氏体型 06Cr19Ni10 192 90 200')).toBe('mechanical_table');
  });
});

describe('差距 3/4/5/7/8：process/dynamic prompt——trigger_condition、组织作用域、exemption、enum_acceptance、α 代入、rounding=3', () => {
  it('process prompt 含 trigger_condition 强制指令（壁厚/外径 JS 表达式惯例）', async () => {
    const { chat, userOf } = captureCalls();
    await extractAll(PROMPT_CAPTURE_BLOCKS, chat);
    const prompt = userOf('process_rules');
    expect(prompt).toContain('trigger_condition');
    expect(prompt).toContain('ctx.header.dimensions.wall_thickness_mm <= 10');
    expect(prompt).toContain('ctx.header.dimensions.outer_diameter_mm');
  });

  it('process prompt 含组织类型作用域判读与 exemption 范式（含 ferritic 禁令）', async () => {
    const { chat, userOf } = captureCalls();
    await extractAll(PROMPT_CAPTURE_BLOCKS, chat);
    const prompt = userOf('process_rules');
    expect(prompt).toContain('组织类型作用域');
    expect(prompt).toContain('严禁给铁素体型牌号输出奥氏体型专属规则');
    expect(prompt).toContain('rule_type="exemption"');
    expect(prompt).toContain('EXEMPT');
    expect(prompt).toContain('criteria={reason}');
  });

  it('process prompt 含 enum_acceptance（验收等级类 NDT）与 α 系数代入可求值化指令', async () => {
    const { chat, userOf } = captureCalls();
    await extractAll(PROMPT_CAPTURE_BLOCKS, chat);
    const prompt = userOf('process_rules');
    expect(prompt).toContain('enum_acceptance');
    expect(prompt).toContain('验收等级类 NDT');
    expect(prompt).toContain('(1 + 0.09) * S / (0.09 + S / D)');
    expect(prompt).toContain('H=(1+α)S/(α+S/D)');
    expect(prompt).toContain('代入系数');
    expect(prompt).toContain('可求值表达式');
  });

  it('process prompt 第 9 条含 7.7.1 判读 worked example（豁免 6 牌号 + 奥氏体作用域 + 铁素体零规则）', async () => {
    const { chat, userOf } = captureCalls();
    await extractAll(PROMPT_CAPTURE_BLOCKS, chat);
    const prompt = userOf('process_rules');
    expect(prompt).toContain('判读 worked example');
    expect(prompt).toContain('16Cr23Ni13');
    expect(prompt).toContain('20Cr25Ni20');
    expect(prompt).toContain('其他奥氏体型钢管');
    expect(prompt).toContain('06Cr13、10Cr17、008Cr27Mo');
    expect(prompt).toContain('常见错误（严禁）');
    expect(prompt).toContain('铁素体型牌号零规则');
  });

  it('process prompt 第 11 条：纯兜底协商禁出，但带指标表的协商/条件项必须输出（防硬度误伤）', async () => {
    const { chat, userOf } = captureCalls();
    await extractAll(PROMPT_CAPTURE_BLOCKS, chat);
    const prompt = userOf('process_rules');
    expect(prompt).toContain('带有具体指标表/验收等级的协商或条件触发项必须输出');
    expect(prompt).toContain('OPTIONAL_AGREED');
    expect(prompt).toContain('壁厚≥1.7mm 可做布氏/洛氏/维氏硬度');
  });

  it('dynamic_formulas prompt：公式型 rounding_decimals 固定 3（判定精度，与原文小数位无关）', async () => {
    const { chat, userOf } = captureCalls();
    await extractAll([CHEM_BLOCK], chat);
    const prompt = userOf('dynamic_formulas');
    expect(prompt).toContain('rounding_decimals 固定取 3');
    expect(prompt).toContain('原文上限 0.70 仍为 3');
  });
});

/* ---------- gates：golden 形态结构全绿 + 错误结构拦截 ---------- */

const CLAUSE_INDEX: Record<string, string> = {
  表3: '表3 钢的牌号和化学成分\n4 07Cr19Ni10 S30409 0.04～0.10 1.00 2.00 0.035 0.015 8.00～11.00 18.00～20.00\n22 06Cr18Ni11Ti S32168 0.08 1.00 2.00 0.035 0.015 9.00～12.00 17.00～19.00',
  表4: '表4 力学性能\n1 06Cr18Ni11Ti S32168 520 205 35\n注：热挤压钢管抗拉强度允许降低20MPa。',
  表5: '表5 钢管的硬度\n组织类型 牌号 硬度 HBW HRB HV\n奥氏体型 06Cr19Ni10 192 90 200',
  '7.4.2': '7.4.2 壁厚不小于 1.7mm 的管子可做布氏硬度或洛氏硬度或维氏硬度试验，管子的硬度试验结果应符合表 5 的规定。',
  '7.6.1': '7.6.1 壁厚不大于 10mm 的钢管应进行压扁试验，压扁间距 H=(1+α)S/(α+S/D)，α=0.09，试样无裂纹。',
  '7.7.1': '7.7.1 07Cr19Ni10、16Cr23Ni13、20Cr25Ni20、07Cr17Ni12Mo2、07Cr19Ni11Ti、07Cr18Ni11Nb 牌号钢管可不进行晶间腐蚀试验。',
  '7.8': '7.8 07Cr19Ni10 牌号钢管的晶粒度级别应为 4 级～7 级。',
  '7.9': '7.9 钢管应逐根进行纵向超声波检测，验收等级为 U2 级，按 GB/T 5777-2019 执行。',
};

function baseRule(overrides: Partial<DraftRule>): DraftRule {
  return {
    rule_id: 'R',
    category: 'mechanical',
    property_key: 'x',
    display_name: 'X',
    rule_type: 'numeric_range',
    requirement_level: 'MANDATORY',
    criteria: { min: 520, max: null, unit: 'MPa' },
    source_clause: '表4',
    ...overrides,
  };
}

function makeSlice(specKey: string, grade: string, rules: DraftRule[], aliases: string[] = []): DraftSlice {
  return {
    spec_key: specKey,
    spec_type: 'grade',
    standard_code: 'GB/T 13296-2023',
    display_name: `${grade} (${specKey})`,
    primary_grade: grade,
    structure_type: 'austenitic',
    aliases,
    description: `${grade} 试验切片`,
    evaluation_rules: rules,
  };
}

/** golden S32168 形态：condition_adjustments + 硬度 or_choice + flattening trigger + enum_acceptance */
function goldenS32168Rules(): DraftRule[] {
  return [
    baseRule({ rule_id: 'CHEM_S32168_C', category: 'chemical', property_key: 'C', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: '表3' }),
    baseRule({
      rule_id: 'MECH_S32168_RM', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)',
      criteria: { min: 520, max: null, unit: 'MPa', condition_adjustments: [{ when: "ctx.header.manufacturing_process == 'hot_extrusion'", min_offset: -20, note: '热挤压钢管抗拉强度允许降低20MPa' }] },
      source_clause: '表4',
    }),
    baseRule({
      rule_id: 'MECH_S32168_HARDNESS', property_key: 'hardness', display_name: '硬度试验 (HRB/HBW/HV)', rule_type: 'or_choice_group',
      requirement_level: 'CONDITIONAL', trigger_condition: 'ctx.header.dimensions.wall_thickness_mm >= 1.7',
      criteria: { options: [{ sub_key: 'HRB', rule_type: 'numeric_range', criteria: { max: 90, unit: 'HRB' } }, { sub_key: 'HBW', rule_type: 'numeric_range', criteria: { max: 192, unit: 'HBW' } }, { sub_key: 'HV', rule_type: 'numeric_range', criteria: { max: 200, unit: 'HV' } }] },
      source_clause: '表5',
    }),
    baseRule({
      rule_id: 'PROC_S32168_FLATTENING', category: 'process', property_key: 'flattening_test', display_name: '压扁试验', rule_type: 'dynamic_formula_pass',
      trigger_condition: 'ctx.header.dimensions.wall_thickness_mm <= 10.0',
      criteria: { formula_distance_H: '(1 + 0.09) * S / (0.09 + S / D)', expected_visual_result: 'NO_CRACKS', test_standard: 'GB/T 246' },
      source_clause: '7.6.1',
    }),
    baseRule({
      rule_id: 'NDT_S32168_ULTRASONIC', category: 'ndt', property_key: 'ultrasonic_test', display_name: '超声检测', rule_type: 'enum_acceptance',
      criteria: { required_level: 'U2', test_standard: 'GB/T 5777-2019' },
      source_clause: '7.9',
    }),
  ];
}

/** golden S30409 形态：exemption + 晶粒度 */
function goldenS30409Rules(): DraftRule[] {
  return [
    baseRule({ rule_id: 'CHEM_S30409_C', category: 'chemical', property_key: 'C', criteria: { min: 0.04, max: 0.1, unit: '%', rounding_decimals: 3 }, source_clause: '表3' }),
    baseRule({ rule_id: 'MECH_S30409_RM', property_key: 'tensile_strength', criteria: { min: 520, max: null, unit: 'MPa' }, source_clause: '表4' }),
    baseRule({
      rule_id: 'CORR_S30409_INTERGRANULAR_EXEMPT', category: 'corrosion', property_key: 'intergranular_corrosion', display_name: '晶间腐蚀试验 (免做项)',
      rule_type: 'exemption', requirement_level: 'EXEMPT',
      description: '依据 GB/T 13296-2023 第 7.7.1 条明确规定，07Cr19Ni10 可不进行晶间腐蚀试验',
      criteria: { reason: '标准 7.7.1 明确规定 07Cr19Ni10 可不进行晶间腐蚀试验' },
      source_clause: '7.7.1',
    }),
    baseRule({ rule_id: 'METALLO_S30409_GRAIN_SIZE', category: 'metallographic', property_key: 'grain_size', display_name: '晶粒度级别', criteria: { min: 4, max: 7, unit: '级' }, source_clause: '7.8' }),
  ];
}

function runAlignmentGates(slices: DraftSlice[]) {
  return runGates({
    meta: { standard_id: 'GB/T 13296-2023', standard_name: '锅炉、热交换器用不锈钢无缝钢管', version: '2023', description: '本文件规定了锅炉、热交换器用不锈钢无缝钢管的技术要求。', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] },
    slices,
    clauses: [],
    clauseTextIndex: { ...CLAUSE_INDEX },
    expectedGradeRows: null,
    declaredFamilies: ['chemical', 'mechanical', 'process', 'metallographic', 'corrosion', 'ndt'],
  });
}

describe('差距 1-8 结构对齐：golden 形态草稿过全量门禁（含 aliases/豁免/条件项）', () => {
  it('golden S32168/S30409 形态全绿：无 TRACE/LINT_FORMULA/SCHEMA 问题', () => {
    const slices = [
      makeSlice('S32168', '06Cr18Ni11Ti', goldenS32168Rules(), ['SUS321', 'TP321', '0Cr18Ni10Ti']),
      makeSlice('S30409', '07Cr19Ni10', goldenS30409Rules(), ['SUS304H', 'TP304H', '1Cr18Ni9']),
    ];
    const gate = runAlignmentGates(slices);
    expect(gate.issues).toEqual([]);
    expect(gate.passed).toBe(true);
  });

  it('错误结构拦截：硬度 option 数值不在原文（192->201）判幻觉', () => {
    const rules = goldenS32168Rules();
    const hardness = rules.find((r) => r.rule_id === 'MECH_S32168_HARDNESS')!;
    hardness.criteria = { options: [{ sub_key: 'HBW', rule_type: 'numeric_range', criteria: { max: 201, unit: 'HBW' } }] };
    const gate = runAlignmentGates([makeSlice('S32168', '06Cr18Ni11Ti', rules)]);
    expect(gate.issues.some((i) => i.code === 'TRACE_NUMBER_LITERAL' && i.message.includes('201'))).toBe(true);
  });

  it('错误结构拦截：压扁间距公式含未代入的希腊字母（α）被 LINT_FORMULA 拦截', () => {
    const rules = goldenS32168Rules();
    const flattening = rules.find((r) => r.rule_id === 'PROC_S32168_FLATTENING')!;
    flattening.criteria = { formula_distance_H: '(1 + α) * S / (α + S / D)', expected_visual_result: 'NO_CRACKS' };
    const gate = runAlignmentGates([makeSlice('S32168', '06Cr18Ni11Ti', rules)]);
    expect(gate.issues.some((i) => i.code === 'LINT_FORMULA' && i.message.includes('α'))).toBe(true);
  });

  it('错误结构拦截：压扁规则缺少 formula_distance_H 被 LINT_FORMULA 拦截', () => {
    const rules = goldenS32168Rules();
    const flattening = rules.find((r) => r.rule_id === 'PROC_S32168_FLATTENING')!;
    flattening.criteria = { expected_visual_result: 'NO_CRACKS' };
    const gate = runAlignmentGates([makeSlice('S32168', '06Cr18Ni11Ti', rules)]);
    expect(gate.issues.some((i) => i.code === 'LINT_FORMULA' && i.message.includes('formula_distance_H'))).toBe(true);
  });

  it('组织作用域：铁素体牌号切片不得承载奥氏体专属晶间腐蚀规则（挂载正确性由 applies_to_grades 保证）', async () => {
    // LLM 给对牌号集合：奥氏体专属规则 applies 不含铁素体牌号 -> 铁素体切片无该规则
    const chemBlock: TextBlock = {
      blockType: 'chemistry_table',
      clauseRef: '表3',
      text: '表3 钢的牌号和化学成分\n奥氏体型 1 06Cr18Ni11Ti S32168 0.08\n铁素体型 2 06Cr13 S11306 0.06',
    };
    const corrosionClause: TextBlock = {
      blockType: 'process_ndt_clauses',
      clauseRef: '7.7',
      text: '7.7 晶间腐蚀试验\n其他奥氏体型钢管应按 GB/T 4334-2020 中方法 E 进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀倾向。',
    };
    const chat: ChatClient = async (_messages, opts) => {
      switch (opts.task) {
        case 'meta':
          return JSON.stringify({ standard_id: 'GB/T 13296-2023', standard_name: '试验标准', version: '2023', description: '描述。', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] });
        case 'slices_chemical':
          return JSON.stringify({ slices: [
            { spec_key: 'S32168', primary_grade: '06Cr18Ni11Ti', structure_type: 'austenitic', display_name: '06Cr18Ni11Ti (S32168)', aliases: [], chemical_rules: [{ rule_id: 'CHEM_S32168_C', category: 'chemical', property_key: 'C', display_name: 'C含量', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: '表3' }] },
            { spec_key: 'S11306', primary_grade: '06Cr13', structure_type: 'ferritic', display_name: '06Cr13 (S11306)', aliases: [], chemical_rules: [{ rule_id: 'CHEM_S11306_C', category: 'chemical', property_key: 'C', display_name: 'C含量', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: '表3' }] },
          ] });
        case 'slices_mechanical':
          return JSON.stringify({ slices: [] });
        case 'clauses':
          return JSON.stringify({ clauses: [] });
        case 'process_rules':
          return JSON.stringify({ rules: [{ rule_id: 'CORR_INTERGRANULAR', category: 'corrosion', property_key: 'intergranular_corrosion', display_name: '晶间腐蚀试验', rule_type: 'qualitative_enum', requirement_level: 'MANDATORY', criteria: { method: 'Method_E', test_standard: 'GB/T 4334-2020', expected: 'NO_CORROSION_TREND' }, source_clause: '7.7', applies_to_grades: ['06Cr18Ni11Ti'] }] });
        case 'dynamic_formulas':
          return JSON.stringify({ rules: [] });
        case 'tolerance_tables':
          return JSON.stringify({ tables: [] });
        default:
          throw new Error(`未知任务类型: ${opts.task}`);
      }
    };
    const drafts = await extractAll([chemBlock, corrosionClause], chat);
    const austenitic = drafts.slices.find((s) => s.spec_key === 'S32168')!;
    const ferritic = drafts.slices.find((s) => s.spec_key === 'S11306')!;
    expect(austenitic.evaluation_rules.some((r) => r.property_key === 'intergranular_corrosion')).toBe(true);
    // 铁素体切片严禁承载奥氏体专属晶间腐蚀规则
    expect(ferritic.evaluation_rules.some((r) => r.property_key === 'intergranular_corrosion')).toBe(false);
  });
});
