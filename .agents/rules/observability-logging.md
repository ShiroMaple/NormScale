# Agent 协作规则：日志埋点与可观测性规范 (Observability & Logging Rules)

## 1. 核心约束与禁止事项

- **禁止裸写 `console.log` / `console.warn` / `console.error`**：
  所有模块的业务与调试信息必须统一通过 `@/logger` 导出的 `logger` 门面进行记录。
- **禁止静默忽略异常**：
  捕获错误时必须调用 `logger.error(tag, message, error, metadata)` 记录原始堆栈与上下文。
- **必须指定领域模块标签（LogModuleTag）**：
  每次打印必须显式指定模块标签：`EXTRACTOR`, `NORMALIZER`, `REPOSITORY`, `ENGINE`, `WORKFLOW`, `PERF`, `SYSTEM`。

---

## 2. 自然语言中文排版规范

- **高可读性自然语言**：
  日志内容应当面向人类质检工程师与运维人员，清晰说明“发生了什么”、“关键业务参数”与“决策原因”。
  * 正确范例：`logger.info('NORMALIZER', '牌号 [SUS 304] 成功消歧为标准主牌号 [06Cr19Ni10] (统一代号: S30408)');`
  * 错误范例：`logger.info('NORMALIZER', 'grade normalize done: ' + JSON.stringify(res));`

---

## 3. 性能度量与审计轨迹收集规范

- **微秒级性能耗时统计**：
  对于核心计算、网络请求或文件系统索引构建，使用 `PerformanceProfiler.profileSync` 或 `PerformanceProfiler.profileAsync` 进行非侵入式测量。
- **单次质检审计轨迹（Audit Trace）贯通**：
  在编写或修改涉及核心流转（`Extractor`, `Normalizer`, `Engine`, `Workflow`）的方法时，必须支持接收可选的 `ITraceCollector`，并将关键决策步骤推入 `collector.addTrace(...)`，确保 `AuditReport.audit_traces` 与 `performance_metrics` 数据完整。
