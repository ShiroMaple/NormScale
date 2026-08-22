import { describe, it, expect } from 'vitest';
import { UnitNormalizer } from '@/normalizer/unit-normalizer';

describe('UnitNormalizer 物理量单位换算与数值分离测试', () => {
  describe('力学强度单位归一化 (normalizeStrength)', () => {
    it('支持标准 MPa 与 N/mm² (1:1 直接对应)', () => {
      const res1 = UnitNormalizer.normalizeStrength(520, 'MPa');
      expect(res1.value).toBe(520);
      expect(res1.target_unit).toBe('MPa');
      expect(res1.is_converted).toBe(false);

      const res2 = UnitNormalizer.normalizeStrength('560.5 N/mm2');
      expect(res2.value).toBe(560.5);
      expect(res2.target_unit).toBe('MPa');
      expect(res2.is_converted).toBe(false);
    });

    it('支持工程单位 kgf/mm² 精确换算为 MPa (* 9.80665)', () => {
      // 53.0 kgf/mm² * 9.80665 = 519.75245 MPa
      const res = UnitNormalizer.normalizeStrength(53.0, 'kgf/mm²');
      expect(res.value).toBeCloseTo(519.75245, 4);
      expect(res.target_unit).toBe('MPa');
      expect(res.is_converted).toBe(true);
      expect(res.original_unit).toBe('kgf/mm²');
    });

    it('支持美标单位 psi 与 ksi 精确换算为 MPa', () => {
      // 75.4 ksi * 6.89476 = 519.8647 MPa
      const resKsi = UnitNormalizer.normalizeStrength('75.4 ksi');
      expect(resKsi.value).toBeCloseTo(519.8647, 2);
      expect(resKsi.target_unit).toBe('MPa');
      expect(resKsi.is_converted).toBe(true);

      // 75400 psi
      const resPsi = UnitNormalizer.normalizeStrength('75400 psi');
      expect(resPsi.value).toBeCloseTo(519.8647, 2);
    });

    it('支持自动剥离比较符号 (如 "≥520 MPa", "<200")', () => {
      const resGte = UnitNormalizer.normalizeStrength('≥ 520 MPa');
      expect(resGte.value).toBe(520);
      expect(resGte.comparison_operator).toBe('>=');

      const resLt = UnitNormalizer.normalizeStrength('< 200 N/mm2');
      expect(resLt.value).toBe(200);
      expect(resLt.comparison_operator).toBe('<');
    });
  });

  describe('百分比含量归一化 (normalizePercentage)', () => {
    it('支持纯数字、带 % 符号及比较符号的前缀剥离', () => {
      const res1 = UnitNormalizer.normalizePercentage('0.04%');
      expect(res1.value).toBe(0.04);
      expect(res1.target_unit).toBe('%');

      const res2 = UnitNormalizer.normalizePercentage('<0.005');
      expect(res2.value).toBe(0.005);
      expect(res2.comparison_operator).toBe('<');
    });
  });

  describe('几何尺寸单位归一化 (normalizeDimension)', () => {
    it('支持毫米 mm、厘米 cm、米 m 及英寸 inch 统一转为 mm', () => {
      expect(UnitNormalizer.normalizeDimension('25mm').value).toBe(25);
      expect(UnitNormalizer.normalizeDimension('2.5cm').value).toBe(25);
      expect(UnitNormalizer.normalizeDimension('6m').value).toBe(6000);
      expect(UnitNormalizer.normalizeDimension('1 inch').value).toBe(25.4);
    });
  });
});
