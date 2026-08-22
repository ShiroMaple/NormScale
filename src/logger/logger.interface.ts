/**
 * ============================================================================
 * NormScale 领域日志与性能度量接口契约 (Logger & Observability Interface)
 * ============================================================================
 * 
 * 本文件采用门面模式 (Facade Pattern) 定义系统的统一日志契约。
 * 业务代码仅与 ILogger / ITraceCollector 抽象交互，杜绝直接与具体日志实现耦合。
 * ============================================================================
 */

import { AuditTraceItem, PerformanceMetrics } from '../schemas/report.schema';

/** 日志输出严重级别 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/** 领域架构模块标签（对应系统 4 大核心执行层及调度与性能） */
export type LogModuleTag = 
  | 'EXTRACTOR'    // 质保书抽取与外部多后端适配层
  | 'NORMALIZER'   // 确定性清洗、牌号消歧与物理量换算层
  | 'REPOSITORY'   // 标准规则库切片加载与倒排索引检索层
  | 'ENGINE'       // 确定性规则比对、修约与核验引擎层
  | 'WORKFLOW'     // LangGraph 状态图与人机协同编排调度层
  | 'PERF'         // 性能度量与微秒级耗时统计
  | 'SYSTEM';      // 系统底层初始化与全局未捕获异常

/** 结构化日志事件数据模型 */
export interface LogEvent {
  /** ISO-8601 格式时间戳 */
  timestamp: string;
  /** 严重级别 */
  level: LogLevel;
  /** 模块标签 */
  tag: LogModuleTag;
  /** 人机可读的自然语言描述信息 */
  message: string;
  /** 选填的性能耗时 (毫秒) */
  duration_ms?: number;
  /** 附加的结构化上下文元数据 */
  metadata?: Record<string, unknown>;
}

export type { AuditTraceItem, PerformanceMetrics };

/** 单次质检任务上下文的内存轨迹收集器契约 */
export interface ITraceCollector {
  /** 当前质检任务标识 (如质保书编号或 UUID) */
  readonly contextId: string;
  /** 追加一条审计轨迹 */
  addTrace(tag: LogModuleTag, level: LogLevel, message: string, duration_ms?: number, metadata?: Record<string, unknown>): void;
  /** 记录特定子阶段的耗时 */
  recordTiming(phaseName: string, duration_ms: number): void;
  /** 获取收集到的全量审计轨迹序列 */
  getTraces(): AuditTraceItem[];
  /** 获取性能指标度量汇总 */
  getPerformanceMetrics(): PerformanceMetrics;
  /** 清空当前收集器中的记录 */
  clear(): void;
}

/** 日志器门面核心接口 */
export interface ILogger {
  /** 调试日志 */
  debug(tag: LogModuleTag, message: string, metadata?: Record<string, unknown>): void;
  /** 业务信息日志 */
  info(tag: LogModuleTag, message: string, metadata?: Record<string, unknown>): void;
  /** 警告日志 */
  warn(tag: LogModuleTag, message: string, metadata?: Record<string, unknown>): void;
  /** 错误异常日志 */
  error(tag: LogModuleTag, message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void;
  /** 性能耗时日志 */
  perf(tag: LogModuleTag, name: string, duration_ms: number, metadata?: Record<string, unknown>): void;
  /** 创建带有特定模块标签的子日志器 */
  forTag(tag: LogModuleTag): IModuleLogger;
  /** 为单次质检任务创建内存轨迹收集器 */
  createTraceCollector(contextId?: string): ITraceCollector;
}

/** 绑定了固定模块标签的便捷子日志器 */
export interface IModuleLogger {
  readonly tag: LogModuleTag;
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void;
  perf(name: string, duration_ms: number, metadata?: Record<string, unknown>): void;
}
