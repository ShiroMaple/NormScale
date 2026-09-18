'use client';

import React from 'react';
import { PresetSampleDto } from '@/lib/api-client.ts';

export interface ScenarioMatrixSectionProps {
  scenarioSamples: PresetSampleDto[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  loadingScenarios: Record<string, boolean>;
  onLoadScenarioFile: (sample: PresetSampleDto) => void;
}

/**
 * 分层核验场景测试用例矩阵区 (步骤 1)
 * 展示各类牌号消歧、替代条款合规、理化超标等典型验证样本，支持一键装载原件
 */
export const ScenarioMatrixSection: React.FC<ScenarioMatrixSectionProps> = ({
  scenarioSamples,
  isExpanded,
  onToggleExpand,
  loadingScenarios,
  onLoadScenarioFile,
}) => {
  if (process.env.NEXT_PUBLIC_ENABLE_TEST_FIXTURES === 'false' || scenarioSamples.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 pt-3 border-t border-outline-variant/30 dark:border-border-dark">
      <div
        onClick={onToggleExpand}
        className="flex justify-between items-center cursor-pointer select-none group py-0.5 hover:opacity-90 transition-opacity"
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-base">
            fact_check
          </span>
          <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center gap-2">
            <span>典型场景测试用例</span>
            <span className="px-1.5 py-0.2 rounded-full bg-primary/10 text-primary dark:text-primary-fixed-dim text-[11px] font-medium">
              {scenarioSamples.length} 个场景
            </span>
          </h3>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="flex items-center gap-1 text-xs font-medium text-on-surface-variant hover:text-primary dark:hover:text-primary-fixed-dim transition-colors px-2 py-1 rounded-lg hover:bg-surface-container-high dark:hover:bg-surface-dark-high cursor-pointer"
        >
          <span>{isExpanded ? '收起' : '展开'}</span>
          <span className="material-symbols-outlined text-base transition-transform duration-200">
            {isExpanded ? 'expand_less' : 'expand_more'}
          </span>
        </button>
      </div>

      {/* 4 栏卡片网格 (受控折叠展开，默认折叠) */}
      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {scenarioSamples.map((sc, idx) => {
            const isPass = sc.expected_outcome === 'PASS';
            const isFail = sc.expected_outcome === 'FAIL';
            const isHitl = sc.expected_outcome === 'AWAITING_HUMAN_REVIEW';
            const badgeTheme = isPass
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
              : isFail
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                : isHitl
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                  : 'bg-surface-container-high text-on-surface-variant';

            return (
              <div
                key={sc.id || idx}
                className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-3.5 shadow-xs flex flex-col justify-between hover:border-primary transition-all group relative"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeTheme}`}>
                      {sc.tier_flow || (isPass ? 'PASS 通过' : isFail ? 'FAIL 否定' : 'HITL 挂起')}
                    </span>
                    <span className="text-[10px] text-on-surface-variant dark:text-outline-variant">
                      {sc.declared_grade}
                    </span>
                  </div>

                  <div>
                    <h4
                      className="text-xs font-bold text-on-surface dark:text-surface-bright line-clamp-1 group-hover:text-primary transition-colors"
                      title={sc.title}
                    >
                      {sc.title}
                    </h4>
                    <p
                      className="text-[11px] text-on-surface-variant dark:text-outline-variant leading-relaxed line-clamp-2 mt-1"
                      title={sc.description}
                    >
                      {sc.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {sc.tags?.map((tag, tIdx) => (
                      <span
                        key={tIdx}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant dark:text-outline-variant"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-3 mt-2 border-t border-outline-variant/30 dark:border-border-dark flex items-center justify-between gap-2">
                  {sc.download_url && (
                    <a
                      href={sc.download_url}
                      download={sc.filename || `${sc.id}.pdf`}
                      className="text-[11px] text-on-surface-variant hover:text-primary dark:hover:text-primary-fixed-dim font-medium flex items-center gap-1 transition-colors"
                      title="下载高清矢量 PDF 原件"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="material-symbols-outlined text-[14px]">download</span>
                      <span>下载原件</span>
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={Boolean(loadingScenarios[sc.id])}
                    onClick={() => onLoadScenarioFile(sc)}
                    className={`ml-auto px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-xs transition-colors flex items-center gap-1 ${
                      loadingScenarios[sc.id]
                        ? 'bg-primary/60 text-on-primary cursor-wait'
                        : 'bg-primary hover:bg-primary-container text-on-primary cursor-pointer'
                    }`}
                    title="将该测试用例高清矢量 PDF 原件装载入待处理队列"
                  >
                    <span
                      className={`material-symbols-outlined text-[13px] ${
                        loadingScenarios[sc.id] ? 'animate-spin' : ''
                      }`}
                    >
                      {loadingScenarios[sc.id] ? 'progress_activity' : 'play_circle'}
                    </span>
                    <span>{loadingScenarios[sc.id] ? '装载原件中...' : '一键装载'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
