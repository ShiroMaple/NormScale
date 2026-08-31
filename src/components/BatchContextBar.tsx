'use client';

import React, { useState } from 'react';
import { InspectionSession, SessionDocument, BatchSpecimen } from '@/types/session.ts';
import { DocumentParsingTask, SessionTokenMetrics } from '@/types/parser.ts';

interface BatchContextBarProps {
  stepTitle: string; // 如 "步骤 2: 核对解析数据", "步骤 3: 比对执行标准", "步骤 4: 报告归档与导出"
  session: InspectionSession;
  selectedDocId: string;
  selectedBatchNo: string;
  onSelectDoc: (docId: string) => void;
  onSelectBatch: (docId: string, batchNo: string) => void;
  mode?: 'extraction' | 'compliance'; // 'extraction' 阶段显示 SUCCESS/FAIL，'compliance' 阶段显示 PASS/FAIL
  rightExtraAction?: React.ReactNode; // 标题行右侧额外插槽 (如 HITL 抽屉按钮)
  docParsingTasks?: Record<string, DocumentParsingTask>;
  sessionMetrics?: SessionTokenMetrics;
  isStreamingTerminalExpanded?: boolean;
  onToggleStreamingTerminal?: () => void;
  onReparseDocument?: () => void;
}

/**
 * ============================================================================
 * NormScale 统一页面标题与两层树状批次选择容器 (Step Context & Batch Bar)
 * 采用“无背景标题层 + 下方独立圆角选择器卡片”的双层独立布局
 * Session ID 简化为末尾 UUID (Hover 显示完整 ID)，杜绝换行拥挤
 * ============================================================================
 */
export const BatchContextBar: React.FC<BatchContextBarProps> = ({
  stepTitle,
  session,
  selectedDocId,
  selectedBatchNo,
  onSelectDoc,
  onSelectBatch,
  mode = 'compliance',
  rightExtraAction,
  docParsingTasks,
  sessionMetrics,
  isStreamingTerminalExpanded,
  onToggleStreamingTerminal,
  onReparseDocument,
}) => {
  const [docDropdownOpen, setDocDropdownOpen] = useState(false);
  const [batchDropdownOpen, setBatchDropdownOpen] = useState(false);

  // 提取末尾 8 位 UUID 简化展示，hover 提示完整 Session ID
  const shortSessionId = session.sessionId.split('-').pop() || session.sessionId;

  // 获取当前选中的 Document 和 Batch
  const currentDoc: SessionDocument =
    session.documents.find(d => d.docId === selectedDocId) ||
    session.documents[0] || {
      docId: 'doc_default',
      filename: '未命名文档.pdf',
      fileSize: '0 B',
      uploadTime: '',
      ocrStatus: 'DONE',
      pageCount: 1,
      batches: [],
    };

  const currentBatch: BatchSpecimen =
    currentDoc.batches.find(b => b.batchNo === selectedBatchNo) ||
    currentDoc.batches[0] || {
      batchNo: 'DEFAULT-001',
      subBatchIndex: 1,
      grade: '022Cr17Ni12Mo2',
      standard: 'GB/T 13296-2023',
      supplier: '未知供货商',
      dimensions: 'OD 25.0mm × WT 2.0mm',
      heatNo: 'HT-001',
      verdict: 'PASS',
      verdictSummary: '合格',
      ocrConfidence: 98,
      gradeMatchConfidence: 99,
      chemical: [],
      mechanical: { tensile_rm: '', yield_rp02: '', elongation_a: '' },
      process: { flattening: 'PASS', intergranularCorrosion: 'PASS', ndt: '' },
      reportNo: '',
      sha256Hash: '',
      inspector: '',
    };

  // 展平所有文档下的全部批次列表，供全局上一批次/下一批次流转
  const allFlattenedBatches: Array<{ docId: string; filename: string; batch: BatchSpecimen }> = [];
  session.documents.forEach(doc => {
    doc.batches.forEach(b => {
      allFlattenedBatches.push({ docId: doc.docId, filename: doc.filename, batch: b });
    });
  });

  const currentFlatIndex = allFlattenedBatches.findIndex(
    item => item.docId === currentDoc.docId && item.batch.batchNo === currentBatch.batchNo
  );

  const hasPrevBatch = currentFlatIndex > 0;
  const hasNextBatch = currentFlatIndex < allFlattenedBatches.length - 1 && currentFlatIndex >= 0;

  const handlePrevBatch = () => {
    if (hasPrevBatch) {
      const prev = allFlattenedBatches[currentFlatIndex - 1];
      if (prev) {
        onSelectBatch(prev.docId, prev.batch.batchNo);
      }
    }
  };

  const handleNextBatch = () => {
    if (hasNextBatch) {
      const next = allFlattenedBatches[currentFlatIndex + 1];
      if (next) {
        onSelectBatch(next.docId, next.batch.batchNo);
      }
    }
  };

  // 状态显示标签：Step2 模式使用 SUCCESS/FAIL，Step3/4 模式使用 PASS/FAIL
  const getVerdictBadgeText = (verdict: 'PASS' | 'FAIL' | 'MANUAL_REVIEW') => {
    if (mode === 'extraction') {
      return verdict === 'PASS' ? 'SUCCESS ✓' : verdict === 'FAIL' ? 'FAIL ✗' : 'HITL';
    }
    return verdict === 'PASS' ? 'PASS ✓' : verdict === 'FAIL' ? 'FAIL ✗' : 'HITL';
  };

  return (
    <div className="w-full space-y-2.5 select-none relative z-30">

      {/* 1. 顶部主标题行 (左侧步骤主标题，右侧 Session 累计 Token 开销与流水展开按钮) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 dark:bg-primary-fixed-dim/20 text-primary dark:text-primary-fixed-dim flex items-center justify-center font-bold shrink-0">
            <span className="material-symbols-outlined text-lg">
              {stepTitle.includes('核对') || stepTitle.startsWith('步骤 2') || stepTitle.startsWith('Step2')
                ? 'fact_check'
                : stepTitle.includes('比对') || stepTitle.startsWith('步骤 3') || stepTitle.startsWith('Step3')
                  ? 'compare_arrows'
                  : 'archive'}
            </span>
          </div>
          <h1 className="font-headline-lg text-lg sm:text-xl font-bold text-on-surface dark:text-surface-bright tracking-tight">
            {stepTitle}
          </h1>
        </div>

        {/* 右侧：Session 累计 Token 开销、总耗时统计与大模型流水折叠开关 */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {sessionMetrics && (
            <div className="flex items-center gap-2 text-xs font-medium text-on-surface-variant">
              <span
                title="当前 Session 所有文档累计消耗 Token 统计"
                className="flex items-center gap-1.5 bg-surface-container-high dark:bg-surface-dark-high px-2.5 py-1 rounded-lg text-[11px] text-on-surface dark:text-surface-bright border border-outline-variant/40 dark:border-border-dark"
              >
                <span className="material-symbols-outlined text-[14px] text-primary dark:text-primary-fixed-dim">memory</span>
                <span>累计开销: 输入 {sessionMetrics.totalInputTokens.toLocaleString()} / 输出 {sessionMetrics.totalOutputTokens.toLocaleString()} Tokens</span>
              </span>
              <span
                title="当前 Session 累计解析总耗时"
                className="flex items-center gap-1.5 bg-surface-container-high dark:bg-surface-dark-high px-2.5 py-1 rounded-lg text-[11px] text-on-surface dark:text-surface-bright border border-outline-variant/40 dark:border-border-dark"
              >
                <span className="material-symbols-outlined text-[14px] text-emerald-600 dark:text-emerald-400">timer</span>
                <span>总耗时 {sessionMetrics.totalDurationSeconds.toFixed(1)}s</span>
              </span>
            </div>
          )}

          {onToggleStreamingTerminal && (
            <button
              type="button"
              onClick={onToggleStreamingTerminal}
              className="flex items-center gap-1 text-xs text-primary dark:text-primary-fixed-dim font-bold hover:underline bg-primary/5 hover:bg-primary/10 dark:bg-primary-fixed-dim/10 px-2.5 py-1 rounded-lg transition-colors border border-primary/20"
            >
              <span className="material-symbols-outlined text-sm">terminal</span>
              <span>{isStreamingTerminalExpanded ? '收起模型流式输出' : '查看模型流式输出'}</span>
              <span className="material-symbols-outlined text-sm">
                {isStreamingTerminalExpanded ? 'expand_less' : 'expand_more'}
              </span>
            </button>
          )}

          {onReparseDocument && (
            <button
              type="button"
              onClick={onReparseDocument}
              className="flex items-center gap-1 text-xs text-on-surface-variant dark:text-outline-variant hover:text-primary dark:hover:text-primary-fixed-dim bg-surface-container-low dark:bg-surface-dark-low hover:bg-surface-container-high px-2.5 py-1 rounded-lg transition-colors border border-outline-variant/40 dark:border-border-dark cursor-pointer font-medium"
              title="强制绕过本地 MD5 缓存，重新调用大模型解析当前文档"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              <span>重新解析</span>
            </button>
          )}

          {rightExtraAction && (
            <div className="flex items-center gap-2">
              {rightExtraAction}
            </div>
          )}
        </div>
      </div>

      {/* 2. 下部独立圆角选择器卡片 (单行不折叠设计，允许下拉菜单溢出浮层，杜绝遮挡与滚动条) */}
      <div className="w-full bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-2xl p-3 sm:p-3.5 shadow-xs flex items-center justify-between gap-3 text-xs relative overflow-visible">

        {/* 左侧：Session 简写胶囊 + 第 1 层文档 + 第 2 层批次号 */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">

          {/* 会话 ID 简写胶囊 (hover 显示完整 ID) */}
          <div
            title={`完整会话 ID: ${session.sessionId}`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/60 dark:border-border-dark text-on-surface dark:text-surface-bright rounded-xl  text-xs shadow-2xs cursor-help shrink-0"
          >
            <span className="material-symbols-outlined text-base text-primary dark:text-primary-fixed-dim">folder_managed</span>
            <span className="font-bold">#{shortSessionId}</span>
          </div>

          <span className="text-outline-variant dark:text-border-dark ">/</span>

          {/* 第 1 层：文档下拉选择器 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setDocDropdownOpen(!docDropdownOpen);
                setBatchDropdownOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low hover:border-primary dark:hover:border-primary-fixed-dim text-on-surface dark:text-surface-bright transition-colors shadow-2xs"
            >
              <span className="material-symbols-outlined text-base text-red-500 fill-1 shrink-0">picture_as_pdf</span>
              <span className="font-bold max-w-[130px] md:max-w-[170px] xl:max-w-[210px] truncate">{currentDoc.filename}</span>
              <span className="text-[11px] text-on-surface-variant font-normal shrink-0">
                ({currentDoc.batches.length} 炉批)
              </span>
              <span className="material-symbols-outlined text-sm text-on-surface-variant shrink-0">arrow_drop_down</span>
            </button>

            {/* 下拉面板 1 (多文档异步并发进度与状态集成，无 emoji) */}
            {docDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-80 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-lg z-50 p-2 space-y-1.5">
                <div className="flex justify-between items-center px-2 py-1 text-[11px] font-bold text-on-surface-variant dark:text-outline-variant uppercase tracking-wider border-b border-outline-variant/30 pb-1.5">
                  <span>选择作业文档 ({session.documents.length})</span>
                  {sessionMetrics && sessionMetrics.totalDocsCount > 0 && (
                    <span className="text-[11px] font-normal lowercase">
                      {sessionMetrics.readyDocsCount}/{sessionMetrics.totalDocsCount} 已就绪
                    </span>
                  )}
                </div>
                {session.documents.map(doc => {
                  const isSelected = doc.docId === currentDoc.docId;
                  const task = docParsingTasks?.[doc.docId];
                  const isParsing = task?.status === 'parsing';
                  const isReady = task?.status === 'ready' || (!task && doc.ocrStatus === 'DONE');
                  const isQueued = task?.status === 'queued';
                  const isError = task?.status === 'error';

                  return (
                    <div
                      key={doc.docId}
                      onClick={() => {
                        onSelectDoc(doc.docId);
                        const firstBatch = doc.batches[0];
                        if (firstBatch) {
                          onSelectBatch(doc.docId, firstBatch.batchNo);
                        }
                        setDocDropdownOpen(false);
                      }}
                      className={`px-2.5 py-2 rounded-lg cursor-pointer flex items-center justify-between text-xs transition-all ${isSelected
                        ? 'bg-primary/10 dark:bg-primary-fixed-dim/20 text-primary dark:text-primary-fixed-dim font-bold border border-primary/30'
                        : 'hover:bg-surface-container-low dark:hover:bg-surface-dark-low text-on-surface dark:text-surface-bright'
                        }`}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span className="material-symbols-outlined text-sm text-red-500 fill-1 shrink-0">picture_as_pdf</span>
                        <span className="truncate">{doc.filename}</span>
                      </div>

                      {/* 多文档并发微状态指示徽标（无 emoji） */}
                      <div className="shrink-0">
                        {isParsing && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
                            <span>{task.progress}%</span>
                          </span>
                        )}
                        {isReady && !isParsing && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <span className="material-symbols-outlined text-[12px]">check_circle</span>
                            <span>{doc.batches.length} 炉批</span>
                          </span>
                        )}
                        {isQueued && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-zinc-500 bg-zinc-100 dark:bg-zinc-800">
                            <span className="material-symbols-outlined text-[12px]">schedule</span>
                            <span>排队中</span>
                          </span>
                        )}
                        {isError && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-red-50 text-red-600">
                            <span className="material-symbols-outlined text-[12px]">error</span>
                            <span>异常</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <span className="text-outline-variant dark:text-border-dark ">/</span>

          {/* 第 2 层：被选中的批次号 (显著视觉焦点 + 状态标签) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setBatchDropdownOpen(!batchDropdownOpen);
                setDocDropdownOpen(false);
              }}
              title="点击切换当前文档包含的炉批号"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-primary dark:border-primary-fixed-dim bg-primary/10 dark:bg-primary-fixed-dim/20 text-primary dark:text-primary-fixed-dim  font-bold shadow-xs hover:bg-primary/15 transition-all text-xs sm:text-sm ring-2 ring-primary/25 cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-base">label</span>
              <span className="tracking-wide">{currentBatch.batchNo}</span>

              {/* 状态徽章 (Step 2 场景显示 SUCCESS/FAIL) */}
              <span className={`px-2 py-0.5 rounded text-[12px] font-bold shrink-0 ${currentBatch.verdict === 'PASS'
                ? 'bg-status-pass-bg text-status-pass-text border border-emerald-300 dark:border-emerald-800'
                : currentBatch.verdict === 'FAIL'
                  ? 'bg-status-fail-bg text-status-fail-text border border-red-300 dark:border-red-800'
                  : 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700'
                }`}>
                {getVerdictBadgeText(currentBatch.verdict)}
              </span>
              <span className="material-symbols-outlined text-sm">arrow_drop_down</span>
            </button>

            {/* 下拉面板 2 */}
            {batchDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-84 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-lg z-50 p-1.5 space-y-1">
                <div className="px-2 py-1 text-[11px] font-bold text-on-surface-variant dark:text-outline-variant uppercase tracking-wider">
                  当前文档炉批试样 ({currentDoc.batches.length})
                </div>
                {currentDoc.batches.map(b => {
                  const isSelected = b.batchNo === currentBatch.batchNo;
                  return (
                    <div
                      key={b.batchNo}
                      onClick={() => {
                        onSelectBatch(currentDoc.docId, b.batchNo);
                        setBatchDropdownOpen(false);
                      }}
                      className={`px-2.5 py-2 rounded-lg cursor-pointer flex items-center justify-between text-xs transition-colors ${isSelected
                        ? 'bg-primary/10 dark:bg-primary-fixed-dim/20 text-primary dark:text-primary-fixed-dim font-bold'
                        : 'hover:bg-surface-container-low dark:hover:bg-surface-dark-low text-on-surface dark:text-surface-bright'
                        }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <strong className="">{b.batchNo}</strong>
                          <span className="text-[11px] text-on-surface-variant truncate">({b.grade})</span>
                        </div>
                        <span className="text-[12px] text-on-surface-variant dark:text-outline-variant block truncate">
                          {b.dimensions}
                        </span>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[12px] font-bold shrink-0 ml-2 ${b.verdict === 'PASS'
                        ? 'bg-status-pass-bg text-status-pass-text'
                        : b.verdict === 'FAIL'
                          ? 'bg-status-fail-bg text-status-fail-text'
                          : 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700'
                        }`}>
                        {getVerdictBadgeText(b.verdict)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：Session 总体概览 + 上一批次 / 下一批次 */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 ml-auto">

          {/* Session 总体概览徽章 */}
          <div className="flex items-center gap-1.5 text-[14px] text-on-surface-variant dark:text-outline-variant shrink-0">
            <span className="hidden md:inline">总进度:</span>
            <span className="font-bold text-on-surface dark:text-surface-bright">
              {currentFlatIndex + 1} / {allFlattenedBatches.length} 炉批
            </span>
            <span className="px-2 py-0.5 bg-status-pass-bg text-status-pass-text rounded font-bold text-[13px] sm:text-[14px]">
              {allFlattenedBatches.filter(item => item.batch.verdict === 'PASS').length} {mode === 'extraction' ? 'SUCCESS' : 'PASS'}
            </span>
            {allFlattenedBatches.filter(item => item.batch.verdict === 'FAIL').length > 0 && (
              <span className="px-2 py-0.5 bg-status-fail-bg text-status-fail-text rounded font-bold text-[13px] sm:text-[14px]">
                {allFlattenedBatches.filter(item => item.batch.verdict === 'FAIL').length} FAIL
              </span>
            )}
            {allFlattenedBatches.filter(item => item.batch.verdict === 'MANUAL_REVIEW').length > 0 && (
              <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 rounded font-bold text-[13px] sm:text-[14px]">
                {allFlattenedBatches.filter(item => item.batch.verdict === 'MANUAL_REVIEW').length} HITL
              </span>
            )}
          </div>

          {/* 上一批次 / 下一批次 快速流转 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handlePrevBatch}
              disabled={!hasPrevBatch}
              title="切换至上一批次"
              className="px-2.5 sm:px-3 py-1.5 rounded-lg border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark hover:bg-surface-container-low dark:hover:bg-surface-dark-low disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-xs text-on-surface dark:text-surface-bright shrink-0"
            >
              <span className="material-symbols-outlined text-sm">chevron_left</span>
              <span className="hidden sm:inline">上一批次</span>
            </button>

            <button
              type="button"
              onClick={handleNextBatch}
              disabled={!hasNextBatch}
              title={hasNextBatch ? '切换至下一批次' : '已到达最后一个批次'}
              className={
                hasNextBatch
                  ? 'px-3 sm:px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-bold shadow-xs transition-all flex items-center gap-1 text-xs cursor-pointer active:scale-95 shrink-0'
                  : 'px-2.5 sm:px-3 py-1.5 rounded-lg border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark opacity-40 cursor-not-allowed text-xs text-on-surface-variant flex items-center gap-1 shrink-0'
              }
            >
              <span className="hidden sm:inline">下一批次</span>
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
