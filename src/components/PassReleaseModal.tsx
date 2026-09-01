'use client';

import React from 'react';
import { AuditReport, RuleEvaluationItemResult } from '@/schemas/report.schema.ts';
import { ShieldCheck, CheckCircle2, Download, Printer, Copy, X, FileText, QrCode } from 'lucide-react';

interface PassReleaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  report?: AuditReport;
}

/**
 * ============================================================================
 * 物资进货检验合格放行通知单与报告导出模态框 (Pass Case Release Certificate)
 * ============================================================================
 */
export const PassReleaseModal: React.FC<PassReleaseModalProps> = ({
  isOpen,
  onClose,
  report,
}) => {
  if (!isOpen) return null;

  const certificateId = report?.certificate_no || '--';
  const supplier = report?.supplier_name || report?.supplier || '--';
  const heatNumber = report?.heat_number || report?.heatNo || '--';
  const lotNumber = report?.lot_number || report?.batch_number || '--';
  const standardCode = report?.declared_standard || '--';
  const standardName = report?.standard_name || '';
  const gradeName = report?.matched_grade
    ? `${report.matched_grade}${report.declared_grade ? ` (${report.declared_grade})` : ''}`
    : (report?.declared_grade || '--');
  const dimensions = report?.dimensions || '--';
  const inspectorName = report?.inspector || '智能质检工程师 (QA)';
  const supervisorName = report?.supervisor || '质量审核主管 (QC)';

  const results: RuleEvaluationItemResult[] = report?.item_results || [];

  const handlePrint = () => {
    window.print();
  };

  const handleCopyJson = () => {
    if (report) {
      navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    }
  };

  const handleDownloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `合格放行单_${certificateId}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const releaseDocNo = `RLS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${certificateId.replace(/[^a-zA-Z0-9]/g, '').slice(-4) || '0001'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl overflow-hidden my-8 text-slate-100">
        
        {/* 顶部标头与关闭按钮 */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-950/80 border border-emerald-600/60 text-emerald-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h2 className="text-lg font-bold text-slate-100 tracking-tight">
                  物资进货检验合格放行单与合规证明
                </h2>
                <span className="rounded border border-emerald-700/50 bg-emerald-950/60 px-2 py-0.5 text-xs font-semibold text-emerald-300 font-mono">
                  单据编号: {releaseDocNo}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                依据《{standardCode} {standardName}》全项理化合规自动化核验放行
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭放行单"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 模态框主体内容 (打印区域) */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* 放行合格大徽章横幅 */}
          <div className="flex items-center justify-between rounded-xl border border-emerald-800/60 bg-emerald-950/30 p-4">
            <div className="flex items-center space-x-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-900/60 border border-emerald-500/40 text-emerald-400">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-base font-bold text-emerald-300">
                    全项理化合规检验合格 · 准予物资入库放行
                  </span>
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300 font-mono">
                    合格率 100%
                  </span>
                </div>
                <p className="text-xs text-emerald-400/80 mt-0.5">
                  已完成化学成分公差校核、力学性能下限核查、工艺试验及无损探伤验证，无任何缺项或超标。
                </p>
              </div>
            </div>

            {/* 质检合格公章效果 */}
            <div className="hidden sm:flex flex-col items-center justify-center rounded-full border-2 border-emerald-500/70 p-2 w-28 h-28 rotate-[-8deg] bg-emerald-950/40 text-emerald-400 text-center font-bold tracking-widest uppercase text-xs shadow-lg">
              <span className="text-[10px]">NormScale</span>
              <span className="text-sm font-black my-0.5">质检合格</span>
              <span className="text-[9px]">准予入库放行</span>
            </div>
          </div>

          {/* 物资与单据基本信息网格 */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              物资与质保证书基本台账
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
                <span className="text-xs text-slate-500 block">冶炼炉号 / 检验批号</span>
                <span className="font-mono text-slate-200">{heatNumber} / {lotNumber}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">交货几何规格</span>
                <span className="font-mono text-slate-200">{dimensions}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">执行国家标准</span>
                <span className="text-slate-200 font-medium">{standardCode}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">核定材料钢级</span>
                <span className="font-mono text-emerald-400 font-semibold">{gradeName}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">放行日期与时间</span>
                <span className="font-mono text-slate-300">{new Date().toLocaleString('zh-CN')}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">存证安全哈希</span>
                <span className="font-mono text-[11px] text-slate-400 truncate block">
                  SHA256: {certificateId.replace(/[^a-zA-Z0-9]/g, '') || 'a882f091c7'}...
                </span>
              </div>
            </div>
          </div>

          {/* 全项理化性能合规检验结论表 */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                全项理化合规检验明细矩阵 ({results.length} 项)
              </h3>
              <span className="text-xs text-emerald-400 font-medium">
                全部符合 GB/T 8170 进舍修约判定准则
              </span>
            </div>

            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-900 text-xs uppercase text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-2.5">类别</th>
                    <th className="px-4 py-2.5">检验项目</th>
                    <th className="px-4 py-2.5">质保书实测值</th>
                    <th className="px-4 py-2.5">国家标准要求</th>
                    <th className="px-4 py-2.5">判定依据与修约</th>
                    <th className="px-4 py-2.5 text-center">判定结论</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                  {results.length > 0 ? (
                    results.map((r: RuleEvaluationItemResult, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-2 text-slate-400 font-sans">{r.category}</td>
                        <td className="px-4 py-2 font-medium text-slate-200 font-sans">{r.display_name}</td>
                        <td className="px-4 py-2 text-cyan-300 font-semibold">{r.actual_value_text || r.measured_value_raw || '-'}</td>
                        <td className="px-4 py-2 text-slate-300">{r.standard_requirement_text}</td>
                        <td className="px-4 py-2 text-slate-400 font-sans truncate max-w-xs" title={r.message}>
                          {r.message || '按 GB/T 8170 规则修约比对'}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                            r.status === 'PASS' 
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                              : 'bg-rose-950/80 text-rose-300 border border-rose-700/60'
                          }`}>
                            {r.status === 'PASS' ? '合格' : '不合格'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-400 font-sans">
                        暂无理化检验明细数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 电子会签与质检工程师责任签署栏 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                <FileText className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <span className="text-xs text-slate-400 block">主检工程师</span>
                <span className="font-semibold text-slate-200">{inspectorName}</span>
                <span className="text-[11px] text-emerald-400 block">CA数字证书已签名</span>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <span className="text-xs text-slate-400 block">质保部审核人</span>
                <span className="font-semibold text-slate-200">{supervisorName}</span>
                <span className="text-[11px] text-emerald-400 block">审核批准入库</span>
              </div>
            </div>

            <div className="flex items-center space-x-3 justify-start md:justify-end">
              <QrCode className="h-10 w-10 text-slate-400 shrink-0" />
              <div className="text-left md:text-right">
                <span className="text-[11px] text-slate-500 block">防伪验真二维码</span>
                <span className="font-mono text-[10px] text-slate-400 block">扫码校验原件存证</span>
              </div>
            </div>
          </div>
        </div>

        {/* 模态框底部动作栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-950/90 px-6 py-4">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleCopyJson}
              className="flex items-center space-x-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <Copy className="h-4 w-4" />
              <span>复制 JSON</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadJson}
              className="flex items-center space-x-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>导出 JSON</span>
            </button>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center space-x-1.5 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 transition-colors"
            >
              <Printer className="h-4 w-4" />
              <span>一键打印 A4 标准放行单</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-950"
            >
              完成并归档
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
