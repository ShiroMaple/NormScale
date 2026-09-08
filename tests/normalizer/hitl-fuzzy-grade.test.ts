import { describe, it, expect } from 'vitest';
import { buildGradePool, searchFuzzyGrades } from '@/utils/grade-fuzzy-matcher.ts';
import { StandardOverviewDto } from '@/lib/api-client.ts';

describe('HitlDrawer 钢级手动输入多维模糊匹配引擎测试', () => {
  const mockStandards: StandardOverviewDto[] = [
    {
      standard_id: 'GB/T 13296-2023',
      standard_name: '锅炉热交换器用不锈钢无缝钢管',
      version: '2023',
      status: 'CURRENT',
      slice_count: 3,
      available_slices: ['S30408', 'S31603', 'S32168'],
      slice_details: [
        {
          spec_key: 'S30408',
          primary_grade: '06Cr19Ni10',
          unified_code: 'S30408',
          display_name: '06Cr19Ni10 (S30408)',
          aliases: ['SUS304', 'TP304'],
        },
        {
          spec_key: 'S31603',
          primary_grade: '022Cr17Ni12Mo2',
          unified_code: 'S31603',
          display_name: '022Cr17Ni12Mo2 (S31603)',
          aliases: ['SUS316L', 'TP316L', '00Cr17Ni14Mo2'],
        },
        {
          spec_key: 'S32168',
          primary_grade: '06Cr18Ni11Ti',
          unified_code: 'S32168',
          display_name: '06Cr18Ni11Ti (S32168)',
          aliases: ['SUS321', 'TP321'],
        },
      ],
    },
    {
      standard_id: 'NB/T 47019.5-2021',
      standard_name: '锅炉、热交换器用管 订货技术条件 第5部分：不锈钢',
      version: '2021',
      status: 'CURRENT',
      slice_count: 2,
      available_slices: ['S30408', 'S31608'],
      slice_details: [
        {
          spec_key: 'S30408',
          primary_grade: '06Cr19Ni10',
          unified_code: 'S30408',
          display_name: '06Cr19Ni10 (S30408)',
          aliases: ['SUS304'],
        },
        {
          spec_key: 'S31608',
          primary_grade: '06Cr17Ni12Mo2',
          unified_code: 'S31608',
          display_name: '06Cr17Ni12Mo2 (S31608)',
          aliases: ['SUS316'],
        },
      ],
    },
  ];

  it('场景 1: 从指定标准准确提取候选钢级池并去重', () => {
    // 仅选定 GB/T 13296-2023
    const pool = buildGradePool(mockStandards, ['GB/T 13296-2023']);
    expect(pool.length).toBe(3);
    const keys = pool.map(p => p.spec_key);
    expect(keys).toContain('S30408');
    expect(keys).toContain('S31603');
    expect(keys).toContain('S32168');
  });

  it('场景 2: 多标准同时勾选时切片池合并并按主牌号去重', () => {
    const pool = buildGradePool(mockStandards, ['GB/T 13296-2023', 'NB/T 47019.5-2021']);
    // GB/T 3个，NB/T 增加 S31608，去重后共 4 个
    expect(pool.length).toBe(4);
    const primaryGrades = pool.map(p => p.primary_grade);
    expect(primaryGrades.filter(g => g === '06Cr19Ni10').length).toBe(1);
  });

  it('场景 3: 统一数字代号包含模糊检索 (输入 316 命中 S31603)', () => {
    const pool = buildGradePool(mockStandards, ['GB/T 13296-2023']);
    const results = searchFuzzyGrades('316', pool);

    expect(results.length).toBeGreaterThan(0);
    const top = results[0]!;
    expect(top.unified_code).toBe('S31603');
    expect(top.display_name).toContain('022Cr17Ni12Mo2');
  });

  it('场景 4: 化学式子串模糊检索 (输入 17Ni12 命中 022Cr17Ni12Mo2)', () => {
    const pool = buildGradePool(mockStandards, ['GB/T 13296-2023']);
    const results = searchFuzzyGrades('17Ni12', pool);

    expect(results.length).toBe(1);
    expect(results[0]!.primary_grade).toBe('022Cr17Ni12Mo2');
  });

  it('场景 5: 切片内置常见别名模糊检索 (输入 TP316L 精准匹配并携带别名信息)', () => {
    const pool = buildGradePool(mockStandards, ['GB/T 13296-2023']);
    const results = searchFuzzyGrades('TP316L', pool);

    expect(results.length).toBeGreaterThan(0);
    const top = results[0]!;
    expect(top.primary_grade).toBe('022Cr17Ni12Mo2');
    expect(top.matchedAlias).toBe('TP316L');
  });

  it('场景 6: 排序相关性：完全匹配高于子串匹配', () => {
    const pool = buildGradePool(mockStandards, ['GB/T 13296-2023', 'NB/T 47019.5-2021']);
    // S31603 完全匹配统一代码
    const results = searchFuzzyGrades('S31603', pool);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.unified_code).toBe('S31603');
    expect(results[0]!.matchScore).toBe(100);
  });

  it('场景 7: 防御性处理 (空搜索词或无匹配项)', () => {
    const pool = buildGradePool(mockStandards, ['GB/T 13296-2023']);
    expect(searchFuzzyGrades('', pool)).toEqual([]);
    expect(searchFuzzyGrades('   ', pool)).toEqual([]);
    expect(searchFuzzyGrades('XYZ999NONEXIST', pool)).toEqual([]);
  });
});
