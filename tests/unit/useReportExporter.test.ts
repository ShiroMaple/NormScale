import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { useReportExporter, UseReportExporterOptions } from '@/components/workbench/hooks/useReportExporter.ts';
import { InspectionSession, SessionDocument, BatchSpecimen } from '@/types/session.ts';

// TestHarness 用于在纯 React SSR/Test 环境中挂载并提取 Hook 返回值
interface HarnessProps {
  options: UseReportExporterOptions;
  onHookResult: (res: ReturnType<typeof useReportExporter>) => void;
}

const TestHarness: React.FC<HarnessProps> = ({ options, onHookResult }) => {
  const result = useReportExporter(options);
  onHookResult(result);
  return React.createElement('div', null, 'ExporterHarness');
};

describe('useReportExporter 单元测试 (阶段 4.1)', () => {
  const mockBatch: BatchSpecimen = {
    batchNo: 'BATCH-2026-001',
    subBatchIndex: 1,
    grade: '022Cr17Ni12Mo2',
    standard: 'GB/T 13296-2023',
    supplier: '宝武特钢',
    dimensions: 'OD 25.0mm',
    heatNo: 'H-01',
    verdict: 'PASS',
    verdictSummary: '合格',
    ocrConfidence: 99,
    gradeMatchConfidence: 98,
    reportNo: 'QA-001',
    sha256Hash: 'hash-1',
    inspector: 'QA-01',
    chemical: [],
    mechanical: { tensile_rm: '550', yield_rp02: '230', elongation_a: '40' },
    process: {
      flattening: 'PASS',
      flaring: 'PASS',
      grainSize: '7.5',
      intergranularCorrosion: 'PASS',
      ndt_et: 'PASS',
      ndt_ut: '',
    },
  };

  const mockDoc: SessionDocument = {
    docId: 'doc-001',
    filename: '测试文档.pdf',
    fileSize: '1.2 MB',
    uploadTime: '2026-09-17',
    ocrStatus: 'DONE',
    pageCount: 1,
    batches: [mockBatch],
  };

  const mockSession: InspectionSession = {
    sessionId: 'SESS-20260917-001',
    createdAt: '2026-09-17T00:00:00Z',
    title: '测试质检会话',
    totalDocuments: 1,
    totalBatches: 1,
    passedBatches: 1,
    failedBatches: 0,
    hitlBatches: 0,
    documents: [mockDoc],
  };

  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('正确暴露初始状态与所有必需的方法接口', () => {
    let captured: ReturnType<typeof useReportExporter> | null = null;
    const showToastMock = vi.fn();

    renderToString(
      React.createElement(TestHarness, {
        options: {
          session: mockSession,
          currentDoc: mockDoc,
          currentBatch: mockBatch,
          selectedDocId: 'doc-001',
          selectedBatchNo: 'BATCH-2026-001',
          setSelectedDocId: vi.fn(),
          setSelectedBatchNo: vi.fn(),
          showToast: showToastMock,
        },
        onHookResult: res => {
          captured = res;
        },
      })
    );

    expect(captured).not.toBeNull();
    expect(captured!.isCapturing).toBe(false);
    expect(typeof captured!.capturePanelToPng).toBe('function');
    expect(typeof captured!.handleSaveCurrentBatchScreenshot).toBe('function');
    expect(typeof captured!.handleSaveCurrentDocAllBatchesScreenshot).toBe('function');
    expect(typeof captured!.handleSaveSessionAllBatchesScreenshot).toBe('function');
    expect(typeof captured!.handleSaveSessionResults).toBe('function');
  });

  it('在 DOM 视窗缺失时，截图导出方法安全防御并弹出错误提示', async () => {
    let captured: ReturnType<typeof useReportExporter> | null = null;
    const showToastMock = vi.fn();

    renderToString(
      React.createElement(TestHarness, {
        options: {
          session: mockSession,
          currentDoc: mockDoc,
          currentBatch: mockBatch,
          selectedDocId: 'doc-001',
          selectedBatchNo: 'BATCH-2026-001',
          setSelectedDocId: vi.fn(),
          setSelectedBatchNo: vi.fn(),
          showToast: showToastMock,
          targetPanelId: 'non-existent-panel-id',
        },
        onHookResult: res => {
          captured = res;
        },
      })
    );

    await captured!.handleSaveCurrentBatchScreenshot();
    expect(showToastMock).toHaveBeenCalledWith('无法定位步骤 3 结果视窗', 'error');
  });

  it('handleSaveSessionResults 成功调用保存接口时，剔除 Base64 并提示成功', async () => {
    let captured: ReturnType<typeof useReportExporter> | null = null;
    const showToastMock = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    global.fetch = fetchMock;

    const docWithBase64: SessionDocument = {
      ...mockDoc,
      pages: ['data:image/png;base64,iVBORw0KGgo...', 'https://oss.example.com/clean.png'],
    };

    renderToString(
      React.createElement(TestHarness, {
        options: {
          session: { ...mockSession, documents: [docWithBase64] },
          currentDoc: docWithBase64,
          currentBatch: mockBatch,
          selectedDocId: 'doc-001',
          selectedBatchNo: 'BATCH-2026-001',
          setSelectedDocId: vi.fn(),
          setSelectedBatchNo: vi.fn(),
          showToast: showToastMock,
        },
        onHookResult: res => {
          captured = res;
        },
      })
    );

    await captured!.handleSaveSessionResults(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const callBody = JSON.parse((firstCall as any)[1].body);
    // 验证过滤掉 Base64 仅保留正常图片 URL
    expect(callBody.documents[0].pages).toEqual(['https://oss.example.com/clean.png']);
    expect(showToastMock).toHaveBeenCalledWith(
      expect.stringContaining('检验结果已成功归档至服务端台账'),
      'success'
    );
  });
});
