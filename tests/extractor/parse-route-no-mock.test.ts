import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { POST } from '../../src/app/api/documents/parse/route.ts';
import { globalParseCacheStore, CachedParseResult } from '../../src/repository/parse-cache-store.ts';

describe('API: /api/documents/parse (反伪哈希与零 Mock 门禁)', () => {
  const testMd5 = 'test_clean_md5_9876543210abcdef';

  beforeEach(() => {
    const mockCache: CachedParseResult = {
      md5: testMd5,
      filename: '真实测试质保书.pdf',
      fileSize: '0.5 MB',
      model: 'kimi-k2.7-code',
      provider: 'Moonshot',
      parsedAt: new Date().toISOString(),
      parserConfigVersion: '1.1.0',
      tokenStats: {
        inputTokens: 1000,
        outputTokens: 200,
        durationSeconds: 0.8,
        isFromCache: false,
      },
      rawStreamingJson: '{"test": true}',
      sessionDocument: {
        docId: `doc_${testMd5.slice(0, 8)}`,
        md5: testMd5,
        filename: '真实测试质保书.pdf',
        fileSize: '0.5 MB',
        uploadTime: '2026-09-02 12:00:00',
        ocrStatus: 'DONE',
        pageCount: 1,
        batches: [
          {
            batchNo: 'TEST-BATCH-01',
            subBatchIndex: 1,
            grade: 'S32168',
            standard: 'GB/T 13296-2023',
            supplier: '测试钢铁厂',
            dimensions: 'OD 25mm',
            heatNo: 'HEAT-001',
            verdict: 'PASS',
            verdictSummary: '合格',
            ocrConfidence: 98,
            gradeMatchConfidence: 99,
            chemical: [],
            mechanical: { tensile_rm: '600', yield_rp02: '250', elongation_a: '40' },
            process: { flattening: 'PASS', intergranularCorrosion: 'PASS', ndt: 'PASS' },
            reportNo: 'QA-001',
            sha256Hash: 'hash',
            inspector: 'QC',
          },
        ],
      },
      bboxes: [],
    };
    globalParseCacheStore.set(testMd5, mockCache);
  });

  afterEach(() => {
    globalParseCacheStore.delete(testMd5);
  });

  it('当未传二进制文件流且未传 md5 时，必须严格返回 400 且拒绝生成伪哈希', async () => {
    const formData = new FormData();
    formData.append('filename', '未知文档.pdf');
    // 不传递 file 也不传递 md5

    const req = new Request('http://localhost:3000/api/documents/parse', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.code).toBe('MISSING_FILE_OR_MD5');
  });

  it('当传递真实 md5（无物理文件对象）时，必须直接精准命中真实缓存，绝不生成 preset-sample 伪哈希', async () => {
    const formData = new FormData();
    formData.append('md5', testMd5);
    formData.append('sampleId', `doc_${testMd5.slice(0, 8)}`);
    formData.append('filename', '真实测试质保书.pdf');

    const req = new Request('http://localhost:3000/api/documents/parse', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.cached).toBe(true);
    expect(data.md5).toBe(testMd5);
    // 明确断言：绝对不是 preset-sample 伪哈希 184db4a3a0ccf6afcdc025b728dfba1d
    expect(data.md5).not.toBe('184db4a3a0ccf6afcdc025b728dfba1d');
    expect(data.result.sessionDocument.batches[0].batchNo).toBe('TEST-BATCH-01');
  });
});
