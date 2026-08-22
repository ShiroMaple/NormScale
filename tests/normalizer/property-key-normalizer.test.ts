import { describe, it, expect } from 'vitest';
import { PropertyKeyNormalizer } from '@/normalizer/property-key-normalizer';

describe('PropertyKeyNormalizer 检验项目名称与类别映射测试', () => {
  it('正确识别化学元素符号与中文化学名', () => {
    const rC = PropertyKeyNormalizer.normalize('C');
    expect(rC.property_key).toBe('C');
    expect(rC.category).toBe('chemical');

    const rNi = PropertyKeyNormalizer.normalize('镍含量');
    expect(rNi.property_key).toBe('Ni');
    expect(rNi.category).toBe('chemical');

    const rTi = PropertyKeyNormalizer.normalize('Ti');
    expect(rTi.property_key).toBe('Ti');
  });

  it('正确识别拉伸与力学性能各类异构名称', () => {
    // 抗拉强度
    expect(PropertyKeyNormalizer.normalize('抗拉强度 Rm').property_key).toBe('tensile_strength');
    expect(PropertyKeyNormalizer.normalize('Tensile Strength').property_key).toBe('tensile_strength');
    expect(PropertyKeyNormalizer.normalize('TS').property_key).toBe('tensile_strength');

    // 屈服强度
    expect(PropertyKeyNormalizer.normalize('屈服强度 ReH (Rp0.2)').property_key).toBe('yield_strength_rp02');
    expect(PropertyKeyNormalizer.normalize('Yield Strength (0.2%)').property_key).toBe('yield_strength_rp02');
    expect(PropertyKeyNormalizer.normalize('YS').property_key).toBe('yield_strength_rp02');

    // 伸长率
    expect(PropertyKeyNormalizer.normalize('断后伸长率 A').property_key).toBe('elongation_A');
    expect(PropertyKeyNormalizer.normalize('Elongation').property_key).toBe('elongation_A');
    expect(PropertyKeyNormalizer.normalize('EL').property_key).toBe('elongation_A');
  });

  it('正确识别硬度试验及硬度子类型', () => {
    const rHrb = PropertyKeyNormalizer.normalize('洛氏硬度 HRB');
    expect(rHrb.property_key).toBe('hardness');
    expect(rHrb.sub_property).toBe('HRB');

    const rHbw = PropertyKeyNormalizer.normalize('布氏硬度 (HBW)');
    expect(rHbw.property_key).toBe('hardness');
    expect(rHbw.sub_property).toBe('HBW');

    const rHv = PropertyKeyNormalizer.normalize('维氏硬度 HV');
    expect(rHv.property_key).toBe('hardness');
    expect(rHv.sub_property).toBe('HV');
  });

  it('正确识别工艺、金相、腐蚀与无损检测项目', () => {
    expect(PropertyKeyNormalizer.normalize('压扁试验').property_key).toBe('flattening_test');
    expect(PropertyKeyNormalizer.normalize('奥氏体晶粒度').property_key).toBe('grain_size');
    expect(PropertyKeyNormalizer.normalize('晶间腐蚀试验 (E法)').property_key).toBe('intergranular_corrosion');
    expect(PropertyKeyNormalizer.normalize('涡流探伤 ET').property_key).toBe('eddy_current_test');
    expect(PropertyKeyNormalizer.normalize('超声波探伤 (UT)').property_key).toBe('ultrasonic_test');
  });
});
