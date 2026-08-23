'use client';

import React from 'react';
import { Layers, FileCheck, AlertCircle, Sparkles, SlidersHorizontal } from 'lucide-react';
import { PresetSampleDto } from '@/lib/api-client.ts';
import { WorkflowOptions } from '@/workflow/state.interface.ts';

interface UploadZoneProps {
  samples: PresetSampleDto[];
  selectedSampleId: string;
  onSelectSample: (sampleId: string) => void;
  options: WorkflowOptions;
  onOptionsChange: (options: WorkflowOptions) => void;
  disabled?: boolean;
}

/**
 * ============================================================================
 * 样本选择与核验控制栏组件 (Upload & Sample Selector Zone)
 * ============================================================================
 */
export const UploadZone: React.FC<UploadZoneProps> = ({
  samples,
  selectedSampleId,
  onSelectSample,
  options,
  onOptionsChange,
  disabled,
}) => {
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  return (
    <div className="w-full rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5 shadow-sm">
      {/* 预设典型样本选择栏 */}
      <div className="flex flex-col space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold tracking-wide text-slate-200 uppercase">
              典型工业质保书测试样本 (一键载入与全流程核验)
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center space-x-1 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>{showAdvanced ? '收起配置' : '核验参数'}</span>
          </button>
        </div>

        {/* 样本卡片列表 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {samples.map(sample => {
            const isSelected = sample.id === selectedSampleId;
            return (
              <button
                key={sample.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelectSample(sample.id)}
                className={`relative flex flex-col items-start rounded-lg border p-3.5 text-left transition-all duration-150 active:scale-95 disabled:opacity-50 ${
                  isSelected
                    ? 'border-cyan-500/80 bg-cyan-950/30 ring-1 ring-cyan-500/40 shadow-sm'
                    : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900/80'
                }`}
              >
                {/* 顶部标题与状态指示 */}
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    {sample.expected_outcome === 'PASS' && (
                      <FileCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                    )}
                    {sample.expected_outcome === 'FAIL' && (
                      <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                    )}
                    {sample.expected_outcome === 'AWAITING_HUMAN_REVIEW' && (
                      <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
                    )}
                    <span className="text-sm font-medium text-slate-100 line-clamp-1">
                      {sample.title}
                    </span>
                  </div>
                </div>

                {/* 样本说明与标签 */}
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed line-clamp-2">
                  {sample.description}
                </p>

                <div className="mt-2.5 flex flex-wrap gap-1">
                  {sample.tags.map(tag => (
                    <span
                      key={tag}
                      className="rounded bg-slate-800/80 px-1.5 py-0.5 text-xs font-normal text-slate-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* 高级核验配置面板 (可折叠) */}
        {showAdvanced && (
          <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-950/60 p-3.5 text-sm text-slate-300">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="min-confidence-input" className="block text-xs font-medium text-slate-400">
                  OCR 最低安全置信度阈值 (低于此值触发人机协同)
                </label>
                <div className="mt-1 flex items-center space-x-3">
                  <input
                    id="min-confidence-input"
                    type="range"
                    min="0.5"
                    max="0.99"
                    step="0.05"
                    value={options.minConfidenceThreshold ?? 0.8}
                    onChange={e =>
                      onOptionsChange({
                        ...options,
                        minConfidenceThreshold: parseFloat(e.target.value),
                      })
                    }
                    className="h-1.5 w-full cursor-pointer rounded-lg bg-slate-700 accent-cyan-500"
                  />
                  <span className="font-mono text-sm text-cyan-400">
                    {((options.minConfidenceThreshold ?? 0.8) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2 sm:pt-4">
                <input
                  type="checkbox"
                  id="skip-semantic"
                  checked={options.skipSemanticReview ?? false}
                  onChange={e =>
                    onOptionsChange({
                      ...options,
                      skipSemanticReview: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-600 focus:ring-cyan-500"
                />
                <label htmlFor="skip-semantic" className="text-sm text-slate-300 cursor-pointer">
                  跳过文本性条款语义复核 (仅执行确定性数值比对)
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
