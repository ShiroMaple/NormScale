import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { useBatchStreamAuditor, UseBatchStreamAuditorOptions } from '@/components/workbench/hooks/useBatchStreamAuditor.ts';
import { InspectionSession, SessionDocument, BatchSpecimen } from '@/types/session.ts';
import { StandardCatalogEmptyError } from '@/components/workbench/types.ts';

interface HarnessProps {
  options: UseBatchStreamAuditorOptions;
  onHookResult: (res: ReturnType<typeof useBatchStreamAuditor>) => void;
}

const TestHarness: React.FC<HarnessProps> = ({ options, onHookResult }) => {
  const result = useBatchStreamAuditor(options);
  onHookResult(result);
  return React.createElement('div', null, 'AuditorHarness');
};

describe('useBatchStreamAuditor 单元测试 (阶段 4.2)', () => {
  const mockBatch: BatchSpecimen = {
    batchNo: 'BATCH-2026-B1',
    subBatchIndex: 1,
    grade: '022Cr17Ni12Mo2',
    standard: 'GB/T 13296-2023',
    supplier: '某特钢',
    dimensions: 'OD 25.0mm',
    heatNo: 'HEAT-01',
    verdict: 'UNAUDITED',
    verdictSummary: '未核验',
    ocrConfidence: 98,
    gradeMatchConfidence: 96,
    reportNo: 'QA-20260917',
    sha256Hash: 'hash-001',
    inspector: 'QA-01',
    chemical: [],
    mechanical: { tensile_rm: '550', yield_rp02: '240', elongation_a: '40' },
    process: { flattening: 'PASS', flaring: 'PASS', grainSize: '7.5', intergranularCorrosion: 'PASS', ndt_et: 'PASS', ndt_ut: '' },
  };

  const mockDoc: SessionDocument = {
    docId: 'doc-01',
    filename: '测试质保书.pdf',
    fileSize: '1.2 MB',
    uploadTime: '2026-09-17',
    ocrStatus: 'DONE',
    pageCount: 1,
    batches: [mockBatch],
  };

  const mockSession: InspectionSession = {
    sessionId: 'SESS-AUDIT-TEST-001',
    createdAt: '2026-09-17T00:00:00Z',
    title: '测试质检会话',
    totalDocuments: 1,
    totalBatches: 1,
    passedBatches: 0,
    failedBatches: 0,
    hitlBatches: 0,
    documents: [mockDoc],
  };

  const mockStandardsData = {
    total_standards: 2,
    total_slices: 3,
    standards: [
      {
        standard_id: 'GB/T 13296-2023',
        standard_name: '锅炉、热交换器用不锈钢无缝钢管',
        available_slices: ['022Cr17Ni12Mo2', '06Cr19Ni10'],
      },
      {
        standard_id: 'NB/T 47019.5-2021',
        standard_name: '锅炉、热交换器用管 订货技术条件',
        available_slices: ['S31603'],
      },
    ],
  };

  it('正确暴露所有调度属性与状态接口', () => {
    let captured: ReturnType<typeof useBatchStreamAuditor> | null = null;
    const showToastMock = vi.fn();

    renderToString(
      React.createElement(TestHarness, {
        options: {
          session: mockSession,
          setSession: vi.fn(),
          selectedDocId: 'doc-01',
          selectedBatchNo: 'BATCH-2026-B1',
          standardsData: mockStandardsData,
          activeStandard: 'GB/T 13296-2023',
          currentBatch: mockBatch,
          sessionMetrics: { totalDurationSeconds: 1.2, totalInputTokens: 500, totalOutputTokens: 250 },
          showToast: showToastMock,
        },
        onHookResult: res => {
          captured = res;
        },
      })
    );

    expect(captured).not.toBeNull();
    expect(captured!.isEvaluatingBatch).toBe(false);
    expect(captured!.dynamicStandardsCatalog.length).toBe(2);
    expect(captured!.selectedStandardIds).toEqual(['GB/T 13296-2023']);
    expect(typeof captured!.evaluateBatches).toBe('function');
    expect(typeof captured!.handleResolveHitl).toBe('function');
    expect(typeof captured!.handleInlineAdoptProperty).toBe('function');
    expect(typeof captured!.handleInlineAdoptHitl).toBe('function');
  });

  it('标准库为空时，evaluateBatches 抛出 StandardCatalogEmptyError 并弹出错误提示', async () => {
    let captured: ReturnType<typeof useBatchStreamAuditor> | null = null;
    const showToastMock = vi.fn();

    renderToString(
      React.createElement(TestHarness, {
        options: {
          session: mockSession,
          setSession: vi.fn(),
          selectedDocId: 'doc-01',
          selectedBatchNo: 'BATCH-2026-B1',
          standardsData: { total_standards: 0, total_slices: 0, standards: [] },
          activeStandard: 'GB/T 13296-2023',
          currentBatch: mockBatch,
          sessionMetrics: { totalDurationSeconds: 0, totalInputTokens: 0, totalOutputTokens: 0 },
          showToast: showToastMock,
        },
        onHookResult: res => {
          captured = res;
        },
      })
    );

    await expect(captured!.evaluateBatches([mockBatch])).rejects.toThrow(StandardCatalogEmptyError);
    expect(showToastMock).toHaveBeenCalledWith('标准规则库未就绪，无法发起智能比对', 'error');
  });

  it('正确根据 activeStandard 进行多标准拆分、空格缝合与规范化匹配', () => {
    let captured: ReturnType<typeof useBatchStreamAuditor> | null = null;

    renderToString(
      React.createElement(TestHarness, {
        options: {
          session: mockSession,
          setSession: vi.fn(),
          selectedDocId: 'doc-01',
          selectedBatchNo: 'BATCH-2026-B1',
          standardsData: mockStandardsData,
          // 测试含空格被拆分及顿号分隔情况：'NB/T 47019.5-2021、GB/T 13296-2023'
          activeStandard: 'NB/T 47019.5-2021、GB/T 13296-2023',
          currentBatch: mockBatch,
          sessionMetrics: { totalDurationSeconds: 2.0, totalInputTokens: 1000, totalOutputTokens: 500 },
          showToast: vi.fn(),
        },
        onHookResult: res => {
          captured = res;
        },
      })
    );

    expect(captured!.selectedStandardIds).toContain('NB/T 47019.5-2021');
    expect(captured!.selectedStandardIds).toContain('GB/T 13296-2023');
    expect(captured!.selectedStandardIds.length).toBe(2);
  });
});
