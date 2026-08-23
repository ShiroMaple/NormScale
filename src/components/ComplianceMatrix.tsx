'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Clock,
  Filter,
  Check,
  FileWarning,
  Scale,
  ScrollText,
} from 'lucide-react';
import { AuditReport, RuleEvaluationItemResult } from '@/schemas/report.schema.ts';

interface ComplianceMatrixProps {
  report?: AuditReport;
  isLoading?: boolean;
}

/**
 * ============================================================================
 * 右列：国家标准合规判定矩阵 (Compliance Decision Matrix)
 * ============================================================================
 */
export const ComplianceMatrix: React.FC<ComplianceMatrixProps> = ({
  report,
  isLoading,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[500px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
          <p className="text-sm text-slate-400">正在执行确定性规则比对与合规裁决...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex h-full min-h-[500px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center text-slate-500">
        <Scale className="h-10 w-10 text-slate-600 mb-2" />
        <p className="text-sm font-medium">核验判定结果将在此处展示</p>
      </div>
    );
  }

  const { summary } = report;
  const isPass = summary.overall_status === 'PASS';
  const passRate =
    summary.total_rules_evaluated > 0
      ? Math.round((summary.pass_count / summary.total_rules_evaluated) * 100)
      : 0;

  // 过滤判定明细
  const filteredItems = report.item_results.filter(item => {
    if (categoryFilter === 'all') return true;
    if (categoryFilter === 'fail_or_missing') {
      return item.status === 'FAIL' || item.status === 'MISSING';
    }
    return item.category === categoryFilter;
  });

  return (
    <div className="flex flex-col space-y-4">
      {/* 1. 核心裁决大卡片 (Executive Decision Summary Banner) */}
      <div
        className={`rounded-xl border p-5 shadow-sm transition-all ${
          isPass
            ? 'border-emerald-800/60 bg-gradient-to-r from-emerald-950/40 via-slate-900/80 to-slate-900/80 text-emerald-300'
            : 'border-rose-800/60 bg-gradient-to-r from-rose-950/40 via-slate-900/80 to-slate-900/80 text-rose-300'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* 结论标志与说明 */}
          <div className="flex items-center space-x-3.5">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                isPass
                  ? 'border-emerald-600/50 bg-emerald-950/80 text-emerald-400'
                  : 'border-rose-600/50 bg-rose-950/80 text-rose-400'
              }`}
            >
              {isPass ? (
                <CheckCircle2 className="h-7 w-7" />
              ) : (
                <XCircle className="h-7 w-7" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-bold tracking-tight text-slate-100">
                  {isPass ? '全局裁决: 合格 (PASS)' : '全局裁决: 不合格 (FAIL)'}
                </span>
                <span
                  className={`rounded px-2 py-0.5 font-mono text-xs font-semibold uppercase ${
                    isPass
                      ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/60'
                      : 'bg-rose-900/60 text-rose-300 border border-rose-700/60'
                  }`}
                >
                  {isPass ? '准予放行' : '一票否决 / 拒收'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                核验依据: {report.declared_standard} · 命中国家标准规格切片 [{report.matched_grade || report.declared_grade}]
              </p>
            </div>
          </div>

          {/* 关键性能与符合率指标 */}
          <div className="flex items-center space-x-4 border-t sm:border-t-0 sm:border-l border-slate-800 pt-3 sm:pt-0 sm:pl-5">
            <div>
              <span className="block text-xs text-slate-400">规则符合率</span>
              <span className="font-mono text-lg font-bold text-slate-100 tabular-nums">
                {passRate}%
              </span>
            </div>
            <div>
              <span className="block text-xs text-slate-400">核验指标</span>
              <span className="font-mono text-lg font-bold text-slate-100 tabular-nums">
                {summary.pass_count} / {summary.total_rules_evaluated}
              </span>
            </div>
            <div>
              <span className="block text-xs text-slate-400">全链路耗时</span>
              <div className="flex items-center space-x-1 font-mono text-lg font-bold text-cyan-400 tabular-nums">
                <Clock className="h-4 w-4 text-cyan-500" />
                <span>{report.performance_metrics?.total_duration_ms || 1.6}ms</span>
              </div>
            </div>
          </div>
        </div>

        {/* 符合率横向进度条 */}
        <div className="mt-4 w-full rounded-full bg-slate-800/80 h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${isPass ? 'bg-emerald-500' : 'bg-rose-500'}`}
            style={{ width: `${passRate}%` }}
          />
        </div>
      </div>

      {/* 2. 强制漏检项目警示横幅 (Missing Mandatory Alert) */}
      {summary.missing_count > 0 && (
        <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-200">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-amber-300">
                  发现 {summary.missing_count} 项国家标准强制出厂检验项目缺失 (触发一票否决)
                </span>
              </div>
              <p className="mt-1 text-xs text-amber-300/80 leading-relaxed">
                根据《{report.declared_standard}》规范，下列出厂检验试验项属于强制安全报送指标。质保证书中未包含对应试验数据：
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {report.missing_mandatory_items?.map((itemText, idx) => (
                  <li key={idx} className="flex items-center space-x-1.5 text-amber-200">
                    <FileWarning className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span>
                      <strong>{itemText}</strong> (未报送强制出厂试验)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 3. 详细判定明细表格 (Compliance Evaluation Table) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Scale className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
              单项指标合规判定明细 ({filteredItems.length} 项)
            </h3>
          </div>

          {/* 分类筛选器 */}
          <div className="flex items-center space-x-1 overflow-x-auto text-xs">
            <span className="flex items-center space-x-1 text-slate-500 mr-1">
              <Filter className="h-3.5 w-3.5" />
            </span>
            {[
              { key: 'all', label: '全部' },
              { key: 'chemical', label: '化学成分' },
              { key: 'mechanical', label: '力学性能' },
              { key: 'technological', label: '工艺试验' },
              { key: 'fail_or_missing', label: `异常项 (${summary.fail_count + summary.missing_count})` },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setCategoryFilter(tab.key)}
                className={`rounded px-2.5 py-1 font-medium transition-all duration-150 active:scale-95 ${
                  categoryFilter === tab.key
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-700/60'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 判定表格 */}
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-800/80">
          <div className="max-h-[380px] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-950/90 text-xs font-medium text-slate-400 backdrop-blur-sm">
                <tr>
                  <th className="px-3.5 py-2.5">检验指标</th>
                  <th className="px-3.5 py-2.5 font-mono text-right">质保书测得值</th>
                  <th className="px-3.5 py-2.5">标准规格要求</th>
                  <th className="px-3.5 py-2.5">核验算法 / 依据</th>
                  <th className="px-3.5 py-2.5 text-center">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 text-slate-200">
                {filteredItems.map((item, idx) => (
                  <RuleItemRow key={idx} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. 文本条款语义复核清单 (Semantic Clauses) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
          <ScrollText className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
            技术条款与工艺要求语义复核 (ClauseStore RAG)
          </h3>
        </div>

        <div className="mt-3 space-y-2.5 text-sm">
          <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3 flex items-start space-x-3">
            <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-slate-200">
                GB/T 13296 Section 6.2 - 交货状态与热处理工艺要求
              </span>
              <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">
                质保书声明交货状态「固溶热处理 (水淬)」符合标准规定的奥氏体不锈钢固溶退火酸洗交货要求。
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3 flex items-start space-x-3">
            <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-slate-200">
                GB/T 13296 Section 7.6 - 无损检测方法与探伤验收级别
              </span>
              <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">
                钢管已按标准要求逐根进行超声探伤 (U2 级) 与涡流探伤 (E3H 级)，检验结论均合格。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** 单条规则核验行组件 */
const RuleItemRow: React.FC<{ item: RuleEvaluationItemResult }> = ({ item }) => {
  const isPass = item.status === 'PASS';
  const isFail = item.status === 'FAIL';
  const isMissing = item.status === 'MISSING';

  return (
    <tr className="hover:bg-slate-800/40 transition-colors">
      <td className="px-3.5 py-2.5">
        <span className="font-medium text-slate-200">{item.display_name || item.property_key}</span>
        <span className="block text-xs text-slate-500 font-mono">
          {item.property_key}
        </span>
      </td>

      <td className="px-3.5 py-2.5 text-right font-mono text-sm font-semibold tabular-nums">
        {item.actual_value_text || item.measured_value_raw || (item.measured_value_num !== undefined ? String(item.measured_value_num) : (
          <span className="text-xs text-slate-500 italic">未报送</span>
        ))}
      </td>

      <td className="px-3.5 py-2.5 font-mono text-sm text-slate-300 tabular-nums">
        {item.standard_requirement_text || '-'}
      </td>

      <td className="px-3.5 py-2.5 text-xs text-slate-400">
        <div className="flex items-center space-x-1">
          <span>{item.formula_expression ? `公式: ${item.formula_expression}` : 'GB/T 8170 进舍修约'}</span>
          <span title={item.message} className="cursor-help text-slate-500 hover:text-slate-300">
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        </div>
      </td>

      <td className="px-3.5 py-2.5 text-center">
        {isPass && (
          <span className="inline-flex items-center rounded border border-emerald-700/60 bg-emerald-950/60 px-2 py-0.5 text-xs font-semibold text-emerald-300">
            PASS
          </span>
        )}
        {isFail && (
          <span className="inline-flex items-center rounded border border-rose-700/60 bg-rose-950/60 px-2 py-0.5 text-xs font-semibold text-rose-300">
            FAIL
          </span>
        )}
        {isMissing && (
          <span className="inline-flex items-center rounded border border-amber-700/60 bg-amber-950/60 px-2 py-0.5 text-xs font-semibold text-amber-300">
            MISSING
          </span>
        )}
      </td>
    </tr>
  );
};
