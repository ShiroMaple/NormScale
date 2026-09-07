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

    // 1. 验证首帧为 tier1_ready
    const firstEvent = events[0];
    expect(firstEvent).toBeDefined();
    if (firstEvent && firstEvent.type === 'tier1_ready') {
      expect(firstEvent.report).toBeDefined();
      expect(firstEvent.taskId).toBe(`${sessionId}::${batchNo}`);
      expect(firstEvent.hasPending).toBe(false);
    } else {
      throw new Error(`Expected firstEvent to be tier1_ready, got: ${firstEvent?.type}`);
    }

    // 2. 验证末帧为 complete
    const lastEvent = events[events.length - 1];
    expect(lastEvent).toBeDefined();
    if (lastEvent && lastEvent.type === 'complete') {
      expect(lastEvent.finalReport.declared_grade).toBe('06Cr19Ni10');
      expect(lastEvent.finalReport.summary.overall_status).toBeDefined();
      expect(lastEvent.finalReport.summary.total_rules_evaluated).toBeGreaterThan(0);
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
});
