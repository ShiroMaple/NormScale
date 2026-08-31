'use client';

import React, { useEffect, useRef, useState } from 'react';
import { DocumentParsingTask } from '@/types/parser.ts';

interface LlmStreamingTerminalProps {
  task: DocumentParsingTask;
  isExpanded: boolean;
  onToggleExpand: () => void;
  className?: string;
}

export const LlmStreamingTerminal: React.FC<LlmStreamingTerminalProps> = ({
  task,
  isExpanded,
  onToggleExpand,
  className = '',
}) => {
  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // 自动平滑滚动到底部
  useEffect(() => {
    if (isExpanded && terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
    }
  }, [task.streamingJson, isExpanded]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(task.streamingJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isParsing = task.status === 'parsing';
  const isReady = task.status === 'ready';

  return (
    <div
      className={`rounded-xl border transition-all duration-300 overflow-hidden shadow-xs ${
        isParsing
          ? 'border-primary/60 dark:border-primary/60 bg-surface-container-lowest dark:bg-surface-dark ring-1 ring-primary/20'
          : 'border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark'
      } ${className}`}
    >
      {/* 顶部控制栏 */}
      <div
        onClick={onToggleExpand}
        className="px-4 py-2.5 bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/40 dark:border-border-dark flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`material-symbols-outlined text-[16px] shrink-0 ${
                isParsing ? 'text-primary dark:text-primary-fixed-dim animate-pulse' : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {isParsing ? 'progress_activity' : 'terminal'}
            </span>
            <span className="text-xs font-bold text-on-surface dark:text-surface-bright truncate">
              模型流式解析输出 · {task.filename}
            </span>
          </div>

          {/* 状态胶囊徽章（严格 Material Symbols 与文本，无 emoji） */}
          <div className="shrink-0">
            {isParsing && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
                <span>解析中 {task.progress}%</span>
              </span>
            )}
            {isReady && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <span className="material-symbols-outlined text-[12px]">check_circle</span>
                <span>已就绪 100%</span>
              </span>
            )}
            {task.status === 'queued' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-on-surface-variant dark:text-outline-variant bg-surface-container-high dark:bg-surface-dark-high border border-outline-variant/40 dark:border-border-dark">
                <span className="material-symbols-outlined text-[12px]">schedule</span>
                <span>排队等待中</span>
              </span>
            )}
          </div>
        </div>

        {/* 右侧 Token 开销与折叠开关 */}
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-on-surface-variant dark:text-outline-variant">
            <span>输入 {task.inputTokens}</span>
            <span>/</span>
            <span>输出 {task.outputTokens} Tokens</span>
            <span>·</span>
            <span className="text-on-surface dark:text-surface-bright font-medium">{task.durationSeconds.toFixed(1)}s</span>
          </div>

          {isExpanded && (
            <button
              type="button"
              onClick={handleCopy}
              className="px-2 py-1 rounded bg-surface-container-high dark:bg-surface-dark-high hover:bg-surface-container-highest dark:hover:bg-surface-dark text-[11px] text-on-surface dark:text-surface-bright transition-colors flex items-center gap-1 border border-outline-variant/40 dark:border-border-dark"
            >
              <span className="material-symbols-outlined text-[12px]">
                {copied ? 'check' : 'content_copy'}
              </span>
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
          )}

          <button
            type="button"
            className="flex items-center gap-0.5 text-xs text-primary dark:text-primary-fixed-dim hover:underline transition-colors font-bold"
          >
            <span>{isExpanded ? '收起' : '展开'}</span>
            <span className="material-symbols-outlined text-sm">
              {isExpanded ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>
      </div>

      {/* 折叠内容区 */}
      {isExpanded && (
        <div className="p-3 bg-surface-container-lowest dark:bg-surface-dark space-y-2.5">
          {/* 微步阶段进度条 */}
          {isParsing && (
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant dark:text-outline-variant bg-surface-container-low dark:bg-surface-dark-low px-3 py-1.5 rounded-lg border border-outline-variant/40 dark:border-border-dark">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-[14px] animate-spin">
                  sync
                </span>
                <span className="text-on-surface dark:text-surface-bright font-medium">{task.stepPhase}</span>
              </div>
              <div className="w-28 h-1.5 bg-surface-container-high dark:bg-surface-dark-high rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary dark:bg-primary-fixed-dim transition-all duration-300 rounded-full"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* 流式文本视窗 */}
          <div
            ref={terminalScrollRef}
            className="h-44 overflow-y-auto custom-scrollbar text-xs leading-relaxed text-on-surface/90 dark:text-surface-bright/90 p-3 bg-surface-container-low/60 dark:bg-surface-dark-low/60 rounded-lg border border-outline-variant/40 dark:border-border-dark select-text"
          >
            <pre className="whitespace-pre-wrap break-all font-sans">
              {task.streamingJson || '// 等待大模型启动推理流...'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
