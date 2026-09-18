'use client';

import React, { useState, useRef, useEffect } from 'react';

export interface WorkbenchFooterBarProps {
  currentStep: number;
  onGoToStep: (step: number) => void;
  queuedDocsCount: number;
  isAnyDocPreprocessing: boolean;
  onStartNewSessionAndAdvance: () => void;
  // Step 3 screenshot triggers
  isCapturing?: boolean;
  currentBatchNo?: string;
  currentDocBatchesCount?: number;
  totalBatchesCount?: number;
  sessionDocsCount?: number;
  onSaveCurrentBatchScreenshot?: () => void;
  onSaveCurrentDocAllBatchesScreenshot?: () => void;
  onSaveSessionAllBatchesScreenshot?: () => void;
  // Step 3 actions
  onStartNewTask?: () => void;
  onSaveSessionResults?: () => void;
  // Scroll to top
  canScrollTop?: boolean;
  onScrollToTop?: () => void;
}

/**
 * 底部常驻导航栏组件 (Fixed Stepper Bar - 定宽 1440px 居中)
 * 承载：3 步骤连线指示器、各步骤转场推进动作、结果截图菜单、开启新任务与结果保存
 */
export const WorkbenchFooterBar: React.FC<WorkbenchFooterBarProps> = ({
  currentStep,
  onGoToStep,
  queuedDocsCount,
  isAnyDocPreprocessing,
  onStartNewSessionAndAdvance,
  isCapturing = false,
  currentBatchNo = '',
  currentDocBatchesCount = 0,
  totalBatchesCount = 0,
  sessionDocsCount = 0,
  onSaveCurrentBatchScreenshot,
  onSaveCurrentDocAllBatchesScreenshot,
  onSaveSessionAllBatchesScreenshot,
  onStartNewTask,
  onSaveSessionResults,
  canScrollTop = false,
  onScrollToTop,
}) => {
  const [isScreenshotMenuOpen, setIsScreenshotMenuOpen] = useState(false);
  const screenshotMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭截图菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (screenshotMenuRef.current && !screenshotMenuRef.current.contains(event.target as Node)) {
        setIsScreenshotMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const steps = [
    { id: 0, title: '上传文档', icon: 'upload_file' },
    { id: 1, title: '核对数据', icon: 'fact_check' },
    { id: 2, title: '比对标准', icon: 'compare_arrows' },
  ];

  return (
    <footer className="h-16 shrink-0 bg-surface-container-lowest dark:bg-bg-industrial-slate border-t border-outline-variant/60 dark:border-border-dark flex justify-center items-center z-30 shadow-sheet select-none">
      <div className="w-[1440px] max-w-full px-6 flex justify-between items-center">
        {/* 3 步骤连线指示器 */}
        <div className="flex items-center gap-2 sm:gap-4">
          {steps.map((step, idx) => {
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            return (
              <React.Fragment key={step.id}>
                {idx > 0 && (
                  <div
                    className={`w-6 sm:w-10 h-[2px] transition-colors ${
                      isCompleted ? 'bg-primary dark:bg-primary-fixed-dim' : 'bg-outline-variant/60 dark:bg-border-dark'
                    }`}
                  />
                )}

                <button
                  type="button"
                  onClick={() => onGoToStep(step.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    isActive
                      ? 'bg-primary dark:bg-primary-container text-on-primary font-bold shadow-xs'
                      : isCompleted
                        ? 'text-status-pass-text bg-status-pass-bg dark:bg-emerald-950/40 dark:text-emerald-300 font-medium'
                        : 'text-on-surface-variant dark:text-outline-variant hover:text-on-surface dark:hover:text-surface-bright'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">
                    {isCompleted ? 'check_circle' : step.icon}
                  </span>
                  <span className="text-xs">{step.title}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* 右侧动作流转按钮 */}
        <div className="flex items-center gap-3">
          {currentStep > 0 && (
            <button
              type="button"
              onClick={() => onGoToStep(currentStep - 1)}
              className="px-4 py-2 rounded-lg border border-outline-variant dark:border-border-dark text-xs font-medium text-on-surface dark:text-surface-bright hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors"
            >
              返回上一步
            </button>
          )}

          {currentStep === 0 && (
            <button
              type="button"
              onClick={onStartNewSessionAndAdvance}
              disabled={queuedDocsCount === 0 || isAnyDocPreprocessing}
              className={`px-5 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 ${
                queuedDocsCount === 0 || isAnyDocPreprocessing
                  ? 'bg-outline-variant/40 dark:bg-border-dark/40 text-on-surface-variant/40 cursor-not-allowed'
                  : 'bg-primary hover:bg-primary-container text-on-primary cursor-pointer'
              }`}
            >
              {isAnyDocPreprocessing && (
                <span className="material-symbols-outlined text-base animate-spin">
                  progress_activity
                </span>
              )}
              <span>{isAnyDocPreprocessing ? '文档预处理中...' : '解析文档，核对数据'}</span>
              {!isAnyDocPreprocessing && (
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              )}
            </button>
          )}

          {currentStep === 1 && (
            <button
              type="button"
              onClick={() => onGoToStep(2)}
              className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>核对完成，比对标准</span>
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </button>
          )}

          {currentStep === 2 && (
            <>
              {/* 次要按钮 1：保存截图（分体式上拉选择菜单 Split Button） */}
              <div
                ref={screenshotMenuRef}
                className="relative inline-flex items-stretch rounded-lg shadow-2xs border border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark"
              >
                {/* 左侧主触发按钮 */}
                <button
                  type="button"
                  onClick={onSaveCurrentBatchScreenshot}
                  disabled={isCapturing}
                  className="px-3.5 py-2 rounded-l-lg text-xs font-bold text-on-surface dark:text-surface-bright hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  title="快捷导出当前选中批次的比对结果高清快照"
                >
                  <span className="material-symbols-outlined text-base text-primary dark:text-primary-fixed-dim">
                    {isCapturing ? 'hourglass_top' : 'photo_camera'}
                  </span>
                  <span>{isCapturing ? '生成截图中...' : '保存当前页面截图'}</span>
                </button>

                {/* 中间细分割线 */}
                <div className="w-px bg-outline-variant/60 dark:bg-border-dark self-stretch my-1.5" />

                {/* 右侧下拉箭头 */}
                <button
                  type="button"
                  onClick={() => setIsScreenshotMenuOpen(prev => !prev)}
                  disabled={isCapturing}
                  className="px-2 py-2 rounded-r-lg text-on-surface-variant hover:text-on-surface dark:text-outline-variant dark:hover:text-surface-bright hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors flex items-center justify-center disabled:opacity-50 cursor-pointer"
                  title="选择截图保存范围（单批次/当前文档/全会话）"
                >
                  <span
                    className={`material-symbols-outlined text-base text-on-surface-variant dark:text-outline-variant transition-transform duration-200 ${
                      isScreenshotMenuOpen ? 'rotate-180' : ''
                    }`}
                  >
                    keyboard_arrow_up
                  </span>
                </button>

                {/* 向上展开的浮层选择菜单 */}
                {isScreenshotMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant dark:border-border-dark rounded-xl shadow-xl p-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <div className="px-2.5 py-1.5 text-[11px] font-semibold text-on-surface-variant/80 dark:text-outline-variant border-b border-outline-variant/40 dark:border-border-dark/60 mb-1 flex items-center justify-between">
                      <span>选择截图范围</span>
                    </div>

                    {/* 选项 1：保存当前页面截图 */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsScreenshotMenuOpen(false);
                        onSaveCurrentBatchScreenshot?.();
                      }}
                      className="w-full text-left p-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors flex items-start gap-2.5 cursor-pointer group"
                    >
                      <span className="material-symbols-outlined text-lg text-primary dark:text-primary-fixed-dim shrink-0 mt-0.5">
                        photo_camera
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center justify-between">
                          <span>保存当前页面截图</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container dark:bg-surface-dark-high text-on-surface-variant">
                            单批次
                          </span>
                        </div>
                        <div className="text-[11px] text-on-surface-variant dark:text-outline-variant truncate mt-0.5">
                          仅当前选中的批次 ({currentBatchNo || '当前批次'})
                        </div>
                      </div>
                    </button>

                    {/* 选项 2：保存当前文档所有批次截图 */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsScreenshotMenuOpen(false);
                        onSaveCurrentDocAllBatchesScreenshot?.();
                      }}
                      className="w-full text-left p-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors flex items-start gap-2.5 cursor-pointer group"
                    >
                      <span className="material-symbols-outlined text-lg text-primary dark:text-primary-fixed-dim shrink-0 mt-0.5">
                        tab
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center justify-between">
                          <span>保存当前文档所有批次截图</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary dark:text-primary-fixed-dim font-bold">
                            {currentDocBatchesCount} 个批次
                          </span>
                        </div>
                        <div className="text-[11px] text-on-surface-variant dark:text-outline-variant truncate mt-0.5">
                          当前文档共 {currentDocBatchesCount} 个批次，顺序导出
                        </div>
                      </div>
                    </button>

                    {/* 选项 3：保存当前会话所有批次截图 */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsScreenshotMenuOpen(false);
                        onSaveSessionAllBatchesScreenshot?.();
                      }}
                      className="w-full text-left p-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors flex items-start gap-2.5 cursor-pointer group"
                    >
                      <span className="material-symbols-outlined text-lg text-primary dark:text-primary-fixed-dim shrink-0 mt-0.5">
                        folder_zip
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center justify-between">
                          <span>保存当前会话所有批次截图</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary-container/60 text-secondary font-bold">
                            {totalBatchesCount} 个批次
                          </span>
                        </div>
                        <div className="text-[11px] text-on-surface-variant dark:text-outline-variant truncate mt-0.5">
                          涵盖 {sessionDocsCount} 份文档，共 {totalBatchesCount} 个批次
                        </div>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              {/* 次要按钮 2：开启新任务 */}
              <button
                type="button"
                onClick={onStartNewTask}
                className="px-4 py-2 rounded-lg border border-outline-variant dark:border-border-dark text-xs font-bold text-on-surface dark:text-surface-bright hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="自动归档当前检验结果，并重置创建新任务返回步骤 1"
              >
                <span className="material-symbols-outlined text-base text-outline-variant dark:text-outline-dark">
                  add_task
                </span>
                <span>开启新任务</span>
              </button>

              {/* 主要按钮：保存结果 */}
              <button
                type="button"
                onClick={onSaveSessionResults}
                className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                title="存储当前作业会话 (Session) 的全部系统和人工检验判定结果至本地台账"
              >
                <span className="material-symbols-outlined text-base">check_circle</span>
                <span>保存结果</span>
              </button>
            </>
          )}

          {/* 常驻辅助控制组：分割线 + 返回顶部 */}
          <div className="w-px h-5 bg-outline-variant/60 dark:bg-border-dark self-center mx-0.5" />

          <button
            type="button"
            onClick={onScrollToTop}
            disabled={!canScrollTop}
            className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-all ${
              canScrollTop
                ? 'border-outline-variant dark:border-border-dark text-on-surface dark:text-surface-bright hover:bg-surface-container-low dark:hover:bg-surface-dark-low hover:border-primary/50 cursor-pointer shadow-2xs active:scale-95'
                : 'border-outline-variant/30 dark:border-border-dark/30 text-on-surface-variant/30 dark:text-outline-variant/20 border-dashed cursor-not-allowed opacity-40'
            }`}
            title={canScrollTop ? '返回顶部' : '已在顶部'}
            aria-label="返回顶部"
          >
            <span className="material-symbols-outlined text-lg">vertical_align_top</span>
          </button>
        </div>
      </div>
    </footer>
  );
};
