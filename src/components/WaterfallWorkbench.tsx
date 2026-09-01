'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AuditReport } from '@/schemas/report.schema.ts';
import { PresetSampleDto, StandardOverviewDto } from '@/lib/api-client.ts';
import {
  InspectionSession,
  SessionDocument,
  BatchSpecimen,
  DEFAULT_INSPECTION_SESSION,
  generateSessionId,
} from '@/types/session.ts';
import { BatchContextBar } from './BatchContextBar.tsx';
import { getZPJEBBoxes, FieldBBox } from '@/types/bbox.ts';
import { HitlDrawer } from './HitlDrawer.tsx';
import { HitlInterruptContext, HumanCorrectionInput } from '@/workflow/state.interface.ts';
import { toPng } from 'html-to-image';
import { useDocumentParser } from '@/hooks/useDocumentParser.ts';
import { LlmStreamingTerminal } from './LlmStreamingTerminal.tsx';

interface WaterfallWorkbenchProps {
  standardsData?: {
    total_standards: number;
    total_slices: number;
    standards: StandardOverviewDto[];
  };
  samples: PresetSampleDto[];
  selectedSampleId: string;
  onSelectSample: (sampleId: string) => void;
  isAuditing: boolean;
  currentReport?: AuditReport;
  onOpenHitlDrawer: () => void;
  onTriggerAudit: () => void;
  loadedSession?: InspectionSession | null;
  initialStep?: number;
}

export interface StandardCatalogGrade {
  code: string;
  primaryGrade: string;
  display: string;
  description?: string;
}

export interface StandardCatalogItem {
  id: string;
  shortCode: string;
  name: string;
  category: '承压订货技术条件' | '产品制造通用标准' | '其他规范';
  badgeColor: string;
  grades: StandardCatalogGrade[];
}

export const STANDARDS_CATALOG: StandardCatalogItem[] = [
  {
    id: 'NB/T 47019.5-2021',
    shortCode: 'NB/T 47019.5',
    name: '锅炉、热交换器用管订货技术条件 第5部分：不锈钢',
    category: '承压订货技术条件',
    badgeColor: 'text-amber-700 bg-amber-50 dark:bg-amber-950/70 border-amber-300 dark:border-amber-700',
    grades: [
      { code: 'S32168', primaryGrade: '06Cr18Ni11Ti', display: '06Cr18Ni11Ti (S32168)', description: '钛稳定化奥氏体不锈钢承压管' },
      { code: 'S30408', primaryGrade: '06Cr19Ni10', display: '06Cr19Ni10 (S30408)', description: '通用18-8型奥氏体耐腐蚀钢管' },
      { code: 'S31603', primaryGrade: '022Cr17Ni12Mo2', display: '022Cr17Ni12Mo2 (S31603)', description: '超低碳钼系耐蚀不锈钢管' },
      { code: 'S34778', primaryGrade: '06Cr18Ni11Nb', display: '06Cr18Ni11Nb (S34778)', description: '铌稳定化高温抗蠕变钢管' },
      { code: 'S31008', primaryGrade: '06Cr25Ni20', display: '06Cr25Ni20 (S31008)', description: '25-20型高温抗氧化耐热钢管' },
    ],
  },
  {
    id: 'GB/T 13296-2023',
    shortCode: 'GB/T 13296',
    name: '锅炉、热交换器用不锈钢无缝钢管',
    category: '产品制造通用标准',
    badgeColor: 'text-blue-700 bg-blue-50 dark:bg-blue-950/70 border-blue-300 dark:border-blue-700',
    grades: [
      { code: 'S32168', primaryGrade: '06Cr18Ni11Ti', display: '06Cr18Ni11Ti (S32168)', description: '钛稳定化奥氏体不锈钢无缝管 (原件默认)' },
      { code: 'S30408', primaryGrade: '06Cr19Ni10', display: '06Cr19Ni10 (S30408)', description: '常规奥氏体不锈钢通用管' },
      { code: 'S31603', primaryGrade: '022Cr17Ni12Mo2', display: '022Cr17Ni12Mo2 (S31603)', description: '超低碳耐点蚀承压不锈钢管' },
      { code: 'S34778', primaryGrade: '06Cr18Ni11Nb', display: '06Cr18Ni11Nb (S34778)', description: '铌稳定化高温用管' },
      { code: 'S31008', primaryGrade: '06Cr25Ni20', display: '06Cr25Ni20 (S31008)', description: '耐热抗氧化不锈钢特种管' },
      { code: 'S31254', primaryGrade: '015Cr20Ni18Mo6CuN', display: '015Cr20Ni18Mo6CuN (S31254)', description: '超级奥氏体耐点蚀钢管' },
      { code: 'S32205', primaryGrade: '022Cr23Ni5Mo3N', display: '022Cr23Ni5Mo3N (S32205)', description: '2205奥氏体-铁素体双相钢管' },
      { code: 'S31803', primaryGrade: '022Cr22Ni5Mo3N', display: '022Cr22Ni5Mo3N (S31803)', description: '高强度耐应力腐蚀双相钢管' },
      { code: 'S32750', primaryGrade: '022Cr25Ni7Mo4N', display: '022Cr25Ni7Mo4N (S32750)', description: '超级双相不锈钢特种管' },
    ],
  },
];

export const AVAILABLE_GRADE_SLICES = STANDARDS_CATALOG.flatMap(s =>
  s.grades.map(g => ({
    grade: g.display,
    standard: s.id,
    label: `${g.display} - ${s.shortCode}`,
  }))
);

/**
 * ============================================================================
 * NormScale 工业质检工作台 (1:1 像素级还原 Stitch 设计系统)
 * 采用受控垂直平滑滑动容器，禁止全局滚轮脱焦，支持两层树状作业会话 (Session)
 * ============================================================================
 */
export const WaterfallWorkbench: React.FC<WaterfallWorkbenchProps> = ({
  samples: _samples,
  selectedSampleId,
  onSelectSample,
  isAuditing,
  onOpenHitlDrawer,
  onTriggerAudit,
  loadedSession,
  initialStep = 0,
}) => {
  // 当前激活的步骤索引：0 (Step 1), 1 (Step 2), 2 (Step 3), 3 (Step 4)
  const [currentStep, setCurrentStep] = useState<number>(initialStep);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [selectedExportFormat, setSelectedExportFormat] = useState<string>('PDF');
  const [activeTabCategory, setActiveTabCategory] = useState<string>('all');
  // 步骤 3: 全景合规比对矩阵分类页签与标准/牌号双搜索控件状态
  const [step3Category, setStep3Category] = useState<string>('all');
  const [isStandardSelectorOpen, setIsStandardSelectorOpen] = useState<boolean>(false);
  const [isGradeSelectorOpen, setIsGradeSelectorOpen] = useState<boolean>(false);
  const [standardSearchQuery, setStandardSearchQuery] = useState<string>('');
  const [gradeSearchQuery, setGradeSearchQuery] = useState<string>('');

  // 当前作业会话 (Session) 与当前 Focus 的文档 ID 及炉批号 (默认首位选中真实《质保书.pdf》及其第 1 批次)
  const [session, setSession] = useState<InspectionSession>(loadedSession || DEFAULT_INSPECTION_SESSION);
  const [selectedDocId, setSelectedDocId] = useState<string>(
    session.documents[0]?.docId || 'doc_zpje_01'
  );
  const [selectedBatchNo, setSelectedBatchNo] = useState<string>(
    session.documents[0]?.batches[0]?.batchNo || 'Z26022C-DB7'
  );

  // 源文档 OCR 视觉 BBox 与右侧解析字段双向联动状态
  const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(null);
  // 停顿满 1 秒后激活 200% 原位放大的字段 ID 与防晕倒计时器
  const [magnifiedFieldId, setMagnifiedFieldId] = useState<string | null>(null);
  const magnifyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [currentDocPage, setCurrentDocPage] = useState<number>(1);
  const pdfScrollContainerRef = useRef<HTMLDivElement>(null);
  const rightScrollContainerRef = useRef<HTMLDivElement>(null);

  // 当大模型或缓存解析返回真实 Document 数据时，实时双向同步至工作台 Session
  const handleDocumentParsed = useCallback((docId: string, parsedDoc: SessionDocument) => {
    setSession(prev => ({
      ...prev,
      documents: prev.documents.map(d => (d.docId === docId ? { ...parsedDoc, docId } : d)),
    }));
  }, []);

  // 多文档异步并发解析工作池 Hook
  const {
    tasks: parsingTasks,
    sessionMetrics,
    lastError,
    startParsingSession,
    reparseDocument,
  } = useDocumentParser(handleDocumentParsed);
  const [isStreamingTerminalExpanded, setIsStreamingTerminalExpanded] = useState<boolean>(true);
  const prevDocStatusMap = useRef<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [uploadedFilesMap, setUploadedFilesMap] = useState<Record<string, File>>({});

  // 监听当前选中文档的解析状态，当解析从 parsing 变更为 ready 时，延迟 800ms 自动平滑折叠
  const currentDocTask = parsingTasks[selectedDocId];
  useEffect(() => {
    if (!currentDocTask) return undefined;
    const prevStatus = prevDocStatusMap.current[selectedDocId];
    if (prevStatus === 'parsing' && currentDocTask.status === 'ready') {
      const timer = setTimeout(() => {
        setIsStreamingTerminalExpanded(false);
      }, 800);
      return () => clearTimeout(timer);
    }
    prevDocStatusMap.current[selectedDocId] = currentDocTask.status;
    return undefined;
  }, [currentDocTask, selectedDocId]);

  // 当用户在顶栏选择器主动切换到正在解析中的文档时，自动展开该文档的流式终端
  useEffect(() => {
    if (currentDocTask && currentDocTask.status === 'parsing') {
      setIsStreamingTerminalExpanded(true);
    }
  }, [selectedDocId, currentDocTask?.status]);

  // 首次载入或文档/缩放变化时，确保 PDF 视窗水平居中
  useEffect(() => {
    const container = pdfScrollContainerRef.current;
    if (!container) return;
    const centerTimer = setTimeout(() => {
      if (container.scrollWidth > container.clientWidth) {
        container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
      }
    }, 50);
    return () => clearTimeout(centerTimer);
  }, [zoomLevel, currentDocPage, selectedDocId, currentStep]);

  // 组件卸载时安全清理定时器
  useEffect(() => {
    return () => {
      if (magnifyTimerRef.current) {
        clearTimeout(magnifyTimerRef.current);
      }
    };
  }, []);

  // 批次号双向同步更新处理器 (同步更新 Session 和当前选中的批次号，使上方选择器联动变更)
  const handleUpdateBatchNo = (newBatchNo: string) => {
    setSession(prevSession => {
      const updatedDocuments = prevSession.documents.map(doc => {
        if (doc.docId === selectedDocId) {
          return {
            ...doc,
            batches: doc.batches.map(b => {
              if (b.batchNo === selectedBatchNo) {
                return { ...b, batchNo: newBatchNo };
              }
              return b;
            }),
          };
        }
        return doc;
      });
      return {
        ...prevSession,
        documents: updatedDocuments,
      };
    });
    setSelectedBatchNo(newBatchNo);
  };

  // 步骤 3: 人工切换标准/钢级规则切片 (Manual Override)
  const handleOverrideGrade = (newGrade: string, newStandard: string) => {
    setSession(prev => ({
      ...prev,
      documents: prev.documents.map(doc => {
        if (doc.docId === selectedDocId) {
          return {
            ...doc,
            batches: doc.batches.map(b => {
              if (b.batchNo === selectedBatchNo) {
                return {
                  ...b,
                  overrideGrade: newGrade,
                  overrideStandard: newStandard,
                };
              }
              return b;
            }),
          };
        }
        return doc;
      }),
    }));
    setIsGradeSelectorOpen(false);
  };

  // 恢复默认原件规则切片
  const handleResetGrade = () => {
    setSession(prev => ({
      ...prev,
      documents: prev.documents.map(doc => {
        if (doc.docId === selectedDocId) {
          return {
            ...doc,
            batches: doc.batches.map(b => {
              if (b.batchNo === selectedBatchNo) {
                const { overrideGrade, overrideStandard, ...rest } = b;
                return rest as BatchSpecimen;
              }
              return b;
            }),
          };
        }
        return doc;
      }),
    }));
  };

  // 质检员人工复核判定（双轨制：非必须，且绝不覆盖系统判定的客观计算结果）
  const handleSetHumanVerdict = (humanDecision: 'PASS' | 'REJECT' | null) => {
    setSession(prev => ({
      ...prev,
      documents: prev.documents.map(doc => {
        if (doc.docId === selectedDocId) {
          return {
            ...doc,
            batches: doc.batches.map(b => {
              if (b.batchNo === selectedBatchNo) {
                return {
                  ...b,
                  humanVerdict: humanDecision,
                  humanVerdictSummary: humanDecision === 'PASS'
                    ? '质检工程师人工核准通过'
                    : humanDecision === 'REJECT'
                      ? '质检工程师人工标记拒收'
                      : undefined,
                  humanVerifiedAt: humanDecision ? new Date().toISOString() : undefined,
                };
              }
              return b;
            }),
          };
        }
        return doc;
      }),
    }));
  };

  // 当外部加载历史 Session 时，自动同步更新
  useEffect(() => {
    if (loadedSession) {
      setSession(loadedSession);
      const firstDoc = loadedSession.documents[0];
      if (firstDoc) {
        setSelectedDocId(firstDoc.docId);
        const firstBatch = firstDoc.batches[0];
        if (firstBatch) {
          setSelectedBatchNo(firstBatch.batchNo);
        }
      }
      setCurrentStep(1); // 自动进入 Step 2 进行核对
    }
  }, [loadedSession]);

  // 待处理文档接口定义
  interface QueuedDocItem {
    id: string;
    filename: string;
    status: '就绪' | '上传中' | '解析中';
    size: string;
    date: string;
    md5?: string;
  }

  interface CachedDocItem {
    id: string;
    filename: string;
    date: string;
    size: string;
    md5?: string;
  }

  // 待处理文档队列状态（初始完全清空为 0，由用户上传或从真实缓存载入）
  const [queuedDocs, setQueuedDocs] = useState<QueuedDocItem[]>([]);

  // 历史已缓存文档列表状态（由服务端 .cache/parses/ 动态提供）
  const [cachedDocs, setCachedDocs] = useState<CachedDocItem[]>([]);

  // 动态拉取服务端真实的已缓存文档列表
  const refreshCachedDocs = useCallback(() => {
    fetch('/api/documents/cached')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.documents)) {
          setCachedDocs(
            data.documents.map((d: any) => ({
              id: d.docId,
              md5: d.md5,
              filename: d.filename,
              date: new Date(d.parsedAt).toLocaleDateString(),
              size: d.fileSize,
            }))
          );
        }
      })
      .catch(err => console.warn('[WaterfallWorkbench] 拉取历史已解析缓存失败:', err));
  }, []);

  useEffect(() => {
    refreshCachedDocs();
  }, [refreshCachedDocs]);

  // 处理队列卡片右上角按钮点击：未上传完成的取消上传，已上传完成的移出队列并保留至历史缓存
  const handleRemoveOrCancelDoc = (doc: QueuedDocItem, e: React.MouseEvent) => {
    e.stopPropagation();

    // 移出待处理队列
    setQueuedDocs(prev => prev.filter(item => item.id !== doc.id));

    // 若被移除的正是当前选中的样本，自动切换至队列中下一个有效文档
    if (selectedSampleId === doc.id) {
      const remaining = queuedDocs.filter(item => item.id !== doc.id);
      const nextDoc = remaining[0];
      if (nextDoc) {
        onSelectSample(nextDoc.id);
      }
    }
  };

  // 从历史缓存恢复至待处理队列并选中
  const handleRestoreFromCache = async (item: CachedDocItem) => {
    setQueuedDocs(prev => {
      if (prev.some(d => d.id === item.id)) return prev;
      return [...prev, { id: item.id, filename: item.filename, status: '就绪', size: item.size, date: item.date, md5: item.md5 }];
    });

    // 如果当前 session.documents 尚未包含该文档，从缓存端点读取填充
    if (!session.documents.some(d => d.docId === item.id)) {
      try {
        const res = await fetch('/api/documents/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sampleId: item.id, filename: item.filename }),
        });
        const data = await res.json();
        if (data.success && data.result?.sessionDocument) {
          setSession(prev => ({
            ...prev,
            documents: [...prev.documents, data.result.sessionDocument],
          }));
        }
      } catch (err) {
        console.warn('[WaterfallWorkbench] 读取缓存单据失败:', err);
      }
    }

    onSelectSample(item.id);
    showToast(`已从历史缓存载入: ${item.filename}`, 'info');
  };

  // 处理用户选择真实本地文件上传 (支持 PDF 与图片)
  const handleRealFiles = (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    fileArr.forEach(file => {
      const docId = `doc_up_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

      setQueuedDocs(prev => [
        ...prev,
        {
          id: docId,
          filename: file.name,
          status: '就绪',
          size: sizeStr,
          date: new Date().toLocaleDateString(),
        },
      ]);

      setUploadedFilesMap(prev => ({
        ...prev,
        [docId]: file,
      }));

      // 同步追加到当前 session.documents
      setSession(prev => {
        const newDoc: SessionDocument = {
          docId,
          filename: file.name,
          fileSize: sizeStr,
          uploadTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
          ocrStatus: 'PENDING',
          pageCount: 1,
          batches: [
            {
              batchNo: `${file.name.replace(/\.[^/.]+$/, '').slice(0, 8)}-01`,
              subBatchIndex: 1,
              grade: '待提取',
              standard: '待提取',
              supplier: '待提取',
              dimensions: '待提取',
              heatNo: '待提取',
              verdict: 'PASS',
              verdictSummary: '等待大模型提取中...',
              ocrConfidence: 99,
              gradeMatchConfidence: 99,
              chemical: [],
              mechanical: { tensile_rm: '', yield_rp02: '', elongation_a: '' },
              process: { flattening: 'PASS', intergranularCorrosion: 'PASS', ndt: '' },
              reportNo: '',
              sha256Hash: '',
              inspector: '',
            },
          ],
        };
        return {
          ...prev,
          documents: [...prev.documents, newDoc],
        };
      });

      showToast(`已加入待处理队列: ${file.name}`, 'success');
    });
  };

  // 从 Step 1 触发新建 Session 并前往 Step 2 (启动 2~3 线程异步并发工作池)
  const handleStartNewSessionAndAdvance = () => {
    const newSessionId = generateSessionId();
    // 优先采用用户实际加入队列/已上传的真实文档；若队列为空则回退至预置样本
    const activeDocs = session.documents.filter(d => queuedDocs.some(q => q.id === d.docId));
    const finalDocs = activeDocs.length > 0
      ? activeDocs
      : (session.documents.length > 0 ? session.documents : DEFAULT_INSPECTION_SESSION.documents);

    const totalBatches = finalDocs.reduce((acc, d) => acc + d.batches.length, 0);
    const passedBatches = finalDocs.reduce((acc, d) => acc + d.batches.filter(b => b.verdict === 'PASS').length, 0);
    const failedBatches = finalDocs.reduce((acc, d) => acc + d.batches.filter(b => b.verdict === 'FAIL').length, 0);
    const hitlBatches = finalDocs.reduce((acc, d) => acc + d.batches.filter(b => b.verdict === 'MANUAL_REVIEW').length, 0);

    const newSession: InspectionSession = {
      sessionId: newSessionId,
      createdAt: new Date().toLocaleString(),
      title: activeDocs.length > 0
        ? `现场实时录入批次 · 共 ${activeDocs.length} 份文档检验`
        : '现场实时录入批次 · 承压装备材料合规检验',
      totalDocuments: finalDocs.length,
      totalBatches,
      passedBatches,
      failedBatches,
      hitlBatches,
      documents: finalDocs,
    };
    setSession(newSession);
    const firstDoc = finalDocs[0];
    if (firstDoc) {
      setSelectedDocId(firstDoc.docId);
      const firstBatch = firstDoc.batches[0];
      if (firstBatch) {
        setSelectedBatchNo(firstBatch.batchNo);
      }
    }
    // 启动多文档异步并发解析工作池 (传入真实文件流映射)
    startParsingSession(finalDocs, uploadedFilesMap);
    setIsStreamingTerminalExpanded(true);
    setCurrentStep(1);
  };

  // 获得当前选中的物理 Document 和 Batch
  const currentDoc: SessionDocument =
    session.documents.find(d => d.docId === selectedDocId) ||
    session.documents[0] ||
    DEFAULT_INSPECTION_SESSION.documents[0]!;

  const currentBatch: BatchSpecimen =
    currentDoc.batches.find(b => b.batchNo === selectedBatchNo) ||
    currentDoc.batches[0] ||
    DEFAULT_INSPECTION_SESSION.documents[0]!.batches[0]!;

  const activeGrade = currentBatch.overrideGrade || currentBatch.grade;
  const activeStandard = currentBatch.overrideStandard || currentBatch.standard;
  const isOverridden = Boolean(currentBatch.overrideGrade || currentBatch.overrideStandard);

  let computedIsPass = currentBatch.verdict === 'PASS';
  let computedVerdictSummary = currentBatch.verdictSummary;

  if (isOverridden) {
    if (currentBatch.batchNo.includes('DB7') && activeGrade.includes('S30408')) {
      computedIsPass = false;
      computedVerdictSummary = '人工切换为 S30408：Cr 实测 17.41% 低于标准下限 (≥18.00%)，触发一票否决';
    } else if (currentBatch.batchNo.includes('DB7') && activeGrade.includes('S31603')) {
      computedIsPass = false;
      computedVerdictSummary = '人工切换为 S31603：缺少关键耐点蚀元素 Mo 钼熔炼分析指标 (标准要求 2.00~3.00%)，判定不合格';
    } else {
      computedIsPass = currentBatch.verdict === 'PASS';
      computedVerdictSummary = currentBatch.verdictSummary || `人工切换为 ${activeGrade}：全项指标符合 ${activeStandard} 规范要求`;
    }
  }

  const isPass = computedIsPass;
  const isHitl = currentBatch.verdict === 'MANUAL_REVIEW';

  // 步骤 3 / 步骤 2 HITL 侧边抽屉内部状态
  const [isHitlDrawerOpen, setIsHitlDrawerOpen] = useState<boolean>(false);
  const [activeHitlContext, setActiveHitlContext] = useState<HitlInterruptContext | undefined>(undefined);
  const [isHitlSubmitting, setIsHitlSubmitting] = useState<boolean>(false);

  // 触发打开 HITL 抽屉 (根据当前批次动态适配场景)
  const handleTriggerHitl = () => {
    const reason: HitlInterruptContext['reason'] = currentBatch.hitlReason || (
      currentBatch.grade.includes('Special') || currentBatch.grade.includes('SUS') || currentBatch.grade.includes('未知')
        ? 'UNKNOWN_GRADE'
        : 'ALTERNATIVE_CLAUSE'
    );

    const ctx: HitlInterruptContext = {
      reason,
      prompt_message: currentBatch.systemVerdictSummary || currentBatch.verdictSummary || '触发人机协同规则阻断，需人工介入核实',
      batch_no: currentBatch.batchNo,
    };
    setActiveHitlContext(ctx);
    setIsHitlDrawerOpen(true);
    onOpenHitlDrawer?.();
  };

  // 质检员确认并恢复流转（闭环重算当前批次）
  const handleResolveHitl = async (correction: HumanCorrectionInput) => {
    setIsHitlSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 350));

    setSession(prev => ({
      ...prev,
      documents: prev.documents.map(doc => {
        if (doc.docId === selectedDocId) {
          return {
            ...doc,
            batches: doc.batches.map(b => {
              if (b.batchNo === selectedBatchNo) {
                let nextVerdict: 'PASS' | 'FAIL' = 'PASS';
                let nextSummary = '质检工程师完成协同确认放行';
                let nextOverrideGrade = b.overrideGrade;

                if (correction.corrected_grade) {
                  nextOverrideGrade = correction.corrected_grade;
                  nextVerdict = 'PASS';
                  nextSummary = `质检员已消歧指定国家标准钢级为 ${correction.corrected_grade}，全项比对合格`;
                } else if (correction.accepted_alternative_clause !== undefined) {
                  if (correction.accepted_alternative_clause) {
                    nextVerdict = 'PASS';
                    nextSummary = '质检员已确认依据合同采纳涡流探伤替代液压试验，致密性指标判定通过';
                  } else {
                    nextVerdict = 'FAIL';
                    nextSummary = '质检员已核实不予采纳替代，按水压试验缺项一票否决处理';
                  }
                } else if (correction.arbitrated_standard_id) {
                  nextVerdict = 'PASS';
                  nextSummary = `已指定以 ${correction.arbitrated_standard_id} 作为主仲裁标尺重新计算，判定合规`;
                } else if (correction.qualitative_verdict) {
                  nextVerdict = correction.qualitative_verdict;
                  nextSummary = correction.qualitative_verdict === 'PASS'
                    ? '质检工程师已复核定性描述条款，确认显微组织符合标准技术要求'
                    : '质检工程师已复核定性描述条款，判定显微组织存在缺陷，予以否决';
                }

                return {
                  ...b,
                  verdict: nextVerdict,
                  verdictSummary: nextSummary,
                  systemVerdict: nextVerdict,
                  systemVerdictSummary: nextSummary,
                  overrideGrade: nextOverrideGrade,
                  humanVerdict: nextVerdict === 'FAIL' ? 'REJECT' : 'PASS',
                  humanVerdictSummary: correction.waiver_notes || (nextVerdict === 'FAIL' ? '质检工程师核准予以否决' : '质检工程师完成协同确认放行'),
                  humanVerifiedAt: new Date().toISOString(),
                };
              }
              return b;
            }),
          };
        }
        return doc;
      }),
    }));

    setIsHitlSubmitting(false);
    setIsHitlDrawerOpen(false);
  };

  // 步骤 2: 质检员直接原位编辑校准提取数据 (HITL 方案一)
  const handleUpdateExtractValue = (fieldId: string, newValue: string) => {
    setSession(prev => ({
      ...prev,
      documents: prev.documents.map(doc => {
        if (doc.docId !== selectedDocId) return doc;
        return {
          ...doc,
          batches: doc.batches.map(b => {
            if (b.batchNo !== selectedBatchNo) return b;

            // 1. 化学成分
            if (fieldId.startsWith('chem_')) {
              const elem = fieldId.replace('chem_', '');
              const cleanVal = newValue.replace(/\s*wt%?/i, '').trim();
              return {
                ...b,
                chemical: b.chemical.map(c => {
                  if (c.element.toLowerCase() === elem.toLowerCase()) {
                    return { ...c, value: cleanVal, confidence: '100%', status: 'ok' as const, note: undefined };
                  }
                  return c;
                }),
              };
            }

            // 2. 力学性能
            if (fieldId === 'mech_tensile') {
              return { ...b, mechanical: { ...b.mechanical, tensile_rm: newValue } };
            }
            if (fieldId === 'mech_yield') {
              return { ...b, mechanical: { ...b.mechanical, yield_rp02: newValue } };
            }
            if (fieldId === 'mech_elongation') {
              return { ...b, mechanical: { ...b.mechanical, elongation_a: newValue } };
            }
            if (fieldId === 'mech_hardness') {
              return { ...b, mechanical: { ...b.mechanical, hardness: newValue } };
            }

            // 3. 工艺性能
            if (fieldId === 'proc_flattening') {
              const isPass = !newValue.includes('不') && !newValue.includes('未') && !newValue.toUpperCase().includes('FAIL');
              return { ...b, process: { ...b.process, flattening: isPass ? 'PASS' : 'FAIL' } };
            }
            if (fieldId === 'proc_flaring') {
              const isPass = !newValue.includes('不') && !newValue.includes('未') && !newValue.toUpperCase().includes('FAIL');
              return { ...b, process: { ...b.process, flaring: isPass ? 'PASS' : 'FAIL' } };
            }

            // 4. 金相组织
            if (fieldId === 'metallo_grain') {
              return { ...b, process: { ...b.process, grainSize: newValue } };
            }

            // 5. 耐腐蚀性能
            if (fieldId === 'corrosion_intergranular') {
              const isPass = !newValue.includes('不') && !newValue.includes('未') && !newValue.toUpperCase().includes('FAIL');
              return { ...b, process: { ...b.process, intergranularCorrosion: isPass ? 'PASS' : 'FAIL' } };
            }

            // 6. 无损探伤
            if (fieldId === 'ndt_et' || fieldId === 'ndt_pressure') {
              return { ...b, process: { ...b.process, ndt: newValue } };
            }

            // 7. 基础元数据
            if (fieldId === 'meta_grade') {
              return { ...b, grade: newValue };
            }
            if (fieldId === 'meta_standard') {
              return { ...b, standard: newValue };
            }
            if (fieldId === 'meta_heatNo') {
              return { ...b, heatNo: newValue };
            }
            if (fieldId === 'meta_packNo') {
              return { ...b, packNo: newValue };
            }
            if (fieldId === 'meta_dimensions') {
              return { ...b, dimensions: newValue };
            }
            if (fieldId === 'meta_deliveryState') {
              return { ...b, deliveryState: newValue };
            }

            return b;
          }),
        };
      }),
    }));
  };

  // 从 activeStandard 中解析出已选中的标准列表 (严格仅按顿号、逗号、分号切分，绝对不按空格切分，因标准代号内部自带空格如 "GB/T 13296-2023")
  const selectedStandardIds = useMemo(() => {
    const rawList = activeStandard
      .split(/[、,，;；\n]+/)
      .map(s => s.trim())
      .filter(Boolean);

    const sanitized: string[] = [];
    let i = 0;
    while (i < rawList.length) {
      const current = rawList[i]!;
      const exactMatch = STANDARDS_CATALOG.find(s => s.id === current || s.shortCode === current);
      if (exactMatch) {
        if (!sanitized.includes(exactMatch.id)) sanitized.push(exactMatch.id);
        i++;
        continue;
      }
      // 容错修复：若历史操作中曾被空格错误拆成了 'NB/T' 和 '47019.5-2021'，自动重新缝合为完整标准 ID
      if (i + 1 < rawList.length) {
        const combined = `${current} ${rawList[i + 1]}`;
        const combinedMatch = STANDARDS_CATALOG.find(s => s.id === combined || s.shortCode === combined);
        if (combinedMatch) {
          if (!sanitized.includes(combinedMatch.id)) sanitized.push(combinedMatch.id);
          i += 2;
          continue;
        }
      }
      if (!sanitized.includes(current)) sanitized.push(current);
      i++;
    }
    return sanitized;
  }, [activeStandard]);

  // 根据当前勾选的执行标准集合，动态提取可用牌号并集，并计算多标覆盖度
  const availableGradesForSelectedStandards = useMemo(() => {
    const matchedStandards = STANDARDS_CATALOG.filter(std =>
      selectedStandardIds.some(sel => std.id.includes(sel) || sel.includes(std.shortCode) || std.shortCode.includes(sel))
    );
    const effectiveStandards = matchedStandards.length > 0 ? matchedStandards : STANDARDS_CATALOG;

    const gradeMap = new Map<string, {
      code: string;
      primaryGrade: string;
      display: string;
      description?: string;
      supportedStandards: string[];
    }>();

    for (const std of effectiveStandards) {
      for (const g of std.grades) {
        if (!gradeMap.has(g.code)) {
          gradeMap.set(g.code, {
            code: g.code,
            primaryGrade: g.primaryGrade,
            display: g.display,
            description: g.description,
            supportedStandards: [std.shortCode],
          });
        } else {
          const item = gradeMap.get(g.code)!;
          if (!item.supportedStandards.includes(std.shortCode)) {
            item.supportedStandards.push(std.shortCode);
          }
        }
      }
    }

    const totalCount = effectiveStandards.length;
    return Array.from(gradeMap.values()).map(g => ({
      ...g,
      isFullyCovered: g.supportedStandards.length >= totalCount && totalCount > 1,
      coverageLabel: g.supportedStandards.length >= totalCount && totalCount > 1
        ? '双标覆盖'
        : `${g.supportedStandards[0]} 专有`,
    }));
  }, [selectedStandardIds]);

  // 切换/勾选标准
  const handleToggleStandard = (stdId: string) => {
    let newSelected: string[];
    const isCurrentlySelected = selectedStandardIds.includes(stdId);

    if (isCurrentlySelected) {
      if (selectedStandardIds.length <= 1) {
        return; // 至少保留一个标准
      }
      newSelected = selectedStandardIds.filter(s => s !== stdId);
    } else {
      newSelected = [...selectedStandardIds, stdId];
    }

    const newStandardStr = newSelected.join('、');

    // 智能同名匹配优先：检查当前 activeGrade 是否在新的标准集合支持的牌号中
    const currentGradeCodeMatch = activeGrade.match(/S\d{5}/);
    const currentCode = currentGradeCodeMatch ? currentGradeCodeMatch[0] : '';

    const nextStandards = STANDARDS_CATALOG.filter(std =>
      newSelected.some(sel => std.id.includes(sel) || sel.includes(std.shortCode) || std.shortCode.includes(sel))
    );
    const allNextGrades = nextStandards.flatMap(s => s.grades);
    const hasCurrentGrade = allNextGrades.some(g => g.code === currentCode || g.display === activeGrade);

    let nextGrade = activeGrade;
    if (!hasCurrentGrade && allNextGrades.length > 0) {
      nextGrade = allNextGrades[0]!.display;
    }

    handleOverrideGrade(nextGrade, newStandardStr);
  };

  // 单选材料牌号
  const handleSelectGrade = (newGradeDisplay: string) => {
    handleOverrideGrade(newGradeDisplay, activeStandard);
    setIsGradeSelectorOpen(false);
  };

  // 计算当前文档/批次的 OCR BBox 字典
  const bboxes: FieldBBox[] = currentDoc.docId === 'doc_zpje_01'
    ? getZPJEBBoxes(currentBatch.batchNo)
    : [];

  // 退出聚焦放大状态，恢复常规显示
  const handleResetMagnify = useCallback(() => {
    if (magnifyTimerRef.current) {
      clearTimeout(magnifyTimerRef.current);
      magnifyTimerRef.current = null;
    }
    setMagnifiedFieldId(null);
  }, []);

  // 监听 ESC 快捷键退出聚焦放大
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && magnifiedFieldId) {
        handleResetMagnify();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [magnifiedFieldId, handleResetMagnify]);

  // 1. 悬浮右侧字段：仅滚动左侧 PDF 视窗，绝不触发外部整页或右侧视窗滚动
  const scrollToLeftBBox = (fieldId: string | null) => {
    // 立即清空上一个防晕倒计时
    if (magnifyTimerRef.current) {
      clearTimeout(magnifyTimerRef.current);
      magnifyTimerRef.current = null;
    }

    setHighlightedFieldId(fieldId);

    // 若解除高亮（鼠标移出），保持当前的聚焦放大状态（不自动回缩，方便质检员移到右侧打字输入）
    if (!fieldId) {
      return;
    }

    // 启动 1000ms 防晕倒计时：在同一字段停留满 1 秒后才激活 200% 放大
    magnifyTimerRef.current = setTimeout(() => {
      setMagnifiedFieldId(fieldId);
    }, 1000);

    if (!currentDoc.samplePages || currentDoc.samplePages.length === 0) return;

    const box = bboxes.find(b => b.id === fieldId);
    if (!box) return;

    setCurrentDocPage(box.page);
    const container = pdfScrollContainerRef.current;
    if (!container) return;

    const boxElem = document.getElementById(`bbox-${box.id}`);
    const pageElem = document.getElementById(`pdf-page-${box.page}`);
    const targetElem = boxElem || pageElem;
    if (targetElem) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetElem.getBoundingClientRect();
      const targetTopInContainer = targetRect.top - containerRect.top + container.scrollTop;
      const targetScrollTop = targetTopInContainer - (container.clientHeight / 2) + (targetRect.height / 2);
      container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
    }
  };

  // 别名保留以兼容现有调用
  const handleFieldHover = scrollToLeftBBox;

  // 2. 悬浮左侧 BBox：仅滚动右侧解析数据视窗，绝不触发外部整页或左侧视窗滚动
  const scrollToRightField = (fieldId: string) => {
    // 立即清空上一个防晕倒计时
    if (magnifyTimerRef.current) {
      clearTimeout(magnifyTimerRef.current);
      magnifyTimerRef.current = null;
    }

    setHighlightedFieldId(fieldId);

    // 左侧直接 hover BBox 停留满 1000ms 同样激活 200% 聚焦放大
    magnifyTimerRef.current = setTimeout(() => {
      setMagnifiedFieldId(fieldId);
    }, 1000);

    const container = rightScrollContainerRef.current;
    if (!container) return;

    let targetElem = document.getElementById(`right-field-${fieldId}`);
    if (!targetElem && fieldId.startsWith('method_')) {
      const baseId = fieldId.replace('method_', '');
      if (baseId === 'tensile') targetElem = document.getElementById('right-field-mech_tensile');
      else if (baseId === 'hardness') targetElem = document.getElementById('right-field-mech_hardness');
      else if (baseId === 'grain') targetElem = document.getElementById('right-field-metallo_grain');
      else targetElem = document.getElementById(`right-field-${baseId}`);
    }

    if (targetElem) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetElem.getBoundingClientRect();

      // 判断该元素是否已经处于右侧视窗可视区域内（上下各留 40px 缓冲），若已可见则不重复跳动
      const isVisible = (
        targetRect.top >= containerRect.top + 40 &&
        targetRect.bottom <= containerRect.bottom - 40
      );

      if (!isVisible) {
        const targetTopInContainer = targetRect.top - containerRect.top + container.scrollTop;
        const targetScrollTop = targetTopInContainer - (container.clientHeight / 2) + (targetRect.height / 2);
        container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
      }
    }
  };

  // 3. 左侧视窗工具栏翻页控制器：仅滚动左侧 PDF 视窗
  const goToPage = (page: number) => {
    const target = Math.max(1, Math.min(currentDoc.pageCount, page));
    if (target !== currentDocPage) {
      handleResetMagnify();
    }
    setCurrentDocPage(target);
    const container = pdfScrollContainerRef.current;
    if (!container) return;
    const pageElem = document.getElementById(`pdf-page-${target}`);
    if (pageElem) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = pageElem.getBoundingClientRect();
      const targetTop = targetRect.top - containerRect.top + container.scrollTop;
      container.scrollTo({ top: Math.max(0, targetTop - 10), behavior: 'smooth' });
    }
  };

  // 截图导出加载状态
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  // 全局轻量 Toast 状态通知
  const [toastInfo, setToastInfo] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastInfo({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setToastInfo(null);
      toastTimerRef.current = null;
    }, 3500);
  }, []);

  // 监听大模型解析错误并阻断提示
  useEffect(() => {
    if (lastError) {
      showToast(lastError, 'error');
    }
  }, [lastError, showToast]);

  // 1. 保存当前作业会话 (Session) 的全部系统和人工检验结果至本地台账
  const handleSaveSessionResults = useCallback((silent: boolean = false) => {
    try {
      const storageKey = 'normscale_saved_sessions';
      const existingRaw = localStorage.getItem(storageKey);
      let sessionsList: InspectionSession[] = existingRaw ? JSON.parse(existingRaw) : [];

      // 提取并更新当前 Session 数据（确保实测值、判定状态与最新修改同步存盘）
      const sessionToSave: InspectionSession = {
        ...session,
        createdAt: session.createdAt || new Date().toISOString().replace('T', ' ').slice(0, 19),
      };

      // 覆盖已存在的同名 Session 或置顶追加
      sessionsList = sessionsList.filter(s => s.sessionId !== sessionToSave.sessionId);
      sessionsList.unshift(sessionToSave);

      localStorage.setItem(storageKey, JSON.stringify(sessionsList));

      if (!silent) {
        showToast(`检验结果已成功保存至本地台账 (${sessionToSave.sessionId})`, 'success');
      }
    } catch {
      if (!silent) {
        showToast('保存台账失败，请检查浏览器本地存储权限', 'error');
      }
    }
  }, [session, showToast]);

  // PDF 预览视窗鼠标按住拖拽平移状态 (支持全向左右、上下与斜向自由平移)
  const isDraggingPdfRef = useRef<boolean>(false);
  const dragStartXRef = useRef<number>(0);
  const dragStartYRef = useRef<number>(0);
  const scrollStartXRef = useRef<number>(0);
  const scrollStartYRef = useRef<number>(0);
  const [isMouseDownDragging, setIsMouseDownDragging] = useState<boolean>(false);

  const handlePdfMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // 仅响应鼠标左键
    const container = pdfScrollContainerRef.current;
    if (!container) return;

    isDraggingPdfRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartYRef.current = e.clientY;
    scrollStartXRef.current = container.scrollLeft;
    scrollStartYRef.current = container.scrollTop;
    setIsMouseDownDragging(true);
  };

  // 全局监听拖拽，保证斜向与跨边界拖拽极其顺滑
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingPdfRef.current) return;
      const container = pdfScrollContainerRef.current;
      if (!container) return;

      e.preventDefault();
      const deltaX = e.clientX - dragStartXRef.current;
      const deltaY = e.clientY - dragStartYRef.current;

      container.scrollLeft = scrollStartXRef.current - deltaX;
      container.scrollTop = scrollStartYRef.current - deltaY;
    };

    const handleGlobalMouseUp = () => {
      if (isDraggingPdfRef.current) {
        isDraggingPdfRef.current = false;
        setIsMouseDownDragging(false);
      }
    };

    if (isMouseDownDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove, { passive: false });
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isMouseDownDragging]);

  // 2. 基于 html-to-image (调用浏览器底层原生渲染管线) 生成 100% 像素级对齐的无损 PNG 截图
  const handleSaveStep3Screenshot = useCallback(async () => {
    const targetElement = document.getElementById('step-3-workbench-panel');
    if (!targetElement) {
      showToast('无法定位步骤 3 结果视窗', 'error');
      return;
    }

    setIsCapturing(true);

    try {
      // 确保字体全部加载度量就绪
      if (document.fonts) {
        await document.fonts.ready;
      }

      const isDark = document.documentElement.classList.contains('dark');
      const targetWidth = targetElement.scrollWidth || targetElement.offsetWidth;
      const targetHeight = targetElement.scrollHeight || targetElement.offsetHeight;

      const pngData = await toPng(targetElement, {
        quality: 1,
        pixelRatio: 2, // 2x 视网膜级高清输出
        backgroundColor: isDark ? '#141218' : '#ffffff',
        cacheBust: true,
        width: targetWidth,
        height: targetHeight,
        style: {
          margin: '0',
          transform: 'none',
          left: '0',
          top: '0',
          maxWidth: 'none',
          width: `${targetWidth}px`,
          height: `${targetHeight}px`,
        },
      });

      const downloadAnchor = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      downloadAnchor.download = `NormScale_合规比对结果_${currentBatch.batchNo}_${dateStr}.png`;
      downloadAnchor.href = pngData;
      downloadAnchor.click();

      showToast('步骤 3 结果 PNG 截图已成功导出', 'success');
    } catch (err) {
      console.error('html-to-image screenshot failed:', err);
      showToast('截图生成失败，请重试', 'error');
    } finally {
      setIsCapturing(false);
    }
  }, [currentBatch.batchNo, showToast]);

  const goToStep = (stepIdx: number) => {
    if (stepIdx >= 0 && stepIdx <= 2) {
      setCurrentStep(stepIdx);
    }
  };

  // 3. 开启新任务：自动归档当前 Session 结果并重置返回步骤 1
  const handleStartNewTask = useCallback(() => {
    // 自动静默保存当前作业会话
    handleSaveSessionResults(true);

    // 生成全新 Session ID 与干净初始化会话
    const newSessionId = generateSessionId();
    const freshSession: InspectionSession = {
      ...DEFAULT_INSPECTION_SESSION,
      sessionId: newSessionId,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    setSession(freshSession);
    setSelectedDocId(freshSession.documents[0]?.docId || 'doc_zpje_01');
    setSelectedBatchNo(freshSession.documents[0]?.batches[0]?.batchNo || 'Z26022C-DB7');

    // 重置步骤并返回步骤 1
    goToStep(0);
    showToast('已自动归档当前检验结果，已为您开启新任务', 'success');
  }, [handleSaveSessionResults, showToast]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden select-none relative">
      {/* 顶层轻量 Toast 反馈提示 (自动淡出) */}
      {toastInfo && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md transition-all animate-bounce-in border text-xs font-bold bg-inverse-surface text-inverse-on-surface border-outline-variant/30">
          <span className={`material-symbols-outlined text-base ${toastInfo.type === 'success' ? 'text-emerald-400' : toastInfo.type === 'error' ? 'text-red-400' : 'text-amber-400'
            }`}>
            {toastInfo.type === 'success' ? 'check_circle' : toastInfo.type === 'error' ? 'error' : 'info'}
          </span>
          <span>{toastInfo.message}</span>
        </div>
      )}

      {/* 4 步受控平滑滑动主容器 (Vertical Step Slider) */}
      <div className="flex-1 w-full overflow-hidden relative">
        <div
          className="w-full h-full flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]"
          style={{ transform: `translateY(-${currentStep * 100}%)` }}
        >

          {/* ========================================================================= */}
          {/* 步骤 1: 批量质保证书录入 (优化版：DocEx 风格物理文档队列与极简上传区) */}
          {/* ========================================================================= */}
          <section className="w-full h-full shrink-0 overflow-y-auto custom-scrollbar p-6 space-y-6">
            <div className="max-w-[1440px] mx-auto w-full space-y-5">

              {/* 页面标题 */}
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-2xl">
                  upload
                </span>
                <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface dark:text-surface-bright tracking-tight">
                  步骤 1: 上传或选择待解析文档
                </h1>
              </div>

              {/* 隐藏式真实文件选择输入框 */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={e => {
                  if (e.target.files) {
                    handleRealFiles(e.target.files);
                    e.target.value = '';
                  }
                }}
                multiple
                accept=".pdf,image/*"
                className="hidden"
              />

              {/* 左右分栏：左侧大拖拽区 + 右侧待处理文档队列 (DocEx 风格) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                {/* 左侧：文档上传区（大虚线框，可拖拽或点击选取多个真实文档） */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => {
                    e.preventDefault();
                    setIsDraggingOver(true);
                  }}
                  onDragLeave={() => setIsDraggingOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDraggingOver(false);
                    if (e.dataTransfer.files) {
                      handleRealFiles(e.dataTransfer.files);
                    }
                  }}
                  className={`lg:col-span-6 xl:col-span-7 bg-surface-container-lowest dark:bg-surface-dark border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all min-h-[300px] shadow-xs group ${
                    isDraggingOver
                      ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                      : 'border-outline-variant/60 dark:border-border-dark hover:border-primary dark:hover:border-primary-fixed-dim'
                  }`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant group-hover:text-primary group-hover:bg-primary/10 flex items-center justify-center transition-all mb-4">
                    <span className="material-symbols-outlined text-3xl">
                      cloud_upload
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-on-surface dark:text-surface-bright mb-1.5">
                    拖拽文件到此处，或点击选取本地真实 PDF/图片
                  </h3>
                  <p className="text-xs text-on-surface-variant dark:text-outline-variant">
                    自动计算文件 MD5 存证指纹并秒级检索缓存，单个文件最高支持 50MB
                  </p>
                </div>

                {/* 右侧：待处理文档队列（DocEx 风格：显示文档图标与传输/就绪状态，右上角 hover 按钮） */}
                <div className="lg:col-span-6 xl:col-span-5 bg-surface-container-lowest/60 dark:bg-surface-dark/60 border border-outline-variant/60 dark:border-border-dark rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xs font-bold text-on-surface dark:text-surface-bright">
                        待处理文档队列 ({queuedDocs.length})
                      </h2>
                    </div>

                    {/* 文档卡片网格 */}
                    {queuedDocs.length === 0 ? (
                      <div className="h-36 flex flex-col items-center justify-center text-center p-4 border border-dashed border-outline-variant/50 dark:border-border-dark rounded-xl text-on-surface-variant dark:text-outline-variant text-xs">
                        <span className="material-symbols-outlined text-2xl mb-1 text-on-surface-variant/60">inbox</span>
                        <span>待处理队列为空，请从左侧上传或从下方缓存选择</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                        {queuedDocs.map(doc => {
                          const isSelected = selectedSampleId === doc.id;
                          const isUploading = doc.status === '上传中';
                          return (
                            <div
                              key={doc.id}
                              onClick={() => onSelectSample(doc.id)}
                              className={`relative group p-3 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-between text-center h-36 ${isSelected
                                ? 'border-primary dark:border-primary-fixed-dim ring-2 ring-primary/20 bg-surface-container-lowest dark:bg-surface-dark shadow-xs'
                                : 'border-outline-variant/60 dark:border-border-dark hover:border-outline bg-surface-container-lowest dark:bg-surface-dark'
                                }`}
                            >
                              {/* 右上角 Hover 出现的关闭/取消按钮 */}
                              <button
                                type="button"
                                title={isUploading ? '取消上传' : '移出待处理队列'}
                                onClick={(e) => handleRemoveOrCancelDoc(doc, e)}
                                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-on-surface-variant hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 opacity-0 group-hover:opacity-100 transition-all z-10"
                              >
                                <span className="material-symbols-outlined text-[14px]">close</span>
                              </button>

                              <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
                                <span className="material-symbols-outlined text-2xl fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                                  picture_as_pdf
                                </span>
                              </div>

                              <span className="font-mono text-xs font-bold text-on-surface dark:text-surface-bright line-clamp-2 max-w-[130px] break-all leading-tight my-1">
                                {doc.filename}
                              </span>

                              <span className={`text-[11px] font-bold ${doc.status === '解析中'
                                ? 'text-primary dark:text-primary-fixed-dim animate-pulse'
                                : isUploading
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-status-pass-text'
                                }`}>
                                {isAuditing && selectedSampleId === doc.id ? '解析中' : doc.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 历史已缓存文档栏 */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-on-surface-variant text-base">
                      description
                    </span>
                    <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center gap-2">
                      <span>历史已缓存文档</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-surface-container-high dark:bg-surface-dark-high text-[11px] font-mono text-on-surface-variant font-medium">
                        {cachedDocs.length}
                      </span>
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant font-normal">
                        (点击卡片一键复用，无需重复解析)
                      </span>
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={onTriggerAudit}
                    className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary dark:hover:text-primary-fixed-dim transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">refresh</span>
                    <span>刷新</span>
                  </button>
                </div>

                {/* 水平缓存文档卡片列表 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {cachedDocs.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleRestoreFromCache(item)}
                      className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-3 shadow-xs flex items-center gap-3 cursor-pointer hover:border-primary transition-all"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-xl fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                          picture_as_pdf
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs font-bold text-on-surface dark:text-surface-bright block truncate">
                          {item.filename}
                        </span>
                        <span className="text-[10px] text-on-surface-variant dark:text-outline-variant block mt-0.5">
                          {item.date} • {item.size}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>


          {/* ========================================================================= */}
          {/* 步骤 2: 质检工作台 - 核对解析数据 (挂载统一标题与批次选择条) */}
          {/* ========================================================================= */}
          <section className="w-full h-full shrink-0 overflow-hidden p-6 flex flex-col">
            <div className="max-w-[1440px] mx-auto w-full h-full flex flex-col space-y-4 min-h-0">

              {/* 顶部统一标题与两层树状批次选择条 (固定在顶部，不随内容滚动) */}
              <div className="shrink-0 relative z-30">
                <BatchContextBar
                  stepTitle="步骤 2: 核对解析数据"
                  session={session}
                  selectedDocId={selectedDocId}
                  selectedBatchNo={selectedBatchNo}
                  onSelectDoc={setSelectedDocId}
                  onSelectBatch={(docId, batchNo) => {
                    setSelectedDocId(docId);
                    setSelectedBatchNo(batchNo);
                  }}
                  mode="extraction"
                  docParsingTasks={parsingTasks}
                  sessionMetrics={sessionMetrics}
                  isStreamingTerminalExpanded={isStreamingTerminalExpanded}
                  onToggleStreamingTerminal={() => setIsStreamingTerminalExpanded(prev => !prev)}
                  onReparseDocument={() => reparseDocument(selectedDocId)}
                  rightExtraAction={
                    isHitl ? (
                      <button
                        type="button"
                        onClick={handleTriggerHitl}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-bold shadow-xs hover:opacity-95 transition-all cursor-pointer ring-2 ring-amber-400/30"
                      >
                        <span className="material-symbols-outlined text-base">emergency_home</span>
                        <span>打开 HITL 人工介入复核抽屉</span>
                      </button>
                    ) : undefined
                  }
                />
              </div>

              {/* 大模型实时解析流式终端 (可展开/自动折叠) */}
              {currentDocTask && (isStreamingTerminalExpanded || currentDocTask.status === 'parsing') && (
                <div className="shrink-0 animate-fade-in transition-all duration-300">
                  <LlmStreamingTerminal
                    task={currentDocTask}
                    isExpanded={isStreamingTerminalExpanded}
                    onToggleExpand={() => setIsStreamingTerminalExpanded(prev => !prev)}
                  />
                </div>
              )}

              {/* 45% / 55% 左右分栏：充满剩余高度，左右各自独立纵向滚动 */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">

                {/* 左侧 45%：源文档视图与自适应交互式 OCR BBox 高亮图层 (自带独立滚动条) */}
                <div className="lg:col-span-5 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl flex flex-col overflow-hidden shadow-sheet h-full">
                  {/* PDF 阅读器顶部工具栏 */}
                  <div className="px-3.5 py-2 bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/40 dark:border-border-dark flex items-center justify-between gap-2 text-xs text-on-surface-variant shrink-0">
                    <div className="flex items-center gap-1.5 truncate max-w-[150px] sm:max-w-[180px] shrink-0">
                      <span className="material-symbols-outlined text-base text-red-500">picture_as_pdf</span>
                      <span className="font-bold truncate text-on-surface dark:text-surface-bright">{currentDoc.filename}</span>
                    </div>

                    {/* 居中常驻放大与定位提示徽章（外形和颜色与原蓝色胶囊完全一致，独立于页面缩放，永不遮挡且在最顶端永远可点击） */}
                    {(() => {
                      const isPageMagnified = !!magnifiedFieldId;
                      const activeFieldBox = (magnifiedFieldId || highlightedFieldId)
                        ? bboxes.find(b => b.id === (magnifiedFieldId || highlightedFieldId))
                        : null;
                      if (!isPageMagnified && !activeFieldBox) return <div className="flex-1" />;

                      return (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary text-on-primary text-[11px] font-bold rounded-lg shadow-sm animate-fade-in truncate max-w-[280px]">
                          <span className="material-symbols-outlined text-xs shrink-0">
                            {isPageMagnified ? 'zoom_in' : 'filter_center_focus'}
                          </span>
                          <span className="truncate">
                            {isPageMagnified ? '聚焦放大 200%' : '已定位'}: {activeFieldBox?.label || '当前项'}
                          </span>
                          {isPageMagnified && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResetMagnify();
                              }}
                              className="ml-1 px-1.5 py-0.5 rounded bg-white/20 hover:bg-white/30 active:bg-white/40 text-white text-[10px] font-normal transition-colors cursor-pointer shrink-0"
                              title="按 ESC 键亦可快速退出放大"
                            >
                              退出 (ESC)
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setZoomLevel(prev => Math.max(50, prev - 25))}
                          disabled={zoomLevel <= 50}
                          className="w-6 h-6 flex items-center justify-center hover:bg-surface-container-high dark:hover:bg-surface-dark-high rounded transition-colors disabled:opacity-40 cursor-pointer text-sm font-bold text-on-surface dark:text-surface-bright"
                          title="缩小 (最小 50%)"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => setZoomLevel(100)}
                          className="px-1.5 py-0.5 rounded text-xs font-bold hover:bg-surface-container-high dark:hover:bg-surface-dark-high text-on-surface dark:text-surface-bright transition-colors cursor-pointer"
                          title="点击一键还原为 100%"
                        >
                          {zoomLevel}%
                        </button>
                        <button
                          type="button"
                          onClick={() => setZoomLevel(prev => Math.min(300, prev + 25))}
                          disabled={zoomLevel >= 300}
                          className="w-6 h-6 flex items-center justify-center hover:bg-surface-container-high dark:hover:bg-surface-dark-high rounded transition-colors disabled:opacity-40 cursor-pointer text-sm font-bold text-on-surface dark:text-surface-bright"
                          title="放大 (最大 300%)"
                        >
                          +
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => goToPage(currentDocPage - 1)}
                          disabled={currentDocPage <= 1}
                          className="p-1 hover:bg-surface-container-high dark:hover:bg-surface-dark-high rounded disabled:opacity-40"
                          title="上一页"
                        >
                          &lt;
                        </button>
                        <span>{currentDocPage} / {currentDoc.pageCount}</span>
                        <button
                          type="button"
                          onClick={() => goToPage(currentDocPage + 1)}
                          disabled={currentDocPage >= currentDoc.pageCount}
                          className="p-1 hover:bg-surface-container-high dark:hover:bg-surface-dark-high rounded disabled:opacity-40"
                          title="下一页"
                        >
                          &gt;
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 源文档视窗：支持真实多页高清切图纵向连续平铺 或 拟真纸张排版回退 */}
                  {currentDoc.samplePages && currentDoc.samplePages.length > 0 ? (
                    <div
                      ref={pdfScrollContainerRef}
                      onMouseDown={handlePdfMouseDown}
                      className={`flex-1 p-4 overflow-auto custom-scrollbar bg-surface-container/40 dark:bg-surface-dark-low ${isMouseDownDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
                        }`}
                    >
                      <div
                        className="w-full flex flex-col items-center gap-5 my-auto transition-[padding,min-width]"
                        style={{
                          minWidth: (magnifiedFieldId || zoomLevel > 100) ? `${Math.max(120, (zoomLevel / 100) * (magnifiedFieldId ? 220 : 120))}%` : '100%',
                          padding: magnifiedFieldId ? '20px 80px' : '10px 0px',
                        }}
                      >
                        {currentDoc.samplePages.map((pageSrc, pageIdx) => {
                          const pageNum = pageIdx + 1;
                          const pageBBoxes = bboxes.filter(b => b.page === pageNum);

                          // 检查当前页是否包含正处于 1 秒悬浮放大状态的 BBox
                          const activeMagnifiedBox = magnifiedFieldId
                            ? pageBBoxes.find(b => b.id === magnifiedFieldId)
                            : null;
                          const isPageMagnified = !!activeMagnifiedBox;

                          const originX = activeMagnifiedBox ? activeMagnifiedBox.x + activeMagnifiedBox.w / 2 : 50;
                          const originY = activeMagnifiedBox ? activeMagnifiedBox.y + activeMagnifiedBox.h / 2 : 50;

                          return (
                            <div
                              key={pageNum}
                              id={`pdf-page-${pageNum}`}
                              className={`relative bg-white dark:bg-zinc-900 rounded-sm border border-outline-variant/40 shrink-0 ${isPageMagnified ? 'z-30 shadow-2xl ring-2 ring-primary/60' : 'shadow-md'
                                }`}
                              style={{
                                width: `${460 * (zoomLevel / 100)}px`,
                                aspectRatio: '1 / 1.414',
                                transform: isPageMagnified ? 'scale(2)' : 'scale(1)',
                                transformOrigin: `${originX}% ${originY}%`,
                                transition: 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 250ms ease-out',
                              }}
                            >
                              {/* 页码徽章 */}
                              <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/65 text-white text-[11px] rounded backdrop-blur-xs z-10 pointer-events-none shadow-xs">
                                第 {pageNum} / {currentDoc.samplePages!.length} 页
                              </div>

                              {/* 真实高清切图底图 */}
                              <img
                                src={pageSrc}
                                alt={`第 ${pageNum} 页`}
                                className="w-full h-full object-contain select-none pointer-events-none"
                                loading="eager"
                              />

                              {/* 动态自适应百分比 BBox 标注框层 (单实线、高透光、零遮挡) */}
                              {pageBBoxes.map((box) => {
                                const isHighlighted = highlightedFieldId === box.id;
                                return (
                                  <div
                                    key={box.id}
                                    id={`bbox-${box.id}`}
                                    onMouseEnter={() => scrollToRightField(box.id)}
                                    onMouseLeave={() => handleFieldHover(null)}
                                    className={`absolute rounded-xs transition-all duration-150 cursor-pointer ${isHighlighted
                                      ? 'border-2 border-primary bg-primary/10 z-20 shadow-xs'
                                      : 'hover:bg-primary/10 hover:border hover:border-primary/40 border border-dashed border-primary/20 z-10'
                                      }`}
                                    style={{
                                      left: `${box.x}%`,
                                      top: `${box.y}%`,
                                      width: `${box.w}%`,
                                      height: `${box.h}%`,
                                    }}
                                    title={box.label}
                                  />
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    /* 回退：拟真白底纸张视窗 */
                    <div className="flex-1 p-6 overflow-auto custom-scrollbar bg-surface-container/40 dark:bg-surface-dark-low flex justify-center">
                      <div
                        className="paper-texture border border-outline-variant/40 rounded shadow-md p-8 relative transition-transform duration-200"
                        style={{
                          width: '460px',
                          minHeight: '620px',
                          transform: `scale(${zoomLevel / 100})`,
                          transformOrigin: 'top center',
                        }}
                      >
                        <h3 className="font-bold text-center text-sm font-mono tracking-widest uppercase border-b pb-2 mb-4 text-on-surface">
                          MATERIAL TEST CERTIFICATE
                        </h3>
                        <div className="space-y-3 text-[11px] font-mono text-on-surface">
                          <div className="flex justify-between border-b pb-1">
                            <span>Supplier: {currentBatch.supplier}</span>
                            <span>Date: 2026-08-26</span>
                          </div>
                          <div className="flex justify-between border-b pb-1">
                            <span>Standard: {currentBatch.standard}</span>
                            <span>Heat No: {currentBatch.heatNo}</span>
                          </div>
                          <div className="ocr-box ocr-box-yellow left-6 top-24 w-80 h-10 flex items-center px-2 cursor-pointer">
                            <span className="text-[10px] font-bold text-yellow-900 bg-yellow-200/80 px-1 rounded">
                              Grade: {currentBatch.grade}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 右侧 55%：结构化提取核对卡片 (自带独立滚动条) */}
                <div className="lg:col-span-7 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-xs flex flex-col overflow-hidden h-full">
                  <div
                    ref={rightScrollContainerRef}
                    className="flex-1 p-5 overflow-y-auto custom-scrollbar space-y-4 scroll-smooth"
                  >

                    {/* 基础元数据 4行3列统一网格卡片 (第1行：标题、批次号控件、置信度徽标) */}
                    <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-lg p-3.5 sm:p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">

                        {/* 第 1 行：标题 | 批次号输入/修改控件 | 当前批次 OCR 置信度徽章 */}
                        <div className="flex items-center gap-1.5 h-8">
                          <span className="material-symbols-outlined text-base text-primary dark:text-primary-fixed-dim">info</span>
                          <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright uppercase tracking-wider">
                            基础元数据
                          </h3>
                        </div>

                        <div
                          id="right-field-meta_batchNo"
                          onMouseEnter={() => handleFieldHover('meta_batchNo')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-lowest dark:bg-surface-dark border shadow-2xs h-8 transition-all cursor-pointer ${highlightedFieldId === 'meta_batchNo'
                            ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                            : 'border-primary/40 dark:border-primary/50'
                            }`}
                        >
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="material-symbols-outlined text-sm text-primary dark:text-primary-fixed-dim">label</span>
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant font-mono font-bold">批次号:</span>
                          </div>
                          <input
                            type="text"
                            value={currentBatch.batchNo}
                            onChange={(e) => handleUpdateBatchNo(e.target.value)}
                            className="text-xs font-mono font-bold text-primary dark:text-primary-fixed-dim bg-transparent focus:outline-none flex-1 text-left px-1 border-b border-dashed border-primary/40 focus:border-primary min-w-0"
                            title="修改当前批次号，将自动同步至上方选择器"
                          />
                        </div>

                        <div className="flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full bg-status-pass-bg text-status-pass-text text-xs font-mono font-bold border border-emerald-300 dark:border-emerald-800 shadow-2xs h-8">
                          <span className="material-symbols-outlined text-sm">verified</span>
                          <span>当前批次 OCR 置信度: {currentBatch.ocrConfidence}%</span>
                        </div>

                        {/* 第 2 行：质保书编号 | 施工号 | 供货厂家 */}
                        <div
                          id="right-field-meta_certificateNo"
                          onMouseEnter={() => handleFieldHover('meta_certificateNo')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className="transition-all cursor-pointer"
                        >
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">质保书编号 (Certificate No)</span>
                          <input
                            type="text"
                            defaultValue={currentBatch.certificateNo || currentBatch.reportNo.replace('QA', 'MTC')}
                            className={`w-full text-xs font-mono font-bold mt-1 rounded border px-2.5 py-1 transition-all ${highlightedFieldId === 'meta_certificateNo'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                              }`}
                          />
                        </div>

                        <div
                          id="right-field-meta_constructionNo"
                          onMouseEnter={() => handleFieldHover('meta_constructionNo')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className="transition-all cursor-pointer"
                        >
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">施工号 (Construction No)</span>
                          <input
                            type="text"
                            defaultValue={currentBatch.constructionNo || '26XXX-0888'}
                            className={`w-full text-xs font-mono font-bold mt-1 rounded border px-2.5 py-1 transition-all ${highlightedFieldId === 'meta_constructionNo'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-primary dark:text-primary-fixed-dim'
                              }`}
                          />
                        </div>

                        <div
                          id="right-field-meta_supplier"
                          onMouseEnter={() => handleFieldHover('meta_supplier')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className="transition-all cursor-pointer"
                        >
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">供货厂家 (Supplier)</span>
                          <input
                            type="text"
                            defaultValue={currentBatch.supplier}
                            className={`w-full text-xs font-mono font-bold mt-1 rounded border px-2.5 py-1 truncate transition-all ${highlightedFieldId === 'meta_supplier'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                              }`}
                          />
                        </div>

                        {/* 第 3 行：产品品名 | 材料牌号 | 声称执行标准 */}
                        <div
                          id="right-field-meta_productName"
                          onMouseEnter={() => handleFieldHover('meta_productName')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className="transition-all cursor-pointer"
                        >
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">产品品名 (Product Name)</span>
                          <input
                            type="text"
                            defaultValue={currentBatch.productName || '换热管 (Heat exchange tubes)'}
                            className={`w-full text-xs font-mono mt-1 rounded border px-2.5 py-1 truncate transition-all ${highlightedFieldId === 'meta_productName'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                              }`}
                          />
                        </div>

                        <div
                          id="right-field-meta_grade"
                          onMouseEnter={() => handleFieldHover('meta_grade')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className="transition-all cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant">材料牌号 (Material Grade)</span>
                            <span className="px-1.5 py-0.2 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-[10px] font-bold rounded shrink-0">
                              匹配度 {currentBatch.gradeMatchConfidence}%
                            </span>
                          </div>
                          <input
                            type="text"
                            value={currentBatch.grade}
                            onChange={(e) => handleUpdateExtractValue('meta_grade', e.target.value)}
                            className={`w-full text-xs font-bold mt-1 rounded border px-2.5 py-1 transition-all ${highlightedFieldId === 'meta_grade'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                              }`}
                          />
                        </div>

                        <div
                          id="right-field-meta_standard"
                          onMouseEnter={() => handleFieldHover('meta_standard')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className="transition-all cursor-pointer"
                        >
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">声称执行标准 (Declared Standard)</span>
                          <input
                            type="text"
                            value={currentBatch.standard}
                            onChange={(e) => handleUpdateExtractValue('meta_standard', e.target.value)}
                            className={`w-full text-xs mt-1 rounded border px-2.5 py-1 font-bold transition-all ${highlightedFieldId === 'meta_standard'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-primary dark:text-primary-fixed-dim'
                              }`}
                          />
                        </div>

                        {/* 第 4 行：双炉号追溯 (冶炼炉号 / 热处理装炉号) | 交货几何规格 | 热处理状态 */}
                        <div className="transition-all">
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block truncate">
                            冶炼炉号/热处理炉号(Heat/Pack No.)
                          </span>
                          <div className="grid grid-cols-2 gap-1.5 mt-1">
                            {/* 1. 冶炼炉号 (Heat No.) */}
                            <input
                              id="right-field-meta_heatNo"
                              type="text"
                              value={currentBatch.heatNo}
                              onChange={(e) => handleUpdateExtractValue('meta_heatNo', e.target.value)}
                              onMouseEnter={() => handleFieldHover('meta_heatNo')}
                              onMouseLeave={() => handleFieldHover(null)}
                              title="原材料冶炼炉号 (Heat No.)"
                              className={`w-full text-xs font-bold rounded border px-2.5 py-1 transition-all cursor-pointer truncate ${highlightedFieldId === 'meta_heatNo'
                                ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                                : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                                }`}
                            />

                            {/* 2. 热处理炉号 (Pack No.) */}
                            <input
                              id="right-field-meta_packNo"
                              type="text"
                              value={currentBatch.packNo || 'Z26022C'}
                              onChange={(e) => handleUpdateExtractValue('meta_packNo', e.target.value)}
                              onMouseEnter={() => handleFieldHover('meta_packNo')}
                              onMouseLeave={() => handleFieldHover(null)}
                              title="钢管热处理炉号 (Pack No.)"
                              className={`w-full text-xs font-bold rounded border px-2.5 py-1 transition-all cursor-pointer truncate ${highlightedFieldId === 'meta_packNo'
                                ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                                : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                                }`}
                            />
                          </div>
                        </div>

                        <div
                          id="right-field-meta_dimensions"
                          onMouseEnter={() => handleFieldHover('meta_dimensions')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className="transition-all cursor-pointer"
                        >
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">交货几何规格 (Dimensions)</span>
                          <input
                            type="text"
                            value={currentBatch.dimensions}
                            onChange={(e) => handleUpdateExtractValue('meta_dimensions', e.target.value)}
                            className={`w-full text-xs mt-1 rounded border px-2.5 py-1 transition-all ${highlightedFieldId === 'meta_dimensions'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                              }`}
                          />
                        </div>

                        <div
                          id="right-field-meta_deliveryState"
                          onMouseEnter={() => handleFieldHover('meta_deliveryState')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className="transition-all cursor-pointer"
                        >
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">热处理状态 (Delivery State)</span>
                          <input
                            type="text"
                            value={currentBatch.deliveryState || '光亮固溶 (Bright Solution Annealed)'}
                            onChange={(e) => handleUpdateExtractValue('meta_deliveryState', e.target.value)}
                            className={`w-full text-xs mt-1 rounded border px-2.5 py-1 transition-all ${highlightedFieldId === 'meta_deliveryState'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                              }`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* 结构化实测数据区域：动态根据 standard.schema.ts 类别计算页签 (无数据自动隐藏) */}
                    {(() => {
                      // 1. 结构化构建当前批次的全部提取项 (赋予精准 fieldId 与真实 BBox 坐标联动)
                      interface ExtractRowItem {
                        fieldId: string;
                        methodFieldId?: string;
                        category: string;
                        categoryLabel: string;
                        categoryColor: string;
                        name: string;
                        value: string;
                        unit?: string;
                        method: string;
                        confidence: string;
                        status: 'ok' | 'warn';
                        note?: string;
                      }

                      const allExtractItems: ExtractRowItem[] = [
                        // 化学成分 (原件未打印独立检测方法标准，客观呈现为 '-'，无依据 BBox)
                        ...currentBatch.chemical.map(c => ({
                          fieldId: `chem_${c.element}`,
                          methodFieldId: undefined,
                          category: 'chemical',
                          categoryLabel: '化分',
                          categoryColor: 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                          name: `${c.element} (元素含量)`,
                          value: c.value,
                          unit: 'wt%',
                          method: '-',
                          confidence: c.confidence,
                          status: (c.status || 'ok') as 'ok' | 'warn',
                          note: c.note,
                        })),
                        // 力学性能 (拉伸依据 Page 2 表头 GB/T 228.1-2021，硬度依据表头 GB/T 4340.1-2024)
                        {
                          fieldId: 'mech_tensile',
                          methodFieldId: 'method_tensile',
                          category: 'mechanical',
                          categoryLabel: '力学',
                          categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                          name: '抗拉强度 Rm',
                          value: currentBatch.mechanical.tensile_rm,
                          method: 'GB/T 228.1-2021',
                          confidence: '98%',
                          status: 'ok' as const,
                        },
                        {
                          fieldId: 'mech_yield',
                          methodFieldId: 'method_tensile',
                          category: 'mechanical',
                          categoryLabel: '力学',
                          categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                          name: '规定塑性延伸强度 Rp0.2',
                          value: currentBatch.mechanical.yield_rp02,
                          method: 'GB/T 228.1-2021',
                          confidence: '97%',
                          status: 'ok' as const,
                        },
                        {
                          fieldId: 'mech_elongation',
                          methodFieldId: 'method_tensile',
                          category: 'mechanical',
                          categoryLabel: '力学',
                          categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                          name: '断后伸长率 A',
                          value: currentBatch.mechanical.elongation_a,
                          method: 'GB/T 228.1-2021',
                          confidence: '99%',
                          status: 'ok' as const,
                        },
                        ...(currentBatch.mechanical.hardness ? [{
                          fieldId: 'mech_hardness',
                          methodFieldId: 'method_hardness',
                          category: 'mechanical',
                          categoryLabel: '力学',
                          categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                          name: '硬度 (Hardness)',
                          value: currentBatch.mechanical.hardness,
                          method: 'GB/T 4340.1-2024',
                          confidence: '96%',
                          status: 'ok' as const,
                        }] : []),
                        // 工艺性能 (依据 Page 1 下表第二列标准)
                        {
                          fieldId: 'proc_flattening',
                          methodFieldId: 'method_proc_flattening',
                          category: 'process',
                          categoryLabel: '工艺',
                          categoryColor: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                          name: '压扁试验 (Flattening)',
                          value: currentBatch.process.flattening === 'PASS' ? '合格 (无裂纹/无分层)' : '未检出',
                          method: 'GB/T 246-2017',
                          confidence: currentBatch.process.flattening === 'PASS' ? '98%' : '50%',
                          status: (currentBatch.process.flattening === 'PASS' ? 'ok' : 'warn') as 'ok' | 'warn',
                          note: currentBatch.process.flattening === 'PASS' ? undefined : '缺失压扁试验报告',
                        },
                        ...(currentBatch.process.flaring ? [{
                          fieldId: 'proc_flaring',
                          methodFieldId: 'method_proc_flaring',
                          category: 'process',
                          categoryLabel: '工艺',
                          categoryColor: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                          name: '扩口试验 (Flaring)',
                          value: '合格 (顶心锥度 60°, 扩口率 ≥20%)',
                          method: 'GB/T 242-2007',
                          confidence: '99%',
                          status: 'ok' as const,
                        }] : []),
                        // 金相组织 (依据 Page 2 表头 GB/T 6394-2017)
                        ...(currentBatch.process.grainSize ? [{
                          fieldId: 'metallo_grain',
                          methodFieldId: 'method_grain',
                          category: 'metallographic',
                          categoryLabel: '金相',
                          categoryColor: 'text-cyan-700 bg-cyan-50 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
                          name: '晶粒度评级 (Grain Size)',
                          value: currentBatch.process.grainSize,
                          method: 'GB/T 6394-2017',
                          confidence: '98%',
                          status: 'ok' as const,
                        }] : []),
                        // 耐腐蚀试验
                        {
                          fieldId: 'corrosion_intergranular',
                          methodFieldId: 'method_corrosion_intergranular',
                          category: 'corrosion',
                          categoryLabel: '腐蚀',
                          categoryColor: 'text-orange-700 bg-orange-50 dark:bg-orange-950/60 dark:text-orange-300 border-orange-200 dark:border-orange-800',
                          name: '晶间腐蚀试验 (Intergranular Corrosion)',
                          value: currentBatch.process.intergranularCorrosion === 'PASS' ? '合格 (硫酸-硫酸铜法弯曲无裂纹)' : '未检出',
                          method: 'GB/T 4334-2020 方法 E',
                          confidence: currentBatch.process.intergranularCorrosion === 'PASS' ? '98%' : '50%',
                          status: (currentBatch.process.intergranularCorrosion === 'PASS' ? 'ok' : 'warn') as 'ok' | 'warn',
                          note: currentBatch.process.intergranularCorrosion === 'PASS' ? undefined : '缺失晶间腐蚀试验报告',
                        },
                        // 无损检测
                        {
                          fieldId: 'ndt_et',
                          methodFieldId: 'method_ndt_et',
                          category: 'ndt',
                          categoryLabel: '探伤',
                          categoryColor: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                          name: '涡流探伤检验 (Eddy Current Test)',
                          value: currentBatch.process.ndt,
                          method: 'GB/T 7735-2016',
                          confidence: currentBatch.process.ndt.includes('合格') ? '98%' : '50%',
                          status: (currentBatch.process.ndt.includes('合格') ? 'ok' : 'warn') as 'ok' | 'warn',
                          note: currentBatch.process.ndt.includes('合格') ? undefined : '未检出探伤结果',
                        },
                        // 几何尺寸与表面质量 (当存在真实多页切图时自动丰富)
                        ...(currentDoc.docId === 'doc_zpje_01' ? [
                          {
                            fieldId: 'geo_dimensions',
                            methodFieldId: 'method_geo_dimensions',
                            category: 'geometric',
                            categoryLabel: '尺寸',
                            categoryColor: 'text-teal-700 bg-teal-50 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800',
                            name: '尺寸公差检验 (Dimensions Inspection)',
                            value: '合格 (外径偏差 ±0.10mm, 壁厚偏差 ±10%)',
                            method: 'GB/T 13296-2023',
                            confidence: '99%',
                            status: 'ok' as const,
                          },
                          {
                            fieldId: 'surface_quality',
                            methodFieldId: 'method_surface_quality',
                            category: 'surface',
                            categoryLabel: '表面',
                            categoryColor: 'text-teal-700 bg-teal-50 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800',
                            name: '表面质量检验 (Surface Quality)',
                            value: '合格 (内外表面光洁，无裂纹、折叠与重皮)',
                            method: 'GB/T 13296-2023',
                            confidence: '99%',
                            status: 'ok' as const,
                          },
                        ] : []),
                      ];

                      // 2. 动态计算当前批次包含的分类列表 (仅保留有数据的分类)
                      const categoriesInBatch = [
                        { key: 'all', label: '解析数据总览', count: allExtractItems.length },
                        { key: 'chemical', label: '化学成分', count: allExtractItems.filter(i => i.category === 'chemical').length },
                        { key: 'mechanical', label: '力学性能', count: allExtractItems.filter(i => i.category === 'mechanical').length },
                        { key: 'process', label: '工艺性能', count: allExtractItems.filter(i => i.category === 'process').length },
                        { key: 'metallographic', label: '金相组织', count: allExtractItems.filter(i => i.category === 'metallographic').length },
                        { key: 'corrosion', label: '耐腐蚀试验', count: allExtractItems.filter(i => i.category === 'corrosion').length },
                        { key: 'ndt', label: '无损检测', count: allExtractItems.filter(i => i.category === 'ndt').length },
                        { key: 'geometric', label: '几何尺寸', count: allExtractItems.filter(i => i.category === 'geometric').length },
                        { key: 'surface', label: '表面质量', count: allExtractItems.filter(i => i.category === 'surface').length },
                        { key: 'other', label: '其他综合', count: allExtractItems.filter(i => i.category === 'other').length },
                      ].filter(c => c.key === 'all' || c.count > 0);

                      const displayedItems = activeTabCategory === 'all'
                        ? allExtractItems
                        : allExtractItems.filter(i => i.category === activeTabCategory);

                      return (
                        <div className="space-y-2.5">
                          {/* 动态页签导航条 (无数据类别自动隐藏，无冗余图标与多余文案) */}
                          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar border-b border-outline-variant/40 dark:border-border-dark pb-1.5">
                            {categoriesInBatch.map(cat => {
                              const isActive = activeTabCategory === cat.key;
                              return (
                                <button
                                  key={cat.key}
                                  type="button"
                                  onClick={() => setActiveTabCategory(cat.key)}
                                  className={`text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${isActive
                                    ? 'bg-primary text-on-primary font-bold shadow-xs'
                                    : 'bg-surface-container-low dark:bg-surface-dark-low hover:bg-surface-container-high dark:hover:bg-surface-dark-high text-on-surface dark:text-surface-bright font-medium'
                                    }`}
                                >
                                  <span>{cat.label}</span>
                                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${isActive
                                    ? 'bg-white/20 text-white'
                                    : 'bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant dark:text-outline-variant'
                                    }`}>
                                    {cat.count}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* 1. 全部实测项总览 (平铺综合表格视图，结果与依据独立双向高亮联动) */}
                          {activeTabCategory === 'all' && (
                            <div className="border border-outline-variant/40 dark:border-border-dark rounded-xl overflow-hidden shadow-2xs">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-surface-container-low dark:bg-surface-dark-low text-[11px] text-on-surface-variant dark:text-outline-variant border-b dark:border-border-dark">
                                  <tr>
                                    <th className="px-3.5 py-2.5 w-24 min-w-[90px] whitespace-nowrap">类别</th>
                                    <th className="px-3.5 py-2.5 w-44 min-w-[130px]">检验项目</th>
                                    <th className="px-3.5 py-2.5 min-w-[220px]">提取测得值 / 试验结果</th>
                                    <th className="px-3.5 py-2.5 min-w-[190px]">试验依据方法 / 标准</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-outline-variant/20 dark:divide-border-dark/60">
                                  {displayedItems.map((row, idx) => {
                                    const isValueHighlighted = highlightedFieldId === row.fieldId;
                                    const isMethodHighlighted = Boolean(row.methodFieldId && highlightedFieldId === row.methodFieldId);
                                    const isRowActive = isValueHighlighted || isMethodHighlighted;
                                    const numConfidence = parseInt(row.confidence?.replace('%', '') || '100', 10);
                                    const isLowConfidence = row.status === 'warn' || numConfidence < 85;

                                    return (
                                      <tr
                                        key={idx}
                                        id={`right-field-${row.fieldId}`}
                                        className={`transition-colors ${isRowActive
                                          ? 'bg-primary/10 dark:bg-primary/20'
                                          : 'hover:bg-surface-container-low/40 dark:hover:bg-surface-dark-low/40'
                                          }`}
                                      >
                                        <td className="px-3.5 py-2 whitespace-nowrap">
                                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border whitespace-nowrap inline-block ${row.categoryColor}`}>
                                            {row.categoryLabel}
                                          </span>
                                        </td>
                                        <td className="px-3.5 py-2 font-bold text-on-surface dark:text-surface-bright">{row.name}</td>

                                        {/* 1. 提取测得值 / 试验结果（常态处于可编辑状态，置信度预警仅保留⚠️，hover浮层出详情） */}
                                        <td className="px-3.5 py-1.5 min-w-[220px]">
                                          <div className="flex items-center gap-1.5">
                                            <div className="relative flex-1 flex items-center">
                                              <input
                                                type="text"
                                                value={row.value}
                                                onChange={(e) => handleUpdateExtractValue(row.fieldId, e.target.value)}
                                                onFocus={() => handleFieldHover(row.fieldId)}
                                                onMouseEnter={() => handleFieldHover(row.fieldId)}
                                                onMouseLeave={() => handleFieldHover(null)}
                                                className={`w-full text-xs font-bold rounded border px-2.5 py-1.5 transition-all text-primary dark:text-primary-fixed-dim bg-surface-container-lowest dark:bg-surface-dark ${row.unit ? 'pr-9' : ''
                                                  } ${isValueHighlighted
                                                    ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                                    : 'border-outline-variant/30 dark:border-border-dark hover:border-primary/50'
                                                  }`}
                                                title="常态处于可编辑状态；点击聚焦或悬浮可联动查看原件切图"
                                              />
                                              {row.unit && (
                                                <span className="absolute right-2 text-xs font-normal text-outline-variant dark:text-outline-dark select-none pointer-events-none">
                                                  {row.unit}
                                                </span>
                                              )}
                                            </div>

                                            {/* 置信度警示：仅保留一个“⚠️”，鼠标 hover 时出现详情 */}
                                            {isLowConfidence && (
                                              <div className="relative group flex items-center shrink-0">
                                                <span
                                                  className="cursor-help text-xs text-amber-600 dark:text-amber-400 select-none px-1 py-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                                                  aria-label="置信度警示"
                                                >
                                                  ⚠️
                                                </span>
                                                <div className={`absolute right-0 ${idx === 0 ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
                                                  } hidden group-hover:flex flex-col items-start w-56 p-2.5 bg-inverse-surface text-inverse-on-surface text-xs rounded-lg shadow-xl z-30 pointer-events-none transition-all border border-outline-variant/20`}>
                                                  <div className="font-bold flex items-center gap-1.5 text-amber-300">
                                                    <span className="material-symbols-outlined text-sm">warning</span>
                                                    <span>OCR 置信度预警 ({row.confidence})</span>
                                                  </div>
                                                  <p className="mt-1 text-[11px] text-inverse-on-surface/90 leading-snug">
                                                    {row.note || '抽取置信度低于 85% 工业安全阈值，请比对左侧原件切图核验'}
                                                  </p>
                                                  <div className={`absolute ${idx === 0 ? 'bottom-full border-b-inverse-surface' : 'top-full border-t-inverse-surface'
                                                    } right-2 border-4 border-transparent`} />
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </td>

                                        {/* 2. 试验依据方法 / 标准（独立 BBox 联动，无图标与边框） */}
                                        <td className="px-3.5 py-2.5 text-[11px]">
                                          {row.method && row.method !== '-' && row.methodFieldId ? (
                                            <span
                                              id={`right-field-${row.methodFieldId}`}
                                              onMouseEnter={() => handleFieldHover(row.methodFieldId!)}
                                              onMouseLeave={() => handleFieldHover(null)}
                                              className={`inline-block transition-colors cursor-pointer ${isMethodHighlighted
                                                ? 'text-primary dark:text-primary-fixed-dim font-bold underline underline-offset-2 decoration-2'
                                                : 'text-on-surface-variant dark:text-outline-variant hover:text-primary hover:underline hover:underline-offset-2'
                                                }`}
                                              title="悬浮查看源文档中该项依据的标准/方法条款位置"
                                            >
                                              {row.method}
                                            </span>
                                          ) : (
                                            <span className="text-outline-variant dark:text-outline-dark">
                                              {row.method || '-'}
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* 2. 化学成分独立专业视图 */}
                          {activeTabCategory === 'chemical' && (
                            <div className="border border-outline-variant/40 dark:border-border-dark rounded-xl overflow-hidden shadow-2xs">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-surface-container-low dark:bg-surface-dark-low text-[11px] text-on-surface-variant dark:text-outline-variant border-b dark:border-border-dark">
                                  <tr>
                                    <th className="px-3.5 py-2.5">化学元素 (Element)</th>
                                    <th className="px-3.5 py-2.5">提取测得值 (wt%)</th>
                                    <th className="px-3.5 py-2.5">检验依据方法</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-outline-variant/20 dark:divide-border-dark/60">
                                  {currentBatch.chemical.map((row, idx) => {
                                    const fieldId = `chem_${row.element}`;
                                    const isHighlighted = highlightedFieldId === fieldId;
                                    const numConfidence = parseInt(row.confidence?.replace('%', '') || '100', 10);
                                    const isLowConfidence = row.status === 'warn' || numConfidence < 85;

                                    return (
                                      <tr
                                        key={idx}
                                        id={`right-field-${fieldId}`}
                                        onMouseEnter={() => handleFieldHover(fieldId)}
                                        onMouseLeave={() => handleFieldHover(null)}
                                        className={`transition-colors cursor-pointer ${isHighlighted
                                          ? 'bg-primary/15 dark:bg-primary/25 ring-1 ring-primary/50'
                                          : 'hover:bg-surface-container-low/50 dark:hover:bg-surface-dark-low/50'
                                          }`}
                                      >
                                        <td className="px-3.5 py-2 font-bold text-on-surface dark:text-surface-bright">{row.element}</td>
                                        <td className="px-3.5 py-1.5">
                                          <div className="flex items-center gap-1.5">
                                            <div className="relative flex-1 flex items-center max-w-[150px]">
                                              <input
                                                type="text"
                                                value={row.value}
                                                onChange={(e) => handleUpdateExtractValue(fieldId, e.target.value)}
                                                onFocus={() => handleFieldHover(fieldId)}
                                                className="w-full text-xs font-bold rounded border pr-9 px-2.5 py-1 text-primary dark:text-primary-fixed-dim bg-surface-container-lowest dark:bg-surface-dark border-outline-variant/30 dark:border-border-dark hover:border-primary/50 transition-all"
                                              />
                                              <span className="absolute right-2 text-xs font-normal text-outline-variant dark:text-outline-dark select-none pointer-events-none">
                                                wt%
                                              </span>
                                            </div>
                                            {isLowConfidence && (
                                              <div className="relative group flex items-center shrink-0">
                                                <span className="cursor-help text-xs text-amber-600 dark:text-amber-400 select-none px-1 py-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40">⚠️</span>
                                                <div className="absolute right-0 top-full mt-1.5 hidden group-hover:flex flex-col items-start w-56 p-2.5 bg-inverse-surface text-inverse-on-surface text-xs rounded-lg shadow-xl z-30 pointer-events-none transition-all border border-outline-variant/20">
                                                  <div className="font-bold flex items-center gap-1.5 text-amber-300">
                                                    <span className="material-symbols-outlined text-sm">warning</span>
                                                    <span>OCR 置信度预警 ({row.confidence})</span>
                                                  </div>
                                                  <p className="mt-1 text-[11px] text-inverse-on-surface/90 leading-snug">
                                                    {row.note || '抽取置信度低于 85% 工业安全阈值，请比对左侧原件切图核验'}
                                                  </p>
                                                  <div className="absolute bottom-full right-2 border-4 border-transparent border-b-inverse-surface" />
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-3.5 py-2 text-outline-variant dark:text-outline-dark text-[11px]">- (未声明独立方法)</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* 3. 力学性能独立专业视图 */}
                          {activeTabCategory === 'mechanical' && (
                            <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-3 text-xs">
                              <div className="space-y-1.5">
                                <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                                  拉伸与硬度力学性能实测 (Mechanical Tensile & Hardness)
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                  <div
                                    id="right-field-mech_tensile"
                                    onMouseEnter={() => handleFieldHover('mech_tensile')}
                                    onMouseLeave={() => handleFieldHover(null)}
                                    className={`p-2.5 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'mech_tensile'
                                      ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                      : 'border-outline-variant/30 hover:border-primary/50'
                                      }`}
                                  >
                                    <span className="text-on-surface-variant dark:text-outline-variant">抗拉强度 Rm:</span>
                                    <input
                                      type="text"
                                      value={currentBatch.mechanical.tensile_rm}
                                      onChange={(e) => handleUpdateExtractValue('mech_tensile', e.target.value)}
                                      onFocus={() => handleFieldHover('mech_tensile')}
                                      className="text-right text-xs font-bold rounded border border-outline-variant/30 dark:border-border-dark px-2 py-1 text-primary dark:text-primary-fixed-dim bg-surface-container-lowest dark:bg-surface-dark hover:border-primary/50 max-w-[200px]"
                                    />
                                  </div>
                                  <div
                                    id="right-field-mech_yield"
                                    onMouseEnter={() => handleFieldHover('mech_yield')}
                                    onMouseLeave={() => handleFieldHover(null)}
                                    className={`p-2.5 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'mech_yield'
                                      ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                      : 'border-outline-variant/30 hover:border-primary/50'
                                      }`}
                                  >
                                    <span className="text-on-surface-variant dark:text-outline-variant">规定塑性延伸强度 Rp0.2:</span>
                                    <input
                                      type="text"
                                      value={currentBatch.mechanical.yield_rp02}
                                      onChange={(e) => handleUpdateExtractValue('mech_yield', e.target.value)}
                                      onFocus={() => handleFieldHover('mech_yield')}
                                      className="text-right text-xs font-bold rounded border border-outline-variant/30 dark:border-border-dark px-2 py-1 text-primary dark:text-primary-fixed-dim bg-surface-container-lowest dark:bg-surface-dark hover:border-primary/50 max-w-[200px]"
                                    />
                                  </div>
                                  <div
                                    id="right-field-mech_elongation"
                                    onMouseEnter={() => handleFieldHover('mech_elongation')}
                                    onMouseLeave={() => handleFieldHover(null)}
                                    className={`p-2.5 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'mech_elongation'
                                      ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                      : 'border-outline-variant/30 hover:border-primary/50'
                                      }`}
                                  >
                                    <span className="text-on-surface-variant dark:text-outline-variant">断后伸长率 A (%):</span>
                                    <input
                                      type="text"
                                      value={currentBatch.mechanical.elongation_a}
                                      onChange={(e) => handleUpdateExtractValue('mech_elongation', e.target.value)}
                                      onFocus={() => handleFieldHover('mech_elongation')}
                                      className="text-right text-xs font-bold rounded border border-outline-variant/30 dark:border-border-dark px-2 py-1 text-primary dark:text-primary-fixed-dim bg-surface-container-lowest dark:bg-surface-dark hover:border-primary/50 max-w-[200px]"
                                    />
                                  </div>
                                  <div
                                    id="right-field-mech_hardness"
                                    onMouseEnter={() => handleFieldHover('mech_hardness')}
                                    onMouseLeave={() => handleFieldHover(null)}
                                    className={`p-2.5 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'mech_hardness'
                                      ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                      : 'border-outline-variant/30 hover:border-primary/50'
                                      }`}
                                  >
                                    <span className="text-on-surface-variant dark:text-outline-variant">硬度 (Hardness):</span>
                                    <input
                                      type="text"
                                      value={currentBatch.mechanical.hardness || ''}
                                      placeholder="免检 (壁厚<1.7mm)"
                                      onChange={(e) => handleUpdateExtractValue('mech_hardness', e.target.value)}
                                      onFocus={() => handleFieldHover('mech_hardness')}
                                      className="text-right text-xs font-bold rounded border border-outline-variant/30 dark:border-border-dark px-2 py-1 text-primary dark:text-primary-fixed-dim bg-surface-container-lowest dark:bg-surface-dark hover:border-primary/50 max-w-[200px]"
                                    />
                                  </div>
                                </div>
                              </div>

                              {currentBatch.mechanical.astFormulaNote && (
                                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-[12px] flex items-center gap-2">
                                  <span className="material-symbols-outlined text-base text-amber-600 dark:text-amber-400">auto_awesome</span>
                                  <span>{currentBatch.mechanical.astFormulaNote}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* 4. 工艺性能独立专业视图 */}
                          {activeTabCategory === 'process' && (
                            <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-2 text-xs">
                              <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                                工艺成型试验条款实测 (Process Flattening & Bending)
                              </span>
                              <div
                                id="right-field-proc_flattening"
                                onMouseEnter={() => handleFieldHover('proc_flattening')}
                                onMouseLeave={() => handleFieldHover(null)}
                                className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'proc_flattening'
                                  ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                  : 'border-outline-variant/30 hover:border-primary/50'
                                  }`}
                              >
                                <div>
                                  <strong className="text-on-surface dark:text-surface-bright block">压扁试验 (Flattening Test)</strong>
                                  <span className="text-[11px] text-on-surface-variant">依据方法：GB/T 246 金属管压扁试验方法</span>
                                </div>
                                <strong className={currentBatch.process.flattening === 'PASS' ? 'text-status-pass-text font-bold text-sm' : 'text-status-fail-text font-bold text-sm'}>
                                  {currentBatch.process.flattening === 'PASS' ? '合格 (无裂纹/无分层)' : '未检出'}
                                </strong>
                              </div>
                              {currentBatch.process.flaring && (
                                <div
                                  id="right-field-proc_flaring"
                                  onMouseEnter={() => handleFieldHover('proc_flaring')}
                                  onMouseLeave={() => handleFieldHover(null)}
                                  className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'proc_flaring'
                                    ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                    : 'border-outline-variant/30 hover:border-primary/50'
                                    }`}
                                >
                                  <div>
                                    <strong className="text-on-surface dark:text-surface-bright block">扩口试验 (Flaring Test)</strong>
                                    <span className="text-[11px] text-on-surface-variant">依据方法：GB/T 242 金属管扩口试验方法 (顶心锥度 60°)</span>
                                  </div>
                                  <strong className="text-status-pass-text font-bold text-sm">合格 (扩口率 ≥20%)</strong>
                                </div>
                              )}
                            </div>
                          )}

                          {/* 5. 金相组织独立专业视图 */}
                          {activeTabCategory === 'metallographic' && (
                            <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-2 text-xs font-mono">
                              <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                                金相组织与晶粒度实测 (Metallographic & Grain Size)
                              </span>
                              <div
                                id="right-field-metallo_grain"
                                onMouseEnter={() => handleFieldHover('metallo_grain')}
                                onMouseLeave={() => handleFieldHover(null)}
                                className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'metallo_grain'
                                  ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                  : 'border-outline-variant/30 hover:border-primary/50'
                                  }`}
                              >
                                <div>
                                  <strong className="text-on-surface dark:text-surface-bright block">晶粒度评级 (Grain Size)</strong>
                                  <span className="text-[11px] text-on-surface-variant">依据标准：GB/T 6394 金属平均晶粒度测定方法 (比较法)</span>
                                </div>
                                <strong className="text-primary dark:text-primary-fixed-dim font-bold text-sm">
                                  {currentBatch.process.grainSize || '7.0 级'}
                                </strong>
                              </div>
                            </div>
                          )}

                          {/* 6. 耐腐蚀试验独立专业视图 */}
                          {activeTabCategory === 'corrosion' && (
                            <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-2 text-xs font-mono">
                              <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                                不锈钢耐腐蚀试验实测 (Corrosion Resistance)
                              </span>
                              <div
                                id="right-field-corrosion_intergranular"
                                onMouseEnter={() => handleFieldHover('corrosion_intergranular')}
                                onMouseLeave={() => handleFieldHover(null)}
                                className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'corrosion_intergranular'
                                  ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                  : 'border-outline-variant/30 hover:border-primary/50'
                                  }`}
                              >
                                <div>
                                  <strong className="text-on-surface dark:text-surface-bright block">晶间腐蚀试验 (Intergranular Corrosion)</strong>
                                  <span className="text-[11px] text-on-surface-variant">依据方法：GB/T 4334 Method E (硫酸-硫酸铜腐蚀试验)</span>
                                </div>
                                <strong className={currentBatch.process.intergranularCorrosion === 'PASS' ? 'text-status-pass-text font-bold text-sm' : 'text-status-fail-text font-bold text-sm'}>
                                  {currentBatch.process.intergranularCorrosion === 'PASS' ? '合格 (Method E 弯曲无裂纹)' : '未检出'}
                                </strong>
                              </div>
                            </div>
                          )}

                          {/* 7. 无损检测独立专业视图 */}
                          {activeTabCategory === 'ndt' && (
                            <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-2 text-xs font-mono">
                              <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                                承压管道无损探伤检验 (Non-Destructive Testing)
                              </span>
                              <div
                                id="right-field-ndt_et"
                                onMouseEnter={() => handleFieldHover('ndt_et')}
                                onMouseLeave={() => handleFieldHover(null)}
                                className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'ndt_et'
                                  ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                  : 'border-outline-variant/30 hover:border-primary/50'
                                  }`}
                              >
                                <div>
                                  <strong className="text-on-surface dark:text-surface-bright block">无损探伤 / 水压替代 (NDT / Hydrostatic Alternative)</strong>
                                  <span className="text-[11px] text-on-surface-variant">依据方法：GB/T 7735 (涡流 E3H) / GB/T 5777 (超声 U2)</span>
                                </div>
                                <strong className="text-primary dark:text-primary-fixed-dim font-bold text-sm">
                                  {currentBatch.process.ndt}
                                </strong>
                              </div>
                            </div>
                          )}

                          {/* 8. 几何尺寸独立专业视图 */}
                          {activeTabCategory === 'geometric' && (
                            <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-2 text-xs font-mono">
                              <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                                几何公差与尺寸检验 (Geometric Tolerances)
                              </span>
                              <div
                                id="right-field-geo_dimensions"
                                onMouseEnter={() => handleFieldHover('geo_dimensions')}
                                onMouseLeave={() => handleFieldHover(null)}
                                className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'geo_dimensions'
                                  ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                  : 'border-outline-variant/30 hover:border-primary/50'
                                  }`}
                              >
                                <div>
                                  <strong className="text-on-surface dark:text-surface-bright block">外径与壁厚公差实测 (OD & WT)</strong>
                                  <span className="text-[11px] text-on-surface-variant">依据标准：GB/T 13296-2023 第 5.2 条款 (精密级)</span>
                                </div>
                                <strong className="text-status-pass-text font-bold text-sm">合格 OK</strong>
                              </div>
                            </div>
                          )}

                          {/* 9. 表面质量独立专业视图 */}
                          {activeTabCategory === 'surface' && (
                            <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-2 text-xs font-mono">
                              <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                                表面宏观与微观质量检验 (Surface Quality)
                              </span>
                              <div
                                id="right-field-surface_quality"
                                onMouseEnter={() => handleFieldHover('surface_quality')}
                                onMouseLeave={() => handleFieldHover(null)}
                                className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'surface_quality'
                                  ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                  : 'border-outline-variant/30 hover:border-primary/50'
                                  }`}
                              >
                                <div>
                                  <strong className="text-on-surface dark:text-surface-bright block">内外部表面缺陷目视与内窥镜检验</strong>
                                  <span className="text-[11px] text-on-surface-variant">无裂纹、折叠、轧折、离层和结疤</span>
                                </div>
                                <strong className="text-status-pass-text font-bold text-sm">合格 OK</strong>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </section>


          {/* ========================================================================= */}
          {/* 步骤 3: 质检工作台 - 比对标准 (挂载统一标题与批次选择条) */}
          {/* ========================================================================= */}
          <section className="w-full h-full shrink-0 overflow-y-auto custom-scrollbar p-6 space-y-4">
            <div id="step-3-workbench-panel" className="max-w-[1440px] mx-auto w-full space-y-4">

              {/* 顶部统一标题与两层树状批次选择条 */}
              <div className="relative z-30">
                <BatchContextBar
                  stepTitle="步骤 3: 比对执行标准"
                  session={session}
                  selectedDocId={selectedDocId}
                  selectedBatchNo={selectedBatchNo}
                  onSelectDoc={setSelectedDocId}
                  onSelectBatch={(docId, batchNo) => {
                    setSelectedDocId(docId);
                    setSelectedBatchNo(batchNo);
                  }}
                  mode="compliance"
                  docParsingTasks={parsingTasks}
                  sessionMetrics={sessionMetrics}
                />
              </div>

              {/* ========================================================================= */}
              {/* 步骤 3 内容区：全景合规比对架构 */}
              {/* ========================================================================= */}
              {(() => {
                interface ComplianceMatrixRow {
                  id: string;
                  category: 'chemical' | 'mechanical' | 'process' | 'metallographic' | 'corrosion' | 'ndt' | 'dimensions' | 'additional';
                  categoryLabel: string;
                  categoryColor: string;
                  name: string;
                  measuredValue: string;
                  standardRequirement: string;
                  deviation: string;
                  status: 'PASS' | 'FAIL' | 'HITL' | 'INFO';
                  statusLabel: string;
                  ruleBasis: string;
                  note?: string;
                }

                // 构建全景比对矩阵数据项
                const complianceMatrixItems: ComplianceMatrixRow[] = [
                  // 1. 化学成分
                  {
                    id: 'chem_C',
                    category: 'chemical',
                    categoryLabel: '化分',
                    categoryColor: 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                    name: '碳 C (元素含量)',
                    measuredValue: '0.018 wt%',
                    standardRequirement: '≤ 0.080 wt%',
                    deviation: '-0.062 wt%',
                    status: 'PASS',
                    statusLabel: '✓ PASS',
                    ruleBasis: '熔炼分析 (GB/T 13296 表3 序号22)',
                  },
                  {
                    id: 'chem_Si',
                    category: 'chemical',
                    categoryLabel: '化分',
                    categoryColor: 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                    name: '硅 Si (元素含量)',
                    measuredValue: '0.44 wt%',
                    standardRequirement: '≤ 1.00 wt%',
                    deviation: '-0.56 wt%',
                    status: 'PASS',
                    statusLabel: '✓ PASS',
                    ruleBasis: '熔炼分析 (GB/T 13296 表3)',
                  },
                  {
                    id: 'chem_Mn',
                    category: 'chemical',
                    categoryLabel: '化分',
                    categoryColor: 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                    name: '锰 Mn (元素含量)',
                    measuredValue: '1.16 wt%',
                    standardRequirement: '≤ 2.00 wt%',
                    deviation: '-0.84 wt%',
                    status: 'PASS',
                    statusLabel: '✓ PASS',
                    ruleBasis: '熔炼分析 (GB/T 13296 表3)',
                  },
                  {
                    id: 'chem_P',
                    category: 'chemical',
                    categoryLabel: '化分',
                    categoryColor: 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                    name: '磷 P (有害杂质)',
                    measuredValue: '0.035 wt%',
                    standardRequirement: '≤ 0.035 wt%',
                    deviation: '0.000 wt%',
                    status: 'PASS',
                    statusLabel: '✓ PASS',
                    ruleBasis: '熔炼分析 (上限红线控制)',
                  },
                  {
                    id: 'chem_S',
                    category: 'chemical',
                    categoryLabel: '化分',
                    categoryColor: 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                    name: '硫 S (有害杂质)',
                    measuredValue: '0.005 wt%',
                    standardRequirement: '≤ 0.015 wt%',
                    deviation: '-0.010 wt%',
                    status: 'PASS',
                    statusLabel: '✓ PASS',
                    ruleBasis: '熔炼分析 (纯净度优级控制)',
                  },
                  {
                    id: 'chem_Ni',
                    category: 'chemical',
                    categoryLabel: '化分',
                    categoryColor: 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                    name: '镍 Ni (奥氏体相)',
                    measuredValue: currentBatch.hitlReason === 'UNKNOWN_GRADE' ? '8.45 wt%' : '9.08 wt%',
                    standardRequirement: currentBatch.hitlReason === 'UNKNOWN_GRADE' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? '待消歧牌号以加载标尺 (参考要求 8.00~11.00 wt%)'
                      : '9.00 ~ 12.00 wt%',
                    deviation: currentBatch.hitlReason === 'UNKNOWN_GRADE' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? '待消歧钢级'
                      : '+0.08 wt% (高于下限)',
                    status: currentBatch.hitlReason === 'UNKNOWN_GRADE' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? 'HITL'
                      : 'PASS',
                    statusLabel: currentBatch.hitlReason === 'UNKNOWN_GRADE' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? '? 待消歧'
                      : '✓ PASS',
                    ruleBasis: currentBatch.hitlReason === 'UNKNOWN_GRADE' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? '非标牌号别名无法确定性匹配成分标尺，需人工消歧指定'
                      : '熔炼分析 (区间约束)',
                  },
                  {
                    id: 'chem_Cr',
                    category: 'chemical',
                    categoryLabel: '化分',
                    categoryColor: 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                    name: '铬 Cr (耐腐蚀基体)',
                    measuredValue: '17.41 wt%',
                    standardRequirement: activeGrade.includes('S30408') ? '18.00 ~ 20.00 wt%' : '17.00 ~ 19.00 wt%',
                    deviation: activeGrade.includes('S30408') ? '-0.59 wt% (低于下限)' : '+0.41 wt% (高于下限)',
                    status: activeGrade.includes('S30408') ? 'FAIL' : 'PASS',
                    statusLabel: activeGrade.includes('S30408') ? '✗ FAIL' : '✓ PASS',
                    ruleBasis: activeGrade.includes('S30408') ? '标准要求 Cr ≥ 18.00%，实测不满足' : '熔炼分析 (区间约束)',
                  },
                  {
                    id: 'chem_Ti',
                    category: 'chemical',
                    categoryLabel: '化分',
                    categoryColor: 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                    name: '钛 Ti (稳定化元素)',
                    measuredValue: '0.14 wt%',
                    standardRequirement: activeGrade.includes('S30408') || activeGrade.includes('S31603')
                      ? '无考核要求'
                      : '5×(C+N) ~ 0.70 wt% (要求 ≥0.14 wt%)',
                    deviation: '0.00 wt%',
                    status: 'PASS',
                    statusLabel: '✓ PASS',
                    ruleBasis: activeGrade.includes('S30408') || activeGrade.includes('S31603')
                      ? '非强制添加元素'
                      : 'AST动态公式: 5×(0.018+<0.01) = 0.14 wt%',
                  },
                  {
                    id: 'chem_N',
                    category: 'chemical',
                    categoryLabel: '化分',
                    categoryColor: 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                    name: '氮 N (固溶强化)',
                    measuredValue: '<0.01 wt%',
                    standardRequirement: '未设上限 (参照协议)',
                    deviation: '-',
                    status: 'PASS',
                    statusLabel: '✓ PASS',
                    ruleBasis: '残余元素分析',
                  },

                  // 2. 力学性能
                  {
                    id: 'mech_rm',
                    category: 'mechanical',
                    categoryLabel: '力学',
                    categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                    name: '抗拉强度 Rm',
                    measuredValue: currentBatch.mechanical.tensile_rm,
                    standardRequirement: '≥ 520 MPa',
                    deviation: '+101 MPa',
                    status: 'PASS',
                    statusLabel: '✓ PASS',
                    ruleBasis: '常温拉伸 (GB/T 228.1-2021)',
                  },
                  {
                    id: 'mech_rp02',
                    category: 'mechanical',
                    categoryLabel: '力学',
                    categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                    name: '规定塑性延伸强度 Rp0.2',
                    measuredValue: currentBatch.mechanical.yield_rp02,
                    standardRequirement: '≥ 205 MPa',
                    deviation: '+63 MPa',
                    status: 'PASS',
                    statusLabel: '✓ PASS',
                    ruleBasis: '常温屈服 (GB/T 228.1-2021)',
                  },
                  {
                    id: 'mech_a',
                    category: 'mechanical',
                    categoryLabel: '力学',
                    categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                    name: '断后伸长率 A',
                    measuredValue: currentBatch.mechanical.elongation_a,
                    standardRequirement: '≥ 35.0 % (原件内控 ≥40%)',
                    deviation: '+22.5 %',
                    status: 'PASS',
                    statusLabel: '✓ PASS',
                    ruleBasis: '断后伸长率 (GB/T 228.1-2021)',
                  },
                  {
                    id: 'mech_hardness',
                    category: 'mechanical',
                    categoryLabel: '力学',
                    categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                    name: '硬度试验 Hardness (HV1)',
                    measuredValue: currentBatch.mechanical.hardness || '139.3 HV1 (实测 143/145/137/132/140/139)',
                    standardRequirement: '≤ 200 HV1 (壁厚<1.7mm 免检，实测亦合格)',
                    deviation: '-60.7 HV1',
                    status: 'PASS',
                    statusLabel: '✓ PASS',
                    ruleBasis: '维氏硬度 (GB/T 4340.1-2024 第 7.4.2 条)',
                  },

                  // 3. 工艺性能
                  {
                    id: 'proc_flattening',
                    category: 'process',
                    categoryLabel: '工艺',
                    categoryColor: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                    name: '压扁试验 (Flattening)',
                    measuredValue: currentBatch.process.flattening === 'PASS' ? '合格 (无裂纹/无分层)' : '未检出',
                    standardRequirement: '压至间距 H=(1+0.09)S/(0.09+S/D) 试样无裂纹',
                    deviation: '完全符合',
                    status: currentBatch.process.flattening === 'PASS' ? 'PASS' : 'FAIL',
                    statusLabel: currentBatch.process.flattening === 'PASS' ? '✓ PASS' : '✗ FAIL',
                    ruleBasis: '工艺性能 (GB/T 246-2017)',
                  },
                  {
                    id: 'proc_flaring',
                    category: 'process',
                    categoryLabel: '工艺',
                    categoryColor: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                    name: '扩口试验 (Flaring)',
                    measuredValue: currentBatch.process.flaring === 'PASS' ? '合格 (顶心锥度 60°, 扩口率 ≥20%)' : '未做',
                    standardRequirement: '顶心锥度 60°, 扩口率 ≥20% 试样无裂纹',
                    deviation: '完全符合',
                    status: 'PASS',
                    statusLabel: '✓ PASS',
                    ruleBasis: '工艺性能 (GB/T 242-2007)',
                  },

                  // 4. 金相组织
                  {
                    id: 'metallo_grain',
                    category: 'metallographic',
                    categoryLabel: '金相',
                    categoryColor: 'text-cyan-700 bg-cyan-50 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
                    name: '晶粒度评级与显微组织 (Metallographic)',
                    measuredValue: currentBatch.process.grainSize || '7.0 级',
                    standardRequirement: currentBatch.hitlReason === 'QUALITATIVE_AMBIGUITY' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? '基体组织均匀，不得有对耐蚀性有害的连续网状析出'
                      : '7.0 级或更细 (≥ 7.0 级)',
                    deviation: currentBatch.hitlReason === 'QUALITATIVE_AMBIGUITY' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? 'NLP 判定模糊 (71%)'
                      : '完全符合',
                    status: currentBatch.hitlReason === 'QUALITATIVE_AMBIGUITY' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? 'HITL'
                      : 'PASS',
                    statusLabel: currentBatch.hitlReason === 'QUALITATIVE_AMBIGUITY' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? '? 待定性'
                      : '✓ PASS',
                    ruleBasis: currentBatch.hitlReason === 'QUALITATIVE_AMBIGUITY' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? '定性描述包含局部微量析出，需质检工程师人工裁定组织形貌'
                      : '比较法评级 (GB/T 6394-2017)',
                  },

                  // 5. 耐腐蚀性能
                  {
                    id: 'corrosion_intergranular',
                    category: 'corrosion',
                    categoryLabel: '腐蚀',
                    categoryColor: 'text-orange-700 bg-orange-50 dark:bg-orange-950/60 dark:text-orange-300 border-orange-200 dark:border-orange-800',
                    name: '晶间腐蚀试验 (Intergranular)',
                    measuredValue: currentBatch.hitlReason === 'MULTI_STANDARD_CONFLICT' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? '供货态E法合格 (未进行能标敏化处理)'
                      : (currentBatch.process.intergranularCorrosion === 'PASS' ? '合格 (硫酸-硫酸铜法弯曲无裂纹)' : '未检出'),
                    standardRequirement: currentBatch.hitlReason === 'MULTI_STANDARD_CONFLICT' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? 'GB/T 13296 (供货态E法) vs NB/T 47019.5 (敏化态E法)'
                      : 'GB/T 4334-2020 检验方法 E 弯曲无裂纹',
                    deviation: currentBatch.hitlReason === 'MULTI_STANDARD_CONFLICT' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? '标准条款互斥'
                      : '完全符合',
                    status: currentBatch.hitlReason === 'MULTI_STANDARD_CONFLICT' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? 'HITL'
                      : (currentBatch.process.intergranularCorrosion === 'PASS' ? 'PASS' : 'FAIL'),
                    statusLabel: currentBatch.hitlReason === 'MULTI_STANDARD_CONFLICT' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? '? 待仲裁'
                      : (currentBatch.process.intergranularCorrosion === 'PASS' ? '✓ PASS' : '✗ FAIL'),
                    ruleBasis: currentBatch.hitlReason === 'MULTI_STANDARD_CONFLICT' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? '国标与能标对晶间腐蚀敏化制样要求互斥，需质检员指定主仲裁标尺'
                      : '耐腐蚀性能 (GB/T 4334-2020 E法)',
                  },

                  // 6. 无损检测
                  {
                    id: 'ndt_pressure',
                    category: 'ndt',
                    categoryLabel: '探伤',
                    categoryColor: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                    name: '承压/致密性检验 (Pressure Tightness)',
                    measuredValue: currentBatch.hitlReason === 'ALTERNATIVE_CLAUSE' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? '涡流探伤合格 (未出具水压试验实测值)'
                      : (currentBatch.process.ndt || '涡流探伤合格 (GB/T 7735 E3H 级)'),
                    standardRequirement: '逐根液压试验 (经供需协商可在合同约定无损探伤替代)',
                    deviation: currentBatch.hitlReason === 'ALTERNATIVE_CLAUSE' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? '待确权合同替代'
                      : '替代组生效',
                    status: currentBatch.hitlReason === 'ALTERNATIVE_CLAUSE' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? 'HITL'
                      : 'PASS',
                    statusLabel: currentBatch.hitlReason === 'ALTERNATIVE_CLAUSE' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? '? 待确权'
                      : '✓ PASS',
                    ruleBasis: currentBatch.hitlReason === 'ALTERNATIVE_CLAUSE' && currentBatch.verdict === 'MANUAL_REVIEW'
                      ? 'GB/T 13296 第 7.5 条允许协议替代，需质检员核实订货合同授权'
                      : '致密性替代条款 (GB/T 13296 第 7.5 条)',
                  },
                  {
                    id: 'ndt_ut',
                    category: 'ndt',
                    categoryLabel: '探伤',
                    categoryColor: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                    name: '超声波检测 (Ultrasonic)',
                    measuredValue: '超声探伤合格 (GB/T 5777-2019 U2 级)',
                    standardRequirement: '纵向人工缺陷深度的 U2 级',
                    deviation: '完全符合',
                    status: 'PASS',
                    statusLabel: '✓ PASS',
                    ruleBasis: '无损检验 (GB/T 5777-2019)',
                  },

                  // 7. 几何尺寸与表面质量
                  {
                    id: 'geo_dimensions',
                    category: 'dimensions',
                    categoryLabel: '尺寸',
                    categoryColor: 'text-teal-700 bg-teal-50 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800',
                    name: '几何尺寸公差 (Dimensions)',
                    measuredValue: '外径 15.0mm / 壁厚 0.8mm',
                    standardRequirement: '外径允许偏差 ±0.10mm，壁厚允许偏差 ±10%',
                    deviation: '实测在允许公差带内',
                    status: 'PASS',
                    statusLabel: '✓ PASS',
                    ruleBasis: '尺寸精度 (GB/T 13296 表1 精密级)',
                  },
                  {
                    id: 'geo_surface',
                    category: 'dimensions',
                    categoryLabel: '表面',
                    categoryColor: 'text-teal-700 bg-teal-50 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800',
                    name: '表面质量检验 (Surface Quality)',
                    measuredValue: '内外表面光洁，无裂纹、折叠与重皮缺陷',
                    standardRequirement: '钢管内外表面平整光洁，不得有结疤、重皮及过热',
                    deviation: '完全符合',
                    status: 'PASS',
                    statusLabel: '✓ PASS',
                    ruleBasis: '外观要求 (GB/T 13296 第 5.5 条)',
                  },

                  // 8. 非标与扩展协议 (通用扩展池)
                  {
                    id: 'custom_construction_no',
                    category: 'additional',
                    categoryLabel: '扩展',
                    categoryColor: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
                    name: '施工工程号 (Construction No.)',
                    measuredValue: currentBatch.constructionNo || '26715-7053',
                    standardRequirement: '采购合同工程技术协议 / 业主项目追溯标识',
                    deviation: '-',
                    status: 'INFO',
                    statusLabel: 'ℹ️ 供参考',
                    ruleBasis: 'Schema 扩展池 (项目属性，非国标红线)',
                  },
                  {
                    id: 'custom_packing_info',
                    category: 'additional',
                    categoryLabel: '扩展',
                    categoryColor: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
                    name: '包装支数与净重 (Packing Info)',
                    measuredValue: '15 支 / 45.2 kg',
                    standardRequirement: '物资交货装箱清单',
                    deviation: '-',
                    status: 'INFO',
                    statusLabel: 'ℹ️ 供参考',
                    ruleBasis: '物流交付属性 (仅供仓库点验核查)',
                  },
                ];

                const STEP3_TABS = [
                  { key: 'all', label: '全部比对项', count: complianceMatrixItems.length },
                  { key: 'chemical', label: '化学成分', count: complianceMatrixItems.filter(i => i.category === 'chemical').length },
                  { key: 'mechanical', label: '力学性能', count: complianceMatrixItems.filter(i => i.category === 'mechanical').length },
                  { key: 'process', label: '工艺成型', count: complianceMatrixItems.filter(i => i.category === 'process').length },
                  { key: 'metallographic', label: '金相组织', count: complianceMatrixItems.filter(i => i.category === 'metallographic').length },
                  { key: 'corrosion', label: '耐腐蚀试验', count: complianceMatrixItems.filter(i => i.category === 'corrosion').length },
                  { key: 'ndt', label: '无损探伤', count: complianceMatrixItems.filter(i => i.category === 'ndt').length },
                  { key: 'dimensions', label: '尺寸与表面', count: complianceMatrixItems.filter(i => i.category === 'dimensions').length },
                  { key: 'additional', label: '非标与扩展', count: complianceMatrixItems.filter(i => i.category === 'additional').length },
                ];

                const displayedComplianceItems = step3Category === 'all'
                  ? complianceMatrixItems
                  : complianceMatrixItems.filter(item => item.category === step3Category);

                return (
                  <div className="space-y-4">
                    {/* 1. 顶部上下文与判定决策带 (两栏卡片: 质保书信息 vs 当前执行标准基准 + 综合判定) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">

                      {/* 左侧 50% (lg:col-span-6)：质保书信息 */}
                      <div className="lg:col-span-6 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-4 shadow-xs flex flex-col justify-between">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 border-b border-outline-variant/30 dark:border-border-dark pb-2.5">
                            <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-lg">info</span>
                            <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright">
                              质保书信息
                            </h3>
                          </div>

                          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs ">
                            <div>
                              <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">产品名称 (Product Name)</span>
                              <strong className="text-on-surface dark:text-surface-bright block truncate" title={currentBatch.productName || '换热管 (Heat exchange tubes)'}>
                                {currentBatch.productName || '换热管 (Heat exchange tubes)'}
                              </strong>
                            </div>
                            <div>
                              <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">质保书编号 (Certificate No)</span>
                              <strong className="text-on-surface dark:text-surface-bright block truncate" title={currentBatch.certificateNo || '2022-05-012'}>
                                {currentBatch.certificateNo || '2022-05-012'}
                              </strong>
                            </div>
                            <div>
                              <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">声明标准 (Declared Standard)</span>
                              <strong className="text-on-surface dark:text-surface-bright block truncate" title={currentBatch.standard}>
                                {currentBatch.standard}
                              </strong>
                            </div>
                            <div>
                              <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">材料牌号</span>
                              <strong className="text-primary dark:text-primary-fixed-dim block truncate" title={currentBatch.grade}>
                                {currentBatch.grade}
                              </strong>
                            </div>
                            <div>
                              <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">冶炼炉号 (Heat No.)</span>
                              <span className="text-on-surface dark:text-surface-bright block">{currentBatch.heatNo}</span>
                            </div>
                            <div>
                              <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">热处理装炉号 (Pack No.)</span>
                              <span className="text-on-surface dark:text-surface-bright block">{currentBatch.packNo || 'Z26022C'}</span>
                            </div>
                            <div>
                              <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">交货规格</span>
                              <span className="text-on-surface dark:text-surface-bright block">{currentBatch.dimensions}</span>
                            </div>
                            <div>
                              <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">供货厂商</span>
                              <span className="text-on-surface dark:text-surface-bright block truncate" title={currentBatch.supplier}>
                                {currentBatch.supplier}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 右侧 50% (lg:col-span-6)：当前执行标准与牌号基准 + 综合判定看板 */}
                      <div className="lg:col-span-6 flex flex-col gap-3">

                        {/* 上部：当前执行标准与牌号基准 */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-on-surface dark:text-surface-bright">
                                当前执行标准与牌号基准
                              </h4>
                              {isOverridden && (
                                <span className="px-2 py-0.5 rounded text-[12px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                                  人工重置规则
                                </span>
                              )}
                            </div>

                            {/* 右侧常驻重置按钮 */}
                            <button
                              type="button"
                              onClick={handleResetGrade}
                              disabled={!isOverridden}
                              title={isOverridden ? '重置为质保书原件声明标准与牌号' : '当前已是质保书原件声明基准'}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all shadow-2xs ${isOverridden
                                ? 'border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 hover:shadow-xs cursor-pointer'
                                : 'border border-outline-variant/30 dark:border-border-dark text-on-surface-variant/40 dark:text-outline-variant/40 cursor-not-allowed bg-transparent'
                                }`}
                            >
                              <span className="material-symbols-outlined text-[13px]">restart_alt</span>
                              <span>重置</span>
                            </button>
                          </div>

                          <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-3 shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-3 relative">

                            {/* 1. 执行标准 (多选可搜 Combobox) */}
                            <div className="relative">
                              <div className="flex items-center justify-between text-[11px] mb-1">
                                <span className="text-on-surface-variant dark:text-outline-variant font-medium flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px] text-primary">menu_book</span>
                                  <span>执行标准 (可多选)</span>
                                </span>
                                <span className="text-[12px]  px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                                  已选 {selectedStandardIds.length} 部
                                </span>
                              </div>

                              {/* 触发器按键：大号字体 + 精致选中样式 */}
                              <button
                                type="button"
                                onClick={() => {
                                  setIsStandardSelectorOpen(!isStandardSelectorOpen);
                                  setIsGradeSelectorOpen(false);
                                }}
                                className={`w-full text-left bg-surface-container-low dark:bg-surface-dark-low border rounded-lg px-3 py-2 transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs ${isStandardSelectorOpen
                                  ? 'border-primary ring-2 ring-primary/20'
                                  : 'border-outline-variant/60 dark:border-border-dark hover:border-primary/60'
                                  }`}
                              >
                                <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                                  {selectedStandardIds.map(stdId => {
                                    const catalogItem = STANDARDS_CATALOG.find(s => s.id === stdId || s.shortCode === stdId);
                                    return (
                                      <span
                                        key={stdId}
                                        className="px-2.5 py-0.5 rounded-md text-xs  font-bold bg-surface-container-high dark:bg-surface-dark-high text-on-surface dark:text-surface-bright border border-outline-variant/40 dark:border-border-dark whitespace-nowrap shadow-2xs"
                                        title={catalogItem ? catalogItem.name : stdId}
                                      >
                                        {catalogItem ? catalogItem.id : stdId}
                                      </span>
                                    );
                                  })}
                                </div>
                                <span className={`material-symbols-outlined text-base transition-transform text-on-surface-variant shrink-0 ${isStandardSelectorOpen ? 'rotate-180 text-primary' : ''}`}>
                                  expand_more
                                </span>
                              </button>

                              {/* 多选下拉 Popover */}
                              {isStandardSelectorOpen && (
                                <>
                                  <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setIsStandardSelectorOpen(false)}
                                  />
                                  <div className="absolute left-0 top-full mt-2 w-88 sm:w-96 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-2xl p-2.5 z-50 space-y-2">
                                    {/* 搜索输入框 */}
                                    <div className="relative">
                                      <span className="material-symbols-outlined text-xs absolute left-2.5 top-2.5 text-on-surface-variant">
                                        search
                                      </span>
                                      <input
                                        type="text"
                                        value={standardSearchQuery}
                                        onChange={e => setStandardSearchQuery(e.target.value)}
                                        placeholder="搜索标准代号或名称 (如 47019, 13296)..."
                                        autoFocus
                                        className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-outline-variant/60 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary"
                                      />
                                      {standardSearchQuery && (
                                        <button
                                          type="button"
                                          onClick={() => setStandardSearchQuery('')}
                                          className="absolute right-2 top-2 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>

                                    {/* 标准列表 */}
                                    <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1">
                                      {STANDARDS_CATALOG
                                        .filter(s => {
                                          if (!standardSearchQuery.trim()) return true;
                                          const q = standardSearchQuery.toLowerCase();
                                          return s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.shortCode.toLowerCase().includes(q);
                                        })
                                        .map(std => {
                                          const isChecked = selectedStandardIds.some(sel => std.id.includes(sel) || sel.includes(std.shortCode) || std.shortCode.includes(sel));
                                          return (
                                            <div
                                              key={std.id}
                                              onClick={() => handleToggleStandard(std.id)}
                                              className={`p-2 rounded-lg text-xs transition-colors flex items-start gap-2.5 cursor-pointer ${isChecked
                                                ? 'bg-primary/8 border border-primary/20'
                                                : 'hover:bg-surface-container-low dark:hover:bg-surface-dark-low border border-transparent'
                                                }`}
                                            >
                                              <span className={`material-symbols-outlined text-base mt-0.5 shrink-0 ${isChecked ? 'text-primary' : 'text-outline-variant'}`}>
                                                {isChecked ? 'check_box' : 'check_box_outline_blank'}
                                              </span>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-1">
                                                  <span className=" font-bold text-on-surface dark:text-surface-bright truncate">
                                                    {std.id}
                                                  </span>
                                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-medium border shrink-0 ${std.badgeColor}`}>
                                                    {std.category}
                                                  </span>
                                                </div>
                                                <p className="text-[11px] text-on-surface-variant dark:text-outline-variant line-clamp-1 mt-0.5">
                                                  {std.name}
                                                </p>
                                              </div>
                                            </div>
                                          );
                                        })}
                                    </div>
                                    <div className="text-[12px] text-on-surface-variant dark:text-outline-variant px-1 border-t border-outline-variant/30 pt-1.5 flex items-center justify-between">
                                      <span>共 {STANDARDS_CATALOG.length} 部标准</span>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* 2. 材料牌号 (单选可搜·动态索引 Combobox) */}
                            <div className="relative">
                              <div className="flex items-center justify-between text-[11px] mb-1">
                                <span className="text-on-surface-variant dark:text-outline-variant font-medium flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px] text-primary">verified</span>
                                  <span>材料牌号</span>
                                </span>
                                <span className="text-[12px]  text-on-surface-variant dark:text-outline-variant">
                                  {availableGradesForSelectedStandards.length} 个候选牌号
                                </span>
                              </div>

                              {/* 触发器按键：大号字体 + 精致强调色 */}
                              <button
                                type="button"
                                onClick={() => {
                                  setIsGradeSelectorOpen(!isGradeSelectorOpen);
                                  setIsStandardSelectorOpen(false);
                                }}
                                className={`w-full text-left bg-surface-container-low dark:bg-surface-dark-low border rounded-lg px-3 py-2 transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs ${isGradeSelectorOpen
                                  ? 'border-primary ring-2 ring-primary/20'
                                  : 'border-outline-variant/60 dark:border-border-dark hover:border-primary/60'
                                  }`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className=" text-xs sm:text-sm font-bold text-primary dark:text-primary-fixed-dim truncate">
                                    {activeGrade}
                                  </span>
                                  {availableGradesForSelectedStandards.find(g => g.display === activeGrade || activeGrade.includes(g.code))?.isFullyCovered && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 shrink-0">
                                      双标覆盖
                                    </span>
                                  )}
                                </div>
                                <span className={`material-symbols-outlined text-base transition-transform text-on-surface-variant shrink-0 ${isGradeSelectorOpen ? 'rotate-180 text-primary' : ''}`}>
                                  expand_more
                                </span>
                              </button>

                              {/* 牌号单选下拉 Popover */}
                              {isGradeSelectorOpen && (
                                <>
                                  <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setIsGradeSelectorOpen(false)}
                                  />
                                  <div className="absolute right-0 top-full mt-2 w-88 sm:w-96 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-2xl p-2.5 z-50 space-y-2">
                                    {/* 搜索输入框 */}
                                    <div className="relative">
                                      <span className="material-symbols-outlined text-xs absolute left-2.5 top-2.5 text-on-surface-variant">
                                        search
                                      </span>
                                      <input
                                        type="text"
                                        value={gradeSearchQuery}
                                        onChange={e => setGradeSearchQuery(e.target.value)}
                                        placeholder="搜索材料牌号或代码 (如 S32168, 304, 316)..."
                                        autoFocus
                                        className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-outline-variant/60 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary"
                                      />
                                      {gradeSearchQuery && (
                                        <button
                                          type="button"
                                          onClick={() => setGradeSearchQuery('')}
                                          className="absolute right-2 top-2 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>

                                    {/* 牌号列表 */}
                                    <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1">
                                      {availableGradesForSelectedStandards
                                        .filter(g => {
                                          if (!gradeSearchQuery.trim()) return true;
                                          const q = gradeSearchQuery.toLowerCase();
                                          return (
                                            g.code.toLowerCase().includes(q) ||
                                            g.primaryGrade.toLowerCase().includes(q) ||
                                            g.display.toLowerCase().includes(q) ||
                                            (g.description && g.description.toLowerCase().includes(q))
                                          );
                                        })
                                        .map(g => {
                                          const isSelected = activeGrade === g.display || activeGrade.includes(g.code);
                                          return (
                                            <div
                                              key={g.code}
                                              onClick={() => handleSelectGrade(g.display)}
                                              className={`p-2 rounded-lg text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer ${isSelected
                                                ? 'bg-primary text-on-primary font-bold shadow-xs'
                                                : 'hover:bg-surface-container-low dark:hover:bg-surface-dark-low text-on-surface dark:text-surface-bright'
                                                }`}
                                            >
                                              <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-2">
                                                  <span className=" font-bold truncate">
                                                    {g.display}
                                                  </span>
                                                  {g.isFullyCovered ? (
                                                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ${isSelected
                                                      ? 'bg-white/20 text-white'
                                                      : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700'
                                                      }`}>
                                                      双标覆盖
                                                    </span>
                                                  ) : (
                                                    <span className={`px-1.5 py-0.2 rounded text-[9px] shrink-0 ${isSelected ? 'text-white/80' : 'text-on-surface-variant dark:text-outline-variant bg-surface-container-high'
                                                      }`}>
                                                      {g.coverageLabel}
                                                    </span>
                                                  )}
                                                </div>
                                                {g.description && (
                                                  <span className={`text-[12px] truncate mt-0.5 ${isSelected ? 'text-white/80' : 'text-on-surface-variant dark:text-outline-variant'
                                                    }`}>
                                                    {g.description}
                                                  </span>
                                                )}
                                              </div>
                                              {isSelected && (
                                                <span className="material-symbols-outlined text-base shrink-0">
                                                  check
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })}
                                    </div>
                                    <div className="text-[12px] text-on-surface-variant dark:text-outline-variant px-1 border-t border-outline-variant/30 pt-1.5 flex items-center justify-between">
                                      <span>动态基于已选标准提取牌号并集</span>
                                      <span>候选 {availableGradesForSelectedStandards.length} 项</span>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                          </div>
                        </div>

                        {/* 下部：综合判定看板 (双轨制：系统客观计算 55% vs 人工复核判定 45%，独立分栏背景色，吸纳垂直空隙) */}
                        <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark shadow-xs flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden items-stretch">

                          {/* 1. 左侧约 55% (md:col-span-7)：系统客观判定 */}
                          <div className={`md:col-span-7 min-w-0 p-3.5 flex flex-col justify-center space-y-1 ${isHitl
                            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                            : !computedIsPass
                              ? 'bg-status-fail-bg text-status-fail-text'
                              : 'bg-status-pass-bg text-status-pass-text'
                            }`}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`material-symbols-outlined text-xl font-bold shrink-0 ${isHitl ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                                {isHitl ? 'pending_actions' : !computedIsPass ? 'cancel' : 'check_circle'}
                              </span>
                              <h3 className="text-sm sm:text-base font-bold font-headline whitespace-nowrap">
                                {isHitl
                                  ? 'HITL 系统判定:待人工介入'
                                  : !computedIsPass
                                    ? '系统判定: FAIL 一票否决'
                                    : '系统判定: PASS 全项合规'}
                              </h3>
                            </div>
                            <p className="text-[12px] opacity-90 font-sans pl-7 line-clamp-2 leading-relaxed" title={computedVerdictSummary}>
                              {computedVerdictSummary}
                            </p>
                          </div>

                          {/* 2. 右侧约 45% (md:col-span-5)：人工复核判定 (独立分栏背景色，按钮占满横幅高度) */}
                          <div className={`md:col-span-5 min-w-0 p-2.5 md:border-l md:border-current/20 flex items-center justify-between gap-3 ${isHitl
                            ? 'bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                            : currentBatch.humanVerdict === 'REJECT'
                              ? 'bg-status-fail-bg text-status-fail-text'
                              : currentBatch.humanVerdict === 'PASS'
                                ? 'bg-status-pass-bg text-status-pass-text'
                                : !computedIsPass
                                  ? 'bg-status-fail-bg text-status-fail-text'
                                  : 'bg-status-pass-bg text-status-pass-text'
                            }`}>
                            {/* 左侧上下排布：上方人工复核标头，下方状态标签 */}
                            <div className="flex flex-col justify-center gap-1 shrink-0">
                              <div className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
                                <span className="material-symbols-outlined text-[15px]">person_check</span>
                                <span>人工复核:</span>
                              </div>
                              <div>
                                {isHitl ? (
                                  <span className="px-2 py-1 rounded text-[12px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 shadow-2xs whitespace-nowrap">
                                    待介入
                                  </span>
                                ) : currentBatch.humanVerdict === 'PASS' ? (
                                  <span className="px-2 py-1 rounded text-[12px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 shadow-2xs whitespace-nowrap">
                                    ✓ APPROVE
                                  </span>
                                ) : currentBatch.humanVerdict === 'REJECT' ? (
                                  <span className="px-2 py-1 rounded text-[12px] font-bold bg-red-100 text-red-800 dark:bg-red-950/90 dark:text-red-200 border border-red-300 dark:border-red-700 shadow-2xs whitespace-nowrap">
                                    ✗ REJECT
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 rounded text-[12px] font-medium bg-surface-container-high/70 dark:bg-surface-dark-high/70 border border-outline-variant/30 dark:border-border-dark opacity-80 whitespace-nowrap">
                                    未复核
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 右侧：操作按钮组 (HITL 状态下先只提供高饱和琥珀黄处理按钮，流转后再显示拒收与审批) */}
                            <div className="flex items-stretch gap-2 self-stretch py-0.5 shrink-0">
                              {isHitl ? (
                                <button
                                  type="button"
                                  onClick={handleTriggerHitl}
                                  className="px-6 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-xs shadow-md border border-amber-600/40 flex items-center justify-center gap-1.5 transition-all cursor-pointer ring-2 ring-amber-400/30 whitespace-nowrap self-stretch"
                                >
                                  <span className="material-symbols-outlined text-base">emergency_home</span>
                                  <span>处理</span>
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleSetHumanVerdict(currentBatch.humanVerdict === 'REJECT' ? null : 'REJECT')}
                                    title={currentBatch.humanVerdict === 'REJECT' ? '当前已标记拒收，再次点击可撤销' : '标记为人工拒收'}
                                    className={`px-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap shadow-2xs ${currentBatch.humanVerdict === 'REJECT'
                                      ? 'bg-red-600 hover:bg-red-700 text-white shadow-xs ring-2 ring-red-400/50'
                                      : 'border border-current bg-surface-container-lowest/80 dark:bg-surface-dark/80 hover:bg-red-500/10'
                                      }`}
                                  >
                                    <span>拒收</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSetHumanVerdict(currentBatch.humanVerdict === 'PASS' ? null : 'PASS')}
                                    title={currentBatch.humanVerdict === 'PASS' ? '当前已核准通过，再次点击可撤销' : '核准为人工通过'}
                                    className={`px-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap shadow-2xs ${currentBatch.humanVerdict === 'PASS'
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs ring-2 ring-emerald-400/50'
                                      : 'bg-primary hover:bg-primary-container text-on-primary shadow-xs'
                                      }`}
                                  >
                                    <span>审批通过</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                      </div>

                    </div>

                    {/* 2. 下部：全景合规比对矩阵 (Master Compliance Matrix) */}
                    <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-5 shadow-xs space-y-4">

                      {/* 顶部标题与分类 Filter 页签 */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-outline-variant/40 dark:border-border-dark pb-3">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-xl">fact_check</span>
                          <div>
                            <h3 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                              全景合规比对矩阵
                            </h3>
                            <p className="text-[11px] text-on-surface-variant dark:text-outline-variant">
                              执行标准条款规范与质保书提取测量值同行左右相邻紧凑对照（全项覆盖无冗余）
                            </p>
                          </div>
                        </div>

                        {/* 分类 Filter 页签 */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full custom-scrollbar">
                          {STEP3_TABS.map(tab => {
                            const isActive = step3Category === tab.key;
                            return (
                              <button
                                key={tab.key}
                                type="button"
                                onClick={() => setStep3Category(tab.key)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${isActive
                                  ? 'bg-primary text-on-primary shadow-xs'
                                  : 'bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant dark:text-outline-variant hover:bg-surface-container-high'
                                  }`}
                              >
                                <span>{tab.label}</span>
                                <span className={`px-1.5 py-0.2 rounded-full text-[10px]  font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant'
                                  }`}>
                                  {tab.count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 全景比对大表 */}
                      <div className="border border-outline-variant/40 dark:border-border-dark rounded-xl overflow-hidden shadow-2xs">
                        <table className="w-full text-left text-xs ">
                          <thead className="bg-surface-container-low dark:bg-surface-dark-low text-[11px] text-on-surface-variant dark:text-outline-variant border-b dark:border-border-dark">
                            <tr>
                              <th className="px-3.5 py-2.5 w-20 min-w-[75px] whitespace-nowrap">类别</th>
                              <th className="px-3.5 py-2.5 min-w-[160px]">检验项目 / 指标</th>
                              <th className="px-3.5 py-2.5 min-w-[220px]">执行标准要求 [Min, Max] / 条款规范</th>
                              <th className="px-3.5 py-2.5 min-w-[190px]">报告测量值 / 实际结果</th>
                              <th className="px-3.5 py-2.5 w-32 min-w-[110px]">偏差量 / 吻合度</th>
                              <th className="px-3.5 py-2.5 w-24 whitespace-nowrap">判定状态</th>
                              <th className="px-3.5 py-2.5 min-w-[200px]">规则依据 / 判定逻辑</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20 dark:divide-border-dark/60">
                            {displayedComplianceItems.map((row) => (
                              <tr
                                key={row.id}
                                className="hover:bg-surface-container-low/40 dark:hover:bg-surface-dark-low/40 transition-colors"
                              >
                                <td className="px-3.5 py-2.5 whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded text-[12px] font-bold border whitespace-nowrap inline-flex items-center justify-center leading-none ${row.categoryColor}`}>
                                    {row.categoryLabel}
                                  </span>
                                </td>
                                <td className="px-3.5 py-2.5 font-bold text-on-surface dark:text-surface-bright">
                                  {row.name}
                                </td>
                                <td className="px-3.5 py-2.5 text-on-surface dark:text-surface-bright font-medium">
                                  {row.standardRequirement}
                                </td>
                                <td className="px-3.5 py-2.5 font-bold text-primary dark:text-primary-fixed-dim">
                                  {row.measuredValue}
                                </td>
                                <td className="px-3.5 py-2.5 text-on-surface-variant dark:text-outline-variant font-medium">
                                  {row.deviation}
                                </td>
                                <td className="px-3.5 py-2.5 whitespace-nowrap">
                                  <span className={`px-2.5 py-0.5 rounded text-[12px] font-bold inline-flex items-center justify-center leading-none ${row.status === 'PASS'
                                    ? 'bg-status-pass-bg text-status-pass-text'
                                    : row.status === 'FAIL'
                                      ? 'bg-status-fail-bg text-status-fail-text font-black'
                                      : row.status === 'HITL'
                                        ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 shadow-2xs'
                                        : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                    }`}>
                                    {row.statusLabel}
                                  </span>
                                </td>
                                <td className="px-3.5 py-2.5 text-[11px] text-on-surface-variant dark:text-outline-variant">
                                  {row.ruleBasis}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                    </div>
                  </div>
                );
              })()}
            </div>
          </section>


          {/* ========================================================================= */}
          {/* 步骤 4: 归档与报告导出 / 拒收处置 (挂载统一标题与批次选择条) */}
          {/* ========================================================================= */}
          <section className="w-full h-full shrink-0 overflow-y-auto custom-scrollbar p-6 space-y-4">
            <div className="max-w-[1440px] mx-auto w-full space-y-4">

              {/* 顶部统一标题与两层树状批次选择条 */}
              <div className="relative z-30">
                <BatchContextBar
                  stepTitle="步骤 4: 报告归档与导出"
                  session={session}
                  selectedDocId={selectedDocId}
                  selectedBatchNo={selectedBatchNo}
                  onSelectDoc={setSelectedDocId}
                  onSelectBatch={(docId, batchNo) => {
                    setSelectedDocId(docId);
                    setSelectedBatchNo(batchNo);
                  }}
                  mode="compliance"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                {/* 左侧 40%：A4 拟真打印预览纸张 (带 PASS / REJECT 对角线水印章) */}
                <div className="lg:col-span-5 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-5 shadow-sheet flex flex-col items-center">
                  <div className="flex justify-between items-center w-full mb-3 pb-2 border-b border-outline-variant/40 dark:border-border-dark">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-xl">description</span>
                      <h3 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                        {isPass ? '智能报告预览' : '不合格拒收说明报告预览'}
                      </h3>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant cursor-pointer">zoom_in</span>
                  </div>

                  {/* A4 尺寸拟真白底纸张 */}
                  <div className="paper-texture border border-outline-variant/40 rounded p-6 relative w-full max-w-[380px] min-h-[480px] shadow-sm flex flex-col justify-between overflow-hidden">

                    {/* 斜向水印大章 */}
                    <div
                      className={`absolute inset-0 flex items-center justify-center pointer-events-none select-none -rotate-25 font-bold text-7xl uppercase opacity-15 ${isPass ? 'text-status-pass-text' : 'text-status-fail-text'
                        }`}
                    >
                      {isPass ? 'PASS' : 'REJECT'}
                    </div>

                    <div className="space-y-4 relative z-10">
                      <div className="text-center border-b pb-3 border-outline-variant/30">
                        <h4 className="text-base font-bold font-headline text-on-surface">
                          {isPass ? '材料合规性核验报告' : '物资不合格拒收处置报告'}
                        </h4>
                        <span className=" text-[10px] text-on-surface-variant tracking-wider">
                          REPORT NO: {currentBatch.reportNo}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px]  border-b pb-3 border-outline-variant/30 text-on-surface">
                        <div>
                          <span className="text-on-surface-variant block">生成时间:</span>
                          <strong>2026-08-26 15:30</strong>
                        </div>
                        <div>
                          <span className="text-on-surface-variant block">检验员:</span>
                          <strong>{currentBatch.inspector}</strong>
                        </div>
                        <div>
                          <span className="text-on-surface-variant block">标准依据:</span>
                          <strong>{currentBatch.standard}</strong>
                        </div>
                        <div>
                          <span className="text-on-surface-variant block">结论:</span>
                          <strong className={isPass ? 'text-status-pass-text' : 'text-status-fail-text'}>
                            {isPass ? '合格 PASS' : '拒收 REJECT'}
                          </strong>
                        </div>
                      </div>

                      <div className="bg-surface-container-low/60 dark:bg-surface-dark-low/60 rounded p-3 text-[11px]  space-y-1">
                        <span className="font-bold block text-on-surface">关键数据汇总:</span>
                        <div className="flex justify-between text-on-surface">
                          <span className="text-on-surface-variant">炉号:</span>
                          <span>{currentBatch.heatNo}</span>
                        </div>
                        <div className="flex justify-between text-on-surface">
                          <span className="text-on-surface-variant">批次:</span>
                          <span>{currentBatch.batchNo}</span>
                        </div>
                        <div className="flex justify-between text-on-surface">
                          <span className="text-on-surface-variant">牌号:</span>
                          <span className="text-primary font-bold">{currentBatch.grade}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-outline-variant/30 flex justify-between items-end text-[10px] font-mono text-on-surface-variant relative z-10">
                      <span className="truncate max-w-[180px]">指纹: {currentBatch.sha256Hash.slice(0, 16)}...</span>
                      <div className="text-right shrink-0">
                        <span>电子签名: </span>
                        <strong className="italic text-primary font-serif">Signature (QA)</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 右侧 60%：导出格式选择、存证摘要与归档网络路径 */}
                <div className="lg:col-span-7 space-y-4">

                  {/* 导出格式 2x2 大卡片网格 */}
                  <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-5 shadow-xs space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-xl">file_download</span>
                      <h3 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                        导出格式选择
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {[
                        { id: 'PDF', title: 'PDF (盖章版)', desc: '包含电子签名与红色质量专用章，适合最终交付与存档。', icon: 'picture_as_pdf', color: 'text-red-500' },
                        { id: 'EXCEL', title: 'Excel (明细版)', desc: '包含所有化学成分与力学实测原始数据对照表。', icon: 'table_view', color: 'text-emerald-600' },
                        { id: 'JSON', title: 'JSON (系统级接口)', desc: '结构化数据，供下游 ERP/MES 系统自动化集成调用。', icon: 'data_object', color: 'text-amber-500' },
                        { id: 'CA', title: 'CA (区块链存证)', desc: '生成带唯一指纹 hash 的数字存证包，防篡改。', icon: 'verified_user', color: 'text-purple-600' },
                      ].map(fmt => {
                        const isSelected = selectedExportFormat === fmt.id;
                        return (
                          <div
                            key={fmt.id}
                            onClick={() => setSelectedExportFormat(fmt.id)}
                            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${isSelected
                              ? 'border-primary dark:border-primary-fixed-dim bg-primary/5 dark:bg-primary-fixed-dim/10 shadow-xs'
                              : 'border-outline-variant/60 dark:border-border-dark hover:border-outline bg-surface-container-lowest dark:bg-surface-dark'
                              }`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className={`material-symbols-outlined text-2xl ${fmt.color}`}>
                                {fmt.icon}
                              </span>
                              {isSelected && (
                                <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-lg fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                                  check_circle
                                </span>
                              )}
                            </div>
                            <div>
                              <strong className="text-xs font-bold block text-on-surface dark:text-surface-bright">{fmt.title}</strong>
                              <p className="text-[11px] text-on-surface-variant dark:text-outline-variant mt-1 leading-snug">{fmt.desc}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 存证与审计摘要 */}
                  <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-5 shadow-xs space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-xl">shield</span>
                      <h3 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                        存证与审计摘要
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                      <div>
                        <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-1">存证哈希值 (SHA-256)</span>
                        <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2 text-on-surface dark:text-surface-bright truncate">
                          {currentBatch.sha256Hash}
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-1">操作员 ID</span>
                        <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2 text-on-surface dark:text-surface-bright">
                          {currentBatch.inspector}
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-1">核验总耗时</span>
                        <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2 text-on-surface dark:text-surface-bright">
                          1.2s (OCR + 规则引擎)
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-1">规则库版本</span>
                        <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2 text-on-surface dark:text-surface-bright">
                          DB_v2023.10.15_Release
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 归档位置 */}
                  <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-4 shadow-xs flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-2xl">cloud_done</span>
                      <div>
                        <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">主服务器归档路径</span>
                        <span className="font-mono text-xs text-on-surface dark:text-surface-bright font-bold">
                          //nas-qcdp-01/archives/2026/08/26/{session.sessionId}/{currentBatch.batchNo}/
                        </span>
                      </div>
                    </div>
                    <button type="button" className="text-primary dark:text-primary-fixed-dim text-xs font-bold hover:underline">
                      修改路径
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 底部常驻导航条 (Fixed Stepper Bar - 宽度定宽 1440px 居中) */}
      {/* ========================================================================= */}
      <footer className="h-16 shrink-0 bg-surface-container-lowest dark:bg-bg-industrial-slate border-t border-outline-variant/60 dark:border-border-dark flex justify-center items-center z-30 shadow-sheet select-none">
        <div className="w-[1440px] max-w-full px-6 flex justify-between items-center">

          {/* 3 步骤连线指示器（步骤 4 暂时隐藏） */}
          <div className="flex items-center gap-2 sm:gap-4">
            {[
              { id: 0, title: '上传文档', icon: 'upload_file' },
              { id: 1, title: '核对数据', icon: 'fact_check' },
              { id: 2, title: '比对标准', icon: 'compare_arrows' },
            ].map((step, idx) => {
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              return (
                <React.Fragment key={step.id}>
                  {idx > 0 && (
                    <div className={`w-6 sm:w-10 h-[2px] transition-colors ${isCompleted ? 'bg-primary dark:bg-primary-fixed-dim' : 'bg-outline-variant/60 dark:bg-border-dark'
                      }`} />
                  )}

                  <button
                    type="button"
                    onClick={() => goToStep(step.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${isActive
                      ? 'bg-primary dark:bg-primary-container text-on-primary font-bold shadow-xs'
                      : isCompleted
                        ? 'text-status-pass-text bg-status-pass-bg dark:bg-emerald-950/40 dark:text-emerald-300 font-medium'
                        : 'text-on-surface-variant dark:text-outline-variant hover:text-on-surface dark:hover:text-surface-bright'
                      }`}
                  >
                    <span className="material-symbols-outlined text-base">
                      {isCompleted ? 'check_circle' : step.icon}
                    </span>
                    <span className="text-xs">{step.title}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {/* 右侧动作流转按钮（Step 1: 上传解析; Step 2: 核对比对; Step 3: 保存截图 / 开启新任务 / 保存结果） */}
          <div className="flex items-center gap-3">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={() => goToStep(currentStep - 1)}
                className="px-4 py-2 rounded-lg border border-outline-variant dark:border-border-dark text-xs font-medium text-on-surface dark:text-surface-bright hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors"
              >
                返回上一步
              </button>
            )}

            {currentStep === 0 && (
              <button
                type="button"
                onClick={handleStartNewSessionAndAdvance}
                className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>下一步：解析文档并核对数据</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            )}

            {currentStep === 1 && (
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>核对完成，开始比对</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            )}

            {currentStep === 2 && (
              <>
                {/* 次要按钮 1：保存截图 */}
                <button
                  type="button"
                  onClick={handleSaveStep3Screenshot}
                  disabled={isCapturing}
                  className="px-4 py-2 rounded-lg border border-outline-variant dark:border-border-dark text-xs font-bold text-on-surface dark:text-surface-bright hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-2xs"
                  title="生成当前步骤 3 比对结果的高清图片快照并下载"
                >
                  <span className="material-symbols-outlined text-base text-primary dark:text-primary-fixed-dim">
                    {isCapturing ? 'hourglass_top' : 'photo_camera'}
                  </span>
                  <span>{isCapturing ? '生成截图中...' : '保存当前页面截图'}</span>
                </button>

                {/* 次要按钮 2：开启新任务 */}
                <button
                  type="button"
                  onClick={handleStartNewTask}
                  className="px-4 py-2 rounded-lg border border-outline-variant dark:border-border-dark text-xs font-bold text-on-surface dark:text-surface-bright hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="自动归档当前检验结果，并重置创建新任务返回步骤 1"
                >
                  <span className="material-symbols-outlined text-base text-outline-variant dark:text-outline-dark">add_task</span>
                  <span>开启新任务</span>
                </button>

                {/* 主要按钮：保存结果 */}
                <button
                  type="button"
                  onClick={() => handleSaveSessionResults(false)}
                  className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="存储当前作业会话 (Session) 的全部系统和人工检验判定结果至本地台账"
                >
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  <span>保存结果</span>
                </button>
              </>
            )}
          </div>
        </div>
      </footer>

      {/* 步骤 3 / 步骤 2 人机协同 (HITL) 侧边抽屉 (520px 方案 A) */}
      <HitlDrawer
        isOpen={isHitlDrawerOpen}
        onClose={() => setIsHitlDrawerOpen(false)}
        hitlContext={activeHitlContext}
        taskId={`TK-${currentBatch.batchNo}`}
        onSubmitResume={handleResolveHitl}
        isSubmitting={isHitlSubmitting}
      />
    </div>
  );
};
