# 会话全局 Token 与执行耗时真实统计与累加体系实施方案

## 1. 目标与用户诉求

针对会话（Session）中 Token 开销和耗时统计的四个核心诉求进行体系化落地：
1. **真实大模型 Token 采集**：消除 `openai-compatible-extractor.ts` 中硬编码的 `1800` 与字符估算，接入 OpenAI 标准 `stream_options: { include_usage: true }`，从服务端 SSE 流中捕获真实的官方 `usage`；
2. **LangGraph 节点开销透传**：在 LangGraph 工作流状态与流式事件（`streamAudit`）中建立耗时与 Token 统计结构，支持 Tier 1/2 各批次真实执行用时与 LLM 消耗回传；
3. **重新解析开销单调递增累加**：重构 `useDocumentParser.ts`，建立会话沉淀成本台账，重新解析时旧消耗不归零、新开销继续累加；
4. **全链路抽取+比对综合开销汇总**：在 `WaterfallWorkbench.tsx` 中建立跨阶段（步骤 2 抽取解析 + 步骤 3 规则比对与消歧）的统一会话计量看板，真实呈现大模型质检审计账单。

---

## 2. 详细技术方案

### 2.1 抽取适配器真实 Token 采集 (`src/extractor/openai-compatible-extractor.ts`)
- 在 `extractStream` 发送给大模型的请求体中加入标准参数：
  ```typescript
  stream: true,
  stream_options: { include_usage: true },
  ```
- 在解析 SSE 行的循环中，监听并提取 chunk 中的 `parsedChunk.usage`：
  ```typescript
  if (parsedChunk.usage) {
    if (typeof parsedChunk.usage.prompt_tokens === 'number') {
      actualPromptTokens = parsedChunk.usage.prompt_tokens;
    }
    if (typeof parsedChunk.usage.completion_tokens === 'number') {
      actualCompletionTokens = parsedChunk.usage.completion_tokens;
    }
  }
  ```
- 流结束时优先采用捕获到的 `actualPromptTokens` 与 `actualCompletionTokens`，仅当服务端未返回 usage 时才使用安全的备用估算。
- 在非流式 `extract` 中，确保对 `data.usage` 规范提取。

### 2.2 工作流耗时与 Token 状态采集 (`src/workflow/`)
- 在 `src/workflow/state.interface.ts` 中定义 `TokenUsageStats` 接口；
- 在 `src/workflow/workflow-engine.ts` 的 `streamAudit` 生成器中：
  - 记录批次任务启动时刻 `startTime = Date.now()`；
  - 在 `tier1_ready`、`tier2_patch`、`complete` 事件中附带 `durationMs: Date.now() - startTime` 与 `tokenUsage`；
- 在 `src/lib/api-client.ts` 的流式回调接口中定义 `durationMs` 与 `tokenUsage` 接收字段。

### 2.3 会话单调累加台账机制 (`src/hooks/useDocumentParser.ts`)
- 维护 `historicalAccumulatorRef`，记录当前 Session 中因“重新解析”已被替代的历史任务所沉淀的真实消耗（`inputTokens`, `outputTokens`, `durationSeconds`）；
- 当某文档触发重新解析时，将该任务之前的开销累加到 `historicalAccumulatorRef`，任务状态刷新为进行中；
- `recalculateMetrics` 计算：
  `totalInputTokens = historicalAccumulator.inputTokens + 当前各文档现存 inputTokens`；
  `totalOutputTokens = historicalAccumulator.outputTokens + 当前各文档现存 outputTokens`；
  `totalDurationSeconds = historicalAccumulator.durationSeconds + 当前各文档现存 durationSeconds`；
- 保证会话生命周期内只要消耗了网络与模型计算，指标**严格单调递增，绝不抹零回缩**。

### 2.4 抽取 + 比对跨阶段开销大盘汇总 (`src/components/WaterfallWorkbench.tsx`)
- 在 `WaterfallWorkbench` 中维护步骤 3 比对开销台账 `auditMetrics`（累加各批次流式核验耗时与 Token）；
- 结合 `sessionMetrics`（抽取开销）计算全局综合开销：
  - `totalSessionTokens = parsingTokens + auditTokens`
  - `totalSessionDuration = parsingDuration + auditDuration`
- 底部信息栏真实展示：
  `总耗时 X s (抽取 A s + 比对 B s) · Token 消耗: 输入 C / 输出 D`。

---

## 3. 拟修改文件清单

| 文件路径 | 变更类型 | 核心变更点 |
| :--- | :--- | :--- |
| [`src/extractor/openai-compatible-extractor.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/extractor/openai-compatible-extractor.ts) | 修改 | 请求添加 `stream_options: { include_usage: true }`，循环中解析并返回真实 Token |
| [`src/workflow/state.interface.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/state.interface.ts) | 修改 | 新增 `TokenUsageStats` 接口与状态定义 |
| [`src/workflow/workflow-engine.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/workflow-engine.ts) | 修改 | `WorkflowStreamEvent` 增加 `durationMs` 与 `tokenUsage` 字段并透传 |
| [`src/lib/api-client.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/lib/api-client.ts) | 修改 | 流式核验客户端回调支持接收 `durationMs` 与 `tokenUsage` |
| [`src/hooks/useDocumentParser.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/hooks/useDocumentParser.ts) | 修改 | 引入会话沉淀台账，重新解析开销不抹零、单调累加 |
| [`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx) | 修改 | 汇聚步骤 2 抽取与步骤 3 比对全阶段真实耗时与 Token，更新状态栏展示 |
| [`tests/extractor/openai-compatible-extractor.test.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/extractor/openai-compatible-extractor.test.ts) | 修改/新增 | 验证流式 chunk 中带 usage 时能够准确提取真实 Token |

---

## 4. 验证计划

1. **单元测试验证**：
   - 运行抽取器单测：`pnpm exec vitest run tests/extractor/openai-compatible-extractor.test.ts`；
   - 运行工作流流式单测：`pnpm exec vitest run tests/workflow/stream-audit.test.ts`；
   - 运行全量单测套件：`pnpm test`（确保全部 230+ 单测 100% 通过）；
2. **类型与生产构建验证**：
   - `pnpm exec tsc --noEmit`（0 错误）；
   - `pnpm run build`（Next.js 15 打包构建成功）；
3. **心智模型走查**：
   - 上传文档并解析，观察真实 Token 统计；
   - 点击“重新解析”，验证之前产生的 Token 与耗时**未被清空，而是在历史基础上继续叠加**；
   - 进入步骤 3，流式核验完成后，底栏显示抽取与比对耗时的真实分项和真实总消耗。
