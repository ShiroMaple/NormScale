'use client';

import { useState, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { InspectionSession, SessionDocument, BatchSpecimen } from '@/types/session.ts';

export interface UseReportExporterOptions {
  session: InspectionSession;
  currentDoc?: SessionDocument;
  currentBatch?: BatchSpecimen;
  selectedDocId: string;
  selectedBatchNo: string;
  setSelectedDocId: (docId: string) => void;
  setSelectedBatchNo: (batchNo: string) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  targetPanelId?: string;
}

export interface UseReportExporterReturn {
  isCapturing: boolean;
  capturePanelToPng: (batchNo: string, docName?: string) => Promise<boolean>;
  handleSaveCurrentBatchScreenshot: () => Promise<void>;
  handleSaveCurrentDocAllBatchesScreenshot: () => Promise<void>;
  handleSaveSessionAllBatchesScreenshot: () => Promise<void>;
  handleSaveSessionResults: (silent?: boolean) => Promise<void>;
}

/**
 * 辅助函数：触发文件流下载锚点点击
 */
function triggerPngDownload(pngData: string, batchNo: string, docName?: string): void {
  const downloadAnchor = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const cleanDocPrefix = docName ? `${docName.replace(/\.[^/.]+$/, '')}_` : '';
  downloadAnchor.download = `NormScale_合规比对结果_${cleanDocPrefix}${batchNo || 'REPORT'}_${dateStr}.png`;
  downloadAnchor.href = pngData;
  downloadAnchor.click();
}

/**
 * 质检工作台报告导出与台账存证领域 Hook (useReportExporter)
 * 职责：负责步骤 3/步骤 4 的高清截图生成、多批次流水下载与服务端台账 JSON 异步归档
 */
export function useReportExporter({
  session,
  currentDoc,
  currentBatch,
  selectedDocId,
  selectedBatchNo,
  setSelectedDocId,
  setSelectedBatchNo,
  showToast,
  targetPanelId = 'step-3-workbench-panel',
}: UseReportExporterOptions): UseReportExporterReturn {
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  // 保存当前会话台账至服务端
  const handleSaveSessionResults = useCallback(async (silent: boolean = false) => {
    try {
      const sessionToSave: InspectionSession = {
        ...session,
        createdAt: session.createdAt || new Date().toISOString().replace('T', ' ').slice(0, 19),
        documents: session.documents.map(doc => {
          const { pages, samplePages, ...rest } = doc;
          return {
            ...rest,
            pages: pages?.filter(p => !p.startsWith('data:image')),
          };
        }),
      };

      const res = await fetch('/api/audit/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionToSave),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (!silent) showToast(`检验结果已成功归档至服务端台账 (${sessionToSave.sessionId})`, 'success');
      } else {
        if (!silent) showToast(`保存台账失败: ${data.error || '服务端响应异常'}`, 'error');
      }
    } catch (err: any) {
      if (!silent) showToast(`保存台账请求异常: ${err.message || err}`, 'error');
    }
  }, [session, showToast]);

  // 底层 DOM 原生渲染截图管线
  const capturePanelToPng = useCallback(async (batchNo: string, docName?: string): Promise<boolean> => {
    if (typeof document === 'undefined') return false;
    const targetElement = document.getElementById(targetPanelId);
    if (!targetElement) return false;

    if (document.fonts) await document.fonts.ready;

    const isDark = document.documentElement.classList.contains('dark');
    const targetWidth = targetElement.scrollWidth || targetElement.offsetWidth;
    const targetHeight = targetElement.scrollHeight || targetElement.offsetHeight;

    const pngData = await toPng(targetElement, {
      quality: 1,
      pixelRatio: 2,
      backgroundColor: isDark ? '#141218' : '#ffffff',
      cacheBust: true,
      width: targetWidth,
      height: targetHeight,
      style: { margin: '0', transform: 'none', left: '0', top: '0', maxWidth: 'none', width: `${targetWidth}px`, height: `${targetHeight}px` },
    });

    triggerPngDownload(pngData, batchNo, docName);
    return true;
  }, [targetPanelId]);

  // 选项 1：保存当前批次截图
  const handleSaveCurrentBatchScreenshot = useCallback(async () => {
    if (typeof document === 'undefined') {
      showToast('无法定位步骤 3 结果视窗', 'error');
      return;
    }
    const targetElement = document.getElementById(targetPanelId);
    if (!targetElement) {
      showToast('无法定位步骤 3 结果视窗', 'error');
      return;
    }

    setIsCapturing(true);
    const scrollContainer = targetElement.closest('section');
    const originalScrollTop = scrollContainer?.scrollTop ?? 0;

    try {
      if (scrollContainer && originalScrollTop > 0) {
        scrollContainer.scrollTop = 0;
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      await capturePanelToPng(currentBatch?.batchNo || 'REPORT', currentDoc?.filename);
      showToast(`批次 [${currentBatch?.batchNo || '当前批次'}] 截图已成功导出`, 'success');
    } catch (err) {
      console.error('html-to-image screenshot failed:', err);
      showToast('截图生成失败，请重试', 'error');
    } finally {
      if (scrollContainer && originalScrollTop > 0) scrollContainer.scrollTop = originalScrollTop;
      setIsCapturing(false);
    }
  }, [targetPanelId, currentBatch?.batchNo, currentDoc?.filename, capturePanelToPng, showToast]);

  // 选项 2：保存当前文档所有批次截图
  const handleSaveCurrentDocAllBatchesScreenshot = useCallback(async () => {
    if (typeof document === 'undefined') {
      showToast('无法定位步骤 3 结果视窗', 'error');
      return;
    }
    if (!currentDoc || !currentDoc.batches || currentDoc.batches.length === 0) {
      showToast('当前文档暂无可导出的检验批次', 'info');
      return;
    }

    const targetElement = document.getElementById(targetPanelId);
    if (!targetElement) {
      showToast('无法定位步骤 3 结果视窗', 'error');
      return;
    }

    setIsCapturing(true);
    const scrollContainer = targetElement.closest('section');
    const originalScrollTop = scrollContainer?.scrollTop ?? 0;
    const originalBatchNo = selectedBatchNo;
    const batches = currentDoc.batches;

    try {
      if (scrollContainer && originalScrollTop > 0) {
        scrollContainer.scrollTop = 0;
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      showToast(`开始导出当前文档全部 ${batches.length} 个批次截图...`, 'info');

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        if (!batch) continue;
        showToast(`正在截取批次 (${i + 1}/${batches.length}): ${batch.batchNo}...`, 'info');
        setSelectedBatchNo(batch.batchNo);
        await new Promise(resolve => setTimeout(resolve, 250));
        await new Promise(resolve => requestAnimationFrame(resolve));
        await capturePanelToPng(batch.batchNo, currentDoc.filename);
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      showToast(`当前文档全部 ${batches.length} 个批次截图导出完成`, 'success');
    } catch (err) {
      console.error('Batch screenshots export failed:', err);
      showToast('批量截图生成过程中断，请重试', 'error');
    } finally {
      setSelectedBatchNo(originalBatchNo);
      if (scrollContainer && originalScrollTop > 0) scrollContainer.scrollTop = originalScrollTop;
      setIsCapturing(false);
    }
  }, [targetPanelId, currentDoc, selectedBatchNo, setSelectedBatchNo, capturePanelToPng, showToast]);

  // 选项 3：保存当前会话所有文档的所有批次截图
  const handleSaveSessionAllBatchesScreenshot = useCallback(async () => {
    if (typeof document === 'undefined') {
      showToast('无法定位步骤 3 结果视窗', 'error');
      return;
    }
    const allBatchesList: Array<{ docId: string; docName: string; batchNo: string }> = [];
    session.documents.forEach(d => {
      (d.batches || []).forEach(b => {
        allBatchesList.push({ docId: d.docId, docName: d.filename || d.docId, batchNo: b.batchNo });
      });
    });

    if (allBatchesList.length === 0) {
      showToast('当前会话暂无可导出的检验批次', 'info');
      return;
    }

    const targetElement = document.getElementById(targetPanelId);
    if (!targetElement) {
      showToast('无法定位步骤 3 结果视窗', 'error');
      return;
    }

    setIsCapturing(true);
    const scrollContainer = targetElement.closest('section');
    const originalScrollTop = scrollContainer?.scrollTop ?? 0;
    const originalDocId = selectedDocId;
    const originalBatchNo = selectedBatchNo;

    try {
      if (scrollContainer && originalScrollTop > 0) {
        scrollContainer.scrollTop = 0;
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      showToast(`开始导出当前会话全部 ${allBatchesList.length} 个批次截图...`, 'info');

      for (let i = 0; i < allBatchesList.length; i++) {
        const item = allBatchesList[i];
        if (!item) continue;
        showToast(`正在截取 (${i + 1}/${allBatchesList.length}): ${item.batchNo}...`, 'info');
        setSelectedDocId(item.docId);
        setSelectedBatchNo(item.batchNo);
        await new Promise(resolve => setTimeout(resolve, 300));
        await new Promise(resolve => requestAnimationFrame(resolve));
        await capturePanelToPng(item.batchNo, item.docName);
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      showToast(`当前会话全部 ${allBatchesList.length} 个批次截图导出完成`, 'success');
    } catch (err) {
      console.error('Session all batches export failed:', err);
      showToast('会话批量截图生成中断，请重试', 'error');
    } finally {
      setSelectedDocId(originalDocId);
      setSelectedBatchNo(originalBatchNo);
      if (scrollContainer && originalScrollTop > 0) scrollContainer.scrollTop = originalScrollTop;
      setIsCapturing(false);
    }
  }, [targetPanelId, session.documents, selectedDocId, selectedBatchNo, setSelectedDocId, setSelectedBatchNo, capturePanelToPng, showToast]);

  return {
    isCapturing,
    capturePanelToPng,
    handleSaveCurrentBatchScreenshot,
    handleSaveCurrentDocAllBatchesScreenshot,
    handleSaveSessionAllBatchesScreenshot,
    handleSaveSessionResults,
  };
}
