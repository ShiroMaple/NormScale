import { describe, it, expect } from 'vitest';
import { QualitativeNormalizer } from '@/normalizer/qualitative-normalizer';

describe('QualitativeNormalizer 定性试验结论与探伤等级测试', () => {
  it('正确将自然语言合格表述映射为 PASS 并提取验收等级', () => {
    const res1 = QualitativeNormalizer.normalize('合格 (未见裂纹)');
    expect(res1.qualitative_result).toBe('PASS');

    const res2 = QualitativeNormalizer.normalize('PASS (E3H 验收合格)');
    expect(res2.qualitative_result).toBe('PASS');
    expect(res2.claimed_level).toBe('E3H');

    const res3 = QualitativeNormalizer.normalize('合格 (U2 等级)');
    expect(res3.qualitative_result).toBe('PASS');
    expect(res3.claimed_level).toBe('U2');

    const res4 = QualitativeNormalizer.normalize('无晶间腐蚀倾向 (E法合格)');
    expect(res4.qualitative_result).toBe('PASS');
    expect(res4.claimed_level).toBe('Method_E');
  });

  it('正确将不合格表述映射为 FAIL', () => {
    const res1 = QualitativeNormalizer.normalize('压扁至间距 H 时表面开裂 (不合格)');
    expect(res1.qualitative_result).toBe('FAIL');

    const res2 = QualitativeNormalizer.normalize('NG');
    expect(res2.qualitative_result).toBe('FAIL');
  });

  it('正确识别未测试与免做项目为 NOT_TESTED', () => {
    expect(QualitativeNormalizer.normalize('未做').qualitative_result).toBe('NOT_TESTED');
    expect(QualitativeNormalizer.normalize('-').qualitative_result).toBe('NOT_TESTED');
    expect(QualitativeNormalizer.normalize('N/A').qualitative_result).toBe('NOT_TESTED');
  });
});
