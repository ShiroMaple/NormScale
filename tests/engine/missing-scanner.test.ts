import { describe, it, expect } from 'vitest';
import { isRuleTriggered } from '@/engine/missing-scanner';
import { EvaluationRule } from '@/schemas/standard.schema';
import { EvaluationContext } from '@/engine/numeric-evaluator';

describe('Missing Scanner & Condition Trigger (前置触发条件解析)', () => {
  const baseContext: EvaluationContext = {
    header: {
      certificate_no: 'TEST-TRIGGERS',
      declared_standard: 'GB/T 13296-2023',
      declared_grade: '06Cr19Ni10',
      dimensions: {
        wall_thickness_mm: 2.0,
        outer_diameter_mm: 25.0,
        length_mm: 6000,
      },
    },
    recordsMap: new Map(),
    chemical: {},
    mechanical: {},
    dimensions: {
      wall_thickness_mm: 2.0,
      outer_diameter_mm: 25.0,
    },
  };

  const ruleWithTrigger = (trigger: string): EvaluationRule => ({
    rule_id: 'RULE_TEST',
    category: 'mechanical',
    property_key: 'test_key',
    display_name: '测试项',
    rule_type: 'numeric_range',
    requirement_level: 'CONDITIONAL',
    trigger_condition: trigger,
    criteria: {},
  });

  it('无 trigger_condition 时默认激活', () => {
    const rule: EvaluationRule = {
      ...ruleWithTrigger(''),
      trigger_condition: undefined,
    };
    expect(isRuleTriggered(rule, baseContext)).toBe(true);
  });

  it('壁厚 >= 1.7 且实测壁厚 2.0 -> 激活', () => {
    const rule = ruleWithTrigger('ctx.header.dimensions.wall_thickness_mm >= 1.7');
    expect(isRuleTriggered(rule, baseContext)).toBe(true);
  });

  it('壁厚 >= 1.7 但实测壁厚 1.5 -> 未激活', () => {
    const ctx: EvaluationContext = {
      ...baseContext,
      header: { ...baseContext.header, dimensions: { wall_thickness_mm: 1.5 } },
    };
    const rule = ruleWithTrigger('ctx.header.dimensions.wall_thickness_mm >= 1.7');
    expect(isRuleTriggered(rule, ctx)).toBe(false);
  });

  it('简写变量 S <= 10.0 (壁厚 2.0) -> 激活', () => {
    const rule = ruleWithTrigger('S <= 10.0');
    expect(isRuleTriggered(rule, baseContext)).toBe(true);
  });

  it('复合多条件 D <= 150.0 && S <= 10.0 (D=25, S=2) -> 激活', () => {
    const rule = ruleWithTrigger('D <= 150.0 && S <= 10.0');
    expect(isRuleTriggered(rule, baseContext)).toBe(true);
  });

  it('复合多条件中有一项不满足 -> 未激活', () => {
    const rule = ruleWithTrigger('D <= 20.0 && S <= 10.0'); // D=25 > 20
    expect(isRuleTriggered(rule, baseContext)).toBe(false);
  });

  it('缺少所需几何尺寸维度 -> 安全返回 false (未激活)', () => {
    const emptyCtx: EvaluationContext = {
      ...baseContext,
      header: { ...baseContext.header, dimensions: undefined },
    };
    const rule = ruleWithTrigger('S >= 1.7');
    expect(isRuleTriggered(rule, emptyCtx)).toBe(false);
  });
});
