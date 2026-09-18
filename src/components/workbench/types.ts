import { StandardOverviewDto, PresetSampleDto } from '@/lib/api-client.ts';
import { AuditReport } from '@/schemas/report.schema.ts';
import { InspectionSession, SessionDocument } from '@/types/session.ts';
import { HitlInterruptContext, HumanCorrectionInput, PropertyResolutionCandidate } from '@/workflow/state.interface.ts';

/**
 * 严格去重会话文档实体列表（基于 MD5 或文件名）
 * 若发现同名或相同 MD5 的重复实体，优先保留包含解析批次或切图数据的完整实体
 */
export function deduplicateSessionDocuments(docs: SessionDocument[]): SessionDocument[] {
  const list: SessionDocument[] = [];

  for (const doc of docs) {
    const existingIndex = list.findIndex(existing => {
      if (existing.docId && doc.docId && existing.docId === doc.docId) return true;
      if (existing.md5 && doc.md5 && existing.md5 === doc.md5) return true;
      if (existing.filename && doc.filename && existing.filename === doc.filename) return true;
      return false;
    });

    if (existingIndex === -1) {
      list.push(doc);
    } else {
      const existing = list[existingIndex];
      if (existing) {
        const existingScore = (existing.pages?.length || 0) + (existing.batches?.length || 0);
        const currentScore = (doc.pages?.length || 0) + (doc.batches?.length || 0);
        if (currentScore >= existingScore || (!existing.md5 && doc.md5)) {
          list[existingIndex] = {
            ...existing,
            ...doc,
            pages: (doc.pages && doc.pages.length > 0) ? doc.pages : existing.pages,
            batches: (doc.batches && doc.batches.length > 0) ? doc.batches : existing.batches,
            md5: doc.md5 || existing.md5,
          };
        }
      }
    }
  }

  return list;
}

/**
 * 工作台顶层属性接口
 */
export interface WaterfallWorkbenchProps {
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

/**
 * 标准目录牌号结构
 */
export interface StandardCatalogGrade {
  code: string;
  primaryGrade: string;
  display: string;
  description?: string;
}

/**
 * 标准规则库目录项
 */
export interface StandardCatalogItem {
  id: string;
  shortCode: string;
  name: string;
  category: '承压订货技术条件' | '产品制造通用标准' | '其他规范';
  badgeColor: string;
  grades: StandardCatalogGrade[];
}

/**
 * 待处理文档队列条目
 */
export interface QueuedDocItem {
  id: string;
  filename: string;
  status: '就绪' | '上传中' | '解析中' | '预处理中...' | '已命中解析缓存';
  size: string;
  date: string;
  md5?: string;
  pageCount?: number;
}

/**
 * 历史已解析缓存文档条目
 */
export interface CachedDocItem {
  id: string;
  filename: string;
  date: string;
  size: string;
  md5?: string;
  cacheLevel?: 'L1' | 'L2' | 'L3';
}

/**
 * 单批次展示与流式核验状态池模型
 */
export interface BatchPresentationState {
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
}

/**
 * 全局 Toast 通知状态
 */
export interface ToastInfo {
  message: string;
  type: 'success' | 'error' | 'info';
}

/**
 * 步骤 2 提取指标行结构
 */
export interface ExtractRowItem {
  key: string;
  label: string;
  value: string | number;
  status: 'CONFIRMED' | 'EDITED' | 'WARNING';
  category: string;
  isLocked?: boolean;
}

/**
 * HITL 挂起原因徽章格式化
 */
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

/**
 * 标准规则库目录为空异常（执行比对时 standardsData 缺失）
 */
export class StandardCatalogEmptyError extends Error {
  constructor(message: string = '标准规则库目录未初始化或为空，无法执行合规比对') {
    super(message);
    this.name = 'StandardCatalogEmptyError';
  }
}

/**
 * 测试用例原件或元数据缺失异常
 */
export class ScenarioSampleMissingError extends Error {
  constructor(message: string = '测试用例原件或元数据缺失，无法装载至检验队列') {
    super(message);
    this.name = 'ScenarioSampleMissingError';
  }
}

/**
 * 批次独立展示状态
 */
export interface BatchPresentationState {
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
}

/**
 * 批次合规比对开销度量
 */
export interface AuditMetricsState {
  batchRecords: Record<string, { durationMs: number; inputTokens: number; outputTokens: number }>;
  historical: { durationMs: number; inputTokens: number; outputTokens: number };
}

/**
 * 综合 Token 与耗时计量大盘
 */
export interface TotalCombinedMetrics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationSeconds: number;
  parseInputTokens: number;
  parseOutputTokens: number;
  parseDurationSeconds: number;
  auditInputTokens: number;
  auditOutputTokens: number;
  auditDurationSeconds: number;
  activeConcurrency: number;
  readyDocsCount: number;
  totalDocsCount: number;
}
