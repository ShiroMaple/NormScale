import { Annotation } from '@langchain/langgraph';
import { RawCertificatePayload } from '../extractor/extractor.interface';
import { CertificateExtract } from '../schemas/certificate.schema';
import { NormalizationAuditLog } from '../normalizer/certificate-normalizer';
import { StandardRuleSet, SpecificationSlice } from '../schemas/standard.schema';
import { AuditReport, RuleEvaluationItemResult, AuditTraceItem } from '../schemas/report.schema';
import { ITraceCollector } from '../logger/logger.interface';

/**
 * ============================================================================
 * NormScale 状态图工作流状态模型与契约 (Quality Audit State & Channels)
 * ============================================================================
 * 
 * 本文件定义 LangGraph StateGraph 所需的状态通道 (State Annotation Channels)。
 * 涵盖从单据输入、抽取载荷、清洗归一化、标准检索、确定性核验、语义条款复核、
 * 人机协同 (HITL) 中断挂起与恢复，到最终审计报告输出的全生命周期上下文。
 * ============================================================================
 */

/** 语义条款复核项 */
export interface SemanticReviewItem {
  clause_id: string;
  title: string;
  standard_text: string;
  review_conclusion: 'CONFORMING' | 'NON_CONFORMING' | 'REQUIRES_WAIVER' | 'NOT_APPLICABLE';
  explanation: string;
}

/** 人机协同 (HITL) 中断挂起上下文 */
export interface HitlInterruptContext {
  /** 挂起触发原因 (如 'UNKNOWN_GRADE' / 'LOW_CONFIDENCE' / 'CRITICAL_DEFECT_WAIVER') */
  reason: 'UNKNOWN_GRADE' | 'LOW_CONFIDENCE' | 'CRITICAL_DEFECT_WAIVER' | 'MANUAL_REQUEST';
  /** 面向质检工程师的自然语言挂起提示与指导 */
  prompt_message: string;
  /** 待人工复核确认的字段键名列表 */
  pending_fields?: string[];
  /** 系统推断的候选建议值 */
  suggestions?: Record<string, unknown>;
}

/** 人工修正与恢复提交数据 */
export interface HumanCorrectionInput {
  /** 质检员确认/修正后的标准材料牌号 (如 '06Cr19Ni10') */
  corrected_grade?: string;
  /** 质检员修正后的实测数据项覆盖映射 (property_key -> value) */
  corrected_test_records?: Record<string, unknown>;
  /** 质检员特批放行说明 (Waiver justification) */
  waiver_notes?: string;
  /** 审核质检员姓名/工号 */
  inspector_id?: string;
}

/** 工作流运行期配置选项 */
export interface WorkflowOptions {
  /** 最低 OCR 置信度安全阈值 (默认 0.8，低于此阈值自动触发 HITL) */
  minConfidenceThreshold?: number;
  /** 强制指定执行标准代号 (覆盖质保书提取声明) */
  forcedStandardId?: string;
  /** 是否跳过语义条款复核 (仅执行确定性规则比对) */
  skipSemanticReview?: boolean;
  /** 质检任务上下文标识 */
  contextId?: string;
}

/** 状态图流转状态枚举 */
export type WorkflowStatus =
  | 'initialized'
  | 'extracting'
  | 'normalizing'
  | 'retrieving_standard'
  | 'evaluating'
  | 'reviewing_clauses'
  | 'awaiting_human_review'
  | 'completed'
  | 'failed';

/**
 * LangGraph 状态通道定义 (QualityAuditStateAnnotation)
 */
export const QualityAuditStateAnnotation = Annotation.Root({
  /** 任务唯一标识 (用于 Checkpoint 状态持久化与恢复) */
  taskId: Annotation<string>(),
  /** 原始质保证书输入 (Buffer, Base64 或预设样本标识) */
  input: Annotation<Buffer | Uint8Array | string>(),
  /** 运行期配置参数 */
  options: Annotation<WorkflowOptions | undefined>(),
  /** 当前工作流生命周期状态 */
  workflowStatus: Annotation<WorkflowStatus>(),
  /** 提取层输出的原始松散载荷 */
  rawPayload: Annotation<RawCertificatePayload | undefined>(),
  /** 确定性归一化后的标准质保书对象 */
  normalizedCert: Annotation<CertificateExtract | undefined>(),
  /** 归一化审计日志 (牌号消歧、单位换算公式等) */
  normalizationAudit: Annotation<NormalizationAuditLog | undefined>(),
  /** 命中的标准规则全集 */
  standardRuleSet: Annotation<StandardRuleSet | undefined>(),
  /** 命中的具体规格切片 */
  matchedSlice: Annotation<SpecificationSlice | undefined>(),
  /** 确定性规则核验单项明细矩阵 */
  itemResults: Annotation<RuleEvaluationItemResult[] | undefined>(),
  /** 文本性技术条款语义复核明细 */
  semanticReviewResults: Annotation<SemanticReviewItem[] | undefined>(),
  /** 人机协同中断挂起上下文 */
  hitlContext: Annotation<HitlInterruptContext | undefined>(),
  /** 人工修正与恢复提交数据 */
  humanCorrection: Annotation<HumanCorrectionInput | undefined>(),
  /** 内存审计轨迹收集器 */
  collector: Annotation<ITraceCollector | undefined>(),
  /** 全流程审计轨迹累积通道 (纯 JSON 数据，跨 Checkpoint 安全持久化) */
  traces: Annotation<AuditTraceItem[]>({
    reducer: (curr, update) => (curr || []).concat(update || []),
    default: () => [],
  }),
  /** 最终完整质检核验报告 (包含决策汇总、单项明细与审计轨迹) */
  finalReport: Annotation<AuditReport | undefined>(),
  /** 错误异常信息 */
  error: Annotation<string | undefined>(),
});

export type QualityAuditState = typeof QualityAuditStateAnnotation.State;
