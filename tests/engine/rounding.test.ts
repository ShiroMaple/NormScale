import { describe, it, expect } from 'vitest';
import { roundGbt8170, compareWithLimit } from '@/engine/rounding';

describe('GB/T 8170-2008 数值修约算法测试', () => {
  describe('四舍六入五考虑 (保留 2 位小数)', () => {
    it('拟舍弃位 < 5 (四舍)', () => {
      expect(roundGbt8170(1.144, 2)).toBe(1.14);
      expect(roundGbt8170(1.141, 2)).toBe(1.14);
      expect(roundGbt8170(1.14499, 2)).toBe(1.14);
    });

    it('拟舍弃位 > 5 (六入)', () => {
      expect(roundGbt8170(1.146, 2)).toBe(1.15);
      expect(roundGbt8170(1.149, 2)).toBe(1.15);
      expect(roundGbt8170(1.1450000001, 2)).toBe(1.15);
    });

    it('拟舍弃位 == 5 且 5 后有非零数 (进一)', () => {
      expect(roundGbt8170(1.1451, 2)).toBe(1.15);
      expect(roundGbt8170(1.14501, 2)).toBe(1.15);
      expect(roundGbt8170(1.135001, 2)).toBe(1.14);
    });

    it('拟舍弃位 == 5 且 5 后无数字或全为 0 (奇进偶舍 / 进五成双)', () => {
      // 5 前面是奇数 3 -> 进一凑成偶数 4
      expect(roundGbt8170(1.135, 2)).toBe(1.14);
      expect(roundGbt8170(1.13500, 2)).toBe(1.14);
      expect(roundGbt8170(1.175, 2)).toBe(1.18);

      // 5 前面是偶数 4 -> 舍去保持偶数 4
      expect(roundGbt8170(1.145, 2)).toBe(1.14);
      expect(roundGbt8170(1.14500, 2)).toBe(1.14);
      expect(roundGbt8170(1.185, 2)).toBe(1.18);

      // 5 前面是 0 (偶数) -> 舍去保持 0
      expect(roundGbt8170(1.105, 2)).toBe(1.10);
      expect(roundGbt8170(1.10500, 2)).toBe(1.10);
    });
  });

  describe('国标标准例题验证 (保留整数位 decimals=0)', () => {
    it('整数位奇进偶舍', () => {
      expect(roundGbt8170(15.5, 0)).toBe(16); // 5 前奇数 5 -> 16
      expect(roundGbt8170(14.5, 0)).toBe(14); // 5 前偶数 4 -> 14
      expect(roundGbt8170(14.5001, 0)).toBe(15); // 5 后有非零 -> 15
      expect(roundGbt8170(14.499, 0)).toBe(14);
      expect(roundGbt8170(14.6, 0)).toBe(15);
    });
  });

  describe('负数修约规则', () => {
    it('负数先取绝对值修约后加负号', () => {
      expect(roundGbt8170(-1.145, 2)).toBe(-1.14);
      expect(roundGbt8170(-1.135, 2)).toBe(-1.14);
      expect(roundGbt8170(-1.1451, 2)).toBe(-1.15);
      expect(roundGbt8170(-15.5, 0)).toBe(-16);
      expect(roundGbt8170(-14.5, 0)).toBe(-14);
    });
  });

  describe('极限数值修约比较 compareWithLimit', () => {
    it('上限比较: 实测 0.082%, 标准 <= 0.08%, 修约保留 2 位', () => {
      // 0.082 修约后为 0.08 -> 合格
      const res = compareWithLimit(0.082, 0.08, '<=', 2);
      expect(res.isPass).toBe(true);
      expect(res.roundedValue).toBe(0.08);
      expect(res.deviation).toBe(0);
    });

    it('上限比较: 实测 0.086%, 标准 <= 0.08%, 修约保留 2 位', () => {
      // 0.086 修约后为 0.09 -> 超标 0.01
      const res = compareWithLimit(0.086, 0.08, '<=', 2);
      expect(res.isPass).toBe(false);
      expect(res.roundedValue).toBe(0.09);
      expect(res.deviation).toBe(0.01);
    });

    it('下限比较: 实测 519.8 MPa, 标准 >= 520 MPa, 修约保留 0 位', () => {
      // 519.8 修约后为 520 -> 合格
      const res = compareWithLimit(519.8, 520, '>=', 0);
      expect(res.isPass).toBe(true);
      expect(res.roundedValue).toBe(520);
    });
  });
});
