import { describe, it, expect } from 'vitest';
import type { SessionDocument, BatchSpecimen } from '@/types/session';

/**
 * 提取自工作台门禁核心逻辑的纯函数规范，用于自动化契约校验
 */
interface StepGuardParams {
  currentStep: number;
  targetStep: number;
  sessionDocuments: SessionDocument[];
  queuedDocsCount: number;
  isAnyDocPreprocessing: boolean;
  hasParsingTasks: boolean;
}

interface StepGuardResult {
  canProceed: boolean;
  reason?: string;
}

function evaluateStepGuard(params: StepGuardParams): StepGuardResult {
  const { targetStep, sessionDocuments, queuedDocsCount, isAnyDocPreprocessing, hasParsingTasks } = params;

  if (targetStep === 0) {
    return { canProceed: true };
  }

  const hasAnyDocs = (sessionDocuments && sessionDocuments.length > 0) || queuedDocsCount > 0;
  if (!hasAnyDocs) {
    return { canProceed: false, reason: '请先在步骤 1 上传或选择待检验文档' };
  }

  if (isAnyDocPreprocessing) {
    return { canProceed: false, reason: '文档切图与文本正在预处理中，请稍候...' };
  }

  if (targetStep === 2) {
    const hasValidBatchData = sessionDocuments.some(d =>
      d.batches?.some((b: BatchSpecimen) => Boolean(b.grade || b.standard || (b.chemical && b.chemical.length > 0) || (b.mechanical && Object.keys(b.mechanical).length > 0)))
    );
    if (!hasValidBatchData) {
      return { canProceed: false, reason: '请先在步骤 2 核对并录入批次牌号或成分数据，再进入标准比对' };
    }
    return { canProceed: true };
  }

  if (targetStep === 1) {
    const hasParsedDocs = sessionDocuments.some(d => d.ocrStatus === 'DONE' || d.batches?.some((b: BatchSpecimen) => Boolean(b.grade || b.standard)));
    if (!hasParsingTasks && !hasParsedDocs) {
      return { canProceed: false, reason: '请点击右下角“解析文档，核对数据”以启动检验' };
    }
    return { canProceed: true };
  }

  return { canProceed: false, reason: '未知步骤' };
}

describe('全局门禁心智模型生命周期契约测试 (Step Guard Lifecycle)', () => {
  it('场景 1: 完全未上传任何文档时，禁止进入步骤 2 和步骤 3', () => {
    const resStep2 = evaluateStepGuard({
      currentStep: 0,
      targetStep: 1,
      sessionDocuments: [],
      queuedDocsCount: 0,
      isAnyDocPreprocessing: false,
      hasParsingTasks: false,
    });
    expect(resStep2.canProceed).toBe(false);
    expect(resStep2.reason).toContain('请先在步骤 1 上传');

    const resStep3 = evaluateStepGuard({
      currentStep: 0,
      targetStep: 2,
      sessionDocuments: [],
      queuedDocsCount: 0,
      isAnyDocPreprocessing: false,
      hasParsingTasks: false,
    });
    expect(resStep3.canProceed).toBe(false);
  });

  it('场景 2: 上传文档正在切图预处理中，禁止抢跑进入步骤 2 或步骤 3', () => {
    const res = evaluateStepGuard({
      currentStep: 0,
      targetStep: 1,
      sessionDocuments: [{ docId: 'doc1', filename: 'test.pdf', batches: [] } as any],
      queuedDocsCount: 1,
      isAnyDocPreprocessing: true,
      hasParsingTasks: false,
    });
    expect(res.canProceed).toBe(false);
    expect(res.reason).toContain('预处理中');
  });

  it('场景 3: 历史台账 (AuditLedger) 恢复：待处理队列为空，但 session.documents 有解析批次，必须直接放行进入步骤 3', () => {
    const historicalSessionDocs: SessionDocument[] = [
      {
        docId: 'doc_historical_01',
        filename: 'case2_tier1_to_tier2_pass.pdf',
        ocrStatus: 'DONE',
        batches: [
          {
            batchNo: 'BATCH-2026-02-PASS',
            grade: '06Cr18Ni11Ti',
            standard: 'NB/T 47019.5-2021',
            chemical: [{ element: 'C', value: '0.045' }],
          } as any,
        ],
      } as any,
    ];

    // 重点：queuedDocsCount 为 0，证明完全解耦了局部 UI 队列！
    const resStep3 = evaluateStepGuard({
      currentStep: 1,
      targetStep: 2,
      sessionDocuments: historicalSessionDocs,
      queuedDocsCount: 0,
      isAnyDocPreprocessing: false,
      hasParsingTasks: false,
    });

    expect(resStep3.canProceed).toBe(true);
    expect(resStep3.reason).toBeUndefined();
  });

  it('场景 4: 历史台账恢复后，也允许自由回退至步骤 1 或步骤 2', () => {
    const historicalSessionDocs: SessionDocument[] = [
      {
        docId: 'doc_historical_01',
        filename: 'sample.pdf',
        ocrStatus: 'DONE',
        batches: [{ batchNo: 'B1', grade: 'Q235' } as any],
      } as any,
    ];

    const resStep1 = evaluateStepGuard({
      currentStep: 2,
      targetStep: 0,
      sessionDocuments: historicalSessionDocs,
      queuedDocsCount: 0,
      isAnyDocPreprocessing: false,
      hasParsingTasks: false,
    });
    expect(resStep1.canProceed).toBe(true);

    const resStep2 = evaluateStepGuard({
      currentStep: 0,
      targetStep: 1,
      sessionDocuments: historicalSessionDocs,
      queuedDocsCount: 0,
      isAnyDocPreprocessing: false,
      hasParsingTasks: false,
    });
    expect(resStep2.canProceed).toBe(true);
  });

  it('场景 5: 文档仅切图完成尚未解析 (batches 为空)，尝试强行跳入步骤 3 时应友好拦截引导', () => {
    const unparsedDocs: SessionDocument[] = [
      {
        docId: 'doc_preprocessed_only',
        filename: 'unparsed.pdf',
        batches: [],
      } as any,
    ];

    const resStep3 = evaluateStepGuard({
      currentStep: 1,
      targetStep: 2,
      sessionDocuments: unparsedDocs,
      queuedDocsCount: 1,
      isAnyDocPreprocessing: false,
      hasParsingTasks: false,
    });

    expect(resStep3.canProceed).toBe(false);
    expect(resStep3.reason).toContain('请先在步骤 2 核对并录入批次牌号或成分数据');
  });
});
