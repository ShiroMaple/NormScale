# Phase 4 实施计划：领域日志系统、审计轨迹与性能度量 (Logging, Audit Traces & Performance Profiling)

为支撑 Phase 5（LangGraph 状态图与人机协同）与 Phase 6（物资验收决策看板），构建全链路高可观测性、中文自然语言可读的日志系统、微秒级性能度量器与审计轨迹收集器。

## 用户评审要点

- **架构设计**：采用**门面模式（Facade / Adapter Pattern）**。业务代码仅依赖 `ILogger` 与 `ITraceCollector` 抽象，默认内置基于 TypeScript 原生的轻量级领域日志器；未来生产环境如需切换至 `Pino` 或 `Winston`，仅需接入一个 Adapter，核心业务代码零修改。
- **性能统计（Performance Profiling）**：基于 `performance.now()` 微秒级高精度计时，自动度量并输出各子阶段（切片加载、牌号消歧、单位换算、AST公式计算、公差匹配、核心比对）的耗时。
- **审计轨迹流（Audit Traces）**：单次质保书核验全过程产生的中文自然语言决策轨迹，支持自动聚合进 `AuditReport.audit_traces`，直接赋能前端看板抽屉的可视化时间轴。

---

## 拟变动与新建文件清单

### 1. 领域日志基础设施 (`src/logger/`)

#### [NEW] [logger.interface.ts](file:///Users/shiromaple/Github/NormScale/src/logger/logger.interface.ts)
- 定义 `LogLevel` (`'debug' | 'info' | 'warn' | 'error' | 'silent'`)；
- 定义 `LogModuleTag` (`'EXTRACTOR' | 'NORMALIZER' | 'REPOSITORY' | 'ENGINE' | 'WORKFLOW' | 'PERF' | 'SYSTEM'`)；
- 定义 `LogEvent`、`AuditTraceItem`、`PerformanceMetrics`、`ITraceCollector` 与 `ILogger` 接口契约。

#### [NEW] [default-logger.ts](file:///Users/shiromaple/Github/NormScale/src/logger/default-logger.ts)
- 实现 `DefaultDomainLogger`，支持中文自然语言格式化输出、ANSI 彩色高亮标签、日志级别动态过滤、子模块 Logger（`logger.forTag('ENGINE')`）。

#### [NEW] [profiler.ts](file:///Users/shiromaple/Github/NormScale/src/logger/profiler.ts)
- 实现 `PerformanceProfiler`，提供 `profileSync` 与 `profileAsync` 包装器，自动度量函数执行耗时并格式化输出 `[PERF]` 日志。

#### [NEW] [trace-collector.ts](file:///Users/shiromaple/Github/NormScale/src/logger/trace-collector.ts)
- 实现 `MemoryTraceCollector`，支持单次质检任务上下文的内存事件聚合、Trace 导出与性能汇总。

#### [NEW] [index.ts](file:///Users/shiromaple/Github/NormScale/src/logger/index.ts)
- 导出模块全部契约与实现，提供全局单例 `logger` 与便捷工具。

---

### 2. 报告元模型升级 (`src/schemas/`)

#### [MODIFY] [report.schema.ts](file:///Users/shiromaple/Github/NormScale/src/schemas/report.schema.ts)
- 增加 `AuditTraceItemSchema` 与 `PerformanceMetricsSchema`；
- 在 `AuditReportSchema` 中添加可选字段 `audit_traces?: AuditTraceItem[]` 与 `performance_metrics?: PerformanceMetrics`。

---

### 3. 核心业务全链路埋点 (Instrumenting)

#### [MODIFY] [file-rule-store.ts](file:///Users/shiromaple/Github/NormScale/src/repository/file-rule-store.ts)
- 埋点记录标准规则切片动态加载耗时与倒排索引检索命中日志。

#### [MODIFY] [grade-normalizer.ts](file:///Users/shiromaple/Github/NormScale/src/normalizer/grade-normalizer.ts)
- 埋点记录牌号清洗、别名消歧判定与匹配耗时。

#### [MODIFY] [unit-normalizer.ts](file:///Users/shiromaple/Github/NormScale/src/normalizer/unit-normalizer.ts)
- 埋点记录工程单位换算细节（如 $kgf/mm^2 \to MPa$ 公式与精度转换）。

#### [MODIFY] [certificate-normalizer.ts](file:///Users/shiromaple/Github/NormScale/src/normalizer/certificate-normalizer.ts)
- 注入 `TraceCollector`，埋点记录整单清洗步骤、字段解析统计与归一化流水线耗时。

#### [MODIFY] [core.ts](file:///Users/shiromaple/Github/NormScale/src/engine/core.ts)
- 注入 `TraceCollector`，埋点记录每项规则判定依据、修约对比过程、漏检扫描及引擎总计算耗时，自动将 `audit_traces` 与 `performance_metrics` 组装进 `AuditReport`。

---

### 4. 根导出与单元测试

#### [MODIFY] [src/index.ts](file:///Users/shiromaple/Github/NormScale/src/index.ts)
- 导出 `src/logger` 模块。

#### [NEW] [default-logger.test.ts](file:///Users/shiromaple/Github/NormScale/tests/logger/default-logger.test.ts)
#### [NEW] [profiler.test.ts](file:///Users/shiromaple/Github/NormScale/tests/logger/profiler.test.ts)
#### [NEW] [trace-collector.test.ts](file:///Users/shiromaple/Github/NormScale/tests/logger/trace-collector.test.ts)

---

## 验证计划

### 自动化测试
1. **专项测试**：`pnpm test tests/logger` 验证日志级别过滤、Trace 收集、耗时统计准确性。
2. **全量回归**：`pnpm test:coverage` 验证全量 100+ 项测试全部 PASS，覆盖率维持在 90% 以上。
3. **类型安全**：`pnpm typecheck`（`tsc --noEmit`）0 错误。
4. **标准验证**：`pnpm standard:validate` 验证 31 个规格切片无异常。
