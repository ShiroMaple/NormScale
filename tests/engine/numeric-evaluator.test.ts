import { describe, it, expect } from 'vitest';
import { evaluateNumericRange, EvaluationContext } from '@/engine/numeric-evaluator';
import { EvaluationRule } from '@/schemas/standard.schema';
import { TestRecord } from '@/schemas/certificate.schema';

describe('Numeric Evaluator (数值区间评估器) 边界测试', () => {
  const baseContext: EvaluationContext = {
    header: {
      certificate_no: 'TEST-001',
      declared_standard: 'GB/T 13296-2023',
      declared_grade: '06Cr19Ni10',
      manufacturing_process: 'cold_drawn',
      dimensions: { wall_thickness_mm: 2.0 },
    },
    recordsMap: new Map(),
    chemical: {},
    mechanical: {},
    dimensions: { wall_thickness_mm: 2.0 },
  };

  const cRule: EvaluationRule = {
    rule_id: 'CHEM_C',
    category: 'chemical',
    property_key: 'C',
    display_name: '碳含量',
    rule_type: 'numeric_range',
    requirement_level: 'MANDATORY',
    criteria: {
      max: 0.08,
      unit: '%',
      rounding_decimals: 3,
    },
  };

  it('未提供实测记录时，MANDATORY 规则判定为 MISSING', () => {
    const res = evaluateNumericRange(cRule, undefined, baseContext);
    expect(res.status).toBe('MISSING');
    expect(res.actual_value_text).toBe('未报送');
    expect(res.message).toContain('未在质保书中报送');
  });

  it('未提供实测记录时，OPTIONAL_AGREED 规则判定为 SKIPPED', () => {
    const optRule: EvaluationRule = {
      ...cRule,
      requirement_level: 'OPTIONAL_AGREED',
    };
    const res = evaluateNumericRange(optRule, undefined, baseContext);
    expect(res.status).toBe('SKIPPED');
  });

  it('实测值刚好等于上限 (边界闭区间) 判定为 PASS', () => {
    const record: TestRecord = {
      category: 'chemical',
      property_key: 'C',
      measured_value_num: 0.080,
      unit: '%',
    };
    const res = evaluateNumericRange(cRule, record, baseContext);
    expect(res.status).toBe('PASS');
    expect(res.deviation).toBeNull();
  });

  it('双边闭区间: Ni 8.00 ~ 11.00%', () => {
    const niRule: EvaluationRule = {
      rule_id: 'CHEM_NI',
      category: 'chemical',
      property_key: 'Ni',
      display_name: '镍含量',
      rule_type: 'numeric_range',
      requirement_level: 'MANDATORY',
      criteria: { min: 8.00, max: 11.00, unit: '%', rounding_decimals: 2 },
    };

    // 刚好下限 8.00 -> PASS
    expect(evaluateNumericRange(niRule, { category: 'chemical', property_key: 'Ni', measured_value_num: 8.00 }, baseContext).status).toBe('PASS');
    // 7.994 修约后为 7.99 -> FAIL
    const failRes = evaluateNumericRange(niRule, { category: 'chemical', property_key: 'Ni', measured_value_num: 7.994 }, baseContext);
    expect(failRes.status).toBe('FAIL');
    expect(failRes.deviation).toBeCloseTo(0.01, 5);

    // 11.004 修约后为 11.00 -> PASS
    expect(evaluateNumericRange(niRule, { category: 'chemical', property_key: 'Ni', measured_value_num: 11.004 }, baseContext).status).toBe('PASS');
  });

  it('条件修正 condition_adjustments: 热挤压工艺抗拉强度降低 20MPa', () => {
    const rmRule: EvaluationRule = {
      rule_id: 'MECH_RM',
      category: 'mechanical',
      property_key: 'tensile_strength',
      display_name: '抗拉强度',
      rule_type: 'numeric_range',
      requirement_level: 'MANDATORY',
      criteria: {
        min: 520,
        unit: 'MPa',
        condition_adjustments: [
          {
            when: "ctx.header.manufacturing_process == 'hot_extrusion'",
            min_offset: -20,
            note: '热挤压允许降低20MPa',
          },
        ],
      },
    };

    // 冷拔管: 下限为 520 MPa，实测 510 MPa -> FAIL
    const coldRes = evaluateNumericRange(rmRule, { category: 'mechanical', property_key: 'tensile_strength', measured_value_num: 510 }, baseContext);
    expect(coldRes.status).toBe('FAIL');
    expect(coldRes.standard_min).toBe(520);

    // 热挤压管: 下限调整为 500 MPa，实测 510 MPa -> PASS
    const hotContext: EvaluationContext = {
      ...baseContext,
      header: { ...baseContext.header, manufacturing_process: 'hot_extrusion' },
    };
    const hotRes = evaluateNumericRange(rmRule, { category: 'mechanical', property_key: 'tensile_strength', measured_value_num: 510 }, hotContext);
    expect(hotRes.status).toBe('PASS');
    expect(hotRes.standard_min).toBe(500);
  });
});
