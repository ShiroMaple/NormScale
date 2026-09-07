import { describe, it, expect } from 'vitest';
import { createLlmPropertyResolverNode } from '@/workflow/nodes/llm-property-resolver.node';
import { FileRuleStore } from '@/repository/file-rule-store';
import { QualityAuditState } from '@/workflow/state.interface';

describe('LLM Property Resolver (Tier 2 语义消歧与长尾意图对齐测试)', () => {
  const ruleStore = new FileRuleStore();

  it('长尾模糊项目 (表面光洁度) 在切片规则池中成功消歧对齐至 surface_roughness', async () => {
    const resolver = createLlmPropertyResolverNode(ruleStore);

    const mockState: Partial<QualityAuditState> = {
      options: {
        forcedStandardId: 'NB/T 47019.5-2021',
        forcedGradeKey: 'S32168',
      },
      normalizedCert: {
        header: {
          certificate_no: 'TEST-CERT-01',
          declared_standard: 'NB/T 47019.5-2021',
          declared_grade: 'S32168',
        },
        test_records: [
          {
            category: 'surface',
            property_key: '表面光洁度',
            measured_value_raw: '0.33',
            measured_value_num: 0.33,
            unit: 'μm',
          },
        ],
      },
      unresolvedProperties: [
        {
          raw_name: '表面光洁度',
          raw_value: 0.33,
          raw_category: 'surface',
          unit: 'μm',
          source_tier: 'tier1',
          confidence: 0.5,
        },
      ],
    };

    const update = await resolver(mockState as QualityAuditState);

    // 1. 验证消歧列表
    expect(update.resolvedProperties).toBeDefined();
    expect(update.resolvedProperties!.length).toBe(1);
    const firstResolved = update.resolvedProperties![0]!;
    expect(firstResolved.resolved_key).toBe('surface_roughness');
    expect(firstResolved.confidence).toBeGreaterThanOrEqual(0.85);
    expect(firstResolved.source_tier).toBe('tier2');

    // 2. 验证 normalizedCert 中指标升级
    expect(update.normalizedCert?.test_records[0]?.property_key).toBe('surface_roughness');
  });

  it('对于未知力学非标指标，置信度不足时触发 PROPERTY_AMBIGUITY 人工协同中断挂起', async () => {
    const resolver = createLlmPropertyResolverNode(ruleStore);

    const mockState: Partial<QualityAuditState> = {
      options: {
        forcedStandardId: 'NB/T 47019.5-2021',
        forcedGradeKey: 'S32168',
      },
      normalizedCert: {
        header: {
          certificate_no: 'TEST-CERT-02',
          declared_standard: 'NB/T 47019.5-2021',
          declared_grade: 'S32168',
        },
        test_records: [
          {
            category: 'mechanical',
            property_key: '特种非标断裂韧度K1C',
            measured_value_raw: '85',
            measured_value_num: 85,
            unit: 'MPa·m1/2',
          },
        ],
      },
      unresolvedProperties: [
        {
          raw_name: '特种非标断裂韧度K1C',
          raw_value: 85,
          raw_category: 'mechanical',
          source_tier: 'tier1',
          confidence: 0.5,
        },
      ],
    };

    const update = await resolver(mockState as QualityAuditState);

    // 验证触发 HITL 挂起
    expect(update.hitlContext).toBeDefined();
    expect(update.hitlContext?.reason).toBe('PROPERTY_AMBIGUITY');
    expect(update.hitlContext?.prompt_message).toContain('特种非标断裂韧度K1C');
    expect(update.workflowStatus).toBe('awaiting_human_review');
  });
});
