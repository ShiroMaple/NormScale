import { AuditTraceItem, ITraceCollector, LogLevel, LogModuleTag, PerformanceMetrics } from './logger.interface';

/**
 * ============================================================================
 * 内存审计轨迹与性能收集器 (Memory Audit Trace Collector)
 * ============================================================================
 * 
 * 专门用于单次质保书核验生命周期的内存事件流收集。
 * 在核验完成时，将所有人类可读的自然语言决策步骤与各环节耗时汇总，
 * 直接打包注入到 AuditReport 最终核验报告中，供前端看板渲染。
 * ============================================================================
 */
export class MemoryTraceCollector implements ITraceCollector {
  public readonly contextId: string;
  private traces: AuditTraceItem[] = [];
  private phaseDurations: Record<string, number> = {};
  private startTime: number;

  constructor(contextId?: string) {
    this.contextId = contextId || 'TRACE-' + Date.now().toString(36);
    this.startTime = performance.now();
  }

  public addTrace(
    tag: LogModuleTag,
    level: LogLevel,
    message: string,
    duration_ms?: number,
    metadata?: Record<string, unknown>
  ): void {
    this.traces.push({
      timestamp: new Date().toISOString(),
      stage: tag,
      level,
      message,
      duration_ms,
      metadata,
    });
  }

  public recordTiming(phaseName: string, duration_ms: number): void {
    this.phaseDurations[phaseName] = duration_ms;
  }

  public getTraces(): AuditTraceItem[] {
    return [...this.traces];
  }

  public getPerformanceMetrics(): PerformanceMetrics {
    const total_duration_ms = Math.round((performance.now() - this.startTime) * 1000) / 1000;
    return {
      total_duration_ms,
      phase_durations: { ...this.phaseDurations },
    };
  }

  public clear(): void {
    this.traces = [];
    this.phaseDurations = {};
    this.startTime = performance.now();
  }
}
