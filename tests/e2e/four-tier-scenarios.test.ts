import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowEngine, WorkflowStreamEvent } from '@/workflow/workflow-engine.ts';
import { getScenarioCachedParseResult } from '../fixtures/scenarios/index.ts';
import { batchSpecimenToCertificateExtract } from '@/normalizer/specimen-adapter.ts';
import { PropertyKeyNormalizer } from '@/normalizer/property-key-normalizer.ts';

describe('四维分层核验典型场景矩阵端到端流转测试 (方案 A + B 结合)', { timeout: 30000 }, () => {
  const engine = new WorkflowEngine();

  beforeEach(() => {
    PropertyKeyNormalizer.clearLearnedAliases();
  });

  it('Case 1: Tier 1 - HITL 人机协同 (未收录非标牌号阻断并支持人工修正恢复)', async () => {
    // 获取 Case 1 真实切片缓存数据并经 batchSpecimenToCertificateExtract 生产接口层转换
    const cachedParse = getScenarioCachedParseResult('22732c3446df410a1f42609537f1906c');
    expect(cachedParse).toBeDefined();
    if (!cachedParse) throw new Error('Case 1 cachedParse not found');
    const batchSpecimen = cachedParse.sessionDocument.batches[0];
    expect(batchSpecimen).toBeDefined();

    const payload = batchSpecimenToCertificateExtract(
      batchSpecimen,
      ['GB/T 13296-2023'],
      'SUS 304H-SpecialX'
    );
    expect(payload).toBeDefined();
    expect(payload.test_records.length).toBeGreaterThan(0);

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

  it('Case 2: Tier 1 ➡️ Tier 2 - 语义对齐通过 (表面光洁度 0.33 μm 达标全绿流转，消除虚假自洽)', async () => {
    // 获取 Case 2 的真实切片缓存数据 (与前端工作台现场完全同构)
    const cachedParse = getScenarioCachedParseResult('944f39572b5617186447ca32ff71635b');
    expect(cachedParse).toBeDefined();
    if (!cachedParse) throw new Error('Case 2 cachedParse not found');
    const batchSpecimen = cachedParse.sessionDocument.batches[0];
    expect(batchSpecimen).toBeDefined();

    // 经由真实生产接口转换层进行组装
    const realPayload = batchSpecimenToCertificateExtract(
      batchSpecimen,
      ['NB/T 47019.5-2021'],
      '06Cr18Ni11Ti'
    );
    expect(realPayload).toBeDefined();
    expect(realPayload.test_records.length).toBeGreaterThan(0);

    const sessionId = 'E2E-CASE2-REAL-PROD-SES';
    const batchNo = 'BATCH-CASE2-REAL-PROD';
    const events: WorkflowStreamEvent[] = [];

    for await (const ev of engine.streamAudit(JSON.stringify(realPayload), { sessionId, batchNo })) {
      events.push(ev);
    }

    // 1. 验证包含首帧 tier1_ready
    const tier1Ev = events.find(e => e.type === 'tier1_ready');
    expect(tier1Ev).toBeDefined();

    // 2. 验证包含最终 complete 事件
    const completeEv = events.find(e => e.type === 'complete');
    expect(completeEv).toBeDefined();
    expect(completeEv?.type).toBe('complete');

    if (completeEv && completeEv.type === 'complete') {
      const report = completeEv.finalReport;
      expect(report).toBeDefined();

      // 3. 验证超声检测 (UT): 成功通过代号 "U2 验收合格" 识别为 ultrasonic_test 且判定 PASS
      const utItem = report.item_results.find(r => r.property_key === 'ultrasonic_test');
      expect(utItem).toBeDefined();
      expect(utItem?.status).toBe('PASS');
      expect(utItem?.actual_value_text || utItem?.measured_value_raw).toContain('U2');

      // 4. 验证致密性/水压试验组: 成功收集 additionalTests 中的 proc_hydraulic (20 MPa) 判定 PASS
      const ptItem = report.item_results.find(r => r.property_key === 'pressure_tightness');
      expect(ptItem).toBeDefined();
      expect(ptItem?.status).toBe('PASS');
      expect(ptItem?.actual_value_text || ptItem?.measured_value_raw).toContain('20 MPa');

      // 5. 验证表面粗糙度: 绝不被 20 MPa 液压冲毁，实测值为 0.33 μm 且判定 PASS
      const roughnessItem = report.item_results.find(
        r => r.property_key === 'surface_roughness' || (r.display_name && r.display_name.includes('粗糙度'))
      );
      expect(roughnessItem).toBeDefined();
      expect(roughnessItem?.status).toBe('PASS');
      expect(roughnessItem?.actual_value_text || roughnessItem?.measured_value_raw).toContain('0.33');
      expect(roughnessItem?.actual_value_text || roughnessItem?.measured_value_raw).not.toContain('20 MPa');

      // 6. 验证表面外观质量: 内外表面光洁平整合格，判定 PASS
      const surfaceItem = report.item_results.find(r => r.property_key === 'surface_quality');
      expect(surfaceItem).toBeDefined();
      expect(surfaceItem?.status).toBe('PASS');

      // 7. 验证全单总体结论: 零 FAIL，100% 全绿 PASS
      const failItems = report.item_results.filter(r => r.status === 'FAIL');
      expect(failItems).toHaveLength(0);
      expect(report.summary.overall_status).toBe('PASS');

      // 8. 显式验证 Tier 2 长尾自愈轨迹: 确认为 Tier 2 语义消歧输出而非 Tier 1 字典提前绕过
      const resolvedRoughness = completeEv.resolvedProperties?.find(r => r.resolved_key === 'surface_roughness');
      expect(resolvedRoughness).toBeDefined();
      expect(resolvedRoughness?.raw_name).toContain('表面光洁度');
      expect(resolvedRoughness?.source_tier).toBe('tier2');
    }
  });

  it('Case 3: Tier 1 ➡️ Tier 2 - 语义对齐否定 (表面光洁度 1.50 μm 超差超标红灯告警)', async () => {
    // 获取 Case 3 真实切片缓存数据并经 batchSpecimenToCertificateExtract 生产接口层转换
    const cachedParse = getScenarioCachedParseResult('6752e28dd91018639dfcb53a15c9153f');
    expect(cachedParse).toBeDefined();
    if (!cachedParse) throw new Error('Case 3 cachedParse not found');
    const batchSpecimen = cachedParse.sessionDocument.batches[0];
    expect(batchSpecimen).toBeDefined();

    const payload = batchSpecimenToCertificateExtract(
      batchSpecimen,
      ['NB/T 47019.5-2021'],
      '06Cr18Ni11Ti'
    );
    expect(payload).toBeDefined();
    expect(payload.test_records.length).toBeGreaterThan(0);

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

      // 验证表面光洁度超差项被判定为 FAIL，且实测数值准确为 1.50
      const roughnessItem = completeEv.finalReport.item_results.find(
        r => (r.display_name && r.display_name.includes('粗糙度')) || (r.property_key && r.property_key.includes('roughness'))
      );
      expect(roughnessItem).toBeDefined();
      expect(roughnessItem?.status).toBe('FAIL');
      expect(roughnessItem?.actual_value_text || roughnessItem?.measured_value_raw).toContain('1.50');

      // 验证表面外观质量项合格（PASS），排除因外观项缺失导致的误判
      const surfaceItem = completeEv.finalReport.item_results.find(r => r.property_key === 'surface_quality');
      expect(surfaceItem).toBeDefined();
      expect(surfaceItem?.status).toBe('PASS');

      // 显式验证即便为 FAIL 也由 Tier 2 语义消歧对齐所致
      const resolvedRoughness = completeEv.resolvedProperties?.find(r => r.resolved_key === 'surface_roughness');
      expect(resolvedRoughness).toBeDefined();
      expect(resolvedRoughness?.raw_name).toContain('表面光洁度');
      expect(resolvedRoughness?.source_tier).toBe('tier2');
    }
  });

  it('Case 4: Tier 1 ➡️ Tier 2 - 行内 HITL (特异非标项置信度不足触发歧义挂起)', async () => {
    // 获取 Case 4 真实切片缓存数据并经 batchSpecimenToCertificateExtract 生产接口层转换
    const cachedParse = getScenarioCachedParseResult('4f2a0826a7effeacf5a2c62c22965741');
    expect(cachedParse).toBeDefined();
    if (!cachedParse) throw new Error('Case 4 cachedParse not found');
    const batchSpecimen = cachedParse.sessionDocument.batches[0];
    expect(batchSpecimen).toBeDefined();

    const payload = batchSpecimenToCertificateExtract(
      batchSpecimen,
      ['NB/T 47019.5-2021'],
      '06Cr18Ni11Ti'
    );
    expect(payload).toBeDefined();
    expect(payload.test_records.length).toBeGreaterThan(0);

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
      expect(hitlEv.hitlContext.prompt_message).toMatch(/Shear Toughness K1C|特种非标/);
    }

    // 2. 模拟质检工程师在抽屉中选择“认可为供需协议特约合格项 (放行 PASS)”并恢复执行
    const resumeResult = await engine.resumeAudit(
      `${sessionId}::${batchNo}`,
      {
        inspector_id: 'QC-TEST-ENGINEER',
        corrected_property_keys: {
          'Shear Toughness K1C': 'special_protocol_item',
        },
        waiver_notes: '经技术主管确认，按《供需技术协议第3条》执行，判定合格放行',
      }
    );

    expect(resumeResult.status).toBe('completed');
    expect(resumeResult.finalReport).toBeDefined();

    // 3. 验证未匹配记录项中的项目名称必须保留为原始名称 Shear Toughness K1C，绝不能变成内部标识 special_protocol_item
    const unmatched = resumeResult.finalReport?.unmatched_certificate_records || [];
    const protocolItem = unmatched.find(
      r => r.property_key === 'special_protocol_item' || r.raw_property_name === 'Shear Toughness K1C'
    );
    expect(protocolItem).toBeDefined();
    expect(protocolItem?.raw_property_name).toBe('Shear Toughness K1C');
    expect(protocolItem?.display_name).toBe('Shear Toughness K1C');
    expect(protocolItem?.display_name).not.toBe('special_protocol_item');
    expect(protocolItem?.measured_value_raw).toBe('85 MPa.m^1/2');
  });

  it('Case 4 否决分支: 特种非标项经 HITL 裁定不予认可 (缺项否决) 必须穿透触发系统一票否决 (FAIL)', async () => {
    const cachedParse = getScenarioCachedParseResult('4f2a0826a7effeacf5a2c62c22965741');
    expect(cachedParse).toBeDefined();
    if (!cachedParse) throw new Error('Case 4 cachedParse not found');
    const batchSpecimen = cachedParse.sessionDocument.batches[0];

    const payload = batchSpecimenToCertificateExtract(
      batchSpecimen,
      ['NB/T 47019.5-2021'],
      '06Cr18Ni11Ti'
    );

    const sessionId = 'E2E-CASE4-REJECT-SES';
    const batchNo = 'BATCH-CASE4-REJECT';

    // 运行至 HITL 中断挂起
    for await (const _ev of engine.streamAudit(JSON.stringify(payload), { sessionId, batchNo })) {}

    // 模拟质检工程师在抽屉中选择“不予认可 / 判定无效 (缺项否决 FAIL)”
    const resumeResult = await engine.resumeAudit(
      `${sessionId}::${batchNo}`,
      {
        inspector_id: 'QC-TEST-ENGINEER',
        corrected_property_keys: {
          'Shear Toughness K1C': 'unrecognized_rejected_item',
        },
        waiver_notes: '该特种非标指标缺乏权威规范依据且未经技术协议认可，作缺项否决处理',
      }
    );

    expect(resumeResult.status).toBe('completed');
    expect(resumeResult.finalReport).toBeDefined();

    // 验证核心穿透：系统总评必须为 FAIL，且 fail_count >= 1
    expect(resumeResult.finalReport?.summary.overall_status).toBe('FAIL');
    expect(resumeResult.finalReport?.summary.fail_count).toBeGreaterThanOrEqual(1);

    // 验证 item_results 中包含被否决的特种非标项，且 status 明确为 FAIL
    const rejectedRule = resumeResult.finalReport?.item_results.find(
      r => r.property_key === 'unrecognized_rejected_item' || r.display_name === 'Shear Toughness K1C'
    );
    expect(rejectedRule).toBeDefined();
    expect(rejectedRule?.status).toBe('FAIL');
    expect(rejectedRule?.message).toContain('缺项否决');
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
