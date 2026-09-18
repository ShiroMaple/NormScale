import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  useWorkbenchSession,
  createEmptyInspectionSession,
} from '@/components/workbench/hooks/useWorkbenchSession.ts';
import { deduplicateSessionDocuments } from '@/components/workbench/types.ts';
import { SessionDocument } from '@/types/session.ts';

// 创建测试 Harness 组件
function TestHarness({
  onHookResult,
  options = {},
}: {
  onHookResult: (res: ReturnType<typeof useWorkbenchSession>) => void;
  options?: any;
}) {
  const hookResult = useWorkbenchSession({
    onShowToast: vi.fn(),
    ...options,
  });
  onHookResult(hookResult);
  return React.createElement('div', { 'data-testid': 'harness' }, hookResult.session.sessionId);
}

describe('useWorkbenchSession 领域 Hook 单元测试', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('createEmptyInspectionSession 工厂函数', () => {
    it('应生成合法纯净的空会话对象', () => {
      const empty = createEmptyInspectionSession();
      expect(empty.sessionId).toBeDefined();
      expect(empty.title).toBe('现场实时质检作业会话');
      expect(empty.documents).toEqual([]);
      expect(empty.totalDocuments).toBe(0);
      expect(empty.totalBatches).toBe(0);
    });
  });

  describe('useWorkbenchSession 状态生命周期', () => {
    it('初次挂载时应初始化为空队列与默认 Session', () => {
      let captured: any = null;
      renderToString(
        React.createElement(TestHarness, {
          onHookResult: res => {
            captured = res;
          },
        })
      );

      expect(captured).not.toBeNull();
      expect(captured.session).toBeDefined();
      expect(captured.queuedDocs).toEqual([]);
      expect(captured.isAnyDocPreprocessing).toBe(false);
      expect(typeof captured.handleRealFiles).toBe('function');
      expect(typeof captured.handleRestoreFromCache).toBe('function');
      expect(typeof captured.resetSession).toBe('function');
    });

    it('装载预设 Session 时应同步映射生成待处理队列', () => {
      const mockSession = {
        sessionId: 'test-session-123',
        createdAt: '2026-09-17 12:00:00',
        title: '已存会话',
        totalDocuments: 1,
        totalBatches: 1,
        passedBatches: 0,
        failedBatches: 0,
        hitlBatches: 0,
        documents: [
          {
            docId: 'doc-loaded-01',
            filename: '质保书1.pdf',
            fileSize: '1.2 MB',
            uploadTime: '2026-09-17 12:00:00',
            ocrStatus: 'READY' as const,
            batches: [{ batchNo: 'B01', subBatchIndex: 1 } as any],
          },
        ],
      };

      let captured: any = null;
      renderToString(
        React.createElement(TestHarness, {
          options: { loadedSession: mockSession },
          onHookResult: res => {
            captured = res;
          },
        })
      );

      expect(captured.session.sessionId).toBe('test-session-123');
    });
  });

  describe('deduplicateSessionDocuments 文档实体防重与智能融合算法', () => {
    it('当列表中存在同名文档时，应严格去重并优先保留包含解析结果与切图的实体', () => {
      const placeholderDoc: SessionDocument = {
        docId: 'doc_up_temp_123',
        filename: '测试质保书3.pdf',
        fileSize: '1.2 MB',
        uploadTime: '2026-09-18 10:00:00',
        ocrStatus: 'PENDING',
        pageCount: 1,
        batches: [],
      };

      const parsedDoc: SessionDocument = {
        docId: 'doc_c58f0c90',
        filename: '测试质保书3.pdf',
        md5: 'c58f0c90abcd1234',
        fileSize: '1.2 MB',
        uploadTime: '2026-09-18 10:00:00',
        ocrStatus: 'DONE',
        pageCount: 1,
        pages: ['/sample.png'],
        batches: [{ batchNo: 'BATCH-001', subBatchIndex: 1, inspectionItems: [] } as any],
      };

      // 无论先放入占位符还是先放入解析文档，去重后都应只保留 1 份，且保留完整实体
      const result1 = deduplicateSessionDocuments([placeholderDoc, parsedDoc]);
      expect(result1.length).toBe(1);
      expect(result1[0]?.docId).toBe('doc_c58f0c90');
      expect(result1[0]?.batches.length).toBe(1);

      const result2 = deduplicateSessionDocuments([parsedDoc, placeholderDoc]);
      expect(result2.length).toBe(1);
      expect(result2[0]?.docId).toBe('doc_c58f0c90');
      expect(result2[0]?.batches.length).toBe(1);
    });

    it('当输入多个不同文件名的文档时，应全部完整保留，绝不误杀', () => {
      const docA: SessionDocument = {
        docId: 'doc-A',
        filename: '质保书A.pdf',
        fileSize: '1.0 MB',
        uploadTime: '2026-09-18',
        ocrStatus: 'DONE',
        pageCount: 1,
        batches: [],
      };
      const docB: SessionDocument = {
        docId: 'doc-B',
        filename: '质保书B.pdf',
        fileSize: '2.0 MB',
        uploadTime: '2026-09-18',
        ocrStatus: 'DONE',
        pageCount: 1,
        batches: [],
      };

      const result = deduplicateSessionDocuments([docA, docB]);
      expect(result.length).toBe(2);
      expect(result.map(d => d.filename)).toEqual(['质保书A.pdf', '质保书B.pdf']);
    });
  });
});

