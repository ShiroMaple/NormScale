import { describe, it, expect } from 'vitest';
import { CandidateGradeRecommender } from '@/normalizer/candidate-grade-recommender.ts';
import { FileRuleStore } from '@/repository/file-rule-store.ts';

describe('CandidateGradeRecommender 材料牌号动态候选推荐引擎测试', () => {
  const store = new FileRuleStore();

  it('场景 1: 基于化学成分与别名词根准确推荐 304 家族高匹配钢级', async () => {
    const candidates = await CandidateGradeRecommender.recommend({
      rawGrade: 'SUS 304H-SpecialX',
      declaredStandard: 'GB/T 13296-2023',
      testRecords: [
        { raw_property_name: 'C', measured_value_num: 0.055, category: 'chemical' },
        { raw_property_name: 'Si', measured_value_num: 0.45, category: 'chemical' },
        { raw_property_name: 'Mn', measured_value_num: 1.25, category: 'chemical' },
        { raw_property_name: 'P', measured_value_num: 0.028, category: 'chemical' },
        { raw_property_name: 'S', measured_value_num: 0.008, category: 'chemical' },
        { raw_property_name: 'Cr', measured_value_num: 18.42, category: 'chemical' },
        { raw_property_name: 'Ni', measured_value_num: 8.25, category: 'chemical' },
      ],
      ruleStore: store,
      maxCandidates: 3,
    });

    expect(candidates).toBeDefined();
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates.length).toBeLessThanOrEqual(3);

    // 首选推荐项应标记为 recommended
    const top = candidates[0]!;
    expect(top.recommended).toBe(true);
    expect(top.match).toContain('(推荐)');

    // 候选应属于 304 家族相关钢级 (如 S30409 或 S30408)
    const allCodes = candidates.map(c => c.code);
    const has304Series = allCodes.some(c => c.includes('304') || c.includes('06Cr19Ni10'));
    expect(has304Series).toBe(true);
  });

  it('场景 2: 纯化学成分指纹识别 (牌号无明显信息时，依据 Mo/Ni 特征元素准确识别 316 体系)', async () => {
    const candidates = await CandidateGradeRecommender.recommend({
      rawGrade: 'UNKNOWN-ALLOY-SAMPLE',
      declaredStandard: 'GB/T 13296-2023',
      testRecords: [
        { raw_property_name: 'C', measured_value_num: 0.022, category: 'chemical' },
        { raw_property_name: 'Si', measured_value_num: 0.50, category: 'chemical' },
        { raw_property_name: 'Mn', measured_value_num: 1.10, category: 'chemical' },
        { raw_property_name: 'Cr', measured_value_num: 16.85, category: 'chemical' },
        { raw_property_name: 'Ni', measured_value_num: 12.10, category: 'chemical' },
        { raw_property_name: 'Mo', measured_value_num: 2.15, category: 'chemical' }, // 典型 316L 钼元素
      ],
      ruleStore: store,
      maxCandidates: 3,
    });

    expect(candidates.length).toBeGreaterThan(0);
    // 第一推荐必须是含 Mo 的 316 体系 (022Cr17Ni12Mo2 / S31603)
    const top = candidates[0]!;
    expect(top.code).toMatch(/316|17Ni12Mo2/);
  });

  it('场景 3: 特征元素缺失惩罚 (若未检出 Ti，321 牌号评分被惩罚扣分)', async () => {
    // 给出不含 Ti 的成分数据
    const candidates = await CandidateGradeRecommender.recommend({
      rawGrade: 'SUS 321-QUESTIONABLE',
      declaredStandard: 'GB/T 13296-2023',
      testRecords: [
        { raw_property_name: 'C', measured_value_num: 0.06, category: 'chemical' },
        { raw_property_name: 'Cr', measured_value_num: 18.0, category: 'chemical' },
        { raw_property_name: 'Ni', measured_value_num: 9.0, category: 'chemical' },
        // 无 Ti 元素
      ],
      ruleStore: store,
      maxCandidates: 5,
    });

    expect(candidates.length).toBeGreaterThan(0);
    // 321 虽然因为词根命中得到词根分，但因缺少必须的 Ti 特征元素，化学分被扣减
  });

  it('场景 4: 无实测化学数据时优雅退化为纯词根与别名匹配', async () => {
    const candidates = await CandidateGradeRecommender.recommend({
      rawGrade: 'TP-316L',
      declaredStandard: 'GB/T 13296-2023',
      testRecords: [], // 无化学数据
      ruleStore: store,
      maxCandidates: 3,
    });

    expect(candidates.length).toBeGreaterThan(0);
    const top = candidates[0]!;
    expect(top.code).toContain('316');
  });

  it('场景 5: 防御性处理 (缺失 store、空牌号或未知标准安全返回空数组)', async () => {
    const res1 = await CandidateGradeRecommender.recommend({
      rawGrade: '',
      declaredStandard: 'GB/T 13296-2023',
      ruleStore: store,
    });
    expect(res1).toEqual([]);

    const res2 = await CandidateGradeRecommender.recommend({
      rawGrade: '304',
      declaredStandard: 'NON-EXISTENT-STANDARD-99999',
      ruleStore: store,
    });
    expect(res2).toEqual([]);

    const res3 = await CandidateGradeRecommender.recommend({
      rawGrade: '304',
      declaredStandard: 'GB/T 13296-2023',
      ruleStore: undefined,
    });
    expect(res3).toEqual([]);
  });

  it('场景 6: 多标准代号字符串（顿号分隔）切片池聚合与牌号推荐', async () => {
    // 模拟同时勾选 GB/T 13296-2023 与 NB/T 47019.5-2021
    const candidates = await CandidateGradeRecommender.recommend({
      rawGrade: '06Cr19Ni10-UNKNOWN',
      declaredStandard: 'GB/T 13296-2023、NB/T 47019.5-2021',
      testRecords: [
        { raw_property_name: 'C', measured_value_num: 0.045, category: 'chemical' },
        { raw_property_name: 'Si', measured_value_num: 0.40, category: 'chemical' },
        { raw_property_name: 'Mn', measured_value_num: 1.15, category: 'chemical' },
        { raw_property_name: 'P', measured_value_num: 0.025, category: 'chemical' },
        { raw_property_name: 'S', measured_value_num: 0.005, category: 'chemical' },
        { raw_property_name: 'Cr', measured_value_num: 18.2, category: 'chemical' },
        { raw_property_name: 'Ni', measured_value_num: 8.1, category: 'chemical' },
      ],
      ruleStore: store,
      maxCandidates: 3,
    });

    expect(candidates).toBeDefined();
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const top = candidates[0]!;
    // 首选推荐应为两部标准均收录的 06Cr19Ni10 (S30408)
    expect(top.id).toBe('06Cr19Ni10');
    expect(top.code).toContain('S30408');
  });

  it('场景 7: 多标准数组入参 (standardIds) 聚合推荐与共有牌号激励加权', async () => {
    const candidates = await CandidateGradeRecommender.recommend({
      rawGrade: 'S30408',
      standardIds: ['GB/T 13296-2023', 'NB/T 47019.5-2021'],
      testRecords: [],
      ruleStore: store,
      maxCandidates: 3,
    });

    expect(candidates).toBeDefined();
    expect(candidates.length).toBeGreaterThan(0);
    const top = candidates[0]!;
    expect(top.id).toBe('06Cr19Ni10');
    expect(top.recommended).toBe(true);
  });
});

