import { describe, it, expect } from 'vitest';
import { DimensionNormalizer } from '@/normalizer/dimension-normalizer';

describe('DimensionNormalizer 几何规格解析测试', () => {
  it('正确解析复合规格字符串 (如 Φ25.0×2.0×6000mm)', () => {
    const dim = DimensionNormalizer.normalize(undefined, 'Φ25.0×2.0×6000mm');
    expect(dim).toBeDefined();
    expect(dim?.outer_diameter_mm).toBe(25.0);
    expect(dim?.wall_thickness_mm).toBe(2.0);
    expect(dim?.length_mm).toBe(6000);
  });

  it('正确解析带单位的独立字段 (如 2.5cm, 3.0mm, 6m) 与交货方式', () => {
    const dim = DimensionNormalizer.normalize({
      outer_diameter: '2.5cm',
      wall_thickness: '2.0mm',
      length: '6m',
      delivery_mode: '最小壁厚交货',
    });
    expect(dim).toBeDefined();
    expect(dim?.outer_diameter_mm).toBe(25.0);
    expect(dim?.wall_thickness_mm).toBe(2.0);
    expect(dim?.length_mm).toBe(6000);
    expect(dim?.delivery_mode).toBe('min_wall');
  });
});
