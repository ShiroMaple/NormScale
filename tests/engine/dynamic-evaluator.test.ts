import { describe, it, expect } from 'vitest';
import { SafeMathEvaluator, evaluateDynamicExpression } from '@/engine/dynamic-evaluator';
import { EvaluationContext } from '@/engine/numeric-evaluator';
import { EvaluationRule } from '@/schemas/standard.schema';
import { TestRecord } from '@/schemas/certificate.schema';

describe('SafeMathEvaluator & Dynamic Evaluator 测试', () => {
  const mockContext: EvaluationContext = {
    header: {
      certificate_no: 'CERT-001',
      declared_standard: 'GB/T 13296-2023',
      declared_grade: '07Cr19Ni11Ti',
      dimensions: {
        outer_diameter_mm: 25.0,
        wall_thickness_mm: 2.0,
        length_mm: 6000,
      },
    },
    recordsMap: new Map(),
    chemical: {
      C: 0.06,
      N: 0.03,
      Ti: 0.45,
    },
    mechanical: {
      tensile_strength: 560,
    },
    dimensions: {
      outer_diameter_mm: 25.0,
      wall_thickness_mm: 2.0,
    },
  };

  it('正确求值纯算术表达式及括号优先级', () => {
    const evaluator = new SafeMathEvaluator('2 + 3 * 4', mockContext);
    expect(evaluator.evaluate()).toBe(14);

    const evaluator2 = new SafeMathEvaluator('(2 + 3) * 4', mockContext);
    expect(evaluator2.evaluate()).toBe(20);

    const evaluator3 = new SafeMathEvaluator('10 / 2 - 3', mockContext);
    expect(evaluator3.evaluate()).toBe(2);
  });

  it('正确解析注入的化学元素变量 Ti >= 4 * (C + N)', () => {
    // 4 * (0.06 + 0.03) = 4 * 0.09 = 0.36
    const evaluator = new SafeMathEvaluator('4 * (ctx.chemical.C + ctx.chemical.N)', mockContext);
    expect(evaluator.evaluate()).toBeCloseTo(0.36, 5);
  });

  it('正确解析几何尺寸变量 S 与 D 计算压扁高度 H = (1 + 0.09) * S / (0.09 + S / D)', () => {
    // S = 2.0, D = 25.0
    // (1 + 0.09) * 2.0 / (0.09 + 2.0 / 25.0) = 2.18 / (0.09 + 0.08) = 2.18 / 0.17 = 12.8235...
    const evaluator = new SafeMathEvaluator('(1 + 0.09) * S / (0.09 + S / D)', mockContext);
    expect(evaluator.evaluate()).toBeCloseTo(12.8235, 4);
  });

  it('除以零时安全抛出异常', () => {
    const evaluator = new SafeMathEvaluator('10 / 0', mockContext);
    expect(() => evaluator.evaluate()).toThrow('Division by zero');
  });

  it('缺少必要变量时安全抛出清晰错误', () => {
    const evaluator = new SafeMathEvaluator('4 * (ctx.chemical.C + ctx.chemical.UnknownElem)', mockContext);
    expect(() => evaluator.evaluate()).toThrow("Chemical element 'UnknownElem' required in formula");
  });

  it('evaluateDynamicExpression 判定 Ti 达标', () => {
    const rule: EvaluationRule = {
      rule_id: 'CHEM_TI_DYNAMIC',
      category: 'chemical',
      property_key: 'Ti',
      display_name: '钛含量 (Ti)',
      rule_type: 'dynamic_expression',
      requirement_level: 'MANDATORY',
      criteria: {
        formula_min: '4 * (ctx.chemical.C + ctx.chemical.N)',
        max: 0.70,
        unit: '%',
        rounding_decimals: 3,
      },
    };

    const record: TestRecord = {
      category: 'chemical',
      property_key: 'Ti',
      measured_value_num: 0.45,
      measured_value_raw: '0.45%',
      unit: '%',
    };

    const result = evaluateDynamicExpression(rule, record, mockContext);
    expect(result.status).toBe('PASS');
    expect(result.standard_min).toBe(0.36);
    expect(result.standard_max).toBe(0.70);
  });

  it('evaluateDynamicExpression 判定 Ti 不足 (超标/不达标)', () => {
    const rule: EvaluationRule = {
      rule_id: 'CHEM_TI_DYNAMIC',
      category: 'chemical',
      property_key: 'Ti',
      display_name: '钛含量 (Ti)',
      rule_type: 'dynamic_expression',
      requirement_level: 'MANDATORY',
      criteria: {
        formula_min: '4 * (ctx.chemical.C + ctx.chemical.N)',
        max: 0.70,
        unit: '%',
        rounding_decimals: 3,
      },
    };

    const record: TestRecord = {
      category: 'chemical',
      property_key: 'Ti',
      measured_value_num: 0.30, // 0.30 < 0.36
      measured_value_raw: '0.30%',
      unit: '%',
    };

    const result = evaluateDynamicExpression(rule, record, mockContext);
    expect(result.status).toBe('FAIL');
    expect(result.deviation).toBeCloseTo(0.06, 5);
  });

  it('支持 formula_max 动态上限求值与超标判断', () => {
    const rule: EvaluationRule = {
      rule_id: 'DYNAMIC_MAX_TEST',
      category: 'chemical',
      property_key: 'Ti',
      display_name: '钛含量上限',
      rule_type: 'dynamic_expression',
      requirement_level: 'MANDATORY',
      criteria: {
        formula_max: '10 * ctx.chemical.C', // 10 * 0.06 = 0.60
        unit: '%',
      },
    };

    // 0.65 > 0.60 -> FAIL
    const failRecord: TestRecord = {
      category: 'chemical',
      property_key: 'Ti',
      measured_value_num: 0.65,
    };
    const failRes = evaluateDynamicExpression(rule, failRecord, mockContext);
    expect(failRes.status).toBe('FAIL');
    expect(failRes.standard_max).toBe(0.6);
    expect(failRes.deviation).toBeCloseTo(0.05, 5);

    // 0.50 <= 0.60 -> PASS
    const passRecord: TestRecord = {
      category: 'chemical',
      property_key: 'Ti',
      measured_value_num: 0.50,
    };
    const passRes = evaluateDynamicExpression(rule, passRecord, mockContext);
    expect(passRes.status).toBe('PASS');
  });

  it('内置数学函数 (min, max, sqrt) 求值', () => {
    expect(new SafeMathEvaluator('min(10, 20, 5)', mockContext).evaluate()).toBe(5);
    expect(new SafeMathEvaluator('max(10, 20, 5)', mockContext).evaluate()).toBe(20);
    expect(new SafeMathEvaluator('sqrt(16)', mockContext).evaluate()).toBe(4);
    expect(() => new SafeMathEvaluator('sqrt(-1)', mockContext).evaluate()).toThrow();
  });

  it('未提供实测记录时根据 requirement_level 判定 MISSING 或 SKIPPED', () => {
    const mandatoryRule: EvaluationRule = {
      rule_id: 'MANDATORY_DYN',
      category: 'chemical',
      property_key: 'Ti',
      display_name: '钛',
      rule_type: 'dynamic_expression',
      requirement_level: 'MANDATORY',
      criteria: { formula_min: '4 * ctx.chemical.C' },
    };
    expect(evaluateDynamicExpression(mandatoryRule, undefined, mockContext).status).toBe('MISSING');

    const optionalRule: EvaluationRule = {
      ...mandatoryRule,
      requirement_level: 'OPTIONAL_AGREED',
    };
    expect(evaluateDynamicExpression(optionalRule, undefined, mockContext).status).toBe('SKIPPED');
  });
});
