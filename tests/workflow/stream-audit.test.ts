import { describe, it, expect } from 'vitest';
import { WorkflowEngine, WorkflowStreamEvent } from '@/workflow/workflow-engine';

describe('渐进式流式通信与分段事件调度测试 (Phase 3)', () => {
  it('标准常规质保书任务：流式按序发射 tier1_ready 与 complete 事件', async () => {
    const engine = new WorkflowEngine();
    const sessionId = 'SES-STREAM-01';
    const batchNo = 'BATCH-STD';

    const payload = {
      header: {
        certificate_no: 'CERT-STR-01',
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

    const events: WorkflowStreamEvent[] = [];
    for await (const ev of engine.streamAudit(JSON.stringify(payload), { sessionId, batchNo })) {
      events.push(ev);
    }

    expect(events.length).toBeGreaterThanOrEqual(2);

    // 1. 验证首帧为 tier1_ready 并透传执行耗时与 Token 指标
    const firstEvent = events[0];
    expect(firstEvent).toBeDefined();
    if (firstEvent && firstEvent.type === 'tier1_ready') {
      expect(firstEvent.report).toBeDefined();
      expect(firstEvent.taskId).toBe(`${sessionId}::${batchNo}`);
      expect(firstEvent.hasPending).toBe(false);
      expect(typeof firstEvent.durationMs).toBe('number');
      expect(firstEvent.durationMs).toBeGreaterThanOrEqual(0);
      expect(firstEvent.tokenUsage).toBeDefined();
    } else {
      throw new Error(`Expected firstEvent to be tier1_ready, got: ${firstEvent?.type}`);
    }

    // 2. 验证末帧为 complete 并透传全流程耗时与 Token
    const lastEvent = events[events.length - 1];
    expect(lastEvent).toBeDefined();
    if (lastEvent && lastEvent.type === 'complete') {
      expect(lastEvent.finalReport.declared_grade).toBe('06Cr19Ni10');
      expect(lastEvent.finalReport.summary.overall_status).toBeDefined();
      expect(lastEvent.finalReport.summary.total_rules_evaluated).toBeGreaterThan(0);
      expect(typeof lastEvent.durationMs).toBe('number');
      expect(lastEvent.durationMs).toBeGreaterThanOrEqual(0);
      expect(lastEvent.tokenUsage).toBeDefined();
    } else {
      throw new Error(`Expected lastEvent to be complete, got: ${lastEvent?.type}`);
    }
  });

  it('包含长尾模糊项目 (表面光洁度) 时：先出 tier1_ready，消歧对齐后出 tier2_patch / complete', async () => {
    const engine = new WorkflowEngine();
    const sessionId = 'SES-STREAM-02';
    const batchNo = 'BATCH-LONGTAIL';

    const payload = {
      header: {
        certificate_no: 'CERT-STR-02',
        declared_standard: 'NB/T 47019.5-2021',
        declared_grade: '06Cr18Ni11Ti',
      },
      test_records: [
        { raw_property_name: 'C', raw_value: '0.04' },
        { raw_property_name: 'Ti', raw_value: '0.35' },
        { raw_property_name: '表面光洁度', raw_value: '0.33', unit: 'μm' },
      ],
    };

    const events: WorkflowStreamEvent[] = [];
    for await (const ev of engine.streamAudit(JSON.stringify(payload), { sessionId, batchNo })) {
      events.push(ev);
    }

    // 验证事件流包含 tier1_ready
    const tier1Ev = events.find(e => e.type === 'tier1_ready');
    expect(tier1Ev).toBeDefined();

    // 验证包含消歧补丁 tier2_patch 或最终 complete
    const patchOrComplete = events.find(e => e.type === 'tier2_patch' || e.type === 'complete');
    expect(patchOrComplete).toBeDefined();
  });

  it('包含未知歧义项目时：流式发射 tier1_ready 并在消歧低置信时发射 hitl_interrupt 挂起', async () => {
    const engine = new WorkflowEngine();
    const sessionId = 'SES-STREAM-03';
    const batchNo = 'BATCH-AMBIGUOUS';

    const payload = {
      header: {
        certificate_no: 'CERT-STR-03',
        declared_standard: 'NB/T 47019.5-2021',
        declared_grade: '06Cr18Ni11Ti',
      },
      test_records: [
        { raw_property_name: 'C', raw_value: '0.04' },
        { raw_property_name: '特种非标冲击断裂韧度K1C', raw_value: '85', raw_category: 'mechanical' },
      ],
    };

    const events: WorkflowStreamEvent[] = [];
    for await (const ev of engine.streamAudit(JSON.stringify(payload), { sessionId, batchNo })) {
      events.push(ev);
    }

    const hitlEv = events.find(e => e.type === 'hitl_interrupt');
    expect(hitlEv).toBeDefined();
    if (hitlEv && hitlEv.type === 'hitl_interrupt') {
      expect(hitlEv.hitlContext.reason).toBe('PROPERTY_AMBIGUITY');
      expect(hitlEv.taskId).toBe(`${sessionId}::${batchNo}`);
    }
  });

  it('未收录未知牌号触发 streamAudit 挂起后，能够通过 resumeAudit 成功恢复并产出包含规则项的报告', async () => {
    const engine = new WorkflowEngine();
    const sessionId = 'SES-STREAM-UNK';
    const batchNo = 'BATCH-UNK-01';

    const payload = {
      header: {
        certificate_no: 'CERT-STR-UNK',
        declared_standard: 'GB/T 13296-2023',
        declared_grade: 'SUS 304H-SpecialX',
      },
      test_records: [
        { raw_property_name: 'C', raw_value: '0.052' },
        { raw_property_name: 'Si', raw_value: '0.50' },
        { raw_property_name: 'Mn', raw_value: '1.20' },
      ],
    };

    const events: WorkflowStreamEvent[] = [];
    for await (const ev of engine.streamAudit(JSON.stringify(payload), { sessionId, batchNo })) {
      events.push(ev);
    }

    const hitlEv = events.find(e => e.type === 'hitl_interrupt');
    expect(hitlEv).toBeDefined();
    expect(hitlEv?.hitlContext.reason).toBe('UNKNOWN_GRADE');

    // 质检员确认指定国标牌号并恢复流转
    const resumeRes = await engine.resumeAudit(`${sessionId}::${batchNo}`, {
      corrected_grade: '06Cr19Ni10',
    });

    expect(resumeRes.status).toBe('completed');
    expect(resumeRes.finalReport).toBeDefined();
    expect(resumeRes.finalReport?.matched_grade).toBe('06Cr19Ni10');
    expect(resumeRes.finalReport?.summary.total_rules_evaluated).toBeGreaterThan(0);
  });

  it('多轮生命周期隔离验证：同一批次在 RUN-1 恢复完成后，使用 RUN-2 重新核验能够纯净再次触发 HITL 挂起', async () => {
    const engine = new WorkflowEngine();
    const sessionId = 'SES-MULTI-RUN';
    const batchNo = 'BATCH-UNK-02';

    const payload = {
      header: {
        certificate_no: 'CERT-STR-MULTI-RUN',
        declared_standard: 'GB/T 13296-2023',
        declared_grade: 'SUS 304H-SpecialX',
      },
      test_records: [
        { raw_property_name: 'C', raw_value: '0.052' },
        { raw_property_name: 'Cr', raw_value: '18.2' },
        { raw_property_name: 'Ni', raw_value: '8.1' },
      ],
    };

    // 1. 发起 RUN-1 核验
    const run1Events: WorkflowStreamEvent[] = [];
    for await (const ev of engine.streamAudit(JSON.stringify(payload), { sessionId, batchNo, runId: 'RUN-1' })) {
      run1Events.push(ev);
    }
    const run1Hitl = run1Events.find(e => e.type === 'hitl_interrupt');
    expect(run1Hitl).toBeDefined();
    expect(run1Hitl?.taskId).toBe(`${sessionId}::${batchNo}::RUN-1`);
    expect(run1Hitl?.hitlContext.reason).toBe('UNKNOWN_GRADE');

    // 恢复 RUN-1
    const run1Resume = await engine.resumeAudit(`${sessionId}::${batchNo}::RUN-1`, {
      corrected_grade: '06Cr19Ni10',
    });
    expect(run1Resume.status).toBe('completed');

    // 2. 发起 RUN-2 核验 (模拟用户点击重置后，以原件牌号重新核验)
    const run2Events: WorkflowStreamEvent[] = [];
    for await (const ev of engine.streamAudit(JSON.stringify(payload), { sessionId, batchNo, runId: 'RUN-2' })) {
      run2Events.push(ev);
    }
    const run2Hitl = run2Events.find(e => e.type === 'hitl_interrupt');
    // 关键断言：RUN-2 绝不受 RUN-1 的 humanCorrection 幽灵数据污染，确定性再次触发 HITL 挂起！
    expect(run2Hitl).toBeDefined();
    expect(run2Hitl?.taskId).toBe(`${sessionId}::${batchNo}::RUN-2`);
    expect(run2Hitl?.hitlContext.reason).toBe('UNKNOWN_GRADE');
  });
});

