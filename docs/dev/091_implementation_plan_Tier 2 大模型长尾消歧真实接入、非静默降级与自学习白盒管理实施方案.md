# Tier 2 大模型长尾消歧真实接入、非静默降级与自学习白盒管理实施方案

本方案旨在根据 `/grill-me` 达成的统一设计共识，彻底解决 Tier 2 节点当前仅靠本地启发式检索、未真正调用 LLM 的现状，完成 Case 2、Case 3、Case 4 的大模型意图对齐与安全流转闭环，同时将自学习经验飞轮改造为透明、可审阅、可撤销的白盒知识库。

---

## 审查与确认项

> [!IMPORTANT]
> **已达成共识的五大核心架构原则：**
> 1. **受限候选集轻量 JSON 调用**：复用系统全局大模型配置（`config/app-config.json`），按批次线程（`thread_id: ${sessionId}::${batchNo}`）以当前标准切片规则池为封闭候选集发起受限提示词请求；
> 2. **严格 0.85 置信度红线**：
>    - $\ge 0.85$ 自动升级为规范指标并回流 Tier 1 确定性引擎重新计算数值（Case 2 通过，Case 3 超差一票否决）；
>    - $< 0.85$ 或标准池未匹配时严禁幻觉对齐，标为歧义项并挂起 HITL（Case 4 行内待定）；
> 3. **非静默确定性降级防线**：未配置 API Key、网络超时或模型报错时，自动转入本地启发式规则兜底，前端比对矩阵醒目贴标「本地规则降级」，Trace 记录 WARN 告警；
> 4. **真实 Token 与耗时捕获透传**：捕获官方 `prompt_tokens` 与 `completion_tokens`，累加至状态机 `tokenUsage` 并通过 SSE 流式事件与大盘实时呈现；
> 5. **经验飞轮白盒化管理**：在「系统控制台 (AdminConsole)」新增「动态别名白盒知识库」专区，支持直观审阅已学习别名（含来源质保书、时间、大类），支持一键撤销/删除误判映射，内存缓存与磁盘同步秒级生效。

---

## 拟定变更文件与架构设计

### 1. 服务层与 Tier 2 大模型解析器 (LLM Resolver Service)

#### [NEW] [llm-property-resolver.service.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/services/llm-property-resolver.service.ts)
- 封装独立、轻量的 OpenAI 兼容协议客户端；
- 读取 `config/app-config.json` 活跃大模型配置；
- 提供 `resolvePropertiesWithLlm(...)` 方法：
  - 构造受限提示词（注入待消歧项与当前标准切片候选规则池）；
  - 请求模型生成结构化 JSON 响应；
  - 提取真实 `usage` 计量并返回消歧结果列表；
  - 支持可配置超时（默认 5000ms）。

#### [MODIFY] [llm-property-resolver.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/llm-property-resolver.node.ts)
- 重构节点核心流转：
  1. 优先尝试调用 `LlmPropertyResolverService`；
  2. 若模型可用且返回结果，根据 0.85 置信度分流（$\ge 0.85$ 升级回流，$< 0.85$ 挂起 HITL）；
  3. 若未配置 API Key、超时或执行异常，**平滑降级至本地启发式规则**，同时在结果中标记 `is_degraded: true`，并在 Trace 中记录警告日志；
  4. 累加真实模型开销至 `state.tokenUsage`。

---

### 2. 前后端数据契约与降级可视化呈现

#### [MODIFY] [state.interface.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/state.interface.ts)
- `PropertyResolutionCandidate` 扩充 `is_degraded?: boolean` 与 `model_name?: string` 字段；
- `WorkflowStreamEvent` 透传长尾项消歧来源与降级标记。

#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 在比对矩阵特定行若识别到由 Tier 2 消歧产出的指标：
  - 正常模型对齐：悬浮提示展示模型推理理由（如“由 DeepSeek-V3 语义对齐至粗糙度”）；
  - 本地降级：展示醒目的灰色/琥珀色 Pill 标签「本地规则降级」，满足用户“降级非静默、前端可感知”的硬性要求。

---

### 3. 进化飞轮白盒化管理 (Learned Aliases Whitebox)

#### [MODIFY] [property-key-normalizer.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/property-key-normalizer.ts)
- 扩充 `LearnedAliasEntry` 契约：补充 `id`、`source_cert_no`、`status: 'active' | 'revoked'`；
- 暴露管理方法：
  - `listAllLearnedAliases(): LearnedAliasEntry[]`
  - `revokeLearnedAlias(idOrAlias: string): boolean`
  - `restoreLearnedAlias(idOrAlias: string): boolean`
  - `deleteLearnedAlias(idOrAlias: string): boolean`
- 撤销或删除后立即清除内存 Map 对应键并落盘同步。

#### [NEW] [route.ts (admin/learned-aliases)](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/admin/learned-aliases/route.ts)
- `GET`: 查询当前所有已学习别名列表与统计（总条数、活跃条数、撤销条数）；
- `POST`: 撤销（revoke）、恢复（restore）或物理删除（delete）指定的误判别名条目。

#### [MODIFY] [AdminConsole.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/AdminConsole.tsx)
- 新增 Tab/面板：「动态别名白盒知识库」；
- 列表表格化呈现：原始别名、映射标准键名、检验大类、沉淀时间、当前状态；
- 操作列提供「撤销」与「删除」按钮，误判条目可秒级撤销，附带即时 Toast 提示。

---

### 4. 自动化单测套件扩充与回归保护

#### [MODIFY] [llm-property-resolver.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/workflow/llm-property-resolver.test.ts)
- 扩充四维流向单元测试：
  1. 模拟真实 LLM 高置信度匹配（Case 2 表面光洁度 $\rightarrow$ 粗糙度通过）；
  2. 模拟真实 LLM 低置信度匹配（Case 4 剪切断裂韧度触发 `PROPERTY_AMBIGUITY`）；
  3. 模拟网络异常/无 Key 触发非静默降级（标记 `is_degraded: true`，记录 WARN Trace）；
  4. 验证真实 Token 开销与耗时的准确透传与累加。

#### [NEW] [admin-learned-aliases.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/api/admin-learned-aliases.test.ts)
- 针对白盒管理 API 的增删改查、撤销恢复与内存防冲毁单测。

---

## 验证方案

1. **自动化单元测试**：
   - 运行 `pnpm test`，确保现存 47 个测试套件及新增用例全部 100% 绿色通过；
2. **严格类型检查**：
   - 运行 `pnpm exec tsc --noEmit`，确保严格模式 0 错误；
3. **Next.js 生产打包**：
   - 运行 `pnpm build`，确保包含新 API 路由与管理面板的生产产物编译成功；
4. **端到端业务核验**：
   - 在管理控制台查看白盒别名，演练撤销操作并验证再次核验时是否不再被 Tier 1 自动拦截；
   - 运行 Case 2、Case 3、Case 4，验证模型对齐、一票否决与行内挂起流程无缝衔接。
