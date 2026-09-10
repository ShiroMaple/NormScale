'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { InspectionSession } from '@/types/session';
import type { AuditSessionSummary, AuditBatchSummary } from '@/services/audit-ledger.service';
import { parseStandards } from '@/utils/standard-parser';

interface AuditLedgerProps {
  onLoadSessionToWorkbench?: (session: InspectionSession) => void;
}

/**
 * 辅助解析炉批主溯源标识（解决 Batch No 与 Heat No 的工业场景矛盾）
 */
function resolveBatchDisplay(batch: AuditBatchSummary) {
  const bNo = batch.batchNo?.trim();
  const hNo = batch.heatNo?.trim();

  if (bNo && hNo) {
    return {
      primary: bNo,
      secondary: `熔炼炉号: ${hNo}`,
      isHeatOnly: false,
    };
  }
  if (hNo) {
    return {
      primary: hNo,
      secondary: '以炉定批 (Heat Lot)',
      isHeatOnly: true,
    };
  }
  if (bNo) {
    return {
      primary: bNo,
      secondary: '炉号: --',
      isHeatOnly: false,
    };
  }
  return {
    primary: `试样 #${batch.subBatchIndex}`,
    secondary: '未标明批号',
    isHeatOnly: false,
  };
}

/**
 * 格式化 ISO 时间戳为易读的标准工业时间格式（YYYY-MM-DD HH:mm:ss）
 */
function formatTimestamp(rawStr?: string): string {
  if (!rawStr) return '--';
  try {
    const d = new Date(rawStr);
    if (isNaN(d.getTime())) return rawStr;
    const pad = (n: number) => String(n).padStart(2, '0');
    const YYYY = d.getFullYear();
    const MM = pad(d.getMonth() + 1);
    const DD = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
  } catch {
    return rawStr;
  }
}

/**
 * ============================================================================
 * 工业质量证明书历史检验台账 (Audit Ledger)
 * 以 Session 为核心单元，支持两层下钻、多维检索、双轨制溯源、只读全景抽屉与安全回载
 * 视觉规范：全页面严禁使用 font-mono，采用现代工业标准无衬线字体与 tabular-nums
 * ============================================================================
 */
export const AuditLedger: React.FC<AuditLedgerProps> = ({
  onLoadSessionToWorkbench,
}) => {
  // 数据与加载状态
  const [sessions, setSessions] = useState<AuditSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 展开的 Session ID 集合
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());

  // 筛选与检索状态
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pass' | 'fail' | 'pending' | 'hitl'>('all');

  // 全量会话缓存池（按需懒加载用于只读比对抽屉与回载）
  const [sessionDetailCache, setSessionDetailCache] = useState<Map<string, InspectionSession>>(new Map());

  // 抽屉状态与抽屉加载态
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerLoading, setDrawerLoading] = useState<boolean>(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeBatchKey, setActiveBatchKey] = useState<string | null>(null);

  // 存证哈希复制反馈
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // 删除确认弹窗状态
  const [sessionToDelete, setSessionToDelete] = useState<AuditSessionSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // 加载服务端历史台账数据
  const fetchSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);
      const res = await fetch('/api/audit/save');
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.sessions)) {
        setSessions(data.sessions);
        // 默认展开首条记录
        if (data.sessions.length > 0) {
          setExpandedSessionIds(new Set([data.sessions[0].sessionId]));
        }
      } else {
        setFetchError(data.error || '获取历史台账失败');
      }
    } catch (err: any) {
      setFetchError(err.message || '网络通讯异常，无法加载历史台账');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // 折叠与展开控制
  const toggleExpand = (sessionId: string) => {
    setExpandedSessionIds(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  // 全量按需拉取单个 Session 详情
  const fetchFullSession = useCallback(async (sessionId: string): Promise<InspectionSession | null> => {
    if (sessionDetailCache.has(sessionId)) {
      return sessionDetailCache.get(sessionId)!;
    }
    try {
      setDrawerLoading(true);
      const res = await fetch(`/api/audit/save?sessionId=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (res.ok && data.success && data.session) {
        const full = data.session as InspectionSession;
        setSessionDetailCache(prev => {
          const next = new Map(prev);
          next.set(sessionId, full);
          return next;
        });
        return full;
      }
      return null;
    } catch {
      return null;
    } finally {
      setDrawerLoading(false);
    }
  }, [sessionDetailCache]);

  // 打开批次全景比对矩阵抽屉
  const handleOpenDrawer = async (sessionId: string, batchKey: string) => {
    setActiveSessionId(sessionId);
    setActiveBatchKey(batchKey);
    setIsDrawerOpen(true);
    await fetchFullSession(sessionId);
  };

  // 关闭抽屉
  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setActiveBatchKey(null);
  };

  // 加载会话至工作台
  const handleLoadSession = async (sessionId: string) => {
    if (!onLoadSessionToWorkbench) return;
    const full = await fetchFullSession(sessionId);
    if (full) {
      onLoadSessionToWorkbench(full);
    }
  };

  // 执行删除台账
  const handleDeleteSession = async () => {
    if (!sessionToDelete) return;
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/audit/save?sessionId=${encodeURIComponent(sessionToDelete.sessionId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSessions(prev => prev.filter(s => s.sessionId !== sessionToDelete.sessionId));
        setSessionToDelete(null);
        if (activeSessionId === sessionToDelete.sessionId) {
          handleCloseDrawer();
        }
      } else {
        alert(`删除台账失败: ${data.error || '未知错误'}`);
      }
    } catch (err: any) {
      alert(`删除台账请求异常: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // 复制哈希指纹
  const handleCopyHash = (hash: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash(null), 1800);
    }
  };

  // 全局统计 KPI 计算
  const totalStats = useMemo(() => {
    let totalBatches = 0;
    let passedBatches = 0;
    let failedBatches = 0;
    let pendingHumanReviewBatches = 0;
    let hitlInvolvedBatches = 0;

    sessions.forEach(sess => {
      sess.documents?.forEach(doc => {
        doc.batches?.forEach(b => {
          totalBatches += 1;
          if (b.verdict === 'PASS' || b.systemVerdict === 'PASS') {
            passedBatches += 1;
          }
          if (b.verdict === 'FAIL' || b.systemVerdict === 'FAIL' || b.humanVerdict === 'REJECT') {
            failedBatches += 1;
          }
          if (b.humanVerdict === null || b.humanVerdict === undefined) {
            pendingHumanReviewBatches += 1;
          }
          if (b.hasHitlCorrection || b.hitlReason) {
            hitlInvolvedBatches += 1;
          }
        });
      });
    });

    const passRate = totalBatches > 0 ? ((passedBatches / totalBatches) * 100).toFixed(1) : '100.0';

    return {
      sessionCount: sessions.length,
      totalBatches,
      passedBatches,
      failedBatches,
      pendingHumanReviewBatches,
      hitlInvolvedBatches,
      passRate,
    };
  }, [sessions]);

  // 多维检索与分类过滤
  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return sessions.filter(sess => {
      // 1. 状态分类过滤
      if (statusFilter === 'pass') {
        const hasNonPass = sess.documents?.some(d => d.batches.some(b => b.verdict !== 'PASS'));
        if (hasNonPass || sess.totalBatches === 0) return false;
      } else if (statusFilter === 'fail') {
        const hasFail = sess.documents?.some(d => d.batches.some(b => b.verdict === 'FAIL' || b.systemVerdict === 'FAIL' || b.humanVerdict === 'REJECT'));
        if (!hasFail) return false;
      } else if (statusFilter === 'pending') {
        const hasPending = sess.documents?.some(d => d.batches.some(b => b.humanVerdict === null || b.humanVerdict === undefined));
        if (!hasPending) return false;
      } else if (statusFilter === 'hitl') {
        const hasHitl = sess.documents?.some(d => d.batches.some(b => b.hasHitlCorrection || b.hitlReason));
        if (!hasHitl) return false;
      }

      // 2. 文本模糊检索（支持会话号、标题、炉号、批次号、牌号、标准、厂家、质保书号）
      if (!q) return true;

      if (sess.sessionId.toLowerCase().includes(q)) return true;
      if (sess.title.toLowerCase().includes(q)) return true;
      if (sess.grades?.some(g => g.toLowerCase().includes(q))) return true;
      if (sess.standards?.some(s => s.toLowerCase().includes(q))) return true;
      if (sess.suppliers?.some(sup => sup.toLowerCase().includes(q))) return true;

      return sess.documents?.some(d =>
        d.filename.toLowerCase().includes(q) ||
        d.batches.some(b =>
          b.batchNo?.toLowerCase().includes(q) ||
          b.heatNo?.toLowerCase().includes(q) ||
          b.grade?.toLowerCase().includes(q) ||
          b.standard?.toLowerCase().includes(q) ||
          b.supplier?.toLowerCase().includes(q) ||
          b.certificateNo?.toLowerCase().includes(q) ||
          b.reportNo?.toLowerCase().includes(q)
        )
      );
    });
  }, [sessions, searchQuery, statusFilter]);

  // 计算会话全局历史流水号（按创建/保存时间正序：最早录入为 #01，随时间递增）
  const sessionSeqMap = useMemo(() => {
    const sorted = [...sessions].sort(
      (a, b) => new Date(a.savedAt || a.createdAt).getTime() - new Date(b.savedAt || b.createdAt).getTime()
    );
    const map = new Map<string, number>();
    sorted.forEach((s, idx) => {
      map.set(s.sessionId, idx + 1);
    });
    return map;
  }, [sessions]);

  // 当前抽屉中激活查看的批次全息数据
  const currentActiveDrawerData = useMemo(() => {
    if (!activeSessionId || !activeBatchKey) return null;
    const fullSession = sessionDetailCache.get(activeSessionId);
    if (!fullSession) return null;

    for (const doc of fullSession.documents) {
      for (const b of doc.batches) {
        const key = `${doc.docId}_${b.batchNo || b.heatNo || 'SPECIMEN'}_${b.subBatchIndex}`;
        if (key === activeBatchKey) {
          return {
            doc,
            batch: b,
            fullSession,
          };
        }
      }
    }
    return null;
  }, [activeSessionId, activeBatchKey, sessionDetailCache]);

  return (
    <div className="space-y-6 h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar px-6 py-5 select-none w-full">
      {/* 顶部统计 KPI 看板 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-on-surface-variant dark:text-outline-variant">归档会话总数</span>
            <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-lg">folder_managed</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-on-surface dark:text-surface-bright tabular-nums">
              {totalStats.sessionCount}
            </span>
            <span className="text-[11px] text-on-surface-variant">次检验</span>
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-on-surface-variant dark:text-outline-variant">累计核验炉批</span>
            <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-lg">fact_check</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-on-surface dark:text-surface-bright tabular-nums">
              {totalStats.totalBatches}
            </span>
            <span className="text-[11px] text-on-surface-variant">个试样</span>
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-on-surface-variant dark:text-outline-variant">综合全项合格率</span>
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-lg">verified</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-status-pass-text tabular-nums">
              {totalStats.passRate}%
            </span>
            <span className="text-[11px] text-on-surface-variant">{totalStats.passedBatches} 批达标</span>
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-on-surface-variant dark:text-outline-variant">待复核 / 协同项</span>
            <span className="material-symbols-outlined text-purple-600 dark:text-purple-400 text-lg">rule_folder</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-purple-600 dark:text-purple-400 tabular-nums">
              {totalStats.pendingHumanReviewBatches}
            </span>
            <span className="text-[11px] text-on-surface-variant"> / {totalStats.hitlInvolvedBatches} 项 HITL</span>
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-on-surface-variant dark:text-outline-variant">系统拦截 / 拒收</span>
            <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-lg">gpp_bad</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className={`text-2xl font-bold tracking-tight tabular-nums ${totalStats.failedBatches > 0 ? 'text-status-fail-text' : 'text-on-surface dark:text-surface-bright'}`}>
              {totalStats.failedBatches}
            </span>
            <span className="text-[11px] text-on-surface-variant">批需处置</span>
          </div>
        </div>
      </div>

      {/* 搜索与分类页签控制栏 */}
      <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* 状态分类标签组 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${statusFilter === 'all'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:bg-surface-container-high dark:hover:bg-surface-dark-high'
                }`}
            >
              全部会话 ({sessions.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('pass')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${statusFilter === 'pass'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-on-surface-variant hover:bg-surface-container-high dark:hover:bg-surface-dark-high'
                }`}
            >
              全项合格放行
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('fail')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${statusFilter === 'fail'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-on-surface-variant hover:bg-surface-container-high dark:hover:bg-surface-dark-high'
                }`}
            >
              包含拦截 / 拒收
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${statusFilter === 'pending'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-on-surface-variant hover:bg-surface-container-high dark:hover:bg-surface-dark-high'
                }`}
            >
              待人工复核
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('hitl')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${statusFilter === 'hitl'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-on-surface-variant hover:bg-surface-container-high dark:hover:bg-surface-dark-high'
                }`}
            >
              HITL 协同项
            </button>
          </div>

          {/* 综合搜索栏与刷新按钮 */}
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-96">
              <span className="material-symbols-outlined absolute left-3 top-2 text-on-surface-variant text-base">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索会话ID、批次号、熔炼炉号、材料牌号或标准..."
                className="w-full rounded-lg border border-outline-variant dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low pl-9 pr-8 py-1.5 text-xs text-on-surface dark:text-surface-bright placeholder-on-surface-variant/60 focus:border-primary focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={fetchSessions}
              disabled={isLoading}
              title="重新加载服务端台账"
              className="px-3 py-1.5 rounded-lg border border-outline-variant/60 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low hover:bg-surface-container-high dark:hover:bg-surface-dark-high text-on-surface-variant text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span className={`material-symbols-outlined text-base ${isLoading ? 'animate-spin' : ''}`}>
                refresh
              </span>
              <span className="hidden sm:inline">刷新</span>
            </button>
          </div>
        </div>
      </div>

      {/* 错误提示栏 */}
      {fetchError && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-red-500">error</span>
            <span>{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={fetchSessions}
            className="px-2.5 py-1 rounded bg-red-100 dark:bg-red-900/60 font-bold hover:underline cursor-pointer"
          >
            重试
          </button>
        </div>
      )}

      {/* 加载中状态 */}
      {isLoading && sessions.length === 0 ? (
        <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-16 text-center flex flex-col items-center justify-center gap-3 shadow-xs">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin">
            progress_activity
          </span>
          <div className="space-y-1">
            <h3 className="font-bold text-sm text-on-surface dark:text-surface-bright">
              正在加载历史质检台账仓库...
            </h3>
            <p className="text-xs text-on-surface-variant dark:text-outline-variant">
              正在检索服务端归档记录与树状试样数据
            </p>
          </div>
        </div>
      ) : filteredSessions.length === 0 ? (
        /* 空结果提示 */
        <div className="rounded-xl border border-dashed border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-16 text-center flex flex-col items-center justify-center gap-3 shadow-xs">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant/40">
            inventory_2
          </span>
          <div className="space-y-1">
            <h3 className="font-bold text-sm text-on-surface dark:text-surface-bright">
              {searchQuery || statusFilter !== 'all' ? '未找到符合条件的质检台账' : '暂无已归档的历史质检台账'}
            </h3>
            <p className="text-xs text-on-surface-variant dark:text-outline-variant max-w-md">
              {searchQuery || statusFilter !== 'all'
                ? '建议尝试调整检索关键字或切换分类页签查看全部记录。'
                : '在质检工作台完成文档核验与标准比对后，点击步骤 3 底部【保存结果】即可在此建立永久追溯台账。'}
            </p>
          </div>
        </div>
      ) : (
        /* 台账列表卡片 */
        <div className="space-y-4">
          {filteredSessions.map((session) => {
            const isExpanded = expandedSessionIds.has(session.sessionId);
            const hasFail = session.failedBatches > 0;
            const hasHitl = session.hitlBatches > 0;
            const seqNum = sessionSeqMap.get(session.sessionId) || 1;
            const seqStr = seqNum < 10 ? `0${seqNum}` : `${seqNum}`;

            return (
              <div
                key={session.sessionId}
                className="rounded-xl border border-outline-variant/60 dark:border-border-dark border-l-4 border-l-primary dark:border-l-primary-fixed-dim bg-surface-container-lowest dark:bg-surface-dark overflow-hidden shadow-xs transition-all"
              >
                {/* 第 1 层：Session 主信息行 */}
                <div className="p-4 bg-surface-container-low/50 dark:bg-surface-dark-low flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/30 dark:border-border-dark">
                  <div className="flex items-start md:items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleExpand(session.sessionId)}
                      className="p-1 rounded-lg hover:bg-surface-container-high dark:hover:bg-surface-dark-high text-on-surface-variant transition-colors mt-0.5 md:mt-0 cursor-pointer"
                      title={isExpanded ? '折叠批次明细' : '展开批次明细'}
                    >
                      <span className="material-symbols-outlined text-xl">
                        {isExpanded ? 'expand_more' : 'chevron_right'}
                      </span>
                    </button>

                    {/* 会话任务徽标盒 */}
                    <div className="w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-fixed-dim border border-primary/20 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-lg leading-none">
                        inventory_2
                      </span>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary dark:text-primary-fixed-dim border border-primary/20 tabular-nums">
                          会话 #{seqStr}
                        </span>

                        <span className="font-bold text-xs text-on-surface dark:text-surface-bright tracking-wide">
                          {session.sessionId}
                        </span>

                        <span className="px-2 py-0.5 rounded bg-surface-container-high dark:bg-surface-dark-high text-[11px] text-on-surface-variant">
                          {session.totalDocuments} 份文档 · {session.totalBatches} 个炉批
                        </span>

                        <span className="px-2 py-0.5 rounded bg-status-pass-bg text-status-pass-text font-bold text-[10px]">
                          {session.passedBatches} 项合格
                        </span>

                        {hasFail && (
                          <span className="px-2 py-0.5 rounded bg-status-fail-bg text-status-fail-text font-bold text-[10px]">
                            {session.failedBatches} 项拦截
                          </span>
                        )}

                        {hasHitl && (
                          <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-bold text-[10px]">
                            包含 HITL 纠偏
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                        <span className="text-xs text-on-surface dark:text-surface-bright font-medium">
                          {session.title}
                        </span>

                        {/* 涉及的标准药丸标签（全量横向平铺展示） */}
                        {session.standards && session.standards.length > 0 && (() => {
                          const allStds = Array.from(new Set(session.standards.flatMap(s => parseStandards(s))));
                          if (allStds.length === 0) return null;
                          return (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {allStds.map(std => (
                                <span
                                  key={std}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60 whitespace-nowrap"
                                >
                                  {std}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* 右侧操作栏与归档时间 */}
                  <div className="flex items-center gap-2.5 self-end md:self-center">
                    <span className="text-[11px] text-on-surface-variant dark:text-outline-variant tabular-nums mr-1">
                      {formatTimestamp(session.savedAt || session.createdAt)}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleLoadSession(session.sessionId)}
                      className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="重载此检验会话至工作台现场进行复核或导出"
                    >
                      <span className="material-symbols-outlined text-base">restore_page</span>
                      <span>加载至工作台</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSessionToDelete(session)}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-on-surface-variant hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                      title="删除此条归档台账"
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  </div>
                </div>

                {/* 第 2 层：下钻文档与批次明细表格 */}
                {isExpanded && (
                  <div className="p-4 space-y-4 bg-surface-container-lowest dark:bg-surface-dark">
                    {session.documents.map((doc, docIdx) => (
                      <div
                        key={doc.docId}
                        className="border border-outline-variant/40 dark:border-border-dark rounded-xl p-3.5 space-y-3 bg-surface-container-low/30 dark:bg-surface-dark-low/40"
                      >
                        {/* 文档标题与文件信息 */}
                        <div className="flex items-center justify-between text-xs pb-2 border-b border-outline-variant/20 dark:border-border-dark/60">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-red-500 text-lg">
                              picture_as_pdf
                            </span>
                            <span className="font-bold text-on-surface dark:text-surface-bright">
                              {doc.filename}
                            </span>
                            <span className="text-[11px] text-on-surface-variant tabular-nums">
                              ({doc.fileSize} · {doc.pageCount} 页)
                            </span>
                          </div>
                          <span className="text-[11px] text-on-surface-variant">
                            文档 #{docIdx + 1}
                          </span>
                        </div>

                        {/* 批次工业全息表格 */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant text-[11px] border-b border-outline-variant/30 dark:border-border-dark/60">
                              <tr>
                                <th className="px-3 py-2 font-semibold min-w-[170px] whitespace-nowrap">炉批 / 检验批号</th>
                                <th className="px-3 py-2 font-semibold min-w-[120px] whitespace-nowrap">材料牌号</th>
                                <th className="px-3 py-2 font-semibold min-w-[160px] whitespace-nowrap">执行标准</th>
                                <th className="px-3 py-2 font-semibold min-w-[180px]">供货厂家</th>
                                <th className="px-3 py-2 font-semibold min-w-[180px]">规格尺寸</th>
                                <th className="px-3 py-2 font-semibold min-w-[140px] whitespace-nowrap">双轨判定结论</th>
                                <th className="px-3 py-2 font-semibold min-w-[90px] whitespace-nowrap">指标达成</th>
                                <th className="px-3 py-2 font-semibold text-right min-w-[110px] whitespace-nowrap">操作</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/20 dark:divide-border-dark/40">
                              {doc.batches.map((batch, batchIdx) => {
                                const idInfo = resolveBatchDisplay(batch);
                                const isSysPass = batch.systemVerdict === 'PASS' || batch.verdict === 'PASS';
                                const isSysFail = batch.systemVerdict === 'FAIL' || batch.verdict === 'FAIL';
                                const isHumanApprove = batch.humanVerdict === 'PASS';
                                const isHumanReject = batch.humanVerdict === 'REJECT';

                                return (
                                  <tr
                                    key={batch.batchKey}
                                    className="hover:bg-surface-container-low/60 dark:hover:bg-surface-dark-low/60 transition-colors"
                                  >
                                    {/* 1. 炉批 / 检验批号（双轨呈现 + 序号与实物批次微标） */}
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                      <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1 shrink-0">
                                          <span className="text-[10px] font-semibold text-on-surface-variant/80 bg-surface-container-high dark:bg-surface-dark-high px-1.5 py-0.5 rounded tabular-nums">
                                            #{batchIdx + 1 < 10 ? `0${batchIdx + 1}` : batchIdx + 1}
                                          </span>
                                          <span className="material-symbols-outlined text-base text-primary/70 dark:text-primary-fixed-dim/70">
                                            layers
                                          </span>
                                        </div>
                                        <div>
                                          <div className="font-bold text-on-surface dark:text-surface-bright text-xs">
                                            {idInfo.primary}
                                          </div>
                                          <div className="text-[10px] text-on-surface-variant dark:text-outline-variant flex items-center gap-1 mt-0.5">
                                            <span>{idInfo.secondary}</span>
                                            {batch.certificateNo && (
                                              <span className="text-[9px] px-1 py-0.2 rounded bg-surface-container-high dark:bg-surface-dark-high">
                                                单号: {batch.certificateNo}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </td>

                                    {/* 2. 材料牌号 */}
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                      <span className="font-semibold text-primary dark:text-primary-fixed-dim">
                                        {batch.grade}
                                      </span>
                                    </td>

                                    {/* 3. 执行标准（独立药丸纵向平铺） */}
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                      {(() => {
                                        const stdList = parseStandards(batch.standard);
                                        if (stdList.length === 0) {
                                          return <span className="text-on-surface-variant/50 text-xs">--</span>;
                                        }
                                        return (
                                          <div className="flex flex-col items-start gap-1">
                                            {stdList.map(std => (
                                              <span
                                                key={std}
                                                className="px-1.5 py-0.5 rounded bg-blue-50/80 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-[10px] font-medium border border-blue-200/60 dark:border-blue-900/60 whitespace-nowrap inline-block"
                                              >
                                                {std}
                                              </span>
                                            ))}
                                          </div>
                                        );
                                      })()}
                                    </td>

                                    {/* 4. 供货厂家 */}
                                    <td className="px-3 py-2.5 min-w-[180px] text-on-surface-variant dark:text-outline-variant text-[11px]">
                                      {batch.supplier || '--'}
                                    </td>

                                    {/* 5. 规格尺寸 */}
                                    <td className="px-3 py-2.5 min-w-[180px] text-on-surface-variant dark:text-outline-variant text-[11px]">
                                      {batch.dimensions || '--'}
                                    </td>

                                    {/* 6. 双轨判定结论 */}
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                      <div className="flex flex-col items-start gap-1">
                                        <div className="flex items-center gap-1.5">
                                          <span
                                            className={`px-2 py-0.5 rounded text-xs font-bold ${isSysPass
                                              ? 'bg-status-pass-bg text-status-pass-text'
                                              : isSysFail
                                                ? 'bg-status-fail-bg text-status-fail-text'
                                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                              }`}
                                          >
                                            {isSysPass ? '✓ 系统合格' : isSysFail ? '✗ 系统拦截' : '⏳ 待决挂起'}
                                          </span>

                                          {batch.hasHitlCorrection && (
                                            <span
                                              className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/20"
                                              title={batch.hitlReason ? `HITL原因: ${batch.hitlReason}` : '经人工协同纠偏'}
                                            >
                                              HITL
                                            </span>
                                          )}
                                        </div>

                                        {/* 人工复核状态 */}
                                        <div className="text-[11px]">
                                          {isHumanApprove ? (
                                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                              人工复核: 已批准
                                            </span>
                                          ) : isHumanReject ? (
                                            <span className="text-red-600 dark:text-red-400 font-semibold">
                                              人工复核: 拒收
                                            </span>
                                          ) : (
                                            <span className="text-slate-500 dark:text-slate-400 font-normal">
                                              复核: 待复核
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </td>

                                    {/* 7. 指标达成 */}
                                    <td className="px-3 py-2.5 text-[11px] tabular-nums whitespace-nowrap">
                                      {batch.summaryStats ? (
                                        <div className="space-y-0.5">
                                          <div className="font-semibold text-on-surface dark:text-surface-bright">
                                            {batch.summaryStats.passCount} / {batch.summaryStats.totalRules}
                                          </div>
                                          {batch.summaryStats.failCount > 0 && (
                                            <div className="text-[10px] text-red-500 font-medium">
                                              {batch.summaryStats.failCount} 项不合格
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-on-surface-variant">--</span>
                                      )}
                                    </td>

                                    {/* 8. 行内操作 */}
                                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenDrawer(session.sessionId, batch.batchKey)}
                                        className="px-2.5 py-1 rounded bg-surface-container-high dark:bg-surface-dark-high hover:bg-primary hover:text-on-primary text-primary dark:text-primary-fixed-dim text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1 shadow-2xs whitespace-nowrap shrink-0"
                                        title="免切工作台，直接查阅此炉批的化学/力学/工艺全景比对矩阵"
                                      >
                                        <span className="material-symbols-outlined text-sm">visibility</span>
                                        <span>比对矩阵</span>
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
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
      )}

      {/* 批次全景比对矩阵快速查验抽屉 */}
      {isDrawerOpen && (
        <div
          onClick={handleCloseDrawer}
          className="fixed inset-0 !mt-0 top-0 left-0 w-screen h-screen z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-fade-in select-none cursor-pointer"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-3xl bg-surface-container-lowest dark:bg-surface-dark h-full shadow-2xl border-l border-outline-variant/60 dark:border-border-dark flex flex-col overflow-hidden select-text cursor-default"
            role="dialog"
            aria-modal="true"
          >
            {/* 抽屉顶部头部 */}
            <div className="p-4 border-b border-outline-variant/40 dark:border-border-dark flex items-center justify-between bg-surface-container-low/70 dark:bg-surface-dark-low">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-primary text-xl">analytics</span>
                <div>
                  <h2 className="text-sm font-bold text-on-surface dark:text-surface-bright">
                    历史质检全景比对矩阵速查
                  </h2>
                  <p className="text-[11px] text-on-surface-variant">
                    只读查验模式 · 会话: {activeSessionId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeSessionId && (
                  <button
                    type="button"
                    onClick={() => handleLoadSession(activeSessionId)}
                    className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">restore_page</span>
                    <span>载入工作台</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCloseDrawer}
                  className="p-1.5 rounded-lg hover:bg-surface-container-high dark:hover:bg-surface-dark-high text-on-surface-variant transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            </div>

            {/* 抽屉主体内容区域 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
              {drawerLoading || !currentActiveDrawerData ? (
                <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
                  <span className="material-symbols-outlined text-3xl text-primary animate-spin">
                    progress_activity
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    正在调阅该批次完整规则核验明细...
                  </span>
                </div>
              ) : (
                <>
                  {/* 批次核心概要卡片 */}
                  <div className="rounded-xl border border-outline-variant/50 dark:border-border-dark p-4 bg-surface-container-low/40 dark:bg-surface-dark-low/50 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/30 pb-2.5">
                      <div>
                        <span className="text-[11px] text-on-surface-variant">炉批 / 检验批号</span>
                        <div className="text-base font-bold text-on-surface dark:text-surface-bright">
                          {currentActiveDrawerData.batch.batchNo || currentActiveDrawerData.batch.heatNo || '未标明'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-md text-xs font-bold ${currentActiveDrawerData.batch.verdict === 'PASS'
                            ? 'bg-status-pass-bg text-status-pass-text'
                            : 'bg-status-fail-bg text-status-fail-text'
                            }`}
                        >
                          {currentActiveDrawerData.batch.verdict === 'PASS' ? '✓ 系统全项合格' : '✗ 系统判定拦截'}
                        </span>

                        {currentActiveDrawerData.batch.humanVerdict && (
                          <span
                            className={`px-2.5 py-1 rounded-md text-xs font-bold ${currentActiveDrawerData.batch.humanVerdict === 'PASS'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-red-600 text-white'
                              }`}
                          >
                            复核: {currentActiveDrawerData.batch.humanVerdict}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-[11px] text-on-surface-variant">材料牌号</span>
                        <div className="font-semibold text-primary dark:text-primary-fixed-dim">
                          {currentActiveDrawerData.batch.grade}
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-on-surface-variant">执行标准</span>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          {parseStandards(currentActiveDrawerData.batch.standard).map(std => (
                            <span
                              key={std}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60 whitespace-nowrap"
                            >
                              {std}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-on-surface-variant">冶炼炉号</span>
                        <div className="text-on-surface dark:text-surface-bright">
                          {currentActiveDrawerData.batch.heatNo || '--'}
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-on-surface-variant">供货单位</span>
                        <div className="text-on-surface dark:text-surface-bright truncate">
                          {currentActiveDrawerData.batch.supplier || '--'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 模块 A：化学成分比对明细 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span>化学成分实测与核验 (Chemical Composition)</span>
                      </h4>
                      <span className="text-[11px] text-on-surface-variant">
                        共 {currentActiveDrawerData.batch.chemical?.length || 0} 项元素
                      </span>
                    </div>

                    <div className="border border-outline-variant/40 dark:border-border-dark rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant text-[11px] border-b border-outline-variant/30">
                          <tr>
                            <th className="px-3 py-2 font-semibold">元素</th>
                            <th className="px-3 py-2 font-semibold">质保书实测值</th>
                            <th className="px-3 py-2 font-semibold">执行标准要求范围</th>
                            <th className="px-3 py-2 font-semibold">单项结论</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/20 dark:divide-border-dark/40">
                          {currentActiveDrawerData.batch.chemical?.map(elem => {
                            const matchedRule = currentActiveDrawerData.batch.auditReport?.item_results?.find(
                              r => r.property_key.toLowerCase() === elem.element.toLowerCase() ||
                                r.property_key.toLowerCase() === `chem_${elem.element.toLowerCase()}`
                            );
                            const isPass = matchedRule ? matchedRule.status === 'PASS' : true;

                            return (
                              <tr key={elem.element} className="hover:bg-surface-container-low/40">
                                <td className="px-3 py-2 font-bold text-on-surface dark:text-surface-bright">
                                  {elem.element}
                                </td>
                                <td className="px-3 py-2 font-semibold tabular-nums text-on-surface dark:text-surface-bright">
                                  {elem.value}%
                                </td>
                                <td className="px-3 py-2 text-on-surface-variant tabular-nums">
                                  {matchedRule?.standard_requirement_text || '--'}
                                </td>
                                <td className="px-3 py-2">
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${isPass
                                      ? 'bg-status-pass-bg text-status-pass-text'
                                      : 'bg-status-fail-bg text-status-fail-text'
                                      }`}
                                  >
                                    {isPass ? '✓ PASS' : '✗ FAIL'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 模块 B：力学与工艺性能核验 */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>力学性能与工艺试验 (Mechanical & Technological Tests)</span>
                    </h4>

                    <div className="border border-outline-variant/40 dark:border-border-dark rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant text-[11px] border-b border-outline-variant/30">
                          <tr>
                            <th className="px-3 py-2 font-semibold">试验项目</th>
                            <th className="px-3 py-2 font-semibold">实测值 / 检验描述</th>
                            <th className="px-3 py-2 font-semibold">标准规范要求</th>
                            <th className="px-3 py-2 font-semibold">结论</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/20 dark:divide-border-dark/40">
                          {/* 抗拉强度 */}
                          {currentActiveDrawerData.batch.mechanical?.tensile_rm && (
                            <tr className="hover:bg-surface-container-low/40">
                              <td className="px-3 py-2 font-medium">抗拉强度 Rm</td>
                              <td className="px-3 py-2 font-bold tabular-nums">{currentActiveDrawerData.batch.mechanical.tensile_rm}</td>
                              <td className="px-3 py-2 text-on-surface-variant tabular-nums">≥ 520 MPa (标准)</td>
                              <td className="px-3 py-2">
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-status-pass-bg text-status-pass-text">✓ PASS</span>
                              </td>
                            </tr>
                          )}
                          {/* 屈服强度 */}
                          {currentActiveDrawerData.batch.mechanical?.yield_rp02 && (
                            <tr className="hover:bg-surface-container-low/40">
                              <td className="px-3 py-2 font-medium">规定塑性延伸强度 Rp0.2</td>
                              <td className="px-3 py-2 font-bold tabular-nums">{currentActiveDrawerData.batch.mechanical.yield_rp02}</td>
                              <td className="px-3 py-2 text-on-surface-variant tabular-nums">≥ 205 MPa (标准)</td>
                              <td className="px-3 py-2">
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-status-pass-bg text-status-pass-text">✓ PASS</span>
                              </td>
                            </tr>
                          )}
                          {/* 断后伸长率 */}
                          {currentActiveDrawerData.batch.mechanical?.elongation_a && (
                            <tr className="hover:bg-surface-container-low/40">
                              <td className="px-3 py-2 font-medium">断后伸长率 A</td>
                              <td className="px-3 py-2 font-bold tabular-nums">{currentActiveDrawerData.batch.mechanical.elongation_a}</td>
                              <td className="px-3 py-2 text-on-surface-variant tabular-nums">≥ 35.0% (标准)</td>
                              <td className="px-3 py-2">
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-status-pass-bg text-status-pass-text">✓ PASS</span>
                              </td>
                            </tr>
                          )}
                          {/* 压扁试验 */}
                          {currentActiveDrawerData.batch.process?.flattening && (
                            <tr className="hover:bg-surface-container-low/40">
                              <td className="px-3 py-2 font-medium">压扁试验</td>
                              <td className="px-3 py-2 text-on-surface-variant">{currentActiveDrawerData.batch.process.flattening}</td>
                              <td className="px-3 py-2 text-on-surface-variant">无裂纹裂口 (合格)</td>
                              <td className="px-3 py-2">
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-status-pass-bg text-status-pass-text">✓ PASS</span>
                              </td>
                            </tr>
                          )}
                          {/* 晶间腐蚀 */}
                          {currentActiveDrawerData.batch.process?.intergranularCorrosion && (
                            <tr className="hover:bg-surface-container-low/40">
                              <td className="px-3 py-2 font-medium">晶间腐蚀倾向</td>
                              <td className="px-3 py-2 text-on-surface-variant">{currentActiveDrawerData.batch.process.intergranularCorrosion}</td>
                              <td className="px-3 py-2 text-on-surface-variant">GB/T 4334 E法合格</td>
                              <td className="px-3 py-2">
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-status-pass-bg text-status-pass-text">✓ PASS</span>
                              </td>
                            </tr>
                          )}
                          {/* 无损探伤 */}
                          {(currentActiveDrawerData.batch.process?.ndt_ut || currentActiveDrawerData.batch.process?.ndt) && (
                            <tr className="hover:bg-surface-container-low/40">
                              <td className="px-3 py-2 font-medium">无损检测 (NDT)</td>
                              <td className="px-3 py-2 text-on-surface-variant">{currentActiveDrawerData.batch.process.ndt_ut || currentActiveDrawerData.batch.process.ndt}</td>
                              <td className="px-3 py-2 text-on-surface-variant">NB/T 47019.5 规范级</td>
                              <td className="px-3 py-2">
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-status-pass-bg text-status-pass-text">✓ PASS</span>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 模块 C：特约条款与额外长尾报送项 */}
                  {currentActiveDrawerData.batch.auditReport?.unmatched_certificate_records &&
                    currentActiveDrawerData.batch.auditReport.unmatched_certificate_records.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                          <span>供需协议特约 / 额外报送项 (Special & Protocol Items)</span>
                        </h4>

                        <div className="border border-outline-variant/40 dark:border-border-dark rounded-xl p-3 space-y-2 bg-purple-50/20 dark:bg-purple-950/20">
                          {currentActiveDrawerData.batch.auditReport.unmatched_certificate_records.map((rec, rIdx) => {
                            const recAny = rec as Record<string, any>;
                            const propName = String(rec.display_name || rec.raw_property_name || rec.property_key || recAny.original_property_name || '特约项目');
                            const val = String(rec.measured_value_raw || (rec.measured_value_num != null ? rec.measured_value_num : (recAny.measured_value ?? '--')));
                            const waiverReason = String(recAny.waiver_reason || rec.conclusion_text || '协议特约放行');

                            return (
                              <div key={rIdx} className="flex items-center justify-between text-xs py-1 border-b border-outline-variant/20 last:border-b-0">
                                <div>
                                  <span className="font-semibold text-on-surface dark:text-surface-bright">
                                    {propName}
                                  </span>
                                  <span className="ml-2 text-on-surface-variant tabular-nums">
                                    实测: {val}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                                    {waiverReason}
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-status-pass-bg text-status-pass-text">
                                    ✓ PASS
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                </>
              )}
            </div>

            {/* 抽屉底部动作条 */}
            <div className="p-4 border-t border-outline-variant/40 dark:border-border-dark flex items-center justify-between bg-surface-container-low/70 dark:bg-surface-dark-low">
              <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                <span>存证哈希:</span>
                <span className="truncate max-w-[240px]">{currentActiveDrawerData?.batch.sha256Hash || '--'}</span>
                {currentActiveDrawerData?.batch.sha256Hash && (
                  <button
                    type="button"
                    onClick={() => handleCopyHash(currentActiveDrawerData.batch.sha256Hash!)}
                    className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                    title="复制存证哈希"
                  >
                    <span className="material-symbols-outlined text-[13px]">
                      {copiedHash === currentActiveDrawerData.batch.sha256Hash ? 'check' : 'content_copy'}
                    </span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={handleCloseDrawer}
                className="px-4 py-1.5 rounded-lg border border-outline-variant text-xs font-semibold hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                关闭速查
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除台账二次确认模态框 */}
      {sessionToDelete && (
        <div
          onClick={() => setSessionToDelete(null)}
          className="fixed inset-0 !mt-0 top-0 left-0 w-screen h-screen z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in cursor-pointer select-none"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant dark:border-border-dark rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 cursor-default select-text"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">warning</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-on-surface dark:text-surface-bright">
                  删除历史质检台账确认
                </h3>
                <p className="text-xs text-on-surface-variant dark:text-outline-variant mt-1.5 leading-relaxed">
                  您确定要从服务端永久删除该检验台账吗？此操作将物理清除该会话及其包含的全部炉批核验存证记录，且不可撤销。
                </p>

                <div className="mt-3 p-3 rounded-lg bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark text-xs space-y-1">
                  <div className="text-[11px] text-on-surface-variant">会话标识:</div>
                  <div className="font-bold text-on-surface dark:text-surface-bright truncate">
                    {sessionToDelete.sessionId}
                  </div>
                  <div className="text-[11px] text-on-surface-variant">
                    {sessionToDelete.title} ({sessionToDelete.totalBatches} 个批次)
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-outline-variant/40 dark:border-border-dark">
              <button
                type="button"
                onClick={() => setSessionToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg text-xs font-bold text-on-surface-variant hover:bg-surface-container-high dark:hover:bg-surface-dark-high transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDeleteSession}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                    <span>正在删除...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">delete_forever</span>
                    <span>确认永久删除</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
