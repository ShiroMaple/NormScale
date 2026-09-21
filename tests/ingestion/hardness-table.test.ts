import { describe, it, expect } from 'vitest';
import { hasMissingHardnessOptions, parseHardnessTable, repairHardnessOptions } from '@/ingestion/hardness-table';
import { extractAll } from '@/ingestion/llm-extract';
import type { ChatClient, DraftRule, DraftSlice, TextBlock } from '@/ingestion/types';

/* v1.7.4 确定性硬度表解析器测试：NB/T 47019.5 表4 与 GB/T 13296-2023 表5 两个真实样例全量断言，
   列对位（表头顺序决定）/折行拼接/其他行 ORG 标记/触发条件与协商降级，extractAll 接线与管线级幂等回放。严禁真实 LLM。 */

// NB/T 47019.5-2021 表4（真实形态：多牌号分组折行 + 其他行）
const NB_TABLE4: TextBlock = {
  blockType: 'mechanical_table',
  clauseRef: '表4',
  text: [
    '表 4 硬度',
    '组织类型 管子的牌号 硬度',
    'HBW HRB HV',
    '奥氏体型',
    '022Cr19Ni10N、06Cr19Ni10N、',
    '022Cr17Ni12Mo2N、06Cr17Ni12Mo2N、',
    '015Cr20Ni18Mo6CuN、015Cr21Ni26Mo5Cu2、',
    '022Cr21Ni25Mo7N',
    '≤217 ≤95 ≤220',
    '其他 ≤187 ≤90 ≤200',
    '铁素体型 06Cr13 ≤183 — —',
  ].join('\n'),
};
const NB_CONTEXT = '6.4.2 根据需方要求，并在合同中注明，壁厚不小于 1.7mm 的管子可做布氏硬度或洛氏硬度或维氏硬度试验，管子的硬度试验结果应符合表 4 的规定。';

// GB/T 13296-2023 表5（真实形态：单牌号/单列名行 + 其他行）
const GB_TABLE5: TextBlock = {
  blockType: 'mechanical_table',
  clauseRef: '表5',
  text: [
    '表5 硬度',
    '组织类型 钢管的牌号 HBW HRB HV',
    '奥氏体型 06Cr18Ni13Si4 ≤207 ≤95 ≤218',
    '奥氏体型 015Cr20Ni18Mo6CuN ≤220 ≤96 ≤230',
    '奥氏体型 022Cr21Ni25Mo7N — ≤100 —',
    '奥氏体型 其他 ≤192 ≤90 ≤200',
    '铁素体型 10Cr17、06Cr13 ≤183 — —',
    '铁素体型 008Cr27Mo ≤219 — —',
  ].join('\n'),
};
const GB_CONTEXT = '7.4.2 壁厚不小于 1.7mm 的钢管应进行硬度试验，其值应符合表 5 的规定。';

describe('确定性硬度表解析：NB/T 47019.5 表4（多牌号折行 + 其他行）', () => {
  const { hit, rules } = parseHardnessTable(NB_TABLE4, NB_CONTEXT);

  it('命中且产出 3 条规则（显式牌号组/其他行/铁素体行）', () => {
    expect(hit).toBe(true);
    expect(rules.length).toBe(3);
    for (const r of rules) {
      expect(r.rule_type).toBe('or_choice_group');
      expect(r.property_key).toBe('hardness');
      expect(r.category).toBe('mechanical');
      expect(r.deterministic).toBe(true);
      expect(r.source_clause).toBe('表4');
    }
  });

  it('折行牌号拼接：7 个牌号一组，值三元组按 HBW/HRB/HV 对位', () => {
    const group = rules[0]!;
    expect(group.applies_to_grades).toEqual([
      '022Cr19Ni10N', '06Cr19Ni10N', '022Cr17Ni12Mo2N', '06Cr17Ni12Mo2N',
      '015Cr20Ni18Mo6CuN', '015Cr21Ni26Mo5Cu2', '022Cr21Ni25Mo7N',
    ]);
    expect(group.criteria.options).toEqual([
      { sub_key: 'HBW', rule_type: 'numeric_range', criteria: { min: null, max: 217, unit: 'HBW' } },
      { sub_key: 'HRB', rule_type: 'numeric_range', criteria: { min: null, max: 95, unit: 'HRB' } },
      { sub_key: 'HV', rule_type: 'numeric_range', criteria: { min: null, max: 220, unit: 'HV' } },
    ]);
  });

  it('"其他"行 -> ORG:austenitic:OTHERS；铁素体行 "—" 跳过 HBW/HV 仅留 HBW', () => {
    expect(rules[1]!.applies_to_grades).toEqual(['ORG:austenitic:OTHERS']);
    expect(rules[1]!.criteria.options).toEqual([
      { sub_key: 'HBW', rule_type: 'numeric_range', criteria: { min: null, max: 187, unit: 'HBW' } },
      { sub_key: 'HRB', rule_type: 'numeric_range', criteria: { min: null, max: 90, unit: 'HRB' } },
      { sub_key: 'HV', rule_type: 'numeric_range', criteria: { min: null, max: 200, unit: 'HV' } },
    ]);
    expect(rules[2]!.applies_to_grades).toEqual(['06Cr13']);
    expect(rules[2]!.criteria.options).toEqual([
      { sub_key: 'HBW', rule_type: 'numeric_range', criteria: { min: null, max: 183, unit: 'HBW' } },
    ]);
  });

  it('语境：壁厚触发条件 >= 1.7；协商语境降级 OPTIONAL_AGREED', () => {
    for (const r of rules) {
      expect(r.trigger_condition).toBe('ctx.header.dimensions.wall_thickness_mm >= 1.7');
      expect(r.requirement_level).toBe('OPTIONAL_AGREED'); // NB 6.4.2 "根据需方要求…可做"
    }
  });
});

describe('确定性硬度表解析：GB/T 13296-2023 表5（单列名行 + 其他行）', () => {
  const { hit, rules } = parseHardnessTable(GB_TABLE5, GB_CONTEXT);

  it('命中且产出 6 条规则；列对位按表头 HBW/HRB/HV 顺序', () => {
    expect(hit).toBe(true);
    expect(rules.length).toBe(6);
    expect(rules[0]!.applies_to_grades).toEqual(['06Cr18Ni13Si4']);
    expect(rules[0]!.criteria.options).toEqual([
      { sub_key: 'HBW', rule_type: 'numeric_range', criteria: { min: null, max: 207, unit: 'HBW' } },
      { sub_key: 'HRB', rule_type: 'numeric_range', criteria: { min: null, max: 95, unit: 'HRB' } },
      { sub_key: 'HV', rule_type: 'numeric_range', criteria: { min: null, max: 218, unit: 'HV' } },
    ]);
  });

  it('"— ≤100 —" 仅出 HRB；其他行 ORG 标记；铁素体多牌号顿号拆分', () => {
    expect(rules[2]!.criteria.options).toEqual([
      { sub_key: 'HRB', rule_type: 'numeric_range', criteria: { min: null, max: 100, unit: 'HRB' } },
    ]);
    expect(rules[3]!.applies_to_grades).toEqual(['ORG:austenitic:OTHERS']);
    expect(rules[4]!.applies_to_grades).toEqual(['10Cr17', '06Cr13']);
    expect(rules[5]!.applies_to_grades).toEqual(['008Cr27Mo']);
    expect(rules[5]!.criteria.options).toEqual([
      { sub_key: 'HBW', rule_type: 'numeric_range', criteria: { min: null, max: 219, unit: 'HBW' } },
    ]);
  });

  it('语境：无协商词 -> CONDITIONAL + 触发条件 >= 1.7', () => {
    for (const r of rules) {
      expect(r.requirement_level).toBe('CONDITIONAL');
      expect(r.trigger_condition).toBe('ctx.header.dimensions.wall_thickness_mm >= 1.7');
    }
  });
});

describe('确定性硬度表解析：列对位与未命中回退', () => {
  it('列对位不硬编码：表头 "HV HBW HRB" 顺序决定值归属', () => {
    const block: TextBlock = {
      blockType: 'mechanical_table',
      clauseRef: '表X',
      text: ['表X 硬度', '牌号 HV HBW HRB', '奥氏体型 06Cr19Ni10 ≤220 ≤187 ≤90'].join('\n'),
    };
    const { hit, rules } = parseHardnessTable(block);
    expect(hit).toBe(true);
    expect(rules[0]!.criteria.options).toEqual([
      { sub_key: 'HV', rule_type: 'numeric_range', criteria: { min: null, max: 220, unit: 'HV' } },
      { sub_key: 'HBW', rule_type: 'numeric_range', criteria: { min: null, max: 187, unit: 'HBW' } },
      { sub_key: 'HRB', rule_type: 'numeric_range', criteria: { min: null, max: 90, unit: 'HRB' } },
    ]);
  });

  it('无标尺表头 -> hit=false（回退 LLM）', () => {
    const block: TextBlock = {
      blockType: 'mechanical_table',
      clauseRef: '表9',
      text: ['表9 其他性能', '奥氏体型 06Cr19Ni10 520 205 35'].join('\n'),
    };
    expect(parseHardnessTable(block).hit).toBe(false);
  });
});

describe('extractAll 接线：命中不走 LLM，未命中回退', () => {
  function chatWithMechThrow(): ChatClient {
    return async (_messages, opts) => {
      switch (opts.task) {
        case 'meta':
          return JSON.stringify({ standard_id: 'GB/T 13296-2023', standard_name: '锅炉、热交换器用不锈钢无缝钢管', version: '2023', description: '本文件规定了技术要求。', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] });
        case 'slices_chemical':
          return JSON.stringify({ slices: [
            { spec_key: 'S30408', primary_grade: '06Cr19Ni10', unified_code: 'S30408', structure_type: 'austenitic', display_name: '06Cr19Ni10 (S30408)', aliases: [] },
            { spec_key: 'S11306', primary_grade: '06Cr13', unified_code: 'S11306', structure_type: 'ferritic', display_name: '06Cr13 (S11306)', aliases: [] },
          ] });
        case 'slices_mechanical':
          throw new Error('力学 LLM 不应被调用（硬度表块已由确定性解析提取）');
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
  }

  it('NB 表4 命中：mechanical LLM 零调用，ORG:OTHERS 展开挂载到未显式列名切片', async () => {
    const messages: string[] = [];
    const chemBlock: TextBlock = {
      blockType: 'chemistry_table',
      clauseRef: '表2',
      text: '表2 化学成分\n1 06Cr19Ni10 S30408 0.08\n22 06Cr13 S11306 0.06',
    };
    const drafts = await extractAll([chemBlock, NB_TABLE4], chatWithMechThrow(), (m) => messages.push(m));
    expect(messages.some((m) => m.includes('确定性解析器提取 3 条 or_choice_group'))).toBe(true);
    const s30408 = drafts.slices.find((s) => s.spec_key === 'S30408')!;
    const hardnessRules = s30408.evaluation_rules.filter((r) => r.property_key === 'hardness');
    expect(hardnessRules.length).toBeGreaterThanOrEqual(1); // 显式组 + 奥氏体其他行 均覆盖 S30408
    const s11306 = drafts.slices.find((s) => s.spec_key === 'S11306')!;
    expect(s11306.evaluation_rules.some((r) => r.property_key === 'hardness')).toBe(true);
    const hbw = s11306.evaluation_rules.find((r) => r.property_key === 'hardness')!;
    expect(hbw.criteria.options).toEqual([
      { sub_key: 'HBW', rule_type: 'numeric_range', criteria: { min: null, max: 183, unit: 'HBW' } },
    ]);
  });

  it('非硬度机械块未命中：正常回退 LLM', async () => {
    let mechCalled = 0;
    const chat: ChatClient = async (_messages, opts) => {
      if (opts.task === 'slices_mechanical') {
        mechCalled += 1;
        return JSON.stringify({ slices: [] });
      }
      return chatWithMechThrow()(_messages, opts);
    };
    const other: TextBlock = { blockType: 'mechanical_table', clauseRef: '表9', text: '表9 其他性能\n奥氏体型 06Cr19Ni10 520 205 35' };
    await extractAll([other], chat);
    expect(mechCalled).toBe(1);
  });
});

describe('管线级回放修复：repairHardnessOptions（幂等）', () => {
  const block = GB_TABLE5;
  function brokenDrafts(): { slices: DraftSlice[] } {
    return {
      slices: [
        {
          spec_key: 'S30408', spec_type: 'grade', standard_code: 'GB/T 13296-2023', display_name: '06Cr18Ni13Si4 (S30408)',
          primary_grade: '06Cr18Ni13Si4', unified_code: 'S30408', structure_type: 'austenitic', aliases: [],
          evaluation_rules: [
            { rule_id: 'MECH_S30408_HARDNESS', category: 'mechanical', property_key: 'hardness', display_name: '硬度试验', rule_type: 'or_choice_group', requirement_level: 'CONDITIONAL', criteria: { options: [] }, source_clause: '表5' } as DraftRule,
          ],
        },
      ],
    };
  }

  it('空 options 硬度规则按确定性解析就地替换；二次运行幂等', () => {
    const drafts = brokenDrafts();
    expect(hasMissingHardnessOptions(drafts.slices[0]!.evaluation_rules[0]!)).toBe(true);
    const repaired = repairHardnessOptions(drafts, [block]);
    expect(repaired).toBe(1);
    const rule = drafts.slices[0]!.evaluation_rules[0]!;
    expect(rule.criteria.options).toEqual([
      { sub_key: 'HBW', rule_type: 'numeric_range', criteria: { min: null, max: 207, unit: 'HBW' } },
      { sub_key: 'HRB', rule_type: 'numeric_range', criteria: { min: null, max: 95, unit: 'HRB' } },
      { sub_key: 'HV', rule_type: 'numeric_range', criteria: { min: null, max: 218, unit: 'HV' } },
    ]);
    // 幂等：修复后不再判定为缺失，二次运行零修复
    expect(hasMissingHardnessOptions(rule)).toBe(false);
    expect(repairHardnessOptions(drafts, [block])).toBe(0);
  });

  it('source_clause 无对应解析结果时保持原样（不臆造）', () => {
    const drafts = brokenDrafts();
    drafts.slices[0]!.evaluation_rules[0]!.source_clause = '表9';
    expect(repairHardnessOptions(drafts, [block])).toBe(0);
    expect((drafts.slices[0]!.evaluation_rules[0]!.criteria as { options: unknown }).options).toEqual([]);
  });
});
