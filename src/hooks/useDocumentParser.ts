'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { SessionDocument } from '@/types/session.ts';
import { DocumentParsingTask, SessionTokenMetrics } from '@/types/parser.ts';

// 真实结构化提取 JSON 模板（用于生成打字机流式输出）
const SAMPLE_STREAMING_JSON_TEMPLATES: Record<string, string> = {
  default: `/* === 大模型视觉解析与结构化提取流水 === */
{
  "header": {
    "certificateNo": "20260704203",
    "productName": "换热管 (Heat exchange tubes)",
    "declaredStandard": "NB/T 47019.5-2021, GB/T 13296-2023",
    "materialGrade": "S32168 (06Cr18Ni11Ti)",
    "heatNo": "YX2602-2207",
    "packNo": "Z26022C",
    "deliveryState": "固溶退火 (Solution Annealed)",
    "dimensions": "OD 15.0mm × WT 0.8mm"
  },
  "chemicalComposition": {
    "C": "0.018 wt%",
    "Si": "0.44 wt%",
    "Mn": "1.16 wt%",
    "P": "0.035 wt%",
    "S": "0.005 wt%",
    "Cr": "17.41 wt%",
    "Ni": "9.08 wt%",
    "Ti": "0.14 wt%",
    "N": "<0.01 wt%"
  },
  "mechanicalProperties": {
    "tensile_rm": "621、620 MPa (标准 ≥520)",
    "yield_rp02": "268、267 MPa (标准 ≥205)",
    "elongation_a": "57.5、61.5 % (标准 ≥40)",
    "hardness": "139.3 HV1 (实测 143/145/137/132/140/139)"
  },
  "technologicalAndNdt": {
    "flattening": "合格 (无裂纹/无分层)",
    "flaring": "合格 (顶心锥度 60°, 扩口率 ≥20%)",
    "intergranularCorrosion": "合格 (硫酸-硫酸铜法弯曲无裂纹)",
    "ndt": "涡流检测 (ET) 与超声波检测 (UT) 均合格 OK",
    "surfaceQuality": "内外表面光洁，无裂纹、折叠与重皮缺陷"
  }
}`,
};

const MAX_CONCURRENCY = 2; // 并发线程数：2

export function useDocumentParser() {
  const [tasks, setTasks] = useState<Record<string, DocumentParsingTask>>({});
  const [isParsingActive, setIsParsingActive] = useState<boolean>(false);
  const activeWorkersRef = useRef<number>(0);
  const queueRef = useRef<string[]>([]);
  const docsMapRef = useRef<Record<string, SessionDocument>>({});
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

  // 执行单份文档的流式打字与解析
  const executeDocumentWorker = useCallback((docId: string) => {
    const doc = docsMapRef.current[docId];
    if (!doc) return;

    activeWorkersRef.current++;
    const rawTemplate: string = SAMPLE_STREAMING_JSON_TEMPLATES[docId] || SAMPLE_STREAMING_JSON_TEMPLATES.default || '';
    const totalChars = rawTemplate.length;
    const targetDuration = 2.4 + Math.random() * 0.8; // 2.4s ~ 3.2s
    const intervalMs = 40;
    const totalSteps = Math.floor((targetDuration * 1000) / intervalMs);
    const charsPerStep = Math.max(8, Math.ceil(totalChars / totalSteps));

    let currentStep = 0;
    let currentChars = 0;

    // 初始化任务为 parsing
    setTasks(prev => {
      const updatedTask: DocumentParsingTask = {
        docId,
        filename: doc.filename,
        fileSize: doc.fileSize,
        status: 'parsing',
        progress: 0,
        streamingJson: '',
        stepPhase: '1/3 视觉版面分析与OCR坐标提取中...',
        inputTokens: Math.floor(1800 + Math.random() * 600),
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

    const timers: NodeJS.Timeout[] = [];
    timerRefs.current[docId] = timers;

    const interval = setInterval(() => {
      currentStep++;
      currentChars = Math.min(totalChars, currentChars + charsPerStep);
      const streamedText = rawTemplate.slice(0, currentChars);
      const progress = Math.min(99, Math.floor((currentStep / totalSteps) * 100));

      let stepPhase = '1/3 视觉版面分析与OCR坐标提取中...';
      if (progress > 35 && progress <= 75) {
        stepPhase = '2/3 元素与力学指标结构化解析中...';
      } else if (progress > 75) {
        stepPhase = '3/3 规则引擎映射与规整就绪...';
      }

      setTasks(prev => {
        const currentTask = prev[docId];
        if (!currentTask || currentTask.status !== 'parsing') return prev;

        const updatedTask: DocumentParsingTask = {
          ...currentTask,
          progress,
          streamingJson: streamedText,
          stepPhase,
          outputTokens: Math.floor((currentChars / totalChars) * 450),
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

        // 完成该文档
        setTimeout(() => {
          setTasks(prev => {
            const currentTask = prev[docId];
            if (!currentTask) return prev;

            const updatedTask: DocumentParsingTask = {
              ...currentTask,
              status: 'ready',
              progress: 100,
              streamingJson: rawTemplate,
              stepPhase: '解析完成，数据已规整就绪',
              outputTokens: 480 + Math.floor(Math.random() * 40),
              durationSeconds: parseFloat(targetDuration.toFixed(1)),
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

          // 从队列取下一份文档
          if (queueRef.current.length > 0) {
            const nextDocId = queueRef.current.shift();
            if (nextDocId) {
              executeDocumentWorker(nextDocId);
            }
          } else if (activeWorkersRef.current === 0) {
            setIsParsingActive(false);
          }
        }, 150);
      }
    }, intervalMs);

    timers.push(interval);
  }, [recalculateMetrics]);

  // 启动整个 Session 的并发解析
  const startParsingSession = useCallback((documents: SessionDocument[]) => {
    // 清理旧定时器
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
    queueRef.current = queue;
    activeWorkersRef.current = 0;
    setIsParsingActive(true);
    setTasks(initialTasks);
    recalculateMetrics(initialTasks);

    // 启动前 MAX_CONCURRENCY 个 Worker
    const initialBatch = documents.slice(0, MAX_CONCURRENCY);
    initialBatch.forEach(doc => {
      executeDocumentWorker(doc.docId);
    });
  }, [executeDocumentWorker, recalculateMetrics]);

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
    startParsingSession,
  };
}
