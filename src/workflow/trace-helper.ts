import { ITraceCollector, LogModuleTag, LogLevel } from '../logger/logger.interface.ts';
import { MemoryTraceCollector } from '../logger/trace-collector.ts';
import { QualityAuditState } from './state.interface.ts';

/**
 * 安全获取或重新水化 (Rehydrate) 内存轨迹收集器
 * 解决 LangGraph Checkpointer 序列化后方法原型丢失的问题
 */
export function getSafeCollector(state: QualityAuditState): ITraceCollector {
  if (state.collector && typeof state.collector.addTrace === 'function') {
    return state.collector;
  }
  const collector = new MemoryTraceCollector(state.taskId);
  if (Array.isArray(state.traces)) {
    for (const t of state.traces) {
      collector.addTrace(
        t.stage as LogModuleTag,
        t.level as LogLevel,
        t.message,
        t.duration_ms,
        t.metadata
      );
    }
  }
  return collector;
}
