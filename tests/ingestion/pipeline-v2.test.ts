import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ingestStandard } from '@/ingestion/ingest-pipeline';
import { DimensionToleranceTableSchema, SpecificationSliceSchema, StandardMetaSchema } from '@/schemas/standard.schema';
import type { ChatClient } from '@/ingestion/types';

/* ==========================================================================
   v2 提取范围扩充端到端测试（T4.18-21）：默认全量七族，mock chat 覆盖全部任务类型。
   断言点：applies_to_grades 展开挂载、动态公式溯源、公差表提取落 meta、
   臆造牌号拦截、外部公差引用 MANUAL_REVIEW 显著标注。
   严禁真实 LLM 调用，严禁触碰 data/standards。
   ========================================================================== */

// v2 fixture：两牌号 + 工艺/探伤/金相/腐蚀/表面条款 + 公差表 + 化学表"其他"列 Ti 公式。
// 关键数值（5、0.70、187/90/200、4/7、0.8、520/205/480）均在对应条款块内字面出现，满足溯源断言。
const V2_FIXTURE_TEXT = `
GB/T 88888-2024
前 言
本文件按照 GB/T 1.1—2020 的规定起草。
1 范围
本文件规定了锅炉、热交换器用不锈钢无缝钢管的技术要求。
本文件适用于锅炉、热交换器用不锈钢无缝钢管。
5 尺寸
表1 钢管公称外径的允许偏差
单位为毫米
钢管公称尺寸 允许偏差
6~38 ±0.40
6 技术要求
6.1 钢的牌号和化学成分
表2 钢的牌号和化学成分
组织 类型 序号 牌号 统一数字代号 C Si Mn P S Ni Cr 其他
奥氏体型
1 06Cr19Ni10 S30408 0.08 1.00 2.00 0.035 0.015 8.00~11.00 18.00~20.00 Ti：5（C+N）～0.70
2 022Cr19Ni10 S30403 0.030 1.00 2.00 0.035 0.015 8.00~12.00 18.00~20.00 — —
6.4 力学性能
表3 室温力学性能
组织类型 序号 牌号 统一数字代号 抗拉强度Rm/MPa 规定塑性延伸强度Rp0.2/MPa 断后伸长率A/%
奥氏体型
1 06Cr19Ni10 S30408 520 205 35
2 022Cr19Ni10 S30403 480 175 35
6.5 工艺性能
6.5.1 压扁
壁厚不大于 10mm 的管子应进行压扁试验，压扁后试样不应出现裂缝或裂口。
6.5.2 扩口
6.5.2.1 壁厚不大于 10mm 的无缝管应进行扩口试验。扩口试验的顶心锥度为 60°，扩口后试样的外径扩口率应为：奥氏体型管子不小于 18%，扩口试验后的试样不应出现裂缝或裂口。
6.5.2.2 壁厚不小于 1.7mm 的管子可做布氏硬度或洛氏硬度或维氏硬度试验，硬度试验结果应符合：HBW≤187、HRB≤90、HV≤200。
6.6 水压试验
6.6.1 钢管应逐根进行水压试验，试验压力按式 P=2SR/D 计算。最大试验压力不超过 20 MPa，稳压时间不少于 10s。
6.8 腐蚀试验
管子应按 GB/T 4334—2020 中方法 E 的规定进行晶间腐蚀试验，试验后试样不应出现晶间腐蚀倾向。
6.9 晶粒度
牌号管子的晶粒度级别应为 4 级～7 级。
6.10 无损检测
6.10.1.1 无缝管应逐根进行超声检测，对比样管纵向刻槽深度等级应符合 GB/T 5777—2019 中U2级的规定。
6.11 表面质量
钢管的内外表面不应有裂缝、折叠、轧折、离层和结疤。
6.12 表面粗糙度
管子内外表面粗糙度 Ra 应不大于 0.8μm。
`.trim();

interface V2MockOverrides {
  processRules?: Record<string, unknown>[];
  dynamicFormulas?: Record<string, unknown>[];
  toleranceTables?: Record<string, unknown>[];
}

function createV2MockChat(overrides: V2MockOverrides = {}): ChatClient {
  const processRules = overrides.processRules ?? [
    { rule_id: 'PROC_FLATTENING', category: 'process', property_key: 'flattening_test', display_name: '压扁试验', rule_type: 'dynamic_formula_pass', requirement_level: 'MANDATORY', criteria: { formula_distance_H: '(1 + 0.09) * S / (0.09 + S / D)', expected_visual_result: 'NO_CRACKS', test_standard: 'GB/T 246' }, source_clause: '6.5.1', applies_to_grades: 'ALL' },
    { rule_id: 'PROC_FLARING', category: 'process', property_key: 'flaring_test', display_name: '扩口试验', rule_type: 'qualitative_and_numeric', requirement_level: 'MANDATORY', criteria: { cone_angle_deg: 60, flaring_rate_min_percent: 18, expected_visual_result: 'NO_CRACKS', test_standard: 'GB/T 242' }, source_clause: '6.5.2.1', applies_to_grades: ['06Cr19Ni10'] },
    { rule_id: 'MECH_HARDNESS', category: 'mechanical', property_key: 'hardness', display_name: '硬度试验', rule_type: 'or_choice_group', requirement_level: 'CONDITIONAL', trigger_condition: 'ctx.header.dimensions.wall_thickness_mm >= 1.7', criteria: { options: [{ sub_key: 'HV', rule_type: 'numeric_range', criteria: { min: null, max: 200, unit: 'HV' } }, { sub_key: 'HRB', rule_type: 'numeric_range', criteria: { min: null, max: 90, unit: 'HRB' } }, { sub_key: 'HBW', rule_type: 'numeric_range', criteria: { min: null, max: 187, unit: 'HBW' } }] }, source_clause: '6.5.2.2', applies_to_grades: 'ALL' },
    { rule_id: 'NDT_TIGHTNESS', category: 'ndt', property_key: 'pressure_tightness', display_name: '致密性/水压试验组', rule_type: 'alternative_group', requirement_level: 'MANDATORY', criteria: { group_logic: 'AT_LEAST_ONE_PASS', candidates: [{ candidate_key: 'hydraulic_test', display_name: '逐根水压试验', test_standard: 'GB/T 241', calc_pressure_formula: 'P = 2SR/D', max_pressure_cap: 20, min_holding_time_s: 10, criteria_description: '试验压力按式 P=2SR/D 计算，最大试验压力不超过 20MPa，稳压时间不少于 10s 无渗漏' }, { candidate_key: 'eddy_current_test', display_name: '涡流探伤替代', test_standard: 'GB/T 7735-2016', required_level: 'E2H' }] }, source_clause: '6.6', applies_to_grades: 'ALL' },
    { rule_id: 'CORR_INTERGRANULAR', category: 'corrosion', property_key: 'intergranular_corrosion', display_name: '晶间腐蚀试验', rule_type: 'qualitative_enum', requirement_level: 'MANDATORY', description: '依据 GB/T 88888-2024 第6.8条，按 GB/T 4334-2020 方法 E 晶间腐蚀试验无晶间腐蚀倾向', criteria: { method: 'Method_E', test_standard: 'GB/T 4334-2020', expected: 'NO_CORROSION_TREND' }, source_clause: '6.8', applies_to_grades: 'ALL' },
    { rule_id: 'META_GRAIN_SIZE', category: 'metallographic', property_key: 'grain_size', display_name: '晶粒度', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 4, max: 7, unit: '级' }, source_clause: '6.9', applies_to_grades: 'ALL' },
    { rule_id: 'NDT_ULTRASONIC', category: 'ndt', property_key: 'ultrasonic_test', display_name: '超声检测', rule_type: 'qualitative_enum', requirement_level: 'MANDATORY', description: '依据 GB/T 88888-2024 第6.10.1.1条，逐根超声检测验收等级 U2', criteria: { required_level: 'U2', test_standard: 'GB/T 5777-2019' }, source_clause: '6.10.1.1', applies_to_grades: 'ALL' },
    { rule_id: 'SURF_QUALITY', category: 'surface', property_key: 'surface_quality', display_name: '表面外观质量', rule_type: 'qualitative_pass', requirement_level: 'MANDATORY', description: '依据 GB/T 88888-2024 第6.11条，内外表面无裂缝、折叠、轧折、离层和结疤', criteria: { expected: 'CLEAN_PASS' }, source_clause: '6.11', applies_to_grades: 'ALL' },
    { rule_id: 'SURF_ROUGHNESS', category: 'surface', property_key: 'surface_roughness', display_name: '表面粗糙度 (Ra)', rule_type: 'numeric_range', requirement_level: 'OPTIONAL_AGREED', criteria: { min: null, max: 0.8, unit: 'μm', rounding_decimals: 2 }, source_clause: '6.12', applies_to_grades: 'ALL' },
  ];
  const dynamicFormulas = overrides.dynamicFormulas ?? [
    { rule_id: 'CHEM_TI_STABILIZED', category: 'chemical', property_key: 'Ti', display_name: '钛含量 (Ti)', rule_type: 'dynamic_expression', requirement_level: 'MANDATORY', criteria: { formula_min: '5 * (ctx.chemical.C + ctx.chemical.N)', formula_max: null, min: null, max: 0.7, unit: '%', rounding_decimals: 3, note: 'Ti: 5(C+N) ~ 0.70%' }, source_clause: '表2', applies_to_grades: ['06Cr19Ni10'] },
  ];
  const toleranceTables = overrides.toleranceTables ?? [
    { table_id: 'TABLE_1', table_name: '表1 钢管公称外径的允许偏差', rules: [{ dimension_property: 'outer_diameter', process: 'cold_drawn', delivery_mode: 'min_wall', range_min: 6, range_max: 38, plus_tolerance_value: 0.4, plus_tolerance_is_percent: false, minus_tolerance_value: -0.4, minus_tolerance_is_percent: false, note: '外径 6~38mm：±0.40mm' }] },
  ];
  return async (_messages, opts) => {
    switch (opts.task) {
      case 'meta':
        return JSON.stringify({
          standard_id: 'GB/T 88888-2024',
          standard_name: '试验用不锈钢无缝钢管标准',
          version: '2024',
          description: '本文件规定了锅炉、热交换器用不锈钢无缝钢管的技术要求。本文件适用于锅炉、热交换器用不锈钢无缝钢管。',
          status: 'CURRENT',
          material_category: 'ferrous_pipe',
          applies_to_forms: ['tube_seamless'],
        });
      case 'slices_chemical':
        return JSON.stringify({
          slices: [
            { spec_key: 'S30408', primary_grade: '06Cr19Ni10', structure_type: 'austenitic', display_name: '06Cr19Ni10 (S30408)', aliases: [], chemical_rules: [{ rule_id: 'CHEM_S30408_C', category: 'chemical', property_key: 'C', display_name: 'C含量 (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: '表2' }, { rule_id: 'CHEM_S30408_Ni', category: 'chemical', property_key: 'Ni', display_name: 'Ni含量 (Ni)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 8, max: 11, unit: '%', rounding_decimals: 2 }, source_clause: '表2' }] },
            { spec_key: 'S30403', primary_grade: '022Cr19Ni10', structure_type: 'austenitic', display_name: '022Cr19Ni10 (S30403)', aliases: [], chemical_rules: [{ rule_id: 'CHEM_S30403_C', category: 'chemical', property_key: 'C', display_name: 'C含量 (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.030, unit: '%', rounding_decimals: 3 }, source_clause: '表2' }] },
          ],
        });
      case 'slices_mechanical':
        return JSON.stringify({
          slices: [
            { spec_key: 'S30408', primary_grade: '06Cr19Ni10', display_name: '06Cr19Ni10 (S30408)', aliases: [], mechanical_rules: [{ rule_id: 'MECH_S30408_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 520, max: null, unit: 'MPa' }, source_clause: '表3' }, { rule_id: 'MECH_S30408_RP02', category: 'mechanical', property_key: 'yield_strength_rp02', display_name: '规定塑性延伸强度 (Rp0.2)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 205, max: null, unit: 'MPa' }, source_clause: '表3' }] },
            { spec_key: 'S30403', primary_grade: '022Cr19Ni10', display_name: '022Cr19Ni10 (S30403)', aliases: [], mechanical_rules: [{ rule_id: 'MECH_S30403_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 480, max: null, unit: 'MPa' }, source_clause: '表3' }] },
          ],
        });
      case 'clauses':
        return JSON.stringify({ clauses: [{ clause_id: '6.5.1', title: '压扁', text: '壁厚不大于 10mm 的管子应进行压扁试验。' }, { clause_id: '6.6', title: '水压试验', text: '钢管应逐根进行水压试验，试验压力按式 P=2SR/D 计算。' }] });
      case 'process_rules':
        return JSON.stringify({ rules: processRules });
      case 'dynamic_formulas':
        return JSON.stringify({ rules: dynamicFormulas });
      case 'tolerance_tables':
        return JSON.stringify({ tables: toleranceTables });
      default:
        throw new Error(`未知任务类型: ${opts.task}`);
    }
  };
}

interface SliceRule {
  rule_id: string;
  category: string;
  rule_type: string;
  property_key: string;
  criteria: Record<string, never> & {
    formula_min?: string;
    rounding_decimals?: number;
    options?: Array<{ sub_key: string }>;
    candidates?: Array<{ candidate_key: string; calc_pressure_formula?: string; max_pressure_cap?: number }>;
    required_level?: string;
    method?: string;
    expected?: string;
  };
}

describe('v2 提取范围扩充端到端（mock LLM 覆盖全部任务，默认全量七族）', () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'normscale-ingest-v2-'));
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('全量七族提取走通：applies_to_grades 展开挂载、动态公式溯源、公差表落 meta、门禁全绿', async () => {
    const outRoot = path.join(tmpRoot, 'v2-out');
    const cacheRoot = path.join(tmpRoot, 'v2-cache');
    fs.mkdirSync(outRoot, { recursive: true });

    const result = await ingestStandard({
      rawText: V2_FIXTURE_TEXT,
      chatClient: createV2MockChat(),
      outRoot,
      cacheRoot,
    });

    expect(result.status).toBe('OK');
    expect(result.issues).toEqual([]);

    const stagingDir = result.stagingDir!;
    const meta = JSON.parse(fs.readFileSync(path.join(stagingDir, 'meta.json'), 'utf8'));
    expect(() => StandardMetaSchema.parse(meta)).not.toThrow();
    // v2 缺省声明全量七族（promote 按族合并接管范围）
    expect(meta.extracted_families).toEqual(['chemical', 'mechanical', 'process', 'metallographic', 'corrosion', 'ndt', 'surface']);
    // 公差表落 meta.tolerance_tables，S2 内部锚点 source_block 已剥离
    expect(meta.tolerance_tables.length).toBe(1);
    expect(meta.tolerance_tables[0].table_id).toBe('TABLE_1');
    expect(meta.tolerance_tables[0]).not.toHaveProperty('source_block');
    expect(() => DimensionToleranceTableSchema.parse(meta.tolerance_tables[0])).not.toThrow();

    const loadSlice = (file: string) => JSON.parse(fs.readFileSync(path.join(stagingDir, 'slices', file), 'utf8'));
    const s30408 = loadSlice('S30408_06Cr19Ni10.json');
    const s30403 = loadSlice('S30403_022Cr19Ni10.json');
    expect(() => SpecificationSliceSchema.parse(s30408)).not.toThrow();
    expect(() => SpecificationSliceSchema.parse(s30403)).not.toThrow();

    const rulesOf = (slice: { evaluation_rules: SliceRule[] }, ruleId: string) =>
      slice.evaluation_rules.find((r) => r.rule_id === ruleId);
    const ruleIds = (slice: { evaluation_rules: SliceRule[] }) => slice.evaluation_rules.map((r) => r.rule_id);

    // ALL 展开：同一规则挂载到两个切片，rule_id 追加 _{spec_key} 保证全局唯一
    expect(rulesOf(s30408, 'PROC_FLATTENING_S30408')).toBeDefined();
    expect(rulesOf(s30403, 'PROC_FLATTENING_S30403')).toBeDefined();
    // 限定牌号：扩口规则只挂载到 06Cr19Ni10 切片
    expect(rulesOf(s30408, 'PROC_FLARING_S30408')).toBeDefined();
    expect(ruleIds(s30403)).not.toContain('PROC_FLARING_S30403');
    // 动态公式：Ti 公式挂载到 S30408，formula_min 保持项目表达式惯例
    const tiRule = rulesOf(s30408, 'CHEM_TI_STABILIZED_S30408');
    expect(tiRule).toBeDefined();
    expect(tiRule!.rule_type).toBe('dynamic_expression');
    expect(tiRule!.criteria.formula_min).toBe('5 * (ctx.chemical.C + ctx.chemical.N)');
    expect(tiRule!.criteria.rounding_decimals).toBe(3);
    expect(ruleIds(s30403)).not.toContain('CHEM_TI_STABILIZED_S30403');
    // or_choice_group / alternative_group / qualitative 族规则结构完整
    const hardness = rulesOf(s30408, 'MECH_HARDNESS_S30408')!;
    expect(hardness.rule_type).toBe('or_choice_group');
    expect(hardness.criteria.options!.map((o) => o.sub_key).sort()).toEqual(['HBW', 'HRB', 'HV']);
    const tightness = rulesOf(s30408, 'NDT_TIGHTNESS_S30408')!;
    expect(tightness.rule_type).toBe('alternative_group');
    expect(tightness.criteria.candidates![0]!.calc_pressure_formula).toBe('P = 2SR/D');
    expect(tightness.criteria.candidates![0]!.max_pressure_cap).toBe(20);
    expect(rulesOf(s30408, 'NDT_ULTRASONIC_S30408')!.criteria.required_level).toBe('U2');
    expect(rulesOf(s30408, 'CORR_INTERGRANULAR_S30408')!.criteria.method).toBe('Method_E');
    expect(rulesOf(s30408, 'SURF_QUALITY_S30408')!.criteria.expected).toBe('CLEAN_PASS');
    // 两切片均覆盖全量七族（类别覆盖 lint 缺省全量驱动）
    for (const slice of [s30408, s30403]) {
      const cats = new Set(slice.evaluation_rules.map((r: SliceRule) => r.category));
      for (const fam of ['chemical', 'mechanical', 'process', 'metallographic', 'corrosion', 'ndt', 'surface']) {
        expect(cats.has(fam)).toBe(true);
      }
      // S2 内部字段（source_clause/applies_to_grades）落盘时已剥离
      slice.evaluation_rules.forEach((r: Record<string, unknown>) => {
        expect(r).not.toHaveProperty('source_clause');
        expect(r).not.toHaveProperty('applies_to_grades');
      });
    }
    // 部分覆盖标记 = 全量七族
    expect(s30408.coverage).toBe('partial');
    expect(s30408.extracted_families).toEqual(['chemical', 'mechanical', 'process', 'metallographic', 'corrosion', 'ndt', 'surface']);

    const report = fs.readFileSync(path.join(stagingDir, 'review-report.md'), 'utf8');
    expect(report).toContain('PROC_FLATTENING_S30408');
    expect(report).toContain('CHEM_TI_STABILIZED_S30408');
    expect(report).toContain('全部通过');
  }, 60000);

  it('applies_to_grades 臆造牌号：S2 展开未挂载移交 S3 拦截，MANUAL_REVIEW 且不落 staging', async () => {
    const outRoot = path.join(tmpRoot, 'v2-fabric-out');
    const cacheRoot = path.join(tmpRoot, 'v2-fabric-cache');
    fs.mkdirSync(outRoot, { recursive: true });

    const result = await ingestStandard({
      rawText: V2_FIXTURE_TEXT,
      chatClient: createV2MockChat({
        processRules: [{ rule_id: 'PROC_FLARING', category: 'process', property_key: 'flaring_test', display_name: '扩口试验', rule_type: 'qualitative_and_numeric', requirement_level: 'MANDATORY', criteria: { cone_angle_deg: 60, flaring_rate_min_percent: 18, expected_visual_result: 'NO_CRACKS' }, source_clause: '6.5.2', applies_to_grades: ['S99999'] }],
      }),
      outRoot,
      cacheRoot,
    });

    expect(result.status).toBe('MANUAL_REVIEW');
    expect(result.issues.some((i) => i.code === 'LINT_APPLIES_TO_GRADES' && i.message.includes('S99999'))).toBe(true);
    expect(fs.existsSync(path.join(cacheRoot, 'staging', 'GB_T_88888_2024'))).toBe(false);
    expect(fs.existsSync(path.join(outRoot, 'GB_T_88888_2024'))).toBe(false);
  }, 60000);

  it('跨标准外部公差引用：不产生臆造 rules，MANUAL_REVIEW 级 issue + 抽检报告显著标注', async () => {
    const outRoot = path.join(tmpRoot, 'v2-ext-out');
    const cacheRoot = path.join(tmpRoot, 'v2-ext-cache');
    fs.mkdirSync(outRoot, { recursive: true });

    const result = await ingestStandard({
      rawText: V2_FIXTURE_TEXT,
      chatClient: createV2MockChat({
        toleranceTables: [{ table_id: 'NB_T_47019_1_TABLE_2', table_name: 'NB/T 47019.1 表2 冷拔(轧)无缝管公称外径允许偏差', external_reference: 'NB/T 47019.1 表2', rules: [] }],
      }),
      outRoot,
      cacheRoot,
    });

    expect(result.status).toBe('MANUAL_REVIEW');
    expect(result.issues.some((i) => i.code === 'EXTERNAL_TOLERANCE_REFERENCE' && i.message.includes('NB/T 47019.1 表2'))).toBe(true);
    // 门禁失败：报告落缓存目录并显著标注外部引用（严禁臆造被引标准数据）
    expect(result.reportPath).toBeTruthy();
    const report = fs.readFileSync(result.reportPath!, 'utf8');
    expect(report).toContain('跨标准外部公差引用');
    expect(report).toContain('NB/T 47019.1 表2');
    expect(report).toContain('严禁臆造');
    expect(fs.existsSync(path.join(cacheRoot, 'staging', 'GB_T_88888_2024'))).toBe(false);
  }, 60000);
});
