import { describe, it, expect } from 'vitest';
import { PerformanceProfiler } from '@/logger/profiler';
import { MemoryTraceCollector } from '@/logger/trace-collector';

describe('PerformanceProfiler 微秒级性能分析器测试', () => {
  it('正确度量同步函数执行耗时', () => {
    const collector = new MemoryTraceCollector();
    const { result, duration_ms } = PerformanceProfiler.profileSync(
      'NORMALIZER',
      '同步牌号消歧',
      () => {
        let sum = 0;
        for (let i = 0; i < 10000; i++) sum += i;
        return sum;
      },
      undefined,
      collector
    );

    expect(result).toBe(49995000);
    expect(duration_ms).toBeGreaterThanOrEqual(0);
    expect(collector.getTraces().length).toBe(1);
    expect(collector.getPerformanceMetrics().phase_durations['同步牌号消歧']).toBeDefined();
  });

  it('正确度量异步 Promise 函数执行耗时', async () => {
    const collector = new MemoryTraceCollector();
    const { result, duration_ms } = await PerformanceProfiler.profileAsync(
      'EXTRACTOR',
      '异步网络请求',
      async () => {
        await new Promise(r => setTimeout(r, 10));
        return 'extracted_data';
      },
      undefined,
      collector
    );

    expect(result).toBe('extracted_data');
    expect(duration_ms).toBeGreaterThanOrEqual(8);
    expect(collector.getPerformanceMetrics().phase_durations['异步网络请求']).toBeGreaterThanOrEqual(8);
  });
});
