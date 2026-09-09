# Tier 2 大模型长尾消歧真实接入、非静默降级与自学习白盒管理交付报告

## 1. 核心改进与交付亮点

本次重构全面落地了 `/grill-me` 讨论达成的五大核心架构共识，彻底补齐了 Tier 2 的大模型调用能力，并为自学习进化飞轮提供了透明、可审阅、可撤销的白盒化管理机制：

1. **Tier 2 大模型真实接入与受限候选池提示词架构**：
   - 独立构建 [`LlmPropertyResolverService`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/services/llm-property-resolver.service.ts)，复用全局活跃大模型配置（支持 DeepSeek / Kimi / OpenAI 等兼容端点）；
   - 以当前批次匹配的执行标准切片全部合法规则作为**封闭候选规则池（Constrained Pool）**，杜绝大模型臆测幻觉；
   - 严格落实 **0.85 置信度红线**：
     - $\ge 0.85$ 自动升级为规范检验项并回流 Tier 1 确定性引擎重新计算数值（Case 2 表面光洁度 0.33 μm 判定 PASS，Case 3 1.50 μm 判定超差 FAIL 一票否决）；
     - $< 0.85$ 或候选池中无匹配项时，严禁强行对齐，标为歧义项并挂起 HITL（Case 4 剪切断裂韧度行内待定）；
   - 捕获官方接口返回的真实 `prompt_tokens` 与 `completion_tokens`，累加至状态机 `tokenUsage` 并流式透传至 Session 开销大盘；

2. **坚固的非静默降级防线（Non-Silent Graceful Fallback）**：
   - 当检测到未配置有效 API Key、请求超时（默认 5000ms 熔断）或模型接口报错时，系统自动平滑降级至本地启发式规则检索，确保离线开发、演示与全量单元测试 100% 顺畅；
   - **绝不静默掩盖**：降级时在条目上打标 `is_degraded: true`，在比对矩阵行醒目贴附琥珀色「本地规则降级」徽标，Trace 记录 WARN 告警；

3. **自学习进化飞轮的白盒化审阅与撤销体系（Whitebox Governance）**：
   - 扩展数据模型：`LearnedAliasEntry` 扩充 `id`、`source_cert_no`、`status: 'active' | 'revoked'`；
   - 在 [`src/components/AdminConsole.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/AdminConsole.tsx) 开辟「动态别名白盒知识库」专区面板；
   - 提供指标总览（已沉淀总数、当前活跃数、已撤销数）、搜索过滤与完整数据表格；
   - 支持质检工程师/主管一键撤销误判条目（软失效，不再参与 Tier 1 自动判定）、恢复生效以及物理删除；
   - 新增白盒管理服务端 API [`/api/admin/learned-aliases`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/admin/learned-aliases/route.ts)，内存倒排索引与本地持久化文件 `user_learned_aliases.json` 秒级联动生效。

---

## 2. 变更文件清单

| 文件路径 | 变更类型 | 核心变更点 |
| :--- | :--- | :--- |
| [`src/workflow/services/llm-property-resolver.service.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/services/llm-property-resolver.service.ts) | 新增 | OpenAI 兼容协议受限候选池消歧客户端，支持超时熔断与真实 Token 计量 |
| [`src/workflow/nodes/llm-property-resolver.node.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/llm-property-resolver.node.ts) | 修改 | 优先调用大模型服务；落实 0.85 严格置信度分流；非静默降级至本地启发式规则 |
| [`src/workflow/state.interface.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/state.interface.ts) | 修改 | `PropertyResolutionCandidate` 扩充 `is_degraded` 与 `model_name` 字段 |
| [`src/normalizer/property-key-normalizer.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/property-key-normalizer.ts) | 修改 | 扩充 `LearnedAliasEntry` 字段，实现白盒查询、撤销、恢复、删除与防冲毁逻辑 |
| [`src/app/api/admin/learned-aliases/route.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/admin/learned-aliases/route.ts) | 新增 | 提供自学习别名白盒管理 REST API（GET 列表查询，POST 撤销/恢复/删除） |
| [`src/components/AdminConsole.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/AdminConsole.tsx) | 修改 | 增加「动态别名白盒知识库」面板，表格呈现与一键撤销/恢复/删除交互 |
| [`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx) | 修改 | 比对矩阵行识别 Tier 2 消歧产物，呈现「AI意图对齐」或「本地规则降级」胶囊徽标 |
| [`tests/workflow/llm-property-resolver.test.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/workflow/llm-property-resolver.test.ts) | 修改 | 单测全覆盖大模型高置信对齐、低置信挂起、API 异常降级与 Token 透传 |
| [`tests/api/admin-learned-aliases.test.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/api/admin-learned-aliases.test.ts) | 新增 | 白盒管理 API 增删改查与撤销生效断言测试 |
| [`cairn/langgraph-orchestration-and-fixtures.md`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/langgraph-orchestration-and-fixtures.md) | 修改 | 沉淀第 3.5 节、第 3.6 节架构与第 4.4 节教训 |
| [`cairn/LOG.md`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/LOG.md) | 修改 | 顶部追加进展与决策记录 |

---

## 3. 验证结果

1. **自动化单元测试与回归防护**：
   - 运行命令：`pnpm test`
   - 结果：**48 个测试套件，238 个测试全部通过（100% 绿色）**，零破坏零回归。
2. **TypeScript 严格静态类型检查**：
   - 运行命令：`pnpm exec tsc --noEmit`
   - 结果：**0 错误**，严格模式完全通过。
3. **Next.js 15 生产打包构建**：
   - 运行命令：`pnpm build`
   - 结果：**13/13 页面编译、类型检查与路由静态分析全绿通过**，耗时 2.8s。
