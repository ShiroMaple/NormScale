import { describe, it, expect } from 'vitest';
import {
  evaluateOrChoiceGroup,
  evaluateAlternativeGroup,
  evaluateQualitativeEnum,
  evaluateExemption,
} from '@/engine/logic-evaluator';
import { EvaluationRule } from '@/schemas/standard.schema';
import { TestRecord } from '@/schemas/certificate.schema';
import { EvaluationContext } from '@/engine/numeric-evaluator';

describe('Logic & Qualitative Evaluators (多选、替代组与定性豁免评估器)', () => {
  const baseContext: EvaluationContext = {
    header: {
      certificate_no: 'TEST-LOGIC',
      declared_standard: 'GB/T 13296-2023',
      declared_grade: '06Cr19Ni10',
    },
    recordsMap: new Map(),
    chemical: {},
    mechanical: {},
    dimensions: {},
  };

  describe('evaluateOrChoiceGroup (硬度多选一)', () => {
    const hardnessRule: EvaluationRule = {
      rule_id: 'MECH_HARDNESS',
      category: 'mechanical',
      property_key: 'hardness',
      display_name: '硬度指标',
      rule_type: 'or_choice_group',
      requirement_level: 'MANDATORY',
      criteria: {
        options: [
          { sub_key: 'HRB', rule_type: 'numeric_range', criteria: { max: 90, unit: 'HRB' } },
          { sub_key: 'HBW', rule_type: 'numeric_range', criteria: { max: 192, unit: 'HBW' } },
          { sub_key: 'HV',  rule_type: 'numeric_range', criteria: { max: 200, unit: 'HV' } },
        ],
      },
    };

    it('未报送任何硬度指标 -> MISSING', () => {
      const res = evaluateOrChoiceGroup(hardnessRule, baseContext);
      expect(res.status).toBe('MISSING');
      expect(res.actual_value_text).toBe('未报送');
    });

    it('报送 HRB 85 (<= 90) -> PASS', () => {
      const ctx: EvaluationContext = {
        ...baseContext,
        recordsMap: new Map([
          ['hardness_HRB', { category: 'mechanical', property_key: 'hardness', sub_property: 'HRB', measured_value_num: 85 }],
        ]),
      };
      const res = evaluateOrChoiceGroup(hardnessRule, ctx);
      expect(res.status).toBe('PASS');
      expect(res.rounded_value).toBe(85);
      expect(res.message).toContain('多选一满足要求');
    });

    it('报送 HRB 95 (> 90 超标) -> FAIL', () => {
      const ctx: EvaluationContext = {
        ...baseContext,
        recordsMap: new Map([
          ['hardness_HRB', { category: 'mechanical', property_key: 'hardness', sub_property: 'HRB', measured_value_num: 95 }],
        ]),
      };
      const res = evaluateOrChoiceGroup(hardnessRule, ctx);
      expect(res.status).toBe('FAIL');
      expect(res.message).toContain('超标');
    });
  });

  describe('evaluateAlternativeGroup (替代检验组)', () => {
    const ndtRule: EvaluationRule = {
      rule_id: 'NDT_PRESSURE',
      category: 'ndt',
      property_key: 'pressure_tightness',
      display_name: '承压检验',
      rule_type: 'alternative_group',
      requirement_level: 'MANDATORY',
      criteria: {
        group_logic: 'AT_LEAST_ONE_PASS',
        candidates: [
          { candidate_key: 'hydraulic_test', display_name: '液压试验' },
          { candidate_key: 'eddy_current_test', display_name: '涡流检测', required_level: 'E3H' },
        ],
      },
    };

    it('无任何替代记录 -> MISSING', () => {
      const res = evaluateAlternativeGroup(ndtRule, baseContext);
      expect(res.status).toBe('MISSING');
    });

    it('提供涡流检测 E3H 合格 -> PASS', () => {
      const ctx: EvaluationContext = {
        ...baseContext,
        recordsMap: new Map([
          ['eddy_current_test', { category: 'ndt', property_key: 'eddy_current_test', measured_level_claimed: 'E3H', qualitative_result: 'PASS' }],
        ]),
      };
      const res = evaluateAlternativeGroup(ndtRule, ctx);
      expect(res.status).toBe('PASS');
      expect(res.message).toContain('满足替代检验要求');
    });
  });

  describe('evaluateQualitativeEnum & evaluateExemption', () => {
    const utRule: EvaluationRule = {
      rule_id: 'NDT_UT',
      category: 'ndt',
      property_key: 'ultrasonic_test',
      display_name: '超声波探伤',
      rule_type: 'qualitative_enum',
      requirement_level: 'MANDATORY',
      criteria: { required_level: 'U2', test_standard: 'GB/T 5777-2019' },
    };

    it('超声波未报送 -> MISSING', () => {
      const res = evaluateQualitativeEnum(utRule, undefined);
      expect(res.status).toBe('MISSING');
    });

    it('超声波等级匹配 U2 -> PASS', () => {
      const rec: TestRecord = {
        category: 'ndt',
        property_key: 'ultrasonic_test',
        measured_level_claimed: 'U2',
      };
      const res = evaluateQualitativeEnum(utRule, rec);
      expect(res.status).toBe('PASS');
    });

    it('超声波等级不符 U3 -> FAIL', () => {
      const rec: TestRecord = {
        category: 'ndt',
        property_key: 'ultrasonic_test',
        measured_level_claimed: 'U3',
      };
      const res = evaluateQualitativeEnum(utRule, rec);
      expect(res.status).toBe('FAIL');
    });

    it('豁免规则 evaluateExemption 恒定返回 EXEMPT', () => {
      const exemptRule: EvaluationRule = {
        rule_id: 'CORROSION_EXEMPT',
        category: 'corrosion',
        property_key: 'intergranular_corrosion',
        display_name: '晶间腐蚀试验',
        rule_type: 'exemption',
        requirement_level: 'EXEMPT',
        criteria: { reason: '标准明确免做' },
      };
      const res = evaluateExemption(exemptRule);
      expect(res.status).toBe('EXEMPT');
      expect(res.message).toContain('标准明确免做');
    });
  });
});
