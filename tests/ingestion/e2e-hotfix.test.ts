import { describe, it, expect } from 'vitest';
import { EN_ASME_PROFILE } from '@/ingestion/standard-profile';
import { classifyBlock, segmentText } from '@/ingestion/segmenter';
import { extractAll, gradeCatalogLines, mountRulesByGrades } from '@/ingestion/llm-extract';
import type { ChatClient, DraftRule, DraftSlice, TextBlock } from '@/ingestion/types';

/* SA-213 E2E en 档定点修复测试（⑤③②）：
   ⑤ surface 族路由（真实块文本 fixture）  ③ unified_code 去冒充 + UNS 挂载正反
   ② 硬度单位标题拒绝（TABLE4 碎块根因） + 力学牌号主键闭集注入。严禁真实 LLM。 */

describe('⑤ surface 族路由（SA-213 第 14 节真实块文本）', () => {
  // 取自 blocks.json 的 14/14.1/14.2/14.4 真实文本（含断行）
  const blocks141: Array<[string, string]> = [
    ['14', '14. Surface Condition'],
    ['14.1', '14.1 Ferritic alloy cold-finished steel tubes shall be free of\nscale and suitable for inspection. A slight amount of oxidation\nis not considered scale.'],
    ['14.2', '14.2 Ferritic alloy hot-finished steel tubes shall be free of\nloose scale and suitable for inspection.'],
    ['14.3', '14.3 Stainless steel tubes shall be pickled free of scale.\nWhen bright annealing is used, pickling is not necessary.'],
    ['14.4', '14.4 Any special finish requirement shall be subject to\nagreement between the supplier and the purchaser.'],
  ];

  it.each(blocks141)('块 %s 路由进 process_ndt_clauses', (ref, text) => {
    expect(classifyBlock(ref, text, EN_ASME_PROFILE)).toBe('process_ndt_clauses');
  });

  it('误伤防护：cold finished / 标志条款不被 surface 关键词误捕', () => {
    expect(classifyBlock('6.1', '6.1 Manufacture and Condition—Tubes shall be made by the seamless process and shall be either hot finished or cold finished, as specified.', EN_ASME_PROFILE)).toBe('other');
    expect(classifyBlock('16.1', '16.1 In addition to the marking prescribed in Specification A1016/A1016M, the marking shall include: the condition, hot finished or cold finished.', EN_ASME_PROFILE)).toBe('other');
  });
});

describe('③ unified_code 去冒充 + UNS 挂载（正反对例）', () => {
  const chatNoUns: ChatClient = async (_messages, opts) => {
    switch (opts.task) {
      case 'meta':
        return JSON.stringify({ standard_id: 'SA-213/SA-213M', standard_name: 'Tubes', version: '2023', description: 'Covers tubes.', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] });
      case 'slices_chemical':
        // LLM 未输出 unified_code（旧行为会回填 spec_key 冒充）
        return JSON.stringify({ slices: [{ spec_key: 'TP304', primary_grade: 'TP304', structure_type: 'austenitic', display_name: 'TP304 (S30400)', aliases: [], chemical_rules: [{ rule_id: 'CHEM_TP304_C', category: 'chemical', property_key: 'C', display_name: 'Carbon (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: 'TABLE2' }] }] });
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

  it('解析器不冒充：LLM 未给 unified_code 时切片 unified_code 为 undefined', async () => {
    const chemBlock: TextBlock = { blockType: 'chemistry_table', clauseRef: 'TABLE2', text: 'TABLE 2 Chemical Composition\nTP304 S30400 0.08 2.00' };
    const drafts = await extractAll([chemBlock], chatNoUns, undefined, undefined, EN_ASME_PROFILE);
    expect(drafts.slices[0]!.spec_key).toBe('TP304');
    expect(drafts.slices[0]!.unified_code).toBeUndefined();
  });

  it('挂载：unified_code=UNS 时 UNS applies 命中；商用牌号 applies 命中；冒充 unified_code 时 UNS applies 未命中进 unmounted', () => {
    const mkRule = (applies: string[]): DraftRule => ({
      rule_id: 'R', category: 'chemical', property_key: 'Ti', display_name: 'Ti', rule_type: 'qualitative_enum',
      requirement_level: 'MANDATORY', criteria: {}, source_clause: 'TABLE2', applies_to_grades: applies,
    });
    // 正例 1：unified_code=S30400 + applies UNS
    const good: DraftSlice = { spec_key: 'TP304', display_name: 'TP304 (S30400)', primary_grade: 'TP304', unified_code: 'S30400', evaluation_rules: [] };
    let r = mountRulesByGrades([mkRule(['S30940', 'S30400'])], [good]);
    expect(r.perSlice[0]!.length).toBe(1);
    expect(r.unmounted).toEqual([]);
    // 正例 2：applies 用商用牌号（与 spec_key 同形态）
    r = mountRulesByGrades([mkRule(['TP304'])], [good]);
    expect(r.perSlice[0]!.length).toBe(1);
    // 反例：unified_code 被冒充为商用牌号（旧 E2E 形态），UNS applies 挂不上 -> unmounted
    const bad: DraftSlice = { spec_key: 'TP304', display_name: 'TP304', primary_grade: 'TP304', unified_code: 'TP304', evaluation_rules: [] };
    r = mountRulesByGrades([mkRule(['S30400'])], [bad]);
    expect(r.perSlice[0]!).toEqual([]);
    expect(r.unmounted.length).toBe(1);
  });
});

describe('② 硬度单位标题拒绝 + 牌号主键闭集注入', () => {
  it('TABLE4 形态：硬度列折行值 "90 HRB"/"25 HRC" 不再成为标题锚，表块完整', () => {
    const snippet = [
      '290TABLE 4 Tensile and Hardness Requirements',
      'Grade UNS',
      'Designation',
      'T5b K51545 60 [415] 30 [205] 30 179 HBW/',
      '190HV',
      '89 HRB',
      'TP304 S30400 75 [515] 30 [205] 35 192 HBW/',
      '200 HV',
      '90 HRB',
      'T91 Type 1 K90901 85 [585] 60 [415] 20 250 HBW/',
      '265 HV',
      '25 HRC',
    ].join('\n');
    const blocks = segmentText(snippet, EN_ASME_PROFILE);
    const t4 = blocks.find((b) => b.clauseRef.startsWith('TABLE4'));
    expect(t4?.blockType).toBe('mechanical_table');
    expect((t4!.text.match(/^[A-Z][A-Za-z0-9-]{0,12}\s+(?:Type\s+\d+\s+(?:Heat\s+)?)?[KS]\d{5}\b/gm) || []).length).toBe(3);
    // 无残留数字标题碎片
    expect(blocks.some((b) => /^\d+$/.test(b.clauseRef))).toBe(false);
  });

  it('普通数字行（非单位标题）不受影响：含数字标题的条款仍切块', () => {
    const snippet = ['9. Mechanical Properties', '9.1 Tensile Requirements:', '9.1.1 The material shall conform to the requirements as to tensile properties given in Table 4.'].join('\n');
    const blocks = segmentText(snippet, EN_ASME_PROFILE);
    expect(blocks.find((b) => b.clauseRef === '9')?.blockType).toBeDefined();
  });

  it('牌号主键闭集注入：力学 prompt 含化学切片 spec_key 清单', async () => {
    const contents = new Map<string, string>();
    const chat: ChatClient = async (messages, opts) => {
      const content = messages[1]?.content;
      contents.set(opts.task, typeof content === 'string' ? content : '');
      switch (opts.task) {
        case 'meta':
          return JSON.stringify({ standard_id: 'SA-213/SA-213M', standard_name: 'Tubes', version: '2023', description: 'Covers tubes.', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] });
        case 'slices_chemical':
          return JSON.stringify({ slices: [
            { spec_key: 'T2', primary_grade: 'T2', structure_type: 'ferritic', display_name: 'T2 (K11547)', aliases: [] },
            { spec_key: 'T91 Type 1', primary_grade: 'T91 Type 1', structure_type: 'ferritic', display_name: 'T91 Type 1 (K90901)', aliases: [] },
          ] });
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
    const t2: TextBlock = { blockType: 'chemistry_table', clauseRef: 'TABLE2', text: 'TABLE 2 Chemical Composition\nTP304 S30400 0.08 2.00' };
    const t4: TextBlock = { blockType: 'mechanical_table', clauseRef: 'TABLE4', text: 'TABLE 4 Tensile and Hardness Requirements\nTP304 S30400 75 [515]' };
    await extractAll([t2, t4], chat, undefined, undefined, EN_ASME_PROFILE);
    const prompt = contents.get('slices_mechanical') ?? '';
    expect(prompt).toContain('牌号主键清单');
    expect(prompt).toContain('T91 Type 1');
    expect(prompt).toContain('spec_key 必须从此清单逐字选取');
  });

  it('gradeCatalogLines：空清单不注入；清单去重排序', () => {
    expect(gradeCatalogLines([])).toEqual([]);
    const lines = gradeCatalogLines([
      { spec_key: 'TP304', display_name: '', evaluation_rules: [] },
      { spec_key: 'T2', display_name: '', evaluation_rules: [] },
      { spec_key: 'TP304', display_name: '', evaluation_rules: [] },
    ] as DraftSlice[]);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('T2、TP304');
  });
});
