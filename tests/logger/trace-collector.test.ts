import { describe, it, expect, beforeAll } from 'vitest';
import { MemoryTraceCollector } from '@/logger/trace-collector';
import { MockCertificateExtractor } from '@/extractor/mock-extractor';
import { CertificateNormalizer } from '@/normalizer/certificate-normalizer';
import { ComplianceEngine } from '@/engine/core';
import { FileRuleStore } from '@/repository/file-rule-store';
import { StandardRuleSet } from '@/schemas/standard.schema';

describe('TraceCollector 审计轨迹流与报告注入集成测试', () => {
  let ruleStore: FileRuleStore;
  let normalizer: CertificateNormalizer;
  let extractor: MockCertificateExtractor;
  let standardRuleSet: StandardRuleSet;

  beforeAll(async () => {
    ruleStore = new FileRuleStore();
    normalizer = new CertificateNormalizer(ruleStore);
    extractor = new MockCertificateExtractor();

    const loaded = await ruleStore.getCompleteStandard('GB/T 13296-2023');
    if (!loaded) throw new Error('Failed to load standard GB/T 13296-2023');
    standardRuleSet = loaded;
  });

  it('单次质检任务全流程自然语言轨迹捕获并注入 AuditReport', async () => {
    const collector = new MemoryTraceCollector('TASK-MTC-001');

    // 1. 抽取
    const rawPayload = await extractor.extract('s30408_messy_sample');

    // 2. 归一化 (注入 collector)
    const { certificate, audit_log } = await normalizer.normalize(rawPayload, { collector });
    expect(audit_log.duration_ms).toBeGreaterThanOrEqual(0);

    // 3. 规则核验 (注入 collector)
    const report = ComplianceEngine.evaluate(standardRuleSet, certificate, { collector });

    // 4. 验证审计轨迹流与性能指标
    expect(report.audit_traces).toBeDefined();
    expect(report.audit_traces!.length).toBeGreaterThanOrEqual(5);

    // 验证轨迹中包含关键业务决策的自然语言中文说明
    const messages = report.audit_traces!.map(t => t.message).join('; ');
    expect(messages).toContain('牌号消歧');
    expect(messages).toContain('几何尺寸规格解构');
    expect(messages).toContain('命中标准规则切片');
    expect(messages).toContain('全局裁决结论');

    // 验证性能度量对象
    expect(report.performance_metrics).toBeDefined();
    expect(report.performance_metrics!.total_duration_ms).toBeGreaterThanOrEqual(0);
    expect(report.performance_metrics!.phase_durations).toBeDefined();
  });
});
