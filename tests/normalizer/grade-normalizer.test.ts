import { describe, it, expect } from 'vitest';
import { GradeNormalizer } from '@/normalizer/grade-normalizer';
import { FileRuleStore } from '@/repository/file-rule-store';

describe('GradeNormalizer 材料牌号清洗与别名消歧测试', () => {
  const store = new FileRuleStore();
  const normalizerWithStore = new GradeNormalizer(store);
  const normalizerStatic = new GradeNormalizer();

  it('正确剥离 ASTM / GB / JIS 标准前缀与括号附属说明', () => {
    expect(GradeNormalizer.cleanRawGradeString('ASTM A213 TP304')).toBe('TP304');
    expect(GradeNormalizer.cleanRawGradeString('GB/T 13296-2023 06Cr19Ni10')).toBe('06Cr19Ni10');
    expect(GradeNormalizer.cleanRawGradeString('06Cr19Ni10 (S30408)')).toBe('06Cr19Ni10');
  });

  it('基于规则库倒排索引准确消歧 304 系列别名 (SUS 304 / TP-304 / 0Cr18Ni9)', async () => {
    const res1 = await normalizerWithStore.normalize('SUS 304');
    expect(res1.is_matched).toBe(true);
    expect(res1.unified_code).toBe('S30408');
    expect(res1.primary_grade).toBe('06Cr19Ni10');

    const res2 = await normalizerWithStore.normalize('0Cr18Ni9');
    expect(res2.is_matched).toBe(true);
    expect(res2.unified_code).toBe('S30408');

    const res3 = await normalizerWithStore.normalize('TP-304L');
    expect(res3.is_matched).toBe(true);
    expect(res3.unified_code).toBe('S30403');
    expect(res3.primary_grade).toBe('022Cr19Ni10');
  });

  it('基于规则库倒排索引准确消歧 316 系列别名 (316L / TP-316L / 316Ti)', async () => {
    const res1 = await normalizerWithStore.normalize('TP-316L');
    expect(res1.is_matched).toBe(true);
    expect(res1.unified_code).toBe('S31603');
    expect(res1.primary_grade).toBe('022Cr17Ni12Mo2');

    const res2 = await normalizerWithStore.normalize('316Ti');
    expect(res2.is_matched).toBe(true);
    expect(res2.unified_code).toBe('S31668');
  });

  it('准确消歧超级奥氏体与铁素体系列 (904L / 254SMO / TP430)', async () => {
    const res904 = await normalizerWithStore.normalize('904L');
    expect(res904.is_matched).toBe(true);
    expect(res904.unified_code).toBe('S39042');

    const res254 = await normalizerWithStore.normalize('254 SMO');
    expect(res254.is_matched).toBe(true);
    expect(res254.unified_code).toBe('S31252');

    const res430 = await normalizerWithStore.normalize('TP430');
    expect(res430.is_matched).toBe(true);
    expect(res430.unified_code).toBe('S11710');
  });

  it('在无 ruleStore 注入时通过静态兜底字典完成消歧', async () => {
    const res = await normalizerStatic.normalize('SUS304');
    expect(res.is_matched).toBe(true);
    expect(res.unified_code).toBe('S30408');
  });

  it('对未收录的未知牌号安全标记 is_matched: false 并保留原名', async () => {
    const res = await normalizerWithStore.normalize('UnknownSpecialAlloy-999');
    expect(res.is_matched).toBe(false);
    expect(res.primary_grade).toBe('UnknownSpecialAlloy-999');
    expect(res.confidence).toBe(0.5);
  });
});
