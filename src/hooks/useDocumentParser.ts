'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { SessionDocument } from '@/types/session.ts';
import { DocumentParsingTask, SessionTokenMetrics } from '@/types/parser.ts';

const MAX_CONCURRENCY = 2; // 并发线程数：2

export function useDocumentParser(
  onDocumentParsed?: (docId: string, parsedDoc: SessionDocument, bboxes?: any[]) => void
) {
  const [tasks, setTasks] = useState<Record<string, DocumentParsingTask>>({});
  const [isParsingActive, setIsParsingActive] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const activeWorkersRef = useRef<number>(0);
  const queueRef = useRef<string[]>([]);
  const docsMapRef = useRef<Record<string, SessionDocument>>({});
  const filesMapRef = useRef<Record<string, File>>({});
  const timerRefs = useRef<Record<string, NodeJS.Timeout[]>>({});

  // Session 累计 Token 指标
  const [sessionMetrics, setSessionMetrics] = useState<SessionTokenMetrics>({
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalDurationSeconds: 0,
    activeConcurrency: 0,
    readyDocsCount: 0,
    totalDocsCount: 0,
  });

  // 更新总计统计指标
  const recalculateMetrics = useCallback((updatedTasks: Record<string, DocumentParsingTask>) => {
    let totalIn = 0;
    let totalOut = 0;
    let totalDur = 0;
    let readyCount = 0;
    let activeCount = 0;
    const taskList = Object.values(updatedTasks);

    taskList.forEach(t => {
      totalIn += t.inputTokens;
      totalOut += t.outputTokens;
      totalDur += t.durationSeconds;
      if (t.status === 'ready') readyCount++;
      if (t.status === 'parsing') activeCount++;
    });

    setSessionMetrics({
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      totalDurationSeconds: totalDur,
      activeConcurrency: activeCount,
      readyDocsCount: readyCount,
      totalDocsCount: taskList.length,
    });
  }, []);

  // 执行单份文档的真实 API 调用与流式渲染
  const executeDocumentWorker = useCallback(
    async (docId: string, forceReparse = false) => {
      const doc = docsMapRef.current[docId];
      if (!doc) return;

      activeWorkersRef.current++;
      const file = filesMapRef.current[docId];

      // 初始化任务为 parsing
      setTasks(prev => {
        const updatedTask: DocumentParsingTask = {
          docId,
          filename: doc.filename,
          fileSize: doc.fileSize,
          status: 'parsing',
          progress: 10,
          streamingJson: '// 正在计算文件 MD5 指纹并检索缓存...',
          stepPhase: '1/3 校验 MD5 缓存与模型接入中...',
          inputTokens: 0,
          outputTokens: 0,
          durationSeconds: 0,
        };
        const next: Record<string, DocumentParsingTask> = {
          ...prev,
          [docId]: updatedTask,
        };
        recalculateMetrics(next);
        return next;
      });

      try {
        const formData = new FormData();
        if (file) {
          formData.append('file', file);
        } else {
          formData.append('sampleId', docId);
          formData.append('filename', doc.filename);
        }
        if (forceReparse) {
          formData.append('forceReparse', 'true');
        }

        const res = await fetch('/api/documents/parse', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          const errMessage = data.error || '文档解析受阻';
          setLastError(errMessage);

          setTasks(prev => {
            const currentTask = prev[docId];
            if (!currentTask) return prev;
            const updatedTask: DocumentParsingTask = {
              ...currentTask,
              status: 'error',
              progress: 0,
              stepPhase: '解析失败/阻断',
              errorMsg: errMessage,
            };
            const next: Record<string, DocumentParsingTask> = {
              ...prev,
              [docId]: updatedTask,
            };
            recalculateMetrics(next);
            return next;
          });

          activeWorkersRef.current = Math.max(0, activeWorkersRef.current - 1);
          setIsParsingActive(false);
          return;
        }

        const parseResult = data.result;
        if (parseResult?.sessionDocument) {
          onDocumentParsed?.(docId, parseResult.sessionDocument, parseResult.bboxes);
        }
        const rawJsonText = parseResult.rawStreamingJson || JSON.stringify(parseResult.sessionDocument, null, 2);
        const isFromCache = parseResult.tokenStats?.isFromCache;

        // 模拟平滑流式打字输出
        const totalChars = rawJsonText.length;
        const targetDuration = isFromCache ? 0.6 : Math.max(1.5, parseResult.tokenStats?.durationSeconds || 2.5);
        const intervalMs = 30;
        const totalSteps = Math.floor((targetDuration * 1000) / intervalMs);
        const charsPerStep = Math.max(12, Math.ceil(totalChars / totalSteps));

        let currentStep = 0;
        let currentChars = 0;

        const interval = setInterval(() => {
          currentStep++;
          currentChars = Math.min(totalChars, currentChars + charsPerStep);
          const streamedText = rawJsonText.slice(0, currentChars);
          const progress = Math.min(99, Math.floor((currentStep / totalSteps) * 100));

          let stepPhase = isFromCache
            ? 'MD5 缓存命中，秒级重放提取单据中...'
            : '2/3 大模型提取理化与力学指标中...';
          if (progress > 80) {
            stepPhase = '3/3 结构化数据映射就绪...';
          }

          setTasks(prev => {
            const currentTask = prev[docId];
            if (!currentTask || currentTask.status !== 'parsing') return prev;

            const updatedTask: DocumentParsingTask = {
              ...currentTask,
              progress,
              streamingJson: streamedText,
              stepPhase,
              outputTokens: Math.floor((currentChars / totalChars) * (parseResult.tokenStats?.outputTokens || 400)),
              durationSeconds: parseFloat(((currentStep * intervalMs) / 1000).toFixed(1)),
            };
            const next: Record<string, DocumentParsingTask> = {
              ...prev,
              [docId]: updatedTask,
            };
            recalculateMetrics(next);
            return next;
          });

          if (currentChars >= totalChars && currentStep >= totalSteps) {
            clearInterval(interval);

            // 完成该任务
            setTimeout(() => {
              setTasks(prev => {
                const currentTask = prev[docId];
                if (!currentTask) return prev;

                const updatedTask: DocumentParsingTask = {
                  ...currentTask,
                  status: 'ready',
                  progress: 100,
                  streamingJson: rawJsonText,
                  stepPhase: isFromCache ? '已命中本地 MD5 缓存 (0 Token 开销)' : '解析完成，数据已规整就绪',
                  inputTokens: parseResult.tokenStats?.inputTokens || 0,
                  outputTokens: parseResult.tokenStats?.outputTokens || 0,
                  durationSeconds: parseResult.tokenStats?.durationSeconds || 0.1,
                  completedAt: new Date().toLocaleTimeString(),
                };
                const next: Record<string, DocumentParsingTask> = {
                  ...prev,
                  [docId]: updatedTask,
                };
                recalculateMetrics(next);
                return next;
              });

              activeWorkersRef.current = Math.max(0, activeWorkersRef.current - 1);

              // 取下一项
              if (queueRef.current.length > 0) {
                const nextDocId = queueRef.current.shift();
                if (nextDocId) {
                  executeDocumentWorker(nextDocId);
                }
              } else if (activeWorkersRef.current === 0) {
                setIsParsingActive(false);
              }
            }, 100);
          }
        }, intervalMs);

        if (!timerRefs.current[docId]) {
          timerRefs.current[docId] = [];
        }
        timerRefs.current[docId]!.push(interval);
      } catch (err: any) {
        console.error(`[useDocumentParser] 文档 ${docId} 解析异常:`, err);
        setLastError(err.message || '网络连接或服务端异常');

        setTasks(prev => {
          const currentTask = prev[docId];
          if (!currentTask) return prev;
          const updatedTask: DocumentParsingTask = {
            ...currentTask,
            status: 'error',
            progress: 0,
            stepPhase: '解析异常',
            errorMsg: err.message,
          };
          const next: Record<string, DocumentParsingTask> = {
            ...prev,
            [docId]: updatedTask,
          };
          recalculateMetrics(next);
          return next;
        });

        activeWorkersRef.current = Math.max(0, activeWorkersRef.current - 1);
        setIsParsingActive(false);
      }
    },
    [recalculateMetrics]
  );

  // 启动整个 Session 的并发解析
  const startParsingSession = useCallback(
    (documents: SessionDocument[], filesMap?: Record<string, File>) => {
      setLastError(null);
      Object.values(timerRefs.current).forEach(tList => {
        tList.forEach(t => clearInterval(t));
      });
      timerRefs.current = {};

      const docsMap: Record<string, SessionDocument> = {};
      const initialTasks: Record<string, DocumentParsingTask> = {};
      const queue: string[] = [];

      documents.forEach((doc, idx) => {
        docsMap[doc.docId] = doc;
        if (idx < MAX_CONCURRENCY) {
          // 前 MAX_CONCURRENCY 个直接启动
        } else {
          queue.push(doc.docId);
        }

        initialTasks[doc.docId] = {
          docId: doc.docId,
          filename: doc.filename,
          fileSize: doc.fileSize,
          status: idx < MAX_CONCURRENCY ? 'parsing' : 'queued',
          progress: 0,
          streamingJson: '',
          stepPhase: '等待进入解析通道...',
          inputTokens: 0,
          outputTokens: 0,
          durationSeconds: 0,
        };
      });

      docsMapRef.current = docsMap;
      filesMapRef.current = filesMap || {};
      queueRef.current = queue;
      activeWorkersRef.current = 0;
      setIsParsingActive(true);
      setTasks(initialTasks);
      recalculateMetrics(initialTasks);

      const initialBatch = documents.slice(0, MAX_CONCURRENCY);
      initialBatch.forEach(doc => {
        executeDocumentWorker(doc.docId);
      });
    },
    [executeDocumentWorker, recalculateMetrics]
  );

  // 单独强制重新解析某份文档 (绕过 MD5 缓存)
  const reparseDocument = useCallback(
    (docId: string) => {
      executeDocumentWorker(docId, true);
    },
    [executeDocumentWorker]
  );

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      Object.values(timerRefs.current).forEach(tList => {
        tList.forEach(t => clearInterval(t));
      });
    };
  }, []);

  return {
    tasks,
    sessionMetrics,
    isParsingActive,
    lastError,
    startParsingSession,
    reparseDocument,
  };
}
