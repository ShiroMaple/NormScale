'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Terminal, Cpu } from 'lucide-react';
import { AuditTraceItem } from '@/schemas/report.schema.ts';

interface AuditTraceTimelineProps {
  traces?: AuditTraceItem[];
  isLoading?: boolean;
}

/**
 * ============================================================================
 * 全链路审计轨迹流与自然语言决策时间轴 (Audit Trace Timeline Stream)
 * ============================================================================
 */
export const AuditTraceTimeline: React.FC<AuditTraceTimelineProps> = ({
  traces,
  isLoading,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-center text-sm text-slate-400">
        正在记录状态机执行审计轨迹...
      </div>
    );
  }

  if (!traces || traces.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <Terminal className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
            全链路审计轨迹流 (Audit Traces · {traces.length} 条记录)
          </h3>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center space-x-1 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200"
        >
          <span>{isExpanded ? '收起流' : '展开流'}</span>
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 overflow-hidden"
          >
            <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
              {traces.map((trace, idx) => {
                const isWarn = trace.level === 'warn';
                const isError = trace.level === 'error';

                return (
                  <div
                    key={idx}
                    className={`flex items-start space-x-2.5 rounded-lg border p-2.5 text-xs transition-colors ${
                      isError
                        ? 'border-rose-800/60 bg-rose-950/20 text-rose-300'
                        : isWarn
                        ? 'border-amber-800/60 bg-amber-950/20 text-amber-300'
                        : 'border-slate-800/80 bg-slate-950/40 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {/* 时间戳 */}
                    <span className="font-mono text-slate-500 shrink-0 select-none">
                      {new Date(trace.timestamp).toLocaleTimeString('zh-CN', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>

                    {/* 阶段模块徽章 */}
                    <span
                      className={`rounded px-1.5 py-0.2 font-mono text-2xs font-medium uppercase shrink-0 ${
                        trace.stage === 'WORKFLOW'
                          ? 'bg-purple-950/80 text-purple-300 border border-purple-800/60'
                          : trace.stage === 'ENGINE'
                          ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60'
                          : trace.stage === 'NORMALIZER'
                          ? 'bg-blue-950/80 text-blue-300 border border-blue-800/60'
                          : trace.stage === 'REPOSITORY'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {trace.stage}
                    </span>

                    {/* 日志消息内容 */}
                    <div className="flex-1 font-mono leading-relaxed break-all">
                      {trace.message}
                    </div>

                    {/* 耗时徽章 */}
                    {trace.duration_ms !== undefined && (
                      <span className="font-mono text-slate-500 text-2xs shrink-0 flex items-center space-x-0.5">
                        <Cpu className="h-3 w-3 text-slate-600" />
                        <span>{trace.duration_ms.toFixed(2)}ms</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
