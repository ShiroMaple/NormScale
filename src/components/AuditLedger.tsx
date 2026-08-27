'use client';

import React, { useState } from 'react';
import { InspectionSession, DEFAULT_INSPECTION_SESSION } from '@/types/session.ts';

interface AuditLedgerProps {
  onLoadSessionToWorkbench?: (session: InspectionSession) => void;
}

// 模拟历史作业会话台账数据 (以 Session 为核心单元)
const HISTORICAL_SESSIONS: InspectionSession[] = [
  DEFAULT_INSPECTION_SESSION,
  {
    sessionId: 'SESS-20260825-091520-C3D4E5F6',
    createdAt: '2026-08-25 09:15:20',
    title: 'PetroChemical HeatEx Proj-02 · 特种承压合金管批次复验',
    totalDocuments: 2,
    totalBatches: 3,
    passedBatches: 3,
    failedBatches: 0,
    hitlBatches: 0,
    documents: [
      {
        docId: 'doc_hist_01',
        filename: 'Zhejiang_SpecialPipe_MTC_20260825.pdf',
        fileSize: '2.1 MB',
        uploadTime: '2026-08-25 09:15',
        ocrStatus: 'DONE',
        pageCount: 2,
        batches: [
          {
            batchNo: 'ZJ-2026-0881',
            subBatchIndex: 1,
            grade: '022Cr17Ni12Mo2 (S31603)',
            standard: 'GB/T 13296-2023',
            supplier: '浙江某特种不锈钢管业有限公司',
            dimensions: 'OD 25.0mm × WT 2.0mm × L 6000mm',
            heatNo: 'HT-2026-0881',
            verdict: 'PASS',
            verdictSummary: '全项符合 GB/T 13296-2023 锅炉管执行标准',
            ocrConfidence: 98,
            gradeMatchConfidence: 99,
            chemical: [
              { element: 'C', value: '0.025', confidence: '99%', status: 'ok' },
              { element: 'Si', value: '0.45', confidence: '98%', status: 'ok' },
              { element: 'Mn', value: '1.20', confidence: '97%', status: 'ok' },
              { element: 'P', value: '0.035', confidence: '95%', status: 'ok' },
              { element: 'S', value: '0.008', confidence: '96%', status: 'ok' },
              { element: 'Ni', value: '10.20', confidence: '99%', status: 'ok' },
              { element: 'Cr', value: '16.80', confidence: '98%', status: 'ok' },
              { element: 'Mo', value: '2.05', confidence: '97%', status: 'ok' },
            ],
            mechanical: {
              tensile_rm: '58.5 kgf/mm² (573.68 MPa)',
              yield_rp02: '24.5 kgf/mm² (240.26 MPa)',
              elongation_a: '45.0 %',
              hardness: '85.0 HRB',
            },
            process: {
              flattening: 'PASS',
              intergranularCorrosion: 'PASS',
              ndt: '涡流探伤 (ET) 合格',
            },
            reportNo: 'QA-20260825-0881',
            sha256Hash: 'd4c3b2a198fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b999',
            inspector: 'OP-9921 (QA)',
          },
        ],
      },
    ],
  },
];

/**
 * ============================================================================
 * 历史核验台账管理组件 (Audit Ledger - 以 Session 为核心单元，支持两层下钻与回载)
 * ============================================================================
 */
export const AuditLedger: React.FC<AuditLedgerProps> = ({
  onLoadSessionToWorkbench,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(
    new Set([DEFAULT_INSPECTION_SESSION.sessionId])
  );

  const toggleExpand = (sessionId: string) => {
    const next = new Set(expandedSessionIds);
    if (next.has(sessionId)) {
      next.delete(sessionId);
    } else {
      next.add(sessionId);
    }
    setExpandedSessionIds(next);
  };

  const filteredSessions = HISTORICAL_SESSIONS.filter(sess => {
    const q = searchQuery.toLowerCase();
    return (
      sess.sessionId.toLowerCase().includes(q) ||
      sess.title.toLowerCase().includes(q) ||
      sess.documents.some(d =>
        d.filename.toLowerCase().includes(q) ||
        d.batches.some(b => b.batchNo.toLowerCase().includes(q) || b.grade.toLowerCase().includes(q))
      )
    );
  });

  return (
    <div className="space-y-5 h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar p-6 select-none max-w-[1440px] mx-auto w-full">
      {/* 顶部搜索与统计 */}
      <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="relative flex-1 max-w-lg">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-base">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索 Session ID、项目背景、文档名称或炉批号..."
              className="w-full rounded-lg border border-outline-variant dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low pl-9 pr-4 py-2 text-xs text-on-surface dark:text-surface-bright placeholder-on-surface-variant/60 focus:border-primary focus:outline-none font-mono"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-on-surface-variant dark:text-outline-variant font-mono">
            <span>总计会话: <strong className="text-on-surface dark:text-surface-bright">{HISTORICAL_SESSIONS.length}</strong></span>
            <span>•</span>
            <span>已入库批次: <strong className="text-status-pass-text">8 PASS</strong></span>
          </div>
        </div>
      </div>

      {/* 会话台账列表卡片 */}
      <div className="space-y-4">
        {filteredSessions.map(session => {
          const isExpanded = expandedSessionIds.has(session.sessionId);
          return (
            <div
              key={session.sessionId}
              className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark overflow-hidden shadow-xs"
            >
              {/* Session 主行卡片 */}
              <div className="p-4 bg-surface-container-low/60 dark:bg-surface-dark-low flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/30 dark:border-border-dark">
                <div className="flex items-start md:items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(session.sessionId)}
                    className="p-1 rounded-lg hover:bg-surface-container-high dark:hover:bg-surface-dark-high text-on-surface-variant transition-colors mt-0.5 md:mt-0"
                  >
                    <span className="material-symbols-outlined text-lg">
                      {isExpanded ? 'expand_more' : 'chevron_right'}
                    </span>
                  </button>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-xs text-primary dark:text-primary-fixed-dim">
                        {session.sessionId}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-surface-container-high dark:bg-surface-dark-high text-[11px] font-mono text-on-surface-variant">
                        {session.totalDocuments} 份文档 · {session.totalBatches} 个炉批
                      </span>
                      <span className="px-2 py-0.5 rounded bg-status-pass-bg text-status-pass-text font-bold text-[10px]">
                        {session.passedBatches} PASS
                      </span>
                      {session.failedBatches > 0 && (
                        <span className="px-2 py-0.5 rounded bg-status-fail-bg text-status-fail-text font-bold text-[10px]">
                          {session.failedBatches} FAIL
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-on-surface dark:text-surface-bright font-medium mt-1">
                      {session.title}
                    </p>
                  </div>
                </div>

                {/* 右侧动作与时间 */}
                <div className="flex items-center gap-3 self-end md:self-center">
                  <span className="text-[11px] font-mono text-on-surface-variant dark:text-outline-variant">
                    {session.createdAt}
                  </span>

                  <button
                    type="button"
                    onClick={() => onLoadSessionToWorkbench && onLoadSessionToWorkbench(session)}
                    className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-base">restore_page</span>
                    <span>加载至工作台</span>
                  </button>
                </div>
              </div>

              {/* 展开的文档与批次两层子表格 */}
              {isExpanded && (
                <div className="p-4 space-y-3 bg-surface-container-lowest dark:bg-surface-dark">
                  {session.documents.map((doc, docIdx) => (
                    <div
                      key={doc.docId}
                      className="border border-outline-variant/40 dark:border-border-dark rounded-xl p-3.5 space-y-2.5 bg-surface-container-low/30 dark:bg-surface-dark-low/40"
                    >
                      {/* 第 1 层：文档标题 */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-red-500 text-lg fill-1">picture_as_pdf</span>
                          <strong className="font-mono text-on-surface dark:text-surface-bright">{doc.filename}</strong>
                          <span className="text-[11px] text-on-surface-variant">({doc.fileSize} • {doc.pageCount} 页)</span>
                        </div>
                        <span className="text-[11px] font-mono text-on-surface-variant">文档 #{docIdx + 1}</span>
                      </div>

                      {/* 第 2 层：批次列表 */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant text-[11px] border-b border-outline-variant/30">
                            <tr>
                              <th className="px-3 py-1.5">炉批号 (Heat No)</th>
                              <th className="px-3 py-1.5">材料牌号</th>
                              <th className="px-3 py-1.5">规格</th>
                              <th className="px-3 py-1.5">判定结论</th>
                              <th className="px-3 py-1.5">存证报告号</th>
                              <th className="px-3 py-1.5">检验员</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20 dark:divide-border-dark/40">
                            {doc.batches.map(b => (
                              <tr key={b.batchNo} className="hover:bg-surface-container-low/50 dark:hover:bg-surface-dark-low/50">
                                <td className="px-3 py-2 font-bold text-on-surface dark:text-surface-bright">{b.batchNo}</td>
                                <td className="px-3 py-2 text-primary dark:text-primary-fixed-dim">{b.grade}</td>
                                <td className="px-3 py-2 text-on-surface-variant dark:text-outline-variant">{b.dimensions}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                    b.verdict === 'PASS'
                                      ? 'bg-status-pass-bg text-status-pass-text'
                                      : 'bg-status-fail-bg text-status-fail-text'
                                  }`}>
                                    {b.verdict === 'PASS' ? '✓ 合格放行' : '✗ 拒收不合格'}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-on-surface-variant dark:text-outline-variant">{b.reportNo}</td>
                                <td className="px-3 py-2 text-on-surface-variant dark:text-outline-variant">{b.inspector}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
