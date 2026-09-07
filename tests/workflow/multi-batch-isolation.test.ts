import { describe, it, expect } from 'vitest';
import { WorkflowEngine } from '@/workflow/workflow-engine';

describe('LangGraph 多批次并发线程隔离与独立人机协同测试 (Phase 2)', () => {
  it('验证同一 Session 下 N 个批次并发执行具备物理线程隔离 (thread_id: sessionId::batchNo)', async () => {
    const engine = new WorkflowEngine();
    const sessionId = 'SES-ISO-2026';

    // 批次 A：包含未知牌号，预期触发 HITL 挂起
    const payloadBatchA = {
      header: {
        certificate_no: 'CERT-ISO-01',
        declared_standard: 'GB/T 13296-2023',
        declared_grade: 'UNKNOWN_GRADE_SPECIAL_X',
      },
      test_records: [
        { raw_property_name: 'C', raw_value: '0.02' },
      ],
    };

    // 批次 B：常规有效牌号与指标，预期自动全流程完成
    const payloadBatchB = {
      header: {
        certificate_no: 'CERT-ISO-02',
        declared_standard: 'GB/T 13296-2023',
        declared_grade: '06Cr19Ni10',
      },
      test_records: [
        { raw_property_name: 'C', raw_value: '0.04' },
        { raw_property_name: 'Cr', raw_value: '18.5' },
        { raw_property_name: 'Ni', raw_value: '8.2' },
        { raw_property_name: 'Rm', raw_value: '550' },
        { raw_property_name: 'Rp0.2', raw_value: '220' },
        { raw_property_name: 'A', raw_value: '45' },
      ],
    };

    // 并发提交两个批次核验任务
    const [resultA, resultB] = await Promise.all([
      engine.submitAudit(JSON.stringify(payloadBatchA), {
        sessionId,
        batchNo: 'BATCH-A',
      }),
      engine.submitAudit(JSON.stringify(payloadBatchB), {
        sessionId,
        batchNo: 'BATCH-B',
      }),
    ]);

    // 1. 验证线程 ID 结构
    expect(resultA.taskId).toBe('SES-ISO-2026::BATCH-A');
    expect(resultB.taskId).toBe('SES-ISO-2026::BATCH-B');

    // 2. 验证批次 A 处于 HITL 挂起状态
    expect(resultA.status).toBe('suspended_hitl');
    expect(resultA.hitlContext).toBeDefined();
    expect(resultA.hitlContext?.reason).toBe('UNKNOWN_GRADE');

    // 3. 验证批次 B 顺利完成，不受批次 A 挂起的任何阻塞或干扰
    expect(resultB.status).toBe('completed');
    expect(resultB.finalReport).toBeDefined();
    expect(resultB.finalReport?.declared_grade).toBe('06Cr19Ni10');

    // 4. 验证可以针对批次 A 独立进行人工恢复提交 (Resume)
    const resumedA = await engine.resumeAudit(resultA.taskId, {
      corrected_grade: '06Cr19Ni10',
    });

    expect(resumedA.status).toBe('completed');
    expect(resumedA.finalReport).toBeDefined();
    expect(resumedA.finalReport?.declared_grade).toBe('06Cr19Ni10');

    // 5. 再次查询批次 B 状态，确保快照独立未被串改
    const snapshotB = await engine.getTaskState(resultB.taskId);
    expect(snapshotB?.normalizedCert?.header.certificate_no).toBe('CERT-ISO-02');
  });
});
