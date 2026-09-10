import { describe, it, expect } from 'vitest';
import { parseStandards } from '@/utils/standard-parser';

describe('parseStandards 智能拆分与空格规范化单元测试', () => {
  it('应能防御性处理空值与非字符串', () => {
    expect(parseStandards(null)).toEqual([]);
    expect(parseStandards(undefined)).toEqual([]);
    expect(parseStandards('')).toEqual([]);
    expect(parseStandards('   ')).toEqual([]);
  });

  it('应能正确拆分中文顿号连接的多标准并规范化代号空格', () => {
    const raw = 'NB/T47019.5-2021、GB/T13296-2023';
    const result = parseStandards(raw);
    expect(result).toEqual(['NB/T 47019.5-2021', 'GB/T 13296-2023']);
  });

  it('应能兼容逗号、分号、换行符分隔及混用场景', () => {
    const raw = 'GB/T 13296-2023, NB/T47019.5-2021; ASTM A213\nASME SA-213';
    const result = parseStandards(raw);
    expect(result).toEqual([
      'GB/T 13296-2023',
      'NB/T 47019.5-2021',
      'ASTM A213',
      'ASME SA-213',
    ]);
  });

  it('对单标准应正确保持或规范化空格', () => {
    expect(parseStandards('GB/T13296-2023')).toEqual(['GB/T 13296-2023']);
    expect(parseStandards('GB/T 13296-2023')).toEqual(['GB/T 13296-2023']);
  });

  it('应能自动去除多余重复项与空白', () => {
    const raw = 'GB/T 13296-2023、GB/T13296-2023、NB/T 47019.5-2021';
    const result = parseStandards(raw);
    expect(result).toEqual(['GB/T 13296-2023', 'NB/T 47019.5-2021']);
  });
});
