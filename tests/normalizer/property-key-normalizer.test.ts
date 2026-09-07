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

  it('原则一（特异性优先）：粗糙度优先于宏观表面外观质量', () => {
    const rRough = PropertyKeyNormalizer.normalize('表面粗糙度');
    expect(rRough.property_key).toBe('surface_roughness');
    expect(rRough.category).toBe('surface');

    const rRa = PropertyKeyNormalizer.normalize('Ra');
    expect(rRa.property_key).toBe('surface_roughness');
    expect(rRa.sub_property).toBe('Ra');

    const rRz = PropertyKeyNormalizer.normalize('表面Rz粗糙度');
    expect(rRz.property_key).toBe('surface_roughness');
    expect(rRz.sub_property).toBe('Rz');

    const rSurface = PropertyKeyNormalizer.normalize('表面质量与外观');
    expect(rSurface.property_key).toBe('surface_quality');
    expect(rSurface.category).toBe('surface');
  });

  it('原则二（量纲与类型感知）：实测纯数值与微米单位触发粗糙度反向纠偏', () => {
    // 虽然传入名称仅为模糊的 '表面'，但 context 携带微米单位与浮点数值
    const rInferred = PropertyKeyNormalizer.normalize('表面', undefined, {
      measuredRaw: 0.33,
      unit: 'μm',
    });
    expect(rInferred.property_key).toBe('surface_roughness');
    expect(rInferred.sub_property).toBe('μm');

    // 模糊的 '表面'，若实测为纯定性文本 '合格'，保持为定性外观质量
    const rQual = PropertyKeyNormalizer.normalize('表面', undefined, {
      measuredRaw: '合格 OK',
      unit: '',
    });
    expect(rQual.property_key).toBe('surface_quality');
  });

  it('原则四（安全沙箱隔离）：未收录的非标检验项标记 is_sandbox = true', () => {
    const rUnknown = PropertyKeyNormalizer.normalize('超低残余应力中子衍射测定');
    expect(rUnknown.is_known).toBe(false);
    expect(rUnknown.is_sandbox).toBe(true);
    expect(rUnknown.category).toBe('other');
  });
});
