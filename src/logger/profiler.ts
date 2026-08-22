import { ILogger, ITraceCollector, LogModuleTag } from './logger.interface';

export interface ProfileResult<T> {
  /** 函数返回值 */
  result: T;
  /** 执行耗时 (毫秒，保留 3 位小数) */
  duration_ms: number;
}

/**
 * ============================================================================
 * 微秒级高精度性能度量分析器 (Performance Profiler)
 * ============================================================================
 * 
 * 基于现代 Web API / Node.js 原生 performance.now() 提供亚毫秒级高精度执行计时。
 * 能够无侵入地包装同步/异步业务代码块，自动记录并汇总性能耗时。
 * ============================================================================
 */
export class PerformanceProfiler {
  /**
   * 测量同步操作的执行耗时
   */
  public static profileSync<T>(
    tag: LogModuleTag,
    name: string,
    fn: () => T,
    logger?: ILogger,
    collector?: ITraceCollector
  ): ProfileResult<T> {
    const start = performance.now();
    try {
      const result = fn();
      const duration_ms = Math.round((performance.now() - start) * 1000) / 1000;

      if (logger) {
        logger.perf(tag, name, duration_ms);
      }
      if (collector) {
        collector.recordTiming(name, duration_ms);
        collector.addTrace(tag, 'debug', name + ' 完成', duration_ms);
      }

      return { result, duration_ms };
    } catch (err) {
      const duration_ms = Math.round((performance.now() - start) * 1000) / 1000;
      if (logger) {
        logger.error(tag, name + ' 执行异常', err, { duration_ms });
      }
      throw err;
    }
  }

  /**
   * 测量异步 Promise 操作的执行耗时
   */
  public static async profileAsync<T>(
    tag: LogModuleTag,
    name: string,
    fn: () => Promise<T>,
    logger?: ILogger,
    collector?: ITraceCollector
  ): Promise<ProfileResult<T>> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration_ms = Math.round((performance.now() - start) * 1000) / 1000;

      if (logger) {
        logger.perf(tag, name, duration_ms);
      }
      if (collector) {
        collector.recordTiming(name, duration_ms);
        collector.addTrace(tag, 'debug', name + ' 完成', duration_ms);
      }

      return { result, duration_ms };
    } catch (err) {
      const duration_ms = Math.round((performance.now() - start) * 1000) / 1000;
      if (logger) {
        logger.error(tag, name + ' 执行异常', err, { duration_ms });
      }
      throw err;
    }
  }
}
