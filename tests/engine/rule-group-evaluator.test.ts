import { describe, it, expect } from 'vitest';
import { RuleGrouper } from '@/engine/rule-grouper';
import { RuleGroupEvaluator } from '@/engine/rule-group-evaluator';
import { MultiStandardGroupComposer } from '@/engine/multi-standard-group-composer';
import { RASERule } from '@/schemas/standard.schema';
import { RuleEvaluationItemResult } from '@/schemas/report.schema';

describe('RASE Rule Group & Multi-Standard Composition Tests', () => {
  // 定义标准硬度三选一规则 (GB/T 13296 / NB/T 47019.5 典型原子拓扑)
  const hardnessGroupRules: RASERule[] = [
    {
      rule_id: 'RULE_HARDNESS_S32168_HBW',
      clause_ref: '表4',
      conformance_level: 'MANDATORY',
      severity: 'ERROR',
      selection: { category: 'mechanical', data_element_id: 'mech.hardness.HBW', target_entity: 'product' },
      applicability: [{ field: 'grade', operator: '==', value: 'S32168' }],
      requirement: { operator: '<=', value: 192, unit: 'HBW', description: 'HBW <= 192' },
      group: { id: 'GRP_S32168_HARDNESS', semantic_code: 'HARDNESS_CHOICE', op: 'OR', name: 'S32168 硬度检验三选一', min_pass: 1 },
    },
    {
      rule_id: 'RULE_HARDNESS_S32168_HRB',
      clause_ref: '表4',
      conformance_level: 'OPTIONAL',
      severity: 'ERROR',
      selection: { category: 'mechanical', data_element_id: 'mech.hardness.HRB', target_entity: 'product' },
      applicability: [{ field: 'grade', operator: '==', value: 'S32168' }],
      requirement: { operator: '<=', value: 90, unit: 'HRB', description: 'HRB <= 90' },
      group: { id: 'GRP_S32168_HARDNESS', semantic_code: 'HARDNESS_CHOICE', op: 'OR', name: 'S32168 硬度检验三选一', min_pass: 1 },
    },
    {
      rule_id: 'RULE_HARDNESS_S32168_HV',
      clause_ref: '表4',
      conformance_level: 'OPTIONAL',
      severity: 'ERROR',
      selection: { category: 'mechanical', data_element_id: 'mech.hardness.HV', target_entity: 'product' },
      applicability: [{ field: 'grade', operator: '==', value: 'S32168' }],
      requirement: { operator: '<=', value: 200, unit: 'HV', description: 'HV <= 200' },
      group: { id: 'GRP_S32168_HARDNESS', semantic_code: 'HARDNESS_CHOICE', op: 'OR', name: 'S32168 硬度检验三选一', min_pass: 1 },
    },
  ];

  describe('任务 1: RuleGrouper (规则预处理与归组)', () => {
    it('测试用例 C（无组信息的独立规则）：验证独立规则与规则组正确拆分，不受影响', () => {
      const independentRule: RASERule = {
        rule_id: 'CHEM_S32168_C',
        clause_ref: '表1',
        conformance_level: 'MANDATORY',
        severity: 'ERROR',
        selection: { category: 'chemical', data_element_id: 'chem.element.C', target_entity: 'heat_analysis' },
        applicability: [{ field: 'grade', operator: '==', value: 'S32168' }],
        requirement: { operator: '<=', value: 0.08, unit: '%' },
      };

      const { singleRules, groupedRules } = RuleGrouper.partition([independentRule, ...hardnessGroupRules]);
      expect(singleRules.length).toBe(1);
      expect(singleRules[0]!.rule_id).toBe('CHEM_S32168_C');

      expect(groupedRules.size).toBe(1);
      const groupEntry = groupedRules.get('GRP_S32168_HARDNESS')!;
      expect(groupEntry).toBeDefined();
      expect(groupEntry.rules.length).toBe(3);
      expect(groupEntry.groupMeta.semantic_code).toBe('HARDNESS_CHOICE');
      expect(groupEntry.groupMeta.op).toBe('OR');
    });
  });

  describe('任务 2: RuleGroupEvaluator (逻辑组评估器实现)', () => {
    it('测试用例 A（硬度三选一 - 单项满足）：MTC 仅有 HBW=180，HRB/HV 缺失 -> GROUP 输出 PASS，不报缺失', () => {
      const mockEvaluator = (rule: RASERule): RuleEvaluationItemResult => {
        if (rule.selection.data_element_id === 'mech.hardness.HBW') {
          return {
            rule_id: rule.rule_id,
            category: 'mechanical',
            property_key: rule.selection.data_element_id,
            display_name: '布氏硬度',
            status: 'PASS',
            requirement_level: (rule.conformance_level === 'OPTIONAL' ? 'OPTIONAL_AGREED' : 'MANDATORY'),
            standard_requirement_text: '<= 192 HBW',
            actual_value_text: '180 HBW',
            message: '实测 180 符合标准要求',
          };
        }
        return {
          rule_id: rule.rule_id,
          category: 'mechanical',
          property_key: rule.selection.data_element_id,
          display_name: rule.selection.data_element_id,
          status: 'MISSING',
          requirement_level: (rule.conformance_level === 'OPTIONAL' ? 'OPTIONAL_AGREED' : 'MANDATORY'),
          standard_requirement_text: '<= 阈值',
          actual_value_text: '未报送',
          message: '未报送该指标',
        };
      };

      const groupMeta = hardnessGroupRules[0]!.group!;
      const result = RuleGroupEvaluator.evaluate(groupMeta, hardnessGroupRules, mockEvaluator);

      expect(result.status).toBe('PASS');
      expect(result.is_blocking).toBe(false);
      expect(result.pass_count).toBe(1);
      expect(result.summary).toContain('满足判定要求');

      // 验证未报送的 HRB 与 HV 得到就地抑制 (is_suppressed)
      const hrb = result.evaluated_rules.find(r => r.data_element_id === 'mech.hardness.HRB');
      const hv = result.evaluated_rules.find(r => r.data_element_id === 'mech.hardness.HV');
      expect(hrb?.status).toBe('MISSING');
      expect(hrb?.is_suppressed).toBe(true);
      expect(hv?.status).toBe('MISSING');
      expect(hv?.is_suppressed).toBe(true);
    });

    it('测试用例 B（硬度三选一 - 全不满足）：MTC 仅有 HBW=220（超标 > 192） -> GROUP 输出 FAIL', () => {
      const mockEvaluator = (rule: RASERule): RuleEvaluationItemResult => {
        if (rule.selection.data_element_id === 'mech.hardness.HBW') {
          return {
            rule_id: rule.rule_id,
            category: 'mechanical',
            property_key: rule.selection.data_element_id,
            display_name: '布氏硬度',
            status: 'FAIL',
            requirement_level: (rule.conformance_level === 'OPTIONAL' ? 'OPTIONAL_AGREED' : 'MANDATORY'),
            standard_requirement_text: '<= 192 HBW',
            actual_value_text: '220 HBW',
            message: '实测 220 超过上限 192',
          };
        }
        return {
          rule_id: rule.rule_id,
          category: 'mechanical',
          property_key: rule.selection.data_element_id,
          display_name: rule.selection.data_element_id,
          status: 'MISSING',
          requirement_level: (rule.conformance_level === 'OPTIONAL' ? 'OPTIONAL_AGREED' : 'MANDATORY'),
          standard_requirement_text: '<= 阈值',
          actual_value_text: '未报送',
          message: '未报送该指标',
        };
      };

      const groupMeta = hardnessGroupRules[0]!.group!;
      const result = RuleGroupEvaluator.evaluate(groupMeta, hardnessGroupRules, mockEvaluator);

      expect(result.status).toBe('FAIL');
      expect(result.is_blocking).toBe(true);
      expect(result.pass_count).toBe(0);
      expect(result.summary).toContain('判定不合格');
      expect(result.summary).toContain('指标超标 [mech.hardness.HBW: 220 HBW]');
      expect(result.summary).toContain('候选指标缺失 [mech.hardness.HRB, mech.hardness.HV]');
    });

    it('扩展用例：部分合格、部分超标 -> 输出 PASS_WITH_WARNING 不阻断放行', () => {
      const mockEvaluator = (rule: RASERule): RuleEvaluationItemResult => {
        if (rule.selection.data_element_id === 'mech.hardness.HBW') {
          return {
            rule_id: rule.rule_id,
            category: 'mechanical',
            property_key: rule.selection.data_element_id,
            display_name: '布氏硬度',
            status: 'PASS',
            requirement_level: (rule.conformance_level === 'OPTIONAL' ? 'OPTIONAL_AGREED' : 'MANDATORY'),
            standard_requirement_text: '<= 192 HBW',
            actual_value_text: '180 HBW',
            message: '合格',
          };
        }
        if (rule.selection.data_element_id === 'mech.hardness.HRB') {
          return {
            rule_id: rule.rule_id,
            category: 'mechanical',
            property_key: rule.selection.data_element_id,
            display_name: '洛氏硬度',
            status: 'FAIL',
            requirement_level: (rule.conformance_level === 'OPTIONAL' ? 'OPTIONAL_AGREED' : 'MANDATORY'),
            standard_requirement_text: '<= 90 HRB',
            actual_value_text: '95 HRB',
            message: '超标',
          };
        }
        return {
          rule_id: rule.rule_id,
          category: 'mechanical',
          property_key: rule.selection.data_element_id,
          display_name: rule.selection.data_element_id,
          status: 'MISSING',
          requirement_level: (rule.conformance_level === 'OPTIONAL' ? 'OPTIONAL_AGREED' : 'MANDATORY'),
          standard_requirement_text: '<= 200 HV',
          actual_value_text: '未报送',
          message: '未报送',
        };
      };

      const groupMeta = hardnessGroupRules[0]!.group!;
      const result = RuleGroupEvaluator.evaluate(groupMeta, hardnessGroupRules, mockEvaluator);

      expect(result.status).toBe('PASS_WITH_WARNING');
      expect(result.is_blocking).toBe(false);
      expect(result.summary).toContain('记录审计警示备查');
      expect(result.evaluated_rules.find(r => r.data_element_id === 'mech.hardness.HV')?.is_suppressed).toBe(true);
    });

    it('单次计算产物复用：验证 EvaluatedSubRule.raw_item_result 完整承载单次求值产物', () => {
      let callCount = 0;
      const countingEvaluator = (rule: RASERule): RuleEvaluationItemResult => {
        callCount++;
        return {
          rule_id: rule.rule_id,
          category: 'mechanical',
          property_key: rule.selection.data_element_id,
          display_name: rule.selection.data_element_id,
          status: 'PASS',
          requirement_level: (rule.conformance_level === 'OPTIONAL' ? 'OPTIONAL_AGREED' : 'MANDATORY'),
          standard_requirement_text: '<= 192',
          actual_value_text: '180',
          message: '合格',
        };
      };

      const groupMeta = hardnessGroupRules[0]!.group!;
      const res = RuleGroupEvaluator.evaluate(groupMeta, hardnessGroupRules, countingEvaluator);

      // 组内 3 条规则严格只调用 3 次
      expect(callCount).toBe(3);
      expect(res.evaluated_rules[0]!.raw_item_result).toBeDefined();
      expect(res.evaluated_rules[0]!.raw_item_result.actual_value_text).toBe('180');
    });
  });

  describe('任务 4: MultiStandardGroupComposer (多标加严与协议严格排他)', () => {
    it('技术协议严格排他锁定且排除部分选项（三选二）：min_pass 保持为 1 不变，不误升为 AND', () => {
      const taRules: RASERule[] = [
        {
          rule_id: 'TA_HBW',
          clause_ref: '技术协议第4条',
          conformance_level: 'MANDATORY',
          severity: 'ERROR',
          selection: { category: 'mechanical', data_element_id: 'mech.hardness.HBW', target_entity: 'product' },
          applicability: [],
          requirement: { operator: '<=', value: 180, unit: 'HBW' }, // 加严到 180
          group: { id: 'TA_G', semantic_code: 'HARDNESS_CHOICE', op: 'OR', min_pass: 1 },
        },
        {
          rule_id: 'TA_HV',
          clause_ref: '技术协议第4条',
          conformance_level: 'MANDATORY',
          severity: 'ERROR',
          selection: { category: 'mechanical', data_element_id: 'mech.hardness.HV', target_entity: 'product' },
          applicability: [],
          requirement: { operator: '<=', value: 190, unit: 'HV' }, // 加严到 190
          group: { id: 'TA_G', semantic_code: 'HARDNESS_CHOICE', op: 'OR', min_pass: 1 },
        },
      ];

      const composed = MultiStandardGroupComposer.compose('HARDNESS_CHOICE', [
        {
          standardId: 'GB/T 13296-2023',
          category: 'national_standard',
          priority: 4,
          groupMeta: hardnessGroupRules[0]!.group!,
          rules: hardnessGroupRules, // 包含 HBW, HRB, HV
        },
        {
          standardId: 'TA-2026-X',
          category: 'technical_agreement',
          priority: 1,
          groupMeta: taRules[0]!.group!,
          rules: taRules, // 仅允许 HBW 和 HV
        },
      ]);

      expect(composed.isPinnedByAgreement).toBe(true);
      expect(composed.rules.length).toBe(2); // HRB 成功被排他排除
      expect(composed.groupMeta.min_pass).toBe(1); // 关键：min_pass 依然是 1，绝非 2
      expect(composed.rules.find(r => r.selection.data_element_id === 'mech.hardness.HBW')?.requirement.value).toBe(180);
      expect(composed.arbitrationReason).toContain('严格排他锁定检验方式');
    });
  });
});
