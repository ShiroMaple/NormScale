'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/Header.tsx';
import { WaterfallWorkbench } from '@/components/WaterfallWorkbench.tsx';
import { StandardExplorer } from '@/components/StandardExplorer.tsx';
import { AuditLedger } from '@/components/AuditLedger.tsx';
import { AdminConsole } from '@/components/AdminConsole.tsx';
import { HitlDrawer } from '@/components/HitlDrawer.tsx';
import { apiClient, PresetSampleDto, StandardOverviewDto } from '@/lib/api-client.ts';
import { AuditReport } from '@/schemas/report.schema.ts';
import { HitlInterruptContext, HumanCorrectionInput, WorkflowOptions } from '@/workflow/state.interface.ts';
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
  const [selectedSampleId, setSelectedSampleId] = useState<string>('316l_kgf_sample');
  const [options] = useState<WorkflowOptions>({
    minConfidenceThreshold: 0.8,
    skipSemanticReview: false,
  });

  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [currentTaskId, setCurrentTaskId] = useState<string>('');
  const [currentReport, setCurrentReport] = useState<AuditReport>();
  const [hitlContext, setHitlContext] = useState<HitlInterruptContext>();
  const [isHitlOpen, setIsHitlOpen] = useState<boolean>(false);
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

        setCurrentTaskId(res.taskId);

        if (res.status === 'suspended_hitl') {
          setHitlContext(res.hitlContext);
          setIsHitlOpen(true);
          if (res.finalReport) setCurrentReport(res.finalReport);
        } else if (res.status === 'completed' && res.finalReport) {
          setCurrentReport(res.finalReport);
          setHitlContext(undefined);
          setIsHitlOpen(false);
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

  // 页面初始挂载时自动触发一次 316L 样本核验
  useEffect(() => {
    handleExecuteAudit('316l_kgf_sample');
  }, [handleExecuteAudit]);

  // 3. 人机协同修正数据提交并恢复执行
  const handleResumeAudit = async (correction: HumanCorrectionInput) => {
    if (!currentTaskId) return;
    setIsAuditing(true);
    try {
      const res = await apiClient.resumeAudit(currentTaskId, correction);
      if (res.status === 'completed' && res.finalReport) {
        setCurrentReport(res.finalReport);
        setHitlContext(undefined);
        setIsHitlOpen(false);
      } else if (res.status === 'suspended_hitl') {
        setHitlContext(res.hitlContext);
      } else {
        setErrorMessage(res.error || '恢复任务执行失败');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`恢复执行异常: ${msg}`);
    } finally {
      setIsAuditing(false);
    }
  };

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

  const handleLoadSessionToWorkbench = (sess: InspectionSession) => {
    setLoadedSession(sess);
    setActiveTab('workbench');
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

        {/* 视图 1：受控垂直平滑滑动质检工作台 */}
        {activeTab === 'workbench' && (
          <WaterfallWorkbench
            standardsData={standardsData}
            samples={samples}
            selectedSampleId={selectedSampleId}
            onSelectSample={id => handleExecuteAudit(id)}
            isAuditing={isAuditing}
            currentReport={currentReport}
            onOpenHitlDrawer={() => setIsHitlOpen(true)}
            onTriggerAudit={() => handleExecuteAudit(selectedSampleId)}
            loadedSession={loadedSession}
          />
        )}

        {/* 视图 2：历史质检台账明细 */}
        {activeTab === 'ledger' && (
          <AuditLedger onLoadSessionToWorkbench={handleLoadSessionToWorkbench} />
        )}

        {/* 视图 3：国家标准知识库与规格切片浏览器 */}
        {activeTab === 'standards' && <StandardExplorer />}

        {/* 视图 4：系统管理与运维配置控制台 */}
        {activeTab === 'admin' && <AdminConsole />}
      </main>

      {/* 人机协同干预右侧 480px 抽屉 */}
      <HitlDrawer
        isOpen={isHitlOpen}
        onClose={() => setIsHitlOpen(false)}
        hitlContext={hitlContext}
        taskId={currentTaskId}
        onSubmitResume={handleResumeAudit}
        isSubmitting={isAuditing}
      />
    </div>
  );
}
