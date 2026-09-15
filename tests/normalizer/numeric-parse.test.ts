import { describe, it, expect } from 'vitest';
import { parseMeasuredNum, parseHardnessValues, countAssignmentSegments, isCompositePackagedText } from '@/normalizer/numeric-parse.ts';

describe('parseMeasuredNum (实测数值解析)', () => {
  it('提取 Rp0.2 赋值后的实测值，跳过标识符内嵌数字', () => {
    expect(parseMeasuredNum('Rp0.2=334、343 MPa')).toBe(334);
  });

  it('复合打包串（多指标赋值）绝不标量化', () => {
    expect(parseMeasuredNum('Rp0.2=334、343 MPa；Rm=675、669 MPa')).toBeUndefined();
  });

  it('跳过 HV1 标尺标识符，提取后续实测值', () => {
    expect(parseMeasuredNum('HV1 143、145')).toBe(143);
  });

  it('支持小于号前缀的小数值', () => {
    expect(parseMeasuredNum('<0.01')).toBe(0.01);
  });

  it('提取多试样值的首个数值', () => {
    expect(parseMeasuredNum('334、343 MPa')).toBe(334);
  });

  it('纯定性文本返回 undefined', () => {
    expect(parseMeasuredNum('合格 OK')).toBeUndefined();
  });

  it('解析常规小数值', () => {
    expect(parseMeasuredNum('0.018')).toBe(0.018);
  });

  it('空串与非串输入返回 undefined', () => {
    expect(parseMeasuredNum('')).toBeUndefined();
    expect(parseMeasuredNum('   ')).toBeUndefined();
    expect(parseMeasuredNum(undefined)).toBeUndefined();
    expect(parseMeasuredNum(null)).toBeUndefined();
    expect(parseMeasuredNum(334)).toBeUndefined();
  });
});

describe('countAssignmentSegments / isCompositePackagedText (复合形态守卫)', () => {
  it('单段赋值不构成复合', () => {
    expect(countAssignmentSegments('Rp0.2=334、343 MPa')).toBe(1);
    expect(isCompositePackagedText('Rp0.2=334、343 MPa')).toBe(false);
  });

  it('多段赋值判定为复合打包串', () => {
    expect(countAssignmentSegments('Rp0.2=334、343 MPa；Rm=675、669 MPa；A=48.0、48.0 %')).toBe(3);
    expect(isCompositePackagedText('Rp0.2=334 MPa；Rm=675 MPa')).toBe(true);
  });

  it('无赋值段的普通文本不构成复合', () => {
    expect(countAssignmentSegments('20MPa 稳压合格')).toBe(0);
    expect(isCompositePackagedText('20MPa 稳压合格')).toBe(false);
  });
});

describe('parseHardnessValues (硬度多值提取)', () => {
  it('剥离 HV 标尺及载荷，不混入标尺内数字', () => {
    expect(parseHardnessValues('143、145、137 HV1')).toEqual([143, 145, 137]);
  });

  it('标尺前置形态同样剥离', () => {
    expect(parseHardnessValues('HV1 143、145')).toEqual([143, 145]);
  });

  it('标尺与数值连写时保留数值', () => {
    expect(parseHardnessValues('HRB90')).toEqual([90]);
    expect(parseHardnessValues('HBW 200、202')).toEqual([200, 202]);
  });

  it('中文标尺与无标尺形态', () => {
    expect(parseHardnessValues('维氏硬度 150')).toEqual([150]);
    expect(parseHardnessValues('143、145')).toEqual([143, 145]);
  });

  it('纯定性文本返回空数组', () => {
    expect(parseHardnessValues('合格')).toEqual([]);
    expect(parseHardnessValues('')).toEqual([]);
  });
});
