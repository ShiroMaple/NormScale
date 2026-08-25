'use client';

import React, { useState } from 'react';
import { AuditReport, RuleEvaluationItemResult } from '@/schemas/report.schema.ts';
import { AlertOctagon, X, Printer, Download, FileWarning, ShieldAlert, Stamp } from 'lucide-react';

interface RejectionNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  report?: AuditReport;
}

/**
 * ============================================================================
 * 物资进货检验不合格处置通知书模态框 (Material Rejection & Disposition Notice)
 * ============================================================================
 */
export const RejectionNoticeModal: React.FC<RejectionNoticeModalProps> = ({
  isOpen,
  onClose,
  report,
}) => {
  const [dispositionChoice, setDispositionChoice] = useState<'return' | 'retest' | 'waiver'>('return');
  const [dispositionNotes, setDispositionNotes] = useState<string>(
    '该批 316L 换热管用于高压高温换热器关键承压受热面，缺少压扁与晶间腐蚀试验存在重大安全泄漏隐患，严格执行国家标准一票否决，作退货处置。'
  );

  if (!isOpen) return null;

  const certificateId = report?.certificate_no || 'MTC-2026-09102';
  const supplier = '浙江某特种不锈钢管业有限公司';
  const heatNumber = 'H316-9902';
  const lotNumber = 'LOT-990201';
  const standardCode = report?.declared_standard || 'GB/T 13296-2023';
  const standardName = '锅炉、热交换器用不锈钢无缝钢管';
  const gradeName = report?.matched_grade ? `${report.matched_grade} (${report.declared_grade})` : '022Cr17Ni12Mo2 (S31603 / 316L)';

  const missingItems = report?.missing_mandatory_items || ['压扁试验', '承压致密性试验 (水压/涡流)', '晶间腐蚀试验 (E法)'];
  const failedRules: RuleEvaluationItemResult[] = (report?.item_results || []).filter(
    (r: RuleEvaluationItemResult) => r.status === 'FAIL'
  );

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const data = {
      notice_number: 'RJN-2026-0824-002',
      certificate_id: certificateId,
      supplier,
      heat_number: heatNumber,
      lot_number: lotNumber,
      standard: `${standardCode} ${standardName}`,
      grade: gradeName,
      verdict: 'FAIL (不合格 / 一票否决)',
      missing_items: missingItems,
      failed_rules: failedRules,
      disposition: dispositionChoice,
      justification: dispositionNotes,
      inspectors: {
        lead_inspector: '张建华 (QA-8821)',
        supervisor: '李明德 (QC-002)',
      },
      timestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `不合格处置通知书_${certificateId}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl rounded-2xl border border-rose-800/80 bg-slate-900 shadow-2xl overflow-hidden my-8 text-slate-100">
        
        {/* 顶部标头 */}
        <div className="flex items-center justify-between border-b border-rose-900/60 bg-slate-950/90 px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-950/80 border border-rose-600/60 text-rose-400">
              <AlertOctagon className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h2 className="text-lg font-bold text-slate-100 tracking-tight">
                  物资进货检验不合格拒收与处置通知书
                </h2>
                <span className="rounded border border-rose-700/50 bg-rose-950/60 px-2 py-0.5 text-xs font-semibold text-rose-300 font-mono">
                  通知编号: RJN-2026-0824-002
                </span>
              </div>
              <p className="text-xs text-rose-300/80">
                依据《{standardCode} {standardName}》强制出厂检验条款出具一票否决决议
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭处置通知书"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 模态框主体内容 */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* 一票否决警告横幅与拒收钢印 */}
          <div className="flex items-center justify-between rounded-xl border border-rose-800/60 bg-rose-950/30 p-4">
            <div className="flex items-center space-x-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-900/60 border border-rose-500/40 text-rose-400">
                <ShieldAlert className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-base font-bold text-rose-300">
                    全局裁决：不合格 (FAIL) · 一票否决
                  </span>
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 text-xs font-medium text-rose-300 font-mono">
                    发现 {missingItems.length + failedRules.length} 处违规/缺项
                  </span>
                </div>
                <p className="text-xs text-rose-300/80 mt-0.5">
                  质保证书中缺少国家标准规定的强制出厂理化/工艺检验项目，属于不可豁免项，严禁直接入库。
                </p>
              </div>
            </div>

            {/* 仓库拒收留存印章效果 */}
            <div className="hidden sm:flex flex-col items-center justify-center rounded-full border-2 border-rose-500/70 p-2 w-28 h-28 rotate-[-12deg] bg-rose-950/40 text-rose-400 text-center font-bold tracking-widest uppercase text-xs shadow-lg">
              <span className="text-[10px]">物资验收控制</span>
              <span className="text-sm font-black my-0.5">拒收入库</span>
              <span className="text-[9px]">不合格退货留存</span>
            </div>
          </div>

          {/* 涉事物资基本信息网格 */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              涉事物资与质保证书明细
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-xs text-slate-500 block">供货单位</span>
                <span className="font-medium text-slate-200">{supplier}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">质保证书号</span>
                <span className="font-mono text-cyan-400 font-medium">{certificateId}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">冶炼炉号 / 批号</span>
                <span className="font-mono text-slate-200">{heatNumber} / {lotNumber}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">核定钢级</span>
                <span className="font-mono text-rose-400 font-semibold">{gradeName}</span>
              </div>
            </div>
          </div>

          {/* 不合格与违规事实清单 */}
          <div className="rounded-xl border border-rose-900/40 bg-slate-950/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-rose-300 uppercase tracking-wider flex items-center space-x-1.5">
                <FileWarning className="h-4 w-4 text-rose-400" />
                <span>不合格事实与条款依据汇总 (事实清单)</span>
              </h3>
              <span className="text-xs text-rose-400 font-medium">
                严重程度: 关键项一票否决
              </span>
            </div>

            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-2.5 w-12">序号</th>
                  <th className="px-4 py-2.5">违规项目 / 条款</th>
                  <th className="px-4 py-2.5">质保书报送状态 / 实测事实</th>
                  <th className="px-4 py-2.5">国家标准强制依据</th>
                  <th className="px-4 py-2.5 text-center">判定级别</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {missingItems.map((item, idx) => (
                  <tr key={`missing-${idx}`} className="hover:bg-rose-950/10 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-200">{item}</td>
                    <td className="px-4 py-2.5 text-rose-300 font-mono">未在质保证书中报送任何试验与实测记录</td>
                    <td className="px-4 py-2.5 text-slate-300">
                      违反《{standardCode}》第 {idx === 0 ? '6.4.1' : idx === 1 ? '6.5' : '6.6'} 条款规定
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-950/80 text-rose-300 border border-rose-700/60">
                        一票否决
                      </span>
                    </td>
                  </tr>
                ))}
                {failedRules.map((r: RuleEvaluationItemResult, idx: number) => (
                  <tr key={`failed-${idx}`} className="hover:bg-rose-950/10 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-slate-400">{missingItems.length + idx + 1}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-200">{r.display_name}</td>
                    <td className="px-4 py-2.5 text-rose-300 font-mono">实测: {r.actual_value_text || r.measured_value_raw || '-'} (超标)</td>
                    <td className="px-4 py-2.5 text-slate-300">标准要求: {r.standard_requirement_text}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-950/80 text-rose-300 border border-rose-700/60">
                        超标不合格
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 质检处置决定与审批建议 */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              质检处置决议与审批意见
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className={`flex items-start space-x-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                dispositionChoice === 'return' 
                  ? 'border-rose-600 bg-rose-950/30' 
                  : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/50'
              }`}>
                <input
                  type="radio"
                  name="disposition"
                  value="return"
                  checked={dispositionChoice === 'return'}
                  onChange={() => setDispositionChoice('return')}
                  className="mt-0.5 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-200 block">选项 A：全批退货拒收 (推荐)</span>
                  <span className="text-[11px] text-slate-400">一票否决，全批退回供应商并作入库拒收登记。</span>
                </div>
              </label>

              <label className={`flex items-start space-x-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                dispositionChoice === 'retest' 
                  ? 'border-amber-600 bg-amber-950/30' 
                  : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/50'
              }`}>
                <input
                  type="radio"
                  name="disposition"
                  value="retest"
                  checked={dispositionChoice === 'retest'}
                  onChange={() => setDispositionChoice('retest')}
                  className="mt-0.5 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-200 block">选项 B：暂扣并限期补验</span>
                  <span className="text-[11px] text-slate-400">现场就地封存，通知供应商48h内补做权威复验报告。</span>
                </div>
              </label>

              <label className={`flex items-start space-x-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                dispositionChoice === 'waiver' 
                  ? 'border-cyan-600 bg-cyan-950/30' 
                  : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/50'
              }`}>
                <input
                  type="radio"
                  name="disposition"
                  value="waiver"
                  checked={dispositionChoice === 'waiver'}
                  onChange={() => setDispositionChoice('waiver')}
                  className="mt-0.5 text-cyan-600 focus:ring-cyan-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-200 block">选项 C：特批降级使用</span>
                  <span className="text-[11px] text-slate-400">转为非承压常温辅助管线（须总工特批签署）。</span>
                </div>
              </label>
            </div>

            <div>
              <label htmlFor="disposition-notes" className="text-xs text-slate-400 block mb-1">处置技术依据与说明记录：</label>
              <textarea
                id="disposition-notes"
                value={dispositionNotes}
                onChange={e => setDispositionNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-rose-500 focus:outline-none"
              />
            </div>
          </div>

          {/* 会签与签章栏 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-rose-400">
                <Stamp className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs text-slate-400 block">质检责任工程师 (初审)</span>
                <span className="font-semibold text-slate-200">张建华 (QA-8821)</span>
                <span className="text-[11px] text-rose-400 block">建议全批拒收退货</span>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                <ShieldAlert className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <span className="text-xs text-slate-400 block">质保部/技术主管 (终审)</span>
                <span className="font-semibold text-slate-200">李明德 (QC-002)</span>
                <span className="text-[11px] text-emerald-400 block">已审批同意拒收处置方案</span>
              </div>
            </div>
          </div>
        </div>

        {/* 底部动作栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-950/90 px-6 py-4">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center space-x-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>导出处置单据 JSON</span>
            </button>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center space-x-1.5 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 transition-colors"
            >
              <Printer className="h-4 w-4" />
              <span>一键打印 A4 拒收通知书</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-500 transition-colors shadow-lg shadow-rose-950"
            >
              完成处置并归档
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
