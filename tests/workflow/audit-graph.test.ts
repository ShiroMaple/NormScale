import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WorkflowEngine } from '@/workflow/workflow-engine';
import { FileRuleStore } from '@/repository/file-rule-store';
import { ClauseStore } from '@/repository/clause-store';
import { MockCertificateExtractor } from '@/extractor/mock-extractor';
import { ICertificateExtractor, RawCertificatePayload } from '@/extractor/extractor.interface';

describe('LangGraph 状态图与人机协同 (HITL) 工作流集成测试', () => {
  let ruleStore: FileRuleStore;
  let clauseStore: ClauseStore;
  let extractor: MockCertificateExtractor;
  let engine: WorkflowEngine;

  beforeAll(() => {
    ruleStore = new FileRuleStore();
    clauseStore = new ClauseStore();
    extractor = new MockCertificateExtractor();
    engine = new WorkflowEngine({
      ruleStore,
      clauseStore,
      extractor,
    });
  });

  afterAll(async () => {
    // 若启用了 LangSmith，等待 1 秒确保后台 HTTP Trace 异步批量上传完成
    if (process.env.LANGSMITH_TRACING === 'true') {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });

  it('1. Happy Path 全自动核验流转: 提取 -> 清洗 -> 检索 -> 规则比对 -> 条款复核 -> 聚合报告', async () => {
    const result = await engine.submitAudit('s30408_messy_sample', {
      contextId: 'TASK-HAPPY-001',
    });

    expect(result.status).toBe('completed');
    expect(result.finalReport).toBeDefined();

    const report = result.finalReport!;
    expect(report.certificate_no).toBe('MTC-2026-08891');
    expect(report.declared_standard).toBe('GB/T 13296-2023');
    expect(report.matched_grade).toBe('06Cr19Ni10');
    expect(report.summary.overall_status).toBe('PASS');
    expect(report.summary.total_rules_evaluated).toBeGreaterThanOrEqual(14);

    // 验证审计轨迹流与性能指标完整贯通
    expect(report.audit_traces).toBeDefined();
    expect(report.audit_traces!.length).toBeGreaterThanOrEqual(6);

    const traceMessages = report.audit_traces!.map(t => t.message).join('; ');
    expect(traceMessages).toContain('数据抽取');
    expect(traceMessages).toContain('消歧');
    expect(traceMessages).toContain('检索标准库');
    expect(traceMessages).toContain('核心规则比对');
    expect(traceMessages).toContain('语义复核');
    expect(traceMessages).toContain('全流程执行完毕');

    expect(report.performance_metrics).toBeDefined();
    expect(report.performance_metrics!.total_duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('2. 人机协同 (HITL) 触发与恢复: 未知牌号挂起 -> 质检员修正牌号 -> 恢复流转并判定合格', async () => {
    // 构造一个模拟返回未知材料牌号的提取器
    class UnknownGradeMockExtractor implements ICertificateExtractor {
      public readonly providerName = 'UnknownGradeMock';
      async extract(): Promise<RawCertificatePayload> {
        return {
          header: {
            certificate_no: 'MTC-UNK-001',
            declared_standard: 'GB/T 13296-2023',
            declared_grade: 'UnrecognizedSpecialSteel_X99', // 未知牌号
            issue_date: '2026-08-01',
          },
          dimensions: { specification_raw: 'Φ25×2.5×6000mm' },
          test_records: [
            { raw_property_name: 'C', raw_value: 0.04, raw_unit: '%' },
            { raw_property_name: 'Si', raw_value: 0.50, raw_unit: '%' },
            { raw_property_name: 'Mn', raw_value: 1.20, raw_unit: '%' },
            { raw_property_name: 'P', raw_value: 0.025, raw_unit: '%' },
            { raw_property_name: 'S', raw_value: 0.005, raw_unit: '%' },
            { raw_property_name: 'Cr', raw_value: 18.5, raw_unit: '%' },
            { raw_property_name: 'Ni', raw_value: 8.8, raw_unit: '%' },
            { raw_property_name: '屈服强度', raw_value: 235, raw_unit: 'MPa' },
            { raw_property_name: '抗拉强度', raw_value: 580, raw_unit: 'MPa' },
            { raw_property_name: '断后伸长率', raw_value: 45, raw_unit: '%' },
            { raw_property_name: '硬度_HRB', raw_value: 85, raw_unit: 'HRB' },
            { raw_property_name: '压扁试验', raw_value: '合格' },
            { raw_property_name: '扩口试验', raw_value: '合格' },
            { raw_property_name: '晶间腐蚀', raw_value: '合格' },
            { raw_property_name: '超声检测', raw_value: '合格' },
            { raw_property_name: '水压试验', raw_value: '合格' },
          ],
          overall_confidence: 0.95,
        };
      }
    }

    const hitlEngine = new WorkflowEngine({
      ruleStore,
      clauseStore,
      extractor: new UnknownGradeMockExtractor(),
    });

    const taskId = 'TASK-HITL-GRADE-001';

    // 步骤 A: 提交任务，预期在 human_review 处被中断挂起
    const initialResult = await hitlEngine.submitAudit('dummy_input', {
      contextId: taskId,
    });

    expect(initialResult.status).toBe('suspended_hitl');
    expect(initialResult.hitlContext).toBeDefined();
    expect(initialResult.hitlContext!.reason).toBe('UNKNOWN_GRADE');
    expect(initialResult.hitlContext!.prompt_message).toContain('未在标准库中收录');

    // 步骤 B: 质检员在前端核对后，提交人工修正 (将牌号修正为国家标准主牌号 06Cr19Ni10)
    const resumeResult = await hitlEngine.resumeAudit(taskId, {
      corrected_grade: '06Cr19Ni10',
      inspector_id: 'INSP-9527',
      waiver_notes: '质检员核实该牌号为厂家自定义别名，等同于 06Cr19Ni10 (S30408)',
    });

    // 步骤 C: 恢复后工作流完成全部后续核验，产出 PASS 判定报告
    expect(resumeResult.status).toBe('completed');
    expect(resumeResult.finalReport).toBeDefined();
    expect(resumeResult.finalReport!.matched_grade).toBe('06Cr19Ni10');
    expect(resumeResult.finalReport!.summary.overall_status).toBe('PASS');

    // 验证审计轨迹中包含人工介入的完整履历
    const traces = resumeResult.finalReport!.audit_traces!.map(t => t.message).join('; ');
    expect(traces).toContain('人机协同挂起');
    expect(traces).toContain('人工审核恢复');
  });

  it('3. 人机协同 (HITL) 触发: 低置信度抽取中断挂起', async () => {
    class LowConfidenceMockExtractor implements ICertificateExtractor {
      public readonly providerName = 'LowConfMock';
      async extract(): Promise<RawCertificatePayload> {
        return {
          header: {
            certificate_no: 'MTC-LOW-CONF-001',
            declared_standard: 'GB/T 13296-2023',
            declared_grade: '06Cr19Ni10',
          },
          test_records: [],
          overall_confidence: 0.62, // 低于默认 0.8 阈值
        };
      }
    }

    const lowConfEngine = new WorkflowEngine({
      ruleStore,
      clauseStore,
      extractor: new LowConfidenceMockExtractor(),
    });

    const result = await lowConfEngine.submitAudit('low_conf_sample', {
      minConfidenceThreshold: 0.8,
    });

    expect(result.status).toBe('suspended_hitl');
    expect(result.hitlContext?.reason).toBe('LOW_CONFIDENCE');
    expect(result.hitlContext?.prompt_message).toContain('低于安全阈值');
  });
});
