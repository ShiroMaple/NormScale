'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/Header.tsx';
import { UploadZone } from '@/components/UploadZone.tsx';
import { CertificateViewer } from '@/components/CertificateViewer.tsx';
import { ComplianceMatrix } from '@/components/ComplianceMatrix.tsx';
import { AuditTraceTimeline } from '@/components/AuditTraceTimeline.tsx';
import { HitlDrawer } from '@/components/HitlDrawer.tsx';
import { ExportReportModal } from '@/components/ExportReportModal.tsx';
import { apiClient, PresetSampleDto, StandardOverviewDto } from '@/lib/api-client.ts';
import { AuditReport } from '@/schemas/report.schema.ts';
import { HitlInterruptContext, HumanCorrectionInput, WorkflowOptions } from '@/workflow/state.interface.ts';
import { AlertCircle } from 'lucide-react';

/**
 * ============================================================================
 * NormScale 物资验收决策看板主工作台 (Main Dashboard Page)
 * ============================================================================
 */
export default function DashboardPage() {
  const [standardsData, setStandardsData] = useState<{
    total_standards: number;
    total_slices: number;
    standards: StandardOverviewDto[];
  }>();
  const [samples, setSamples] = useState<PresetSampleDto[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<string>('s30408_messy_sample');
  const [options, setOptions] = useState<WorkflowOptions>({
    minConfidenceThreshold: 0.8,
    skipSemanticReview: false,
  });

  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [currentTaskId, setCurrentTaskId] = useState<string>('');
  const [currentReport, setCurrentReport] = useState<AuditReport>();
  const [hitlContext, setHitlContext] = useState<HitlInterruptContext>();
  const [isHitlOpen, setIsHitlOpen] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
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
          // 触发人机协同挂起，弹出抽屉等待质检员介入
          setHitlContext(res.hitlContext);
          setIsHitlOpen(true);
          // 若有部分数据，仍可呈现中间状态
          if (res.finalReport) setCurrentReport(res.finalReport);
        } else if (res.status === 'completed' && res.finalReport) {
          // 正常完成流转
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

  // 页面初始挂载时自动触发一次首个样本的核验
  useEffect(() => {
    handleExecuteAudit('s30408_messy_sample');
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

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-slate-100">
      {/* 顶部全局导航栏 */}
      <Header
        standardsData={standardsData}
        isAuditing={isAuditing}
        onRefresh={() => handleExecuteAudit(selectedSampleId)}
        onOpenExport={() => setIsExportOpen(true)}
      />

      {/* 看板主体工作台区域 */}
      <main className="mx-auto flex-1 w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* 全局错误警告栏 */}
        {errorMessage && (
          <div className="flex items-center space-x-2.5 rounded-xl border border-rose-800/60 bg-rose-950/30 p-4 text-sm text-rose-300">
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* 样本选择与控制栏 */}
        <UploadZone
          samples={samples}
          selectedSampleId={selectedSampleId}
          onSelectSample={id => handleExecuteAudit(id)}
          options={options}
          onOptionsChange={newOpts => {
            setOptions(newOpts);
            handleExecuteAudit(selectedSampleId, newOpts);
          }}
          disabled={isAuditing}
        />

        {/* 宽屏双列对比视图 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* 左列 (42% / 5 列)：质保书结构化解析视图 */}
          <div className="lg:col-span-5">
            <CertificateViewer report={currentReport} isLoading={isAuditing} />
          </div>

          {/* 右列 (58% / 7 列)：国家标准合规判定矩阵与审计时间轴 */}
          <div className="lg:col-span-7 space-y-6">
            <ComplianceMatrix report={currentReport} isLoading={isAuditing} />
            <AuditTraceTimeline traces={currentReport?.audit_traces} isLoading={isAuditing} />
          </div>
        </div>
      </main>

      {/* 人机协同干预抽屉 */}
      <HitlDrawer
        isOpen={isHitlOpen}
        onClose={() => setIsHitlOpen(false)}
        hitlContext={hitlContext}
        taskId={currentTaskId}
        onSubmitResume={handleResumeAudit}
        isSubmitting={isAuditing}
      />

      {/* 质检报告导出模态框 */}
      <ExportReportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        report={currentReport}
      />
    </div>
  );
}
