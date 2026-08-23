'use client';

import React from 'react';
import { ShieldCheck, Activity, Database, Download, RefreshCw } from 'lucide-react';
import { StandardOverviewDto } from '@/lib/api-client.ts';

interface HeaderProps {
  standardsData?: { total_standards: number; total_slices: number; standards: StandardOverviewDto[] };
  isAuditing?: boolean;
  onRefresh?: () => void;
  onOpenExport?: () => void;
}

/**
 * ============================================================================
 * 看板顶部导航栏组件 (Header Component)
 * ============================================================================
 */
export const Header: React.FC<HeaderProps> = ({
  standardsData,
  isAuditing,
  onRefresh,
  onOpenExport,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* 系统标志与主标题 */}
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-950/60 border border-cyan-700/50 text-cyan-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-base font-bold tracking-tight text-slate-100">
                NormScale
              </span>
              <span className="rounded border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 text-xs font-medium text-slate-300">
                v0.1.0
              </span>
            </div>
            <p className="text-xs text-slate-400">
              工业质量证明书智能合规核验引擎与物资验收决策看板
            </p>
          </div>
        </div>

        {/* 状态指示与全局动作栏 */}
        <div className="flex items-center space-x-4">
          {/* 标准库装载状态指标 */}
          <div className="hidden sm:flex items-center space-x-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-300">
            <Database className="h-4 w-4 text-cyan-400" />
            <span>
              已装载{' '}
              <strong className="font-semibold text-slate-100">
                {standardsData?.total_standards || 1}
              </strong>{' '}
              部标准 ·{' '}
              <strong className="font-semibold text-cyan-400 font-mono">
                {standardsData?.total_slices || 31}
              </strong>{' '}
              个规格切片
            </span>
          </div>

          {/* 运行状态指示器 */}
          <div className="flex items-center space-x-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-300">
            <Activity className={`h-4 w-4 ${isAuditing ? 'animate-spin text-cyan-400' : 'text-emerald-400'}`} />
            <span>{isAuditing ? '状态机执行中...' : '运行就绪'}</span>
          </div>

          {/* 刷新与导出按钮 */}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isAuditing}
              aria-label="刷新状态"
              className="flex items-center space-x-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-sm font-medium text-slate-200 transition-all duration-150 hover:bg-slate-700 hover:text-white active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isAuditing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">重置</span>
            </button>
          )}

          {onOpenExport && (
            <button
              type="button"
              onClick={onOpenExport}
              className="flex items-center space-x-1.5 rounded-lg border border-cyan-600/40 bg-cyan-950/40 px-3.5 py-1.5 text-sm font-medium text-cyan-300 transition-all duration-150 hover:bg-cyan-900/60 hover:text-cyan-100 active:scale-95"
            >
              <Download className="h-4 w-4" />
              <span>导出报告</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
