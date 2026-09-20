'use client';

import React, { useState, useRef, useMemo, useCallback } from 'react';
import { apiClient } from '@/lib/api-client.ts';
import { InspectionSession, BatchSpecimen } from '@/types/session.ts';
import { AuditReport } from '@/schemas/report.schema.ts';
import { HitlInterruptContext, HumanCorrectionInput } from '@/workflow/state.interface.ts';
import { normalizeStandardId } from '@/lib/utils.ts';
import {
  StandardCatalogItem,
  StandardCatalogEmptyError,
  BatchPresentationState,
  AuditMetricsState,
  TotalCombinedMetrics,
} from '../types.ts';

export interface UseBatchStreamAuditorOptions {
  session: InspectionSession;
  setSession: React.Dispatch<React.SetStateAction<InspectionSession>>;
  selectedDocId: string;
  selectedBatchNo: string;
  standardsData?: {
    total_standards: number;
    total_slices: number;
    standards: any[];
  };
  activeStandard: string;
  currentBatch?: BatchSpecimen;
  sessionMetrics: {
    totalDurationSeconds: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    activeConcurrency?: number;
    readyDocsCount?: number;
    totalDocsCount?: number;
  };
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onOpenHitlDrawer?: (ctx: HitlInterruptContext) => void;
}

export interface UseBatchStreamAuditorReturn {
  batchPresentationMap: Record<string, BatchPresentationState>;
  setBatchPresentationMap: React.Dispatch<React.SetStateAction<Record<string, BatchPresentationState>>>;
  isEvaluatingBatch: boolean;
  setIsEvaluatingBatch: React.Dispatch<React.SetStateAction<boolean>>;
  auditMetrics: AuditMetricsState;
  setAuditMetrics: React.Dispatch<React.SetStateAction<AuditMetricsState>>;
  totalCombinedMetrics: TotalCombinedMetrics;
  dynamicStandardsCatalog: StandardCatalogItem[];
  selectedStandardIds: string[];
  batchEvaluatingKeyRef: React.MutableRefObject<string>;
  batchRunCountersRef: React.MutableRefObject<Record<string, number>>;
  batchAbortControllersRef: React.MutableRefObject<Record<string, AbortController>>;
  isReevaluatingCooldownRef: React.MutableRefObject<boolean>;
  nextBatchRunId: (batchNo: string) => string;
  evaluateBatches: (batchesToEval: BatchSpecimen[], forcedStdIds?: string[]) => Promise<void>;
  handleResolveHitl: (correction: HumanCorrectionInput) => Promise<void>;
  handleInlineAdoptProperty: (batchNo: string, rawKey: string, resolvedKey: string) => Promise<void>;
  handleInlineAdoptHitl: (batchNo: string, ctx?: HitlInterruptContext) => Promise<void>;
}

/**
 * 辅助函数：根据后端 standardsData 派生标准目录单源真相
 */
function deriveStandardCatalog(standardsData?: { standards: any[] }): StandardCatalogItem[] {
  if (!standardsData || !Array.isArray(standardsData.standards) || standardsData.standards.length === 0) {
    return [];
  }
  return standardsData.standards.map(std => {
    const isOrdering = Boolean(
      std.standard_name?.includes('订货') ||
      std.category === 'ordering' ||
      std.standard_type === 'ordering_requirement'
    );
    return {
      id: std.standard_id,
      shortCode: std.standard_id?.split(/[-_]/)[0]?.trim() || std.standard_id,
      name: std.standard_name,
      category: isOrdering ? '承压订货技术条件' : '产品制造通用标准',
      badgeColor: isOrdering
        ? 'text-amber-700 bg-amber-50 dark:bg-amber-950/70 border-amber-300 dark:border-amber-700'
        : 'text-blue-700 bg-blue-50 dark:bg-blue-950/70 border-blue-300 dark:border-blue-700',
      grades: (std.available_slices || []).map((sliceKey: string) => ({
        code: sliceKey,
        primaryGrade: sliceKey,
        display: sliceKey,
        description: `${std.standard_id} 规格切片`,
      })),
    };
  });
}

/**
 * 辅助函数：解析批次声明标准，容错修复空格并规范化标准 ID
 */
function resolveStandardIds(activeStandard: string, catalog: StandardCatalogItem[]): string[] {
  const rawList = activeStandard.split(/[、,，;；\n]+/).map(s => s.trim()).filter(Boolean);
  const sanitized: string[] = [];
  let i = 0;
  while (i < rawList.length) {
    const current = rawList[i]!;
    const currentNorm = normalizeStandardId(current);
    const matched = catalog.find(s => normalizeStandardId(s.id) === currentNorm || normalizeStandardId(s.shortCode) === currentNorm);
    if (matched) {
      if (!sanitized.some(s => normalizeStandardId(s) === normalizeStandardId(matched.id))) sanitized.push(matched.id);
      i++;
      continue;
    }
    if (i + 1 < rawList.length) {
      const combined = `${current} ${rawList[i + 1]}`;
      const combinedNorm = normalizeStandardId(combined);
      const combinedMatch = catalog.find(s => normalizeStandardId(s.id) === combinedNorm || normalizeStandardId(s.shortCode) === combinedNorm);
      if (combinedMatch) {
        if (!sanitized.some(s => normalizeStandardId(s) === normalizeStandardId(combinedMatch.id))) sanitized.push(combinedMatch.id);
        i += 2;
        continue;
      }
    }
    if (!sanitized.some(s => normalizeStandardId(s) === currentNorm)) sanitized.push(current);
    i++;
  }
  if (sanitized.length > 0) return sanitized;
  const defaultStdId = catalog[0]?.id;
  return defaultStdId ? [defaultStdId] : [];
}

/**
 * 辅助函数：计算 Session 综合耗时与 Token 开销（单调递增）
 */
function calculateCombinedMetrics(
  sessionMetrics: UseBatchStreamAuditorOptions['sessionMetrics'],
  auditMetrics: AuditMetricsState
): TotalCombinedMetrics {
  let auditDurMs = auditMetrics.historical.durationMs;
  let auditInTokens = auditMetrics.historical.inputTokens;
  let auditOutTokens = auditMetrics.historical.outputTokens;

  Object.values(auditMetrics.batchRecords).forEach(rec => {
    auditDurMs += rec.durationMs || 0;
    auditInTokens += rec.inputTokens || 0;
    auditOutTokens += rec.outputTokens || 0;
  });

  const auditDurationSec = auditDurMs / 1000;
  const parseDurationSec = sessionMetrics.totalDurationSeconds;
  const totalDurationSec = parseFloat((parseDurationSec + auditDurationSec).toFixed(1));

  return {
    totalInputTokens: sessionMetrics.totalInputTokens + auditInTokens,
    totalOutputTokens: sessionMetrics.totalOutputTokens + auditOutTokens,
    totalDurationSeconds: totalDurationSec,
    parseInputTokens: sessionMetrics.totalInputTokens,
    parseOutputTokens: sessionMetrics.totalOutputTokens,
    parseDurationSeconds: parseDurationSec,
    auditInputTokens: auditInTokens,
    auditOutputTokens: auditOutTokens,
    auditDurationSeconds: parseFloat(auditDurationSec.toFixed(1)),
    activeConcurrency: sessionMetrics.activeConcurrency ?? 0,
    readyDocsCount: sessionMetrics.readyDocsCount ?? 0,
    totalDocsCount: sessionMetrics.totalDocsCount ?? 0,
  };
}

/**
 * 质检工作台批次合规流式比对调度领域 Hook (useBatchStreamAuditor)
 * 职责：调度 Tier 1/2/3 多阶段并发比对、版本令牌防幽灵覆盖、防重锁控制与人机协同挂起采纳
 */
export function useBatchStreamAuditor({
  session,
  setSession,
  selectedDocId,
  selectedBatchNo,
  standardsData,
  activeStandard,
  currentBatch,
  sessionMetrics,
  showToast,
  onOpenHitlDrawer,
}: UseBatchStreamAuditorOptions): UseBatchStreamAuditorReturn {
  const [isEvaluatingBatch, setIsEvaluatingBatch] = useState<boolean>(false);
  const [batchPresentationMap, setBatchPresentationMap] = useState<Record<string, BatchPresentationState>>({});
  const [auditMetrics, setAuditMetrics] = useState<AuditMetricsState>({
    batchRecords: {},
    historical: { durationMs: 0, inputTokens: 0, outputTokens: 0 },
  });

  const batchEvaluatingKeyRef = useRef<string>('');
  const batchRunCountersRef = useRef<Record<string, number>>({});
  const batchAbortControllersRef = useRef<Record<string, AbortController>>({});
  const isReevaluatingCooldownRef = useRef<boolean>(false);

  const nextBatchRunId = useCallback((batchNo: string): string => {
    const current = batchRunCountersRef.current[batchNo] || 0;
    const next = current + 1;
    batchRunCountersRef.current[batchNo] = next;
    return `RUN-${next}`;
  }, []);

  const dynamicStandardsCatalog = useMemo(() => deriveStandardCatalog(standardsData), [standardsData]);
  const selectedStandardIds = useMemo(() => resolveStandardIds(activeStandard, dynamicStandardsCatalog), [activeStandard, dynamicStandardsCatalog]);
  const totalCombinedMetrics = useMemo(() => calculateCombinedMetrics(sessionMetrics, auditMetrics), [sessionMetrics, auditMetrics]);

  // 更新指定批次开销度量
  const updateBatchAuditMetrics = useCallback((bNo: string, durMs?: number, tokUsage?: any) => {
    if (durMs === undefined && !tokUsage) return;
    setAuditMetrics(prev => ({
      ...prev,
      batchRecords: {
        ...prev.batchRecords,
        [bNo]: {
          durationMs: durMs ?? prev.batchRecords[bNo]?.durationMs ?? 0,
          inputTokens: tokUsage?.promptTokens ?? prev.batchRecords[bNo]?.inputTokens ?? 0,
          outputTokens: tokUsage?.completionTokens ?? prev.batchRecords[bNo]?.outputTokens ?? 0,
        },
      },
    }));
  }, []);

  // 更新 Session 中指定批次的核验判定产物
  const applyVerdictToSession = useCallback((batchNo: string, report: AuditReport, summaryText: string, isPass: boolean) => {
    setSession(prev => ({
      ...prev,
      documents: prev.documents.map(d => {
        if (d.docId !== selectedDocId) return d;
        return {
          ...d,
          batches: d.batches.map(b => {
            if (b.batchNo !== batchNo) return b;
            return {
              ...b,
              auditReport: report,
              verdict: isPass ? 'PASS' : 'FAIL',
              verdictSummary: summaryText,
              systemVerdict: isPass ? 'PASS' : 'FAIL',
              systemVerdictSummary: summaryText,
            };
          }),
        };
      }),
    }));
  }, [selectedDocId, setSession]);

  // 核心批次流式并发比对调度器
  const evaluateBatches = useCallback(async (batchesToEval: BatchSpecimen[], forcedStdIds?: string[]) => {
    if (!batchesToEval || batchesToEval.length === 0) return;
    const stdIds = forcedStdIds || selectedStandardIds;

    if (dynamicStandardsCatalog.length === 0 && (!standardsData?.standards || standardsData.standards.length === 0)) {
      const errorMsg = '[StandardCatalogEmptyError] 执行标准规则库未初始化或加载为空，无法对批次发起合规检验。';
      console.error(errorMsg);
      showToast('标准规则库未就绪，无法发起智能比对', 'error');
      setIsEvaluatingBatch(false);
      throw new StandardCatalogEmptyError(errorMsg);
    }

    setBatchPresentationMap(prev => {
      const next = { ...prev };
      for (const b of batchesToEval) {
        next[b.batchNo] = { ...prev[b.batchNo], batchNo: b.batchNo, stage: 'tier1_evaluating', error: undefined };
      }
      return next;
    });

    setAuditMetrics(prev => {
      let addDurMs = 0;
      let addIn = 0;
      let addOut = 0;
      const nextBatchRecords = { ...prev.batchRecords };
      for (const b of batchesToEval) {
        const oldRec = nextBatchRecords[b.batchNo];
        if (oldRec) {
          addDurMs += oldRec.durationMs || 0;
          addIn += oldRec.inputTokens || 0;
          addOut += oldRec.outputTokens || 0;
          delete nextBatchRecords[b.batchNo];
        }
      }
      return {
        batchRecords: nextBatchRecords,
        historical: { durationMs: prev.historical.durationMs + addDurMs, inputTokens: prev.historical.inputTokens + addIn, outputTokens: prev.historical.outputTokens + addOut },
      };
    });

    if (batchesToEval.some(b => b.batchNo === selectedBatchNo)) setIsEvaluatingBatch(true);

    const tasks = batchesToEval.map(async (batch) => {
      const prevController = batchAbortControllersRef.current[batch.batchNo];
      if (prevController) prevController.abort('SUPERSEDED_BY_NEW_RUN');

      const controller = new AbortController();
      batchAbortControllersRef.current[batch.batchNo] = controller;

      try {
        const runId = nextBatchRunId(batch.batchNo);
        await apiClient.submitAuditStream(
          {
            batchSpecimen: batch,
            standardIds: stdIds.length > 0 ? stdIds : undefined,
            gradeKey: batch.overrideGrade || batch.grade,
            options: { sessionId: session.sessionId, batchNo: batch.batchNo, runId },
          },
          {
            onTier1Ready: (data) => {
              if (data.taskId && !data.taskId.endsWith(`::${runId}`)) return;
              updateBatchAuditMetrics(batch.batchNo, data.durationMs, data.tokenUsage);
              const isReportPass = data.report.summary.overall_status === 'PASS';
              const summaryText = isReportPass
                ? `核心指标核验合格 (共评估 ${data.report.summary.total_rules_evaluated} 项)`
                : `核验未通过 (不合格 ${data.report.summary.fail_count} 项，漏检 ${data.report.summary.missing_count} 项)`;

              setBatchPresentationMap(prev => ({
                ...prev,
                [batch.batchNo]: { ...prev[batch.batchNo], batchNo: batch.batchNo, stage: data.hasPending ? 'tier1_ready' : 'completed', report: data.report, pendingProperties: data.pendingProperties || [], taskId: data.taskId },
              }));
              applyVerdictToSession(batch.batchNo, data.report, summaryText, isReportPass);
              if (batch.batchNo === selectedBatchNo) setIsEvaluatingBatch(false);
            },
            onTier2Patch: (data) => {
              if (data.taskId && !data.taskId.endsWith(`::${runId}`)) return;
              updateBatchAuditMetrics(batch.batchNo, data.durationMs, data.tokenUsage);
              const isReportPass = data.finalReport.summary.overall_status === 'PASS';
              const summaryText = isReportPass
                ? `全项核验合格 (共评估 ${data.finalReport.summary.total_rules_evaluated} 项)`
                : `核验未通过 (不合格 ${data.finalReport.summary.fail_count} 项，漏检 ${data.finalReport.summary.missing_count} 项)`;

              setBatchPresentationMap(prev => ({
                ...prev,
                [batch.batchNo]: { ...prev[batch.batchNo], batchNo: batch.batchNo, stage: 'completed', report: data.finalReport, pendingProperties: [], resolvedProperties: data.resolvedProperties || [], taskId: data.taskId },
              }));
              applyVerdictToSession(batch.batchNo, data.finalReport, summaryText, isReportPass);
            },
            onHitlInterrupt: (data) => {
              if (data.taskId && !data.taskId.endsWith(`::${runId}`)) return;
              updateBatchAuditMetrics(batch.batchNo, data.durationMs, data.tokenUsage);

              setBatchPresentationMap(prev => ({
                ...prev,
                [batch.batchNo]: { ...(prev[batch.batchNo] || { batchNo: batch.batchNo }), stage: 'hitl_pending', hitlContext: data.hitlContext, report: data.partialReport, taskId: data.taskId },
              }));

              setSession(prev => ({
                ...prev,
                documents: prev.documents.map(d => {
                  if (d.docId !== selectedDocId) return d;
                  return {
                    ...d,
                    batches: d.batches.map(b => {
                      if (b.batchNo !== batch.batchNo) return b;
                      return {
                        ...b,
                        verdict: 'MANUAL_REVIEW',
                        verdictSummary: data.hitlContext.prompt_message || '系统指标存在歧义或条件待核实，须在人机协同抽屉中完成核验',
                        systemVerdict: 'MANUAL_REVIEW',
                        systemVerdictSummary: data.hitlContext.prompt_message,
                        hitlReason: data.hitlContext.reason,
                        auditReport: data.partialReport,
                      };
                    }),
                  };
                }),
              }));

              if (batch.batchNo === selectedBatchNo) {
                onOpenHitlDrawer?.(data.hitlContext);
              }
            },
            onComplete: (data) => {
              if (data.taskId && !data.taskId.endsWith(`::${runId}`)) return;
              updateBatchAuditMetrics(batch.batchNo, data.durationMs, data.tokenUsage);
              const isReportPass = data.finalReport.summary.overall_status === 'PASS';
              const summaryText = isReportPass
                ? `全项核验合格 (共评估 ${data.finalReport.summary.total_rules_evaluated} 项)`
                : `核验未通过 (不合格 ${data.finalReport.summary.fail_count} 项，漏检 ${data.finalReport.summary.missing_count} 项)`;

              setBatchPresentationMap(prev => ({
                ...prev,
                [batch.batchNo]: { batchNo: batch.batchNo, stage: 'completed', report: data.finalReport, pendingProperties: [], resolvedProperties: prev[batch.batchNo]?.resolvedProperties || [], taskId: data.taskId },
              }));
              applyVerdictToSession(batch.batchNo, data.finalReport, summaryText, isReportPass);
            },
            onError: (err) => {
              if (err.taskId && !err.taskId.endsWith(`::${runId}`)) return;
              if (controller.signal.aborted) return;
              const errorText = err.error || '核验异常';
              const isUnsupportedStd = errorText.includes('未收录标准') ||
                errorText.includes('未找到标准代号') ||
                errorText.includes('StandardNotFound');
              const displayError = isUnsupportedStd
                ? '质保书声明标准未收录，无法开始核验。请在标准库中补充或选择等效替代标准。'
                : errorText;

              setBatchPresentationMap(prev => ({
                ...prev,
                [batch.batchNo]: { ...(prev[batch.batchNo] || { batchNo: batch.batchNo }), stage: 'error', error: displayError },
              }));
              showToast(displayError, 'error');
            },
          },
          controller.signal
        );
      } catch (taskErr) {
        if (controller.signal.aborted) return;
        console.error(`[WaterfallWorkbench] 批次 ${batch.batchNo} 执行流式核验异常:`, taskErr);
        const errStr = String(taskErr);
        const isUnsupportedStd = errStr.includes('未收录标准') ||
          errStr.includes('未找到标准代号') ||
          errStr.includes('StandardNotFound');
        const displayError = isUnsupportedStd
          ? '质保书声明标准未收录，无法开始核验。请在标准库中补充或选择等效替代标准。'
          : errStr;

        setBatchPresentationMap(prev => ({
          ...prev,
          [batch.batchNo]: { ...(prev[batch.batchNo] || { batchNo: batch.batchNo }), stage: 'error', error: displayError },
        }));
        showToast(displayError, 'error');
      } finally {
        if (batchAbortControllersRef.current[batch.batchNo] === controller) delete batchAbortControllersRef.current[batch.batchNo];
        if (batch.batchNo === selectedBatchNo) setIsEvaluatingBatch(false);
      }
    });

    await Promise.allSettled(tasks);
  }, [selectedBatchNo, selectedDocId, selectedStandardIds, dynamicStandardsCatalog, standardsData, session.sessionId, nextBatchRunId, updateBatchAuditMetrics, applyVerdictToSession, onOpenHitlDrawer, showToast]);

  // 人工纠偏采纳与恢复
  const handleResolveHitl = useCallback(async (correction: HumanCorrectionInput) => {
    const taskId = (selectedBatchNo && batchPresentationMap[selectedBatchNo]?.taskId)
      ? batchPresentationMap[selectedBatchNo]!.taskId!
      : (currentBatch ? `${session.sessionId}::${currentBatch.batchNo}` : '');

    let resumedReport: AuditReport | undefined = undefined;
    if (taskId) {
      try {
        const res = await apiClient.resumeAudit(taskId, correction);
        if (res.success && res.finalReport) resumedReport = res.finalReport;
      } catch (resumeErr) {
        console.warn('[WaterfallWorkbench] 调用 resumeAudit 异常，降级全量核验驱动:', resumeErr);
      }
    }

    const nextOverrideGrade = correction.corrected_grade || currentBatch?.overrideGrade;

    if (resumedReport && resumedReport.summary && (resumedReport.summary.total_rules_evaluated ?? 0) > 0) {
      const isReportPass = resumedReport.summary.overall_status === 'PASS';
      const summaryText = isReportPass
        ? `全项核验合格 (共评估 ${resumedReport.summary.total_rules_evaluated} 项)`
        : `核验未通过 (不合格 ${resumedReport.summary.fail_count} 项，漏检 ${resumedReport.summary.missing_count} 项)`;

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
                grade: b.grade,
                overrideGrade: nextOverrideGrade,
                auditReport: resumedReport,
                verdict: isReportPass ? 'PASS' : 'FAIL',
                verdictSummary: summaryText,
                systemVerdict: isReportPass ? 'PASS' : 'FAIL',
                systemVerdictSummary: summaryText,
                humanVerdict: null,
                hitlFieldCorrection: correction,
                hitlCorrection: correction,
              };
            }),
          };
        }),
      }));

      if (selectedBatchNo) {
        setBatchPresentationMap(prev => ({
          ...prev,
          [selectedBatchNo]: { ...prev[selectedBatchNo], batchNo: selectedBatchNo, stage: 'completed', report: resumedReport, hitlContext: undefined, pendingProperties: [], hitlFieldCorrection: correction, hitlCorrection: correction },
        }));
      }
    } else {
      const targetBatch: BatchSpecimen | undefined = currentBatch ? {
        ...currentBatch,
        grade: currentBatch.grade,
        overrideGrade: nextOverrideGrade,
        verdict: 'UNAUDITED',
        auditReport: undefined,
        humanVerdict: null,
        hitlFieldCorrection: correction,
        hitlCorrection: correction,
      } : undefined;

      if (selectedBatchNo) {
        setBatchPresentationMap(prev => ({
          ...prev,
          [selectedBatchNo]: { ...(prev[selectedBatchNo] || { batchNo: selectedBatchNo, stage: 'idle' }), hitlFieldCorrection: correction, hitlCorrection: correction },
        }));
      }

      setSession(prev => ({
        ...prev,
        documents: prev.documents.map(doc => {
          if (doc.docId !== selectedDocId) return doc;
          return {
            ...doc,
            batches: doc.batches.map(b => {
              if (b.batchNo !== selectedBatchNo) return b;
              return { ...b, grade: b.grade, overrideGrade: nextOverrideGrade, verdict: 'UNAUDITED', auditReport: undefined, humanVerdict: null, hitlFieldCorrection: correction, hitlCorrection: correction };
            }),
          };
        }),
      }));

      if (targetBatch) await evaluateBatches([targetBatch], selectedStandardIds);
    }
  }, [batchPresentationMap, currentBatch, evaluateBatches, selectedBatchNo, selectedDocId, selectedStandardIds, session.sessionId, setSession]);

  // 行内采纳推荐属性对齐
  const handleInlineAdoptProperty = useCallback(async (batchNo: string, rawKey: string, resolvedKey: string) => {
    const batchState = batchPresentationMap[batchNo];
    const taskId = batchState?.taskId || `${session.sessionId}::${batchNo}`;

    try {
      showToast(`正在采纳推荐: ${rawKey} → ${resolvedKey}...`, 'info');
      const res = await apiClient.resumeAudit(taskId, { corrected_property_keys: { [rawKey]: resolvedKey } });

      if (res.success && res.finalReport) {
        showToast('条款对齐成功，已完成补充合规核验', 'success');
        setBatchPresentationMap(prev => ({
          ...prev,
          [batchNo]: { ...prev[batchNo], batchNo, stage: 'completed', report: res.finalReport, pendingProperties: [], hitlContext: undefined },
        }));

        const isPass = res.finalReport.summary.overall_status === 'PASS';
        const summaryText = isPass
          ? `全项核验合格 (共评估 ${res.finalReport.summary.total_rules_evaluated} 项)`
          : `核验未通过 (不合格 ${res.finalReport.summary.fail_count} 项，漏检 ${res.finalReport.summary.missing_count} 项)`;
        applyVerdictToSession(batchNo, res.finalReport, summaryText, isPass);
      } else {
        showToast(`核验恢复失败: ${res.error || '未知错误'}`, 'error');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showToast(`提交异常: ${errMsg}`, 'error');
    }
  }, [batchPresentationMap, session.sessionId, applyVerdictToSession, showToast]);

  // 行内快捷采纳推荐项
  const handleInlineAdoptHitl = useCallback(async (batchNo: string, ctx?: HitlInterruptContext) => {
    if (!ctx) return;
    if (ctx.reason === 'UNKNOWN_GRADE') {
      const topGrade = ctx.candidate_grades?.[0]?.id || (ctx.suggestions?.default ? String(ctx.suggestions.default) : undefined);
      if (!topGrade) {
        showToast('当前无可用推荐牌号，请打开抽屉手动指定', 'error');
        return;
      }
      const topCode = ctx.candidate_grades?.[0]?.code || topGrade;
      showToast(`正在采纳推荐牌号: ${topCode}...`, 'info');
      await handleResolveHitl({
        inspector_id: 'QC-Engineer (质检工程师)',
        corrected_grade: topGrade,
        waiver_notes: '质检工程师在全景比对卡片中一键采纳系统推荐国家标准牌号',
      });
      showToast(`牌号修正成功 [${topCode}]，已完成全项标准核验`, 'success');
      return;
    }
    if (ctx.suggestions && Object.keys(ctx.suggestions).length > 0) {
      const entries = Object.entries(ctx.suggestions);
      if (entries.length > 0 && entries[0]) {
        const [rawKey, targetKey] = entries[0];
        await handleInlineAdoptProperty(batchNo, rawKey, String(targetKey));
      }
    }
  }, [handleResolveHitl, handleInlineAdoptProperty, showToast]);

  return {
    batchPresentationMap,
    setBatchPresentationMap,
    isEvaluatingBatch,
    setIsEvaluatingBatch,
    auditMetrics,
    setAuditMetrics,
    totalCombinedMetrics,
    dynamicStandardsCatalog,
    selectedStandardIds,
    batchEvaluatingKeyRef,
    batchRunCountersRef,
    batchAbortControllersRef,
    isReevaluatingCooldownRef,
    nextBatchRunId,
    evaluateBatches,
    handleResolveHitl,
    handleInlineAdoptProperty,
    handleInlineAdoptHitl,
  };
}
