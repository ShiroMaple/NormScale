import { describe, it, expect } from 'vitest';
import { applyClausePatterns } from '@/ingestion/clause-patterns';
import { dedupeSliceRulesByPropertyKey, extractAll, mountRulesByGrades } from '@/ingestion/llm-extract';
import { runGates } from '@/ingestion/gates';
import type { ChatClient, DraftRule, DraftSlice, TextBlock } from '@/ingestion/types';

/* 阶段 B 确定性法条模式预扫描器测试：GB 7.7.1 真实原句、NB 6.9 晶粒度句、
   英文豁免/协商/作用域 fixture、条件触发、零命中零副作用、extractAll 接线与确定性优先。严禁真实 LLM。 */

// GB/T 13296-2023 7.7.1 真实原句
const GB_771_BLOCK: TextBlock = {
  blockType: 'process_ndt_clauses',
  clauseRef: '7.7.1',
  text: '7.7.1 牌号为 07Cr19Ni10、16Cr23Ni13、20Cr25Ni20、07Cr17Ni12Mo2、07Cr19Ni11Ti、07Cr18Ni11Nb 的钢管可不进行晶间腐蚀试验，其他奥氏体型钢管应进行晶间腐蚀试验。',
};

// NB/T 47019.5-2021 6.9 晶粒度真实原句
const NB_69_BLOCK: TextBlock = {
  blockType: 'process_ndt_clauses',
  clauseRef: '6.9',
  text: '6.9 晶粒度\n07Cr19Ni10、07Cr17Ni12Mo2、07Cr19Ni11Ti、07Cr18Ni11Nb 牌号管子的晶粒度级别为 4 级～7 级。',
};

function slice(specKey: string, grade: string, structureType: string): DraftSlice {
  return {
    spec_key: specKey,
    spec_type: 'grade',
    standard_code: 'GB/T 13296-2023',
    display_name: `${grade} (${specKey})`,
    primary_grade: grade,
    structure_type: structureType,
    description: `${grade} 试验切片`,
    aliases: [],
    evaluation_rules: [],
  };
}

/** GB 13296 牌号全集形态：6 豁免（奥氏体）+ 2 其余奥氏体 + 3 铁素体 */
function gbSlices(): DraftSlice[] {
  return [
    slice('S30409', '07Cr19Ni10', 'austenitic'),
    slice('S30920', '16Cr23Ni13', 'austenitic'),
    slice('S31020', '20Cr25Ni20', 'austenitic'),
    slice('S31609', '07Cr17Ni12Mo2', 'austenitic'),
    slice('S32169', '07Cr19Ni11Ti', 'austenitic'),
    slice('S34779', '07Cr18Ni11Nb', 'austenitic'),
    slice('S30408', '06Cr19Ni10', 'austenitic'),
    slice('S31608', '06Cr17Ni12Mo2', 'austenitic'),
    slice('S11306', '06Cr13', 'ferritic'),
    slice('S11710', '10Cr17', 'ferritic'),
    slice('S12791', '008Cr27Mo', 'ferritic'),
  ];
}

describe('阶段 B：GB 7.7.1 真实原句全套断言', () => {
  it('6 豁免牌号各得 exemption/EXEMPT/reason；奥氏体作用域排除豁免牌号；铁素体三牌号零规则', () => {
    const slices = gbSlices();
    const result = applyClausePatterns([GB_771_BLOCK], slices);
    expect(result.hitClauseRefs.has('7.7.1')).toBe(true);

    const { perSlice, unmounted } = mountRulesByGrades(result.rules, slices);
    expect(unmounted).toEqual([]);

    // 6 个豁免牌号：exemption 规则且 reason 含原文
    const exemptKeys = ['S30409', 'S30920', 'S31020', 'S31609', 'S32169', 'S34779'];
    for (const key of exemptKeys) {
      const idx = slices.findIndex((s) => s.spec_key === key);
      const rules = perSlice[idx]!;
      const exempt = rules.find((r) => r.rule_type === 'exemption');
      expect(exempt, `${key} 应有 exemption`).toBeDefined();
      expect(exempt!.requirement_level).toBe('EXEMPT');
      expect(exempt!.property_key).toBe('intergranular_corrosion');
      expect(String(exempt!.criteria.reason)).toContain('可不进行晶间腐蚀试验');
      expect(exempt!.deterministic).toBe(true);
    }

    // 其余 2 个奥氏体牌号：正常检验规则（作用域确定性计算），无 exemption
    for (const key of ['S30408', 'S31608']) {
      const idx = slices.findIndex((s) => s.spec_key === key);
      const rules = perSlice[idx]!;
      const normal = rules.find((r) => r.property_key === 'intergranular_corrosion' && r.rule_type !== 'exemption');
      expect(normal, `${key} 应有作用域正常规则`).toBeDefined();
      expect(normal!.requirement_level).toBe('MANDATORY');
      expect(normal!.criteria).toEqual({ expected: 'NO_CORROSION_TREND' });
      expect(rules.some((r) => r.rule_type === 'exemption')).toBe(false);
    }

    // 铁素体三牌号：晶间腐蚀零规则
    for (const key of ['S11306', 'S11710', 'S12791']) {
      const idx = slices.findIndex((s) => s.spec_key === key);
      expect(perSlice[idx]!.some((r) => r.property_key === 'intergranular_corrosion')).toBe(false);
    }
  });

  it('模式产出过全量门禁（含 description 原文层与溯源）', () => {
    const slices = gbSlices();
    const result = applyClausePatterns([GB_771_BLOCK], slices);
    const { perSlice } = mountRulesByGrades(result.rules, slices);
    slices.forEach((s, i) => s.evaluation_rules.push(...perSlice[i]!));
    const gate = runGates({
      meta: { standard_id: 'GB/T 13296-2023', standard_name: '锅炉、热交换器用不锈钢无缝钢管', version: '2023', description: '本文件规定了技术要求。', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] },
      slices,
      clauses: [],
      clauseTextIndex: { '7.7.1': GB_771_BLOCK.text },
      expectedGradeRows: null,
      declaredFamilies: ['corrosion'],
    });
    expect(gate.issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
  });
});

describe('阶段 B：NB 6.9 晶粒度牌号清单限定', () => {
  it('4 牌号清单挂载 grain_size 4~7 级；清单外牌号零规则', () => {
    const slices = [
      slice('S30409', '07Cr19Ni10', 'austenitic'),
      slice('S31609', '07Cr17Ni12Mo2', 'austenitic'),
      slice('S32169', '07Cr19Ni11Ti', 'austenitic'),
      slice('S34779', '07Cr18Ni11Nb', 'austenitic'),
      slice('S30408', '06Cr19Ni10', 'austenitic'),
    ];
    const result = applyClausePatterns([NB_69_BLOCK], slices);
    expect(result.hitClauseRefs.has('6.9')).toBe(true);
    const { perSlice, unmounted } = mountRulesByGrades(result.rules, slices);
    expect(unmounted).toEqual([]);
    const listed = ['S30409', 'S31609', 'S32169', 'S34779'];
    for (const key of listed) {
      const idx = slices.findIndex((s) => s.spec_key === key);
      const grain = perSlice[idx]!.find((r) => r.property_key === 'grain_size');
      expect(grain, `${key} 应有晶粒度规则`).toBeDefined();
      expect(grain!.rule_type).toBe('numeric_range');
      expect(grain!.criteria).toMatchObject({ min: 4, max: 7, unit: '级' });
    }
    const otherIdx = slices.findIndex((s) => s.spec_key === 'S30408');
    expect(perSlice[otherIdx]!.some((r) => r.property_key === 'grain_size')).toBe(false);
  });
});

describe('阶段 B：英文句式（豁免/作用域/协商）与条件触发', () => {
  it('en 豁免：grade 列表 + need not be subjected to → exemption', () => {
    const block: TextBlock = {
      blockType: 'process_ndt_clauses',
      clauseRef: '7.7.1',
      text: '7.7.1 TP304, TP316 and TP321 tubes need not be subjected to intergranular corrosion testing.',
    };
    const slices = [slice('S30400', 'TP304', 'austenitic'), slice('S31600', 'TP316', 'austenitic'), slice('S32100', 'TP321', 'austenitic')];
    const result = applyClausePatterns([block], slices);
    expect(result.hitClauseRefs.has('7.7.1')).toBe(true);
    const { perSlice, unmounted } = mountRulesByGrades(result.rules, slices);
    expect(unmounted).toEqual([]);
    expect(perSlice.flat().filter((r) => r.rule_type === 'exemption').length).toBe(3);
  });

  it('en 作用域 + 协商降级别：other austenitic tubes shall be … when specified by the purchaser -> OPTIONAL_AGREED', () => {
    const block: TextBlock = {
      blockType: 'process_ndt_clauses',
      clauseRef: '7.7.2',
      text: '7.7.2 Other austenitic tubes shall be subjected to intergranular corrosion testing when specified by the purchaser.',
    };
    const slices = [slice('S30408', '06Cr19Ni10', 'austenitic'), slice('S11306', '06Cr13', 'ferritic')];
    const result = applyClausePatterns([block], slices);
    const { perSlice } = mountRulesByGrades(result.rules, slices);
    const austeniticRules = perSlice[0]!;
    expect(austeniticRules.length).toBe(1);
    expect(austeniticRules[0]!.requirement_level).toBe('OPTIONAL_AGREED');
    expect(perSlice[1]!).toEqual([]); // 铁素体不挂
  });

  it('条件触发：zh/en 壁厚表达式转 JS trigger_condition 并附到同句产出', () => {
    const zhBlock: TextBlock = {
      blockType: 'process_ndt_clauses',
      clauseRef: '6.5.2',
      text: '6.5.2 壁厚不小于 1.7mm 的钢管可不进行扩口试验。',
    };
    const zh = applyClausePatterns([zhBlock], [slice('S30408', '06Cr19Ni10', 'austenitic')]);
    const zhRule = zh.rules.find((r) => r.rule_type === 'exemption');
    expect(zhRule).toBeDefined();
    expect(zhRule!.property_key).toBe('flaring_test');
    expect(zhRule!.trigger_condition).toBe('ctx.header.dimensions.wall_thickness_mm >= 1.7');

    const enBlock: TextBlock = {
      blockType: 'process_ndt_clauses',
      clauseRef: '7.4.2',
      text: '7.4.2 Tubes with wall thickness not less than 1.7 mm need not be subjected to intergranular corrosion testing.',
    };
    const en = applyClausePatterns([enBlock], [slice('S30408', 'S30408', 'austenitic')]);
    const enRule = en.rules.find((r) => r.rule_type === 'exemption');
    expect(enRule).toBeDefined();
    expect(enRule!.trigger_condition).toBe('ctx.header.dimensions.wall_thickness_mm >= 1.7');
  });
});

describe('阶段 B：未命中零产出零副作用 / 闭集外牌号拦截', () => {
  it('非模式条款块：零规则、零命中、输出与输入一致', () => {
    const block: TextBlock = {
      blockType: 'process_ndt_clauses',
      clauseRef: '6.11.1',
      text: '6.11.1 无缝管的内外表面不应有裂缝、折叠、轧折、离层和结疤。',
    };
    const result = applyClausePatterns([block], gbSlices());
    expect(result.rules).toEqual([]);
    expect(result.hitClauseRefs.size).toBe(0);
  });

  it('闭集外牌号：挂载未命中进 unmounted 移交 S3（绝不静默）', () => {
    const block: TextBlock = {
      blockType: 'process_ndt_clauses',
      clauseRef: '7.7.1',
      text: '7.7.1 牌号为 S99999、S88888 的钢管可不进行晶间腐蚀试验。',
    };
    const slices = [slice('S30408', '06Cr19Ni10', 'austenitic')];
    const result = applyClausePatterns([block], slices);
    expect(result.rules.length).toBe(1);
    expect(result.hitClauseRefs.has('7.7.1')).toBe(true);
    const { perSlice, unmounted } = mountRulesByGrades(result.rules, slices);
    expect(perSlice.flat()).toEqual([]);
    expect(unmounted.map((r) => r.rule_id)).toEqual(['EXEMPT_INTERGRANULAR_CORROSION']);
  });
});

describe('阶段 B：extractAll 接线与确定性优先级', () => {
  it('模式命中块剔除出 LLM process_rules 输入；模式产出进 drafts；未命中块照常走 LLM', async () => {
    const chemBlock: TextBlock = {
      blockType: 'chemistry_table',
      clauseRef: '表3',
      text: '表3 钢的牌号和化学成分\n奥氏体型 1 06Cr19Ni10 S30408 0.08\n铁素体型 2 06Cr13 S11306 0.06',
    };
    const processCalls: string[] = [];
    const chat: ChatClient = async (_messages, opts) => {
      switch (opts.task) {
        case 'meta':
          return JSON.stringify({ standard_id: 'GB/T 13296-2023', standard_name: '试验标准', version: '2023', description: '本文件规定了技术要求。', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] });
        case 'slices_chemical':
          return JSON.stringify({ slices: [
            { spec_key: 'S30408', primary_grade: '06Cr19Ni10', structure_type: 'austenitic', display_name: '06Cr19Ni10 (S30408)', aliases: [], chemical_rules: [{ rule_id: 'CHEM_S30408_C', category: 'chemical', property_key: 'C', display_name: 'C含量', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: '表3' }] },
            { spec_key: 'S11306', primary_grade: '06Cr13', structure_type: 'ferritic', display_name: '06Cr13 (S11306)', aliases: [], chemical_rules: [{ rule_id: 'CHEM_S11306_C', category: 'chemical', property_key: 'C', display_name: 'C含量', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.06, unit: '%', rounding_decimals: 3 }, source_clause: '表3' }] },
          ] });
        case 'slices_mechanical':
          return JSON.stringify({ slices: [] });
        case 'clauses':
          return JSON.stringify({ clauses: [] });
        case 'process_rules':
          processCalls.push('called');
          return JSON.stringify({ rules: [] });
        case 'dynamic_formulas':
          return JSON.stringify({ rules: [] });
        case 'tolerance_tables':
          return JSON.stringify({ tables: [] });
        default:
          throw new Error(`未知任务类型: ${opts.task}`);
      }
    };
    const messages: string[] = [];
    const drafts = await extractAll([chemBlock, GB_771_BLOCK], chat, (m) => messages.push(m));
    // 模式命中块未走 LLM（仅未命中块调用；本例 process 通道仅此一块 -> 零调用）
    expect(processCalls.length).toBe(0);
    expect(messages.some((m) => m.includes('确定性法条模式提取'))).toBe(true);
    const s30408 = drafts.slices.find((s) => s.spec_key === 'S30408')!;
    expect(s30408.evaluation_rules.some((r) => r.rule_type === 'exemption' || (r.property_key === 'intergranular_corrosion' && r.rule_type !== 'exemption'))).toBe(true);
    const s11306 = drafts.slices.find((s) => s.spec_key === 'S11306')!;
    expect(s11306.evaluation_rules.some((r) => r.property_key === 'intergranular_corrosion')).toBe(false);
  });

  it('同切片同 property_key：确定性版本胜出于 LLM 产物（即使 LLM criteria 更丰富）', () => {
    const llmRule: DraftRule = {
      rule_id: 'LLM_INTERGRANULAR',
      category: 'corrosion',
      property_key: 'intergranular_corrosion',
      display_name: '晶间腐蚀试验',
      rule_type: 'qualitative_enum',
      requirement_level: 'MANDATORY',
      criteria: { method: 'Method_E', test_standard: 'GB/T 4334-2020', expected: 'NO_CORROSION_TREND', extra: 'richer-llm-criteria' },
      source_clause: '7.7',
    };
    const detRule: DraftRule = {
      rule_id: 'SCOPE_INTERGRANULAR_CORROSION_S30408',
      category: 'corrosion',
      property_key: 'intergranular_corrosion',
      display_name: '作用域限定',
      description: '确定性法条模式命中（作用域限定）',
      rule_type: 'qualitative_pass',
      requirement_level: 'MANDATORY',
      criteria: { expected: 'NO_CORROSION_TREND' },
      source_clause: '7.7.1',
      deterministic: true,
    };
    const target = slice('S30408', '06Cr19Ni10', 'austenitic');
    target.evaluation_rules = [llmRule, detRule];
    const stats = dedupeSliceRulesByPropertyKey([target]);
    expect(stats.dropped).toBe(1);
    expect(target.evaluation_rules.length).toBe(1);
    expect(target.evaluation_rules[0]!.rule_id).toBe('SCOPE_INTERGRANULAR_CORROSION_S30408');
  });
});
