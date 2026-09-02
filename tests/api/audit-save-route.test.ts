import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { POST, GET, DELETE } from '../../src/app/api/audit/save/route.ts';
import { InspectionSession } from '../../src/types/session.ts';

describe('API: /api/audit/save (服务端台账归档)', () => {
  const testSessionId = `TEST_SESS_${Date.now()}`;
  const testAuditDir = path.join(process.cwd(), '.cache', 'audit');

  afterEach(() => {
    const testFile = path.join(testAuditDir, `${testSessionId}.json`);
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });

  it('POST 应该成功保存台账并自动剔除 Base64 图片', async () => {
    const mockSession: InspectionSession = {
      sessionId: testSessionId,
      createdAt: '2026-09-02 12:00:00',
      title: '现场实时录入批次 · 共 1 份文档检验',
      totalDocuments: 1,
      totalBatches: 1,
      passedBatches: 1,
      failedBatches: 0,
      hitlBatches: 0,
      documents: [
        {
          docId: 'doc_8d566b29',
          md5: '8d566b296d4110c544e8bd1b6b6136d5',
          filename: '测试质保书1.pdf',
          fileSize: '0.17 MB',
          uploadTime: '2026-09-02 12:00:00',
          ocrStatus: 'DONE',
          pageCount: 1,
          pages: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='],
          batches: [
            {
              batchNo: 'Z26022C-DB7',
              subBatchIndex: 1,
              grade: 'S32168',
              standard: 'NB/T47019.5-2021',
              supplier: '镇海石化建安工程股份有限公司制管厂',
              dimensions: 'OD 15.0mm × WT 0.8mm',
              heatNo: 'YX2602-2207',
              verdict: 'PASS',
              verdictSummary: '全景规则比对 22 项全项合规',
              ocrConfidence: 95,
              gradeMatchConfidence: 99,
              chemical: [
                { element: 'C', value: '0.018', confidence: '99%', status: 'ok' },
              ],
              mechanical: { tensile_rm: '621', yield_rp02: '289', elongation_a: '48.5' },
              process: { flattening: 'PASS', intergranularCorrosion: 'PASS', ndt: 'PASS' },
              reportNo: 'QA-20260902-001',
              sha256Hash: 'test_hash_123',
              inspector: 'QC-Engineer',
            },
          ],
        },
      ],
    };

    const req = new Request('http://localhost:3000/api/audit/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockSession),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.sessionId).toBe(testSessionId);

    // 验证服务端落盘的 JSON 文件确实去除了 base64
    const savedFile = path.join(testAuditDir, `${testSessionId}.json`);
    expect(fs.existsSync(savedFile)).toBe(true);
    const raw = fs.readFileSync(savedFile, 'utf-8');
    const savedSession = JSON.parse(raw);
    expect(savedSession.sessionId).toBe(testSessionId);
    expect(savedSession.documents[0].pages[0]).not.toContain('data:image');
    expect(savedSession.documents[0].batches[0].grade).toBe('S32168');
  });

  it('GET 应该支持按 sessionId 检索单条台账', async () => {
    // 先写入测试数据
    const mockSession: InspectionSession = {
      sessionId: testSessionId,
      createdAt: '2026-09-02 12:00:00',
      title: '测试会话',
      totalDocuments: 1,
      totalBatches: 1,
      passedBatches: 1,
      failedBatches: 0,
      hitlBatches: 0,
      documents: [],
    };
    const saveReq = new Request('http://localhost:3000/api/audit/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockSession),
    });
    await POST(saveReq);

    const getReq = new Request(`http://localhost:3000/api/audit/save?sessionId=${testSessionId}`);
    const res = await GET(getReq);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.session.sessionId).toBe(testSessionId);
  });

  it('GET 无参数时应该返回台账摘要列表', async () => {
    const getReq = new Request('http://localhost:3000/api/audit/save');
    const res = await GET(getReq);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.sessions)).toBe(true);
  });

  it('DELETE 应该成功删除指定台账', async () => {
    // 写入
    const mockSession: InspectionSession = {
      sessionId: testSessionId,
      createdAt: '2026-09-02 12:00:00',
      title: '待删除会话',
      totalDocuments: 1,
      totalBatches: 1,
      passedBatches: 1,
      failedBatches: 0,
      hitlBatches: 0,
      documents: [],
    };
    await POST(
      new Request('http://localhost:3000/api/audit/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockSession),
      })
    );

    const delReq = new Request(`http://localhost:3000/api/audit/save?sessionId=${testSessionId}`, {
      method: 'DELETE',
    });
    const res = await DELETE(delReq);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
