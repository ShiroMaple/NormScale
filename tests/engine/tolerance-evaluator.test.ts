import { describe, it, expect } from 'vitest';
import { evaluateDimensionTolerance } from '@/engine/tolerance-evaluator';
import { DimensionToleranceTable } from '@/schemas/standard.schema';

const mockTable1: DimensionToleranceTable = {
  table_id: 'TABLE_1',
  table_name: '表1 钢管公称外径和最小壁厚的允许偏差',
  rules: [
    // 热轧 (挤压) 钢管 W-H 外径
    { dimension_property: 'outer_diameter', process: 'hot_rolled', delivery_mode: 'min_wall', range_max: 140, plus_tolerance_value: 1.25, plus_tolerance_is_percent: true, minus_tolerance_value: -1.25, minus_tolerance_is_percent: true, note: '<= 140mm: +-1.25%D' },
    // 热轧 (挤压) 钢管 W-H 最小壁厚
    { dimension_property: 'wall_thickness', process: 'hot_rolled', delivery_mode: 'min_wall', range_max: 4.0, plus_tolerance_value: 0.90, plus_tolerance_is_percent: false, minus_tolerance_value: 0, minus_tolerance_is_percent: false, note: '<= 4.0mm: +0.90mm, 0' },
    // 冷拔 (轧) 钢管 W-C 外径
    { dimension_property: 'outer_diameter', process: 'cold_drawn', delivery_mode: 'min_wall', range_max: 25, plus_tolerance_value: 0.10, plus_tolerance_is_percent: false, minus_tolerance_value: -0.10, minus_tolerance_is_percent: false, note: '<= 25mm: +-0.10mm' },
    { dimension_property: 'outer_diameter', process: 'cold_drawn', delivery_mode: 'min_wall', range_min: 75, range_max: 100, plus_tolerance_value: 0.38, plus_tolerance_is_percent: false, minus_tolerance_value: -0.38, minus_tolerance_is_percent: false, note: '> 75~100mm: +-0.38mm' },
    // 冷拔 (轧) 钢管 W-C 最小壁厚
    { dimension_property: 'wall_thickness', process: 'cold_drawn', delivery_mode: 'min_wall', outer_diameter_limit: 38, plus_tolerance_value: 20.0, plus_tolerance_is_percent: true, minus_tolerance_value: 0, minus_tolerance_is_percent: false, note: 'D <= 38mm: +20%S, 0' },
    { dimension_property: 'wall_thickness', process: 'cold_drawn', delivery_mode: 'min_wall', outer_diameter_limit: 38, plus_tolerance_value: 22.0, plus_tolerance_is_percent: true, minus_tolerance_value: 0, minus_tolerance_is_percent: false, note: 'D > 38mm: +22%S, 0' }
  ]
};

const mockTable2: DimensionToleranceTable = {
  table_id: 'TABLE_2',
  table_name: '表2 钢管公称壁厚的允许偏差',
  rules: [
    { dimension_property: 'wall_thickness', process: 'cold_drawn', delivery_mode: 'nominal_wall', outer_diameter_limit: 38, plus_tolerance_value: 10.0, plus_tolerance_is_percent: true, minus_tolerance_value: -10.0, minus_tolerance_is_percent: true, note: 'D <= 38mm: +-10%S' }
  ]
};

describe('DimensionToleranceEvaluator 几何尺寸公差判定测试', () => {
  describe('表1 最小壁厚交货偏差核验', () => {
    it('冷拔管小口径 (D=25mm <= 25mm) 外径公差 +-0.10mm', () => {
      // 25.08mm 在 [24.90, 25.10] 之间 -> 合格
      const resPass = evaluateDimensionTolerance({
        dimensionProperty: 'outer_diameter',
        nominalValue: 25.0,
        measuredValue: 25.08,
        process: 'cold_drawn',
        deliveryMode: 'min_wall',
        table: mockTable1,
      });
      expect(resPass.isPass).toBe(true);
      expect(resPass.minAllowed).toBe(24.9);
      expect(resPass.maxAllowed).toBe(25.1);

      // 25.15mm 超出 25.10 -> 不合格
      const resFail = evaluateDimensionTolerance({
        dimensionProperty: 'outer_diameter',
        nominalValue: 25.0,
        measuredValue: 25.15,
        process: 'cold_drawn',
        deliveryMode: 'min_wall',
        table: mockTable1,
      });
      expect(resFail.isPass).toBe(false);
      expect(resFail.deviation).toBeCloseTo(0.05);
    });

    it('冷拔管小口径最小壁厚 (S=2.0mm, D=25mm <= 38mm) 允许偏差 +20%S, 0', () => {
      // 实测 2.20mm 在 [2.00, 2.40] 之间 -> 合格
      const resPass = evaluateDimensionTolerance({
        dimensionProperty: 'wall_thickness',
        nominalValue: 2.0,
        measuredValue: 2.20,
        process: 'cold_drawn',
        deliveryMode: 'min_wall',
        outerDiameter: 25.0,
        table: mockTable1,
      });
      expect(resPass.isPass).toBe(true);
      expect(resPass.minAllowed).toBe(2.0);
      expect(resPass.maxAllowed).toBe(2.4);

      // 实测 1.95mm 低于下限 2.00mm -> 欠厚不合格
      const resFail = evaluateDimensionTolerance({
        dimensionProperty: 'wall_thickness',
        nominalValue: 2.0,
        measuredValue: 1.95,
        process: 'cold_drawn',
        deliveryMode: 'min_wall',
        outerDiameter: 25.0,
        table: mockTable1,
      });
      expect(resFail.isPass).toBe(false);
      expect(resFail.deviation).toBeCloseTo(0.05);
    });

    it('热轧管薄壁 (S=3.0mm <= 4.0mm) 最小壁厚允许偏差 +0.90mm, 0', () => {
      const res = evaluateDimensionTolerance({
        dimensionProperty: 'wall_thickness',
        nominalValue: 3.0,
        measuredValue: 3.5,
        process: 'hot_rolled',
        deliveryMode: 'min_wall',
        table: mockTable1,
      });
      expect(res.isPass).toBe(true);
      expect(res.minAllowed).toBe(3.0);
      expect(res.maxAllowed).toBe(3.9);
    });
  });

  describe('表2 公称壁厚交货偏差核验', () => {
    it('冷拔管公称壁厚交货 (D <= 38mm) 允许偏差 +-10%S', () => {
      const res = evaluateDimensionTolerance({
        dimensionProperty: 'wall_thickness',
        nominalValue: 2.0,
        measuredValue: 2.15,
        process: 'cold_drawn',
        deliveryMode: 'nominal_wall',
        outerDiameter: 25.0,
        table: mockTable2,
      });
      expect(res.isPass).toBe(true);
      expect(res.minAllowed).toBe(1.8);
      expect(res.maxAllowed).toBe(2.2);
    });
  });
});
