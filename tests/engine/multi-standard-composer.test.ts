import { describe, it, expect, beforeAll } from 'vitest';
import { FileRuleStore } from '@/repository/file-rule-store';
import {
  composeMultiStandardSlices,
  SliceWithStandardMeta,
  humanizeDynamicFormulaText,
} from '@/engine/multi-standard-composer';
import { SpecificationSlice } from '@/schemas/standard.schema';

describe('MultiStandardComposer 多标准规则切片合成器测试', () => {
  let store: FileRuleStore;
  let gbSlice: SpecificationSlice;
  let nbSlice: SpecificationSlice;

  beforeAll(async () => {
    store = new FileRuleStore();
    const gb = await store.resolveRuleSlice('GB/T 13296-2023', 'S32168');
    const nb = await store.resolveRuleSlice('NB/T 47019.5-2021', 'S32168');
    if (!gb) throw new Error('未找到 GB/T 13296-2023 S32168 切片');
    if (!nb) throw new Error('未找到 NB/T 47019.5-2021 S32168 切片');
    gbSlice = gb;
    nbSlice = nb;
  });

  it('双标准合成 (GB/T 13296 + NB/T 47019.5): 检验项目取全量并集 (Union)', () => {
    const input: SliceWithStandardMeta[] = [
      { slice: gbSlice, standardId: 'GB/T 13296-2023', standardName: '通用产品国标' },
      { slice: nbSlice, standardId: 'NB/T 47019.5-2021', standardName: '承压管订货技术条件' },
    ];

    const composite = composeMultiStandardSlices(input);
    expect(composite).toBeDefined();
    if (!composite) return;

    expect(composite.composite_meta.source_standards).toEqual([
      'GB/T 13296-2023',
      'NB/T 47019.5-2021',
    ]);
    expect(composite.evaluation_rules.length).toBeGreaterThan(gbSlice.evaluation_rules.length);

    // 验证 NB/T 专属检验项被并入合成切片
    const keys = composite.evaluation_rules.map(r => r.property_key);
    expect(keys).toContain('flaring_test'); // 扩口试验
    expect(keys).toContain('grain_size');   // 晶粒度评级
    expect(keys).toContain('surface_quality'); // 表面质量
  });

  it('共有检验项取严苛交集 (Strict Superiority / 包络线原则): 断后伸长率取 NB/T 47019.5 (≥40%)', () => {
    const input: SliceWithStandardMeta[] = [
      { slice: gbSlice, standardId: 'GB/T 13296-2023' },
      { slice: nbSlice, standardId: 'NB/T 47019.5-2021' },
    ];

    const composite = composeMultiStandardSlices(input);
    expect(composite).toBeDefined();

    const elongRule = composite?.evaluation_rules.find(r => r.property_key === 'elongation_A');
    expect(elongRule).toBeDefined();
    // GB 下限 35%, NB 下限 40% -> 必须取 40%
    expect(elongRule?.criteria['min']).toBe(40);
    expect(elongRule?.composite_trace).toBeDefined();
    expect(elongRule?.composite_trace?.is_tightened).toBe(true);
    expect(elongRule?.composite_trace?.governing_standard_id).toBe('NB/T 47019.5-2021');
    expect(elongRule?.composite_trace?.dual_standard_requirement_text).toContain('40');
    expect(elongRule?.composite_trace?.dual_standard_requirement_text).toContain('35');
    expect(elongRule?.composite_trace?.arbitration_reason).toContain('取严苛下限值');
  });

  it('无损探伤灵敏度就高优先: 替代高等级涡流提升至 E2H 级 (高于 E3H)', () => {
    const input: SliceWithStandardMeta[] = [
      { slice: gbSlice, standardId: 'GB/T 13296-2023' },
      { slice: nbSlice, standardId: 'NB/T 47019.5-2021' },
    ];

    const composite = composeMultiStandardSlices(input);
    const ndtRule = composite?.evaluation_rules.find(r => r.property_key === 'pressure_tightness');
    expect(ndtRule).toBeDefined();
    expect(ndtRule?.composite_trace?.is_tightened).toBe(true);

    const eddyCandidate = ndtRule?.criteria['candidates']?.find((c: any) => c.candidate_key === 'eddy_current_test');
    expect(eddyCandidate).toBeDefined();
    expect(eddyCandidate?.required_level).toBe('E2H');
  });

  it('支持任意数量标准 (N >= 3) 的多标叠加与多层来源溯源', () => {
    // 模拟第 3 份工程协议标准 (进一步加严 S 元素 <= 0.005%, 伸长率 >= 42%)
    const customEngineeringSlice: SpecificationSlice = {
      spec_key: 'S32168',
      spec_type: 'grade',
      display_name: '06Cr18Ni11Ti 镇海炼化项目专用技术协议',
      aliases: ['S32168-ZH'],
      evaluation_rules: [
        {
          rule_id: 'CHEM_CUSTOM_S',
          category: 'chemical',
          property_key: 'S',
          display_name: '硫含量 (S 超纯级)',
          rule_type: 'numeric_range',
          requirement_level: 'MANDATORY',
          criteria: { min: null, max: 0.005, unit: '%' },
        },
        {
          rule_id: 'MECH_CUSTOM_A',
          category: 'mechanical',
          property_key: 'elongation_a',
          display_name: '断后伸长率 (A 高塑性)',
          rule_type: 'numeric_range',
          requirement_level: 'MANDATORY',
          criteria: { min: 42, max: null, unit: '%' },
        },
      ],
    };

    const input: SliceWithStandardMeta[] = [
      { slice: gbSlice, standardId: 'GB/T 13296-2023' },
      { slice: nbSlice, standardId: 'NB/T 47019.5-2021' },
      { slice: customEngineeringSlice, standardId: 'Q/ZH-2026-TUBE-01', standardName: '镇海炼化专用协议' },
    ];

    const composite = composeMultiStandardSlices(input);
    expect(composite).toBeDefined();
    expect(composite?.composite_meta.source_standards.length).toBe(3);

    // 伸长率在 3 份标准中分别为 35%, 40%, 42% -> 严苛交集应为 >= 42%
    const elongRule = composite?.evaluation_rules.find(r => r.property_key === 'elongation_A');
    expect(elongRule?.criteria['min']).toBe(42);
    expect(elongRule?.composite_trace?.governing_standard_id).toBe('Q/ZH-2026-TUBE-01');
    expect(elongRule?.composite_trace?.sources.length).toBe(3);

    // 硫含量在 3 份标准中分别为 0.015%, 0.015%, 0.005% -> 严苛交集应为 <= 0.005%
    const sRule = composite?.evaluation_rules.find(r => r.property_key === 'S');
    expect(sRule?.criteria['max']).toBe(0.005);
    expect(sRule?.composite_trace?.governing_standard_id).toBe('Q/ZH-2026-TUBE-01');
  });

  it('FileRuleStore.resolveCompositeSlice 端到端集成调用', async () => {
    const composite = await store.resolveCompositeSlice(
      ['GB/T 13296-2023', 'NB/T 47019.5-2021'],
      'S32168'
    );
    expect(composite).toBeDefined();
    expect(composite?.composite_meta.source_standards).toContain('GB/T 13296-2023');
    expect(composite?.composite_meta.source_standards).toContain('NB/T 47019.5-2021');
  });

  it('采购技术协议 (TA) 默认优先级最高：加严指标主导生效', () => {
    const taSlice: SpecificationSlice = {
      spec_key: 'S32168',
      spec_type: 'grade',
      display_name: 'TA-2026-X01 某化工厂采购技术协议',
      aliases: [],
      evaluation_rules: [
        {
          rule_id: 'TA_TENSILE',
          category: 'mechanical',
          property_key: 'tensile_strength',
          display_name: '抗拉强度 (协议加严)',
          rule_type: 'numeric_range',
          requirement_level: 'MANDATORY',
          criteria: { min: 560, max: null, unit: 'MPa' },
        },
      ],
    };

    const input: SliceWithStandardMeta[] = [
      { slice: gbSlice, standardId: 'GB/T 13296-2023' }, // 国标 Rm >= 520
      { slice: taSlice, standardId: 'TA-2026-X01', category: 'technical_agreement', priority: 1 },
    ];

    const composite = composeMultiStandardSlices(input);
    expect(composite).toBeDefined();

    const rmRule = composite?.evaluation_rules.find(r => r.property_key === 'tensile_strength');
    expect(rmRule).toBeDefined();
    // 协议 Rm >= 560 严于 国标 >= 520，取 560
    expect(rmRule?.criteria['min']).toBe(560);
    expect(rmRule?.composite_trace?.governing_standard_id).toBe('TA-2026-X01');
    expect(rmRule?.composite_trace?.is_statutory_relaxation_risk).toBe(false);
  });

  it('分级管控：当技术协议放宽法定强标底线时，采纳协议限值但置位 is_statutory_relaxation_risk 与警示文案', () => {
    // 国标磷 P 要求 <= 0.035%，技术协议因特殊焊接工艺放宽至 <= 0.040%
    const taRelaxSlice: SpecificationSlice = {
      spec_key: 'S32168',
      spec_type: 'grade',
      display_name: 'TA-2026-WELD 焊接专用技术协议 (放宽磷含量)',
      aliases: [],
      evaluation_rules: [
        {
          rule_id: 'TA_CHEM_P',
          category: 'chemical',
          property_key: 'P',
          display_name: '磷含量 (特殊工艺放宽)',
          rule_type: 'numeric_range',
          requirement_level: 'MANDATORY',
          criteria: { min: null, max: 0.040, unit: '%' },
        },
      ],
    };

    const input: SliceWithStandardMeta[] = [
      { slice: gbSlice, standardId: 'GB/T 13296-2023' }, // 国标 P <= 0.035%
      { slice: taRelaxSlice, standardId: 'TA-2026-WELD', category: 'technical_agreement', priority: 1 },
    ];

    const composite = composeMultiStandardSlices(input);
    expect(composite).toBeDefined();

    const pRule = composite?.evaluation_rules.find(r => r.property_key === 'P');
    expect(pRule).toBeDefined();
    // 依据最高优先级技术协议采纳 0.040%
    expect(pRule?.criteria['max']).toBe(0.040);
    expect(pRule?.composite_trace?.governing_standard_id).toBe('TA-2026-WELD');
    // 命中放宽法定底线风险
    expect(pRule?.composite_trace?.is_statutory_relaxation_risk).toBe(true);
    expect(pRule?.composite_trace?.statutory_baseline).toContain('0.035');
    expect(pRule?.composite_trace?.statutory_relaxation_warning).toContain('放宽了法定标准底线要求');
  });

  it('标准代号在双标尺溯源文本中必须保留完整年份 (如 NB/T 47019.5-2021、GB/T 13296-2023)', () => {
    const input: SliceWithStandardMeta[] = [
      { slice: gbSlice, standardId: 'GB/T 13296-2023' },
      { slice: nbSlice, standardId: 'NB/T 47019.5-2021' },
    ];

    const composite = composeMultiStandardSlices(input);
    const elongRule = composite?.evaluation_rules.find(r => r.property_key === 'elongation_A');
    expect(elongRule?.composite_trace?.dual_standard_requirement_text).toContain('[NB/T 47019.5-2021]');
    expect(elongRule?.composite_trace?.dual_standard_requirement_text).toContain('[GB/T 13296-2023]');
  });

  it('humanizeDynamicFormulaText 将变量名美化为化学符号并注入实测计算值', () => {
    const raw = '≥ 5 * (ctx.chemical.C + ctx.chemical.N) 且 ≤ 0.7%';
    const humanized = humanizeDynamicFormulaText(raw, 0.285, '%');
    expect(humanized).toBe('≥ 5×(C+N) [即 ≥ 0.285%] 且 ≤ 0.7%');
  });
});
