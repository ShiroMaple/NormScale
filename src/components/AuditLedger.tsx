'use client';

import React, { useState } from 'react';

interface AuditLedgerProps {
  onLoadSampleToWorkbench?: (sampleId: string) => void;
}

interface LedgerRecord {
  taskId: string;
  batchId: string;
  certificateId: string;
  supplier: string;
  grade: string;
  standard: string;
  verdict: 'PASS' | 'FAIL' | 'HITL';
  passRate: string;
  inspector: string;
  time: string;
  sampleId: string;
}

const HISTORICAL_RECORDS: LedgerRecord[] = [
  {
    taskId: 'task_s30408_001',
    batchId: 'LOT-20260823-01',
    certificateId: 'MTC-2026-0881',
    supplier: '浙江某特种不锈钢管道实业有限公司',
    grade: '06Cr19Ni10 (S30408)',
    standard: 'GB/T 13296-2023',
    verdict: 'PASS',
    passRate: '100%',
    inspector: '张建华 (QA-8821)',
    time: '2026-08-24 10:30:15',
    sampleId: 's30408_messy_sample',
  },
  {
    taskId: 'task_316l_002',
    batchId: 'LOT-20260823-01',
    certificateId: 'MTC-2026-09102',
    supplier: '浙江某特种不锈钢管业有限公司',
    grade: '022Cr17Ni12Mo2 (S31603)',
    standard: 'GB/T 13296-2023',
    verdict: 'FAIL',
    passRate: '81.2%',
    inspector: '张建华 (QA-8821)',
    time: '2026-08-24 10:32:40',
    sampleId: '316l_kgf_sample',
  },
  {
    taskId: 'task_unknown_003',
    batchId: 'LOT-20260823-01',
    certificateId: 'MTC-2026-99381',
    supplier: '江苏某合金重工材料制造有限公司',
    grade: 'SUS 304H-Special',
    standard: 'GB/T 13296-2023',
    verdict: 'HITL',
    passRate: '挂起中',
    inspector: '待分配质检员',
    time: '2026-08-24 10:35:12',
    sampleId: 'unknown_grade_hitl_sample',
  },
];

/**
 * ============================================================================
 * 历史核验台账管理组件 (Audit Ledger - 1:1 还原 MD3 设计规范)
 * ============================================================================
 */
export const AuditLedger: React.FC<AuditLedgerProps> = ({
  onLoadSampleToWorkbench,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filteredRecords = HISTORICAL_RECORDS.filter(record => {
    const matchesSearch =
      record.certificateId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.grade.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.batchId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || record.verdict === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-5 h-[calc(100vh-4rem-2rem)] overflow-y-auto custom-scrollbar p-6 select-none">
      {/* 顶部搜索与状态过滤 */}
      <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          <div className="relative flex-1 max-w-lg">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-base">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索批次号、质保证书号、供货单位或材料牌号..."
              className="w-full rounded-lg border border-outline-variant dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low pl-9 pr-4 py-2 text-xs text-on-surface dark:text-surface-bright placeholder-on-surface-variant/60 focus:border-primary focus:outline-none font-mono"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-on-surface-variant mr-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-base">filter_list</span>
              <span>状态:</span>
            </span>
            {[
              { id: 'ALL', label: '全部台账 (3)' },
              { id: 'PASS', label: '合格放行 (1)' },
              { id: 'FAIL', label: '拒收不合格 (1)' },
              { id: 'HITL', label: '人机协同挂起 (1)' },
            ].map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setStatusFilter(cat.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  statusFilter === cat.id
                    ? 'bg-primary/10 text-primary dark:bg-primary-fixed-dim/20 dark:text-primary-fixed-dim font-bold border border-primary/30'
                    : 'bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 台账历史记录表格 */}
      <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-outline-variant/40 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">table_view</span>
            <h2 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
              历史质检台账明细与存证记录
            </h2>
          </div>
          <span className="text-xs text-on-surface-variant font-mono">共检索到 {filteredRecords.length} 笔记录</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-container-low/60 dark:bg-surface-dark-low text-on-surface-variant uppercase border-b border-outline-variant/40 font-mono">
              <tr>
                <th className="px-4 py-3">验收批次 / 证书号</th>
                <th className="px-4 py-3">供货单位</th>
                <th className="px-4 py-3">核定钢级 / 执行标准</th>
                <th className="px-4 py-3">合规裁决结论</th>
                <th className="px-4 py-3">主检工程师</th>
                <th className="px-4 py-3">核验完成时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 text-xs font-mono">
              {filteredRecords.map(record => (
                <tr key={record.taskId} className="hover:bg-surface-container-low/40 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-primary font-bold block">{record.certificateId}</span>
                    <span className="text-[11px] text-on-surface-variant">{record.batchId}</span>
                  </td>
                  <td className="px-4 py-3 font-sans font-medium text-on-surface dark:text-surface-bright max-w-xs truncate">
                    {record.supplier}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-on-surface dark:text-surface-bright font-bold block">{record.grade}</span>
                    <span className="text-[11px] text-on-surface-variant">{record.standard}</span>
                  </td>
                  <td className="px-4 py-3">
                    {record.verdict === 'PASS' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-status-pass-bg text-status-pass-text">
                        <span className="material-symbols-outlined text-xs">check_circle</span>
                        <span>合格放行 (100%)</span>
                      </span>
                    )}
                    {record.verdict === 'FAIL' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-status-fail-bg text-status-fail-text">
                        <span className="material-symbols-outlined text-xs">cancel</span>
                        <span>一票否决 (81.2%)</span>
                      </span>
                    )}
                    {record.verdict === 'HITL' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-status-hitl-bg text-status-hitl-text">
                        <span className="material-symbols-outlined text-xs">emergency_home</span>
                        <span>人机协同挂起</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-sans text-on-surface dark:text-surface-bright">{record.inspector}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{record.time}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onLoadSampleToWorkbench && onLoadSampleToWorkbench(record.sampleId)}
                      className="inline-flex items-center gap-1 text-primary font-bold hover:underline transition-colors"
                    >
                      <span>载入工作台</span>
                      <span className="material-symbols-outlined text-base">north_east</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
