import { describe, it, expect } from 'vitest';
import { GET as getStandards } from '@/app/api/standards/route.ts';
import { GET as getSamples } from '@/app/api/samples/route.ts';
import { POST as submitAudit } from '@/app/api/audit/submit/route.ts';
import { GET as getStatus } from '@/app/api/audit/status/[taskId]/route.ts';
import { POST as resumeAudit } from '@/app/api/audit/resume/[taskId]/route.ts';

describe('Next.js 15 App Router API 路由层集成测试', () => {
  it('GET /api/standards: 正确返回已收录标准及 31 个规格切片元数据', async () => {
    const response = await getStandards();
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.total_standards).toBeGreaterThanOrEqual(1);
    expect(json.data.total_slices).toBeGreaterThanOrEqual(31);
    expect(json.data.standards[0].standard_id).toBe('GB/T 13296-2023');
  });

  it('GET /api/samples: 正确返回预设典型测试样本列表', async () => {
    const response = await getSamples();
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(3);
    expect(json.data.some((s: any) => s.id === 's30408_messy_sample')).toBe(true);
    expect(json.data.some((s: any) => s.id === 's31603_kgf_sample')).toBe(true);
    expect(json.data.some((s: any) => s.id === 'unknown_grade_sample')).toBe(true);
  });

  it('POST /api/audit/submit: 提交标准样本成功完成核验并返回 PASS 报告', async () => {
    const req = new Request('http://localhost:3000/api/audit/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sampleId: 's30408_messy_sample',
        options: { contextId: 'API-TEST-S30408' },
      }),
    });

    const response = await submitAudit(req);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe('completed');
    expect(json.taskId).toBe('API-TEST-S30408');
    expect(json.finalReport.summary.overall_status).toBe('PASS');
    expect(json.finalReport.summary.pass_count).toBeGreaterThanOrEqual(10);
  });

  it('POST /api/audit/submit & resume: 未知牌号触发挂起，提交人工修正后成功恢复流转', async () => {
    // 1. 提交未知牌号
    const submitReq = new Request('http://localhost:3000/api/audit/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sampleId: 'unknown_grade_sample',
        options: { contextId: 'API-TEST-HITL-001' },
      }),
    });

    const submitRes = await submitAudit(submitReq);
    expect(submitRes.status).toBe(200);
    const submitJson = await submitRes.json();

    expect(submitJson.status).toBe('suspended_hitl');
    expect(submitJson.hitlContext).toBeDefined();
    expect(submitJson.hitlContext.reason).toBe('UNKNOWN_GRADE');

    // 2. 查询状态快照 GET /api/audit/status/[taskId]
    const statusRes = await getStatus(
      new Request('http://localhost:3000/api/audit/status/API-TEST-HITL-001'),
      { params: Promise.resolve({ taskId: 'API-TEST-HITL-001' }) }
    );
    expect(statusRes.status).toBe(200);
    const statusJson = await statusRes.json();
    expect(statusJson.success).toBe(true);
    expect(statusJson.hasHitlContext).toBe(true);

    // 3. 提交人工修正 POST /api/audit/resume/[taskId]
    const resumeReq = new Request('http://localhost:3000/api/audit/resume/API-TEST-HITL-001', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        corrected_grade: '06Cr19Ni10',
        inspector_id: 'QA-TEST-007',
        waiver_notes: '经技术协议确认牌号为 06Cr19Ni10',
      }),
    });

    const resumeRes = await resumeAudit(resumeReq, {
      params: Promise.resolve({ taskId: 'API-TEST-HITL-001' }),
    });
    expect(resumeRes.status).toBe(200);
    const resumeJson = await resumeRes.json();

    expect(resumeJson.success).toBe(true);
    expect(resumeJson.status).toBe('completed');
    expect(resumeJson.finalReport).toBeDefined();
    expect(resumeJson.finalReport.summary.overall_status).toBe('PASS');
  });
});
