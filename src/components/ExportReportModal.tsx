'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Copy, Check, Printer, X, FileJson } from 'lucide-react';
import { AuditReport } from '@/schemas/report.schema.ts';

interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report?: AuditReport;
}

/**
 * ============================================================================
 * 质检报告导出与打印归档模态框 (Export Report Modal Component)
 * ============================================================================
 */
export const ExportReportModal: React.FC<ExportReportModalProps> = ({
  isOpen,
  onClose,
  report,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !report) return null;

  const jsonString = JSON.stringify(report, null, 2);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AuditReport_${report.certificate_no || 'MTC'}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden"
        >
          {/* 模态框顶部 */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-4">
            <div className="flex items-center space-x-2 text-cyan-400">
              <FileJson className="h-5 w-5" />
              <h3 className="text-base font-bold text-slate-100">
                导出结构化质检核验报告
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* 内容区 */}
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">
                标准 JSON 报告契约 (包含核验明细、审计轨迹与性能度量)
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="flex items-center space-x-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-all hover:bg-slate-700 active:scale-95"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? '已复制' : '复制 JSON'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  className="flex items-center space-x-1.5 rounded-lg border border-cyan-700/60 bg-cyan-950/60 px-3 py-1.5 text-xs font-medium text-cyan-300 transition-all hover:bg-cyan-900 active:scale-95"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>下载文件</span>
                </button>
              </div>
            </div>

            {/* JSON 代码高亮框 */}
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-300 max-h-[320px] overflow-y-auto">
              <pre>{jsonString}</pre>
            </div>
          </div>

          {/* 底部按钮栏 */}
          <div className="border-t border-slate-800 bg-slate-950 px-6 py-4 flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center space-x-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition-all hover:bg-slate-700 active:scale-95"
            >
              <Printer className="h-4 w-4" />
              <span>打印质保证书与核验单</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-800 px-5 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 active:scale-95 transition-all"
            >
              完成
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
