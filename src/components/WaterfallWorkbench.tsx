'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AuditReport } from '@/schemas/report.schema.ts';
import { apiClient, PresetSampleDto, StandardOverviewDto } from '@/lib/api-client.ts';
import {
  InspectionSession,
  SessionDocument,
  BatchSpecimen,
  generateSessionId,
} from '@/types/session.ts';
import { BatchContextBar } from './BatchContextBar.tsx';
import { EditableValueField } from './EditableValueField.tsx';
import { FieldBBox } from '@/types/bbox.ts';
import { HitlDrawer } from './HitlDrawer.tsx';
import { HitlInterruptContext, HumanCorrectionInput, PropertyResolutionCandidate } from '@/workflow/state.interface.ts';
import { toPng } from 'html-to-image';
import { useDocumentParser } from '@/hooks/useDocumentParser.ts';
import { LlmStreamingTerminal } from './LlmStreamingTerminal.tsx';
import { renderPdfAndExtractText } from '@/utils/pdf-renderer.ts';
import { getCertificateInspectionFieldDefinitions } from '@/schemas/certificate.schema.ts';
import { ConfidenceEvaluator } from '@/engine/confidence-evaluator.ts';
import { resolveFinalDisposition, getDispositionBadgeMeta, SystemVerdict, HumanVerdict } from '@/engine/dual-track-verdict.ts';
import { normalizeStandardId, areStandardCollectionsEquivalent } from '@/lib/utils.ts';

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
  onOpenHitlDrawer?: () => void;
  onTriggerAudit: () => void;
  loadedSession?: InspectionSession | null;
  onSessionChange?: (session: InspectionSession) => void;
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

export const formatHitlReasonBadge = (reason?: string): string => {
  switch (reason) {
    case 'UNKNOWN_GRADE':
      return '材料牌号待消歧';
    case 'PROPERTY_AMBIGUITY':
      return '非标检验项目对齐';
    case 'ALTERNATIVE_CLAUSE':
      return '替代条款合规确权';
    case 'MULTI_STANDARD_CONFLICT':
      return '多标准互斥仲裁';
    case 'QUALITATIVE_AMBIGUITY':
      return '定性条款语义争议';
    default:
      return '待人工核实确认';
  }
};

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

export const DEFAULT_SCENARIOS: PresetSampleDto[] = [
  {
    id: 'case1_tier1_hitl_unknown_grade',
    md5: '5b0ae963b9470bd53454d4066d89022b',
    filename: 'case1_tier1_hitl_unknown_grade.pdf',
    title: 'Case 1: Tier 1 - HITL 人机协同',
    category: '分层核验典型场景',
    tier_flow: 'Tier 1 ➡️ HITL 抽屉挂起',
    declared_grade: 'SUS 304H-SpecialX',
    expected_outcome: 'AWAITING_HUMAN_REVIEW',
    download_url: '/samples/case1_tier1_hitl_unknown_grade.pdf',
    description: '非标未收录牌号，直接触发阻断性断点挂起，右侧滑出 480px 抽屉。',
    tags: ['Tier 1', '牌号未收录', '阻断性挂起', '480px抽屉'],
  },
  {
    id: 'case2_tier1_to_tier2_pass',
    md5: '855e45ff15c9814029232b3bf564ee0b',
    filename: 'case2_tier1_to_tier2_pass.pdf',
    title: 'Case 2: Tier 1 ➡️ Tier 2 语义达标',
    category: '分层核验典型场景',
    tier_flow: 'Tier 1 ➡️ Tier 2 ➡️ PASS',
    declared_grade: '06Cr18Ni11Ti',
    expected_outcome: 'PASS',
    download_url: '/samples/case2_tier1_to_tier2_pass.pdf',
    description: '表面光洁度 0.33 μm 自动对齐至标准粗糙度 Ra ≤ 0.8 μm，全绿达标。',
    tags: ['Tier 2', '语义消歧', '长尾对齐', '全绿通过'],
  },
  {
    id: 'case3_tier1_to_tier2_fail',
    md5: '1b6254e44694e389bfe1431d33bf51aa',
    filename: 'case3_tier1_to_tier2_fail.pdf',
    title: 'Case 3: Tier 1 ➡️ Tier 2 语义超标',
    category: '分层核验典型场景',
    tier_flow: 'Tier 1 ➡️ Tier 2 ➡️ FAIL',
    declared_grade: '06Cr18Ni11Ti',
    expected_outcome: 'FAIL',
    download_url: '/samples/case3_tier1_to_tier2_fail.pdf',
    description: '表面光洁度 1.50 μm 对齐至粗糙度后判定超差超标，红灯 FAIL 否定。',
    tags: ['Tier 2', '超差超标', '一票否决', 'FAIL 告警'],
  },
  {
    id: 'case4_tier1_to_tier2_hitl',
    md5: 'd881d1e91044007468f87059ec96c60a',
    filename: 'case4_tier1_to_tier2_hitl.pdf',
    title: 'Case 4: Tier 1 ➡️ Tier 2 行内待定',
    category: '分层核验典型场景',
    tier_flow: 'Tier 1 ➡️ Tier 2 ➡️ 行内 HITL',
    declared_grade: '06Cr18Ni11Ti',
    expected_outcome: 'AWAITING_HUMAN_REVIEW',
    download_url: '/samples/case4_tier1_to_tier2_hitl.pdf',
    description: '特种非标微区抗剪切断裂韧度置信度不足，矩阵行内展开 HITL 卡片。',
    tags: ['Tier 2', '行内 HITL', '特异非标', '置信度不足'],
  },
];

/**
 * ============================================================================
 * NormScale 工业质检工作台 (1:1 像素级还原 Stitch 设计系统)
 * 采用受控垂直平滑滑动容器，禁止全局滚轮脱焦，支持两层树状作业会话 (Session)
 * ============================================================================
 */
export const WaterfallWorkbench: React.FC<WaterfallWorkbenchProps> = ({
  standardsData,
  samples = [],
  selectedSampleId,
  onSelectSample,
  isAuditing,
  onOpenHitlDrawer: _onOpenHitlDrawer,
  onTriggerAudit: _onTriggerAudit,
  loadedSession,
  onSessionChange,
  initialStep = 0,
}) => {
  // 当前激活的步骤索引：0 (Step 1), 1 (Step 2), 2 (Step 3), 3 (Step 4)
  const [currentStep, setCurrentStep] = useState<number>(initialStep);
  const [zoomLevel, setZoomLevel] = useState<number>(150);
  const [rotation, setRotation] = useState<number>(0); // 顺时针旋转角度 (0, 90, 180, 270)
  const [pageOrientationOverride, setPageOrientationOverride] = useState<'auto' | 'portrait' | 'landscape'>('auto'); // 用户版式覆盖 (auto自适应, portrait强制竖版, landscape强制横版)
  const [pageAspectRatios, setPageAspectRatios] = useState<Record<number, number>>({}); // 页面自适应宽高比缓存
  const [pdfViewportWidth, setPdfViewportWidth] = useState<number>(560); // PDF视窗实时净可用宽度 (自适应横向留白)
  const [selectedExportFormat, setSelectedExportFormat] = useState<string>('PDF');
  const [activeTabCategory, setActiveTabCategory] = useState<string>('all');
  // 步骤 3: 全景合规比对矩阵分类页签与标准多选/技术协议选择控件状态
  const [step3Category, setStep3Category] = useState<string>('all');
  const [isStandardSelectorOpen, setIsStandardSelectorOpen] = useState<boolean>(false);
  const [isAgreementSelectorOpen, setIsAgreementSelectorOpen] = useState<boolean>(false);
  const [standardSearchQuery, setStandardSearchQuery] = useState<string>('');
  const [isEvaluatingBatch, setIsEvaluatingBatch] = useState<boolean>(false);
  // 多批次物理隔离展示状态池 (以 batchNo 为槽位隔离，防串标污染与多阶段跃迁)
  const [batchPresentationMap, setBatchPresentationMap] = useState<Record<string, {
    batchNo: string;
    stage: 'idle' | 'tier1_evaluating' | 'tier1_ready' | 'tier2_resolving' | 'hitl_pending' | 'completed' | 'error';
    report?: AuditReport;
    pendingProperties?: PropertyResolutionCandidate[];
    resolvedProperties?: PropertyResolutionCandidate[];
    hitlContext?: HitlInterruptContext;
    hitlFieldCorrection?: HumanCorrectionInput;
    hitlCorrection?: HumanCorrectionInput;
    error?: string;
    taskId?: string;
  }>>({});

  // 创建纯净空会话辅助函数
  const createEmptySession = (): InspectionSession => ({
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

  // 当前作业会话 (Session) 与当前 Focus 的文档 ID 及炉批号 (初始为纯净空会话，由用户上传真实文档载入)
  const [session, setSession] = useState<InspectionSession>(() => loadedSession || createEmptySession());
  const [selectedDocId, setSelectedDocId] = useState<string>(
    session.documents[0]?.docId || ''
  );
  const [selectedBatchNo, setSelectedBatchNo] = useState<string>(
    session.documents[0]?.batches[0]?.batchNo || ''
  );

  // 监听工作台 Session 变化，实时同步通知顶层主页面 (用于页面切换保活与台账加载覆盖提示)
  useEffect(() => {
    onSessionChange?.(session);
  }, [session, onSessionChange]);

  // 分层核验场景测试矩阵列表（优先取传入 samples 中的分层场景，兜底内置 DEFAULT_SCENARIOS）
  const scenarioSamples = useMemo(() => {
    const list = samples.filter(s => s.category === '分层核验典型场景' || s.id.startsWith('case'));
    if (list.length > 0) return list;
    return DEFAULT_SCENARIOS;
  }, [samples]);

  // 首页“典型场景测试用例”折叠展开状态 (默认折叠)
  const [isScenariosExpanded, setIsScenariosExpanded] = useState<boolean>(false);

  // 源文档 OCR 视觉 BBox 与右侧解析字段双向联动状态
  const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(null);
  // 停顿满 1 秒后激活 200% 原位放大的字段 ID 与防晕倒计时器
  const [magnifiedFieldId, setMagnifiedFieldId] = useState<string | null>(null);
  const magnifyTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 是否启用定位聚焦（实验功能），默认关闭 (false)
  const [isBboxFocusEnabled, setIsBboxFocusEnabled] = useState<boolean>(false);

  const handleToggleBboxFocus = useCallback((enabled: boolean) => {
    setIsBboxFocusEnabled(enabled);
    if (!enabled) {
      if (magnifyTimerRef.current) {
        clearTimeout(magnifyTimerRef.current);
        magnifyTimerRef.current = null;
      }
      setHighlightedFieldId(null);
      setMagnifiedFieldId(null);
    }
  }, []);

  const [currentDocPage, setCurrentDocPage] = useState<number>(1);
  const pdfScrollContainerRef = useRef<HTMLDivElement>(null);
  const rightScrollContainerRef = useRef<HTMLDivElement>(null);
  const [uploadedFileUrls, setUploadedFileUrls] = useState<Record<string, string>>({});
  const [docBboxesMap, setDocBboxesMap] = useState<Record<string, FieldBBox[]>>({});
  // 步骤 3 批次核验调度防重锁（跨步骤级联清理与并发控制）
  const batchEvaluatingKeyRef = useRef<string>('');
  // 批次执行运行计数器（用于生成独立隔离的 runId: RUN-${counter}，避免 LangGraph Checkpoint 状态污染）
  const batchRunCountersRef = useRef<Record<string, number>>({});
  // 批次级 AbortController 引用字典 (用于掐旧启新熔断与防止并发幽灵覆盖)
  const batchAbortControllersRef = useRef<Record<string, AbortController>>({});
  // 重新核验点击冷却锁 (500ms 内防盲目连击)
  const isReevaluatingCooldownRef = useRef<boolean>(false);

  // 获取并自增指定批次的执行运行标识 (RUN-1, RUN-2, ...)
  const nextBatchRunId = useCallback((batchNo: string): string => {
    const current = batchRunCountersRef.current[batchNo] || 0;
    const next = current + 1;
    batchRunCountersRef.current[batchNo] = next;
    return `RUN-${next}`;
  }, []);

  // Schema 反射派生的检验项默认方法标准字典（避免任何硬编码）
  const fieldDefMap = useMemo(() => {
    const map: Record<string, { defaultMethod?: string }> = {};
    getCertificateInspectionFieldDefinitions().forEach(def => {
      map[def.key] = def;
      if (def.fieldId) map[def.fieldId] = def;
    });
    return map;
  }, []);

  // 当大模型或缓存解析返回真实 Document 数据时，实时双向同步至工作台 Session
  const handleDocumentParsed = useCallback((docId: string, parsedDoc: SessionDocument, bboxes?: FieldBBox[]) => {
    setSession(prev => ({
      ...prev,
      documents: prev.documents.map(d => {
        if (d.docId !== docId) return d;
        const preservedPages = (parsedDoc.pages && parsedDoc.pages.length > 0)
          ? parsedDoc.pages
          : (d.pages && d.pages.length > 0 ? d.pages : (d.samplePages && d.samplePages.length > 0 ? d.samplePages : undefined));
        const enrichedBatches = (parsedDoc.batches || []).map(b => {
          const enriched = ConfidenceEvaluator.enrichBatchConfidences(b, bboxes);
          return {
            ...enriched,
            verdict: 'UNAUDITED' as const,
            auditReport: undefined,
            overrideGrade: undefined,
            overrideStandard: undefined,
            systemVerdict: undefined,
            systemVerdictSummary: undefined,
            humanVerdict: null,
            humanVerdictSummary: undefined,
          };
        });
        return {
          ...parsedDoc,
          batches: enrichedBatches,
          docId,
          md5: parsedDoc.md5 || d.md5,
          ocrStatus: 'DONE',
          pages: preservedPages,
          samplePages: preservedPages,
        };
      }),
    }));
    if (bboxes && bboxes.length > 0) {
      setDocBboxesMap(prev => ({
        ...prev,
        [docId]: bboxes,
        [parsedDoc.docId]: bboxes,
      }));
    }
    // 级联清除对应批次的视图缓存，消除上一轮历史判定残留
    if (parsedDoc.batches && parsedDoc.batches.length > 0) {
      setBatchPresentationMap(prev => {
        const next = { ...prev };
        for (const b of parsedDoc.batches) {
          delete next[b.batchNo];
        }
        return next;
      });
      const firstBatchNo = parsedDoc.batches[0]?.batchNo;
      if (firstBatchNo) {
        setSelectedBatchNo(firstBatchNo);
      }
    }
    // 彻底释放调度防重锁，确保进入步骤 3 能够无缝自动拉起重新比对
    batchEvaluatingKeyRef.current = '';
    // 重置批次执行计数器并中止任何进行中的旧网络请求
    batchRunCountersRef.current = {};
    Object.values(batchAbortControllersRef.current).forEach(c => c.abort('DOCUMENT_REPARSED'));
    batchAbortControllersRef.current = {};
  }, []);

  // 多文档异步并发解析工作池 Hook
  const {
    tasks: parsingTasks,
    sessionMetrics,
    lastError,
    startParsingSession,
    reparseDocument,
  } = useDocumentParser(handleDocumentParsed);

  // 步骤 3 比对阶段开销累加器（各批次 LangGraph 真实耗时与 Token，单调递增不回缩）
  const [auditMetrics, setAuditMetrics] = useState<{
    batchRecords: Record<string, { durationMs: number; inputTokens: number; outputTokens: number }>;
    historical: { durationMs: number; inputTokens: number; outputTokens: number };
  }>({
    batchRecords: {},
    historical: { durationMs: 0, inputTokens: 0, outputTokens: 0 },
  });

  // 综合 Session 计量大盘 (步骤 2 抽取真实 Token/耗时 + 步骤 3 比对各批次 LangGraph 真实 Token/耗时，单调递增)
  const totalCombinedMetrics = useMemo(() => {
    let auditDurMs = auditMetrics.historical.durationMs;
    let auditInTokens = auditMetrics.historical.inputTokens;
    let auditOutTokens = auditMetrics.historical.outputTokens;

    Object.values(auditMetrics.batchRecords).forEach(rec => {
      auditDurMs += rec.durationMs || 0;
      auditInTokens += rec.inputTokens || 0;
      auditOutTokens += rec.outputTokens || 0;
    });

    const auditDurationSec = auditDurMs / 1000;
    const parseDurationSec = sessionMetrics.totalDurationSeconds;
    const totalDurationSec = parseFloat((parseDurationSec + auditDurationSec).toFixed(1));

    const totalInputTokens = sessionMetrics.totalInputTokens + auditInTokens;
    const totalOutputTokens = sessionMetrics.totalOutputTokens + auditOutTokens;

    return {
      totalInputTokens,
      totalOutputTokens,
      totalDurationSeconds: totalDurationSec,
      parseInputTokens: sessionMetrics.totalInputTokens,
      parseOutputTokens: sessionMetrics.totalOutputTokens,
      parseDurationSeconds: parseDurationSec,
      auditInputTokens: auditInTokens,
      auditOutputTokens: auditOutTokens,
      auditDurationSeconds: parseFloat(auditDurationSec.toFixed(1)),
      activeConcurrency: sessionMetrics.activeConcurrency,
      readyDocsCount: sessionMetrics.readyDocsCount,
      totalDocsCount: sessionMetrics.totalDocsCount,
    };
  }, [sessionMetrics, auditMetrics]);

  const [isStreamingTerminalExpanded, setIsStreamingTerminalExpanded] = useState<boolean>(true);
  const prevDocStatusMap = useRef<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [uploadedFilesMap, setUploadedFilesMap] = useState<Record<string, File>>({});

  // 步骤 1 技术协议上传状态 (单会话仅允许 1 份 PDF，标记待实施，暂不接通后端)
  const agreementFileInputRef = useRef<HTMLInputElement>(null);
  const [isAgreementDraggingOver, setIsAgreementDraggingOver] = useState<boolean>(false);
  const [uploadedAgreementFile, setUploadedAgreementFile] = useState<File | null>(null);
  const [agreementUploadError, setAgreementUploadError] = useState<string | null>(null);

  const handleSelectAgreementFile = (file: File) => {
    setAgreementUploadError(null);
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setAgreementUploadError('技术协议仅支持 PDF 格式文件');
      return;
    }
    setUploadedAgreementFile(file);
  };

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

  // 切换文档时自动重置旋转角度、版式覆盖与长宽比缓存
  useEffect(() => {
    setRotation(0);
    setPageOrientationOverride('auto');
    setPageAspectRatios({});
  }, [selectedDocId]);

  // 首次载入或文档/缩放/旋转变化时，确保 PDF 视窗水平居中
  useEffect(() => {
    const container = pdfScrollContainerRef.current;
    if (!container) return;
    const centerTimer = setTimeout(() => {
      if (container.scrollWidth > container.clientWidth) {
        container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
      }
    }, 50);
    return () => clearTimeout(centerTimer);
  }, [zoomLevel, rotation, currentDocPage, selectedDocId, currentStep]);

  // 监听 PDF 视窗物理容器宽度，自适应计算横向呼吸留白与整页完整预览
  useEffect(() => {
    const el = pdfScrollContainerRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 100) {
        setPdfViewportWidth(el.clientWidth);
      }
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    window.addEventListener('resize', updateWidth);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, [currentStep, selectedDocId]);

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

  // 恢复默认原件规则切片（显式清空人工指定的牌号与标准，归零判定与审批状态）
  const handleResetGrade = () => {
    if (!currentBatch) return;

    const cleanBatch: BatchSpecimen = {
      ...currentBatch,
      overrideGrade: undefined,
      overrideStandard: undefined,
      auditReport: undefined,
      verdict: 'UNAUDITED',
      systemVerdict: undefined,
      systemVerdictSummary: undefined,
      humanVerdict: null,
      humanVerdictSummary: undefined,
    };

    setSession(prev => ({
      ...prev,
      documents: prev.documents.map(doc => {
        if (doc.docId !== selectedDocId) return doc;
        return {
          ...doc,
          batches: doc.batches.map(b => {
            if (b.batchNo !== selectedBatchNo) return b;
            return cleanBatch;
          }),
        };
      }),
    }));

    // 级联清空当前批次的视图缓存，杜绝旧规则报告死灰复燃
    if (selectedBatchNo) {
      setBatchPresentationMap(prev => {
        const next = { ...prev };
        delete next[selectedBatchNo];
        return next;
      });
    }

    // 释放调度防重锁
    batchEvaluatingKeyRef.current = '';

    // 以干净的原件基准重新拉起流式核验
    evaluateBatch(cleanBatch);
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
    status: '就绪' | '上传中' | '解析中' | '预处理中...' | '已命中解析缓存';
    size: string;
    date: string;
    md5?: string;
    pageCount?: number;
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
  };

  // 从历史缓存恢复至待处理队列并选中
  const handleRestoreFromCache = async (item: CachedDocItem) => {
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

        setQueuedDocs(prev => {
          if (prev.some(d => d.id === finalDocId || (item.md5 && d.md5 === item.md5))) return prev;
          return [
            ...prev,
            {
              id: finalDocId,
              filename: item.filename,
              status: '已命中解析缓存',
              size: item.size,
              date: item.date,
              md5: item.md5 || data.result.md5,
            },
          ];
        });

        setSession(prev => {
          const filtered = prev.documents.filter(d => d.docId !== finalDocId);
          return {
            ...prev,
            documents: [...filtered, doc],
          };
        });

        if (data.result.bboxes) {
          setDocBboxesMap(prev => ({ ...prev, [finalDocId]: data.result.bboxes }));
        }

        setSelectedDocId(finalDocId);
        if (doc.batches && doc.batches[0]?.batchNo) {
          setSelectedBatchNo(doc.batches[0].batchNo);
        }
        showToast(`已从缓存载入: ${item.filename}`, 'success');
      } else {
        showToast(`载入缓存失败: ${data.error || '未找到有效解析结果'}`, 'error');
      }
    } catch (err) {
      console.warn('[handleRestoreFromCache] 恢复缓存文档失败:', err);
      showToast('载入缓存请求异常', 'error');
    }
  };

  // 删除指定历史缓存
  const handleDeleteCachedDoc = async (item: CachedDocItem, e: React.MouseEvent) => {
    e.stopPropagation();

    // 优先使用 md5，其次 fallback 到 id
    const targetKey = item.md5 || item.id;
    try {
      const res = await fetch(`/api/documents/cached?md5=${encodeURIComponent(targetKey)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCachedDocs(prev => prev.filter(c => c.id !== item.id && (!item.md5 || c.md5 !== item.md5)));
        showToast(`已删除缓存: ${item.filename}`, 'info');
      } else {
        showToast(data.error || '删除缓存失败', 'error');
      }
    } catch (err) {
      showToast('删除缓存请求异常', 'error');
    }
  };

  // 处理用户选择真实本地文件上传 (严格限制仅支持 PDF 与 PNG/JPEG/JPG/BMP 图片)
  const handleRealFiles = (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    const validExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.bmp'];
    const newUrls: Record<string, string> = {};

    fileArr.forEach(file => {
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (!validExtensions.includes(ext)) {
        showToast(`文件 [${file.name}] 格式不受支持。系统仅支持工业 PDF 文档及 PNG/JPEG/JPG/BMP 图片`, 'error');
        return;
      }

      const docId = `doc_up_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
      const blobUrl = URL.createObjectURL(file);
      newUrls[docId] = blobUrl;

      // 严格待预处理计算真实 MD5 后判定缓存，绝不以可重复的 filename 盲猜缓存
      setQueuedDocs(prev => [
        ...prev,
        {
          id: docId,
          filename: file.name,
          status: '预处理中...',
          size: sizeStr,
          date: new Date().toLocaleDateString(),
          md5: undefined,
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
        return {
          ...prev,
          documents: [...prev.documents, newDoc],
        };
      });

      // 即时触发客户端切图、文本提取与服务端预处理落盘流水线
      const runInstantPreprocess = async () => {
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
            prePages = [blobUrl];
          }

          // 即时将原件与预处理切图/文本及 Token 坐标提交到服务端落盘
          const formData = new FormData();
          formData.append('file', file);
          if (extractedText) {
            formData.append('extractedText', extractedText);
          }
          if (preTokens && preTokens.length > 0) {
            formData.append('textTokens', JSON.stringify(preTokens));
          }
          if (prePages.length > 0) {
            formData.append('pageImages', JSON.stringify(prePages));
          }

          const res = await fetch('/api/documents/preprocess', {
            method: 'POST',
            body: formData,
          });
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
              showToast(`预处理完成 (已检测到历史解析缓存: ${file.name})`, 'success');
            } else {
              showToast(`预处理就绪 (共 ${data.pageCount || pageCount} 页): ${file.name}`, 'success');
            }
          } else {
            setQueuedDocs(qPrev =>
              qPrev.map(q => (q.id === docId ? { ...q, status: '就绪' } : q))
            );
          }
        } catch (prepErr) {
          console.error('[InstantPreprocess] 预处理失败:', prepErr);
          setQueuedDocs(qPrev =>
            qPrev.map(q => (q.id === docId ? { ...q, status: '就绪' } : q))
          );
        }
      };

      runInstantPreprocess();
    });

    setUploadedFileUrls(prev => ({ ...prev, ...newUrls }));
  };

  // 专测矩阵测试用例原件装载状态追踪
  const [loadingScenarios, setLoadingScenarios] = useState<Record<string, boolean>>({});

  // 从专测矩阵一键装载测试用例原件至待处理队列 (无论是否命中缓存均可继续测试)
  const handleLoadScenarioFile = async (scenario: PresetSampleDto) => {
    // 1. 检查该用例是否已在待处理队列中
    const existingDoc = queuedDocs.find(d =>
      d.id === scenario.id ||
      d.filename === scenario.filename ||
      (scenario.md5 && d.md5 === scenario.md5)
    );
    if (existingDoc) {
      setSelectedDocId(existingDoc.id);
      const matched = session.documents.find(d => d.docId === existingDoc.id);
      if (matched && matched.batches[0]) {
        setSelectedBatchNo(matched.batches[0].batchNo);
      }
      showToast(`测试用例已在待处理队列中: ${existingDoc.filename}`, 'info');
      return;
    }

    const scenarioKey = scenario.id;
    setLoadingScenarios(prev => ({ ...prev, [scenarioKey]: true }));

    try {
      const downloadUrl = scenario.download_url || `/samples/${scenario.filename || `${scenario.id}.pdf`}`;
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        throw new Error(`获取用例原件失败 [HTTP ${res.status}]`);
      }
      const blob = await res.blob();
      const filename = scenario.filename || `${scenario.id}.pdf`;
      const file = new File([blob], filename, { type: 'application/pdf' });

      // 接入统一的文件上传预处理入队流水线
      handleRealFiles([file]);
      showToast(`已装载测试用例原件至待处理队列: ${filename}`, 'success');
    } catch (err: any) {
      console.warn('[handleLoadScenarioFile] 装载用例原件异常:', err);
      showToast(`装载用例原件失败: ${err.message || '网络连接异常'}`, 'error');
    } finally {
      setLoadingScenarios(prev => ({ ...prev, [scenarioKey]: false }));
    }
  };

  // 从 Step 1 触发新建 Session 并前往 Step 2 (启动 2~3 线程异步并发工作池)
  const handleStartNewSessionAndAdvance = () => {
    if (queuedDocs.length === 0) {
      showToast('待处理队列为空，请先上传文档或从历史缓存选择', 'error');
      return;
    }

    const newSessionId = generateSessionId();
    // 严格仅采用用户实际加入队列的文档 (基于实例 docId 及真实内容 md5 精确关联，杜绝文件名碰撞)
    let activeDocs = session.documents.filter(d =>
      queuedDocs.some(
        q => q.id === d.docId || (q.md5 && d.docId === `doc_${q.md5.slice(0, 8)}`)
      )
    );

    // 容错兜底：若 activeDocs 为空但 session.documents 有文档且队列有项，直接使用 session.documents
    if (activeDocs.length === 0 && session.documents.length > 0) {
      activeDocs = session.documents;
    }

    if (activeDocs.length === 0) {
      showToast('队列中暂无有效待解析文档', 'error');
      return;
    }

    const totalBatches = activeDocs.reduce((acc, d) => acc + d.batches.length, 0);
    const passedBatches = activeDocs.reduce((acc, d) => acc + d.batches.filter(b => b.verdict === 'PASS').length, 0);
    const failedBatches = activeDocs.reduce((acc, d) => acc + d.batches.filter(b => b.verdict === 'FAIL').length, 0);
    const hitlBatches = activeDocs.reduce((acc, d) => acc + d.batches.filter(b => b.verdict === 'MANUAL_REVIEW').length, 0);

    const newSession: InspectionSession = {
      sessionId: newSessionId,
      createdAt: new Date().toLocaleString(),
      title: `工作台录入批次 · 共 ${activeDocs.length} 份文档检验`,
      totalDocuments: activeDocs.length,
      totalBatches,
      passedBatches,
      failedBatches,
      hitlBatches,
      documents: activeDocs,
    };
    setSession(newSession);
    const firstDoc = activeDocs[0];
    if (firstDoc) {
      setSelectedDocId(firstDoc.docId);
      const firstBatch = firstDoc.batches[0];
      if (firstBatch) {
        setSelectedBatchNo(firstBatch.batchNo);
      }
    }
    // 启动多文档异步并发解析工作池 (传入真实文件流映射)
    startParsingSession(activeDocs, uploadedFilesMap);
    setAuditMetrics({
      batchRecords: {},
      historical: { durationMs: 0, inputTokens: 0, outputTokens: 0 },
    });
    setIsStreamingTerminalExpanded(true);
    setCurrentStep(1);
  };

  // 获得当前选中的物理 Document 和 Batch (若无活动文档则保持 undefined，进入空状态视窗)
  const currentDoc: SessionDocument | undefined =
    session.documents.find(d => d.docId === selectedDocId) ||
    session.documents[0];

  const currentBatch: BatchSpecimen | undefined =
    currentDoc?.batches.find(b => b.batchNo === selectedBatchNo) ||
    currentDoc?.batches[0];

  const isGradeOverridden = Boolean(
    currentBatch?.overrideGrade && currentBatch.overrideGrade !== currentBatch.grade
  );
  const isStandardOverridden = Boolean(
    currentBatch?.overrideStandard &&
    !areStandardCollectionsEquivalent(currentBatch.overrideStandard, currentBatch.standard)
  );
  const isOverridden = isGradeOverridden || isStandardOverridden;

  const activeGrade = currentBatch ? (isGradeOverridden ? currentBatch.overrideGrade! : currentBatch.grade) : '';
  const activeStandard = currentBatch ? (isStandardOverridden ? currentBatch.overrideStandard! : currentBatch.standard) : '';

  let computedIsPass = currentBatch?.verdict === 'PASS';
  let computedVerdictSummary = currentBatch?.verdictSummary || '';

  if (isOverridden && currentBatch) {
    computedVerdictSummary = currentBatch.verdictSummary || `人工指定为 ${activeGrade} (${activeStandard})，待核验规则重新判定`;
  }

  const isPass = computedIsPass;
  const isDocParsing = Boolean(currentDoc && (currentDoc.ocrStatus === 'PENDING' || currentDocTask?.status === 'parsing'));
  const isHitl = Boolean(currentBatch && currentBatch.verdict === 'MANUAL_REVIEW' && !isDocParsing);

  // 步骤 3 / 步骤 2 HITL 侧边抽屉内部状态
  const [isHitlDrawerOpen, setIsHitlDrawerOpen] = useState<boolean>(false);
  const [activeHitlContext, setActiveHitlContext] = useState<HitlInterruptContext | undefined>(undefined);
  const [isHitlSubmitting, setIsHitlSubmitting] = useState<boolean>(false);

  // 触发打开 HITL 抽屉 (根据当前批次动态适配场景，继承已计算出的候选与建议)
  const handleTriggerHitl = () => {
    if (!currentBatch) return;
    const existingCtx = batchPresentationMap[currentBatch.batchNo]?.hitlContext;

    const reason: HitlInterruptContext['reason'] = existingCtx?.reason || currentBatch.hitlReason || (
      currentBatch.grade.includes('Special') || currentBatch.grade.includes('SUS') || currentBatch.grade.includes('未知')
        ? 'UNKNOWN_GRADE'
        : 'ALTERNATIVE_CLAUSE'
    );

    const ctx: HitlInterruptContext = {
      ...existingCtx,
      reason,
      prompt_message: existingCtx?.prompt_message || currentBatch.systemVerdictSummary || currentBatch.verdictSummary || '触发人机协同规则阻断，需人工介入核实',
      batch_no: currentBatch.batchNo,
      candidate_grades: existingCtx?.candidate_grades,
      suggestions: existingCtx?.suggestions,
    };
    setActiveHitlContext(ctx);
    setIsHitlDrawerOpen(true);
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
            let updatedB = { ...b };

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
              return { ...b, process: { ...b.process, flattening: newValue } };
            }
            if (fieldId === 'proc_flaring') {
              return { ...b, process: { ...b.process, flaring: newValue } };
            }

            // 4. 金相组织
            if (fieldId === 'metallo_grain') {
              return { ...b, process: { ...b.process, grainSize: newValue } };
            }

            // 5. 耐腐蚀性能
            if (fieldId === 'corrosion_intergranular') {
              return { ...b, process: { ...b.process, intergranularCorrosion: newValue } };
            }

            // 6. 无损探伤 (支持独立 ET 与 UT 及长尾检验项)
            if (fieldId === 'ndt_et') {
              return { ...b, process: { ...b.process, ndt_et: newValue, ndt: newValue } };
            }
            if (fieldId === 'ndt_ut') {
              return { ...b, process: { ...b.process, ndt_ut: newValue } };
            }
            if (fieldId === 'ndt_pressure' || fieldId === 'ndt') {
              return { ...b, process: { ...b.process, ndt: newValue } };
            }

            // 弹性长尾扩展检验项
            if (b.additionalTests && b.additionalTests.some(t => t.key === fieldId)) {
              return {
                ...b,
                additionalTests: b.additionalTests.map(t => t.key === fieldId ? { ...t, result: newValue } : t)
              };
            }

            // 尺寸与表面质量判定项
            if (fieldId === 'geo_dimensions') {
              const hasAddTest = b.additionalTests?.some(t => t.key === 'geo_dimensions' || t.name?.includes('尺寸'));
              if (hasAddTest) {
                return {
                  ...b,
                  additionalTests: b.additionalTests?.map(t => (t.key === 'geo_dimensions' || t.name?.includes('尺寸')) ? { ...t, result: newValue } : t)
                };
              }
              return { ...b, dimensions: newValue };
            }

            if (fieldId === 'surface_quality' || fieldId === 'geo_surface_quality') {
              const hasAddTest = b.additionalTests?.some(t => t.key === 'geo_surface_quality' || t.name?.includes('表面'));
              return {
                ...b,
                surfaceQuality: newValue,
                additionalTests: hasAddTest
                  ? b.additionalTests?.map(t => (t.key === 'geo_surface_quality' || t.name?.includes('表面')) ? { ...t, result: newValue } : t)
                  : b.additionalTests
              };
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
            if (fieldId === 'meta_certificateNo') {
              return { ...b, certificateNo: newValue };
            }
            if (fieldId === 'meta_constructionNo') {
              return { ...b, constructionNo: newValue };
            }
            if (fieldId === 'meta_supplier') {
              return { ...b, supplier: newValue };
            }
            if (fieldId === 'meta_productName') {
              updatedB = { ...b, productName: newValue };
            }

            // 实时结合当前 BBox 覆盖率重新动态评估 OCR 置信度与牌号匹配度真值
            return ConfidenceEvaluator.enrichBatchConfidences(updatedB, bboxes);
          }),
        };
      }),
    }));
  };

  // 动态构建标准库目录（优先使用 standardsData，保持后端单源真相）
  const dynamicStandardsCatalog: StandardCatalogItem[] = useMemo(() => {
    if (standardsData && Array.isArray(standardsData.standards) && standardsData.standards.length > 0) {
      return standardsData.standards.map(std => {
        const isOrdering = std.standard_name.includes('订货') || std.standard_id.includes('NB/T');
        return {
          id: std.standard_id,
          shortCode: std.standard_id.split(/[-_]/)[0]?.trim() || std.standard_id,
          name: std.standard_name,
          category: isOrdering ? '承压订货技术条件' : '产品制造通用标准',
          badgeColor: isOrdering
            ? 'text-amber-700 bg-amber-50 dark:bg-amber-950/70 border-amber-300 dark:border-amber-700'
            : 'text-blue-700 bg-blue-50 dark:bg-blue-950/70 border-blue-300 dark:border-blue-700',
          grades: (std.available_slices || []).map(sliceKey => ({
            code: sliceKey,
            primaryGrade: sliceKey,
            display: sliceKey,
            description: `${std.standard_id} 规格切片`,
          })),
        };
      });
    }
    return STANDARDS_CATALOG;
  }, [standardsData]);

  // 从 activeStandard 中解析出已选中的标准列表 (通过 normalizeStandardId 进行指纹匹配并提升为权威标准 ID)
  const selectedStandardIds = useMemo(() => {
    const rawList = activeStandard
      .split(/[、,，;；\n]+/)
      .map(s => s.trim())
      .filter(Boolean);

    const sanitized: string[] = [];
    let i = 0;
    while (i < rawList.length) {
      const current = rawList[i]!;
      const currentNorm = normalizeStandardId(current);

      // 1. 优先在当前已收录目录中进行指纹匹配（无论质保书提取是否带空格，一律映射为标准目录的官方规范 ID）
      const matched = dynamicStandardsCatalog.find(s =>
        normalizeStandardId(s.id) === currentNorm ||
        normalizeStandardId(s.shortCode) === currentNorm
      );

      if (matched) {
        if (!sanitized.some(s => normalizeStandardId(s) === normalizeStandardId(matched.id))) {
          sanitized.push(matched.id);
        }
        i++;
        continue;
      }

      // 2. 容错修复：若历史操作中曾被空格错误拆成了 'NB/T' 和 '47019.5-2021'，自动重新缝合为完整标准 ID
      if (i + 1 < rawList.length) {
        const combined = `${current} ${rawList[i + 1]}`;
        const combinedNorm = normalizeStandardId(combined);
        const combinedMatch = dynamicStandardsCatalog.find(s =>
          normalizeStandardId(s.id) === combinedNorm ||
          normalizeStandardId(s.shortCode) === combinedNorm
        );
        if (combinedMatch) {
          if (!sanitized.some(s => normalizeStandardId(s) === normalizeStandardId(combinedMatch.id))) {
            sanitized.push(combinedMatch.id);
          }
          i += 2;
          continue;
        }
      }

      // 3. 未被收录的扩展非标规范，保持原样加入
      if (!sanitized.some(s => normalizeStandardId(s) === currentNorm)) {
        sanitized.push(current);
      }
      i++;
    }
    return sanitized.length > 0 ? sanitized : ['GB/T 13296-2023'];
  }, [activeStandard, dynamicStandardsCatalog]);

  // 核心：调用真实后端核验接口 (直出 AuditReport，带多标尺追溯与剪刀差)
  // 核心：全批次异步流式并发核验调度器 (Tier 1 秒级直出 -> Tier 2 增量补丁 -> Tier 3 人机协同)
  const evaluateBatches = useCallback(async (batchesToEval: BatchSpecimen[], forcedStdIds?: string[]) => {
    if (!batchesToEval || batchesToEval.length === 0) return;

    const stdIds = forcedStdIds || selectedStandardIds;

    // 1. 初始化各批次展示状态为 tier1_evaluating，并将旧批次的核验开销归档至 historical 保证单调递增
    setBatchPresentationMap(prev => {
      const next = { ...prev };
      for (const b of batchesToEval) {
        next[b.batchNo] = {
          batchNo: b.batchNo,
          stage: 'tier1_evaluating',
          pendingProperties: [],
        };
      }
      return next;
    });

    setAuditMetrics(prev => {
      let addDurMs = 0;
      let addIn = 0;
      let addOut = 0;
      const nextBatchRecords = { ...prev.batchRecords };

      for (const b of batchesToEval) {
        const oldRec = nextBatchRecords[b.batchNo];
        if (oldRec) {
          addDurMs += oldRec.durationMs || 0;
          addIn += oldRec.inputTokens || 0;
          addOut += oldRec.outputTokens || 0;
          delete nextBatchRecords[b.batchNo];
        }
      }

      return {
        batchRecords: nextBatchRecords,
        historical: {
          durationMs: prev.historical.durationMs + addDurMs,
          inputTokens: prev.historical.inputTokens + addIn,
          outputTokens: prev.historical.outputTokens + addOut,
        },
      };
    });

    const updateBatchAuditMetrics = (bNo: string, durMs?: number, tokUsage?: any) => {
      if (durMs === undefined && !tokUsage) return;
      setAuditMetrics(prev => ({
        ...prev,
        batchRecords: {
          ...prev.batchRecords,
          [bNo]: {
            durationMs: durMs ?? prev.batchRecords[bNo]?.durationMs ?? 0,
            inputTokens: tokUsage?.promptTokens ?? prev.batchRecords[bNo]?.inputTokens ?? 0,
            outputTokens: tokUsage?.completionTokens ?? prev.batchRecords[bNo]?.outputTokens ?? 0,
          },
        },
      }));
    };

    const includesCurrent = batchesToEval.some(b => b.batchNo === selectedBatchNo);
    if (includesCurrent) {
      setIsEvaluatingBatch(true);
    }

    // 2. 并行调度各个批次独立通过 SSE 流式接口核验 (多批次物理强隔离，thread_id: sessionId::batchNo::RUN-${counter})
    const tasks = batchesToEval.map(async (batch) => {
      // 掐旧启新 (Abort & Replace)：若当前批次已有未完成的活跃流式请求，立即主动掐断，彻底杜绝算力浪费与时序倒挂
      const prevController = batchAbortControllersRef.current[batch.batchNo];
      if (prevController) {
        prevController.abort('SUPERSEDED_BY_NEW_RUN');
      }
      const controller = new AbortController();
      batchAbortControllersRef.current[batch.batchNo] = controller;

      try {
        const runId = nextBatchRunId(batch.batchNo);
        await apiClient.submitAuditStream(
          {
            batchSpecimen: batch,
            standardIds: stdIds.length > 0 ? stdIds : undefined,
            gradeKey: batch.overrideGrade || batch.grade,
            options: {
              sessionId: session.sessionId,
              batchNo: batch.batchNo,
              runId,
            },
          },
          {
            // (a) Tier 1 确定性规则大盘毫秒级直出
            onTier1Ready: (data) => {
              // 版本令牌校验：若收到的不是当前最新 runId 的事件包，直接静默丢弃，杜绝幽灵覆写
              if (data.taskId && !data.taskId.endsWith(`::${runId}`)) return;

              updateBatchAuditMetrics(batch.batchNo, data.durationMs, data.tokenUsage);

              const isReportPass = data.report.summary.overall_status === 'PASS';
              const summaryText = isReportPass
                ? `核心指标核验合格 (共评估 ${data.report.summary.total_rules_evaluated} 项)`
                : `核验未通过 (不合格 ${data.report.summary.fail_count} 项，漏检 ${data.report.summary.missing_count} 项)`;

              setBatchPresentationMap(prev => ({
                ...prev,
                [batch.batchNo]: {
                  ...prev[batch.batchNo],
                  batchNo: batch.batchNo,
                  stage: data.hasPending ? 'tier1_ready' : 'completed',
                  report: data.report,
                  pendingProperties: data.pendingProperties || [],
                  taskId: data.taskId,
                },
              }));

              // 同步持久化写入 Session 数据
              setSession(prev => ({
                ...prev,
                documents: prev.documents.map(d => {
                  if (d.docId !== selectedDocId) return d;
                  return {
                    ...d,
                    batches: d.batches.map(b => {
                      if (b.batchNo !== batch.batchNo) return b;
                      return {
                        ...b,
                        auditReport: data.report,
                        verdict: isReportPass ? 'PASS' : 'FAIL',
                        verdictSummary: summaryText,
                        systemVerdict: isReportPass ? 'PASS' : 'FAIL',
                        systemVerdictSummary: summaryText,
                      };
                    }),
                  };
                }),
              }));

              if (batch.batchNo === selectedBatchNo) {
                setIsEvaluatingBatch(false);
              }
            },

            // (b) Tier 2 LLM 长尾语义消歧增量补丁
            onTier2Patch: (data) => {
              if (data.taskId && !data.taskId.endsWith(`::${runId}`)) return;

              updateBatchAuditMetrics(batch.batchNo, data.durationMs, data.tokenUsage);

              const isReportPass = data.finalReport.summary.overall_status === 'PASS';
              const summaryText = isReportPass
                ? `全项核验合格 (共评估 ${data.finalReport.summary.total_rules_evaluated} 项)`
                : `核验未通过 (不合格 ${data.finalReport.summary.fail_count} 项，漏检 ${data.finalReport.summary.missing_count} 项)`;

              setBatchPresentationMap(prev => ({
                ...prev,
                [batch.batchNo]: {
                  ...prev[batch.batchNo],
                  batchNo: batch.batchNo,
                  stage: 'completed',
                  report: data.finalReport,
                  pendingProperties: [],
                  resolvedProperties: data.resolvedProperties || [],
                  taskId: data.taskId,
                },
              }));

              setSession(prev => ({
                ...prev,
                documents: prev.documents.map(d => {
                  if (d.docId !== selectedDocId) return d;
                  return {
                    ...d,
                    batches: d.batches.map(b => {
                      if (b.batchNo !== batch.batchNo) return b;
                      return {
                        ...b,
                        auditReport: data.finalReport,
                        verdict: isReportPass ? 'PASS' : 'FAIL',
                        verdictSummary: summaryText,
                        systemVerdict: isReportPass ? 'PASS' : 'FAIL',
                        systemVerdictSummary: summaryText,
                      };
                    }),
                  };
                }),
              }));
            },

            // (c) Tier 3 歧义项触发人机协同挂起
            onHitlInterrupt: (data) => {
              if (data.taskId && !data.taskId.endsWith(`::${runId}`)) return;

              updateBatchAuditMetrics(batch.batchNo, data.durationMs, data.tokenUsage);

              setBatchPresentationMap(prev => ({
                ...prev,
                [batch.batchNo]: {
                  ...(prev[batch.batchNo] || { batchNo: batch.batchNo }),
                  stage: 'hitl_pending',
                  hitlContext: data.hitlContext,
                  report: data.partialReport,
                  taskId: data.taskId,
                },
              }));

              // 同步更新当前批次进入 MANUAL_REVIEW 挂起状态，消除状态脱节
              setSession(prev => ({
                ...prev,
                documents: prev.documents.map(d => {
                  if (d.docId !== selectedDocId) return d;
                  return {
                    ...d,
                    batches: d.batches.map(b => {
                      if (b.batchNo !== batch.batchNo) return b;
                      return {
                        ...b,
                        verdict: 'MANUAL_REVIEW',
                        verdictSummary: data.hitlContext.prompt_message || '系统指标存在歧义或条件待核实，须在人机协同抽屉中完成核验',
                        systemVerdict: 'MANUAL_REVIEW',
                        systemVerdictSummary: data.hitlContext.prompt_message,
                        hitlReason: data.hitlContext.reason,
                        auditReport: data.partialReport,
                      };
                    }),
                  };
                }),
              }));

              if (batch.batchNo === selectedBatchNo) {
                setActiveHitlContext(data.hitlContext);
                setIsHitlDrawerOpen(true);
              }
            },

            // (d) 全流程顺利完成
            onComplete: (data) => {
              if (data.taskId && !data.taskId.endsWith(`::${runId}`)) return;

              updateBatchAuditMetrics(batch.batchNo, data.durationMs, data.tokenUsage);

              const isReportPass = data.finalReport.summary.overall_status === 'PASS';
              const summaryText = isReportPass
                ? `全项核验合格 (共评估 ${data.finalReport.summary.total_rules_evaluated} 项)`
                : `核验未通过 (不合格 ${data.finalReport.summary.fail_count} 项，漏检 ${data.finalReport.summary.missing_count} 项)`;

              setBatchPresentationMap(prev => ({
                ...prev,
                [batch.batchNo]: {
                  batchNo: batch.batchNo,
                  stage: 'completed',
                  report: data.finalReport,
                  pendingProperties: [],
                  resolvedProperties: prev[batch.batchNo]?.resolvedProperties || [],
                  taskId: data.taskId,
                },
              }));

              setSession(prev => ({
                ...prev,
                documents: prev.documents.map(d => {
                  if (d.docId !== selectedDocId) return d;
                  return {
                    ...d,
                    batches: d.batches.map(b => {
                      if (b.batchNo !== batch.batchNo) return b;
                      return {
                        ...b,
                        auditReport: data.finalReport,
                        verdict: isReportPass ? 'PASS' : 'FAIL',
                        verdictSummary: summaryText,
                        systemVerdict: isReportPass ? 'PASS' : 'FAIL',
                        systemVerdictSummary: summaryText,
                      };
                    }),
                  };
                }),
              }));
            },

            // (e) 异常报错
            onError: (err) => {
              if (err.taskId && !err.taskId.endsWith(`::${runId}`)) return;
              if (controller.signal.aborted) return; // 主动中止忽略报错

              setBatchPresentationMap(prev => ({
                ...prev,
                [batch.batchNo]: {
                  ...(prev[batch.batchNo] || { batchNo: batch.batchNo }),
                  stage: 'error',
                  error: err.error,
                },
              }));
            },
          },
          controller.signal
        );
      } catch (taskErr) {
        if (controller.signal.aborted) return; // 主动中止忽略捕获
        console.error(`[WaterfallWorkbench] 批次 ${batch.batchNo} 执行流式核验异常:`, taskErr);
        setBatchPresentationMap(prev => ({
          ...prev,
          [batch.batchNo]: {
            ...(prev[batch.batchNo] || { batchNo: batch.batchNo }),
            stage: 'error',
            error: String(taskErr),
          },
        }));
      } finally {
        if (batchAbortControllersRef.current[batch.batchNo] === controller) {
          delete batchAbortControllersRef.current[batch.batchNo];
        }
        if (batch.batchNo === selectedBatchNo) {
          setIsEvaluatingBatch(false);
        }
      }
    });

    await Promise.allSettled(tasks);
  }, [selectedBatchNo, selectedDocId, selectedStandardIds, session.sessionId]);

  // 质检员确认并恢复流转（闭环重算当前批次，严禁覆写质保书原件牌号）
  const handleResolveHitl = async (correction: HumanCorrectionInput) => {
    setIsHitlSubmitting(true);
    const taskId = (selectedBatchNo && batchPresentationMap[selectedBatchNo]?.taskId)
      ? batchPresentationMap[selectedBatchNo]!.taskId!
      : (currentBatch ? `${session.sessionId}::${currentBatch.batchNo}` : '');

    let resumedReport: AuditReport | undefined = undefined;
    if (taskId) {
      try {
        const res = await apiClient.resumeAudit(taskId, correction);
        if (res.success && res.finalReport) {
          resumedReport = res.finalReport;
        }
      } catch (resumeErr) {
        console.warn('[WaterfallWorkbench] 调用 resumeAudit 异常，降级全量核验驱动:', resumeErr);
      }
    }

    const nextOverrideGrade = correction.corrected_grade || currentBatch?.overrideGrade;

    // 1. 若服务端已顺利恢复并产出具备规则评估的有效报告 (比对项数 > 0)
    if (resumedReport && resumedReport.summary && (resumedReport.summary.total_rules_evaluated ?? 0) > 0) {
      const isReportPass = resumedReport.summary.overall_status === 'PASS';
      const summaryText = isReportPass
        ? `全项核验合格 (共评估 ${resumedReport.summary.total_rules_evaluated} 项)`
        : `核验未通过 (不合格 ${resumedReport.summary.fail_count} 项，漏检 ${resumedReport.summary.missing_count} 项)`;

      setSession(prev => ({
        ...prev,
        documents: prev.documents.map(doc => {
          if (doc.docId !== selectedDocId) return doc;
          return {
            ...doc,
            batches: doc.batches.map(b => {
              if (b.batchNo !== selectedBatchNo) return b;
              return {
                ...b,
                grade: b.grade, // 严格保持质保书原件声明牌号不变
                overrideGrade: nextOverrideGrade,
                auditReport: resumedReport,
                verdict: isReportPass ? 'PASS' : 'FAIL',
                verdictSummary: summaryText,
                systemVerdict: isReportPass ? 'PASS' : 'FAIL',
                systemVerdictSummary: summaryText,
                // 核心解耦：HITL 字段纠偏严禁越权篡改整批人工终审！保持未复核 (null)，交由工程师审阅全景矩阵后自主终审
                humanVerdict: null,
                humanVerdictSummary: undefined,
                humanVerifiedAt: undefined,
                hitlFieldCorrection: correction,
                hitlCorrection: correction,
              };
            }),
          };
        }),
      }));

      if (selectedBatchNo) {
        setBatchPresentationMap(prev => ({
          ...prev,
          [selectedBatchNo]: {
            ...(prev[selectedBatchNo] || { batchNo: selectedBatchNo }),
            stage: 'completed',
            report: resumedReport,
            hitlContext: undefined,
            pendingProperties: [],
            hitlFieldCorrection: correction,
            hitlCorrection: correction,
          },
        }));
      }
    } else {
      // 2. 若服务端未直接返回包含规则的报告 (例如牌号消歧恢复后需根据更新后的牌号基准重新执行核验)
      const targetBatch: BatchSpecimen | undefined = currentBatch ? {
        ...currentBatch,
        grade: currentBatch.grade, // 严格保持质保书原件声明牌号不变
        overrideGrade: nextOverrideGrade,
        verdict: 'UNAUDITED',
        auditReport: undefined,
        // 核心解耦：保持批次人工终审为 null (未复核)
        humanVerdict: null,
        humanVerdictSummary: undefined,
        humanVerifiedAt: undefined,
        hitlFieldCorrection: correction,
        hitlCorrection: correction,
      } : undefined;

      if (selectedBatchNo) {
        setBatchPresentationMap(prev => ({
          ...prev,
          [selectedBatchNo]: {
            ...(prev[selectedBatchNo] || { batchNo: selectedBatchNo, stage: 'idle' }),
            hitlFieldCorrection: correction,
            hitlCorrection: correction,
          },
        }));
      }

      setSession(prev => ({
        ...prev,
        documents: prev.documents.map(doc => {
          if (doc.docId !== selectedDocId) return doc;
          return {
            ...doc,
            batches: doc.batches.map(b => {
              if (b.batchNo !== selectedBatchNo) return b;
              return {
                ...b,
                grade: b.grade, // 保持原件牌号不变
                overrideGrade: nextOverrideGrade,
                verdict: 'UNAUDITED',
                auditReport: undefined,
                // 核心解耦：保持批次人工终审为 null (未复核)
                humanVerdict: null,
                humanVerdictSummary: undefined,
                humanVerifiedAt: undefined,
                hitlFieldCorrection: correction,
                hitlCorrection: correction,
              };
            }),
          };
        }),
      }));

      // 立即以最新的 overrideGrade 发起全量合规比对，驱动规则引擎产出全部 16 条比对项
      if (targetBatch) {
        await evaluateBatches([targetBatch], selectedStandardIds);
      }
    }

    setIsHitlSubmitting(false);
    setIsHitlDrawerOpen(false);
  };

  // 步骤 3: 行内采纳推荐属性并恢复核验
  const handleInlineAdoptProperty = useCallback(async (batchNo: string, rawKey: string, resolvedKey: string) => {
    const batchState = batchPresentationMap[batchNo];
    const taskId = batchState?.taskId || `${session.sessionId}::${batchNo}`;

    try {
      showToast(`正在采纳推荐: ${rawKey} → ${resolvedKey}...`, 'info');
      const res = await apiClient.resumeAudit(taskId, {
        corrected_property_keys: {
          [rawKey]: resolvedKey,
        },
      });

      if (res.success && res.finalReport) {
        showToast('条款对齐成功，已完成补充合规核验', 'success');
        setBatchPresentationMap(prev => ({
          ...prev,
          [batchNo]: {
            ...prev[batchNo],
            batchNo,
            stage: 'completed',
            report: res.finalReport,
            pendingProperties: [],
            hitlContext: undefined,
          },
        }));

        setSession(prev => ({
          ...prev,
          documents: prev.documents.map(d => {
            if (d.docId !== selectedDocId) return d;
            return {
              ...d,
              batches: d.batches.map(b => {
                if (b.batchNo !== batchNo) return b;
                const isPass = res.finalReport!.summary.overall_status === 'PASS';
                const summaryText = isPass
                  ? `全项核验合格 (共评估 ${res.finalReport!.summary.total_rules_evaluated} 项)`
                  : `核验未通过 (不合格 ${res.finalReport!.summary.fail_count} 项，漏检 ${res.finalReport!.summary.missing_count} 项)`;
                return {
                  ...b,
                  auditReport: res.finalReport,
                  verdict: isPass ? 'PASS' : 'FAIL',
                  verdictSummary: summaryText,
                  systemVerdict: isPass ? 'PASS' : 'FAIL',
                  systemVerdictSummary: summaryText,
                };
              }),
            };
          }),
        }));
      } else {
        showToast(`核验恢复失败: ${res.error || '未知错误'}`, 'error');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showToast(`提交异常: ${errMsg}`, 'error');
    }
  }, [batchPresentationMap, selectedDocId, session.sessionId]);

  // 步骤 3: 行内快捷采纳推荐项（支持牌号消歧与非标属性对齐双场景）
  const handleInlineAdoptHitl = useCallback(async (batchNo: string, ctx?: HitlInterruptContext) => {
    if (!ctx) return;

    // 1. 牌号消歧场景 (UNKNOWN_GRADE)
    if (ctx.reason === 'UNKNOWN_GRADE') {
      const topGrade = ctx.candidate_grades?.[0]?.id || (ctx.suggestions?.default ? String(ctx.suggestions.default) : '06Cr19Ni10');
      const topCode = ctx.candidate_grades?.[0]?.code || topGrade;

      showToast(`正在采纳推荐牌号: ${topCode}...`, 'info');
      await handleResolveHitl({
        inspector_id: 'QC-Engineer (质检工程师)',
        corrected_grade: topGrade,
        waiver_notes: '质检工程师在全景比对卡片中一键采纳系统推荐国家标准牌号',
      });
      showToast(`牌号修正成功 [${topCode}]，已完成全项标准核验`, 'success');
      return;
    }

    // 2. 非标属性对齐场景 (PROPERTY_AMBIGUITY 等)
    if (ctx.suggestions && Object.keys(ctx.suggestions).length > 0) {
      const entries = Object.entries(ctx.suggestions);
      if (entries.length > 0 && entries[0]) {
        const [rawKey, targetKey] = entries[0];
        await handleInlineAdoptProperty(batchNo, rawKey, String(targetKey));
      }
    }
  }, [handleInlineAdoptProperty, handleResolveHitl]);

  // 单批次核验封装（兼容已有单批次调用）
  const evaluateBatch = useCallback(async (batchToEval?: BatchSpecimen, forcedStdIds?: string[]) => {
    const target = batchToEval || currentBatch;
    if (!target) return;
    await evaluateBatches([target], forcedStdIds);
  }, [currentBatch, evaluateBatches]);

  // 步骤 3 自动触发全批次异步并行核验（带历史台账防重算保护与全批次并发调度）
  useEffect(() => {
    if (currentStep !== 2 || !currentDoc || currentDoc.batches.length === 0) return;

    // 筛选当前文档中未生成 auditReport 或处于 UNAUDITED 的所有批次
    const pendingBatches = currentDoc.batches.filter(b => !b.auditReport || b.verdict === 'UNAUDITED');
    if (pendingBatches.length === 0) return;

    // 防抖与去重锁：同一批次集合在未完成时不重复发起
    const batchSignature = `${selectedDocId}:${pendingBatches.map(b => b.batchNo).sort().join(',')}`;
    if (batchEvaluatingKeyRef.current === batchSignature) return;
    batchEvaluatingKeyRef.current = batchSignature;

    // 全批次异步并行核验
    evaluateBatches(pendingBatches);
  }, [currentStep, selectedDocId, currentDoc, evaluateBatches]);

  // 切换/勾选标准并联动触发重新核验（当前文档全批次并行重算）
  const handleToggleStandard = (stdId: string) => {
    let newSelected: string[];
    const targetNorm = normalizeStandardId(stdId);
    const existingIndex = selectedStandardIds.findIndex(s => normalizeStandardId(s) === targetNorm);

    if (existingIndex >= 0) {
      if (selectedStandardIds.length <= 1) {
        return; // 至少保留一个标准
      }
      newSelected = selectedStandardIds.filter((_, idx) => idx !== existingIndex);
    } else {
      newSelected = [...selectedStandardIds, stdId];
    }

    const newStandardStr = newSelected.join('、');

    // 将新标准同步更新至当前文档的所有批次，若与原件声明标准指纹等价则主动还原 overrideStandard 为 undefined
    setSession(prev => ({
      ...prev,
      documents: prev.documents.map(doc => {
        if (doc.docId === selectedDocId) {
          return {
            ...doc,
            batches: doc.batches.map(b => {
              const isEquiv = areStandardCollectionsEquivalent(newSelected, b.standard);
              return {
                ...b,
                overrideStandard: isEquiv ? undefined : newStandardStr,
                auditReport: undefined,
                verdict: 'UNAUDITED' as const,
              };
            }),
          };
        }
        return doc;
      }),
    }));

    // 彻底释放去重锁，由步骤 3 顶层的自动调度 useEffect 统一侦听并唯一派发 evaluateBatches，杜绝双重调用导致 runId 跳号
    batchEvaluatingKeyRef.current = '';
  };

  // 计算当前文档/批次的 OCR BBox 字典（100% 严格受控于解析生命周期，纯动态消费接口/缓存返回的坐标）
  const bboxes: FieldBBox[] = useMemo(() => {
    if (!currentDoc || currentDoc.ocrStatus !== 'DONE') {
      return [];
    }
    const parsedBboxes = docBboxesMap[currentDoc.docId];
    if (parsedBboxes && parsedBboxes.length > 0) {
      return parsedBboxes;
    }
    return [];
  }, [currentDoc, docBboxesMap]);

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

  // 精确计算并在 PDF 滚动容器中按需居中目标 BBox
  // force: false 时仅当目标不在当前视口内或被遮挡时才触发移动；若已完全可见则只高亮不移动视口
  const centerBBoxInContainer = useCallback((box: FieldBBox, force = false) => {
    const container = pdfScrollContainerRef.current;
    if (!container) return;

    const pageElem = document.getElementById(`pdf-page-${box.page}`) || document.getElementById('pdf-page-1');
    if (!pageElem) return;

    const containerRect = container.getBoundingClientRect();
    const pageRect = pageElem.getBoundingClientRect();

    // 计算 BBox 4 个边界在当前视口 (Viewport) 中的像素坐标
    const boxLeft = pageRect.left + (box.x / 100) * pageRect.width;
    const boxRight = pageRect.left + ((box.x + box.w) / 100) * pageRect.width;
    const boxTop = pageRect.top + (box.y / 100) * pageRect.height;
    const boxBottom = pageRect.top + ((box.y + box.h) / 100) * pageRect.height;

    // 判断 BBox 是否已经完整处于容器可视区域内（上下左右各预留 24px 呼吸缓冲区，防止边缘紧贴或被遮挡）
    const PADDING = 24;
    const isFullyVisible = (
      boxTop >= containerRect.top + PADDING &&
      boxBottom <= containerRect.bottom - PADDING &&
      boxLeft >= containerRect.left + PADDING &&
      boxRight <= containerRect.right - PADDING
    );

    // 若已经完全在当前视口内可见且非强制居中，则直接返回，不触发视口移动
    if (isFullyVisible && !force) {
      return;
    }

    // 计算 BBox 中心点在视口中的当前屏幕像素位置
    const boxCenterXInViewport = (boxLeft + boxRight) / 2;
    const boxCenterYInViewport = (boxTop + boxBottom) / 2;

    // 计算容器视口的中心屏幕像素位置
    const containerCenterXInViewport = containerRect.left + (containerRect.width / 2);
    const containerCenterYInViewport = containerRect.top + (containerRect.height / 2);

    // 将 BBox 移动至视口中心所需的精确滚动目标
    const targetScrollTop = container.scrollTop + (boxCenterYInViewport - containerCenterYInViewport);
    const targetScrollLeft = container.scrollLeft + (boxCenterXInViewport - containerCenterXInViewport);

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      left: Math.max(0, targetScrollLeft),
      behavior: 'smooth',
    });
  }, []);

  // 1. 悬浮/聚焦右侧字段：仅滚动左侧 PDF 视窗，当已在视口中则仅高亮不移动视口
  const scrollToLeftBBox = useCallback((fieldId: string | null) => {
    // 若未启用定位聚焦实验功能，完全不触发高亮、移动与放大
    if (!isBboxFocusEnabled) return;

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

    const box = bboxes.find(b => b.id === fieldId);
    if (!box) return;

    setCurrentDocPage(box.page);
    centerBBoxInContainer(box, false); // 仅在不在视口或被遮挡时移动

    // 启动 1000ms 防晕倒计时：在同一字段停留满 1 秒后激活 150% 聚焦放大
    magnifyTimerRef.current = setTimeout(() => {
      setMagnifiedFieldId(fieldId);
    }, 1000);
  }, [bboxes, centerBBoxInContainer, isBboxFocusEnabled]);

  // 别名保留以兼容现有调用
  const handleFieldHover = scrollToLeftBBox;

  // 2. 悬浮左侧 BBox：仅滚动右侧解析数据视窗，绝不触发外部整页或左侧视窗滚动
  const scrollToRightField = useCallback((fieldId: string) => {
    // 若未启用定位聚焦实验功能，完全不触发高亮、移动与放大
    if (!isBboxFocusEnabled) return;

    // 立即清空上一个防晕倒计时
    if (magnifyTimerRef.current) {
      clearTimeout(magnifyTimerRef.current);
      magnifyTimerRef.current = null;
    }

    setHighlightedFieldId(fieldId);

    const box = bboxes.find(b => b.id === fieldId);
    if (box) {
      setCurrentDocPage(box.page);
      centerBBoxInContainer(box, false); // 仅在不在视口或被遮挡时移动
    }

    // 左侧直接 hover BBox 停留满 1000ms 同样激活 150% 聚焦放大
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
  }, [bboxes, centerBBoxInContainer]);

  // 当聚焦放大字段激活或变动时，仅在目标 BBox 处于不可见或边缘遮挡状态时居中
  useEffect(() => {
    if (!magnifiedFieldId) return;
    const box = bboxes.find(b => b.id === magnifiedFieldId);
    if (!box) return;

    centerBBoxInContainer(box, false);

    const timer1 = setTimeout(() => {
      centerBBoxInContainer(box, false);
    }, 100);
    const timer2 = setTimeout(() => {
      centerBBoxInContainer(box, false);
    }, 260);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [magnifiedFieldId, bboxes, centerBBoxInContainer]);

  // 3. 左侧视窗工具栏翻页控制器：仅滚动左侧 PDF 视窗
  const goToPage = (page: number) => {
    const maxPages = (currentDoc?.pages || currentDoc?.samplePages || []).length || currentDoc?.pageCount || 1;
    const target = Math.max(1, Math.min(maxPages, page));
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

  // 截图导出加载状态与上拉菜单状态
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isScreenshotMenuOpen, setIsScreenshotMenuOpen] = useState<boolean>(false);
  const screenshotMenuRef = useRef<HTMLDivElement>(null);

  // 计算当前会话所有文档包含的总批次数
  const totalBatchesCount = useMemo(() => {
    return session.documents.reduce((acc, d) => acc + (d.batches?.length || 0), 0);
  }, [session.documents]);

  // 监听点击外部或按下 Escape 键自动收起截图上拉菜单
  useEffect(() => {
    if (!isScreenshotMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (screenshotMenuRef.current && !screenshotMenuRef.current.contains(e.target as Node)) {
        setIsScreenshotMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsScreenshotMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isScreenshotMenuOpen]);

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

  // 1. 保存当前作业会话 (Session) 的全部系统和人工检验结果至服务端正式台账 JSON 仓库
  const handleSaveSessionResults = useCallback(async (silent: boolean = false) => {
    try {
      // 提取并更新当前 Session 数据（深拷贝并剔除庞大的客户端 Base64 图片，仅保留服务端资源引用）
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
        if (!silent) {
          showToast(`检验结果已成功归档至服务端台账 (${sessionToSave.sessionId})`, 'success');
        }
      } else {
        if (!silent) {
          showToast(`保存台账失败: ${data.error || '服务端响应异常'}`, 'error');
        }
      }
    } catch (err: any) {
      if (!silent) {
        showToast(`保存台账请求异常: ${err.message || err}`, 'error');
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
  const capturePanelToPng = useCallback(async (batchNo: string, docName?: string): Promise<boolean> => {
    const targetElement = document.getElementById('step-3-workbench-panel');
    if (!targetElement) return false;

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
    const cleanDocPrefix = docName ? `${docName.replace(/\.[^/.]+$/, '')}_` : '';
    downloadAnchor.download = `NormScale_合规比对结果_${cleanDocPrefix}${batchNo || 'REPORT'}_${dateStr}.png`;
    downloadAnchor.href = pngData;
    downloadAnchor.click();
    return true;
  }, []);

  // 选项 1：保存当前页面截图（仅当前选中的单批次）
  const handleSaveCurrentBatchScreenshot = useCallback(async () => {
    const targetElement = document.getElementById('step-3-workbench-panel');
    if (!targetElement) {
      showToast('无法定位步骤 3 结果视窗', 'error');
      return;
    }

    setIsCapturing(true);
    setIsScreenshotMenuOpen(false);

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
      if (scrollContainer && originalScrollTop > 0) {
        scrollContainer.scrollTop = originalScrollTop;
      }
      setIsCapturing(false);
    }
  }, [currentBatch?.batchNo, currentDoc?.filename, capturePanelToPng, showToast]);

  // 选项 2：保存当前文档所有批次截图（顺序切换各批次并下载）
  const handleSaveCurrentDocAllBatchesScreenshot = useCallback(async () => {
    if (!currentDoc || !currentDoc.batches || currentDoc.batches.length === 0) {
      showToast('当前文档暂无可导出的检验批次', 'info');
      return;
    }

    const targetElement = document.getElementById('step-3-workbench-panel');
    if (!targetElement) {
      showToast('无法定位步骤 3 结果视窗', 'error');
      return;
    }

    setIsCapturing(true);
    setIsScreenshotMenuOpen(false);

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
        // 等待 React 渲染 DOM
        await new Promise(resolve => setTimeout(resolve, 250));
        await new Promise(resolve => requestAnimationFrame(resolve));
        await capturePanelToPng(batch.batchNo, currentDoc.filename);
        // 下载间隔防限流
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      showToast(`当前文档全部 ${batches.length} 个批次截图导出完成`, 'success');
    } catch (err) {
      console.error('Batch screenshots export failed:', err);
      showToast('批量截图生成过程中断，请重试', 'error');
    } finally {
      setSelectedBatchNo(originalBatchNo);
      if (scrollContainer && originalScrollTop > 0) {
        scrollContainer.scrollTop = originalScrollTop;
      }
      setIsCapturing(false);
    }
  }, [currentDoc, selectedBatchNo, capturePanelToPng, showToast]);

  // 选项 3：保存当前会话所有批次截图（遍历所有文档与批次）
  const handleSaveSessionAllBatchesScreenshot = useCallback(async () => {
    const allBatchesList: Array<{ docId: string; docName: string; batchNo: string }> = [];
    session.documents.forEach(d => {
      (d.batches || []).forEach(b => {
        allBatchesList.push({
          docId: d.docId,
          docName: d.filename || d.docId,
          batchNo: b.batchNo,
        });
      });
    });

    if (allBatchesList.length === 0) {
      showToast('当前会话暂无可导出的检验批次', 'info');
      return;
    }

    const targetElement = document.getElementById('step-3-workbench-panel');
    if (!targetElement) {
      showToast('无法定位步骤 3 结果视窗', 'error');
      return;
    }

    setIsCapturing(true);
    setIsScreenshotMenuOpen(false);

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
        // 跨文档切换预留稍微充足的重渲染时间
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
      if (scrollContainer && originalScrollTop > 0) {
        scrollContainer.scrollTop = originalScrollTop;
      }
      setIsCapturing(false);
    }
  }, [session.documents, selectedDocId, selectedBatchNo, capturePanelToPng, showToast]);

  const goToStep = (stepIdx: number) => {
    if (stepIdx > 0 && (!session.documents || session.documents.length === 0)) {
      showToast('请先在步骤 1 上传或选择待检验文档', 'info');
      return;
    }
    if (stepIdx >= 0 && stepIdx <= 2) {
      setCurrentStep(stepIdx);
    }
  };

  // 3. 开启新任务：自动归档当前 Session 结果并原子彻底重置所有状态返回步骤 1
  const handleStartNewTask = useCallback(() => {
    // 自动静默保存当前作业会话至服务端台账
    handleSaveSessionResults(true);

    // 原子清空所有队列、上传文件与会话状态
    const freshSession = createEmptySession();
    setSession(freshSession);
    setQueuedDocs([]);
    setUploadedFilesMap({});
    setUploadedFileUrls({});
    setDocBboxesMap({});
    setSelectedDocId('');
    setSelectedBatchNo('');
    batchRunCountersRef.current = {};
    Object.values(batchAbortControllersRef.current).forEach(c => c.abort('NEW_TASK_STARTED'));
    batchAbortControllersRef.current = {};
    setAuditMetrics({
      batchRecords: {},
      historical: { durationMs: 0, inputTokens: 0, outputTokens: 0 },
    });

    // 自动刷新服务端最新的历史已缓存文档列表
    refreshCachedDocs();

    // 重置步骤并返回步骤 1
    goToStep(0);
    showToast('已自动归档当前检验结果，已为您开启新任务', 'success');
  }, [handleSaveSessionResults, refreshCachedDocs, showToast]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden relative">
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
                accept=".pdf,.png,.jpg,.jpeg,.bmp"
                className="hidden"
              />

              {/* 三栏分栏：左侧质保书上传区 + 中间待处理文档队列 + 右侧技术协议上传 (待实施) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">

                {/* 1. 左侧：质保书上传区（压缩后宽度，支持多文件真实拖拽与选取） */}
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
                  className={`lg:col-span-4 xl:col-span-5 bg-surface-container-lowest dark:bg-surface-dark border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all min-h-[300px] shadow-xs group ${isDraggingOver
                    ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                    : 'border-outline-variant/60 dark:border-border-dark hover:border-primary dark:hover:border-primary-fixed-dim'
                    }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant group-hover:text-primary group-hover:bg-primary/10 flex items-center justify-center transition-all mb-3">
                    <span className="material-symbols-outlined text-2xl">
                      cloud_upload
                    </span>
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-on-surface dark:text-surface-bright mb-1">
                    拖拽质保书到此处，或点击选取
                  </h3>
                  <p className="text-[11px] text-on-surface-variant dark:text-outline-variant leading-relaxed max-w-[260px]">
                    自动秒级检索缓存与存证，支持多份 PDF 及扫描件
                  </p>
                </div>

                {/* 2. 中间：待处理文档队列 */}
                <div className="lg:col-span-5 xl:col-span-4 bg-surface-container-lowest/60 dark:bg-surface-dark/60 border border-outline-variant/60 dark:border-border-dark rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[300px]">
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
                          const isSelected = selectedDocId === doc.id || selectedSampleId === doc.id;
                          const isUploading = doc.status === '上传中';
                          return (
                            <div
                              key={doc.id}
                              onClick={() => {
                                setSelectedDocId(doc.id);
                                const matchedDoc = session.documents.find(d => d.docId === doc.id);
                                if (matchedDoc && matchedDoc.batches[0]) {
                                  setSelectedBatchNo(matchedDoc.batches[0].batchNo);
                                }
                                onSelectSample?.(doc.id);
                              }}
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

                              <span className=" text-xs font-bold text-on-surface dark:text-surface-bright line-clamp-2 max-w-[130px] break-all leading-tight my-1">
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

                {/* 3. 右侧：技术协议上传 (待实施入口，单会话限定 1 份 PDF，暂不接通后端) */}
                <div className="lg:col-span-3 xl:col-span-3 bg-surface-container-lowest/60 dark:bg-surface-dark/60 border border-outline-variant/60 dark:border-border-dark rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[300px]">
                  {/* 隐藏式协议文件 input */}
                  <input
                    type="file"
                    ref={agreementFileInputRef}
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        handleSelectAgreementFile(e.target.files[0]);
                        e.target.value = '';
                      }
                    }}
                    accept=".pdf,application/pdf"
                    className="hidden"
                  />

                  <div>
                    {/* 顶部标题栏与待实施徽标 */}
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-purple-600 dark:text-purple-400 text-base">
                          contract
                        </span>
                        <h2 className="text-xs font-bold text-on-surface dark:text-surface-bright">
                          技术协议上传
                        </h2>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-200 border border-purple-300 dark:border-purple-700 shadow-2xs">
                        待实施
                      </span>
                    </div>

                    {/* 未上传状态：专属虚线卡片 */}
                    {!uploadedAgreementFile ? (
                      <div
                        onClick={() => agreementFileInputRef.current?.click()}
                        onDragOver={e => {
                          e.preventDefault();
                          setIsAgreementDraggingOver(true);
                        }}
                        onDragLeave={() => setIsAgreementDraggingOver(false)}
                        onDrop={e => {
                          e.preventDefault();
                          setIsAgreementDraggingOver(false);
                          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                            handleSelectAgreementFile(e.dataTransfer.files[0]);
                          }
                        }}
                        className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all min-h-[170px] group ${isAgreementDraggingOver
                          ? 'border-purple-500 ring-2 ring-purple-400/30 bg-purple-50/20'
                          : 'border-outline-variant/60 dark:border-border-dark hover:border-purple-500 bg-surface-container-lowest dark:bg-surface-dark'
                          }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/60 flex items-center justify-center transition-all mb-2">
                          <span className="material-symbols-outlined text-2xl">
                            description
                          </span>
                        </div>
                        <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright mb-1">
                          选择或拖拽订货技术协议
                        </h3>
                        <p className="text-[11px] text-on-surface-variant dark:text-outline-variant leading-relaxed">
                          限定单份 PDF 文档，用于定义买方专属加严指标
                        </p>
                        {agreementUploadError && (
                          <div className="mt-2 text-[11px] text-red-600 dark:text-red-400 font-semibold">
                            {agreementUploadError}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* 已选文件状态：协议卡片展示与待实施提示 */
                      <div className="p-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/20 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-xl fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                                picture_as_pdf
                              </span>
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-bold text-on-surface dark:text-surface-bright truncate max-w-[150px]" title={uploadedAgreementFile.name}>
                                {uploadedAgreementFile.name}
                              </h4>
                              <span className="text-[10px] text-on-surface-variant dark:text-outline-variant">
                                {(uploadedAgreementFile.size / 1024).toFixed(1)} KB
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setUploadedAgreementFile(null);
                              setAgreementUploadError(null);
                            }}
                            title="移除该协议"
                            className="w-5 h-5 rounded-full flex items-center justify-center text-on-surface-variant hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors shrink-0"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        </div>

                        {/* 待实施提示 */}
                        <div className="p-2 rounded-lg bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/40 dark:border-border-dark space-y-1">
                          <div className="flex items-center gap-1.5 text-[11px] text-purple-700 dark:text-purple-300 font-bold">
                            <span className="material-symbols-outlined text-[14px]">schedule</span>
                            <span>功能待实施 · 暂未接入后端</span>
                          </div>
                          <p className="text-[10px] text-on-surface-variant dark:text-outline-variant leading-relaxed">
                            协议已暂存于当前会话。比对引擎已就绪，后端解析端点演进中。
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 底部信息标注 */}
                  <div className="text-[10px] text-on-surface-variant dark:text-outline-variant pt-2 border-t border-outline-variant/30 dark:border-border-dark flex items-center justify-between mt-3">
                    <span>限 1 份</span>
                    <span>限定 PDF</span>
                  </div>
                </div>
              </div>

              {/* 1. 历史已缓存文档栏 */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-on-surface-variant text-base">
                      description
                    </span>
                    <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center gap-2">
                      <span>历史已缓存文档</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-surface-container-high dark:bg-surface-dark-high text-[11px]  text-on-surface-variant font-medium">
                        {cachedDocs.length}
                      </span>
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={refreshCachedDocs}
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
                      key={item.id || item.md5 || idx}
                      onClick={() => handleRestoreFromCache(item)}
                      className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-3 shadow-xs flex items-center gap-3 cursor-pointer hover:border-primary transition-all group relative"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-xl fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                          picture_as_pdf
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 pr-1">
                        <span className=" text-xs font-bold text-on-surface dark:text-surface-bright block truncate" title={item.filename}>
                          {item.filename}
                        </span>
                        <span className="text-[10px] text-on-surface-variant dark:text-outline-variant block mt-0.5">
                          {item.date} • {item.size}
                        </span>
                      </div>
                      <button
                        type="button"
                        title="删除该条缓存"
                        onClick={(e) => handleDeleteCachedDoc(item, e)}
                        className="w-7 h-7 rounded-lg text-on-surface-variant hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center transition-colors shrink-0 opacity-80 hover:opacity-100"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. 分层核验场景专测矩阵 (独立测试资产归档：可通过 NEXT_PUBLIC_ENABLE_TEST_FIXTURES=false 随时卸载) */}
              {process.env.NEXT_PUBLIC_ENABLE_TEST_FIXTURES !== 'false' && scenarioSamples.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-outline-variant/30 dark:border-border-dark">
                  <div
                    onClick={() => setIsScenariosExpanded(prev => !prev)}
                    className="flex justify-between items-center cursor-pointer select-none group py-0.5 hover:opacity-90 transition-opacity"
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-base">
                        fact_check
                      </span>
                      <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center gap-2">
                        <span>典型场景测试用例</span>
                        <span className="px-1.5 py-0.2 rounded-full bg-primary/10 text-primary dark:text-primary-fixed-dim text-[11px] font-medium">
                          {scenarioSamples.length} 个场景
                        </span>
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsScenariosExpanded(prev => !prev);
                      }}
                      className="flex items-center gap-1 text-xs font-medium text-on-surface-variant hover:text-primary dark:hover:text-primary-fixed-dim transition-colors px-2 py-1 rounded-lg hover:bg-surface-container-high dark:hover:bg-surface-dark-high cursor-pointer"
                    >
                      <span>{isScenariosExpanded ? '收起' : '展开'}</span>
                      <span className="material-symbols-outlined text-base transition-transform duration-200">
                        {isScenariosExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                  </div>

                  {/* 4 栏卡片网格 (受控折叠展开，默认折叠) */}
                  {isScenariosExpanded && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
                      {scenarioSamples.map((sc, idx) => {
                        const isPass = sc.expected_outcome === 'PASS';
                        const isFail = sc.expected_outcome === 'FAIL';
                        const isHitl = sc.expected_outcome === 'AWAITING_HUMAN_REVIEW';
                        const badgeTheme = isPass
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                          : isFail
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                            : isHitl
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                              : 'bg-surface-container-high text-on-surface-variant';

                        return (
                          <div
                            key={sc.id || idx}
                            className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-3.5 shadow-xs flex flex-col justify-between hover:border-primary transition-all group relative"
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeTheme}`}>
                                  {sc.tier_flow || (isPass ? 'PASS 通过' : isFail ? 'FAIL 否定' : 'HITL 挂起')}
                                </span>
                                <span className="text-[10px] text-on-surface-variant dark:text-outline-variant">
                                  {sc.declared_grade}
                                </span>
                              </div>

                              <div>
                                <h4 className="text-xs font-bold text-on-surface dark:text-surface-bright line-clamp-1 group-hover:text-primary transition-colors" title={sc.title}>
                                  {sc.title}
                                </h4>
                                <p className="text-[11px] text-on-surface-variant dark:text-outline-variant leading-relaxed line-clamp-2 mt-1" title={sc.description}>
                                  {sc.description}
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-1 pt-1">
                                {sc.tags?.map((tag, tIdx) => (
                                  <span
                                    key={tIdx}
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant dark:text-outline-variant"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="pt-3 mt-2 border-t border-outline-variant/30 dark:border-border-dark flex items-center justify-between gap-2">
                              {sc.download_url && (
                                <a
                                  href={sc.download_url}
                                  download={sc.filename || `${sc.id}.pdf`}
                                  className="text-[11px] text-on-surface-variant hover:text-primary dark:hover:text-primary-fixed-dim font-medium flex items-center gap-1 transition-colors"
                                  title="下载高清矢量 PDF 原件"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <span className="material-symbols-outlined text-[14px]">download</span>
                                  <span>下载原件</span>
                                </a>
                              )}
                              <button
                                type="button"
                                disabled={Boolean(loadingScenarios[sc.id])}
                                onClick={() => handleLoadScenarioFile(sc)}
                                className={`ml-auto px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-xs transition-colors flex items-center gap-1 ${loadingScenarios[sc.id]
                                  ? 'bg-primary/60 text-on-primary cursor-wait'
                                  : 'bg-primary hover:bg-primary-container text-on-primary cursor-pointer'
                                  }`}
                                title="将该测试用例高清矢量 PDF 原件装载入待处理队列"
                              >
                                <span className={`material-symbols-outlined text-[13px] ${loadingScenarios[sc.id] ? 'animate-spin' : ''}`}>
                                  {loadingScenarios[sc.id] ? 'progress_activity' : 'play_circle'}
                                </span>
                                <span>{loadingScenarios[sc.id] ? '装载原件中...' : '一键装载'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>


          {/* ========================================================================= */}
          {/* 步骤 2: 质检工作台 - 核对解析数据 (挂载统一标题与批次选择条) */}
          {/* ========================================================================= */}
          <section className="w-full h-full shrink-0 overflow-hidden p-6 flex flex-col">
            <div className="max-w-[1440px] mx-auto w-full h-full flex flex-col space-y-4 min-h-0">

              {/* 顶部统一标题与两层树状批次选择条 (固定在顶部，设置 z-40 确保下拉菜单永远浮于下方工作区之上) */}
              <div className="shrink-0 relative z-40">
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
                  sessionMetrics={totalCombinedMetrics}
                  isStreamingTerminalExpanded={isStreamingTerminalExpanded}
                  onToggleStreamingTerminal={() => setIsStreamingTerminalExpanded(prev => !prev)}
                  onReparseDocument={() => {
                    batchEvaluatingKeyRef.current = '';
                    if (currentDoc?.batches) {
                      setBatchPresentationMap(prev => {
                        const next = { ...prev };
                        for (const b of currentDoc.batches) {
                          delete next[b.batchNo];
                        }
                        return next;
                      });
                    }
                    reparseDocument(selectedDocId);
                  }}
                  rightExtraAction={
                    isHitl ? (
                      <button
                        type="button"
                        onClick={handleTriggerHitl}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-bold shadow-xs hover:opacity-95 transition-all cursor-pointer ring-2 ring-amber-400/30"
                      >
                        <span className="material-symbols-outlined text-base">emergency_home</span>
                        <span>HITL 打开人工介入处理面板</span>
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

              {/* 45% / 55% 左右分栏：充满剩余高度，设置 relative z-10 严格约束在下方层叠上下文中，杜绝遮挡上方下拉菜单 */}
              {(!currentDoc || !currentBatch) ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-xs">
                  <div className="w-16 h-16 rounded-2xl bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-3xl">folder_open</span>
                  </div>
                  <h3 className="text-sm font-bold text-on-surface dark:text-surface-bright mb-1.5">
                    暂无活动检验文档
                  </h3>
                  <p className="text-xs text-on-surface-variant dark:text-outline-variant max-w-sm mb-6">
                    请先前往步骤 1 上传本地真实质量证明书（PDF / 图片）或从历史缓存中选取。
                  </p>
                  <button
                    type="button"
                    onClick={() => goToStep(0)}
                    className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">arrow_back</span>
                    <span>前往步骤 1 上传文档</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 relative z-10">

                  {/* 左侧 45%：源文档视图与自适应交互式 OCR BBox 高亮图层 (自带独立滚动条) */}
                  <div className="lg:col-span-5 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl flex flex-col overflow-hidden shadow-sheet h-full">
                    {/* PDF 阅读器顶部工具栏 (省略重复文件名标题，全量释放横向空间给功能按钮) */}
                    <div className="h-11 min-h-[44px] max-h-[44px] px-3 bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/40 dark:border-border-dark flex items-center justify-between gap-2 text-xs text-on-surface-variant shrink-0 box-border">
                      {/* 左侧：定位聚焦开关 / 活跃气泡徽章 */}
                      <div className="flex items-center min-w-0 shrink-0">
                        {(() => {
                          const isPageMagnified = isBboxFocusEnabled && !!magnifiedFieldId;
                          const activeFieldBox = (isBboxFocusEnabled && (magnifiedFieldId || highlightedFieldId))
                            ? bboxes.find(b => b.id === (magnifiedFieldId || highlightedFieldId))
                            : null;

                          // 1. 功能启用且气泡处于激活状态时：在原位渲染蓝色气泡徽章覆盖开关
                          if (isBboxFocusEnabled && (isPageMagnified || activeFieldBox)) {
                            return (
                              <div className="h-7 box-border flex items-center gap-1.5 px-2 bg-primary text-on-primary text-[11px] font-bold rounded-lg shadow-sm animate-fade-in truncate max-w-[180px] shrink-0">
                                <span className="material-symbols-outlined text-xs shrink-0">
                                  {isPageMagnified ? 'zoom_in' : 'filter_center_focus'}
                                </span>
                                <span className="truncate">
                                  {isPageMagnified ? '聚焦' : '已定位'}: {activeFieldBox?.label || '当前项'}
                                </span>
                                {isPageMagnified && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleResetMagnify();
                                    }}
                                    className="ml-0.5 px-1 py-0.5 rounded bg-white/20 hover:bg-white/30 text-white text-[10px] font-normal transition-colors cursor-pointer shrink-0"
                                    title="按 ESC 键亦可快速退出放大"
                                  >
                                    退出（ESC）
                                  </button>
                                )}
                              </div>
                            );
                          }

                          // 2. 平时或未激活气泡时：展示紧凑精巧的“定位聚焦”开关
                          return (
                            <label
                              onClick={() => handleToggleBboxFocus(!isBboxFocusEnabled)}
                              className="h-7 box-border flex items-center gap-1.5 px-2 rounded-lg hover:bg-surface-container-high/60 dark:hover:bg-surface-dark-high transition-colors cursor-pointer select-none group shrink-0"
                              title="开启后，鼠标悬浮检验项时在 PDF 上精确定位高亮"
                            >
                              <span className="material-symbols-outlined text-sm text-primary">filter_center_focus</span>
                              <span className={`text-[11px] transition-colors ${isBboxFocusEnabled ? 'text-primary dark:text-primary-fixed-dim font-bold' : 'text-on-surface-variant/80 group-hover:text-on-surface dark:group-hover:text-surface-bright font-medium'}`}>
                                定位聚焦（实验功能）
                              </span>
                              <div
                                role="switch"
                                aria-checked={isBboxFocusEnabled}
                                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${isBboxFocusEnabled ? 'bg-primary' : 'bg-outline-variant/60 dark:bg-zinc-700'}`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${isBboxFocusEnabled ? 'translate-x-3' : 'translate-x-0'}`}
                                />
                              </div>
                            </label>
                          );
                        })()}
                      </div>

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
                            onClick={() => setZoomLevel(150)}
                            className="px-1.5 py-0.5 rounded text-xs font-bold hover:bg-surface-container-high dark:hover:bg-surface-dark-high text-on-surface dark:text-surface-bright transition-colors cursor-pointer"
                            title="点击一键还原为 150%"
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

                        {/* 顺时针旋转 90° 控制按钮 (纠偏扫描件方向) */}
                        <div className="flex items-center">
                          <button
                            type="button"
                            onClick={() => setRotation(prev => (prev + 90) % 360)}
                            className={`h-6 px-1.5 flex items-center gap-1 hover:bg-surface-container-high dark:hover:bg-surface-dark-high rounded transition-colors cursor-pointer ${rotation > 0 ? 'text-primary dark:text-primary-fixed-dim bg-primary/10 font-bold' : 'text-on-surface-variant'
                              }`}
                            title="顺时针旋转 90° (纠正扫描件方向)"
                          >
                            <span className="material-symbols-outlined text-sm">rotate_right</span>
                            {rotation > 0 && (
                              <span className="text-[10px] font-bold">{rotation}°</span>
                            )}
                          </button>
                        </div>

                        {/* 版式切换控制按钮 (自适应 / 强制横版 / 强制竖版) */}
                        <div className="flex items-center">
                          <button
                            type="button"
                            onClick={() => {
                              setPageOrientationOverride(prev => {
                                if (prev === 'auto') return 'landscape';
                                if (prev === 'landscape') return 'portrait';
                                return 'auto';
                              });
                            }}
                            className={`h-6 px-1.5 flex items-center gap-1 hover:bg-surface-container-high dark:hover:bg-surface-dark-high rounded transition-colors cursor-pointer text-xs ${pageOrientationOverride !== 'auto'
                              ? 'text-primary dark:text-primary-fixed-dim bg-primary/10 font-bold'
                              : 'text-on-surface-variant'
                              }`}
                            title={`当前版式: ${pageOrientationOverride === 'auto'
                              ? '自动感知'
                              : pageOrientationOverride === 'landscape'
                                ? '强制横版'
                                : '强制竖版'
                              } (点击切换)`}
                          >
                            <span className="material-symbols-outlined text-sm">
                              {pageOrientationOverride === 'landscape'
                                ? 'stay_current_landscape'
                                : pageOrientationOverride === 'portrait'
                                  ? 'stay_current_portrait'
                                  : 'crop_free'}
                            </span>
                            <span className="text-[10px] font-medium">
                              {pageOrientationOverride === 'auto'
                                ? '自适应'
                                : pageOrientationOverride === 'landscape'
                                  ? '横版'
                                  : '竖版'}
                            </span>
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

                    {/* 源文档视窗：支持真实多页高清切图/PDF栅格化页面纵向连续平铺 */}
                    {(() => {
                      // 优先使用真实提取的 pages，若未持久化但具备文档 md5，自动自愈回补服务端预处理的高清切图 URL
                      const docPages = (currentDoc.pages && currentDoc.pages.length > 0)
                        ? currentDoc.pages
                        : (currentDoc.samplePages && currentDoc.samplePages.length > 0)
                          ? currentDoc.samplePages
                          : (currentDoc.md5
                            ? Array.from({ length: currentDoc.pageCount || 1 }, (_, i) => `/api/documents/preprocess?md5=${currentDoc.md5}&page=${i + 1}`)
                            : []);
                      if (docPages.length > 0) {
                        return (
                          <div
                            ref={pdfScrollContainerRef}
                            onMouseDown={handlePdfMouseDown}
                            className={`flex-1 p-4 overflow-auto custom-scrollbar bg-surface-container/40 dark:bg-surface-dark-low ${isMouseDownDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
                              }`}
                          >
                            <div
                              className="w-full flex flex-col items-center gap-5 py-3 transition-[padding,min-width]"
                              style={{
                                minWidth: (magnifiedFieldId || zoomLevel > 100 || rotation > 0) ? `${Math.max(100, Math.round((zoomLevel / 100) * (magnifiedFieldId ? 160 : 100)))}%` : '100%',
                                padding: magnifiedFieldId ? '16px 32px' : '10px 0px',
                              }}
                            >
                              {docPages.map((pageSrc, pageIdx) => {
                                const pageNum = pageIdx + 1;
                                const pageBBoxes = bboxes.filter(b => b.page === pageNum);

                                // 检查当前页是否包含正处于 1 秒悬浮放大状态的 BBox (仅在启用定位聚焦时生效)
                                const activeMagnifiedBox = (isBboxFocusEnabled && magnifiedFieldId)
                                  ? pageBBoxes.find(b => b.id === magnifiedFieldId)
                                  : null;
                                const isPageMagnified = isBboxFocusEnabled && !!activeMagnifiedBox;

                                const originX = activeMagnifiedBox ? activeMagnifiedBox.x + activeMagnifiedBox.w / 2 : 50;
                                const originY = activeMagnifiedBox ? activeMagnifiedBox.y + activeMagnifiedBox.h / 2 : 50;

                                const MAGNIFY_SCALE = 1.5;

                                // 页面宽高比推算：优先响应用户显式版式覆盖，其次根据图片 naturalWidth/naturalHeight 自动检测
                                const detectedRatio = pageAspectRatios[pageNum];
                                let effectiveRatio: number;
                                if (pageOrientationOverride === 'landscape') {
                                  effectiveRatio = detectedRatio && detectedRatio > 1.05 ? detectedRatio : 1.4142; // 强制横版
                                } else if (pageOrientationOverride === 'portrait') {
                                  effectiveRatio = detectedRatio && detectedRatio < 0.95 ? detectedRatio : 0.7071; // 强制竖版
                                } else {
                                  // auto 模式：优先使用图片检测值；若未检测到但已顺时针旋转 90/270 度，自动切换为横版
                                  effectiveRatio = detectedRatio || (rotation === 90 || rotation === 270 ? 1.4142 : 0.7071);
                                }

                                const isLandscape = effectiveRatio > 1.05;

                                // 动态横向留白与 Fit Width：保留左右各 16px 舒适呼吸留白，确保横版在视口中 100% 完整可见不被截断
                                const usableWidth = Math.max(280, pdfViewportWidth - 32);
                                const baseWidth = isLandscape
                                  ? usableWidth
                                  : Math.min(Math.round(usableWidth * 0.78), 480);
                                const rawPageWidth = Math.round(baseWidth * (zoomLevel / 100));
                                const rawPageHeight = Math.round(rawPageWidth / effectiveRatio);

                                const isRotated90or270 = rotation === 90 || rotation === 270;
                                // 视觉外层占位宽高：若顺时针旋转了 90° 或 270°，外层容器宽高相应调换
                                const visualWidth = isRotated90or270 ? rawPageHeight : rawPageWidth;
                                const visualHeight = isRotated90or270 ? rawPageWidth : rawPageHeight;

                                const extraHeight = (MAGNIFY_SCALE - 1) * visualHeight;
                                const extraWidth = (MAGNIFY_SCALE - 1) * visualWidth;

                                const topMargin = isPageMagnified ? Math.round((originY / 100) * extraHeight) : 0;
                                const bottomMargin = isPageMagnified ? Math.round(((100 - originY) / 100) * extraHeight) : 0;
                                const leftMargin = isPageMagnified ? Math.round((originX / 100) * extraWidth) : 0;
                                const rightMargin = isPageMagnified ? Math.round(((100 - originX) / 100) * extraWidth) : 0;

                                return (
                                  <div
                                    key={pageNum}
                                    className="relative flex items-center justify-center transition-[margin] duration-250 ease-out"
                                    style={{
                                      marginTop: isPageMagnified ? `${topMargin + 8}px` : '0px',
                                      marginBottom: isPageMagnified ? `${bottomMargin + 8}px` : '0px',
                                      marginLeft: isPageMagnified ? `${leftMargin + 8}px` : '0px',
                                      marginRight: isPageMagnified ? `${rightMargin + 8}px` : '0px',
                                    }}
                                  >
                                    <div
                                      id={`pdf-page-${pageNum}`}
                                      className={`relative bg-white dark:bg-zinc-900 rounded-sm border border-outline-variant/40 shrink-0 ${isPageMagnified ? 'z-30 shadow-2xl ring-2 ring-primary/60' : 'shadow-md'
                                        }`}
                                      style={{
                                        width: `${visualWidth}px`,
                                        height: `${visualHeight}px`,
                                        position: 'relative',
                                        overflow: 'visible',
                                        transition: 'box-shadow 250ms ease-out, width 150ms ease-out, height 150ms ease-out',
                                      }}
                                    >
                                      {/* 内层可旋转放缩画布容器：包含高清底图与 BBox 图层，旋转放缩时两者严格同步 */}
                                      <div
                                        className="absolute"
                                        style={{
                                          width: `${rawPageWidth}px`,
                                          height: `${rawPageHeight}px`,
                                          left: '50%',
                                          top: '50%',
                                          transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${isPageMagnified ? MAGNIFY_SCALE : 1})`,
                                          transformOrigin: isPageMagnified && !isRotated90or270 ? `${originX}% ${originY}%` : 'center center',
                                          transition: 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)',
                                        }}
                                      >
                                        {/* 页码与版式徽章 */}
                                        <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/65 text-white text-[11px] rounded backdrop-blur-xs z-10 pointer-events-none shadow-xs">
                                          第 {pageNum} / {docPages.length} 页 {isLandscape ? '· 横版' : ''}
                                        </div>

                                        {/* 真实高清页面底图：自然宽高比精准贴合容器，彻底消灭空白与错位 */}
                                        <img
                                          ref={(el) => {
                                            if (el && el.complete && el.naturalWidth && el.naturalHeight) {
                                              const ratio = Number((el.naturalWidth / el.naturalHeight).toFixed(4));
                                              if (pageAspectRatios[pageNum] !== ratio) {
                                                setPageAspectRatios(prev => (prev[pageNum] === ratio ? prev : { ...prev, [pageNum]: ratio }));
                                              }
                                            }
                                          }}
                                          src={pageSrc}
                                          alt={`第 ${pageNum} 页`}
                                          onLoad={(e) => {
                                            const img = e.currentTarget;
                                            if (img.naturalWidth && img.naturalHeight) {
                                              const ratio = Number((img.naturalWidth / img.naturalHeight).toFixed(4));
                                              setPageAspectRatios(prev => (prev[pageNum] === ratio ? prev : { ...prev, [pageNum]: ratio }));
                                            }
                                          }}
                                          className="w-full h-full object-fill block select-none pointer-events-none"
                                          loading="eager"
                                        />

                                        {/* 动态自适应百分比 BBox 标注框层 (单实线、高透光、零遮挡，仅在启用定位聚焦时生效) */}
                                        {isBboxFocusEnabled && pageBBoxes.map((box) => {
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
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      // 若尚未栅格化完成或环境不支持栅格化，使用原生原件高保真画布回退 (绝对不卡死)
                      const fallbackBlobUrl = uploadedFileUrls[currentDoc.docId];
                      if (fallbackBlobUrl) {
                        const uploadedFile = uploadedFilesMap[currentDoc.docId];
                        const isImage = uploadedFile ? uploadedFile.type.includes('image') : false;
                        const activeMagnifiedBox = magnifiedFieldId
                          ? bboxes.find(b => b.id === magnifiedFieldId)
                          : null;
                        const isPageMagnified = !!activeMagnifiedBox;
                        const originX = activeMagnifiedBox ? activeMagnifiedBox.x + activeMagnifiedBox.w / 2 : 50;
                        const originY = activeMagnifiedBox ? activeMagnifiedBox.y + activeMagnifiedBox.h / 2 : 50;
                        const MAGNIFY_SCALE = 1.5;

                        const detectedRatio = pageAspectRatios[1];
                        let effectiveRatio: number;
                        if (pageOrientationOverride === 'landscape') {
                          effectiveRatio = detectedRatio && detectedRatio > 1.05 ? detectedRatio : 1.4142;
                        } else if (pageOrientationOverride === 'portrait') {
                          effectiveRatio = detectedRatio && detectedRatio < 0.95 ? detectedRatio : 0.7071;
                        } else {
                          effectiveRatio = detectedRatio || (rotation === 90 || rotation === 270 ? 1.4142 : 0.7071);
                        }
                        const isLandscape = effectiveRatio > 1.05;
                        const usableWidth = Math.max(280, pdfViewportWidth - 32);
                        const baseWidth = isLandscape
                          ? usableWidth
                          : Math.min(Math.round(usableWidth * 0.78), 480);
                        const rawPageWidth = Math.round(baseWidth * (zoomLevel / 100));
                        const rawPageHeight = Math.round(rawPageWidth / effectiveRatio);

                        const isRotated90or270 = rotation === 90 || rotation === 270;
                        const visualWidth = isRotated90or270 ? rawPageHeight : rawPageWidth;
                        const visualHeight = isRotated90or270 ? rawPageWidth : rawPageHeight;

                        return (
                          <div
                            ref={pdfScrollContainerRef}
                            onMouseDown={handlePdfMouseDown}
                            className={`flex-1 p-4 overflow-auto custom-scrollbar bg-surface-container/40 dark:bg-surface-dark-low ${isMouseDownDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
                              }`}
                          >
                            <div
                              className="w-full flex flex-col items-center gap-5 py-3 transition-[padding,min-width]"
                              style={{
                                minWidth: (magnifiedFieldId || zoomLevel > 100 || rotation > 0) ? `${Math.max(100, Math.round((zoomLevel / 100) * (magnifiedFieldId ? 160 : 100)))}%` : '100%',
                                padding: magnifiedFieldId ? '16px 32px' : '10px 0px',
                              }}
                            >
                              <div
                                id="pdf-page-1"
                                className={`relative bg-white dark:bg-zinc-900 rounded-sm border border-outline-variant/40 shrink-0 ${isPageMagnified ? 'z-30 shadow-2xl ring-2 ring-primary/60' : 'shadow-md'
                                  }`}
                                style={{
                                  width: `${visualWidth}px`,
                                  height: `${visualHeight}px`,
                                  position: 'relative',
                                  overflow: 'visible',
                                  transition: 'box-shadow 250ms ease-out, width 150ms ease-out, height 150ms ease-out',
                                }}
                              >
                                <div
                                  className="absolute"
                                  style={{
                                    width: `${rawPageWidth}px`,
                                    height: `${rawPageHeight}px`,
                                    left: '50%',
                                    top: '50%',
                                    transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${isPageMagnified ? MAGNIFY_SCALE : 1})`,
                                    transformOrigin: isPageMagnified && !isRotated90or270 ? `${originX}% ${originY}%` : 'center center',
                                    transition: 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)',
                                  }}
                                >
                                  {isImage ? (
                                    <img
                                      src={fallbackBlobUrl}
                                      alt={currentDoc.filename}
                                      onLoad={(e) => {
                                        const img = e.currentTarget;
                                        if (img.naturalWidth && img.naturalHeight) {
                                          const ratio = Number((img.naturalWidth / img.naturalHeight).toFixed(4));
                                          setPageAspectRatios(prev => (prev[1] === ratio ? prev : { ...prev, 1: ratio }));
                                        }
                                      }}
                                      className="w-full h-full object-fill block select-none pointer-events-none"
                                    />
                                  ) : (
                                    <iframe
                                      key={fallbackBlobUrl}
                                      src={`${fallbackBlobUrl}#toolbar=0&view=FitH`}
                                      className="w-full h-full border-0 rounded-sm bg-white pointer-events-auto"
                                      title={currentDoc.filename}
                                    />
                                  )}
                                  {bboxes.map((box) => {
                                    const isHighlighted = highlightedFieldId === box.id;
                                    return (
                                      <div
                                        key={box.id}
                                        id={`bbox-${box.id}`}
                                        onMouseEnter={() => scrollToRightField(box.id)}
                                        onMouseLeave={() => handleFieldHover(null)}
                                        className={`absolute rounded-xs transition-all duration-150 cursor-pointer ${isHighlighted
                                          ? 'border-2 border-primary bg-primary/20 ring-2 ring-primary/40 z-30 shadow-xs'
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
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // 尚未上传完成或处于解析等待态
                      return (
                        <div className="flex-1 p-6 overflow-auto custom-scrollbar bg-surface-container/40 dark:bg-surface-dark-low flex flex-col items-center justify-center text-center">
                          <div className="w-12 h-12 rounded-xl bg-surface-container-high dark:bg-surface-dark-high text-primary flex items-center justify-center mb-3 animate-pulse">
                            <span className="material-symbols-outlined text-2xl">picture_as_pdf</span>
                          </div>
                          <span className="text-xs font-bold text-on-surface dark:text-surface-bright">
                            {currentDoc.filename || '未载入文档'}
                          </span>
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant mt-1">
                            等待模型解析结构化数据与坐标映射...
                          </span>
                        </div>
                      );
                    })()}
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
                              <span className="text-[11px] text-on-surface-variant dark:text-outline-variant  font-bold">批次号:</span>
                            </div>
                            <EditableValueField
                              value={currentBatch.batchNo}
                              onChange={(val) => handleUpdateBatchNo(val)}
                              title="修改当前批次号，将自动同步至上方选择器"
                              className="flex-1"
                            />
                          </div>

                          {/* 动态真值 OCR 置信度徽章 (方案 A：综合元数据、检验项有效性与视觉定位覆盖率) */}
                          <div
                            className={`flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-2xs h-8 select-none transition-colors ${currentBatch.ocrConfidence >= 90
                              ? 'bg-status-pass-bg text-status-pass-text border-emerald-300 dark:border-emerald-800'
                              : currentBatch.ocrConfidence >= 75
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              }`}
                            title="当前批次综合数据抽取质量与定位覆盖率加权评估值 (真实多维动态测算)"
                          >
                            <span className="material-symbols-outlined text-sm">
                              {currentBatch.ocrConfidence >= 90 ? 'verified' : currentBatch.ocrConfidence >= 75 ? 'info' : 'warning'}
                            </span>
                            <span>当前批次 OCR 置信度: {currentBatch.ocrConfidence}%</span>
                          </div>

                          {/* 第 2 行：质保书编号 | 冶炼炉号 | 热处理炉号 */}
                          <div
                            id="right-field-meta_certificateNo"
                            onMouseEnter={() => handleFieldHover('meta_certificateNo')}
                            onMouseLeave={() => handleFieldHover(null)}
                            className="transition-all cursor-pointer"
                          >
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">质保书编号 (Certificate No)</span>
                            <EditableValueField
                              value={currentBatch.certificateNo || ''}
                              onChange={(val) => handleUpdateExtractValue('meta_certificateNo', val)}
                              isHighlighted={highlightedFieldId === 'meta_certificateNo'}
                              className="mt-1"
                            />
                          </div>

                          <div
                            id="right-field-meta_heatNo"
                            onMouseEnter={() => handleFieldHover('meta_heatNo')}
                            onMouseLeave={() => handleFieldHover(null)}
                            className="transition-all cursor-pointer"
                          >
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">冶炼炉号 (Heat No.)</span>
                            <EditableValueField
                              value={currentBatch.heatNo || ''}
                              onChange={(val) => handleUpdateExtractValue('meta_heatNo', val)}
                              placeholder="--"
                              title="原材料冶炼炉号 (Heat No.)"
                              isHighlighted={highlightedFieldId === 'meta_heatNo'}
                              className="mt-1"
                            />
                          </div>

                          <div
                            id="right-field-meta_packNo"
                            onMouseEnter={() => handleFieldHover('meta_packNo')}
                            onMouseLeave={() => handleFieldHover(null)}
                            className="transition-all cursor-pointer"
                          >
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">热处理炉号 (Pack No.)</span>
                            <EditableValueField
                              value={currentBatch.packNo || ''}
                              onChange={(val) => handleUpdateExtractValue('meta_packNo', val)}
                              placeholder="--"
                              title="钢管热处理炉号 (Pack No.)"
                              isHighlighted={highlightedFieldId === 'meta_packNo'}
                              className="mt-1"
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
                            <EditableValueField
                              value={currentBatch.productName || ''}
                              onChange={(val) => handleUpdateExtractValue('meta_productName', val)}
                              isHighlighted={highlightedFieldId === 'meta_productName'}
                              className="mt-1"
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
                            </div>
                            <EditableValueField
                              value={currentBatch.grade || ''}
                              onChange={(val) => handleUpdateExtractValue('meta_grade', val)}
                              isHighlighted={highlightedFieldId === 'meta_grade'}
                              className="mt-1"
                            />
                          </div>

                          <div
                            id="right-field-meta_standard"
                            onMouseEnter={() => handleFieldHover('meta_standard')}
                            onMouseLeave={() => handleFieldHover(null)}
                            className="transition-all cursor-pointer"
                          >
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">声称执行标准 (Declared Standard)</span>
                            <EditableValueField
                              value={currentBatch.standard || ''}
                              onChange={(val) => handleUpdateExtractValue('meta_standard', val)}
                              isHighlighted={highlightedFieldId === 'meta_standard'}
                              className="mt-1"
                            />
                          </div>

                          {/* 第 4 行：交货几何规格 | 热处理状态 | 供货厂家 */}
                          <div
                            id="right-field-meta_dimensions"
                            onMouseEnter={() => handleFieldHover('meta_dimensions')}
                            onMouseLeave={() => handleFieldHover(null)}
                            className="transition-all cursor-pointer"
                          >
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">交货几何规格 (Dimensions)</span>
                            <EditableValueField
                              value={currentBatch.dimensions || ''}
                              onChange={(val) => handleUpdateExtractValue('meta_dimensions', val)}
                              placeholder="--"
                              isHighlighted={highlightedFieldId === 'meta_dimensions'}
                              className="mt-1"
                            />
                          </div>

                          <div
                            id="right-field-meta_deliveryState"
                            onMouseEnter={() => handleFieldHover('meta_deliveryState')}
                            onMouseLeave={() => handleFieldHover(null)}
                            className="transition-all cursor-pointer"
                          >
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">热处理状态 (Delivery State)</span>
                            <EditableValueField
                              value={currentBatch.deliveryState || ''}
                              onChange={(val) => handleUpdateExtractValue('meta_deliveryState', val)}
                              placeholder="--"
                              isHighlighted={highlightedFieldId === 'meta_deliveryState'}
                              className="mt-1"
                            />
                          </div>

                          <div
                            id="right-field-meta_supplier"
                            onMouseEnter={() => handleFieldHover('meta_supplier')}
                            onMouseLeave={() => handleFieldHover(null)}
                            className="transition-all cursor-pointer"
                          >
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">供货厂家 (Supplier)</span>
                            <EditableValueField
                              value={currentBatch.supplier || ''}
                              onChange={(val) => handleUpdateExtractValue('meta_supplier', val)}
                              placeholder="--"
                              isHighlighted={highlightedFieldId === 'meta_supplier'}
                              className="mt-1"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 结构化实测数据区域：动态根据 standard.schema.ts 类别计算页签 (无数据自动隐藏) */}
                      {(() => {
                        // 1. 结构化构建当前批次的全部提取项 (赋予精准 fieldId 与真实 BBox 坐标联动，严格按实际提取结果呈现，无值绝不假占位)
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

                        // 动态方法标准解析器（优先取真实模型提取标准，未提取时自动按 Schema 规范反射默认标准，杜绝任何硬编码）
                        const getTestMethod = (key: string, fieldId: string, fallbackDefault?: string) => {
                          return currentBatch.testMethods?.[key] ||
                            currentBatch.testMethods?.[fieldId] ||
                            fieldDefMap[key]?.defaultMethod ||
                            fieldDefMap[fieldId]?.defaultMethod ||
                            fallbackDefault ||
                            '-';
                        };

                        const batchConfidenceStr = `${currentBatch.ocrConfidence || 95}%`;

                        const allExtractItems: ExtractRowItem[] = [
                          // 化学成分 (原件未打印独立检测方法标准，客观呈现为 '-'，无依据 BBox)
                          ...currentBatch.chemical.filter(c => c.value && c.value.trim() !== '').map(c => ({
                            fieldId: `chem_${c.element}`,
                            methodFieldId: undefined,
                            category: 'chemical',
                            categoryLabel: '化分',
                            categoryColor: 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                            name: `${c.element} (元素含量)`,
                            value: c.value,
                            unit: 'wt%',
                            method: '-',
                            confidence: c.confidence || batchConfidenceStr,
                            status: (c.status || 'ok') as 'ok' | 'warn',
                            note: c.note,
                          })),
                          // 力学性能 (优先呈现原件标注标准，未指定时反射 Schema 标准)
                          ...(currentBatch.mechanical?.tensile_rm && currentBatch.mechanical.tensile_rm.trim() !== '' ? [{
                            fieldId: 'mech_tensile',
                            methodFieldId: 'method_tensile',
                            category: 'mechanical',
                            categoryLabel: '力学',
                            categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                            name: '抗拉强度 Rm',
                            value: currentBatch.mechanical.tensile_rm,
                            method: getTestMethod('tensile_rm', 'mech_tensile', 'GB/T 228.1-2021'),
                            confidence: batchConfidenceStr,
                            status: 'ok' as const,
                          }] : []),
                          ...(currentBatch.mechanical?.yield_rp02 && currentBatch.mechanical.yield_rp02.trim() !== '' ? [{
                            fieldId: 'mech_yield',
                            methodFieldId: 'method_tensile',
                            category: 'mechanical',
                            categoryLabel: '力学',
                            categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                            name: '规定塑性延伸强度 Rp0.2',
                            value: currentBatch.mechanical.yield_rp02,
                            method: getTestMethod('yield_rp02', 'mech_yield', 'GB/T 228.1-2021'),
                            confidence: batchConfidenceStr,
                            status: 'ok' as const,
                          }] : []),
                          ...(currentBatch.mechanical?.elongation_a && currentBatch.mechanical.elongation_a.trim() !== '' ? [{
                            fieldId: 'mech_elongation',
                            methodFieldId: 'method_tensile',
                            category: 'mechanical',
                            categoryLabel: '力学',
                            categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                            name: '断后伸长率 A',
                            value: currentBatch.mechanical.elongation_a,
                            method: getTestMethod('elongation_a', 'mech_elongation', 'GB/T 228.1-2021'),
                            confidence: batchConfidenceStr,
                            status: 'ok' as const,
                          }] : []),
                          ...(currentBatch.mechanical?.hardness && currentBatch.mechanical.hardness.trim() !== '' ? [{
                            fieldId: 'mech_hardness',
                            methodFieldId: 'method_hardness',
                            category: 'mechanical',
                            categoryLabel: '力学',
                            categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                            name: '硬度 (Hardness)',
                            value: currentBatch.mechanical.hardness,
                            method: getTestMethod('hardness', 'mech_hardness', 'GB/T 4340.1-2024'),
                            confidence: batchConfidenceStr,
                            status: 'ok' as const,
                          }] : []),
                          // 工艺性能 (优先呈现原件标注标准，如 GB/T246-2017、GB/T242-2007)
                          ...(currentBatch.process?.flattening && currentBatch.process.flattening.trim() !== '' ? [{
                            fieldId: 'proc_flattening',
                            methodFieldId: 'method_proc_flattening',
                            category: 'process',
                            categoryLabel: '工艺',
                            categoryColor: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                            name: '压扁试验 (Flattening)',
                            value: currentBatch.process.flattening === 'PASS' ? '合格' : currentBatch.process.flattening,
                            method: getTestMethod('flattening', 'proc_flattening', 'GB/T 246-2017'),
                            confidence: batchConfidenceStr,
                            status: (currentBatch.process.flattening.includes('不') || currentBatch.process.flattening.toUpperCase().includes('FAIL')) ? ('warn' as const) : ('ok' as const),
                          }] : []),
                          ...(currentBatch.process?.flaring && currentBatch.process.flaring.trim() !== '' ? [{
                            fieldId: 'proc_flaring',
                            methodFieldId: 'method_proc_flaring',
                            category: 'process',
                            categoryLabel: '工艺',
                            categoryColor: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                            name: '扩口试验 (Flaring)',
                            value: currentBatch.process.flaring === 'PASS' ? '合格' : currentBatch.process.flaring,
                            method: getTestMethod('flaring', 'proc_flaring', 'GB/T 242-2007'),
                            confidence: batchConfidenceStr,
                            status: (currentBatch.process.flaring.includes('不') || currentBatch.process.flaring.toUpperCase().includes('FAIL')) ? ('warn' as const) : ('ok' as const),
                          }] : []),
                          // 金相组织 (依据 Page 2 表头 GB/T 6394-2017)
                          ...(currentBatch.process?.grainSize && currentBatch.process.grainSize.trim() !== '' ? [{
                            fieldId: 'metallo_grain',
                            methodFieldId: 'method_grain',
                            category: 'metallographic',
                            categoryLabel: '金相',
                            categoryColor: 'text-cyan-700 bg-cyan-50 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
                            name: '晶粒度评级 (Grain Size)',
                            value: currentBatch.process.grainSize,
                            method: getTestMethod('grain_size', 'metallo_grain', 'GB/T 6394-2017'),
                            confidence: '98%',
                            status: 'ok' as const,
                          }] : []),
                          // 耐腐蚀试验 (依据原件标注，如 GB/T4334-2020 方法 E)
                          ...(currentBatch.process?.intergranularCorrosion && currentBatch.process.intergranularCorrosion.trim() !== '' ? [{
                            fieldId: 'corrosion_intergranular',
                            methodFieldId: 'method_corrosion_intergranular',
                            category: 'corrosion',
                            categoryLabel: '腐蚀',
                            categoryColor: 'text-orange-700 bg-orange-50 dark:bg-orange-950/60 dark:text-orange-300 border-orange-200 dark:border-orange-800',
                            name: '晶间腐蚀试验 (Intergranular Corrosion)',
                            value: currentBatch.process.intergranularCorrosion === 'PASS' ? '合格' : currentBatch.process.intergranularCorrosion,
                            method: getTestMethod('intergranular_corrosion', 'corrosion_intergranular', 'GB/T 4334-2020'),
                            confidence: '98%',
                            status: (currentBatch.process.intergranularCorrosion.includes('不') || currentBatch.process.intergranularCorrosion.toUpperCase().includes('FAIL')) ? ('warn' as const) : ('ok' as const),
                          }] : []),
                          // 1. 无损检测 - 涡流探伤检验 (ET)
                          ...((currentBatch.process?.ndt_et || currentBatch.process?.ndt) && (currentBatch.process.ndt_et || currentBatch.process.ndt)!.trim() !== '' ? [{
                            fieldId: 'ndt_et',
                            methodFieldId: 'method_ndt_et',
                            category: 'ndt',
                            categoryLabel: '探伤',
                            categoryColor: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                            name: '涡流探伤检验 (Eddy Current Test)',
                            value: currentBatch.process.ndt_et || currentBatch.process.ndt || '',
                            method: getTestMethod('ndt_et', 'ndt_et', 'GB/T 7735-2016'),
                            confidence: '98%',
                            status: ((currentBatch.process.ndt_et || currentBatch.process.ndt)!.includes('不') || (currentBatch.process.ndt_et || currentBatch.process.ndt)!.toUpperCase().includes('FAIL')) ? ('warn' as const) : ('ok' as const),
                            note: ((currentBatch.process.ndt_et || currentBatch.process.ndt)!.includes('不') || (currentBatch.process.ndt_et || currentBatch.process.ndt)!.toUpperCase().includes('FAIL')) ? '探伤不合格' : undefined,
                          }] : []),
                          // 2. 无损检测 - 超声波探伤检验 (UT)
                          ...(currentBatch.process?.ndt_ut && currentBatch.process.ndt_ut.trim() !== '' ? [{
                            fieldId: 'ndt_ut',
                            methodFieldId: 'method_ndt_ut',
                            category: 'ndt',
                            categoryLabel: '探伤',
                            categoryColor: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                            name: '超声波探伤检验 (Ultrasonic Test)',
                            value: currentBatch.process.ndt_ut,
                            method: getTestMethod('ndt_ut', 'ndt_ut', 'GB/T 5777-2019'),
                            confidence: '98%',
                            status: (currentBatch.process.ndt_ut.includes('不') || currentBatch.process.ndt_ut.toUpperCase().includes('FAIL')) ? ('warn' as const) : ('ok' as const),
                            note: (currentBatch.process.ndt_ut.includes('不') || currentBatch.process.ndt_ut.toUpperCase().includes('FAIL')) ? '探伤不合格' : undefined,
                          }] : []),
                          // 3. 弹性长尾扩展检验项数组 (智能分类归一化纠偏，消除尺寸与表面质量误入工艺分类)
                          ...(Array.isArray(currentBatch.additionalTests) ? currentBatch.additionalTests.map((t, idx) => {
                            const safeValue = t.result
                              ? String(t.result)
                              : (t.value_num !== null && t.value_num !== undefined ? `${t.value_num}${t.unit ? ` ${t.unit}` : ''}` : '--');
                            const isFail = t.conclusion === 'FAIL' || safeValue.includes('不') || safeValue.toUpperCase().includes('FAIL');

                            // 智能推断分类：彻底纠正模型将尺寸/表面标记为 process 的偏差
                            const s = `${t.key || ''} ${t.name || ''}`.toLowerCase();
                            let catKey = t.category || 'process';
                            if (s.includes('尺寸') || s.includes('dimension') || s.includes('公差') || s.includes('壁厚') || s.includes('外径')) {
                              catKey = 'geometric';
                            } else if (s.includes('表面') || s.includes('surface') || s.includes('外观') || s.includes('瑕疵')) {
                              catKey = 'surface';
                            } else if (s.includes('探伤') || s.includes('涡流') || s.includes('超声') || s.includes('ndt') || s.includes('水压') || s.includes('气密')) {
                              catKey = 'ndt';
                            } else if (s.includes('腐蚀') || s.includes('corrosion') || s.includes('晶间')) {
                              catKey = 'corrosion';
                            } else if (s.includes('金相') || s.includes('晶粒') || s.includes('grain') || s.includes('夹杂')) {
                              catKey = 'metallographic';
                            } else if (s.includes('拉伸') || s.includes('屈服') || s.includes('延伸') || s.includes('硬度') || s.includes('冲击') || s.includes('mechanical')) {
                              catKey = 'mechanical';
                            } else if (s.includes('压扁') || s.includes('扩口') || s.includes('弯曲') || s.includes('卷边') || s.includes('process')) {
                              catKey = 'process';
                            }

                            const catLabelMap: Record<string, string> = {
                              geometric: '尺寸',
                              surface: '表面',
                              ndt: '探伤',
                              mechanical: '力学',
                              metallographic: '金相',
                              corrosion: '腐蚀',
                              process: '工艺',
                              other: '其他',
                            };

                            const catColorMap: Record<string, string> = {
                              geometric: 'text-teal-700 bg-teal-50 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800',
                              surface: 'text-rose-700 bg-rose-50 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800',
                              ndt: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                              mechanical: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                              metallographic: 'text-cyan-700 bg-cyan-50 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
                              corrosion: 'text-orange-700 bg-orange-50 dark:bg-orange-950/60 dark:text-orange-300 border-orange-200 dark:border-orange-800',
                              process: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                            };

                            return {
                              fieldId: t.key || `add_test_${idx}`,
                              methodFieldId: `method_${t.key || idx}`,
                              category: catKey,
                              categoryLabel: catLabelMap[catKey] || '工艺',
                              categoryColor: catColorMap[catKey] || 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                              name: t.name || (t.key || '附加检验项'),
                              value: safeValue,
                              method: t.standard || '依据设计技术要求',
                              confidence: '96%',
                              status: isFail ? ('warn' as const) : ('ok' as const),
                              note: isFail ? '检验不合格' : undefined,
                            };
                          }) : []),
                          // 几何尺寸交货规格 (使用独立 fieldId: 'meta_dimensions'，避免与公差检验 'geo_dimensions' 同名冲突)
                          ...(currentBatch.dimensions && currentBatch.dimensions.trim() !== '' ? [
                            {
                              fieldId: 'meta_dimensions',
                              methodFieldId: 'method_meta_dimensions',
                              category: 'geometric',
                              categoryLabel: '尺寸',
                              categoryColor: 'text-teal-700 bg-teal-50 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800',
                              name: '几何尺寸规格 (Dimensions)',
                              value: currentBatch.dimensions,
                              method: currentBatch.standard || '按订货标准要求',
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
                        ].filter(c => (c.key === 'all' && allExtractItems.length > 0) || c.count > 0);

                        const displayedItems = activeTabCategory === 'all'
                          ? allExtractItems
                          : allExtractItems.filter(i => i.category === activeTabCategory);

                        if (allExtractItems.length === 0) {
                          return (
                            <div className="p-8 border border-dashed border-outline-variant/50 dark:border-border-dark rounded-xl bg-surface-container-low/30 dark:bg-surface-dark-low/30 flex flex-col items-center justify-center text-center">
                              <div className="w-10 h-10 rounded-full bg-surface-container-high dark:bg-surface-dark-high text-primary flex items-center justify-center mb-2.5 animate-pulse">
                                <span className="material-symbols-outlined text-xl">auto_awesome</span>
                              </div>
                              <span className="text-xs font-bold text-on-surface dark:text-surface-bright">
                                {isDocParsing ? '正在流式提取结构化检验项数据...' : '当前批次暂无实测检验项目数据'}
                              </span>
                              <span className="text-[11px] text-on-surface-variant dark:text-outline-variant mt-1">
                                {isDocParsing ? '模型正在从源文档中解析化学成分、力学性能与工艺试验指标' : '可等待模型解析完成或在上方基础元数据中录入'}
                              </span>
                            </div>
                          );
                        }

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
                                    <span className={`px-1.5 py-0.2 rounded-full text-[10px]  font-bold ${isActive
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

                                          {/* 1. 提取测得值 / 试验结果（常态处于常规Text展示，hover浮现编辑按钮，点击可编辑，置信度预警保留⚠️） */}
                                          <td className="px-3.5 py-1.5">
                                            <div className="flex items-center gap-1.5">
                                              <div className="relative flex-1 flex items-center max-w-[240px]">
                                                <EditableValueField
                                                  value={row.value}
                                                  unit={row.unit}
                                                  onChange={(val) => handleUpdateExtractValue(row.fieldId, val)}
                                                  onHover={() => handleFieldHover(row.fieldId)}
                                                  onLeave={() => handleFieldHover(null)}
                                                  isHighlighted={isValueHighlighted}
                                                  title="悬浮可联动查看原件切图，点击右侧编辑按钮修改"
                                                  className="w-full"
                                                />
                                              </div>

                                              {/* 置信度⚠️气泡：仅对 warn / <85% 置信度展示，悬浮展开完整工业说明 */}
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
                                    {currentBatch.chemical.filter(c => c.value && c.value.trim() !== '').map((row, idx) => {
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
                                                <EditableValueField
                                                  value={row.value}
                                                  unit="wt%"
                                                  onChange={(val) => handleUpdateExtractValue(fieldId, val)}
                                                  onHover={() => handleFieldHover(fieldId)}
                                                  onLeave={() => handleFieldHover(null)}
                                                  isHighlighted={isHighlighted}
                                                  title="悬浮可联动查看原件切图，点击右侧编辑按钮修改"
                                                  className="w-full"
                                                />
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
                                          <td className="px-3.5 py-2 text-outline-variant dark:text-outline-dark text-[11px]">-</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* 3. 各专业分类统一声明式数据驱动视图 (彻底消除死逻辑，徽章计数与内容 100% 绝对一致) */}
                            {activeTabCategory !== 'all' && activeTabCategory !== 'chemical' && (() => {
                              const categoryHeaderMap: Record<string, string> = {
                                mechanical: '拉伸与硬度力学性能实测 (Mechanical Tensile & Hardness)',
                                process: '工艺成型试验条款实测 (Process Flattening & Bending)',
                                metallographic: '金相组织与晶粒度实测 (Metallographic & Grain Size)',
                                corrosion: '不锈钢耐腐蚀试验实测 (Corrosion Resistance)',
                                ndt: '承压管道无损探伤检验 (Non-Destructive Testing)',
                                geometric: '几何公差与尺寸检验 (Geometric Tolerances & Dimensions)',
                                surface: '表面宏观与微观质量检验 (Surface Quality)',
                                other: '其他综合检验条款实测 (Additional Tests)',
                              };

                              const headerTitle = categoryHeaderMap[activeTabCategory] || `${categoriesInBatch.find(c => c.key === activeTabCategory)?.label || '检验项目'}实测`;

                              return (
                                <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-2 text-xs">
                                  <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                                    {headerTitle}
                                  </span>
                                  <div className="space-y-2">
                                    {displayedItems.map((item) => {
                                      const isHighlighted = highlightedFieldId === item.fieldId;
                                      const isMethodHighlighted = Boolean(item.methodFieldId && highlightedFieldId === item.methodFieldId);

                                      return (
                                        <div
                                          key={item.fieldId}
                                          id={`right-field-${item.fieldId}`}
                                          onMouseEnter={() => handleFieldHover(item.fieldId)}
                                          onMouseLeave={() => handleFieldHover(null)}
                                          className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center gap-3 cursor-pointer transition-all ${isHighlighted || isMethodHighlighted
                                            ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                            : 'border-outline-variant/30 hover:border-primary/50'
                                            }`}
                                        >
                                          <div className="shrink-0">
                                            <strong className="text-on-surface dark:text-surface-bright block">{item.name}</strong>
                                            {item.method && item.method !== '-' && (
                                              <span
                                                id={item.methodFieldId ? `right-field-${item.methodFieldId}` : undefined}
                                                onMouseEnter={(e) => {
                                                  if (item.methodFieldId) {
                                                    e.stopPropagation();
                                                    handleFieldHover(item.methodFieldId);
                                                  }
                                                }}
                                                onMouseLeave={(e) => {
                                                  if (item.methodFieldId) {
                                                    e.stopPropagation();
                                                    handleFieldHover(null);
                                                  }
                                                }}
                                                className={`text-[11px] block transition-colors cursor-pointer ${isMethodHighlighted
                                                  ? 'text-primary font-bold underline'
                                                  : 'text-on-surface-variant hover:text-primary hover:underline'
                                                  }`}
                                                title="悬浮查看源文档中该项依据的标准/方法条款位置"
                                              >
                                                依据方法：{item.method}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex-1 flex justify-end max-w-[360px] sm:max-w-[480px]">
                                            <EditableValueField
                                              value={item.value}
                                              placeholder="--"
                                              align="right"
                                              onChange={(val) => handleUpdateExtractValue(item.fieldId, val)}
                                              onHover={() => handleFieldHover(item.fieldId)}
                                              onLeave={() => handleFieldHover(null)}
                                              isHighlighted={isHighlighted}
                                              title="悬浮可联动查看原件切图，点击右侧编辑按钮修改"
                                              className="w-full"
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* 力学性能专属公式提示 */}
                                  {activeTabCategory === 'mechanical' && currentBatch.mechanical?.astFormulaNote && (
                                    <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-[12px] flex items-center gap-2 mt-2">
                                      <span className="material-symbols-outlined text-base text-amber-600 dark:text-amber-400">auto_awesome</span>
                                      <span>{currentBatch.mechanical.astFormulaNote}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>


          {/* ========================================================================= */}
          {/* 步骤 3: 质检工作台 - 比对标准 (挂载统一标题与批次选择条) */}
          {/* ========================================================================= */}
          <section className="w-full h-full shrink-0 overflow-y-auto custom-scrollbar px-6 pb-6 pt-0">
            <div id="step-3-workbench-panel" className="max-w-[1440px] mx-auto w-full space-y-4 pt-6">

              {/* 顶部统一标题与两层树状批次选择条 (固定在顶部，设置 z-40 确保下拉菜单浮于上方) */}
              <div className="relative z-40">
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
                  sessionMetrics={totalCombinedMetrics}
                />
              </div>

              {/* ========================================================================= */}
              {/* 步骤 3 内容区：全景合规比对架构 */}
              {/* ========================================================================= */}
              {(!currentDoc || !currentBatch) ? (
                <div className="flex flex-col items-center justify-center text-center p-12 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-xs">
                  <div className="w-16 h-16 rounded-2xl bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-3xl">rule</span>
                  </div>
                  <h3 className="text-sm font-bold text-on-surface dark:text-surface-bright mb-1.5">
                    暂无待比对批次
                  </h3>
                  <p className="text-xs text-on-surface-variant dark:text-outline-variant max-w-sm mb-6">
                    请先在步骤 1 上传真实质保证书并完成解析核对。
                  </p>
                  <button
                    type="button"
                    onClick={() => goToStep(0)}
                    className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">arrow_back</span>
                    <span>前往步骤 1 上传文档</span>
                  </button>
                </div>
              ) : (() => {
                const currentBatchState = batchPresentationMap[currentBatch.batchNo];

                interface ComplianceMatrixRow {
                  id: string;
                  category: 'chemical' | 'mechanical' | 'process' | 'metallographic' | 'corrosion' | 'ndt' | 'dimensions' | 'additional';
                  categoryLabel: string;
                  categoryColor: string;
                  name: string;
                  measuredValue: string;
                  standardRequirement: string;
                  deviation: string;
                  isDeviationWarning?: boolean;
                  status: 'PASS' | 'FAIL' | 'HITL' | 'INFO';
                  statusLabel: string;
                  detailTag?: { label: string; color: string };
                  ruleBasis: string;
                  note?: string;
                  isScissorsDifference?: boolean;
                  strictStandardId?: string;
                  scissorsAttribution?: string;
                  multiStandardEvaluations?: Array<{
                    standard_id: string;
                    standard_short: string;
                    requirement_text: string;
                    status: string;
                    is_governing?: boolean;
                    message?: string;
                  }>;
                }

                // 构建全景比对矩阵数据项 (100% 来源于后端合规引擎 AuditReport 直出，杜绝硬编码伪造)
                let complianceMatrixItems: ComplianceMatrixRow[] = [];

                if (currentBatch.auditReport && Array.isArray(currentBatch.auditReport.item_results)) {
                  const categoryMeta: Record<string, { label: string; color: string }> = {
                    chemical: { label: '化分', color: 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
                    mechanical: { label: '力学', color: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
                    process: { label: '工艺', color: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
                    metallographic: { label: '金相', color: 'text-cyan-700 bg-cyan-50 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800' },
                    corrosion: { label: '腐蚀', color: 'text-orange-700 bg-orange-50 dark:bg-orange-950/60 dark:text-orange-300 border-orange-200 dark:border-orange-800' },
                    ndt: { label: '探伤', color: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' },
                    dimensions: { label: '尺寸', color: 'text-teal-700 bg-teal-50 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800' },
                    additional: { label: '附加', color: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700' },
                  };

                  complianceMatrixItems = currentBatch.auditReport.item_results.map((item, idx) => {
                    const isPass = item.status === 'PASS';
                    const isMissing = item.status === 'MISSING';
                    const isSkipped = item.status === 'SKIPPED';
                    const isExempt = item.status === 'EXEMPT';
                    const isScissors = Boolean(item.is_scissors_difference);

                    const defaultMeta = { label: '扩展', color: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700' };
                    const catKey = item.category in categoryMeta ? item.category : 'additional';
                    const meta = categoryMeta[catKey] ?? defaultMeta;

                    let statusLabel = '✓ PASS';
                    let rowStatus: 'PASS' | 'FAIL' | 'HITL' | 'INFO' = 'PASS';
                    let detailTag: { label: string; color: string } | undefined = undefined;

                    if (isScissors) {
                      rowStatus = 'FAIL';
                      statusLabel = '✗ FAIL';
                      detailTag = {
                        label: '剪刀差未达标',
                        color: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700',
                      };
                    } else if (isMissing) {
                      rowStatus = 'FAIL';
                      statusLabel = '✗ FAIL';
                      detailTag = {
                        label: '缺项漏检',
                        color: 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700',
                      };
                    } else if (!isPass && !isSkipped && !isExempt) {
                      rowStatus = 'FAIL';
                      statusLabel = '✗ FAIL';
                    } else if (isSkipped) {
                      rowStatus = 'INFO';
                      statusLabel = '- N/A';
                      detailTag = {
                        label: '不适用',
                        color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
                      };
                    } else if (isExempt) {
                      rowStatus = 'PASS';
                      statusLabel = '✓ PASS';
                      detailTag = {
                        label: '免检',
                        color: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700',
                      };
                    }

                    // 检查是否属于 Tier 2 消歧产出的指标或 HITL 人工对齐指标
                    const currentBatchPres = batchPresentationMap[currentBatch.batchNo];
                    const matchedResolved = currentBatchPres?.resolvedProperties?.find(
                      rp => rp.resolved_key === item.property_key
                    );
                    const batchCorrection = (currentBatch as any).hitlCorrection || (currentBatch.auditReport as any)?.human_correction;
                    const mappedRawEntry = batchCorrection?.corrected_property_keys
                      ? Object.entries(batchCorrection.corrected_property_keys).find(([, targetKey]) => targetKey === item.property_key)
                      : undefined;

                    if (!detailTag && matchedResolved) {
                      if (matchedResolved.is_degraded) {
                        detailTag = {
                          label: '本地规则降级',
                          color: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700',
                        };
                      } else {
                        detailTag = {
                          label: 'AI意图对齐',
                          color: 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700',
                        };
                      }
                    } else if (!detailTag && mappedRawEntry) {
                      detailTag = {
                        label: 'HITL人工对齐',
                        color: 'bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-700',
                      };
                    }

                    const measuredDisplay = item.actual_value_text
                      || (item.measured_value_num !== null && item.measured_value_num !== undefined ? String(item.measured_value_num) : (item.measured_value_raw || '--'));

                    // 计算偏差量 / 吻合度 (数值项给出实测与标准阈值的代数差，定性项显示达标)
                    let deviationText = '-';
                    let isDeviationWarning = false;

                    if (isSkipped) {
                      deviationText = '-';
                    } else if (item.status === 'FAIL') {
                      isDeviationWarning = true;
                      if (item.deviation !== null && item.deviation !== undefined && item.deviation !== 0) {
                        let diffVal = item.deviation;
                        // 若低于下限（实测 < 下限），差值赋予负号显示
                        if (item.standard_min !== null && item.standard_min !== undefined && item.rounded_value !== null && item.rounded_value !== undefined && item.rounded_value < item.standard_min) {
                          diffVal = -Math.abs(diffVal);
                        }
                        const roundedDiff = Number(diffVal.toFixed(4));
                        const sign = roundedDiff > 0 ? '+' : '';
                        const unitStr = (item as any).unit || '';
                        deviationText = `${sign}${roundedDiff}${unitStr}`;
                      } else {
                        deviationText = '未达标';
                      }
                    } else if (item.status === 'PASS' || isExempt) {
                      // 数值比较给出工程代数差「实测值 - 标准阈值」（若有多点实测读数按最贴近标准线的临界点计算）
                      if (item.rounded_value !== null && item.rounded_value !== undefined) {
                        let criticalVal = item.rounded_value;
                        if (item.measured_value_raw) {
                          const nums = item.measured_value_raw.match(/-?\d+(\.\d+)?/g);
                          if (nums && nums.length > 1) {
                            const parsed = nums.map(n => parseFloat(n)).filter(n => !isNaN(n));
                            if (parsed.length > 1) {
                              if (item.standard_min !== null && (item.standard_max === null || item.standard_max === undefined)) {
                                criticalVal = Math.min(...parsed);
                              } else if (item.standard_max !== null && (item.standard_min === null || item.standard_min === undefined)) {
                                criticalVal = Math.max(...parsed);
                              } else if (item.standard_min !== null && item.standard_max !== null) {
                                criticalVal = parsed.reduce((closest, curr) => {
                                  const distCurr = Math.min(Math.abs(curr - item.standard_min!), Math.abs(curr - item.standard_max!));
                                  const distClosest = Math.min(Math.abs(closest - item.standard_min!), Math.abs(closest - item.standard_max!));
                                  return distCurr < distClosest ? curr : closest;
                                }, parsed[0]!);
                              }
                            }
                          }
                        }

                        let diff: number | null = null;
                        const stdMin = item.standard_min ?? (item.formula_calculated_bound !== undefined ? item.formula_calculated_bound : null);
                        const stdMax = item.standard_max ?? null;

                        if (stdMin !== null && (stdMax === null || stdMax === undefined)) {
                          // 仅下限指标：实测值 - 标准下限 (高于下限为正数，如 620 - 520 = +100)
                          diff = Number((criticalVal - stdMin).toFixed(4));
                        } else if (stdMax !== null && (stdMin === null || stdMin === undefined)) {
                          // 仅上限指标：实测值 - 标准上限 (低于上限为负数，如 0.048 - 0.080 = -0.032)
                          diff = Number((criticalVal - stdMax).toFixed(4));
                        } else if (stdMin !== null && stdMax !== null) {
                          // 双边区间：取距离较近的标准线差值
                          const dMin = criticalVal - stdMin;
                          const dMax = criticalVal - stdMax;
                          diff = Math.abs(dMin) <= Math.abs(dMax) ? Number(dMin.toFixed(4)) : Number(dMax.toFixed(4));
                        }

                        if (diff !== null && !isNaN(diff)) {
                          const sign = diff > 0 ? '+' : '';
                          const unitStr = (item as any).unit || '';
                          deviationText = `${sign}${diff}${unitStr}`;
                        } else {
                          deviationText = '达标';
                        }
                      } else {
                        // 定性项合格显示达标
                        deviationText = '达标';
                      }
                    }

                    // 组织【判定逻辑 / 审核说明】：装入完整判定逻辑阐述 (item.message)
                    let logicExplanation = item.message || (isPass ? '实测数据符合标准技术规范要求' : '实测数据未满足标准要求');
                    if (matchedResolved) {
                      if (matchedResolved.is_degraded) {
                        logicExplanation = `[本地规则降级] 字段 [${matchedResolved.raw_name}] 经本地启发式规则对齐；${logicExplanation}`;
                      } else {
                        logicExplanation = `[AI意图对齐: ${matchedResolved.model_name || '大模型'}] ${matchedResolved.reasoning}；${logicExplanation}`;
                      }
                    } else if (mappedRawEntry) {
                      logicExplanation = `[HITL人工对齐: 原始字段【${mappedRawEntry[0]}】] ${currentBatch.humanVerdictSummary || batchCorrection?.waiver_notes || ''}；${logicExplanation}`;
                    }

                    return {
                      id: item.rule_id || `rule_${item.property_key}_${idx}`,
                      category: catKey as any,
                      categoryLabel: meta.label,
                      categoryColor: meta.color,
                      name: item.display_name || item.property_key,
                      measuredValue: measuredDisplay,
                      standardRequirement: item.dual_standard_requirement_text || item.standard_requirement_text || '按标准技术要求',
                      deviation: deviationText,
                      isDeviationWarning,
                      status: rowStatus,
                      statusLabel,
                      detailTag,
                      ruleBasis: logicExplanation,
                      isScissorsDifference: isScissors,
                      strictStandardId: item.strict_standard_id,
                      scissorsAttribution: item.scissors_attribution,
                      multiStandardEvaluations: item.multi_standard_evaluations,
                    };
                  });

                  // 处理未匹配记录项 (Unmatched Certificate Records) 及质检员 HITL 裁定项
                  const addedKeys = new Set(complianceMatrixItems.map(i => i.name));
                  const unmatchedRecords = currentBatch.auditReport.unmatched_certificate_records || [];
                  const hitlCorrection =
                    (currentBatch as any).hitlFieldCorrection ||
                    (currentBatch as any).hitlCorrection ||
                    (currentBatch.auditReport as any)?.human_correction ||
                    (selectedBatchNo ? (batchPresentationMap[selectedBatchNo]?.hitlFieldCorrection || batchPresentationMap[selectedBatchNo]?.hitlCorrection) : undefined);

                  const isSentinelKey = (str?: string | null): boolean => {
                    if (!str) return true;
                    const s = str.trim().toLowerCase();
                    return s === 'special_protocol_item' || s === 'unrecognized_rejected_item';
                  };

                  for (const rec of unmatchedRecords) {
                    let originalName: string | undefined = undefined;

                    // (1) 质保书原始项目名（直接解析自原件表格列头或字段名）
                    if (!isSentinelKey(rec.raw_property_name)) {
                      originalName = rec.raw_property_name;
                    }

                    // (2) 归一化展示名（若不是内部 sentinel key）
                    if (!originalName && !isSentinelKey(rec.display_name)) {
                      originalName = rec.display_name;
                    }

                    // (3) 从 hitlCorrection.corrected_property_keys 反向映射原始项目名
                    if (!originalName && hitlCorrection?.corrected_property_keys) {
                      const matchEntry = Object.entries(hitlCorrection.corrected_property_keys).find(
                        ([k, v]) => v === rec.property_key || (rec.raw_property_name && k === rec.raw_property_name)
                      );
                      if (matchEntry && !isSentinelKey(matchEntry[0])) {
                        originalName = matchEntry[0];
                      }
                    }

                    // (4) 从 activeHitlContext 反查待处理字段名
                    if (!originalName && activeHitlContext?.property_ambiguity_details?.raw_name) {
                      if (!isSentinelKey(activeHitlContext.property_ambiguity_details.raw_name)) {
                        originalName = activeHitlContext.property_ambiguity_details.raw_name;
                      }
                    }

                    // (5) 从批次原始附加试验记录根据测量值反查原始项目名
                    if (!originalName && currentBatch?.additionalTests) {
                      const matchedTest = currentBatch.additionalTests.find(t =>
                        t && t.name && !isSentinelKey(t.name) &&
                        (t.result === rec.measured_value_raw || String((t as any).value_num) === String(rec.measured_value_num))
                      );
                      if (matchedTest?.name) {
                        originalName = matchedTest.name;
                      }
                    }

                    const isProtocolApproved =
                      rec.property_key === 'special_protocol_item' ||
                      (rec as any).is_special_protocol ||
                      Boolean(rec.raw_property_name && hitlCorrection?.corrected_property_keys?.[rec.raw_property_name] === 'special_protocol_item') ||
                      Boolean(originalName && hitlCorrection?.corrected_property_keys?.[originalName] === 'special_protocol_item');

                    const isRejected =
                      rec.property_key === 'unrecognized_rejected_item' ||
                      (rec as any).is_rejected ||
                      Boolean(rec.raw_property_name && hitlCorrection?.corrected_property_keys?.[rec.raw_property_name] === 'unrecognized_rejected_item') ||
                      Boolean(originalName && hitlCorrection?.corrected_property_keys?.[originalName] === 'unrecognized_rejected_item');

                    // 终极显示名称：坚决杜绝暴露内部 sentinel key
                    let recName = originalName;
                    if (!recName || isSentinelKey(recName)) {
                      if (isProtocolApproved) {
                        recName = '订货技术协议特约项目';
                      } else if (isRejected) {
                        recName = '未识别非标排除项';
                      } else {
                        recName = rec.raw_property_name || rec.display_name || '特约检验项目';
                      }
                    }

                    if (!recName || addedKeys.has(recName)) continue;
                    addedKeys.add(recName);

                    const catKey = rec.category && rec.category in categoryMeta ? rec.category : 'additional';
                    const defaultMeta = { label: '扩展', color: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700' };
                    const meta = categoryMeta[catKey] ?? defaultMeta;
                    const measuredDisplay = rec.measured_value_raw || (rec.measured_value_num !== null && rec.measured_value_num !== undefined ? String(rec.measured_value_num) : '--');

                    if (isProtocolApproved) {
                      complianceMatrixItems.push({
                        id: `unmatched_protocol_${rec.property_key}_${complianceMatrixItems.length}`,
                        category: catKey as any,
                        categoryLabel: meta.label,
                        categoryColor: meta.color,
                        name: recName,
                        measuredValue: measuredDisplay,
                        standardRequirement: '订货技术协议特约增补条款 (协议放行)',
                        deviation: '达标',
                        status: 'PASS',
                        statusLabel: '✓ PASS',
                        detailTag: {
                          label: '协议特约放行',
                          color: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700',
                        },
                        ruleBasis: `[协议特约项: 质检工程师核准放行] ${hitlCorrection?.waiver_notes || (rec as any).waiver_notes || '经质检工程师裁定：确认该指标系订货技术协议增补验证项目，实测数据完整合规，纳入合格放行依据。'}`,
                      });
                    } else if (isRejected) {
                      complianceMatrixItems.push({
                        id: `unmatched_rejected_${rec.property_key}_${complianceMatrixItems.length}`,
                        category: catKey as any,
                        categoryLabel: meta.label,
                        categoryColor: meta.color,
                        name: recName,
                        measuredValue: measuredDisplay,
                        standardRequirement: '未经认可特种非标指标',
                        deviation: '未达标',
                        isDeviationWarning: true,
                        status: 'FAIL',
                        statusLabel: '✗ FAIL',
                        detailTag: {
                          label: '特种非标否决',
                          color: 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700',
                        },
                        ruleBasis: `[质检裁定不予认可] ${hitlCorrection?.waiver_notes || (rec as any).waiver_notes || '该非标指标缺乏权威规范依据且未经技术协议认可，作缺项否决处理。'}`,
                      });
                    } else {
                      complianceMatrixItems.push({
                        id: `unmatched_extra_${rec.property_key}_${complianceMatrixItems.length}`,
                        category: 'additional',
                        categoryLabel: '扩展',
                        categoryColor: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
                        name: recName,
                        measuredValue: measuredDisplay,
                        standardRequirement: '现行标准未作强制要求',
                        deviation: '-',
                        status: 'INFO',
                        statusLabel: '- N/A',
                        detailTag: {
                          label: '额外报送',
                          color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
                        },
                        ruleBasis: '质保书额外报送项，标准库未定义比对规则，仅供存档参考',
                      });
                    }
                  }

                  // 检查 additionalTests 中是否存在经 HITL 裁定放行或否决但尚未添加至比对矩阵的条目
                  if (Array.isArray(currentBatch.additionalTests)) {
                    for (const addTest of currentBatch.additionalTests) {
                      const testName = addTest.name || addTest.key;
                      if (!testName || isSentinelKey(testName) || addedKeys.has(testName)) continue;

                      const isProtocolApproved =
                        hitlCorrection?.corrected_property_keys?.[addTest.key] === 'special_protocol_item' ||
                        hitlCorrection?.corrected_property_keys?.[addTest.name] === 'special_protocol_item';

                      const isRejected =
                        hitlCorrection?.corrected_property_keys?.[addTest.key] === 'unrecognized_rejected_item' ||
                        hitlCorrection?.corrected_property_keys?.[addTest.name] === 'unrecognized_rejected_item';

                      if (isProtocolApproved || isRejected) {
                        addedKeys.add(testName);
                        const catKey = addTest.category && addTest.category in categoryMeta ? addTest.category : 'mechanical';
                        const defaultMeta = { label: '扩展', color: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700' };
                        const meta = categoryMeta[catKey] ?? defaultMeta;
                        const measuredDisplay = addTest.result || (addTest.value_num !== undefined ? String(addTest.value_num) : '--');

                        if (isProtocolApproved) {
                          complianceMatrixItems.push({
                            id: `hitl_protocol_${addTest.key}`,
                            category: catKey as any,
                            categoryLabel: meta.label,
                            categoryColor: meta.color,
                            name: testName,
                            measuredValue: measuredDisplay,
                            standardRequirement: '订货技术协议特约增补条款 (协议放行)',
                            deviation: '达标',
                            status: 'PASS',
                            statusLabel: '✓ PASS',
                            detailTag: {
                              label: '协议特约放行',
                              color: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700',
                            },
                            ruleBasis: `[协议特约项: 质检工程师核准放行] ${currentBatch.humanVerdictSummary || hitlCorrection?.waiver_notes || '确认该指标系订货技术协议增补验证项目，实测数据完整合规，纳入合格放行依据。'}`,
                          });
                        } else {
                          complianceMatrixItems.push({
                            id: `hitl_rejected_${addTest.key}`,
                            category: catKey as any,
                            categoryLabel: meta.label,
                            categoryColor: meta.color,
                            name: testName,
                            measuredValue: measuredDisplay,
                            standardRequirement: '未经认可特种非标指标',
                            deviation: '未达标',
                            isDeviationWarning: true,
                            status: 'FAIL',
                            statusLabel: '✗ FAIL',
                            detailTag: {
                              label: '特种非标否决',
                              color: 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700',
                            },
                            ruleBasis: `[质检裁定不予认可] ${currentBatch.humanVerdictSummary || hitlCorrection?.waiver_notes || '该非标指标缺乏权威规范依据且未经技术协议认可，作缺项否决处理。'}`,
                          });
                        }
                      }
                    }
                  }

                  // 质保书独占非标追溯项（施工号、炉号）排布在表底作为【ℹ️ 供参考】
                  if (currentBatch.constructionNo && currentBatch.constructionNo !== '待提取' && currentBatch.constructionNo !== '') {
                    complianceMatrixItems.push({
                      id: 'custom_construction_no',
                      category: 'additional',
                      categoryLabel: '扩展',
                      categoryColor: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
                      name: '施工工程号 (Construction No.)',
                      measuredValue: currentBatch.constructionNo,
                      standardRequirement: '采购合同追溯标识',
                      deviation: '-',
                      status: 'INFO',
                      statusLabel: '- N/A',
                      detailTag: {
                        label: '供参考',
                        color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
                      },
                      ruleBasis: '按采购合同工程图纸核对追溯号',
                    });
                  }
                  if (currentBatch.heatNo && currentBatch.heatNo !== '待提取' && currentBatch.heatNo !== '') {
                    complianceMatrixItems.push({
                      id: 'custom_heat_no',
                      category: 'additional',
                      categoryLabel: '扩展',
                      categoryColor: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
                      name: '熔炼炉号 (Heat No.)',
                      measuredValue: currentBatch.heatNo,
                      standardRequirement: '炉批次追踪标识',
                      deviation: '-',
                      status: 'INFO',
                      statusLabel: '- N/A',
                      detailTag: {
                        label: '供参考',
                        color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
                      },
                      ruleBasis: '按原材料冶炼炉号与批次追溯系统核对',
                    });
                  }
                }

                const issueItems = complianceMatrixItems.filter(i => i.status === 'FAIL' || i.status === 'HITL');

                const STEP3_TABS = [
                  { key: 'all', label: '全部比对项', count: complianceMatrixItems.length },
                  { key: 'issues', label: '问题项', count: issueItems.length },
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
                  : step3Category === 'issues'
                    ? issueItems
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

                          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                            {(() => {
                              const renderExtractedValue = (val?: string) => {
                                if (!val || val.trim() === '') {
                                  return <span className="text-xs text-outline-variant italic font-normal block select-none">--</span>;
                                }
                                return (
                                  <strong className="text-xs font-bold text-primary dark:text-primary-fixed-dim block truncate" title={val}>
                                    {val}
                                  </strong>
                                );
                              };

                              return (
                                <>
                                  <div>
                                    <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">产品名称 (Product Name)</span>
                                    {renderExtractedValue(currentBatch.productName)}
                                  </div>
                                  <div>
                                    <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">质保书编号 (Certificate No)</span>
                                    {renderExtractedValue(currentBatch.certificateNo)}
                                  </div>
                                  <div>
                                    <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">声明标准 (Declared Standard)</span>
                                    {renderExtractedValue(currentBatch.standard)}
                                  </div>
                                  <div>
                                    <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">材料牌号</span>
                                    {renderExtractedValue(currentBatch.grade)}
                                  </div>
                                  <div>
                                    <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">冶炼炉号 (Heat No.)</span>
                                    {renderExtractedValue(currentBatch.heatNo)}
                                  </div>
                                  <div>
                                    <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">热处理装炉号 (Pack No.)</span>
                                    {renderExtractedValue(currentBatch.packNo)}
                                  </div>
                                  <div>
                                    <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">交货规格</span>
                                    {renderExtractedValue(currentBatch.dimensions)}
                                  </div>
                                  <div>
                                    <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">供货厂商</span>
                                    {renderExtractedValue(currentBatch.supplier)}
                                  </div>
                                </>
                              );
                            })()}
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
                                执行标准与技术协议
                              </h4>
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-primary/10 text-primary border border-primary/20" title="当前用于执行合规判定的材料牌号基准">
                                核验牌号: {activeGrade || '未声明'}
                              </span>
                              {isStandardOverridden && isGradeOverridden && (
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                                  标准与牌号已变更
                                </span>
                              )}
                              {isStandardOverridden && !isGradeOverridden && (
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                                  标准已变更
                                </span>
                              )}
                              {!isStandardOverridden && isGradeOverridden && (
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                                  牌号已指定
                                </span>
                              )}
                            </div>

                            {/* 右侧常驻操作按钮组 */}
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  if (isReevaluatingCooldownRef.current || isEvaluatingBatch) return;
                                  isReevaluatingCooldownRef.current = true;
                                  setTimeout(() => { isReevaluatingCooldownRef.current = false; }, 500);
                                  evaluateBatch(currentBatch, selectedStandardIds);
                                }}
                                disabled={isEvaluatingBatch}
                                title="强制调用合规引擎对当前试样重新计算"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shadow-2xs border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary cursor-pointer disabled:opacity-50"
                              >
                                <span className={`material-symbols-outlined text-[13px] ${isEvaluatingBatch ? 'animate-spin' : ''}`}>
                                  refresh
                                </span>
                                <span>{isEvaluatingBatch ? '核验中' : '重新核验'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={handleResetGrade}
                                disabled={!isOverridden}
                                title={isOverridden ? '重置为质保书原件声明基准（清除人工指定的牌号与标准）' : '当前已是质保书原件声明基准'}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shadow-2xs ${isOverridden
                                  ? 'border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 cursor-pointer'
                                  : 'border border-outline-variant/30 dark:border-border-dark text-on-surface-variant/40 dark:text-outline-variant/40 cursor-not-allowed bg-transparent'
                                  }`}
                              >
                                <span className="material-symbols-outlined text-[13px]">restart_alt</span>
                                <span>重置</span>
                              </button>
                            </div>
                          </div>

                          <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-3 shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-3 relative">

                            {/* 1. 执行标准 (多选可搜 Combobox) */}
                            <div className="relative">
                              <div className="flex items-center justify-between text-[11px] mb-1">
                                <span className="text-on-surface-variant dark:text-outline-variant font-medium flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px] text-primary">menu_book</span>
                                  <span>执行标准</span>
                                </span>
                                <span className="text-[12px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                                  已选 {selectedStandardIds.length} 部
                                </span>
                              </div>

                              {/* 触发器按键 */}
                              <button
                                type="button"
                                onClick={() => {
                                  setIsStandardSelectorOpen(!isStandardSelectorOpen);
                                  setIsAgreementSelectorOpen(false);
                                }}
                                className={`w-full text-left bg-surface-container-low dark:bg-surface-dark-low border rounded-lg px-3 py-2 transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs ${isStandardSelectorOpen
                                  ? 'border-primary ring-2 ring-primary/20'
                                  : 'border-outline-variant/60 dark:border-border-dark hover:border-primary/60'
                                  }`}
                              >
                                <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                                  {selectedStandardIds.map(stdId => {
                                    const catalogItem = dynamicStandardsCatalog.find(s =>
                                      s.id === stdId ||
                                      normalizeStandardId(s.id) === normalizeStandardId(stdId) ||
                                      normalizeStandardId(s.shortCode) === normalizeStandardId(stdId)
                                    );
                                    return (
                                      <span
                                        key={stdId}
                                        className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-surface-container-high dark:bg-surface-dark-high text-on-surface dark:text-surface-bright border border-outline-variant/40 dark:border-border-dark whitespace-nowrap shadow-2xs"
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
                                      {dynamicStandardsCatalog
                                        .filter(s => {
                                          if (!standardSearchQuery.trim()) return true;
                                          const q = standardSearchQuery.toLowerCase();
                                          return s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.shortCode.toLowerCase().includes(q);
                                        })
                                        .map(std => {
                                          const stdNorm = normalizeStandardId(std.id);
                                          const stdShortNorm = normalizeStandardId(std.shortCode);
                                          const isChecked = selectedStandardIds.some(sel => {
                                            const selNorm = normalizeStandardId(sel);
                                            return selNorm === stdNorm || selNorm === stdShortNorm || selNorm.includes(stdNorm) || stdNorm.includes(selNorm);
                                          });
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
                                                  <span className="font-bold text-on-surface dark:text-surface-bright truncate">
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
                                      <span>共收录 {dynamicStandardsCatalog.length} 部执行标准</span>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* 2. 应用技术协议 (原牌号选择器位置，留给应用技术协议，选项暂留空) */}
                            <div className="relative">
                              <div className="flex items-center justify-between text-[11px] mb-1">
                                <span className="text-on-surface-variant dark:text-outline-variant font-medium flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px] text-primary">description</span>
                                  <span>应用技术协议</span>
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant dark:text-outline-variant border border-outline-variant/30">
                                  占位待完善
                                </span>
                              </div>

                              {/* 触发器按键 */}
                              <button
                                type="button"
                                onClick={() => {
                                  setIsAgreementSelectorOpen(!isAgreementSelectorOpen);
                                  setIsStandardSelectorOpen(false);
                                }}
                                className={`w-full text-left bg-surface-container-low dark:bg-surface-dark-low border border-dashed rounded-lg px-3 py-2 transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs ${isAgreementSelectorOpen
                                  ? 'border-primary ring-2 ring-primary/20'
                                  : 'border-outline-variant/60 dark:border-border-dark hover:border-primary/60'
                                  }`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="material-symbols-outlined text-base text-outline-variant">assignment_late</span>
                                  <span className="text-xs text-on-surface-variant dark:text-outline-variant truncate">
                                    暂无技术协议
                                  </span>
                                </div>
                                <span className={`material-symbols-outlined text-base transition-transform text-on-surface-variant shrink-0 ${isAgreementSelectorOpen ? 'rotate-180 text-primary' : ''}`}>
                                  expand_more
                                </span>
                              </button>

                              {/* 技术协议下拉 Popover */}
                              {isAgreementSelectorOpen && (
                                <>
                                  <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setIsAgreementSelectorOpen(false)}
                                  />
                                  <div className="absolute right-0 top-full mt-2 w-88 sm:w-96 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-2xl p-3 z-50 space-y-2">
                                    <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2">
                                      <span className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-sm text-primary">folder_open</span>
                                        <span>定制技术协议 / 加严条款</span>
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                        待完善
                                      </span>
                                    </div>
                                    <div className="p-4 text-center text-xs text-on-surface-variant dark:text-outline-variant bg-surface-container-low/50 dark:bg-surface-dark-low/50 rounded-lg border border-dashed border-outline-variant/40">
                                      <span className="material-symbols-outlined text-2xl text-outline-variant block mb-1">pending_actions</span>
                                      <span>当前会话暂未挂接定制技术协议</span>
                                      <p className="text-[11px] text-outline-variant mt-1">
                                        选项留空不填充内容，留待后续完善技术协议加严调度体系
                                      </p>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                          </div>
                        </div>

                        {/* 下部：综合判定看板 (双轨制：系统客观计算 55% vs 人工复核判定 45%，独立分栏背景色，吸纳垂直空隙) */}
                        {(() => {
                          const currentBatchState = batchPresentationMap[currentBatch.batchNo];
                          const isResolving = currentBatchState?.stage === 'tier1_ready' && (currentBatchState?.pendingProperties?.length || 0) > 0;
                          const isBatchHitl = isHitl || currentBatchState?.stage === 'hitl_pending';
                          const hasScissors = complianceMatrixItems.some(i => i.isScissorsDifference);
                          const hasMatrixFail = complianceMatrixItems.some(i => i.status === 'FAIL');
                          const sysVerdict: SystemVerdict = isBatchHitl
                            ? 'MANUAL_REVIEW'
                            : (!computedIsPass || hasScissors || hasMatrixFail)
                              ? 'FAIL'
                              : 'PASS';
                          const humanVerdict: HumanVerdict = currentBatch.humanVerdict;
                          const arbitration = resolveFinalDisposition(sysVerdict, humanVerdict, currentBatch.humanVerdictSummary);
                          const badgeMeta = getDispositionBadgeMeta(arbitration.disposition);

                          return (
                            <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark shadow-xs flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden items-stretch">

                              {/* 1. 左侧约 55% (md:col-span-7)：系统客观判定 */}
                              <div className={`md:col-span-7 min-w-0 p-3.5 flex flex-col justify-center space-y-1.5 ${isResolving
                                ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200'
                                : isBatchHitl
                                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                                  : sysVerdict === 'FAIL'
                                    ? 'bg-status-fail-bg text-status-fail-text'
                                    : 'bg-status-pass-bg text-status-pass-text'
                                }`}>
                                <div className="flex items-center gap-2 flex-wrap justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className={`material-symbols-outlined text-xl font-bold shrink-0 ${isResolving
                                      ? 'text-indigo-600 dark:text-indigo-400 animate-spin'
                                      : isBatchHitl
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : ''
                                      }`}>
                                      {isResolving ? 'sync' : isBatchHitl ? 'pending_actions' : sysVerdict === 'FAIL' ? 'cancel' : 'check_circle'}
                                    </span>
                                    <h3 className="text-sm sm:text-base font-bold font-headline whitespace-nowrap">
                                      {isResolving
                                        ? `系统判定: 核心指标就绪 · ${currentBatchState.pendingProperties!.length}项条款对齐中`
                                        : isBatchHitl
                                          ? 'HITL 系统判定: 待人工复核确认'
                                          : sysVerdict === 'FAIL'
                                            ? '系统判定: FAIL 一票否决'
                                            : '系统判定: PASS 全项合规'}
                                    </h3>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold border whitespace-nowrap shadow-2xs ${isResolving
                                    ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700'
                                    : badgeMeta.badgeClass
                                    }`}>
                                    {isResolving ? '流转: 语义消歧中' : `流转: ${arbitration.statusLabel}`}
                                  </span>
                                </div>
                                <p className="text-[12px] opacity-90 font-sans pl-7 line-clamp-2 leading-relaxed" title={hasScissors ? '包含加严剪刀差失效' : computedVerdictSummary}>
                                  {isResolving
                                    ? `已完成全部确定性化学、力学与常规工艺规则比对；正在进行长尾条款受限语义推断`
                                    : hasScissors
                                      ? `【加严剪刀差】存在指标满足通用国标但未达承压订货加严标，按就高严苛原则判定不合格`
                                      : hasMatrixFail
                                        ? `【一票否决】存在不合格指标或包含经质检工程师裁定不予认可的特种非标指标，系统坚决拦截放行`
                                        : (arbitration.auditExplanation || computedVerdictSummary)}
                                </p>
                              </div>

                              {/* 2. 右侧约 45% (md:col-span-5)：人工复核判定 */}
                              <div className={`md:col-span-5 min-w-0 p-3 md:border-l flex items-center justify-between gap-3 ${isHitl
                                ? 'bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 md:border-amber-200/60 dark:md:border-amber-900/40'
                                : currentBatch.humanVerdict === 'REJECT'
                                  ? 'bg-status-fail-bg text-status-fail-text md:border-red-200/60 dark:md:border-red-900/40'
                                  : currentBatch.humanVerdict === 'PASS'
                                    ? 'bg-status-pass-bg text-status-pass-text md:border-emerald-200/60 dark:md:border-emerald-900/40'
                                    : 'bg-surface-container-low dark:bg-surface-dark-low text-on-surface dark:text-surface-bright md:border-outline-variant/50 dark:md:border-border-dark'
                                }`}>
                                {/* 左侧上下排布：上方人工复核标头，下方状态标签 */}
                                <div className="flex flex-col justify-center gap-1 shrink-0">
                                  <div className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
                                    <span className="material-symbols-outlined text-[15px]">person_check</span>
                                    <span>人工复核:</span>
                                  </div>
                                  <div>
                                    {isHitl ? (
                                      <span className="px-2 py-0.5 rounded text-[12px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 shadow-2xs whitespace-nowrap">
                                        待介入
                                      </span>
                                    ) : currentBatch.humanVerdict === 'PASS' ? (
                                      <span className="px-2 py-0.5 rounded text-[12px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 shadow-2xs whitespace-nowrap">
                                        ✓ APPROVE
                                      </span>
                                    ) : currentBatch.humanVerdict === 'REJECT' ? (
                                      <span className="px-2 py-0.5 rounded text-[12px] font-bold bg-red-100 text-red-800 dark:bg-red-950/90 dark:text-red-200 border border-red-300 dark:border-red-700 shadow-2xs whitespace-nowrap">
                                        ✗ REJECT
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded text-[12px] font-medium bg-surface-container-high/70 dark:bg-surface-dark-high/70 border border-outline-variant/30 dark:border-border-dark opacity-80 whitespace-nowrap">
                                        未复核
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* 右侧：操作按钮组 (HITL 状态下先只提供高饱和琥珀黄处理按钮，流转后再显示拒收与审批) */}
                                <div className="flex items-center gap-2 shrink-0">
                                  {isHitl ? (
                                    <button
                                      type="button"
                                      onClick={handleTriggerHitl}
                                      className="h-8 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-xs shadow-xs border border-amber-600/40 flex items-center justify-center gap-1.5 transition-all cursor-pointer ring-2 ring-amber-400/30 whitespace-nowrap"
                                    >
                                      <span className="material-symbols-outlined text-base">emergency_home</span>
                                      <span>处理</span>
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleSetHumanVerdict(currentBatch?.humanVerdict === 'REJECT' ? null : 'REJECT')}
                                        title={currentBatch?.humanVerdict === 'REJECT' ? '当前已标记拒收，再次点击可撤销' : '标记为人工拒收'}
                                        className={`h-8 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap shadow-2xs ${currentBatch?.humanVerdict === 'REJECT'
                                          ? 'bg-red-600 hover:bg-red-700 text-white shadow-xs ring-2 ring-red-400/50'
                                          : 'border border-red-300 dark:border-red-800/60 text-red-700 dark:text-red-400 bg-surface-container-lowest dark:bg-surface-dark hover:bg-red-50 dark:hover:bg-red-950/40'
                                          }`}
                                      >
                                        <span>拒收</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSetHumanVerdict(currentBatch?.humanVerdict === 'PASS' ? null : 'PASS')}
                                        title={currentBatch?.humanVerdict === 'PASS' ? '当前已核准通过，再次点击可撤销' : '核准为人工通过'}
                                        className={`h-8 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap shadow-2xs ${currentBatch?.humanVerdict === 'PASS'
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
                          );
                        })()}

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
                              执行标准条款规范与质保书提取测量值同行左右相邻紧凑对照
                            </p>
                          </div>
                        </div>

                        {/* 分类 Filter 页签 */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full custom-scrollbar">
                          {STEP3_TABS.map(tab => {
                            const isActive = step3Category === tab.key;
                            const isIssueTabWithProblems = tab.key === 'issues' && tab.count > 0;
                            return (
                              <button
                                key={tab.key}
                                type="button"
                                onClick={() => setStep3Category(tab.key)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${isActive
                                  ? (isIssueTabWithProblems
                                    ? 'bg-red-600 text-white shadow-xs'
                                    : 'bg-primary text-on-primary shadow-xs')
                                  : (isIssueTabWithProblems
                                    ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-900/40'
                                    : 'bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant dark:text-outline-variant hover:bg-surface-container-high')
                                  }`}
                              >
                                <span>{tab.label}</span>
                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isActive
                                  ? 'bg-white/20 text-white'
                                  : (isIssueTabWithProblems
                                    ? 'bg-red-200/80 dark:bg-red-900/80 text-red-900 dark:text-red-100'
                                    : 'bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant')
                                  }`}>
                                  {tab.count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 全景比对大表 (支持外层视口平滑吸顶冻结表头) */}
                      <div className="border border-outline-variant/40 dark:border-border-dark rounded-xl shadow-2xs relative">
                        <table className="w-full text-left text-xs">
                          <thead className={`text-[11px] text-on-surface-variant dark:text-outline-variant ${isCapturing ? '' : 'sticky top-0 z-20'}`}>
                            <tr className="bg-surface-container-low dark:bg-surface-dark-low">
                              <th className={`px-3.5 py-2.5 w-20 min-w-[75px] whitespace-nowrap bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/60 dark:border-border-dark shadow-2xs first:rounded-tl-xl ${isCapturing ? '' : 'sticky top-0 z-20'}`}>类别</th>
                              <th className={`px-3.5 py-2.5 min-w-[150px] bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/60 dark:border-border-dark shadow-2xs ${isCapturing ? '' : 'sticky top-0 z-20'}`}>检验项目 / 指标</th>
                              <th className={`px-3.5 py-2.5 min-w-[170px] w-48 bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/60 dark:border-border-dark shadow-2xs ${isCapturing ? '' : 'sticky top-0 z-20'}`}>执行标准要求 / 条款规范</th>
                              <th className={`px-3.5 py-2.5 min-w-[160px] bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/60 dark:border-border-dark shadow-2xs ${isCapturing ? '' : 'sticky top-0 z-20'}`}>报告测量值 / 实际结果</th>
                              <th className={`px-3.5 py-2.5 w-28 min-w-[100px] bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/60 dark:border-border-dark shadow-2xs ${isCapturing ? '' : 'sticky top-0 z-20'}`}>偏差量 / 吻合度</th>
                              <th className={`px-3.5 py-2.5 w-24 whitespace-nowrap bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/60 dark:border-border-dark shadow-2xs ${isCapturing ? '' : 'sticky top-0 z-20'}`}>判定状态</th>
                              <th className={`px-3.5 py-2.5 min-w-[300px] bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/60 dark:border-border-dark shadow-2xs last:rounded-tr-xl ${isCapturing ? '' : 'sticky top-0 z-20'}`}>判定逻辑 / 审核说明</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20 dark:divide-border-dark/60">
                            {isEvaluatingBatch && displayedComplianceItems.length === 0 ? (
                              Array.from({ length: 6 }).map((_, idx) => (
                                <tr key={`skeleton_${idx}`} className="animate-pulse">
                                  <td className="px-3.5 py-3">
                                    <div className="h-5 w-12 bg-surface-container-high dark:bg-surface-dark-high rounded" />
                                  </td>
                                  <td className="px-3.5 py-3">
                                    <div className="h-4 w-28 bg-surface-container-high dark:bg-surface-dark-high rounded" />
                                  </td>
                                  <td className="px-3.5 py-3">
                                    <div className="h-4 w-40 bg-surface-container-high dark:bg-surface-dark-high rounded" />
                                  </td>
                                  <td className="px-3.5 py-3">
                                    <div className="h-4 w-20 bg-surface-container-high dark:bg-surface-dark-high rounded" />
                                  </td>
                                  <td className="px-3.5 py-3">
                                    <div className="h-4 w-24 bg-surface-container-high dark:bg-surface-dark-high rounded" />
                                  </td>
                                  <td className="px-3.5 py-3">
                                    <div className="h-5 w-16 bg-surface-container-high dark:bg-surface-dark-high rounded" />
                                  </td>
                                  <td className="px-3.5 py-3">
                                    <div className="h-4 w-32 bg-surface-container-high dark:bg-surface-dark-high rounded" />
                                  </td>
                                </tr>
                              ))
                            ) : displayedComplianceItems.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="px-3.5 py-8 text-center text-on-surface-variant dark:text-outline-variant">
                                  {isEvaluatingBatch ? (
                                    <>
                                      <span className="material-symbols-outlined text-2xl mb-1 block">rule</span>
                                      <span>合规检验计算中...</span>
                                    </>
                                  ) : step3Category === 'issues' ? (
                                    <div className="flex flex-col items-center justify-center space-y-1 py-3">
                                      <span className="material-symbols-outlined text-3xl text-emerald-600 dark:text-emerald-400 mb-1 block">check_circle</span>
                                      <p className="text-xs font-bold text-on-surface dark:text-surface-bright">
                                        本批次所有指标均达标，未发现不合格或待复核问题项
                                      </p>
                                      <p className="text-[11px] text-on-surface-variant dark:text-outline-variant">
                                        当前批次全部 {complianceMatrixItems.length} 项检验指标均满足执行标准规范要求
                                      </p>
                                    </div>
                                  ) : (
                                    <>
                                      <span className="material-symbols-outlined text-2xl mb-1 block">rule</span>
                                      <span>暂无对应分类的核验数据</span>
                                    </>
                                  )}
                                </td>
                              </tr>
                            ) : (
                              displayedComplianceItems.map((row) => (
                                <tr
                                  key={row.id}
                                  className="hover:bg-surface-container-low/40 dark:hover:bg-surface-dark-low/40 transition-colors align-top"
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
                                    {(() => {
                                      const evals = row.multiStandardEvaluations;
                                      if (!evals || evals.length === 0) {
                                        // 兜底兼容：若只有纯文本且含 [标准名] 方括号，拆分为指标与徽章
                                        const match = row.standardRequirement?.match(/^(.*?)\s*\[(.*?)\]$/);
                                        if (match) {
                                          const [, reqText, stdTag] = match;
                                          return (
                                            <div className="flex flex-col items-start gap-1.5 py-0.5">
                                              <div className="font-bold text-[12px] text-on-surface dark:text-surface-bright flex items-center gap-1">
                                                <span>{reqText}</span>
                                              </div>
                                              <div className="flex flex-col items-start gap-1 w-full">
                                                <span
                                                  className="px-1.5 py-0.5 rounded text-[10px] border whitespace-nowrap inline-flex items-center bg-surface-container-high/70 dark:bg-surface-dark-high/70 text-on-surface-variant dark:text-outline-variant border-outline-variant/30 dark:border-border-dark leading-tight"
                                                  title={stdTag}
                                                >
                                                  {stdTag}
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        }

                                        return (
                                          <div className="py-0.5 font-bold text-[12px] text-on-surface dark:text-surface-bright">
                                            {row.standardRequirement}
                                          </div>
                                        );
                                      }

                                      // 判断是否单标准或所有参与标准指标要求完全一致 (排除无强制指标/独占项)
                                      const activeEvals = evals.filter((e) => !e.requirement_text.includes('无强制指标'));
                                      const firstReq = activeEvals[0]?.requirement_text?.trim() || evals[0]!.requirement_text.trim();
                                      const isAllIdentical = evals.length === 1 || (
                                        activeEvals.length > 1 && activeEvals.every(
                                          (e) => e.requirement_text.trim() === firstReq
                                        )
                                      );

                                      if (isAllIdentical) {
                                        // 【场景 A：单标准或各标准指标完全一致】
                                        // 首行突出加粗展示主指标；下方垂直堆叠各标准微型药丸徽章，不重复输出数字
                                        return (
                                          <div className="flex flex-col items-start gap-1.5 py-0.5">
                                            <div className="font-bold text-[12px] text-on-surface dark:text-surface-bright flex items-center gap-1">
                                              <span>{firstReq}</span>
                                              {/* <span className="text-amber-600 dark:text-amber-400 font-black text-[11px]" title="执行标准统一要求">★</span> */}
                                            </div>
                                            <div className="flex flex-col items-start gap-1 w-full">
                                              {evals.map((ev) => (
                                                <span
                                                  key={ev.standard_id}
                                                  className="px-1.5 py-0.5 rounded text-[10px] border whitespace-nowrap inline-flex items-center bg-surface-container-high/70 dark:bg-surface-dark-high/70 text-on-surface-variant dark:text-outline-variant border-outline-variant/30 dark:border-border-dark leading-tight"
                                                  title={`${ev.standard_id} (单标评定: ${ev.status})`}
                                                >
                                                  {ev.standard_short}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      }

                                      // 【场景 B：存在剪刀差差异或独占加严】
                                      // 首行突出加粗展示当前起主导控制作用的严苛基准指标；下方垂直分行分别展开各标准的具体要求
                                      const governingEval = evals.find((e) => e.is_governing) || evals[0]!;

                                      return (
                                        <div className="flex flex-col items-start gap-1.5 py-0.5">
                                          <div className="font-bold text-[12px] text-on-surface dark:text-surface-bright flex items-center gap-1">
                                            <span>{governingEval.requirement_text}</span>
                                            {/* <span className="text-amber-600 dark:text-amber-400 font-black text-[11px]" title="严苛主导控制指标">★</span> */}
                                          </div>
                                          <div className="flex flex-col items-start gap-1 w-full">
                                            {evals.map((ev) => (
                                              <span
                                                key={ev.standard_id}
                                                className={`px-1.5 py-0.5 rounded text-[10px] border whitespace-nowrap inline-flex items-center leading-tight ${ev.is_governing
                                                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-semibold shadow-2xs'
                                                  : 'bg-surface-container-high/60 dark:bg-surface-dark-high/60 text-on-surface-variant dark:text-outline-variant border-outline-variant/25 dark:border-border-dark'
                                                  }`}
                                                title={`${ev.standard_id}: ${ev.requirement_text} (单标评定: ${ev.status})`}
                                              >
                                                <span>{ev.standard_short}: {ev.requirement_text}</span>
                                                {ev.is_governing && <span className="ml-1 text-amber-600 dark:text-amber-400 font-black text-[9px]">★</span>}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </td>
                                  <td className="px-3.5 py-2.5 font-bold text-primary dark:text-primary-fixed-dim">
                                    {row.measuredValue}
                                  </td>
                                  <td className={`px-3.5 py-2.5 font-medium ${row.isDeviationWarning
                                    ? 'text-status-fail-text font-bold'
                                    : 'text-on-surface-variant dark:text-outline-variant'
                                    }`}>
                                    {row.deviation}
                                  </td>
                                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                                    <span className={`px-2.5 py-0.5 rounded text-[12px] font-bold inline-flex items-center justify-center leading-none ${row.status === 'PASS'
                                      ? 'bg-status-pass-bg text-status-pass-text'
                                      : row.status === 'FAIL'
                                        ? 'bg-status-fail-bg text-status-fail-text font-black'
                                        : row.status === 'HITL'
                                          ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 shadow-2xs'
                                          : 'bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant dark:text-outline-variant'
                                      }`}>
                                      {row.statusLabel}
                                    </span>
                                  </td>
                                  <td className="px-3.5 py-2.5 text-[11px] text-on-surface dark:text-surface-bright leading-relaxed">
                                    <div className="flex items-start gap-1.5">
                                      {row.detailTag && (
                                        <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold tracking-tight shrink-0 select-none ${row.detailTag.color}`}>
                                          {row.detailTag.label}
                                        </span>
                                      )}
                                      <span className="flex-1">{row.ruleBasis}</span>
                                    </div>
                                    {row.isScissorsDifference && row.scissorsAttribution && (
                                      <div className="mt-2 p-2 rounded-md bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300/60 dark:border-amber-700/50 text-left">
                                        <div className="flex items-start gap-1.5 text-[11px] text-amber-900 dark:text-amber-200">
                                          <div className="relative group/tooltip inline-flex items-center shrink-0 mt-0.5">
                                            <span
                                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-200/90 dark:bg-amber-900/90 text-amber-950 dark:text-amber-100 text-[10px] font-bold tracking-tight cursor-help shadow-2xs select-none hover:bg-amber-300 dark:hover:bg-amber-800 transition-colors"
                                            >
                                              {/* <span>剪刀差</span> */}
                                              <span
                                                className="material-symbols-outlined !text-[12px] text-amber-800 dark:text-amber-200 leading-none"
                                                style={{ fontSize: '12px' }}
                                              >
                                                info
                                              </span>
                                            </span>

                                            {/* 鼠标 hover 在 ℹ️ 图标/标签上时浮现的术语说明气泡卡片 */}
                                            <div className="absolute left-0 top-full mt-1.5 hidden group-hover/tooltip:flex flex-col items-start w-72 sm:w-80 p-2.5 bg-inverse-surface text-inverse-on-surface text-[11px] rounded-lg shadow-xl z-50 pointer-events-none transition-all border border-outline-variant/30 leading-relaxed">
                                              <div className="font-bold flex items-center gap-1.5 text-amber-300 mb-1">
                                                <span className="material-symbols-outlined text-sm">info</span>
                                                <span>加严剪刀差 · 术语说明</span>
                                              </div>
                                              <p className="text-inverse-on-surface/90 text-[10.5px] leading-normal">
                                                加严剪刀差指物资实测指标已达到通用制造基础标准（如推荐国标 GB/T），但未能达到特种设备承压标准（如行业标 NB/T）或采购技术协议提出的更严苛指标。系统遵循严苛就高原则裁定全单不合格，责任归属于订货加严条款。
                                              </p>
                                              <div className="absolute bottom-full left-4 border-4 border-transparent border-b-inverse-surface" />
                                            </div>
                                          </div>
                                          <span className="leading-snug">{row.scissorsAttribution}</span>
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}

                            {/* 态 2：语义对齐中微光呼吸行 (Tier 2 Smart-Path 异步推断中) */}
                            {currentBatchState?.pendingProperties && currentBatchState.pendingProperties.length > 0 && currentBatchState.stage !== 'completed' && (
                              currentBatchState.pendingProperties.map((prop: PropertyResolutionCandidate, pIdx: number) => (
                                <tr
                                  key={`resolving_prop_${pIdx}`}
                                  className="bg-indigo-50/50 dark:bg-indigo-950/20 border-l-4 border-l-indigo-500 animate-pulse transition-all align-top"
                                >
                                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                                    <span className="px-2 py-0.5 rounded text-[11px] font-bold border whitespace-nowrap inline-flex items-center justify-center text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">
                                      长尾待决
                                    </span>
                                  </td>
                                  <td className="px-3.5 py-2.5">
                                    <div className="flex items-center gap-1.5 font-bold text-indigo-900 dark:text-indigo-200 text-xs">
                                      <span className="material-symbols-outlined text-sm animate-spin text-indigo-600 dark:text-indigo-400">sync</span>
                                      <span>{prop.raw_name}</span>
                                    </div>
                                    <div className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-0.5">
                                      原始提取项目 · Tier 2 语义条款对齐中
                                    </div>
                                  </td>
                                  <td className="px-3.5 py-2.5">
                                    <div className="flex items-center gap-1.5 text-xs text-on-surface-variant dark:text-outline-variant">
                                      <span className="inline-block w-24 h-3 rounded bg-indigo-200/60 dark:bg-indigo-800/40 animate-pulse" />
                                      <span className="text-[11px]">匹配切片条款中...</span>
                                    </div>
                                  </td>
                                  <td className="px-3.5 py-2.5  font-bold text-xs text-on-surface dark:text-surface-bright">
                                    {String(prop.raw_value ?? '')} {prop.unit || ''}
                                  </td>
                                  <td className="px-3.5 py-2.5  text-[11px] text-outline-variant">
                                    --
                                  </td>
                                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700 inline-flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                                      <span>对齐中</span>
                                    </span>
                                  </td>
                                  <td className="px-3.5 py-2.5 text-xs text-indigo-800 dark:text-indigo-300">
                                    <div className="flex items-center gap-1">
                                      <span className="material-symbols-outlined text-sm text-indigo-600">psychology</span>
                                      <span>受限候选集语义推断中，置信度达标将自动合入合规报告</span>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}

                            {/* 态 3：行内人机协同 (HITL) 待核实确认交互卡片 */}
                            {currentBatchState?.stage === 'hitl_pending' && currentBatchState.hitlContext && (
                              <tr className="bg-amber-50/70 dark:bg-amber-950/40 border-l-4 border-l-amber-500 transition-all">
                                <td colSpan={7} className="p-3">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 shadow-xs">
                                    <div className="flex items-start gap-2.5">
                                      <span className="material-symbols-outlined text-xl text-amber-600 dark:text-amber-400 mt-0.5 shrink-0">
                                        handshake
                                      </span>
                                      <div>
                                        <div className="text-xs font-bold text-amber-900 dark:text-amber-100 flex items-center gap-2">
                                          <span>人机协同 (HITL) 待核实确认</span>
                                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 font-sans font-medium">
                                            {formatHitlReasonBadge(currentBatchState.hitlContext.reason)}
                                          </span>
                                        </div>
                                        <p className="text-[12px] text-amber-800 dark:text-amber-200 mt-1 leading-relaxed">
                                          {currentBatchState.hitlContext.prompt_message}
                                        </p>
                                        {(() => {
                                          const ctx = currentBatchState.hitlContext;
                                          if (ctx.reason === 'UNKNOWN_GRADE') {
                                            const topCandidate = ctx.candidate_grades?.[0];
                                            const candidateCode = topCandidate?.code || (ctx.suggestions?.default ? String(ctx.suggestions.default) : '06Cr19Ni10 (S30408)');
                                            const matchText = topCandidate?.match ? ` [${topCandidate.match}]` : '';
                                            return (
                                              <div className="mt-2 flex items-center gap-2 text-[11px] text-amber-800 dark:text-amber-300 font-sans">
                                                <span className="font-semibold">AI 候选推荐:</span>
                                                <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/80 border border-amber-300 dark:border-amber-700 font-sans font-bold">
                                                  首选建议: {candidateCode}{matchText}
                                                </span>
                                              </div>
                                            );
                                          }

                                          if (ctx.suggestions && Object.keys(ctx.suggestions).length > 0) {
                                            return (
                                              <div className="mt-2 flex items-center gap-2 text-[11px] text-amber-800 dark:text-amber-300 font-sans">
                                                <span className="font-semibold">AI 候选推荐:</span>
                                                {Object.entries(ctx.suggestions).map(([raw, target]) => (
                                                  <span key={raw} className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/80 border border-amber-300 dark:border-amber-700 font-sans font-bold">
                                                    {raw === 'default' ? '默认建议' : raw} → {String(target)}
                                                  </span>
                                                ))}
                                              </div>
                                            );
                                          }

                                          return null;
                                        })()}
                                      </div>
                                    </div>

                                    {/* 行内快捷采纳与展开复核操作 */}
                                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                      {((currentBatchState.hitlContext.candidate_grades && currentBatchState.hitlContext.candidate_grades.length > 0) ||
                                        (currentBatchState.hitlContext.suggestions && Object.keys(currentBatchState.hitlContext.suggestions).length > 0)) && (
                                          <button
                                            type="button"
                                            onClick={() => handleInlineAdoptHitl(currentBatch.batchNo, currentBatchState.hitlContext)}
                                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                                          >
                                            <span className="material-symbols-outlined text-sm">done_all</span>
                                            <span>采纳推荐项</span>
                                          </button>
                                        )}
                                      <button
                                        type="button"
                                        onClick={handleTriggerHitl}
                                        className="px-3 py-1.5 rounded-lg border border-amber-400 dark:border-amber-600 text-amber-900 dark:text-amber-200 bg-surface-container-lowest dark:bg-surface-dark hover:bg-amber-100/50 dark:hover:bg-amber-900/30 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                                      >
                                        <span className="material-symbols-outlined text-sm">tune</span>
                                        <span>人工细化复核</span>
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
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

              {/* 顶部统一标题与两层树状批次选择条 (固定在顶部，设置 z-40 确保下拉菜单浮于上方) */}
              <div className="relative z-40">
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

              {(!currentDoc || !currentBatch) ? (
                <div className="flex flex-col items-center justify-center text-center p-12 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-xs">
                  <div className="w-16 h-16 rounded-2xl bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-3xl">description</span>
                  </div>
                  <h3 className="text-sm font-bold text-on-surface dark:text-surface-bright mb-1.5">
                    暂无活动归档报告
                  </h3>
                  <p className="text-xs text-on-surface-variant dark:text-outline-variant max-w-sm mb-6">
                    请先在步骤 1 上传真实质保证书并完成核验比对。
                  </p>
                  <button
                    type="button"
                    onClick={() => goToStep(0)}
                    className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">arrow_back</span>
                    <span>前往步骤 1 上传文档</span>
                  </button>
                </div>
              ) : (
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
                            REPORT NO: {currentBatch?.reportNo || '--'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px]  border-b pb-3 border-outline-variant/30 text-on-surface">
                          <div>
                            <span className="text-on-surface-variant block">生成时间:</span>
                            <strong>{new Date().toISOString().slice(0, 16).replace('T', ' ')}</strong>
                          </div>
                          <div>
                            <span className="text-on-surface-variant block">检验员:</span>
                            <strong>{currentBatch.inspector || 'QC-Engineer'}</strong>
                          </div>
                          <div>
                            <span className="text-on-surface-variant block">标准依据:</span>
                            <strong>{currentBatch.standard || activeStandard || '--'}</strong>
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
                            <span>{currentBatch.heatNo || '--'}</span>
                          </div>
                          <div className="flex justify-between text-on-surface">
                            <span className="text-on-surface-variant">批次:</span>
                            <span>{currentBatch.batchNo || '--'}</span>
                          </div>
                          <div className="flex justify-between text-on-surface">
                            <span className="text-on-surface-variant">牌号:</span>
                            <span className="text-primary font-bold">{currentBatch.grade || activeGrade || '--'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-outline-variant/30 flex justify-between items-end text-[10px]  text-on-surface-variant relative z-10">
                        <span className="truncate max-w-[180px]">指纹: {currentBatch.sha256Hash ? `${currentBatch.sha256Hash.slice(0, 16)}...` : session.sessionId.replace(/-/g, '').slice(0, 16)}</span>
                        <div className="text-right shrink-0">
                          <span>电子签名: </span>
                          <strong className="italic text-primary font-serif">{currentBatch.inspector || 'QA-Signature'}</strong>
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

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs ">
                        <div>
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-1">存证哈希值 (SHA-256)</span>
                          <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2 text-on-surface dark:text-surface-bright truncate">
                            {currentBatch?.sha256Hash || session.sessionId.replace(/-/g, '').slice(0, 32)}
                          </div>
                        </div>

                        <div>
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-1">操作员 ID</span>
                          <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2 text-on-surface dark:text-surface-bright">
                            {currentBatch?.inspector || 'QC-Engineer (智能核验员)'}
                          </div>
                        </div>

                        <div>
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-1">核验总耗时</span>
                          <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2 text-on-surface dark:text-surface-bright">
                            {totalCombinedMetrics.totalDurationSeconds > 0 ? `${totalCombinedMetrics.totalDurationSeconds.toFixed(1)}s` : '1.2s'} (文档提取 {totalCombinedMetrics.parseDurationSeconds.toFixed(1)}s + 智能比对 {totalCombinedMetrics.auditDurationSeconds.toFixed(1)}s)
                          </div>
                        </div>

                        <div>
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-1">规则引擎版本</span>
                          <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2 text-on-surface dark:text-surface-bright">
                            NormScale-Core v2.4.0 (GB/T 13296)
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
                          <span className=" text-xs text-on-surface dark:text-surface-bright font-bold">
                          //archive-storage/records/{new Date().toISOString().slice(0, 10).replace(/-/g, '/')}/{session.sessionId}/{currentBatch?.batchNo || 'BATCH-01'}/
                          </span>
                        </div>
                      </div>
                      <button type="button" className="text-primary dark:text-primary-fixed-dim text-xs font-bold hover:underline">
                        修改路径
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div >

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
                disabled={queuedDocs.length === 0}
                className={`px-5 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 ${queuedDocs.length === 0
                  ? 'bg-outline-variant/40 dark:bg-border-dark/40 text-on-surface-variant/40 cursor-not-allowed'
                  : 'bg-primary hover:bg-primary-container text-on-primary cursor-pointer'
                  }`}
              >
                <span>解析文档，核对数据</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            )}

            {currentStep === 1 && (
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>核对完成，比对标准</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            )}

            {currentStep === 2 && (
              <>
                {/* 次要按钮 1：保存截图（分体式上拉选择菜单 Split Button） */}
                <div ref={screenshotMenuRef} className="relative inline-flex items-stretch rounded-lg shadow-2xs border border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark">
                  {/* 左侧主触发按钮：默认直接截取当前页面 */}
                  <button
                    type="button"
                    onClick={handleSaveCurrentBatchScreenshot}
                    disabled={isCapturing}
                    className="px-3.5 py-2 rounded-l-lg text-xs font-bold text-on-surface dark:text-surface-bright hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    title="快捷导出当前选中批次的比对结果高清快照"
                  >
                    <span className="material-symbols-outlined text-base text-primary dark:text-primary-fixed-dim">
                      {isCapturing ? 'hourglass_top' : 'photo_camera'}
                    </span>
                    <span>{isCapturing ? '生成截图中...' : '保存当前页面截图'}</span>
                  </button>

                  {/* 中间细分割线 */}
                  <div className="w-px bg-outline-variant/60 dark:bg-border-dark self-stretch my-1.5" />

                  {/* 右侧上拉选择触发器小箭头按钮 */}
                  <button
                    type="button"
                    onClick={() => setIsScreenshotMenuOpen(prev => !prev)}
                    disabled={isCapturing}
                    className="px-2 py-2 rounded-r-lg text-on-surface-variant hover:text-on-surface dark:text-outline-variant dark:hover:text-surface-bright hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors flex items-center justify-center disabled:opacity-50 cursor-pointer"
                    title="选择截图保存范围（单批次/当前文档/全会话）"
                  >
                    <span
                      className={`material-symbols-outlined text-base text-on-surface-variant dark:text-outline-variant transition-transform duration-200 ${isScreenshotMenuOpen ? 'rotate-180' : ''
                        }`}
                    >
                      keyboard_arrow_up
                    </span>
                  </button>

                  {/* 向上展开的浮层选择菜单 */}
                  {isScreenshotMenuOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-72 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant dark:border-border-dark rounded-xl shadow-xl p-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                      <div className="px-2.5 py-1.5 text-[11px] font-semibold text-on-surface-variant/80 dark:text-outline-variant border-b border-outline-variant/40 dark:border-border-dark/60 mb-1 flex items-center justify-between">
                        <span>选择截图范围</span>
                      </div>

                      {/* 选项 1：保存当前页面截图 */}
                      <button
                        type="button"
                        onClick={handleSaveCurrentBatchScreenshot}
                        className="w-full text-left p-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors flex items-start gap-2.5 cursor-pointer group"
                      >
                        <span className="material-symbols-outlined text-lg text-primary dark:text-primary-fixed-dim shrink-0 mt-0.5">
                          photo_camera
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center justify-between">
                            <span>保存当前页面截图</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container dark:bg-surface-dark-high text-on-surface-variant">
                              单批次
                            </span>
                          </div>
                          <div className="text-[11px] text-on-surface-variant dark:text-outline-variant truncate mt-0.5">
                            仅当前选中的批次 ({currentBatch?.batchNo || '当前批次'})
                          </div>
                        </div>
                      </button>

                      {/* 选项 2：保存当前文档所有批次截图 */}
                      <button
                        type="button"
                        onClick={handleSaveCurrentDocAllBatchesScreenshot}
                        className="w-full text-left p-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors flex items-start gap-2.5 cursor-pointer group"
                      >
                        <span className="material-symbols-outlined text-lg text-primary dark:text-primary-fixed-dim shrink-0 mt-0.5">
                          tab
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center justify-between">
                            <span>保存当前文档所有批次截图</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary dark:text-primary-fixed-dim font-bold">
                              {currentDoc?.batches?.length || 0} 个批次
                            </span>
                          </div>
                          <div className="text-[11px] text-on-surface-variant dark:text-outline-variant truncate mt-0.5">
                            当前文档共 {currentDoc?.batches?.length || 0} 个批次，顺序导出
                          </div>
                        </div>
                      </button>

                      {/* 选项 3：保存当前会话所有批次截图 */}
                      <button
                        type="button"
                        onClick={handleSaveSessionAllBatchesScreenshot}
                        className="w-full text-left p-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors flex items-start gap-2.5 cursor-pointer group"
                      >
                        <span className="material-symbols-outlined text-lg text-primary dark:text-primary-fixed-dim shrink-0 mt-0.5">
                          folder_zip
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center justify-between">
                            <span>保存当前会话所有批次截图</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary-container/60 text-secondary font-bold">
                              {totalBatchesCount} 个批次
                            </span>
                          </div>
                          <div className="text-[11px] text-on-surface-variant dark:text-outline-variant truncate mt-0.5">
                            涵盖 {session.documents?.length || 0} 份文档，共 {totalBatchesCount} 个批次
                          </div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

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
      {(() => {
        // 动态提取当前批次有效核验规则作为 HITL 动态候选条款
        let candidateRulesForHitl: Array<{ key: string; name: string; category?: string; requirement_text?: string; unit?: string }> | undefined = undefined;
        const targetReport = currentBatch?.auditReport || (selectedBatchNo ? batchPresentationMap[selectedBatchNo]?.report : undefined);
        if (targetReport && Array.isArray(targetReport.item_results) && targetReport.item_results.length > 0) {
          candidateRulesForHitl = targetReport.item_results.map(r => ({
            key: r.property_key,
            name: r.display_name,
            category: r.category,
            requirement_text: r.dual_standard_requirement_text || r.standard_requirement_text,
            unit: (r as any).unit || '',
          }));
        }

        return (
          <HitlDrawer
            isOpen={isHitlDrawerOpen}
            onClose={() => setIsHitlDrawerOpen(false)}
            hitlContext={activeHitlContext}
            taskId={
              (selectedBatchNo && batchPresentationMap[selectedBatchNo]?.taskId)
                ? `TK-${batchPresentationMap[selectedBatchNo]!.taskId!}`
                : (currentBatch ? `TK-${currentBatch.batchNo}` : 'TK-PENDING')
            }
            selectedStandardIds={selectedStandardIds}
            availableStandards={standardsData?.standards}
            candidateRules={candidateRulesForHitl}
            onSubmitResume={handleResolveHitl}
            isSubmitting={isHitlSubmitting}
          />
        );
      })()}
    </div >
  );
};
