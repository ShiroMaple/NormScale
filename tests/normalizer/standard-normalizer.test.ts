import { describe, it, expect } from 'vitest';
import { normalizeStandardId, areStandardCollectionsEquivalent } from '../../src/lib/utils.ts';

describe('Standard Normalizer & Fingerprint Matcher (标准代号归一化与指纹匹配)', () => {
  it('应准确提取标准代号纯净指纹，抹除空格与符号大小写差异', () => {
    // 承压订货标准各种形态
    expect(normalizeStandardId('NB/T 47019.5-2021')).toBe('NBT47019.52021');
    expect(normalizeStandardId('NB/T47019.5-2021')).toBe('NBT47019.52021');
    expect(normalizeStandardId('NB/T  47019.5-2021')).toBe('NBT47019.52021');
    expect(normalizeStandardId('nb/t 47019.5-2021')).toBe('NBT47019.52021');
    expect(normalizeStandardId('NB_T_47019_5_2021')).toBe('NBT4701952021');

    // 通用制造标准各种形态
    expect(normalizeStandardId('GB/T 13296-2023')).toBe('GBT132962023');
    expect(normalizeStandardId('GB/T13296-2023')).toBe('GBT132962023');
    expect(normalizeStandardId('gb/t 13296-2023')).toBe('GBT132962023');
  });

  it('质保书无空格提取文本与标准库规范文本指纹完全相等', () => {
    const rawOcrNb = 'NB/T47019.5-2021';
    const catalogNb = 'NB/T 47019.5-2021';
    expect(normalizeStandardId(rawOcrNb)).toBe(normalizeStandardId(catalogNb));

    const rawOcrGb = 'GB/T13296-2023';
    const catalogGb = 'GB/T 13296-2023';
    expect(normalizeStandardId(rawOcrGb)).toBe(normalizeStandardId(catalogGb));
  });

  it('多标准列表指纹防御性去重逻辑验证', () => {
    const mixedList = [
      'NB/T47019.5-2021',
      'GB/T13296-2023',
      'NB/T 47019.5-2021', // 带空格重复项
      'GB/T 13296-2023',  // 带空格重复项
    ];

    const seen = new Set<string>();
    const deduplicated: string[] = [];
    for (const item of mixedList) {
      const fp = normalizeStandardId(item);
      if (!seen.has(fp)) {
        seen.add(fp);
        deduplicated.push(item);
      }
    }

    expect(deduplicated).toHaveLength(2);
    expect(deduplicated).toEqual(['NB/T47019.5-2021', 'GB/T13296-2023']);
  });

  describe('areStandardCollectionsEquivalent (标准集合等价性比对)', () => {
    it('顺序颠倒且空格不同的标准集合判定为完全等价', () => {
      // 质保书原始声明（NB在前，无空格）
      const origin = 'NB/T47019.5-2021、GB/T13296-2023';
      // 用户取消勾选又重新勾选后（GB在前，带空格）
      const reselected = ['GB/T 13296-2023', 'NB/T 47019.5-2021'];

      expect(areStandardCollectionsEquivalent(reselected, origin)).toBe(true);
      expect(areStandardCollectionsEquivalent(origin, reselected)).toBe(true);
    });

    it('实质增减标准时判定为不等价', () => {
      const origin = 'NB/T47019.5-2021、GB/T13296-2023';
      // 仅保留一个标准
      const single = ['GB/T 13296-2023'];
      expect(areStandardCollectionsEquivalent(single, origin)).toBe(false);

      // 增加了第三个标准
      const triple = ['GB/T 13296-2023', 'NB/T 47019.5-2021', 'GB/T 24593-2018'];
      expect(areStandardCollectionsEquivalent(triple, origin)).toBe(false);
    });

    it('空值或未定义防御测试', () => {
      expect(areStandardCollectionsEquivalent(undefined, undefined)).toBe(true);
      expect(areStandardCollectionsEquivalent('', undefined)).toBe(true);
      expect(areStandardCollectionsEquivalent('GB/T 13296-2023', undefined)).toBe(false);
    });
  });
});

