'use client';

import React from 'react';
import { FileText, Building2, Tag, Flame, Ruler, FlaskConical, ArrowRight, Shield } from 'lucide-react';
import { AuditReport } from '@/schemas/report.schema.ts';

interface CertificateViewerProps {
  report?: AuditReport;
  isLoading?: boolean;
}

/**
 * ============================================================================
 * 左列：质保证书结构化解析视图 (Certificate Extracted Structured Viewer)
 * ============================================================================
 */
export const CertificateViewer: React.FC<CertificateViewerProps> = ({
  report,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="flex h-full min-h-[500px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
          <p className="text-sm text-slate-400">正在解析与归一化质保证书数据...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex h-full min-h-[500px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center text-slate-500">
        <FileText className="h-10 w-10 text-slate-600 mb-2" />
        <p className="text-sm font-medium">请在上方选择或提交一份质量证明书</p>
      </div>
    );
  }

  const isGradeNormalized =
    report.matched_grade &&
    report.declared_grade &&
    report.matched_grade !== report.declared_grade;

  return (
    <div className="flex flex-col space-y-4">
      {/* 质保书基本元数据卡片 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <FileText className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
              质保书表头追溯元数据
            </h3>
          </div>
          <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs font-medium text-slate-300">
            {report.certificate_no}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
          <div className="flex items-center space-x-2 text-slate-300">
            <Building2 className="h-4 w-4 text-slate-500 shrink-0" />
            <span className="text-slate-400">供货单位:</span>
            <span className="font-medium text-slate-200 line-clamp-1">
              {report.supplier_name || report.supplier || '--'}
            </span>
          </div>

          <div className="flex items-center space-x-2 text-slate-300">
            <Shield className="h-4 w-4 text-slate-500 shrink-0" />
            <span className="text-slate-400">声明标准:</span>
            <span className="font-mono font-medium text-cyan-300">
              {report.declared_standard || '--'}
            </span>
          </div>

          <div className="flex items-center space-x-2 text-slate-300">
            <Tag className="h-4 w-4 text-slate-500 shrink-0" />
            <span className="text-slate-400">声明材料牌号:</span>
            <div className="flex items-center space-x-1.5">
              <span className="font-mono font-medium text-slate-200">
                {report.declared_grade || '--'}
              </span>
              {isGradeNormalized && (
                <div className="flex items-center space-x-1 text-xs text-cyan-400 bg-cyan-950/60 border border-cyan-800/80 px-1.5 py-0.2 rounded">
                  <ArrowRight className="h-3 w-3" />
                  <span className="font-mono font-semibold">{report.matched_grade}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 text-slate-300">
            <Flame className="h-4 w-4 text-slate-500 shrink-0" />
            <span className="text-slate-400">冶炼炉号 / 批号:</span>
            <span className="font-mono font-medium text-slate-200">
              {report.heat_number || '--'} / {report.lot_number || '--'}
            </span>
          </div>
        </div>
      </div>

      {/* 几何规格与交货工艺状态卡片 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
          <Ruler className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
            几何规格与供货状态
          </h3>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-slate-950/60 border border-slate-800/80 p-2.5">
            <span className="block text-xs text-slate-400">交货几何规格 (Dimensions)</span>
            <span className="mt-1 block font-mono text-base font-semibold text-slate-100">
              {report.dimensions || '--'}
            </span>
          </div>

          <div className="rounded-lg bg-slate-950/60 border border-slate-800/80 p-2.5">
            <span className="block text-xs text-slate-400">交货热处理状态 (Delivery State)</span>
            <span className="mt-1 block text-sm font-medium text-emerald-400 truncate">
              {report.delivery_state || '标准固溶/热处理交货'}
            </span>
          </div>
        </div>
      </div>

      {/* 提取到的单项实测指标明细卡片 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <FlaskConical className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
              结构化实测理化检验项 ({report.item_results.length} 项)
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            按国家标准执行归一化
          </span>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-slate-800/80">
          <div className="max-h-[360px] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-950/90 text-xs font-medium text-slate-400 backdrop-blur-sm">
                <tr>
                  <th className="px-3.5 py-2.5">类别</th>
                  <th className="px-3.5 py-2.5">检验项目</th>
                  <th className="px-3.5 py-2.5 font-mono text-right">测得值</th>
                  <th className="px-3.5 py-2.5">单位</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 text-slate-200">
                {report.item_results.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-3.5 py-2 text-xs text-slate-400">
                      {item.category === 'chemical' ? '化学成分' :
                       item.category === 'mechanical' ? '力学性能' :
                       item.category === 'process' ? '工艺性能' :
                       item.category === 'ndt' ? '无损检测' :
                       item.category === 'corrosion' ? '耐腐蚀' : '其它项目'}
                    </td>
                    <td className="px-3.5 py-2 font-medium text-slate-200">
                      {item.display_name || item.property_key}
                    </td>
                    <td className="px-3.5 py-2 font-mono text-sm font-semibold text-right tabular-nums text-slate-100">
                      {item.actual_value_text || item.measured_value_raw || (item.measured_value_num !== undefined ? String(item.measured_value_num) : '未测')}
                    </td>
                    <td className="px-3.5 py-2 text-xs text-slate-400 font-mono">
                      {item.property_key === 'tensile_strength' || item.property_key === 'yield_strength' ? 'MPa' :
                       item.category === 'chemical' ? '%' : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
