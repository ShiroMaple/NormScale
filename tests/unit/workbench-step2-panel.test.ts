import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Step2DataVerificationPanel } from '@/components/workbench/steps/Step2DataVerificationPanel.tsx';
import { InspectionSession, SessionDocument, BatchSpecimen } from '@/types/session.ts';

describe('Step2DataVerificationPanel 单元测试 (阶段 3)', () => {
  const mockBatch: BatchSpecimen = {
    batchNo: 'BATCH-2026-X1',
    subBatchIndex: 1,
    grade: '022Cr17Ni12Mo2',
    standard: 'GB/T 13296-2023',
    supplier: '某特钢股份有限公司',
    dimensions: 'OD 25.0mm × WT 2.0mm',
    heatNo: 'HEAT-9901',
    verdict: 'PASS',
    verdictSummary: '符合标准要求',
    ocrConfidence: 96,
    gradeMatchConfidence: 98,
    reportNo: 'QA-20260917-001',
    sha256Hash: 'hash-abc',
    inspector: 'QA-01',
    chemical: [
      { element: 'C', value: '0.02', confidence: '98%', status: 'ok' },
      { element: 'Cr', value: '17.2', confidence: '99%', status: 'ok' },
      { element: 'Ni', value: '12.1', confidence: '99%', status: 'ok' },
    ],
    mechanical: {
      tensile_rm: '580',
      yield_rp02: '240',
      elongation_a: '42',
      hardness: '170 HV',
      impact_kv2_1: '',
      impact_kv2_2: '',
      impact_kv2_3: '',
      impact_kv2_avg: '',
    },
    process: {
      flattening: 'PASS',
      flaring: 'PASS',
      grainSize: '7.5',
      intergranularCorrosion: 'PASS',
      ndt_et: 'PASS',
      ndt_ut: '',
    },
    additionalTests: [],
    humanVerdict: null,
  };

  const mockDoc: SessionDocument = {
    docId: 'doc-101',
    filename: '测试质保书1.pdf',
    fileSize: '1.2 MB',
    uploadTime: '2026-09-17 12:00',
    ocrStatus: 'DONE',
    pageCount: 1,
    batches: [mockBatch],
  };

  const mockSession: InspectionSession = {
    sessionId: 'session-test-001',
    createdAt: '2026-09-17T00:00:00Z',
    title: '质检测试会话',
    totalDocuments: 1,
    totalBatches: 1,
    passedBatches: 1,
    failedBatches: 0,
    hitlBatches: 0,
    documents: [mockDoc],
  };

  it('当没有选中文档或批次时，正常渲染空状态而不发生异常', () => {
    const html = renderToString(
      React.createElement(Step2DataVerificationPanel, {
        session: { ...mockSession, documents: [] },
        selectedDocId: '',
        selectedBatchNo: '',
        onSelectDoc: vi.fn(),
        onSelectBatch: vi.fn(),
        currentDoc: undefined,
        currentBatch: undefined,
        parsingTasks: {},
        totalCombinedMetrics: null,
        isStreamingTerminalExpanded: false,
        onToggleStreamingTerminal: vi.fn(),
        onReparseDocument: vi.fn(),
        bboxes: [],
        onUpdateBatchNo: vi.fn(),
        onUpdateExtractValue: vi.fn(),
        onGoToStep: vi.fn(),
      })
    );

    expect(html).toBeTruthy();
    expect(html).toContain('暂无活动检验文档');
    expect(html).toContain('前往步骤 1 上传文档');
  });

  it('传入有效文档与批次时，正确渲染核验面板与批次信息', () => {
    const html = renderToString(
      React.createElement(Step2DataVerificationPanel, {
        session: mockSession,
        selectedDocId: 'doc-101',
        selectedBatchNo: 'BATCH-2026-X1',
        onSelectDoc: vi.fn(),
        onSelectBatch: vi.fn(),
        currentDoc: mockDoc,
        currentBatch: mockBatch,
        parsingTasks: {},
        totalCombinedMetrics: {
          totalInputTokens: 800,
          totalOutputTokens: 400,
          totalTokens: 1200,
          totalDurationSeconds: 1.5,
          parseInputTokens: 800,
          parseOutputTokens: 400,
          parseDurationSeconds: 1.5,
        },
        isStreamingTerminalExpanded: false,
        onToggleStreamingTerminal: vi.fn(),
        onReparseDocument: vi.fn(),
        bboxes: [],
        onUpdateBatchNo: vi.fn(),
        onUpdateExtractValue: vi.fn(),
        onGoToStep: vi.fn(),
      })
    );

    expect(html).toBeTruthy();
    // 验证包含批次号与品名相关展示
    expect(html).toContain('BATCH-2026-X1');
    // 验证包含指标化分和力学项
    expect(html).toContain('Cr (元素含量)');
    expect(html).toContain('抗拉强度 Rm');
    expect(html).toContain('测试质保书1.pdf');
    // 验证步骤 2 不应包含步骤 3 的人工复核终审条
    expect(html).not.toContain('质检员人工复核标记 (双轨制)');
  });

  it('当展开流式终端时，正确渲染终端节点容器', () => {
    const html = renderToString(
      React.createElement(Step2DataVerificationPanel, {
        session: mockSession,
        selectedDocId: 'doc-101',
        selectedBatchNo: 'BATCH-2026-X1',
        onSelectDoc: vi.fn(),
        onSelectBatch: vi.fn(),
        currentDoc: mockDoc,
        currentBatch: mockBatch,
        parsingTasks: {
          'doc-101': {
            docId: 'doc-101',
            fileName: '测试质保书1.pdf',
            status: 'completed',
            progress: 100,
            inputTokens: 500,
            outputTokens: 250,
            totalTokens: 750,
            durationSeconds: 2.1,
            streamingJson: '{"recognized_text": "LLM-SYS-COMPLETED"}',
          } as any,
        },
        totalCombinedMetrics: null,
        isStreamingTerminalExpanded: true,
        onToggleStreamingTerminal: vi.fn(),
        onReparseDocument: vi.fn(),
        bboxes: [],
        onUpdateBatchNo: vi.fn(),
        onUpdateExtractValue: vi.fn(),
        onGoToStep: vi.fn(),
      })
    );

    expect(html).toBeTruthy();
    expect(html).toContain('收起');
    expect(html).toContain('LLM-SYS-COMPLETED');
  });

  it('当置信度为数字小数 (如 0.98)、整数 (如 95) 或非字符串时，能够安全解析与渲染，杜绝 replace is not a function 异常', () => {
    const numericConfidenceBatch: BatchSpecimen = {
      ...mockBatch,
      chemical: [
        { element: 'C', value: '0.018', confidence: 0.98 as any, status: 'ok' },
        { element: 'Si', value: '0.45', confidence: 95 as any, status: 'ok' },
        { element: 'Mn', value: '1.20', confidence: undefined as any, status: 'ok' },
      ],
    };

    const html = renderToString(
      React.createElement(Step2DataVerificationPanel, {
        session: mockSession,
        selectedDocId: 'doc-101',
        selectedBatchNo: 'BATCH-2026-X1',
        onSelectDoc: vi.fn(),
        onSelectBatch: vi.fn(),
        currentDoc: { ...mockDoc, batches: [numericConfidenceBatch] },
        currentBatch: numericConfidenceBatch,
        parsingTasks: {},
        totalCombinedMetrics: null,
        isStreamingTerminalExpanded: false,
        onToggleStreamingTerminal: vi.fn(),
        onReparseDocument: vi.fn(),
        bboxes: [],
        onUpdateBatchNo: vi.fn(),
        onUpdateExtractValue: vi.fn(),
        onGoToStep: vi.fn(),
      })
    );

    expect(html).toBeTruthy();
    expect(html).toContain('98%');
    expect(html).toContain('95%');
  });

  it('步骤 2 应采用无 max-w-[1440px] 留白限制的全宽容器，并按 6:4 比例渲染原件与提取视窗，支持全屏展开与折叠', () => {
    const html = renderToString(
      React.createElement(Step2DataVerificationPanel, {
        session: mockSession,
        selectedDocId: 'doc-101',
        selectedBatchNo: 'BATCH-2026-X1',
        onSelectDoc: vi.fn(),
        onSelectBatch: vi.fn(),
        currentDoc: mockDoc,
        currentBatch: mockBatch,
        parsingTasks: {},
        totalCombinedMetrics: null,
        isStreamingTerminalExpanded: false,
        onToggleStreamingTerminal: vi.fn(),
        onReparseDocument: vi.fn(),
        bboxes: [],
        onUpdateBatchNo: vi.fn(),
        onUpdateExtractValue: vi.fn(),
        onGoToStep: vi.fn(),
      })
    );

    // 验证定宽限制已被彻底移除
    expect(html).not.toContain('max-w-[1440px]');
    // 验证 6:4 比例分配 (左 60% 右 40%)
    expect(html).toContain('lg:w-[60%]');
    expect(html).toContain('lg:w-[40%]');
    // 验证全屏/折叠沉浸查阅入口
    expect(html).toContain('全屏沉浸查看原件');
    expect(html).toContain('收起右侧核对视窗');
    // 验证中缝细长条胶囊折叠把手
    expect(html).toContain('w-3.5 h-16 rounded-full');
    expect(html).toContain('chevron_right');
    // 验证原件预览视窗容器注入了 aspect-ratio 动态等比样式
    expect(html).toContain('aspect-ratio');
  });

  it('提取项提取值居左对齐，单位与数值合并展示，原件预览默认 225%', () => {
    const html = renderToString(
      React.createElement(Step2DataVerificationPanel, {
        session: mockSession,
        selectedDocId: 'doc-101',
        selectedBatchNo: 'BATCH-2026-X1',
        onSelectDoc: vi.fn(),
        onSelectBatch: vi.fn(),
        currentDoc: mockDoc,
        currentBatch: mockBatch,
        parsingTasks: {},
        totalCombinedMetrics: null,
        isStreamingTerminalExpanded: false,
        onToggleStreamingTerminal: vi.fn(),
        onReparseDocument: vi.fn(),
        bboxes: [],
        onUpdateBatchNo: vi.fn(),
        onUpdateExtractValue: vi.fn(),
        onGoToStep: vi.fn(),
      })
    );

    // 1. 验证总览表格表头提取值居左，且移除了独立的「单位」表头列
    expect(html).toContain('text-left w-40">提取值</th>');
    expect(html).not.toContain('<th class="px-3.5 py-2 font-bold w-16">单位</th>');

    // 2. 验证提取值与单位合并展示（如元素含量含 wt%，抗拉强度含 MPa）
    expect(html).toContain('wt%');
    expect(html).toContain('MPa');

    // 3. 验证工具栏还原缩放为 225%
    expect(html).toContain('225%');
    expect(html).toContain('点击一键还原为 225%');
  });
});

