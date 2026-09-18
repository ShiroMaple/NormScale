import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { WorkbenchFooterBar } from '@/components/workbench/components/WorkbenchFooterBar.tsx';

describe('WorkbenchFooterBar 底部导航条测试', () => {
  it('步骤 0 状态下应正确呈现上传与解析主按钮，且无返回上一步按钮', () => {
    const html = renderToString(
      React.createElement(WorkbenchFooterBar, {
        currentStep: 0,
        onGoToStep: vi.fn(),
        queuedDocsCount: 1,
        isAnyDocPreprocessing: false,
        onStartNewSessionAndAdvance: vi.fn(),
      })
    );

    expect(html).toContain('上传文档');
    expect(html).toContain('核对数据');
    expect(html).toContain('比对标准');
    expect(html).toContain('解析文档，核对数据');
    expect(html).not.toContain('返回上一步');
    expect(html).not.toContain('核对完成，比对标准');
  });

  it('步骤 0 当队列为空或正在预处理时，主按钮应禁用', () => {
    const htmlEmpty = renderToString(
      React.createElement(WorkbenchFooterBar, {
        currentStep: 0,
        onGoToStep: vi.fn(),
        queuedDocsCount: 0,
        isAnyDocPreprocessing: false,
        onStartNewSessionAndAdvance: vi.fn(),
      })
    );
    expect(htmlEmpty).toContain('disabled=""');
    expect(htmlEmpty).toContain('cursor-not-allowed');

    const htmlPreprocessing = renderToString(
      React.createElement(WorkbenchFooterBar, {
        currentStep: 0,
        onGoToStep: vi.fn(),
        queuedDocsCount: 1,
        isAnyDocPreprocessing: true,
        onStartNewSessionAndAdvance: vi.fn(),
      })
    );
    expect(htmlPreprocessing).toContain('文档预处理中...');
    expect(htmlPreprocessing).toContain('disabled=""');
  });

  it('步骤 1 状态下应显示返回上一步以及推进至步骤 2 的按钮', () => {
    const html = renderToString(
      React.createElement(WorkbenchFooterBar, {
        currentStep: 1,
        onGoToStep: vi.fn(),
        queuedDocsCount: 1,
        isAnyDocPreprocessing: false,
        onStartNewSessionAndAdvance: vi.fn(),
      })
    );

    expect(html).toContain('返回上一步');
    expect(html).toContain('核对完成，比对标准');
  });

  it('步骤 2 状态下应显示保存截图、开启新任务与保存结果按钮', () => {
    const html = renderToString(
      React.createElement(WorkbenchFooterBar, {
        currentStep: 2,
        onGoToStep: vi.fn(),
        queuedDocsCount: 1,
        isAnyDocPreprocessing: false,
        onStartNewSessionAndAdvance: vi.fn(),
        currentBatchNo: 'Z26022C-DB7',
        totalBatchesCount: 3,
        canScrollTop: true,
      })
    );

    expect(html).toContain('返回上一步');
    expect(html).toContain('保存当前页面截图');
    expect(html).toContain('开启新任务');
    expect(html).toContain('保存结果');
    expect(html).toContain('返回顶部');
  });
});
