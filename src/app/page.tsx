'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/Header.tsx';
import { WaterfallWorkbench } from '@/components/WaterfallWorkbench.tsx';
import { StandardExplorer } from '@/components/StandardExplorer.tsx';
import { AuditLedger } from '@/components/AuditLedger.tsx';
import { AdminConsole } from '@/components/AdminConsole.tsx';
import { apiClient, PresetSampleDto, StandardOverviewDto } from '@/lib/api-client.ts';
import { AuditReport } from '@/schemas/report.schema.ts';
import { WorkflowOptions } from '@/workflow/state.interface.ts';
import { InspectionSession } from '@/types/session.ts';

/**
 * ============================================================================
 * NormScale 质量证明书智能合规检验系统主页面 (Main Dashboard Page)
 * 采用全新 MD3 / Stitch 工业设计系统规范，支持受控平滑步进滑动与明暗双模切换
 * ============================================================================
 */
export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'workbench' | 'standards' | 'ledger' | 'admin'>('workbench');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const [standardsData, setStandardsData] = useState<{
    total_standards: number;
    total_slices: number;
    standards: StandardOverviewDto[];
  }>();
  const [samples, setSamples] = useState<PresetSampleDto[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<string>('');
  const [options] = useState<WorkflowOptions>({
    minConfidenceThreshold: 0.8,
    skipSemanticReview: false,
  });

  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [currentReport, setCurrentReport] = useState<AuditReport>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. 初始化加载标准库信息与预设样本
  useEffect(() => {
    async function initData() {
      try {
        const [stdData, sampleList] = await Promise.all([
          apiClient.getStandards(),
          apiClient.getSamples(),
        ]);
        setStandardsData(stdData);
        setSamples(sampleList);
      } catch (err: unknown) {
        console.error('初始化标准或样本失败:', err);
      }
    }
    initData();
  }, []);

  // 2. 核心核验任务提交处理函数
  const handleExecuteAudit = useCallback(
    async (sampleId: string, currentOpts?: WorkflowOptions) => {
      setIsAuditing(true);
      setErrorMessage(null);
      setSelectedSampleId(sampleId);

      try {
        const res = await apiClient.submitAudit({
          sampleId,
          options: currentOpts || options,
        });

        if (res.status === 'suspended_hitl' || res.status === 'completed') {
          if (res.finalReport) setCurrentReport(res.finalReport);
        } else {
          setErrorMessage(res.error || '核验任务执行失败');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
      } finally {
        setIsAuditing(false);
      }
    },
    [options]
  );

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    if (typeof document !== 'undefined') {
      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const [loadedSession, setLoadedSession] = useState<InspectionSession | null>(null);
  const [currentWorkbenchSession, setCurrentWorkbenchSession] = useState<InspectionSession | null>(null);
  const [pendingSessionToLoad, setPendingSessionToLoad] = useState<InspectionSession | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);

  // 判断工作台中是否存在活动作业文档/批次数据
  const hasActiveSession = Boolean(
    currentWorkbenchSession &&
    currentWorkbenchSession.documents &&
    currentWorkbenchSession.documents.length > 0
  );

  // 从历史台账加载会话处理器：若当前有正在进行的检验会话，弹出覆盖警告弹窗，否则直接载入
  const handleLoadSessionToWorkbench = (sess: InspectionSession) => {
    if (hasActiveSession) {
      setPendingSessionToLoad(sess);
      setIsConfirmModalOpen(true);
    } else {
      executeLoadSession(sess);
    }
  };

  // 真正执行覆盖加载并切回工作台
  const executeLoadSession = (sess: InspectionSession) => {
    setLoadedSession({ ...sess });
    setActiveTab('workbench');
    setIsConfirmModalOpen(false);
    setPendingSessionToLoad(null);
  };

  return (
    <div className={`h-screen w-screen overflow-hidden flex flex-col ${theme === 'dark' ? 'dark bg-bg-industrial-slate text-surface-bright' : 'light bg-bg-slate-mist text-on-surface'} transition-colors duration-200`}>
      {/* 顶部全局导航栏 */}
      <Header
        standardsData={standardsData}
        isAuditing={isAuditing}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        theme={theme}
        onToggleTheme={toggleTheme}
        onRefresh={() => handleExecuteAudit(selectedSampleId)}
      />

      {/* 看板主体视图区域 */}
      <main className="flex-1 w-full h-[calc(100vh-4rem)] overflow-hidden relative">
        {/* 全局错误提示栏 */}
        {errorMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-red-300 dark:border-red-900 bg-status-fail-bg px-4 py-2.5 text-xs text-status-fail-text shadow-lg">
            <span className="material-symbols-outlined text-base">error</span>
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* 视图 1：受控垂直平滑滑动质检工作台 (Keep-Alive 保活：切换到其它导航 Tab 时保持会话状态与解析进度不被销毁) */}
        <div className={`w-full h-full ${activeTab === 'workbench' ? 'block' : 'hidden'}`}>
          <WaterfallWorkbench
            standardsData={standardsData}
            samples={samples}
            selectedSampleId={selectedSampleId}
            onSelectSample={id => setSelectedSampleId(id)}
            isAuditing={isAuditing}
            currentReport={currentReport}
            onOpenHitlDrawer={() => {}}
            onTriggerAudit={() => {}}
            loadedSession={loadedSession}
            onSessionChange={setCurrentWorkbenchSession}
          />
        </div>

        {/* 视图 2：历史质检台账明细 */}
        {activeTab === 'ledger' && (
          <AuditLedger onLoadSessionToWorkbench={handleLoadSessionToWorkbench} />
        )}

        {/* 视图 3：国家标准知识库与规格切片浏览器 */}
        {activeTab === 'standards' && <StandardExplorer />}

        {/* 视图 4：系统管理与运维配置控制台 */}
        {activeTab === 'admin' && <AdminConsole />}
      </main>

      {/* 历史会话加载覆盖警告确认弹窗 */}
      {isConfirmModalOpen && pendingSessionToLoad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant dark:border-border-dark rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">warning</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-on-surface dark:text-surface-bright">
                  覆盖当前作业会话确认
                </h3>
                <p className="text-xs text-on-surface-variant dark:text-outline-variant mt-1.5 leading-relaxed">
                  工作台中当前存在正在进行的检验作业（已包含 <strong className="text-primary dark:text-primary-fixed-dim font-bold">{currentWorkbenchSession?.documents.length || 0}</strong> 份文档、<strong className="text-primary dark:text-primary-fixed-dim font-bold">{currentWorkbenchSession?.totalBatches || 0}</strong> 个炉批）。
                </p>

                <div className="mt-3 p-3 rounded-lg bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark text-xs space-y-1">
                  <div className="text-[11px] text-on-surface-variant dark:text-outline-variant font-medium">即将载入的历史台账：</div>
                  <div className="font-bold text-on-surface dark:text-surface-bright font-mono truncate">
                    {pendingSessionToLoad.title || pendingSessionToLoad.sessionId}
                  </div>
                  <div className="text-[11px] text-on-surface-variant dark:text-outline-variant">
                    生成时间: {pendingSessionToLoad.createdAt} ({pendingSessionToLoad.totalDocuments} 份文档 · {pendingSessionToLoad.totalBatches} 个批次)
                  </div>
                </div>

                <p className="text-xs text-red-500 dark:text-red-400 font-medium mt-2.5">
                  注意：从历史台账载入将重置当前工作台现场并覆盖未保存的检验进度。
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-outline-variant/40 dark:border-border-dark">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setPendingSessionToLoad(null);
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold text-on-surface-variant hover:bg-surface-container-high dark:hover:bg-surface-dark-high transition-colors cursor-pointer"
              >
                取消（保留当前作业）
              </button>
              <button
                type="button"
                onClick={() => executeLoadSession(pendingSessionToLoad)}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">restore_page</span>
                <span>确认覆盖并载入</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
