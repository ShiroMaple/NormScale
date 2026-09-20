'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  InspectionSession,
  SessionDocument,
  BatchSpecimen,
  generateSessionId,
} from '@/types/session.ts';
import { FieldBBox } from '@/types/bbox.ts';
import { HitlDrawer } from './HitlDrawer.tsx';
import { HitlInterruptContext } from '@/workflow/state.interface.ts';
import { useDocumentParser } from '@/hooks/useDocumentParser.ts';
import { ConfidenceEvaluator } from '@/engine/confidence-evaluator.ts';
import { normalizeStandardId, areStandardCollectionsEquivalent } from '@/lib/utils.ts';
import { WaterfallWorkbenchProps, deduplicateSessionDocuments } from './workbench/types.ts';
import { WorkbenchFooterBar } from './workbench/components/WorkbenchFooterBar.tsx';
import { Step1DocumentQueuePanel } from './workbench/steps/Step1DocumentQueuePanel.tsx';
import { Step2DataVerificationPanel } from './workbench/steps/Step2DataVerificationPanel.tsx';
import { Step3ComplianceEvaluationPanel } from './workbench/steps/Step3ComplianceEvaluationPanel.tsx';
import { useWorkbenchSession } from './workbench/hooks/useWorkbenchSession.ts';
import { useReportExporter } from './workbench/hooks/useReportExporter.ts';
import { useBatchStreamAuditor } from './workbench/hooks/useBatchStreamAuditor.ts';
import { updateBatchExtractValue } from './workbench/utils/batch-field-updater.ts';

export * from './workbench/types.ts';

/**
 * NormScale 工业质检工作台 (总装轻量容器)
 * 职责：三大领域 Hook 装配组合、4 步垂直平滑滑动轨道受控挂载与全局 Footer/HitlDrawer 联动
 */
export const WaterfallWorkbench: React.FC<WaterfallWorkbenchProps> = ({
  standardsData,
  samples = [],
  selectedSampleId,
  onSelectSample,
  isAuditing,
  loadedSession,
  onSessionChange,
  initialStep = 0,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(initialStep);
  const [toastInfo, setToastInfo] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastInfo({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setToastInfo(null);
      toastTimerRef.current = null;
    }, 3500);
  }, []);

  const step1ScrollContainerRef = useRef<HTMLElement>(null);
  const rightScrollContainerRef = useRef<HTMLDivElement>(null);
  const step3ScrollContainerRef = useRef<HTMLElement>(null);
  const [canScrollTop, setCanScrollTop] = useState<boolean>(false);
  const [docBboxesMap, setDocBboxesMap] = useState<Record<string, FieldBBox[]>>({});
  const [isStreamingTerminalExpanded, setIsStreamingTerminalExpanded] = useState<boolean>(true);
  const [isHitlDrawerOpen, setIsHitlDrawerOpen] = useState<boolean>(false);
  const [activeHitlContext, setActiveHitlContext] = useState<HitlInterruptContext | undefined>(undefined);
  const [isHitlSubmitting, setIsHitlSubmitting] = useState<boolean>(false);

  // 1. 会话生命周期与文档队列管理领域 Hook
  const {
    session,
    setSession,
    queuedDocs,
    setQueuedDocs,
    selectedDocId,
    setSelectedDocId,
    selectedBatchNo,
    setSelectedBatchNo,
    cachedDocs,
    uploadedFilesMap,
    uploadedFileUrls,
    loadingScenarios,
    uploadedAgreementFile,
    setUploadedAgreementFile,
    agreementUploadError,
    setAgreementUploadError,
    isAgreementDraggingOver,
    setIsAgreementDraggingOver,
    isAnyDocPreprocessing,
    refreshCachedDocs,
    handleRemoveOrCancelDoc,
    handleRestoreFromCache,
    handleDeleteCachedDoc,
    handleRealFiles,
    runInstantPreprocess,
    handleSelectAgreementFile,
    handleLoadScenarioFile,
    resetSession,
  } = useWorkbenchSession({
    loadedSession,
    onSessionChange,
    selectedSampleId,
    onSelectSample,
    onShowToast: showToast,
    onRestoreBboxes: (docId, bboxes) => {
      setDocBboxesMap(prev => ({ ...prev, [docId]: bboxes }));
    },
  });

  useEffect(() => {
    if (loadedSession) setCurrentStep(1);
  }, [loadedSession]);

  // 当前选中实体派生
  const currentDoc: SessionDocument | undefined =
    session.documents.find(d => d.docId === selectedDocId) || session.documents[0];

  const currentBatch: BatchSpecimen | undefined =
    currentDoc?.batches.find(b => b.batchNo === selectedBatchNo) || currentDoc?.batches[0];

  const isGradeOverridden = Boolean(currentBatch?.overrideGrade && currentBatch.overrideGrade !== currentBatch.grade);
  const isStandardOverridden = Boolean(
    currentBatch?.overrideStandard !== undefined &&
    !areStandardCollectionsEquivalent(currentBatch.overrideStandard, currentBatch.standard)
  );
  const isOverridden = isGradeOverridden || isStandardOverridden;
  const activeGrade = currentBatch ? (isGradeOverridden ? currentBatch.overrideGrade! : currentBatch.grade) : '';
  const activeStandard = currentBatch ? (isStandardOverridden ? currentBatch.overrideStandard! : (currentBatch.standard || '')) : '';

  const bboxes: FieldBBox[] = useMemo(() => {
    if (!currentDoc || currentDoc.ocrStatus !== 'DONE') return [];
    return docBboxesMap[currentDoc.docId] || [];
  }, [currentDoc, docBboxesMap]);

  const totalBatchesCount = useMemo(() => {
    return session.documents.reduce((acc, d) => acc + (d.batches?.length || 0), 0);
  }, [session.documents]);

  const scenarioSamples = useMemo(() => {
    return samples.filter(s => s.category === '分层核验典型场景' || s.id.startsWith('case'));
  }, [samples]);

  // 2. 多文档异步并发解析工作池
  const handleDocumentParsed = useCallback((docId: string, parsedDoc: SessionDocument, parsedBboxes?: FieldBBox[]) => {
    setSession(prev => ({
      ...prev,
      documents: prev.documents.map(d => {
        if (d.docId !== docId) return d;
        const preservedPages = (parsedDoc.pages && parsedDoc.pages.length > 0)
          ? parsedDoc.pages
          : (d.pages && d.pages.length > 0 ? d.pages : (d.samplePages && d.samplePages.length > 0 ? d.samplePages : undefined));
        const enrichedBatches = (parsedDoc.batches || []).map(b => {
          const enriched = ConfidenceEvaluator.enrichBatchConfidences(b, parsedBboxes);
          return {
            ...enriched,
            verdict: 'UNAUDITED' as const,
            auditReport: undefined,
            overrideGrade: undefined,
            overrideStandard: undefined,
            systemVerdict: undefined,
            systemVerdictSummary: undefined,
            humanVerdict: null,
            humanVerdictSummary: undefined,
          };
        });
        return {
          ...parsedDoc,
          batches: enrichedBatches,
          docId,
          md5: parsedDoc.md5 || d.md5,
          ocrStatus: 'DONE',
          pages: preservedPages,
          samplePages: preservedPages,
        };
      }),
    }));
    if (parsedBboxes && parsedBboxes.length > 0) {
      setDocBboxesMap(prev => ({
        ...prev,
        [docId]: parsedBboxes,
        [parsedDoc.docId]: parsedBboxes,
      }));
    }
    if (parsedDoc.batches && parsedDoc.batches.length > 0) {
      setBatchPresentationMap(prev => {
        const next = { ...prev };
        for (const b of parsedDoc.batches) delete next[b.batchNo];
        return next;
      });
      const firstBatchNo = parsedDoc.batches[0]?.batchNo;
      if (firstBatchNo) setSelectedBatchNo(firstBatchNo);
    }
    batchEvaluatingKeyRef.current = '';
    batchRunCountersRef.current = {};
    Object.values(batchAbortControllersRef.current).forEach(c => c.abort('DOCUMENT_REPARSED'));
    batchAbortControllersRef.current = {};
  }, [setSession, setSelectedBatchNo]);

  const {
    tasks: parsingTasks,
    sessionMetrics,
    lastError,
    startParsingSession,
    reparseDocument,
  } = useDocumentParser(handleDocumentParsed);

  // 3. 步骤 3 全景合规流式比对调度与人机协同领域 Hook
  const {
    batchPresentationMap,
    setBatchPresentationMap,
    isEvaluatingBatch,
    setAuditMetrics,
    totalCombinedMetrics,
    dynamicStandardsCatalog,
    selectedStandardIds,
    batchEvaluatingKeyRef,
    batchRunCountersRef,
    batchAbortControllersRef,
    evaluateBatches,
    handleResolveHitl,
    handleInlineAdoptHitl,
  } = useBatchStreamAuditor({
    session,
    setSession,
    selectedDocId,
    selectedBatchNo,
    standardsData,
    activeStandard,
    currentBatch,
    sessionMetrics,
    showToast,
    onOpenHitlDrawer: (ctx) => {
      setActiveHitlContext(ctx);
      setIsHitlDrawerOpen(true);
    },
  });

  // 4. 报告导出与台账存证领域 Hook
  const {
    isCapturing,
    handleSaveCurrentBatchScreenshot,
    handleSaveCurrentDocAllBatchesScreenshot,
    handleSaveSessionAllBatchesScreenshot,
    handleSaveSessionResults,
  } = useReportExporter({
    session,
    currentDoc,
    currentBatch,
    selectedDocId,
    selectedBatchNo,
    setSelectedDocId,
    setSelectedBatchNo,
    showToast,
  });

  // 流式终端展开折叠联动
  const prevDocStatusMap = useRef<Record<string, string>>({});
  const currentDocTask = parsingTasks[selectedDocId];
  useEffect(() => {
    if (!currentDocTask) return undefined;
    const prevStatus = prevDocStatusMap.current[selectedDocId];
    if (prevStatus === 'parsing' && currentDocTask.status === 'ready') {
      const timer = setTimeout(() => setIsStreamingTerminalExpanded(false), 800);
      return () => clearTimeout(timer);
    }
    prevDocStatusMap.current[selectedDocId] = currentDocTask.status;
    return undefined;
  }, [currentDocTask, selectedDocId]);

  useEffect(() => {
    if (currentDocTask && currentDocTask.status === 'parsing') {
      setIsStreamingTerminalExpanded(true);
    }
  }, [selectedDocId, currentDocTask?.status]);

  useEffect(() => {
    if (lastError) showToast(lastError, 'error');
  }, [lastError, showToast]);

  // 步骤 3 自动触发未比对批次核验
  useEffect(() => {
    if (currentStep !== 2 || !currentDoc || currentDoc.batches.length === 0) return;
    if (!selectedStandardIds || selectedStandardIds.length === 0) return;
    const pendingBatches = currentDoc.batches.filter(b => !b.auditReport || b.verdict === 'UNAUDITED');
    if (pendingBatches.length === 0) return;
    const batchSignature = `${selectedDocId}:${pendingBatches.map(b => b.batchNo).sort().join(',')}`;
    if (batchEvaluatingKeyRef.current === batchSignature) return;
    batchEvaluatingKeyRef.current = batchSignature;
    evaluateBatches(pendingBatches);
  }, [currentStep, selectedDocId, currentDoc, selectedStandardIds, evaluateBatches, batchEvaluatingKeyRef]);

  // 步骤流转守卫
  const goToStep = useCallback((stepIdx: number) => {
    if (stepIdx > 0) {
      const hasAnyDocs = (session.documents && session.documents.length > 0) || queuedDocs.length > 0;
      if (!hasAnyDocs) {
        showToast('请先在步骤 1 上传或选择待检验文档', 'info');
        return;
      }
      if (isAnyDocPreprocessing) {
        showToast('文档切图与文本正在预处理中，请稍候...', 'info');
        return;
      }
      if (stepIdx === 2) {
        const hasValidBatchData = session.documents?.some(d =>
          d.batches?.some(b => Boolean(b.grade || b.standard || (b.chemical && b.chemical.length > 0) || (b.mechanical && b.mechanical.length > 0)))
        );
        if (!hasValidBatchData) {
          showToast('请先在步骤 2 核对并录入批次牌号或成分数据，再进入标准比对', 'info');
          return;
        }
      } else if (stepIdx === 1) {
        const hasAnyTask = Object.keys(parsingTasks).length > 0;
        const hasParsedDocs = session.documents?.some(d => d.ocrStatus === 'DONE' || d.batches?.some(b => Boolean(b.grade || b.standard)));
        if (!hasAnyTask && !hasParsedDocs) {
          showToast('请点击右下角“解析文档，核对数据”以启动检验', 'info');
          return;
        }
      }
    }
    if (stepIdx >= 0 && stepIdx <= 3) {
      setCurrentStep(stepIdx);
    }
  }, [session.documents, queuedDocs.length, isAnyDocPreprocessing, parsingTasks, showToast]);

  // 监听主滚动容器驱动返回顶部按钮可用状态
  useEffect(() => {
    let targetEl: HTMLElement | null = null;
    if (currentStep === 2) targetEl = step3ScrollContainerRef.current;
    else if (currentStep === 1) targetEl = rightScrollContainerRef.current;
    else if (currentStep === 0) targetEl = step1ScrollContainerRef.current;

    if (!targetEl) {
      setCanScrollTop(false);
      return;
    }
    const checkScroll = () => {
      if (targetEl) setCanScrollTop(targetEl.scrollTop > 80);
    };
    checkScroll();
    targetEl.addEventListener('scroll', checkScroll, { passive: true });
    return () => targetEl?.removeEventListener('scroll', checkScroll);
  }, [currentStep]);

  const handleScrollToTop = useCallback(() => {
    let targetEl: HTMLElement | null = null;
    if (currentStep === 2) targetEl = step3ScrollContainerRef.current;
    else if (currentStep === 1) targetEl = rightScrollContainerRef.current;
    else if (currentStep === 0) targetEl = step1ScrollContainerRef.current;
    if (targetEl) targetEl.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  // 单批次比对封装
  const evaluateBatch = useCallback(async (batchToEval?: BatchSpecimen, forcedStdIds?: string[]) => {
    const target = batchToEval || currentBatch;
    if (!target) return;
    await evaluateBatches([target], forcedStdIds);
  }, [currentBatch, evaluateBatches]);

  // 恢复默认原件规格切片
  const handleResetGrade = useCallback(() => {
    if (!currentBatch) return;
    const cleanBatch: BatchSpecimen = {
      ...currentBatch,
      overrideGrade: undefined,
      overrideStandard: undefined,
      auditReport: undefined,
      verdict: 'UNAUDITED',
      systemVerdict: undefined,
      systemVerdictSummary: undefined,
      humanVerdict: null,
      humanVerdictSummary: undefined,
    };
    setSession(prev => ({
      ...prev,
      documents: prev.documents.map(doc => {
        if (doc.docId !== selectedDocId) return doc;
        return {
          ...doc,
          batches: doc.batches.map(b => (b.batchNo === selectedBatchNo ? cleanBatch : b)),
        };
      }),
    }));
    if (selectedBatchNo) {
      setBatchPresentationMap(prev => {
        const next = { ...prev };
        delete next[selectedBatchNo];
        return next;
      });
    }
    batchEvaluatingKeyRef.current = '';
    evaluateBatch(cleanBatch);
  }, [currentBatch, evaluateBatch, selectedBatchNo, selectedDocId, setBatchPresentationMap, setSession, batchEvaluatingKeyRef]);

  // 切换执行标准
  const handleToggleStandard = useCallback((stdId: string) => {
    let newSelected: string[];
    const targetNorm = normalizeStandardId(stdId);
    const existingIndex = selectedStandardIds.findIndex(s => normalizeStandardId(s) === targetNorm);

    const isListedInCatalog = (id: string) => {
      const idNorm = normalizeStandardId(id);
      return dynamicStandardsCatalog.some(s =>
        normalizeStandardId(s.id) === idNorm ||
        normalizeStandardId(s.shortCode) === idNorm
      );
    };

    if (existingIndex >= 0) {
      newSelected = selectedStandardIds.filter((_, idx) => idx !== existingIndex);
    } else {
      // 勾选新标准：若当前已选列表仅包含未入库标准，点击收录标准时平滑替换
      const listedCurrent = selectedStandardIds.filter(isListedInCatalog);
      if (listedCurrent.length === 0) {
        newSelected = [stdId];
      } else {
        newSelected = [...listedCurrent, stdId];
      }
    }

    const newStandardStr = newSelected.join('、');
    setSession(prev => ({
      ...prev,
      documents: prev.documents.map(doc => {
        if (doc.docId !== selectedDocId) return doc;
        return {
          ...doc,
          batches: doc.batches.map(b => {
            const isEquiv = areStandardCollectionsEquivalent(newSelected, b.standard);
            return {
              ...b,
              overrideStandard: isEquiv ? undefined : (newSelected.length === 0 ? '' : newStandardStr),
              auditReport: undefined,
              verdict: 'UNAUDITED' as const,
            };
          }),
        };
      }),
    }));

    if (selectedBatchNo) {
      setBatchPresentationMap(prev => ({
        ...prev,
        [selectedBatchNo]: {
          ...(prev[selectedBatchNo] || { batchNo: selectedBatchNo }),
          stage: 'idle',
          error: undefined,
        },
      }));
    }
    batchEvaluatingKeyRef.current = '';
  }, [dynamicStandardsCatalog, selectedBatchNo, selectedDocId, selectedStandardIds, setBatchPresentationMap, setSession, batchEvaluatingKeyRef]);

  // 人工复核判定
  const handleSetHumanVerdict = useCallback((humanDecision: 'PASS' | 'REJECT' | null) => {
    setSession(prev => ({
      ...prev,
      documents: prev.documents.map(doc => {
        if (doc.docId !== selectedDocId) return doc;
        return {
          ...doc,
          batches: doc.batches.map(b => {
            if (b.batchNo !== selectedBatchNo) return b;
            return {
              ...b,
              humanVerdict: humanDecision,
              humanVerdictSummary: humanDecision === 'PASS'
                ? '质检工程师人工核准通过'
                : humanDecision === 'REJECT'
                  ? '质检工程师人工标记拒收'
                  : undefined,
              humanVerifiedAt: humanDecision ? new Date().toISOString() : undefined,
            };
          }),
        };
      }),
    }));
  }, [selectedDocId, selectedBatchNo, setSession]);

  // 触发打开 HITL 抽屉
  const handleTriggerHitl = useCallback(() => {
    if (!currentBatch) return;
    const existingCtx = batchPresentationMap[currentBatch.batchNo]?.hitlContext;
    const reason: HitlInterruptContext['reason'] = existingCtx?.reason || currentBatch.hitlReason || (
      currentBatch.grade.includes('Special') || currentBatch.grade.includes('SUS') || currentBatch.grade.includes('未知')
        ? 'UNKNOWN_GRADE'
        : 'ALTERNATIVE_CLAUSE'
    );
    const ctx: HitlInterruptContext = {
      ...existingCtx,
      reason,
      prompt_message: existingCtx?.prompt_message || currentBatch.systemVerdictSummary || currentBatch.verdictSummary || '触发人机协同规则阻断，需人工介入核实',
      batch_no: currentBatch.batchNo,
      candidate_grades: existingCtx?.candidate_grades,
      suggestions: existingCtx?.suggestions,
    };
    setActiveHitlContext(ctx);
    setIsHitlDrawerOpen(true);
  }, [currentBatch, batchPresentationMap]);

  // 步骤 2 提取数据原位校准
  const handleUpdateExtractValue = useCallback((fieldId: string, newValue: string) => {
    setSession(prev => ({
      ...prev,
      documents: prev.documents.map(doc => {
        if (doc.docId !== selectedDocId) return doc;
        return {
          ...doc,
          batches: doc.batches.map(b => (b.batchNo === selectedBatchNo ? updateBatchExtractValue(b, fieldId, newValue, bboxes) : b)),
        };
      }),
    }));
  }, [bboxes, selectedBatchNo, selectedDocId, setSession]);

  // 从 Step 1 创建并推进至 Step 2
  const handleStartNewSessionAndAdvance = useCallback(() => {
    if (queuedDocs.length === 0) {
      showToast('待处理队列为空，请先上传文档或从历史缓存选择', 'error');
      return;
    }
    if (isAnyDocPreprocessing) {
      showToast('文档切图与文本正在预处理中，请稍候...', 'info');
      return;
    }
    let activeDocs = session.documents.filter(d =>
      queuedDocs.some(q => q.id === d.docId || (q.md5 && d.docId === `doc_${q.md5.slice(0, 8)}`))
    );
    if (activeDocs.length === 0 && session.documents.length > 0) activeDocs = session.documents;

    // 实体防重：基于 md5 或 filename 严格去重，若存在重复则优先保留包含批次/切图的完整文档实体
    activeDocs = deduplicateSessionDocuments(activeDocs);

    if (activeDocs.length === 0) {
      showToast('队列中暂无有效待解析文档', 'error');
      return;
    }

    let hasReprocessingTriggered = false;
    const missingResourceDocNames: string[] = [];
    for (const doc of activeDocs) {
      const hasPages = Array.isArray(doc.pages) && doc.pages.length > 0;
      if (!hasPages) {
        const rawFile = uploadedFilesMap[doc.docId];
        if (rawFile) {
          hasReprocessingTriggered = true;
          setQueuedDocs(prev => prev.map(q => q.id === doc.docId ? { ...q, status: '预处理中...' } : q));
          showToast(`检测到文档 [${doc.filename}] 切图产物缺失，正在自动重新生成...`, 'info');
          runInstantPreprocess(rawFile, doc.docId, uploadedFileUrls[doc.docId]);
        } else {
          missingResourceDocNames.push(doc.filename);
          setQueuedDocs(prev => prev.filter(q => q.id !== doc.docId));
          setSession(prev => ({ ...prev, documents: prev.documents.filter(d => d.docId !== doc.docId) }));
        }
      }
    }
    if (missingResourceDocNames.length > 0) {
      showToast(`文档 [${missingResourceDocNames.join(', ')}] 产物与原件资源均缺失，已从队列中移除，请重新上传`, 'error');
      return;
    }
    if (hasReprocessingTriggered) return;

    const newSession: InspectionSession = {
      sessionId: generateSessionId(),
      createdAt: new Date().toLocaleString(),
      title: `工作台录入批次 · 共 ${activeDocs.length} 份文档检验`,
      totalDocuments: activeDocs.length,
      totalBatches: activeDocs.reduce((acc, d) => acc + d.batches.length, 0),
      passedBatches: activeDocs.reduce((acc, d) => acc + d.batches.filter(b => b.verdict === 'PASS').length, 0),
      failedBatches: activeDocs.reduce((acc, d) => acc + d.batches.filter(b => b.verdict === 'FAIL').length, 0),
      hitlBatches: activeDocs.reduce((acc, d) => acc + d.batches.filter(b => b.verdict === 'MANUAL_REVIEW').length, 0),
      documents: activeDocs,
    };
    setSession(newSession);
    const firstDoc = activeDocs[0];
    if (firstDoc) {
      setSelectedDocId(firstDoc.docId);
      if (firstDoc.batches[0]) setSelectedBatchNo(firstDoc.batches[0].batchNo);
    }
    startParsingSession(activeDocs, uploadedFilesMap);
    setAuditMetrics({ batchRecords: {}, historical: { durationMs: 0, inputTokens: 0, outputTokens: 0 } });
    setIsStreamingTerminalExpanded(true);
    setCurrentStep(1);
  }, [isAnyDocPreprocessing, queuedDocs, runInstantPreprocess, session.documents, setAuditMetrics, setQueuedDocs, setSelectedBatchNo, setSelectedDocId, setSession, showToast, startParsingSession, uploadedFileUrls, uploadedFilesMap]);

  // 开启新任务并归档
  const handleStartNewTask = useCallback(() => {
    handleSaveSessionResults(true);
    resetSession();
    setDocBboxesMap({});
    batchRunCountersRef.current = {};
    Object.values(batchAbortControllersRef.current).forEach(c => c.abort('NEW_TASK_STARTED'));
    batchAbortControllersRef.current = {};
    setAuditMetrics({ batchRecords: {}, historical: { durationMs: 0, inputTokens: 0, outputTokens: 0 } });
    goToStep(0);
    showToast('已自动归档当前检验结果，已为您开启新任务', 'success');
  }, [goToStep, handleSaveSessionResults, resetSession, setAuditMetrics, showToast, batchAbortControllersRef, batchRunCountersRef]);

  // 动态提取 HITL 候选规则
  const candidateRulesForHitl = useMemo(() => {
    const targetReport = currentBatch?.auditReport || (selectedBatchNo ? batchPresentationMap[selectedBatchNo]?.report : undefined);
    if (targetReport && Array.isArray(targetReport.item_results) && targetReport.item_results.length > 0) {
      return targetReport.item_results.map(r => ({
        key: r.property_key,
        name: r.display_name,
        category: r.category,
        requirement_text: r.dual_standard_requirement_text || r.standard_requirement_text,
        unit: (r as any).unit || '',
      }));
    }
    return undefined;
  }, [currentBatch, batchPresentationMap, selectedBatchNo]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden relative">
      {toastInfo && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md transition-all animate-bounce-in border text-xs font-bold bg-inverse-surface text-inverse-on-surface border-outline-variant/30">
          <span className={`material-symbols-outlined text-base ${toastInfo.type === 'success' ? 'text-emerald-400' : toastInfo.type === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
            {toastInfo.type === 'success' ? 'check_circle' : toastInfo.type === 'error' ? 'error' : 'info'}
          </span>
          <span>{toastInfo.message}</span>
        </div>
      )}

      {/* 4 步受控垂直滑动主容器 */}
      <div className="flex-1 w-full overflow-hidden relative">
        <div
          className="w-full h-full flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]"
          style={{ transform: `translateY(-${currentStep * 100}%)` }}
        >
          {/* 步骤 1: 批量质保证书录入 */}
          <Step1DocumentQueuePanel
            scrollContainerRef={step1ScrollContainerRef}
            onSelectRealFiles={handleRealFiles}
            queuedDocs={queuedDocs}
            selectedDocId={selectedDocId}
            selectedSampleId={selectedSampleId}
            onSelectDoc={docId => {
              setSelectedDocId(docId);
              const matchedDoc = session.documents.find(d => d.docId === docId);
              if (matchedDoc && matchedDoc.batches[0]) setSelectedBatchNo(matchedDoc.batches[0].batchNo);
              onSelectSample?.(docId);
            }}
            onRemoveOrCancelDoc={handleRemoveOrCancelDoc}
            isAuditing={isAuditing}
            uploadedAgreementFile={uploadedAgreementFile}
            agreementUploadError={agreementUploadError}
            isAgreementDraggingOver={isAgreementDraggingOver}
            setIsAgreementDraggingOver={setIsAgreementDraggingOver}
            onSelectAgreementFile={handleSelectAgreementFile}
            onRemoveAgreementFile={() => {
              setUploadedAgreementFile(null);
              setAgreementUploadError(null);
            }}
            cachedDocs={cachedDocs}
            onRestoreFromCache={handleRestoreFromCache}
            onDeleteCachedDoc={handleDeleteCachedDoc}
            onRefreshCachedDocs={refreshCachedDocs}
            scenarioSamples={scenarioSamples}
            loadingScenarios={loadingScenarios}
            onLoadScenarioFile={handleLoadScenarioFile}
          />

          {/* 步骤 2: 数据核验 */}
          <Step2DataVerificationPanel
            session={session}
            selectedDocId={selectedDocId}
            selectedBatchNo={selectedBatchNo}
            onSelectDoc={setSelectedDocId}
            onSelectBatch={(docId, batchNo) => {
              setSelectedDocId(docId);
              setSelectedBatchNo(batchNo);
            }}
            currentDoc={currentDoc}
            currentBatch={currentBatch}
            parsingTasks={parsingTasks}
            totalCombinedMetrics={totalCombinedMetrics}
            isStreamingTerminalExpanded={isStreamingTerminalExpanded}
            onToggleStreamingTerminal={() => setIsStreamingTerminalExpanded(!isStreamingTerminalExpanded)}
            onReparseDocument={() => {
              if (selectedBatchNo) {
                setBatchPresentationMap(prev => {
                  const next = { ...prev };
                  delete next[selectedBatchNo];
                  return next;
                });
              }
              reparseDocument(selectedDocId);
            }}
            bboxes={bboxes}
            onUpdateBatchNo={(newBatchNo) => {
              setSession(prev => ({
                ...prev,
                documents: prev.documents.map(d => {
                  if (d.docId !== selectedDocId) return d;
                  return { ...d, batches: d.batches.map(b => (b.batchNo === selectedBatchNo ? { ...b, batchNo: newBatchNo } : b)) };
                }),
              }));
              setSelectedBatchNo(newBatchNo);
            }}
            onUpdateExtractValue={handleUpdateExtractValue}
            onGoToStep={goToStep}
            scrollContainerRef={rightScrollContainerRef}
          />

          {/* 步骤 3: 比对执行标准 */}
          <Step3ComplianceEvaluationPanel
            session={session}
            selectedDocId={selectedDocId}
            selectedBatchNo={selectedBatchNo}
            onSelectDoc={setSelectedDocId}
            onSelectBatch={(docId, batchNo) => {
              setSelectedDocId(docId);
              setSelectedBatchNo(batchNo);
            }}
            currentDoc={currentDoc}
            currentBatch={currentBatch}
            activeGrade={activeGrade}
            activeStandard={activeStandard}
            isGradeOverridden={isGradeOverridden}
            isStandardOverridden={isStandardOverridden}
            isOverridden={isOverridden}
            isEvaluatingBatch={isEvaluatingBatch}
            onEvaluateBatch={evaluateBatch}
            onResetGrade={handleResetGrade}
            dynamicStandardsCatalog={dynamicStandardsCatalog}
            selectedStandardIds={selectedStandardIds}
            onToggleStandard={handleToggleStandard}
            batchPresentationMap={batchPresentationMap}
            onInlineAdoptHitl={handleInlineAdoptHitl}
            onTriggerHitl={handleTriggerHitl}
            onSetHumanVerdict={handleSetHumanVerdict}
            onGoToStep={goToStep}
            scrollContainerRef={step3ScrollContainerRef}
            parsingTasks={parsingTasks}
            totalCombinedMetrics={totalCombinedMetrics}
            isCapturing={isCapturing}
          />
        </div>
      </div>

      {/* 底部常驻连线导航条 */}
      <WorkbenchFooterBar
        currentStep={currentStep}
        onGoToStep={goToStep}
        queuedDocsCount={queuedDocs.length}
        isAnyDocPreprocessing={isAnyDocPreprocessing}
        onStartNewSessionAndAdvance={handleStartNewSessionAndAdvance}
        isCapturing={isCapturing}
        currentBatchNo={currentBatch?.batchNo}
        currentDocBatchesCount={currentDoc?.batches?.length || 0}
        totalBatchesCount={totalBatchesCount}
        sessionDocsCount={session.documents?.length || 0}
        onSaveCurrentBatchScreenshot={handleSaveCurrentBatchScreenshot}
        onSaveCurrentDocAllBatchesScreenshot={handleSaveCurrentDocAllBatchesScreenshot}
        onSaveSessionAllBatchesScreenshot={handleSaveSessionAllBatchesScreenshot}
        onStartNewTask={handleStartNewTask}
        onSaveSessionResults={() => handleSaveSessionResults(false)}
        canScrollTop={canScrollTop}
        onScrollToTop={handleScrollToTop}
      />

      {/* HITL 人机协同侧边抽屉 */}
      <HitlDrawer
        isOpen={isHitlDrawerOpen}
        onClose={() => {
          setIsHitlDrawerOpen(false);
          setActiveHitlContext(undefined);
        }}
        hitlContext={activeHitlContext}
        taskId={
          (selectedBatchNo && batchPresentationMap[selectedBatchNo]?.taskId)
            ? `TK-${batchPresentationMap[selectedBatchNo]!.taskId!}`
            : (currentBatch ? `TK-${currentBatch.batchNo}` : 'TK-PENDING')
        }
        selectedStandardIds={selectedStandardIds}
        availableStandards={standardsData?.standards}
        candidateRules={candidateRulesForHitl}
        onSubmitResume={async (correction) => {
          setIsHitlSubmitting(true);
          try {
            await handleResolveHitl(correction);
            setIsHitlDrawerOpen(false);
            setActiveHitlContext(undefined);
          } finally {
            setIsHitlSubmitting(false);
          }
        }}
        isSubmitting={isHitlSubmitting}
      />
    </div>
  );
};
