'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, ArrowRight, ShieldCheck, Ban, UserCheck } from 'lucide-react';
import { HitlInterruptContext, HumanCorrectionInput } from '@/workflow/state.interface.ts';

interface HitlDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  hitlContext?: HitlInterruptContext;
  taskId?: string;
  onSubmitResume: (correction: HumanCorrectionInput) => Promise<void>;
  isSubmitting?: boolean;
}

/**
 * ============================================================================
 * 人机协同 (HITL) 质检员干预抽屉组件 (Human-in-the-Loop Drawer Component)
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
  const [selectedGrade, setSelectedGrade] = useState<string>('06Cr19Ni10');
  const [customGrade, setCustomGrade] = useState<string>('');
  const [inspectorId, setInspectorId] = useState<string>('QA-Inspector-8821');
  const [waiverNotes, setWaiverNotes] = useState<string>('经与技术协议及采购订单核对，确认此批物资实际对应国家标准 06Cr19Ni10 (S30408) 牌号');

  if (!isOpen || !hitlContext) return null;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalGrade = customGrade.trim() || selectedGrade;
    await onSubmitResume({
      corrected_grade: finalGrade,
      inspector_id: inspectorId,
      waiver_notes: waiverNotes,
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/70 backdrop-blur-sm">
        {/* 遮罩背景点击关闭 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0"
        />

        {/* 滑出抽屉主体 */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-amber-800/60 bg-slate-900 shadow-2xl"
        >
          {/* 抽屉顶部标头 */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-amber-950/30 px-6 py-4">
            <div className="flex items-center space-x-2.5 text-amber-300">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <div>
                <h3 className="text-base font-bold tracking-tight text-slate-100">
                  人机协同质检复核 (HITL Interruption)
                </h3>
                <span className="font-mono text-xs text-amber-400/80">
                  任务编号: {taskId || 'TASK-HITL'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* 抽屉表单内容区 */}
          <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-sm">
            {/* 挂起原因提示框 */}
            <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-4 text-amber-200">
              <span className="block text-xs font-semibold uppercase text-amber-400 tracking-wider">
                挂起原因: {hitlContext.reason}
              </span>
              <p className="mt-1.5 text-sm leading-relaxed text-amber-100 font-medium">
                {hitlContext.prompt_message}
              </p>
            </div>

            {/* 1. 国家标准材料牌号确认与修正 */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-200">
                1. 指定 / 修正对应国家标准材料牌号
              </label>

              {/* 推荐候选牌号快捷选择 */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  { grade: '06Cr19Ni10', label: '06Cr19Ni10 (S30408)', sub: '通用奥氏体 · 推荐匹配' },
                  { grade: '07Cr19Ni10', label: '07Cr19Ni10 (S30409)', sub: '高温用 304H 对应标准' },
                  { grade: '022Cr17Ni12Mo2', label: '022Cr17Ni12Mo2 (S31603)', sub: '含钼耐酸 316L 标准牌号' },
                  { grade: '06Cr18Ni11Ti', label: '06Cr18Ni11Ti (S32168)', sub: '含钛稳定化 321 标准牌号' },
                ].map(cand => (
                  <button
                    key={cand.grade}
                    type="button"
                    onClick={() => {
                      setSelectedGrade(cand.grade);
                      setCustomGrade('');
                    }}
                    className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all duration-150 active:scale-95 ${
                      selectedGrade === cand.grade && !customGrade
                        ? 'border-cyan-500 bg-cyan-950/40 text-cyan-300 ring-1 ring-cyan-500/50'
                        : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-mono text-sm font-semibold text-slate-100">
                      {cand.label}
                    </span>
                    <span className="text-xs text-slate-400 mt-0.5">{cand.sub}</span>
                  </button>
                ))}
              </div>

              {/* 自定义输入框 */}
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="或手动输入其它国家标准牌号 (如 022Cr19Ni10)..."
                  value={customGrade}
                  onChange={e => setCustomGrade(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            {/* 2. 质检工程师签章与放行说明 */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <label className="block text-sm font-semibold text-slate-200">
                2. 质检工程师签章与特批放行依据 (Waiver Justification)
              </label>

              <div>
                <label className="block text-xs text-slate-400 mb-1">审核工程师工号 / 姓名</label>
                <div className="flex items-center space-x-2">
                  <UserCheck className="h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={inspectorId}
                    onChange={e => setInspectorId(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm font-mono text-slate-100 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">放行与修正技术说明</label>
                <textarea
                  rows={3}
                  value={waiverNotes}
                  onChange={e => setWaiverNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          </form>

          {/* 抽屉底部动作栏 */}
          <div className="border-t border-slate-800 bg-slate-950 px-6 py-4 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center space-x-1.5 rounded-lg border border-rose-800/60 bg-rose-950/30 px-4 py-2 text-sm font-medium text-rose-300 transition-all hover:bg-rose-900/40 active:scale-95"
            >
              <Ban className="h-4 w-4" />
              <span>拒收该批物资</span>
            </button>

            <button
              type="button"
              onClick={handleFormSubmit}
              disabled={isSubmitting}
              className="flex items-center space-x-2 rounded-lg bg-cyan-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-cyan-500 active:scale-95 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>{isSubmitting ? '正在恢复执行...' : '提交修正并恢复核验'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
