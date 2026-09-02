import { describe, it, expect } from 'vitest';
import { matchFieldBBoxesFromTokens, TextTokenItem } from '@/utils/bbox-matcher.ts';
import { SessionDocument } from '@/types/session.ts';

describe('BBoxAnchorMatcher: 智能文本锚点 BBox 匹配引擎测试', () => {
  const mockTokens: TextTokenItem[] = [
    { str: '20260102304', page: 1, x: 74.5, y: 13.2, w: 15.0, h: 2.1 },
    { str: '25715-7091', page: 1, x: 74.5, y: 16.0, w: 14.0, h: 2.1 },
    { str: 'S32168', page: 1, x: 62.0, y: 19.5, w: 10.0, h: 2.0 },
    { str: 'YX2303-2105', page: 1, x: 12.0, y: 22.5, w: 18.0, h: 2.0 },
    { str: 'B25053C', page: 1, x: 62.0, y: 22.5, w: 12.0, h: 2.0 },
    { str: 'B25053C-DA3', page: 2, x: 8.5, y: 22.0, w: 16.0, h: 2.2 },
    { str: '0.021', page: 1, x: 34.0, y: 29.5, w: 6.0, h: 1.8 },
    { str: '0.55', page: 1, x: 41.0, y: 29.5, w: 5.5, h: 1.8 },
    { str: '17.54', page: 1, x: 68.0, y: 29.5, w: 6.0, h: 1.8 },
    { str: '656', page: 2, x: 30.0, y: 22.0, w: 5.0, h: 2.0 },
    { str: '328', page: 2, x: 40.0, y: 22.0, w: 5.0, h: 2.0 },
    { str: '52.0', page: 2, x: 50.0, y: 22.0, w: 5.0, h: 2.0 },
  ];

  const mockDoc: SessionDocument = {
    docId: 'doc_test_01',
    filename: '测试质保书2.pdf',
    fileSize: '1.2 MB',
    uploadTime: '2026-09-01 12:00:00',
    ocrStatus: 'DONE',
    pageCount: 2,
    batches: [
      {
        batchNo: 'B25053C-DA3',
        subBatchIndex: 1,
        certificateNo: '20260102304',
        constructionNo: '25715-7091',
        productName: '换热管',
        grade: 'S32168',
        standard: 'GB/T 13296-2023',
        supplier: '镇海石化建安工程股份有限公司制管厂',
        dimensions: 'OD 13mm × WT 0.6mm',
        heatNo: 'YX2303-2105',
        packNo: 'B25053C',
        deliveryState: '光亮固溶',
        verdict: 'PASS',
        verdictSummary: '合格',
        ocrConfidence: 99,
        gradeMatchConfidence: 99,
        chemical: [
          { element: 'C', value: '0.021', confidence: '99%', status: 'ok' },
          { element: 'Si', value: '0.55', confidence: '99%', status: 'ok' },
          { element: 'Cr', value: '17.54', confidence: '99%', status: 'ok' },
        ],
        mechanical: {
          tensile_rm: '656、651 MPa',
          yield_rp02: '328、318 MPa',
          elongation_a: '52.0、54.5 %',
          hardness: '157 HV1',
        },
        process: { flattening: 'PASS', flaring: 'PASS', intergranularCorrosion: 'PASS', ndt: '合格' },
        reportNo: 'QA-001',
        sha256Hash: 'HASH',
        inspector: 'AI',
      },
    ],
  };

  it('应该能基于文本 Token 坐标自动匹配生成元数据、化学与力学性能 BBox', () => {
    const bboxes = matchFieldBBoxesFromTokens(mockDoc, mockTokens);

    expect(bboxes.length).toBeGreaterThan(5);

    const certBox = bboxes.find(b => b.id === 'meta_certificateNo');
    expect(certBox).toBeDefined();
    expect(certBox?.page).toBe(1);
    expect(certBox?.x).toBe(74.5);

    const heatBox = bboxes.find(b => b.id === 'meta_heatNo');
    expect(heatBox).toBeDefined();
    expect(heatBox?.x).toBe(12.0);

    const packBox = bboxes.find(b => b.id === 'meta_packNo');
    expect(packBox).toBeDefined();
    expect(packBox?.x).toBe(62.0);

    const chemCBox = bboxes.find(b => b.id === 'chem_C');
    expect(chemCBox).toBeDefined();
    expect(chemCBox?.x).toBe(34.0);

    const tensileBox = bboxes.find(b => b.id === 'mech_tensile');
    expect(tensileBox).toBeDefined();
    expect(tensileBox?.page).toBe(2);
    expect(tensileBox?.x).toBe(30.0);
  });
});
