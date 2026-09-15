import { describe, it, expect } from 'vitest';
import { dedupeSliceRulesByPropertyKey, extractAll, isInspectionScheduleBlock, propertyKeyCatalogLines } from '@/ingestion/llm-extract';
import { scanPropertyKeyCatalog } from '@/ingestion/promote';
import type { ChatClient, DraftRule, DraftSlice, TextBlock } from '@/ingestion/types';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* 真实 E2E（NB/T 47019.5-2021，真实 LLM）暴露的三项修复专项测试（ingestConfigVersion 1.2.1）：
   1. property_key 命名漂移：闭集清单注入 process_rules/dynamic_formulas prompt（目录为空降级不注入）
   2. 重复/过度提取：检验项目一览表块（表5/表6 类）排除出 process_rules 通道；
      挂载后同切片按 property_key 确定性去重（保留 criteria 更丰富者）
   3. meta.standard_name 译英：extractMeta prompt 中文约束
   一览表文本片段取自 NB/T 47019.5-2021 真实切块缓存。严禁真实 LLM 调用。 */

// 真实切块片段：表5 无缝管检验一览表
const NB_SCHEDULE_TABLE_5: TextBlock = {
  blockType: 'process_ndt_clauses',
  clauseRef: '表5',
  text: '表 5 无缝管检验和试验项目、试验方法和取样方法、取样数量一览表\n序号 试验项目 试验和取样方法 取样数量\n规定的检验与试验项目\n1 化学成分 GB/T 223、GB/T 11170 每炉（罐）1 个试样\n2 室温拉伸 GB/T 228.1、GB/T 2975 每批 2 根管子各取 1 个试样\n3 压扁试验 GB/T 246 每批 2 根管子（扩口试验以外管子）各取 1 个试样\n4 扩口试验 GB/T 242 每批 2 根管子（压扁试验以外管子）各取 1 个试样\n5 腐蚀试验 GB/T 4334—2020 中方法 E 每批 2 根管子各取 1 个试样\n6 晶粒度 GB/T 6394 每批 2 根管子各取 1 个试样\n7 水压试验 GB/T 241 逐根\n8 超声检测 GB/T 5777—2019 逐根',
};

// 真实切块片段：表6 残片（clauseRef 被误锚定为 "6" 的续块）
const NB_SCHEDULE_TABLE_6_FRAGMENT: TextBlock = {
  blockType: 'process_ndt_clauses',
  clauseRef: '6',
  text: '6 焊接接头反向\n弯曲试验 NB/T 47019.1 每批 2 根管子（扩口试验以外管子）各取 1 个试样\n7 展平试验 NB/T 47019.1 每批 2 根管子（扩口试验以外管子）各取 1 个试样\n8 腐蚀试验 GB/T 4334—2020 中方法 E 每批 2 根管子各取 1 个试样\n9 晶粒度 GB/T 6394 每批 2 根管子各取 1 个试样\n10 水压试验 GB/T 241 逐根\n11 涡流检测 GB/T 7735—2016 逐根\n12 尺寸检验 量具 逐根\n13 表面质量 目视 逐根',
};

// 真实切块片段：6.6 水压试验正文条款（不得被一览表启发式误排）
const NB_CLAUSE_66: TextBlock = {
  blockType: 'process_ndt_clauses',
  clauseRef: '6.6',
  text: '6.6 水压试验\n6.6.1 无缝管应逐根进行水压试验，水压试验应符合 NB/T 47019.1—2021 中 7.5 的规定，最大试\n验压力不超过 20MPa，稳压时间不小于 10s。',
};

const NB_CHEM_BLOCK: TextBlock = {
  blockType: 'chemistry_table',
  clauseRef: '表1',
  text: '表 1 钢的牌号和化学成分\n15 06Cr18Ni11Ti S32168 0.08 1.00 2.00 0.035 0.015 9.00～12.00 17.00～19.00 — Ti：5（C+N）～0.70',
};

interface CapturedCall {
  task: string;
  userContent: string;
}

/** 记录每次 chat 调用的任务与 user prompt，返回 {chat, calls} */
function createCapturingChat(responses: Partial<Record<string, unknown>> = {}): { chat: ChatClient; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const chat: ChatClient = async (messages, opts) => {
    calls.push({ task: opts.task, userContent: messages[1]?.content ?? '' });
    switch (opts.task) {
      case 'meta':
        return JSON.stringify(responses.meta ?? { standard_id: 'NB/T 47019.5-2021', standard_name: '锅炉、热交换器用管订货技术条件 第5部分：不锈钢', version: '2021', description: '本文件规定了订货技术要求。', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] });
      case 'slices_chemical':
        return JSON.stringify({ slices: [{ spec_key: 'S32168', primary_grade: '06Cr18Ni11Ti', structure_type: 'austenitic', display_name: '06Cr18Ni11Ti (S32168)', aliases: [], chemical_rules: [{ rule_id: 'CHEM_S32168_C', category: 'chemical', property_key: 'C', display_name: 'C含量 (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: '表1' }] }] });
      case 'slices_mechanical':
        return JSON.stringify({ slices: [] });
      case 'clauses':
        return JSON.stringify({ clauses: [] });
      case 'process_rules':
        return JSON.stringify(responses.process_rules ?? { rules: [] });
      case 'dynamic_formulas':
        return JSON.stringify(responses.dynamic_formulas ?? { rules: [] });
      case 'tolerance_tables':
        return JSON.stringify(responses.tolerance_tables ?? { tables: [] });
      default:
        throw new Error(`未知任务类型: ${opts.task}`);
    }
  };
  return { chat, calls };
}

describe('修复 1：property_key 闭集清单注入（命名漂移抑制）', () => {
  const catalog = new Map([
    ['flattening', { category: 'process', display_name: '压扁试验 (Flattening)' }],
    ['pressure_tightness', { category: 'ndt', display_name: '致密性/水压试验组 (Pressure Tightness)' }],
    ['intergranular_corrosion', { category: 'corrosion', display_name: '晶间腐蚀试验 (Intergranular Corrosion)' }],
    ['Ti', { category: 'chemical', display_name: '钛含量 (Ti)' }],
  ]);

  it('闭集清单按类别分组（含 display_name）注入 process_rules 与 dynamic_formulas prompt', async () => {
    const { chat, calls } = createCapturingChat();
    await extractAll([NB_CHEM_BLOCK, NB_CLAUSE_66], chat, undefined, catalog);

    const processPrompt = calls.find((c) => c.task === 'process_rules')?.userContent ?? '';
    expect(processPrompt).toContain('【property_key 闭集清单');
    expect(processPrompt).toContain('process: flattening（压扁试验 (Flattening)）');
    expect(processPrompt).toContain('ndt: pressure_tightness（致密性/水压试验组 (Pressure Tightness)）');
    expect(processPrompt).toContain('严格从闭集清单中选取');

    const formulaPrompt = calls.find((c) => c.task === 'dynamic_formulas')?.userContent ?? '';
    expect(formulaPrompt).toContain('【property_key 闭集清单');
    expect(formulaPrompt).toContain('chemical: Ti（钛含量 (Ti)）');
  });

  it('目录为空/缺省时降级不注入：prompt 无闭集段且提取不阻断（首次建库场景）', async () => {
    const { chat: chatUndefined, calls: callsUndefined } = createCapturingChat();
    await extractAll([NB_CHEM_BLOCK, NB_CLAUSE_66], chatUndefined, undefined, undefined);
    const undefinedPrompt = callsUndefined.find((c) => c.task === 'process_rules')?.userContent ?? '';
    expect(undefinedPrompt).not.toContain('【property_key 闭集清单');

    const { chat: chatEmpty, calls: callsEmpty } = createCapturingChat();
    await extractAll([NB_CHEM_BLOCK, NB_CLAUSE_66], chatEmpty, undefined, new Map());
    expect(callsEmpty.find((c) => c.task === 'process_rules')?.userContent ?? '').not.toContain('【property_key 闭集清单');
    expect(propertyKeyCatalogLines(undefined)).toEqual([]);
    expect(propertyKeyCatalogLines(new Map())).toEqual([]);
  });

  it('scanPropertyKeyCatalog：key -> {category, display_name}，空目录返回空 Map', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'normscale-catalog-'));
    try {
      const stdDir = path.join(tmpRoot, 'GB_T_99999_2024');
      fs.mkdirSync(path.join(stdDir, 'slices'), { recursive: true });
      fs.writeFileSync(path.join(stdDir, 'meta.json'), JSON.stringify({ standard_id: 'GB/T 99999-2024', standard_name: '试验标准' }));
      fs.writeFileSync(
        path.join(stdDir, 'slices', 'S30408_06Cr19Ni10.json'),
        JSON.stringify({
          spec_key: 'S30408',
          display_name: '06Cr19Ni10 (S30408)',
          evaluation_rules: [
            { rule_id: 'PROC_X', category: 'process', property_key: 'flattening', display_name: '压扁试验', rule_type: 'dynamic_formula_pass', criteria: {} },
            { rule_id: 'NDT_Y', category: 'ndt', property_key: 'pressure_tightness', display_name: '致密性/水压试验组', rule_type: 'alternative_group', criteria: {} },
          ],
        }),
      );
      const catalogMap = scanPropertyKeyCatalog(tmpRoot);
      expect(catalogMap.get('flattening')).toEqual({ category: 'process', display_name: '压扁试验' });
      expect(catalogMap.get('pressure_tightness')).toEqual({ category: 'ndt', display_name: '致密性/水压试验组' });
      expect(scanPropertyKeyCatalog(path.join(tmpRoot, 'not-exist')).size).toBe(0);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe('修复 2a：检验项目一览表块排除出 process_rules 通道', () => {
  it('isInspectionScheduleBlock：表5/表6 残片判真，正文条款（6.6 等）判假', () => {
    expect(isInspectionScheduleBlock(NB_SCHEDULE_TABLE_5)).toBe(true);
    expect(isInspectionScheduleBlock(NB_SCHEDULE_TABLE_6_FRAGMENT)).toBe(true);
    expect(isInspectionScheduleBlock(NB_CLAUSE_66)).toBe(false);
    expect(isInspectionScheduleBlock({ blockType: 'other', clauseRef: '6.9', text: '6.9 晶粒度\n级别为 4 级～7 级。' })).toBe(false);
  });

  it('extractAll 不为一览表块发起 process_rules 调用，正文条款块照常提取', async () => {
    const { chat, calls } = createCapturingChat({
      process_rules: { rules: [{ rule_id: 'NDT_TIGHTNESS', category: 'ndt', property_key: 'pressure_tightness', display_name: '致密性/水压试验组', rule_type: 'alternative_group', requirement_level: 'MANDATORY', criteria: { group_logic: 'AT_LEAST_ONE_PASS', candidates: [{ candidate_key: 'hydraulic_test' }] }, source_clause: '6.6', applies_to_grades: 'ALL' }] },
    });
    const drafts = await extractAll([NB_CHEM_BLOCK, NB_SCHEDULE_TABLE_5, NB_SCHEDULE_TABLE_6_FRAGMENT, NB_CLAUSE_66], chat);

    const processCalls = calls.filter((c) => c.task === 'process_rules');
    expect(processCalls.length).toBe(1); // 仅 6.6 正文条款块进入 process_rules 通道
    expect(processCalls[0]!.userContent).toContain('【条款号 6.6】');
    expect(processCalls[0]!.userContent).not.toContain('取样数量一览表');
    // 一览表块的涡流/腐蚀清单项不会被提取成规则
    const s32168 = drafts.slices.find((s) => s.spec_key === 'S32168')!;
    expect(s32168.evaluation_rules.filter((r) => r.property_key === 'pressure_tightness').length).toBe(1);
  });
});

describe('修复 2b：同切片按 property_key 确定性去重（保留 criteria 更丰富者）', () => {
  it('dedupeSliceRulesByPropertyKey：丰富者保留、计数上报、位置确定', () => {
    const make = (ruleId: string, criteria: Record<string, unknown>): DraftRule => ({
      rule_id: ruleId,
      category: 'ndt',
      property_key: 'eddy_current_test',
      display_name: '涡流检测',
      rule_type: 'qualitative_enum',
      requirement_level: 'MANDATORY',
      criteria,
      source_clause: '6.10.2.1',
      applies_to_grades: ['ALL'],
    });
    const slice: DraftSlice = {
      spec_key: 'S32168',
      display_name: '06Cr18Ni11Ti (S32168)',
      evaluation_rules: [
        make('NDT_EDDY_A', { required_level: 'E2H' }), // 先出现但单薄
        make('NDT_EDDY_B', { required_level: 'E2H', test_standard: 'GB/T 7735-2016', criteria_description: '外径≤25mm 通孔 0.8mm' }),
      ],
    };
    const messages: string[] = [];
    const stats = dedupeSliceRulesByPropertyKey([slice], (msg) => messages.push(msg));
    expect(stats).toEqual({ kept: 1, dropped: 1 });
    expect(slice.evaluation_rules.length).toBe(1);
    expect(slice.evaluation_rules[0]!.rule_id).toBe('NDT_EDDY_B');
    expect(slice.evaluation_rules[0]!.criteria.test_standard).toBe('GB/T 7735-2016');
    expect(messages.some((m) => m.includes('去重') && m.includes('丢弃 1 条'))).toBe(true);
  });

  it('extractAll 挂载后触发去重：同 key 多规则收敛为一条，progress 记录计数', async () => {
    const { chat, calls } = createCapturingChat({
      process_rules: {
        rules: [
          { rule_id: 'NDT_EDDY_A', category: 'ndt', property_key: 'eddy_current_test', display_name: '涡流检测', rule_type: 'qualitative_enum', requirement_level: 'MANDATORY', criteria: { required_level: 'E2H' }, source_clause: '6.6', applies_to_grades: 'ALL' },
          { rule_id: 'NDT_EDDY_B', category: 'ndt', property_key: 'eddy_current_test', display_name: '涡流检测', rule_type: 'qualitative_enum', requirement_level: 'MANDATORY', criteria: { required_level: 'E2H', test_standard: 'GB/T 7735-2016', criteria_description: '外径＞25mm 达 E2H 级' }, source_clause: '6.6', applies_to_grades: 'ALL' },
        ],
      },
    });
    const messages: string[] = [];
    const drafts = await extractAll([NB_CHEM_BLOCK, NB_CLAUSE_66], chat, (m) => messages.push(m));
    const s32168 = drafts.slices.find((s) => s.spec_key === 'S32168')!;
    const eddyRules = s32168.evaluation_rules.filter((r) => r.property_key === 'eddy_current_test');
    expect(eddyRules.length).toBe(1);
    expect(eddyRules[0]!.rule_id).toBe('NDT_EDDY_B_S32168');
    expect(eddyRules[0]!.criteria.test_standard).toBe('GB/T 7735-2016');
    expect(messages.some((m) => m.includes('按 property_key 去重') && m.includes('丢弃 1 条'))).toBe(true);
    expect(calls.filter((c) => c.task === 'process_rules').length).toBe(1);
  });
});

describe('修复 3：extractMeta prompt 中文约束（防 standard_name 译英）', () => {
  it('meta 提取 prompt 含"严禁翻译为英文"约束与中文标准名示例', async () => {
    const { chat, calls } = createCapturingChat();
    await extractAll([NB_CHEM_BLOCK], chat);
    const metaPrompt = calls.find((c) => c.task === 'meta')?.userContent ?? '';
    expect(metaPrompt).toContain('严禁翻译为英文');
    expect(metaPrompt).toContain('锅炉、热交换器用管订货技术条件 第5部分：不锈钢');
  });
});

describe('golden 对账修复：process_rules prompt 结构保真（替代组/外部引用/粗糙度）', () => {
  it('prompt 含替代组强制指令与 golden 范式示例（NDT_TIGHTNESS_GROUP）', async () => {
    const { chat, calls } = createCapturingChat();
    await extractAll([NB_CHEM_BLOCK, NB_CLAUSE_66], chat);
    const prompt = calls.find((c) => c.task === 'process_rules')?.userContent ?? '';
    // 替代/组合检验必须聚合为一条 alternative_group，禁止拆分
    expect(prompt).toContain('必须输出为一条 alternative_group 规则');
    expect(prompt).toContain('严禁把替代组拆成独立的多条规则');
    // golden 范式示例片段（字段语义 + candidates 结构）
    expect(prompt).toContain('NDT_TIGHTNESS_GROUP');
    expect(prompt).toContain('"property_key":"pressure_tightness"');
    expect(prompt).toContain('hydraulic_test');
    expect(prompt).toContain('eddy_current_test');
    expect(prompt).toContain('calc_pressure_formula=试验压力计算公式');
    expect(prompt).toContain('"max_pressure_cap":20');
  });

  it('prompt 含外部引用禁编造指令（7.11.4 形态）与粗糙度结构保真指令', async () => {
    const { chat, calls } = createCapturingChat();
    await extractAll([NB_CHEM_BLOCK, NB_CLAUSE_66], chat);
    const prompt = calls.find((c) => c.task === 'process_rules')?.userContent ?? '';
    // 外部引用条款：严禁编造阈值，注明引用来源
    expect(prompt).toContain('严禁编造阈值');
    expect(prompt).toContain('7.11.4');
    expect(prompt).toContain('criteria_description 中注明外部引用来源');
    // surface_roughness：有数值必须 numeric_range + μm；仅引用走定性
    expect(prompt).toContain('surface_roughness 结构保真');
    expect(prompt).toContain('unit 固定 "μm"');
    expect(prompt).toContain('仅外部引用未给出数值时按第 6 条输出定性规则');
  });
});
