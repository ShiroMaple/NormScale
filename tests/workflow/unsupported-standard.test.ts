import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WorkflowEngine } from '@/workflow/workflow-engine';
import { FileRuleStore } from '@/repository/file-rule-store';
import { ClauseStore } from '@/repository/clause-store';
import { ICertificateExtractor, RawCertificatePayload } from '@/extractor/extractor.interface';
import { ASTM_A312_TEST_DATA } from '../../scripts/generate-unsupported-standard-pdf';

describe('未收录执行标准 (Out-of-Scope Standard) 工作流拦截与防呆自动化测试', () => {
  let ruleStore: FileRuleStore;
  let clauseStore: ClauseStore;

  beforeAll(() => {
    ruleStore = new FileRuleStore();
    clauseStore = new ClauseStore();
  });

  afterAll(async () => {
    if (process.env.LANGSMITH_TRACING === 'true') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });

  /**
   * 构造对应 ASTM A312 / A312M 质保证书提取结果的 Mock 提取器
   */
  class AstmA312MockExtractor implements ICertificateExtractor {
    public readonly providerName = 'AstmA312MockExtractor';

    async extract(): Promise<RawCertificatePayload> {
      return {
        header: {
          certificate_no: ASTM_A312_TEST_DATA.certNo,
          declared_standard: ASTM_A312_TEST_DATA.standard,
          declared_grade: ASTM_A312_TEST_DATA.grade,
          supplier_name: ASTM_A312_TEST_DATA.supplier,
          issue_date: ASTM_A312_TEST_DATA.issueDate,
          heat_number: ASTM_A312_TEST_DATA.heatNo,
          lot_number: ASTM_A312_TEST_DATA.batchNo,
        },
        dimensions: {
          specification_raw: ASTM_A312_TEST_DATA.dimensions,
        },
        test_records: [
          // 化学成分
          ...ASTM_A312_TEST_DATA.chemItems.map((c) => ({
            raw_property_name: c.el,
            raw_value: parseFloat(c.val),
            raw_unit: '%',
          })),
          // 力学性能
          ...ASTM_A312_TEST_DATA.mechItems.map((m) => ({
            raw_property_name: m.name,
            raw_value: parseFloat(m.val),
            raw_unit: m.unit,
          })),
          // 工艺性能
          { raw_property_name: '压扁试验', raw_value: '合格' },
          { raw_property_name: '扩口试验', raw_value: '合格' },
          { raw_property_name: '水压试验', raw_value: '合格' },
          { raw_property_name: '超声检测', raw_value: '合格' },
          { raw_property_name: '涡流检测', raw_value: '合格' },
          { raw_property_name: '晶间腐蚀', raw_value: '合格' },
        ],
        overall_confidence: 0.98,
      };
    }
  }

  it('1. 负向拦截: 当质保书声明标准未被标准库涵盖时，工作流应在节点3阻断并给出明确诊断', async () => {
    const engine = new WorkflowEngine({
      ruleStore,
      clauseStore,
      extractor: new AstmA312MockExtractor(),
    });

    const taskId = 'TASK-UNSUPPORTED-STD-001';
    const result = await engine.submitAudit('astm_a312_unsupported_sample', {
      contextId: taskId,
    });

    // 1. 验证工作流状态被阻断置为 failed
    expect(result.status).toBe('failed');

    // 2. 验证错误信息明确指出标准未收录及具体标准代号
    expect(result.error).toBeDefined();
    expect(result.error).toContain('未收录标准');
    expect(result.error).toContain('ASTM A312 / A312M');
    expect(result.error).toContain('请检查标准代号或在标准库中补充配置');
  });

  it('2. 正向恢复: 当质检员强制指定系统已收录标准时，工作流可越过标准缺失阻断正常执行', async () => {
    const engine = new WorkflowEngine({
      ruleStore,
      clauseStore,
      extractor: new AstmA312MockExtractor(),
    });

    const taskId = 'TASK-FORCED-STD-OVERRIDE-002';
    // 质检员或调用方通过 forcedStandardId 映射到已收录的国标 GB/T 13296-2023
    const result = await engine.submitAudit('astm_a312_unsupported_sample', {
      contextId: taskId,
      forcedStandardId: 'GB/T 13296-2023',
      forcedGradeKey: '022Cr17Ni12Mo2', // 等效的 TP316L 国标切片
    });

    // 验证能够成功越过标准检索节点进入核验并产出报告
    expect(result.status).toBe('completed');
    expect(result.finalReport).toBeDefined();
    expect(result.finalReport?.declared_standard).toBe('ASTM A312 / A312M');
    expect(result.finalReport?.matched_grade).toBe('022Cr17Ni12Mo2');
    expect(result.finalReport?.summary.overall_status).toBe('PASS');

    // 验证审计轨迹包含核心比对与全流程记录
    expect(result.finalReport?.audit_traces).toBeDefined();
    expect(result.finalReport!.audit_traces!.length).toBeGreaterThan(0);
    const traceMessages = result.finalReport!.audit_traces!.map((t) => t.message).join('; ');
    expect(traceMessages).toContain('核心规则比对');
  });
});
