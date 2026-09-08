import { describe, it, expect } from 'vitest';
import { WorkflowEngine, WorkflowStreamEvent } from '@/workflow/workflow-engine.ts';
import { getPreset } from '@/extractor/mock-extractor.ts';

describe('四维分层核验典型场景矩阵端到端流转测试 (方案 A + B 结合)', () => {
  const engine = new WorkflowEngine();

  it('Case 1: Tier 1 - HITL 人机协同 (未收录非标牌号阻断并支持人工修正恢复)', async () => {
    const payload = getPreset('case1_tier1_hitl_unknown_grade');
    expect(payload).toBeDefined();

    const sessionId = 'E2E-CASE1-SES';
    const batchNo = 'BATCH-CASE1';
    const events: WorkflowStreamEvent[] = [];

    // 执行流式核验
    for await (const ev of engine.streamAudit(JSON.stringify(payload), { sessionId, batchNo })) {
      events.push(ev);
    }

    // 1. 验证触发了 HITL 中断挂起，且动态推荐候选已注入 (绝非空数据或静态 Mock)
    const hitlEvent = events.find(e => e.type === 'hitl_interrupt');
    expect(hitlEvent).toBeDefined();
    if (hitlEvent && hitlEvent.type === 'hitl_interrupt') {
      expect(hitlEvent.hitlContext).toBeDefined();
      expect(hitlEvent.hitlContext.reason).toBe('UNKNOWN_GRADE');
      expect(hitlEvent.hitlContext.pending_fields).toContain('declared_grade');
      expect(hitlEvent.hitlContext.prompt_message).toContain('SUS 304H-SpecialX');
      expect(hitlEvent.hitlContext.candidate_grades).toBeDefined();
      expect(hitlEvent.hitlContext.candidate_grades!.length).toBeGreaterThan(0);
      const topRec = hitlEvent.hitlContext.candidate_grades![0]!;
      expect(topRec.recommended).toBe(true);
      expect(topRec.match).toContain('(推荐)');
    }

    // 2. 模拟质检工程师在 480px 抽屉中人工修正为 06Cr19Ni10 并恢复执行
    const resumeResult = await engine.resumeAudit(
      `${sessionId}::${batchNo}`,
      {
        corrected_grade: '06Cr19Ni10',
        waiver_notes: '质检员核准指定等效国标牌号 06Cr19Ni10',
      }
    );

    expect(resumeResult.status).toBe('completed');
    expect(resumeResult.finalReport).toBeDefined();
    expect(resumeResult.finalReport?.matched_grade).toBe('06Cr19Ni10');
    expect(resumeResult.finalReport?.summary.overall_status).toBe('PASS');
  });

  it('Case 2: Tier 1 ➡️ Tier 2 - 语义对齐通过 (表面光洁度 0.33 μm 达标全绿流转)', async () => {
    const payload = getPreset('case2_tier1_to_tier2_pass');
    expect(payload).toBeDefined();

    const sessionId = 'E2E-CASE2-SES';
    const batchNo = 'BATCH-CASE2';
    const events: WorkflowStreamEvent[] = [];

    for await (const ev of engine.streamAudit(JSON.stringify(payload), { sessionId, batchNo })) {
      events.push(ev);
    }

    // 1. 验证包含首帧 tier1_ready
    const tier1Ev = events.find(e => e.type === 'tier1_ready');
    expect(tier1Ev).toBeDefined();

    // 2. 验证包含最终 complete 事件
    const completeEv = events.find(e => e.type === 'complete');
    expect(completeEv).toBeDefined();
    if (completeEv && completeEv.type === 'complete') {
      expect(completeEv.finalReport).toBeDefined();
      expect(completeEv.finalReport.summary.overall_status).toBe('PASS');

      // 验证长尾项“表面光洁度”对齐至粗糙度规则且判定合格
      const roughnessItem = completeEv.finalReport.item_results.find(
        r => (r.display_name && r.display_name.includes('粗糙度')) || (r.property_key && r.property_key.includes('roughness'))
      );
      expect(roughnessItem).toBeDefined();
      expect(roughnessItem?.status).toBe('PASS');
    }
  });

  it('Case 3: Tier 1 ➡️ Tier 2 - 语义对齐否定 (表面光洁度 1.50 μm 超差超标红灯告警)', async () => {
    const payload = getPreset('case3_tier1_to_tier2_fail');
    expect(payload).toBeDefined();

    const sessionId = 'E2E-CASE3-SES';
    const batchNo = 'BATCH-CASE3';
    const events: WorkflowStreamEvent[] = [];

    for await (const ev of engine.streamAudit(JSON.stringify(payload), { sessionId, batchNo })) {
      events.push(ev);
    }

    // 1. 验证包含首帧 tier1_ready
    const tier1Ev = events.find(e => e.type === 'tier1_ready');
    expect(tier1Ev).toBeDefined();

    // 2. 验证包含最终 complete 事件且判定为 FAIL
    const completeEv = events.find(e => e.type === 'complete');
    expect(completeEv).toBeDefined();
    if (completeEv && completeEv.type === 'complete') {
      expect(completeEv.finalReport).toBeDefined();
      expect(completeEv.finalReport.summary.overall_status).toBe('FAIL');

      // 验证表面光洁度超差项被判定为 FAIL
      const roughnessItem = completeEv.finalReport.item_results.find(
        r => (r.display_name && r.display_name.includes('粗糙度')) || (r.property_key && r.property_key.includes('roughness'))
      );
      expect(roughnessItem).toBeDefined();
      expect(roughnessItem?.status).toBe('FAIL');
    }
  });

  it('Case 4: Tier 1 ➡️ Tier 2 - 行内 HITL (特异非标项置信度不足触发歧义挂起)', async () => {
    const payload = getPreset('case4_tier1_to_tier2_hitl');
    expect(payload).toBeDefined();

    const sessionId = 'E2E-CASE4-SES';
    const batchNo = 'BATCH-CASE4';
    const events: WorkflowStreamEvent[] = [];

    for await (const ev of engine.streamAudit(JSON.stringify(payload), { sessionId, batchNo })) {
      events.push(ev);
    }

    const hitlEv = events.find(e => e.type === 'hitl_interrupt');
    expect(hitlEv).toBeDefined();
    if (hitlEv && hitlEv.type === 'hitl_interrupt') {
      expect(hitlEv.hitlContext).toBeDefined();
      expect(hitlEv.hitlContext.reason).toBe('PROPERTY_AMBIGUITY');
      expect(hitlEv.hitlContext.prompt_message).toContain('特种非标微区抗剪切断裂韧度');
    }
  });

  it('Case 1 结构化直通输入防漏测: 包含 property_key 的结构化输入仍强制校验 GradeNormalizer 并触发 UNKNOWN_GRADE', async () => {
    // 构造类似 batchSpecimenToCertificateExtract 输出的结构化数据（含 property_key）
    const structuredInput = {
      header: {
        certificate_no: 'MTC-STRUCTURED-TEST',
        declared_standard: 'GB/T 13296-2023',
        declared_grade: 'SUS 304H-SpecialX',
        batch_lot_number: 'BATCH-STRUCT-01',
      },
      test_records: [
        {
          category: 'chemical',
          property_key: 'C',
          measured_value_raw: '0.052',
          measured_value_num: 0.052,
          unit: '%',
        },
      ],
    };

    const sessionId = 'E2E-STRUCT-SES';
    const batchNo = 'BATCH-STRUCT';
    const events: WorkflowStreamEvent[] = [];

    for await (const ev of engine.streamAudit(JSON.stringify(structuredInput), { sessionId, batchNo })) {
      events.push(ev);
    }

    const hitlEv = events.find(e => e.type === 'hitl_interrupt');
    expect(hitlEv).toBeDefined();
    if (hitlEv && hitlEv.type === 'hitl_interrupt') {
      expect(hitlEv.hitlContext).toBeDefined();
      expect(hitlEv.hitlContext.reason).toBe('UNKNOWN_GRADE');
      expect(hitlEv.hitlContext.prompt_message).toContain('SUS 304H-SpecialX');
    }
  });
});
