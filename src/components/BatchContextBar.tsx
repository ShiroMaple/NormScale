'use client';

import React, { useState } from 'react';
import { InspectionSession, SessionDocument, BatchSpecimen } from '@/types/session.ts';

interface BatchContextBarProps {
  stepTitle: string; // 如 "Step2 解析数据核对", "Step3 标准规则比对", "Step4 报告归档与导出"
  session: InspectionSession;
  selectedDocId: string;
  selectedBatchNo: string;
  onSelectDoc: (docId: string) => void;
  onSelectBatch: (docId: string, batchNo: string) => void;
  mode?: 'extraction' | 'compliance'; // 'extraction' 阶段显示 SUCCESS/FAIL，'compliance' 阶段显示 PASS/FAIL
  rightExtraAction?: React.ReactNode; // 标题行右侧额外插槽 (如 HITL 抽屉按钮)
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
      return verdict === 'PASS' ? 'SUCCESS ✓' : verdict === 'FAIL' ? 'FAIL ✗' : 'HITL ?';
    }
    return verdict === 'PASS' ? 'PASS ✓' : verdict === 'FAIL' ? 'FAIL ✗' : 'HITL ?';
  };

  const isSuccessOrPass = currentBatch.verdict === 'PASS';

  return (
    <div className="w-full space-y-2.5 select-none relative z-30">

      {/* 1. 顶部主标题行 (左侧步骤主标题，右侧可选操作) */}
      <div className="flex items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 dark:bg-primary-fixed-dim/20 text-primary dark:text-primary-fixed-dim flex items-center justify-center font-bold shrink-0">
            <span className="material-symbols-outlined text-lg">
              {stepTitle.startsWith('Step2')
                ? 'fact_check'
                : stepTitle.startsWith('Step3')
                  ? 'compare_arrows'
                  : 'archive'}
            </span>
          </div>
          <h1 className="font-headline-lg text-lg sm:text-xl font-bold text-on-surface dark:text-surface-bright tracking-tight">
            {stepTitle}
          </h1>
        </div>

        {/* 右侧额外动作插槽 (如 HITL 介入按钮等) */}
        {rightExtraAction && (
          <div className="flex items-center gap-2">
            {rightExtraAction}
          </div>
        )}
      </div>

      {/* 2. 下部独立圆角选择器卡片 (单行不折叠设计，允许下拉菜单溢出浮层，杜绝遮挡与滚动条) */}
      <div className="w-full bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-2xl p-3 sm:p-3.5 shadow-xs flex items-center justify-between gap-3 text-xs relative overflow-visible">

        {/* 左侧：Session 简写胶囊 + 第 1 层文档 + 第 2 层批次号 */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">

          {/* 会话 ID 简写胶囊 (hover 显示完整 ID) */}
          <div
            title={`完整会话 ID: ${session.sessionId}`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/60 dark:border-border-dark text-on-surface dark:text-surface-bright rounded-xl font-mono text-xs shadow-2xs cursor-help shrink-0"
          >
            <span className="material-symbols-outlined text-base text-primary dark:text-primary-fixed-dim">folder_managed</span>
            <span className="font-bold">#{shortSessionId}</span>
          </div>

          <span className="text-outline-variant dark:text-border-dark font-mono">/</span>

          {/* 第 1 层：文档下拉选择器 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setDocDropdownOpen(!docDropdownOpen);
                setBatchDropdownOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low hover:border-primary dark:hover:border-primary-fixed-dim text-on-surface dark:text-surface-bright font-mono transition-colors shadow-2xs"
            >
              <span className="material-symbols-outlined text-base text-red-500 fill-1 shrink-0">picture_as_pdf</span>
              <span className="font-bold max-w-[130px] md:max-w-[170px] xl:max-w-[210px] truncate">{currentDoc.filename}</span>
              <span className="text-[11px] text-on-surface-variant font-normal shrink-0">
                ({currentDoc.batches.length} 批次)
              </span>
              <span className="material-symbols-outlined text-sm text-on-surface-variant shrink-0">arrow_drop_down</span>
            </button>

            {/* 下拉面板 1 */}
            {docDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-72 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-lg z-50 p-1.5 space-y-1">
                <div className="px-2 py-1 text-[11px] font-bold text-on-surface-variant dark:text-outline-variant uppercase tracking-wider">
                  选择作业文档 (共 {session.documents.length} 份)
                </div>
                {session.documents.map(doc => {
                  const isSelected = doc.docId === currentDoc.docId;
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
                      className={`px-2.5 py-2 rounded-lg cursor-pointer flex items-center justify-between text-xs transition-colors ${isSelected
                        ? 'bg-primary/10 dark:bg-primary-fixed-dim/20 text-primary dark:text-primary-fixed-dim font-bold'
                        : 'hover:bg-surface-container-low dark:hover:bg-surface-dark-low text-on-surface dark:text-surface-bright'
                        }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="material-symbols-outlined text-sm text-red-500 fill-1">picture_as_pdf</span>
                        <span className="truncate font-mono">{doc.filename}</span>
                      </div>
                      <span className="text-[10px] text-on-surface-variant font-mono shrink-0 ml-2">
                        {doc.batches.length} 炉批
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <span className="text-outline-variant dark:text-border-dark font-mono">/</span>

          {/* 第 2 层：被选中的批次号 (显著视觉焦点 + 状态标签) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setBatchDropdownOpen(!batchDropdownOpen);
                setDocDropdownOpen(false);
              }}
              title="点击切换当前文档包含的炉批号"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-primary dark:border-primary-fixed-dim bg-primary/10 dark:bg-primary-fixed-dim/20 text-primary dark:text-primary-fixed-dim font-mono font-bold shadow-xs hover:bg-primary/15 transition-all text-xs sm:text-sm ring-2 ring-primary/25 cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-base">label</span>
              <span className="tracking-wide">{currentBatch.batchNo}</span>

              {/* 状态徽章 (Step 2 场景显示 SUCCESS/FAIL) */}
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${isSuccessOrPass
                ? 'bg-status-pass-bg text-status-pass-text border border-emerald-300 dark:border-emerald-800'
                : 'bg-status-fail-bg text-status-fail-text border border-red-300 dark:border-red-800'
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
                          <strong className="font-mono">{b.batchNo}</strong>
                          <span className="text-[11px] text-on-surface-variant truncate">({b.grade})</span>
                        </div>
                        <span className="text-[10px] text-on-surface-variant dark:text-outline-variant block truncate">
                          {b.dimensions}
                        </span>
                      </div>

                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ml-2 ${b.verdict === 'PASS'
                        ? 'bg-status-pass-bg text-status-pass-text'
                        : b.verdict === 'FAIL'
                          ? 'bg-status-fail-bg text-status-fail-text'
                          : 'bg-status-hitl-bg text-status-hitl-text'
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
              {currentFlatIndex + 1} / {allFlattenedBatches.length} 批次
            </span>
            <span className="px-1.5 py-1 bg-status-pass-bg text-status-pass-text rounded font-bold text-[14px]">
              {session.passedBatches} {mode === 'extraction' ? 'SUCCESS' : 'PASS'}
            </span>
            {session.failedBatches > 0 && (
              <span className="px-1.5 py-1 bg-status-fail-bg text-status-fail-text rounded font-bold text-[14px]">
                {session.failedBatches} FAIL
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
