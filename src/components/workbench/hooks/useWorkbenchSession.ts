'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  InspectionSession,
  SessionDocument,
  generateSessionId,
} from '@/types/session.ts';
import { PresetSampleDto } from '@/lib/api-client.ts';
import { renderPdfAndExtractText } from '@/utils/pdf-renderer.ts';
import {
  QueuedDocItem,
  CachedDocItem,
  ScenarioSampleMissingError,
} from '../types.ts';

export interface UseWorkbenchSessionOptions {
  loadedSession?: InspectionSession | null;
  onSessionChange?: (session: InspectionSession) => void;
  selectedSampleId?: string;
  onSelectSample?: (sampleId: string) => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onRestoreBboxes?: (docId: string, bboxes: any[]) => void;
}

export const createEmptyInspectionSession = (): InspectionSession => ({
  sessionId: generateSessionId(),
  createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
  title: '现场实时质检作业会话',
  totalDocuments: 0,
  totalBatches: 0,
  passedBatches: 0,
  failedBatches: 0,
  hitlBatches: 0,
  documents: [],
});

/**
 * 质检工作台会话与文档队列管理领域 Hook
 * 负责：Session 状态生命周期、文档队列、历史缓存恢复/删除、真实文件预处理调度与测试用例装载
 */
export function useWorkbenchSession({
  loadedSession,
  onSessionChange,
  selectedSampleId,
  onSelectSample,
  onShowToast,
  onRestoreBboxes,
}: UseWorkbenchSessionOptions) {
  const [session, setSession] = useState<InspectionSession>(() => loadedSession || createEmptyInspectionSession());
  const [queuedDocs, setQueuedDocs] = useState<QueuedDocItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>(session.documents[0]?.docId || '');
  const [selectedBatchNo, setSelectedBatchNo] = useState<string>(
    session.documents[0]?.batches[0]?.batchNo || ''
  );
  const [cachedDocs, setCachedDocs] = useState<CachedDocItem[]>([]);
  const [uploadedFilesMap, setUploadedFilesMap] = useState<Record<string, File>>({});
  const [uploadedFileUrls, setUploadedFileUrls] = useState<Record<string, string>>({});
  const [loadingScenarios, setLoadingScenarios] = useState<Record<string, boolean>>({});
  const [uploadedAgreementFile, setUploadedAgreementFile] = useState<File | null>(null);
  const [agreementUploadError, setAgreementUploadError] = useState<string | null>(null);
  const [isAgreementDraggingOver, setIsAgreementDraggingOver] = useState<boolean>(false);

  // 同步通知顶层会话变更
  useEffect(() => {
    onSessionChange?.(session);
  }, [session, onSessionChange]);

  // 从外部装载 Session 时同步队列
  useEffect(() => {
    if (loadedSession && loadedSession.documents.length > 0) {
      setSession(loadedSession);
      const projectedDocs: QueuedDocItem[] = loadedSession.documents.map(d => ({
        id: d.docId,
        filename: d.filename,
        status: '就绪',
        size: d.fileSize || '未知大小',
        date: d.uploadTime || new Date().toLocaleDateString(),
        md5: d.md5,
        pageCount: d.pageCount || 1,
      }));
      setQueuedDocs(projectedDocs);
    }
  }, [loadedSession]);

  // 卸载时清理 Object URLs
  useEffect(() => {
    return () => {
      Object.values(uploadedFileUrls).forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      });
    };
  }, [uploadedFileUrls]);

  // 拉取历史已解析缓存
  const refreshCachedDocs = useCallback(() => {
    fetch('/api/documents/cached')
      .then(res => res.json())
      .then(data => {
        const docList = Array.isArray(data.documents)
          ? data.documents
          : Array.isArray(data.result)
            ? data.result
            : [];
        if (data.success && Array.isArray(docList)) {
          setCachedDocs(
            docList.map((d: any) => ({
              id: d.docId,
              md5: d.md5,
              filename: d.filename,
              date: new Date(d.parsedAt || Date.now()).toLocaleDateString(),
              size: d.fileSize,
              cacheLevel: d.cacheLevel || 'L1',
            }))
          );
        }
      })
      .catch(err => console.warn('[useWorkbenchSession] 拉取历史已解析缓存失败:', err));
  }, []);

  useEffect(() => {
    refreshCachedDocs();
  }, [refreshCachedDocs]);

  // 队列移除或取消
  const handleRemoveOrCancelDoc = useCallback(
    (doc: QueuedDocItem, e: React.MouseEvent) => {
      e.stopPropagation();
      setQueuedDocs(prev => prev.filter(item => item.id !== doc.id));

      if (selectedSampleId === doc.id || selectedDocId === doc.id) {
        const remaining = queuedDocs.filter(item => item.id !== doc.id);
        const nextDoc = remaining[0];
        if (nextDoc) {
          setSelectedDocId(nextDoc.id);
          const matched = session.documents.find(d => d.docId === nextDoc.id);
          if (matched && matched.batches[0]) {
            setSelectedBatchNo(matched.batches[0].batchNo);
          }
          onSelectSample?.(nextDoc.id);
        }
      }
    },
    [queuedDocs, selectedDocId, selectedSampleId, session.documents, onSelectSample]
  );

  // 从历史缓存恢复文档
  const handleRestoreFromCache = useCallback(
    async (item: CachedDocItem) => {
      const targetKey = item.md5 || item.id;
      try {
        const res = await fetch(`/api/documents/cached?md5=${encodeURIComponent(targetKey)}`);
        const data = await res.json();
        if (data.success && data.result) {
          const doc: SessionDocument = {
            ...data.result.sessionDocument,
            md5: data.result.md5 || item.md5,
          };
          const finalDocId = doc.docId || item.id;
          const isL1Parsed = data.result?.cacheLevel === 'L1' || (doc.batches && Boolean(doc.batches[0]?.grade));

          setQueuedDocs(prev => {
            const filtered = prev.filter(d => d.id !== finalDocId && d.filename !== item.filename && (!item.md5 || d.md5 !== item.md5));
            return [
              ...filtered,
              {
                id: finalDocId,
                filename: item.filename,
                status: isL1Parsed ? '已命中解析缓存' : '就绪',
                size: item.size,
                date: item.date,
                md5: item.md5 || data.result.md5,
              },
            ];
          });

          setSession(prev => {
            const filtered = prev.documents.filter(d => 
              d.docId !== finalDocId && 
              d.filename !== item.filename && 
              (!item.md5 || d.md5 !== item.md5)
            );
            return { ...prev, documents: [...filtered, doc] };
          });

          if (data.result.bboxes && onRestoreBboxes) {
            onRestoreBboxes(finalDocId, data.result.bboxes);
          }

          setSelectedDocId(finalDocId);
          if (doc.batches && doc.batches[0]?.batchNo) {
            setSelectedBatchNo(doc.batches[0].batchNo);
          }
          onShowToast(`已从缓存载入: ${item.filename}`, 'success');
        } else {
          onShowToast(`载入缓存失败: ${data.error || '未找到有效解析结果'}`, 'error');
        }
      } catch (err) {
        console.warn('[useWorkbenchSession] 恢复缓存文档失败:', err);
        onShowToast('载入缓存请求异常', 'error');
      }
    },
    [onRestoreBboxes, onShowToast]
  );

  // 删除指定历史缓存
  const handleDeleteCachedDoc = useCallback(
    async (item: CachedDocItem, e: React.MouseEvent) => {
      e.stopPropagation();
      const targetKey = item.md5 || item.id;
      try {
        const res = await fetch(`/api/documents/cached?md5=${encodeURIComponent(targetKey)}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setCachedDocs(prev => prev.filter(c => c.id !== item.id && (!item.md5 || c.md5 !== item.md5)));
          onShowToast(`已删除缓存: ${item.filename}`, 'info');
        } else {
          onShowToast(data.error || '删除缓存失败', 'error');
        }
      } catch {
        onShowToast('删除缓存请求异常', 'error');
      }
    },
    [onShowToast]
  );

  // 运行客户端切图与服务端落盘
  const runInstantPreprocess = useCallback(
    async (file: File, docId: string, blobUrlParam?: string) => {
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      const currentBlobUrl = blobUrlParam || URL.createObjectURL(file);
      try {
        let prePages: string[] = [];
        let extractedText = '';
        let preTokens: any[] | undefined;
        let isTextBased = false;
        let pageCount = 1;

        if (!file.type.includes('image') && ext === '.pdf') {
          const preRes = await renderPdfAndExtractText(file);
          prePages = preRes.pages || [];
          extractedText = preRes.text || '';
          preTokens = preRes.textTokens;
          isTextBased = preRes.isTextBased;
          pageCount = preRes.pageCount;
        } else {
          prePages = [currentBlobUrl];
        }

        const formData = new FormData();
        formData.append('file', file);
        if (extractedText) formData.append('extractedText', extractedText);
        if (preTokens && preTokens.length > 0) formData.append('textTokens', JSON.stringify(preTokens));
        if (prePages.length > 0) formData.append('pageImages', JSON.stringify(prePages));

        const res = await fetch('/api/documents/preprocess', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.success) {
          const finalMd5 = data.md5;
          setQueuedDocs(qPrev =>
            qPrev.map(q =>
              q.id === docId
                ? {
                    ...q,
                    md5: finalMd5,
                    status: data.hasCachedParse ? '已命中解析缓存' : '就绪',
                    pageCount: data.pageCount,
                  }
                : q
            )
          );

          setSession(sPrev => ({
            ...sPrev,
            documents: sPrev.documents.map(d =>
              d.docId === docId
                ? {
                    ...d,
                    md5: finalMd5,
                    pages: prePages.length > 0 ? prePages : d.pages,
                    samplePages: prePages.length > 0 ? prePages : d.samplePages,
                    pageCount: data.pageCount || pageCount,
                    extractedText,
                    isTextBased,
                  }
                : d
            ),
          }));

          if (data.hasCachedParse) {
            onShowToast(`预处理完成 (已检测到历史解析缓存: ${file.name})`, 'success');
          } else {
            onShowToast(`预处理就绪 (共 ${data.pageCount || pageCount} 页): ${file.name}`, 'success');
          }
          refreshCachedDocs();
        } else {
          setQueuedDocs(qPrev => qPrev.map(q => (q.id === docId ? { ...q, status: '就绪' } : q)));
        }
      } catch (prepErr) {
        console.error('[InstantPreprocess] 预处理失败:', prepErr);
        setQueuedDocs(qPrev => qPrev.map(q => (q.id === docId ? { ...q, status: '就绪' } : q)));
      }
    },
    [onShowToast, refreshCachedDocs]
  );

  // 处理真实本地文件上传
  const handleRealFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArr = Array.from(files);
      if (fileArr.length === 0) return;

      const validExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.bmp'];
      const newUrls: Record<string, string> = {};

      fileArr.forEach(file => {
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (!validExtensions.includes(ext)) {
          onShowToast(`文件 [${file.name}] 格式不受支持。系统仅支持工业 PDF 文档及图片`, 'error');
          return;
        }

        const docId = `doc_up_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
        const blobUrl = URL.createObjectURL(file);
        newUrls[docId] = blobUrl;

        setQueuedDocs(prev => {
          const filtered = prev.filter(item => item.filename !== file.name);
          return [
            ...filtered,
            {
              id: docId,
              filename: file.name,
              status: '预处理中...',
              size: sizeStr,
              date: new Date().toLocaleDateString(),
              md5: undefined,
            },
          ];
        });

        setUploadedFilesMap(prev => ({ ...prev, [docId]: file }));

        setSession(prev => {
          const newDoc: SessionDocument = {
            docId,
            filename: file.name,
            fileSize: sizeStr,
            uploadTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
            ocrStatus: 'PENDING',
            pageCount: 1,
            pages: file.type.includes('image') ? [blobUrl] : undefined,
            samplePages: file.type.includes('image') ? [blobUrl] : undefined,
            batches: [
              {
                batchNo: '',
                subBatchIndex: 1,
                grade: '',
                standard: '',
                supplier: '',
                dimensions: '',
                heatNo: '',
                packNo: '',
                productName: '',
                certificateNo: '',
                deliveryState: '',
                constructionNo: '',
                verdict: 'MANUAL_REVIEW',
                verdictSummary: '等待大模型提取中...',
                ocrConfidence: 0,
                gradeMatchConfidence: 0,
                chemical: [],
                mechanical: { tensile_rm: '', yield_rp02: '', elongation_a: '' },
                process: { flattening: '', flaring: '', intergranularCorrosion: '', ndt: '' },
                reportNo: '',
                sha256Hash: '',
                inspector: '',
              },
            ],
          };
          const filtered = prev.documents.filter(d => d.filename !== file.name);
          return { ...prev, documents: [...filtered, newDoc] };
        });

        runInstantPreprocess(file, docId, blobUrl);
      });

      setUploadedFileUrls(prev => ({ ...prev, ...newUrls }));
    },
    [onShowToast, runInstantPreprocess]
  );

  // 选择订货技术协议 PDF
  const handleSelectAgreementFile = useCallback(
    (file: File) => {
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (ext !== '.pdf') {
        setAgreementUploadError('技术协议仅支持 PDF 格式文档');
        return;
      }
      setUploadedAgreementFile(file);
      setAgreementUploadError(null);
      onShowToast(`已暂存技术协议: ${file.name}（待接入后端比对）`, 'info');
    },
    [onShowToast]
  );

  // 从专测矩阵一键装载测试用例原件
  const handleLoadScenarioFile = useCallback(
    async (scenario: PresetSampleDto) => {
      if (!scenario || !scenario.id || (!scenario.download_url && !scenario.filename)) {
        const errorMsg = `[ScenarioSampleMissingError] 测试用例元数据缺失或未初始化: ${JSON.stringify(scenario || {})}`;
        console.error(errorMsg);
        onShowToast('测试用例元数据缺失，无法装载', 'error');
        throw new ScenarioSampleMissingError(errorMsg);
      }

      const existingDoc = queuedDocs.find(
        d => d.id === scenario.id || d.filename === scenario.filename || (scenario.md5 && d.md5 === scenario.md5)
      );
      if (existingDoc) {
        setSelectedDocId(existingDoc.id);
        const matched = session.documents.find(d => d.docId === existingDoc.id);
        if (matched && matched.batches[0]) {
          setSelectedBatchNo(matched.batches[0].batchNo);
        }
        onShowToast(`测试用例已在待处理队列中: ${existingDoc.filename}`, 'info');
        return;
      }

      const scenarioKey = scenario.id;
      setLoadingScenarios(prev => ({ ...prev, [scenarioKey]: true }));

      try {
        const downloadUrl = scenario.download_url || `/samples/${scenario.filename || `${scenario.id}.pdf`}`;
        const res = await fetch(downloadUrl);
        if (!res.ok) {
          const errorMsg = `[ScenarioSampleMissingError] 获取用例原件失败 [HTTP ${res.status}]：${scenario.filename || scenario.id}`;
          console.error(errorMsg);
          onShowToast(`装载用例原件失败: HTTP ${res.status}`, 'error');
          throw new ScenarioSampleMissingError(errorMsg);
        }
        const blob = await res.blob();
        const filename = scenario.filename || `${scenario.id}.pdf`;
        const file = new File([blob], filename, { type: 'application/pdf' });

        handleRealFiles([file]);
        onShowToast(`已装载测试用例原件至待处理队列: ${filename}`, 'success');
      } catch (err: any) {
        console.warn('[useWorkbenchSession] 装载用例原件异常:', err);
        if (err instanceof ScenarioSampleMissingError) throw err;
        onShowToast(`装载用例原件失败: ${err.message || '网络连接异常'}`, 'error');
        throw err;
      } finally {
        setLoadingScenarios(prev => ({ ...prev, [scenarioKey]: false }));
      }
    },
    [handleRealFiles, onShowToast, queuedDocs, session.documents]
  );

  // 原子清空重置任务
  const resetSession = useCallback(() => {
    const freshSession = createEmptyInspectionSession();
    setSession(freshSession);
    setQueuedDocs([]);
    setUploadedFilesMap({});
    setUploadedFileUrls({});
    setSelectedDocId('');
    setSelectedBatchNo('');
    refreshCachedDocs();
  }, [refreshCachedDocs]);

  // 是否存在正在进行预处理的文档
  const isAnyDocPreprocessing = useMemo(() => {
    return queuedDocs.some(d => d.status === '预处理中...' || d.status === '上传中' || d.status === '解析中');
  }, [queuedDocs]);

  return {
    session,
    setSession,
    queuedDocs,
    setQueuedDocs,
    selectedDocId,
    setSelectedDocId,
    selectedBatchNo,
    setSelectedBatchNo,
    cachedDocs,
    uploadedFilesMap,
    setUploadedFilesMap,
    uploadedFileUrls,
    setUploadedFileUrls,
    loadingScenarios,
    uploadedAgreementFile,
    setUploadedAgreementFile,
    agreementUploadError,
    setAgreementUploadError,
    isAgreementDraggingOver,
    setIsAgreementDraggingOver,
    isAnyDocPreprocessing,
    refreshCachedDocs,
    handleRemoveOrCancelDoc,
    handleRestoreFromCache,
    handleDeleteCachedDoc,
    handleRealFiles,
    runInstantPreprocess,
    handleSelectAgreementFile,
    handleLoadScenarioFile,
    resetSession,
  };
}
