/**
 * ============================================================================
 * NormScale 领域日志与性能度量基础设施 (Logging & Observability Facade)
 * ============================================================================
 * 
 * 本模块为系统各层提供面向工业质检业务的自然语言日志输出、微秒级性能计时
 * 与单次质检任务的内存审计轨迹 (Audit Trace) 收集服务。
 * 
 * 核心组件：
 * 1. logger.interface.ts:
 *    - 门面模式核心契约 (ILogger, ITraceCollector, LogModuleTag, AuditTraceItem)。
 * 2. default-logger.ts:
 *    - 轻量级领域日志器实现 (DefaultDomainLogger)，支持中文自然语言排版与 ANSI 终端多色高亮。
 * 3. profiler.ts:
 *    - 亚毫秒级性能度量分析器 (PerformanceProfiler)，无侵入包装同步与异步业务函数。
 * 4. trace-collector.ts:
 *    - 内存审计轨迹收集器 (MemoryTraceCollector)，将决策全过程打包随 AuditReport 输出。
 * ============================================================================
 */

import { DefaultDomainLogger } from './default-logger';

export * from './logger.interface';
export * from './default-logger';
export * from './profiler';
export * from './trace-collector';

/**
 * 全局共享的领域日志器默认单例
 */
export const logger = new DefaultDomainLogger();
