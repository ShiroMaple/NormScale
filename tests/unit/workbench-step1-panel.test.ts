import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Step1DocumentQueuePanel } from '@/components/workbench/steps/Step1DocumentQueuePanel.tsx';
import { QueuedDocItem, CachedDocItem } from '@/components/workbench/types.ts';
import { PresetSampleDto } from '@/lib/api-client.ts';

describe('Step1DocumentQueuePanel 单元测试 (阶段 2)', () => {
  const mockQueuedDocs: QueuedDocItem[] = [
    {
      id: 'doc-1',
      filename: '测试质保书1.pdf',
      status: '已命中解析缓存',
      size: '1.2 MB',
      date: '2026/09/17',
    },
  ];

  const mockCachedDocs: CachedDocItem[] = [
    {
      id: 'cache-1',
      md5: 'md5-1',
      filename: '历史质保书.pdf',
      date: '2026/09/17',
      size: '1.5 MB',
      cacheLevel: 'L1',
    },
  ];

  const mockScenarioSamples: PresetSampleDto[] = [
    {
      id: 'case-1',
      title: '典型场景用例 1',
      category: '分层核验典型场景',
      filename: 'case-1.pdf',
      declared_grade: '022Cr17Ni12Mo2',
      expected_outcome: 'PASS',
      description: '典型用例说明',
      tags: ['典型'],
    },
  ];

  it('当队列为空时，正确渲染空队列提示文案与上传拖拽区域', () => {
    const html = renderToString(
      React.createElement(Step1DocumentQueuePanel, {
        onSelectRealFiles: vi.fn(),
        queuedDocs: [],
        selectedDocId: '',
        onSelectDoc: vi.fn(),
        onRemoveOrCancelDoc: vi.fn(),
        uploadedAgreementFile: null,
        agreementUploadError: null,
        isAgreementDraggingOver: false,
        setIsAgreementDraggingOver: vi.fn(),
        onSelectAgreementFile: vi.fn(),
        onRemoveAgreementFile: vi.fn(),
        cachedDocs: [],
        onRestoreFromCache: vi.fn(),
        onDeleteCachedDoc: vi.fn(),
        onRefreshCachedDocs: vi.fn(),
        scenarioSamples: [],
        loadingScenarios: {},
        onLoadScenarioFile: vi.fn(),
      })
    );

    expect(html).toContain('步骤 1: 上传或选择待解析文档');
    expect(html).toContain('待处理队列为空');
    expect(html).toContain('拖拽质保书到此处');
    expect(html).toContain('选择或拖拽订货技术协议');
  });

  it('当队列有文档时，正确展示文档卡片与状态', () => {
    const html = renderToString(
      React.createElement(Step1DocumentQueuePanel, {
        onSelectRealFiles: vi.fn(),
        queuedDocs: mockQueuedDocs,
        selectedDocId: 'doc-1',
        onSelectDoc: vi.fn(),
        onRemoveOrCancelDoc: vi.fn(),
        uploadedAgreementFile: null,
        agreementUploadError: null,
        isAgreementDraggingOver: false,
        setIsAgreementDraggingOver: vi.fn(),
        onSelectAgreementFile: vi.fn(),
        onRemoveAgreementFile: vi.fn(),
        cachedDocs: mockCachedDocs,
        onRestoreFromCache: vi.fn(),
        onDeleteCachedDoc: vi.fn(),
        onRefreshCachedDocs: vi.fn(),
        scenarioSamples: mockScenarioSamples,
        loadingScenarios: {},
        onLoadScenarioFile: vi.fn(),
      })
    );

    expect(html).toContain('测试质保书1.pdf');
    expect(html).toContain('已命中解析缓存');
    expect(html).toContain('历史质保书.pdf');
  });

  it('当上传了技术协议时，正确展示协议卡片与待实施标记', () => {
    const mockFile = new File(['dummy content'], '订货协议_001.pdf', { type: 'application/pdf' });
    Object.defineProperty(mockFile, 'size', { value: 1024 * 50 }); // 50 KB

    const html = renderToString(
      React.createElement(Step1DocumentQueuePanel, {
        onSelectRealFiles: vi.fn(),
        queuedDocs: mockQueuedDocs,
        selectedDocId: 'doc-1',
        onSelectDoc: vi.fn(),
        onRemoveOrCancelDoc: vi.fn(),
        uploadedAgreementFile: mockFile,
        agreementUploadError: null,
        isAgreementDraggingOver: false,
        setIsAgreementDraggingOver: vi.fn(),
        onSelectAgreementFile: vi.fn(),
        onRemoveAgreementFile: vi.fn(),
        cachedDocs: [],
        onRestoreFromCache: vi.fn(),
        onDeleteCachedDoc: vi.fn(),
        onRefreshCachedDocs: vi.fn(),
        scenarioSamples: [],
        loadingScenarios: {},
        onLoadScenarioFile: vi.fn(),
      })
    );

    expect(html).toContain('订货协议_001.pdf');
    expect(html).toContain('50.0');
    expect(html).toContain('KB');
    expect(html).toContain('功能待实施 · 暂未接入后端');
  });
});
