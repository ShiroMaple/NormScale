import { describe, it, expect, beforeEach } from 'vitest';
import { FileRuleStore } from '@/repository/file-rule-store';
import { ClauseStore } from '@/repository/clause-store';

describe('FileRuleStore 规则检索仓库测试', () => {
  let ruleStore: FileRuleStore;

  beforeEach(() => {
    ruleStore = new FileRuleStore();
  });

  it('正确列出收录的所有标准与切片概览', async () => {
    const list = await ruleStore.listAvailableStandards();
    expect(list.length).toBeGreaterThanOrEqual(1);

    const gbt = list.find(s => s.standard_id === 'GB/T 13296-2023');
    expect(gbt).toBeDefined();
    expect(gbt?.slice_count).toBe(31);
    expect(gbt?.status).toBe('CURRENT');
  });

  it('支持根据主牌号精确解析切片 (如 06Cr19Ni10, 06Cr17Ni12Mo2, 10Cr17)', async () => {
    const s304 = await ruleStore.resolveRuleSlice('GB/T 13296-2023', '06Cr19Ni10');
    expect(s304).toBeDefined();
    expect(s304?.unified_code).toBe('S30408');
    expect(s304?.structure_type).toBe('austenitic');

    const s430 = await ruleStore.resolveRuleSlice('GB/T 13296-2023', '10Cr17');
    expect(s430).toBeDefined();
    expect(s430?.unified_code).toBe('S11710');
    expect(s430?.structure_type).toBe('ferritic');
  });

  it('支持根据统一数字代号精确解析切片 (如 S30408, S31603, S39042, S11306)', async () => {
    const s316L = await ruleStore.resolveRuleSlice('GB/T 13296-2023', 'S31603');
    expect(s316L).toBeDefined();
    expect(s316L?.primary_grade).toBe('022Cr17Ni12Mo2');

    const s904L = await ruleStore.resolveRuleSlice('GB/T 13296-2023', 'S39042');
    expect(s904L).toBeDefined();
    expect(s904L?.primary_grade).toBe('015Cr21Ni26Mo5Cu2');
  });

  it('支持通过各种国际/历史别名模糊容错解析 (如 SUS304, tp-316l, 904L, 254SMO)', async () => {
    const r1 = await ruleStore.resolveRuleSlice('GB/T 13296-2023', 'SUS304');
    expect(r1?.unified_code).toBe('S30408');

    const r2 = await ruleStore.resolveRuleSlice('GB/T 13296-2023', 'tp-316l');
    expect(r2?.unified_code).toBe('S31603');

    const r3 = await ruleStore.resolveRuleSlice('GB/T 13296-2023', '904L');
    expect(r3?.unified_code).toBe('S39042');

    const r4 = await ruleStore.resolveRuleSlice('GB/T 13296-2023', '254 SMO');
    expect(r4?.unified_code).toBe('S31252');
  });

  it('支持标准代号格式模糊容错 (如 gbt13296-2023, GB_T_13296_2023)', async () => {
    const r = await ruleStore.resolveRuleSlice('gbt-13296-2023', 'S30408');
    expect(r).toBeDefined();
    expect(r?.primary_grade).toBe('06Cr19Ni10');
  });

  it('对未知牌号或不存在的标准安全返回 undefined', async () => {
    const r1 = await ruleStore.resolveRuleSlice('GB/T 13296-2023', 'NonExistentGrade');
    expect(r1).toBeUndefined();

    const r2 = await ruleStore.resolveRuleSlice('UNKNOWN-STD-999', 'S30408');
    expect(r2).toBeUndefined();
  });

  it('能够组装完整的标准规则全集 (getCompleteStandard)', async () => {
    const fullSet = await ruleStore.getCompleteStandard('GB/T 13296-2023');
    expect(fullSet).toBeDefined();
    expect(fullSet?.grade_rules.length).toBe(31);
    expect(fullSet?.slices?.length).toBe(31);
    expect(fullSet?.standard_meta?.tolerance_tables?.length).toBe(2);
  });
});

describe('ClauseStore 全文条款与语义检索测试', () => {
  let clauseStore: ClauseStore;

  beforeEach(() => {
    clauseStore = new ClauseStore();
  });

  it('能够加载指定标准的全部条款文本', async () => {
    const clauses = await clauseStore.getClauses('GB/T 13296-2023');
    expect(clauses.length).toBeGreaterThanOrEqual(10);
  });

  it('支持按关键词搜索条款 (如 “压扁”, “涡流”, “晶间腐蚀”)', async () => {
    const flatResults = await clauseStore.searchClauses('GB/T 13296-2023', '压扁');
    expect(flatResults.length).toBeGreaterThanOrEqual(1);
    expect(flatResults[0]?.title).toContain('压扁');

    const eddyResults = await clauseStore.searchClauses('GB/T 13296-2023', '涡流');
    expect(eddyResults.length).toBeGreaterThanOrEqual(1);
  });
});
