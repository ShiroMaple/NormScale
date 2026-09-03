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
        }
        if (doc.md5) {
          formData.append('md5', doc.md5);
        }
        formData.append('sampleId', docId);
        formData.append('filename', doc.filename);
        if (doc.pages && doc.pages.length > 0) {
          formData.append('pageImages', JSON.stringify(doc.pages));
        }
        if (doc.extractedText) {
          formData.append('extractedText', doc.extractedText);
        }
        if (forceReparse) {
          formData.append('forceReparse', 'true');
        }
        formData.append('stream', 'true');

        const startTime = Date.now();
        const res = await fetch('/api/documents/parse', {
          method: 'POST',
          headers: {
            Accept: 'text/event-stream',
          },
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `请求异常 [HTTP ${res.status}]`);
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('未获取到有效流式响应流体');
        }

        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let accumulatedStreamingJson = '';
        let currentProgress = 10;
        let currentStepPhase = '1/5 预处理资产检索中...';
        let estimatedOutputTokens = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || '';

          for (const message of messages) {
            const lines = message.split('\n');
            let eventType = 'message';
            let dataStr = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                dataStr = line.slice(6).trim();
              }
            }

            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);

              // 1. 命中有效解析缓存 (秒级直出，跳过流式打印过程，静默就绪)
              if (eventType === 'cached') {
                const parseResult = data.result;
                if (parseResult?.sessionDocument) {
                  onDocumentParsed?.(docId, parseResult.sessionDocument, parseResult.bboxes);
                }
                const formattedJson = parseResult.rawStreamingJson || JSON.stringify(parseResult.sessionDocument, null, 2);

                setTasks(prev => {
                  const currentTask = prev[docId];
                  if (!currentTask) return prev;
                  const updatedTask: DocumentParsingTask = {
                    ...currentTask,
                    status: 'ready',
                    progress: 100,
                    streamingJson: formattedJson,
                    stepPhase: '已命中本地 MD5 缓存 (0 Token 开销)',
                    inputTokens: parseResult.tokenStats?.inputTokens || 0,
                    outputTokens: parseResult.tokenStats?.outputTokens || 0,
                    durationSeconds: 0.05,
                    completedAt: new Date().toLocaleTimeString(),
                  };
                  const next: Record<string, DocumentParsingTask> = {
                    ...prev,
                    [docId]: updatedTask,
                  };
                  recalculateMetrics(next);
                  return next;
                });
                break;
              }

              // 2. 真实进度事件
              if (eventType === 'progress') {
                currentProgress = data.progress ?? currentProgress;
                currentStepPhase = data.stepPhase ?? currentStepPhase;

                setTasks(prev => {
                  const currentTask = prev[docId];
                  if (!currentTask || currentTask.status !== 'parsing') return prev;
                  const durationSec = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));
                  const updatedTask: DocumentParsingTask = {
                    ...currentTask,
                    progress: currentProgress,
                    stepPhase: currentStepPhase,
                    durationSeconds: durationSec,
                  };
                  const next = { ...prev, [docId]: updatedTask };
                  recalculateMetrics(next);
                  return next;
                });
              }

              // 3. 真实增量 Chunk 事件
              if (eventType === 'chunk') {
                accumulatedStreamingJson += data.delta || '';
                currentProgress = data.progress ?? currentProgress;
                estimatedOutputTokens = data.outputTokens ?? Math.ceil(accumulatedStreamingJson.length / 3.5);

                setTasks(prev => {
                  const currentTask = prev[docId];
                  if (!currentTask || currentTask.status !== 'parsing') return prev;
                  const durationSec = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));
                  const updatedTask: DocumentParsingTask = {
                    ...currentTask,
                    progress: currentProgress,
                    streamingJson: accumulatedStreamingJson,
                    stepPhase: '3/5 大模型实时生成理化与力学检验指标中...',
                    outputTokens: estimatedOutputTokens,
                    durationSeconds: durationSec,
                  };
                  const next = { ...prev, [docId]: updatedTask };
                  recalculateMetrics(next);
                  return next;
                });
              }

              // 4. 解析完成事件 (交付结构化数据与格式化美化 JSON)
              if (eventType === 'complete') {
                const parseResult = data.result;
                if (parseResult?.sessionDocument) {
                  onDocumentParsed?.(docId, parseResult.sessionDocument, parseResult.bboxes);
                }
                const formattedJson = parseResult.rawStreamingJson || JSON.stringify(parseResult.sessionDocument, null, 2);
                const durationSec = parseResult.tokenStats?.durationSeconds || parseFloat(((Date.now() - startTime) / 1000).toFixed(1));

                setTasks(prev => {
                  const currentTask = prev[docId];
                  if (!currentTask) return prev;
                  const updatedTask: DocumentParsingTask = {
                    ...currentTask,
                    status: 'ready',
                    progress: 100,
                    streamingJson: formattedJson,
                    stepPhase: '解析完成，全景数据已结构化入库',
                    inputTokens: parseResult.tokenStats?.inputTokens || 1800,
                    outputTokens: parseResult.tokenStats?.outputTokens || estimatedOutputTokens,
                    durationSeconds: durationSec,
                    completedAt: new Date().toLocaleTimeString(),
                  };
                  const next = { ...prev, [docId]: updatedTask };
                  recalculateMetrics(next);
                  return next;
                });
              }

              // 5. 错误事件
              if (eventType === 'error') {
                throw new Error(data.error || '模型服务返回解析错误');
              }
            } catch (err: any) {
              if (eventType === 'error') throw err;
            }
          }
        }

        activeWorkersRef.current = Math.max(0, activeWorkersRef.current - 1);
        if (queueRef.current.length > 0) {
          const nextDocId = queueRef.current.shift();
          if (nextDocId) {
            executeDocumentWorker(nextDocId);
          }
        } else if (activeWorkersRef.current === 0) {
          setIsParsingActive(false);
        }
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
    [recalculateMetrics, onDocumentParsed]
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
