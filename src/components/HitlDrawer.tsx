'use client';

import React, { useState } from 'react';
import { HitlInterruptContext, HumanCorrectionInput } from '@/workflow/state.interface.ts';

interface HitlDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  hitlContext?: HitlInterruptContext;
  taskId: string;
  onSubmitResume: (correction: HumanCorrectionInput) => Promise<void>;
  isSubmitting: boolean;
}

/**
 * ============================================================================
 * 人机协同干预抽屉组件 (HITL Review Drawer - 480px 工业风设计)
 * 对应 hitl/code.html 设计规范
 * ============================================================================
 */
export const HitlDrawer: React.FC<HitlDrawerProps> = ({
  isOpen,
  onClose,
  hitlContext,
  taskId,
  onSubmitResume,
  isSubmitting,
}) => {
  const [selectedGrade, setSelectedGrade] = useState<string>('S30408');
  const [customGrade, setCustomGrade] = useState<string>('');
  const [justification, setJustification] = useState<string>(
    '根据质保书化学成分（Cr 18.2%, Ni 8.3%）及供货合同技术协议，确认该材料牌号对应国家标准 06Cr19Ni10 (S30408)，予以人工消歧锁定。'
  );
  const [isWaiver, setIsWaiver] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const finalGrade = selectedGrade === 'CUSTOM' ? customGrade : selectedGrade;
    await onSubmitResume({
      corrected_grade: finalGrade,
      waiver_notes: isWaiver ? justification : undefined,
      inspector_id: '张建华 (QA-8821)',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end select-none">
      {/* 遮罩背景 */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
      />

      {/* 480px 抽屉主体 */}
      <div className="relative w-full max-w-[480px] h-full bg-surface-container-lowest dark:bg-surface-dark border-l border-outline-variant/60 dark:border-border-dark shadow-2xl flex flex-col z-10 text-on-surface dark:text-surface-bright overflow-hidden">
        
        {/* 顶部标头 */}
        <div className="p-5 border-b border-outline-variant/40 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-status-hitl-bg text-status-hitl-text flex items-center justify-center border border-purple-200 dark:border-purple-900 shadow-xs">
                <span className="material-symbols-outlined text-2xl">emergency_home</span>
              </div>
              <div>
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-status-hitl-bg text-status-hitl-text text-[11px] font-bold">
                  质检任务已挂起 · 需人工复核
                </span>
                <h2 className="font-mono text-sm font-bold mt-0.5 text-on-surface dark:text-surface-bright">
                  任务编号: #{taskId || 'TK-20260823-01'}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          <div className="text-xs text-on-surface-variant dark:text-outline-variant flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary text-base">auto_awesome</span>
            <span>阶段：材料牌号消歧与抽取置信度复核</span>
          </div>
        </div>

        {/* 抽屉滚动内容区 */}
        <div className="flex-1 p-5 overflow-y-auto custom-scrollbar space-y-5 text-xs">
          
          {/* 挂起事实与原因说明 */}
          <div className="rounded-xl border border-purple-200 dark:border-purple-900/60 bg-status-hitl-bg p-4 space-y-1 shadow-xs">
            <span className="font-bold text-status-hitl-text block">
              挂起原因：{hitlContext?.prompt_message || '材料牌号无法在知识库中直接唯一定位'}
            </span>
            <p className="text-[11px] text-status-hitl-text/90 leading-relaxed font-sans">
              质保书声明牌号触发安全置信度门禁阈值，需质检工程师指定国家标准候选钢级或特批放行。
            </p>
          </div>

          {/* 候选钢级消歧单选 (对齐 hitl/code.html) */}
          <div className="space-y-2.5">
            <label className="font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider text-[11px]">
              选择推荐候选国家标准钢级 (Recommended Candidates)
            </label>

            {[
              { id: 'S30408', code: '06Cr19Ni10 (S30408)', match: '95% 匹配 (推荐)', standard: 'GB/T 13296-2023', recommended: true },
              { id: 'S30403', code: '022Cr19Ni10 (S30403 / 304L)', match: '88% 匹配', standard: 'GB/T 13296-2023' },
              { id: 'S32168', code: '06Cr18Ni11Ti (S32168 / 321)', match: '75% 匹配', standard: 'GB/T 13296-2023' },
            ].map(cand => (
              <label
                key={cand.id}
                className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                  selectedGrade === cand.id
                    ? 'border-primary dark:border-primary-fixed-dim bg-primary/5 dark:bg-primary-fixed-dim/10 shadow-xs'
                    : 'border-outline-variant/60 dark:border-border-dark hover:border-outline bg-surface-container-lowest dark:bg-surface-dark'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="candidateGrade"
                    value={cand.id}
                    checked={selectedGrade === cand.id}
                    onChange={() => {
                      setSelectedGrade(cand.id);
                      setIsWaiver(false);
                    }}
                    className="text-primary focus:ring-primary h-3.5 w-3.5"
                  />
                  <div>
                    <span className="font-mono font-bold text-on-surface dark:text-surface-bright block">
                      {cand.code}
                    </span>
                    <span className="text-[10px] text-on-surface-variant dark:text-outline-variant font-sans">
                      {cand.standard}
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  cand.recommended
                    ? 'bg-status-pass-bg text-status-pass-text'
                    : 'bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant'
                }`}>
                  {cand.match}
                </span>
              </label>
            ))}

            {/* 手动输入自定义牌号 */}
            <label className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
              selectedGrade === 'CUSTOM'
                ? 'border-primary dark:border-primary-fixed-dim bg-primary/5'
                : 'border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark'
            }`}>
              <input
                type="radio"
                name="candidateGrade"
                value="CUSTOM"
                checked={selectedGrade === 'CUSTOM'}
                onChange={() => {
                  setSelectedGrade('CUSTOM');
                  setIsWaiver(false);
                }}
                className="text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <div className="flex-1">
                <span className="font-medium text-on-surface dark:text-surface-bright block mb-1">
                  手动指定其他标准钢级代号
                </span>
                {selectedGrade === 'CUSTOM' && (
                  <input
                    type="text"
                    value={customGrade}
                    onChange={e => setCustomGrade(e.target.value)}
                    placeholder="例如: S31603 或 022Cr17Ni12Mo2"
                    className="w-full text-xs border border-outline-variant dark:border-border-dark rounded-lg bg-surface-container-lowest dark:bg-surface-dark px-3 py-1.5 text-on-surface dark:text-surface-bright focus:border-primary focus:outline-none font-mono"
                  />
                )}
              </div>
            </label>
          </div>

          {/* 质检员处理依据与说明 */}
          <div className="space-y-1.5">
            <label htmlFor="hitl-justification" className="font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider text-[11px]">
              质检处理依据与说明记录 (必填)
            </label>
            <textarea
              id="hitl-justification"
              value={justification}
              onChange={e => setJustification(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark px-3 py-2 text-xs text-on-surface dark:text-surface-bright focus:border-primary focus:outline-none font-sans"
            />
          </div>

          {/* 签名防伪指示 */}
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low text-[11px] text-on-surface-variant">
            <span className="material-symbols-outlined text-emerald-600 text-lg shrink-0">verified_user</span>
            <span>本次人工修正将记录于审计轨迹中，主检工程师：张建华 (QA-8821)。</span>
          </div>
        </div>

        {/* 抽屉底部动作栏 */}
        <div className="p-4 border-t border-outline-variant/40 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 border border-outline-variant dark:border-border-dark rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-lowest transition-colors"
          >
            <span className="material-symbols-outlined text-base">schedule</span>
            <span>挂起暂不处理</span>
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-5 py-2 bg-primary hover:bg-primary-container text-on-primary rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-base ${isSubmitting ? 'animate-spin' : ''}`}>
              {isSubmitting ? 'autorenew' : 'play_arrow'}
            </span>
            <span>{isSubmitting ? '正在恢复执行...' : '确认修正并恢复流转'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
