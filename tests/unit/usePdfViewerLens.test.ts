import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { usePdfViewerLens } from '@/components/workbench/hooks/usePdfViewerLens.ts';

// 纯原生 React 测试 Harness
function TestHarness({
  onHookResult,
  options = {},
}: {
  onHookResult: (res: ReturnType<typeof usePdfViewerLens>) => void;
  options?: Parameters<typeof usePdfViewerLens>[0];
}) {
  const hookResult = usePdfViewerLens(options);
  onHookResult(hookResult);
  return React.createElement('div', { 'data-testid': 'harness' }, `zoom:${hookResult.zoomLevel}`);
}

describe('usePdfViewerLens Hook 单元测试 (阶段 3)', () => {
  it('应具备符合工业规范的初始视窗状态', () => {
    let captured: ReturnType<typeof usePdfViewerLens> | null = null;

    renderToString(
      React.createElement(TestHarness, {
        onHookResult: res => {
          captured = res;
        },
      })
    );

    expect(captured).not.toBeNull();
    if (!captured) return;

    expect((captured as any).zoomLevel).toBe(225);
    expect((captured as any).rotation).toBe(0);
    expect((captured as any).currentDocPage).toBe(1);
    expect((captured as any).pageOrientationOverride).toBe('auto');
    expect((captured as any).isBboxFocusEnabled).toBe(false);
    expect((captured as any).highlightedFieldId).toBeNull();
    expect((captured as any).magnifiedFieldId).toBeNull();
  });

  it('应正确导出视窗变换与 BBox 操作函数', () => {
    let captured: ReturnType<typeof usePdfViewerLens> | null = null;

    renderToString(
      React.createElement(TestHarness, {
        onHookResult: res => {
          captured = res;
        },
      })
    );

    expect(captured).not.toBeNull();
    if (!captured) return;

    expect(typeof (captured as any).zoomIn).toBe('function');
    expect(typeof (captured as any).zoomOut).toBe('function');
    expect(typeof (captured as any).resetZoom).toBe('function');
    expect(typeof (captured as any).rotateClockwise).toBe('function');
    expect(typeof (captured as any).handleToggleBboxFocus).toBe('function');
    expect(typeof (captured as any).handleResetMagnify).toBe('function');
    expect(typeof (captured as any).scrollToLeftBBox).toBe('function');
    expect(typeof (captured as any).scrollToRightField).toBe('function');
  });

  it('传入 options 时能够正确绑定并在 Hook 中生效', () => {
    let captured: ReturnType<typeof usePdfViewerLens> | null = null;
    const dummyBboxes = [
      { id: 'f1', fieldId: 'tensile', label: '抗拉强度', page: 1, x: 10, y: 10, w: 20, h: 20, confidence: 0.95 },
    ];

    renderToString(
      React.createElement(TestHarness, {
        options: {
          selectedDocId: 'doc-special-99',
          currentStep: 1,
          bboxes: dummyBboxes,
        },
        onHookResult: res => {
          captured = res;
        },
      })
    );

    expect(captured).not.toBeNull();
    if (!captured) return;
    expect((captured as any).pdfScrollContainerRef).toBeDefined();
  });
});
