---
type: project_topic
status: active
summary: "NormScale LangGraph 有状态编排重构、渐进式流式通信 (SSE)、多批次并发线程隔离、HITL 中断恢复闭环、动态别名自学习反哺，以及四维分层场景矩阵测试资产物理隔离归档的设计决策与知识沉淀。"
tags:
  - langgraph
  - workflow
  - sse
  - hitl
  - thread-isolation
  - dynamic-alias
  - test-fixtures
  - architecture
contains:
  - decision
  - architecture
  - specification
  - procedure
  - lesson
created: "2026-09-08"
updated: "2026-09-08"
related:
  - cairn/architecture.md
  - cairn/hitl-scenarios-and-drawer.md
  - cairn/dual-track-verdict.md
authoring_mode: ai_generated
---

# LangGraph 有状态编排重构与测试资产物理隔离架构

## 1. 形成背景与演进驱动

随着 NormScale 进入工业多标准、多批次并发核验阶段，原有的单步同步核验模型面临四大痛点：
1. **耗时过长体验卡顿**：包含 LLM 语义消歧的长尾条款若与确定性数值比对串行执行，导致质检员需等待数秒才能看到全景大盘；
2. **多批次状态串扰风险**：一份质保书包含多个物理批次（Batch No）时，状态机 Checkpointer 若仅以单文档/会话标识线程，并发流转时会出现状态覆盖与乱序；
3. **假数据隐雷与环境不纯**：服务端若默认挂载 Mock 提取器，在真实工作流降级时会静默伪造假数据，对工业生产质量检验构成严重隐患；
4. **测试资产与生产代码耦合**：用于验证分层核验典型路径的测试样本若分散在业务代码或硬编码在提取器中，不仅膨胀核心代码库，而且无法安全卸载。

为此，系统开展了 LangGraph 状态机重构（Phases 1~4）与测试资产物理隔离归档工程。

---

## 2. 核心架构设计与决策记录

### 2.1 渐进式流式事件调度架构 (SSE Progressive Streaming)
- **核心决策**：拆分确定性规则核验（Tier 1）与长尾大模型语义对齐（Tier 2），通过 Server-Sent Events (SSE) 进行渐进式推流；
- **事件流序拓扑**：
  ```
  客户端发起核验
       │
       ▼
  [normalize 节点] ──(牌号消歧校验通过)──► [retrieve_rules 节点] ──► [deterministic_eval 节点]
                                                                        │
                                                                 (首帧极速下发)
                                                                        ▼
                                                             event: tier1_ready
                                                              (全量大盘已就绪)
                                                                        │
                                                                        ▼
                                                         [llm_property_resolver 节点]
                                                          (针对长尾未决项异步对齐)
                                                                        │
                                               ┌────────────────────────┴────────────────────────┐
                                               ▼                                                 ▼
                                        【语义对齐成功】                                  【置信度不足/有歧义】
                                               │                                                 │
                                               ▼                                                 ▼
                                      event: tier2_patch                                event: hitl_interrupt
                                      (长尾项逐行补丁刷新)                              (触发 LangGraph interrupt)
                                               │                                                 │
                                               ▼                                                 ▼
                                        event: complete                                   [质检员抽屉/行内裁决]
                                       (核验全流程圆满定型)                                       │
                                                                                         [调用 resumeAudit]
                                                                                                 │
                                                                                                 ▼
                                                                                          [恢复流转至定型]
  ```
- **前端无状态展示容器 (`batchPresentationMap`)**：
  - 前端建立 `Record<string, BatchPresentationState>` 状态池，每个批次独立持有其 `tier1_ready`、`tier2_patch` 与 `hitlContext`；
  - 切换批次时零重算、零闪烁；比对矩阵支持“已定型”、“微光呼吸补丁中”与“行内 HITL 确认卡片”三态渲染。

### 2.2 多批次并发线程隔离 (Multi-Batch Isolation)
- **核心决策**：必须在物理状态机层面实现批次级隔离；
- **实现方案**：
  - LangGraph `MemorySaver` checkpointer 以复合线程键标识：`thread_id: ${sessionId}::${batchNo}`；
  - 无论同一质保书下有多少个检验批次并发流转或挂起，其状态检查点完全独立，杜绝状态竞争。

### 2.3 动态别名自学习反哺闭环 (Knowledge Feedback Loop)
- **核心决策**：质检工程师在人机协同（HITL）中所作的消歧决策，必须能沉淀为系统知识反哺下次核验，逐步压缩大模型调用开销；
- **实现方案**：
  - `PropertyKeyNormalizer` 内置动态别名学习器，支持内存索引与 `data/learned_aliases.json` 磁盘持久化；
  - 质检员确认属性映射后，系统自动提取沉淀为 `LearnedAliasEntry`；
  - 下次遇到相同供应商的相同非标表述时，在 `Tier 1` 阶段即以 $O(1)$ 复杂度直接命中已学习别名直通 Fast-Path。

### 2.4 生产提取器依赖剥离与安全守卫 (Production Extractor Safeguard)
- **核心决策**：生产环境中绝对禁止将 Mock 抽取器作为默认回退或全局单例；
- **实现方案**：
  - `server-engine.ts` 彻底移除全局 `MockCertificateExtractor` 单例注入；
  - `extract.node.ts` 增加安全防御断言：若未显式配置真实提取器且输入非结构化数据，直接安全阻断报错，杜绝伪造数据流入生产；
  - `mock-extractor.ts` 严禁对未知输入静默退回至硬编码样本，仅作为纯测试辅助工具。

### 2.6 Session 真实 Token 计量与跨阶段单调累加开销体系
为彻底根除 Token 统计中的估算伪造（如 1800 假基数或字符除以 3.5）以及重新解析时开销被抹零重置的问题，NormScale 确立了工业级会话审计计量契约：
1. **官方真实 Usage 捕获**：
   - 在流式请求体中显式开启 `stream_options: { include_usage: true }`；
   - 提取循环中精准捕获大模型服务在尾帧 chunk 中下发的 `prompt_tokens` 与 `completion_tokens`，仅在缺失时做安全兜底；
2. **LangGraph 节点开销透传**：
   - 状态机注解扩充 `tokenUsage` 通道（带 Reducer 累加规则），在流式事件 `WorkflowStreamEvent`（`tier1_ready`, `tier2_patch`, `hitl_interrupt`, `complete`）中实时透传执行毫秒数 `durationMs` 与 `tokenUsage`；
3. **重新解析历史沉淀池（单调递增不回缩）**：
   - `useDocumentParser` 引入 `historicalUsageRef`，当重新解析某份已处理文档时，将其此前产生的消耗无缝归档至历史池，新计算在历史底账上叠加；
4. **跨阶段全局会话汇聚**：
   - `WaterfallWorkbench` 统一维护 `auditMetrics`，与步骤 2 文档提取的 `sessionMetrics` 联合结算为 `totalCombinedMetrics`，工作台顶栏与核验归档卡片提供全局耗时与各阶段细分（`文档提取 X.Xs + 智能比对 Y.Ys`），全面符合工业审计心智模型。

---

## 3. 测试资产物理隔离与受控归档规范

### 3.1 物理归档收敛
所有典型场景测试资产统一收敛至：
- **目录**：`tests/fixtures/scenarios/`
- **模块清单**：
  - `index.ts`：场景高保真结构化 Payload、元数据与提取助手；
  - `public/samples/*.pdf`：对应场景的真实工业矢量 PDF 原件；
  - `.cache/parses/*.json`：对应场景的预解析切片缓存。

### 3.2 四维典型场景覆盖矩阵
| 场景 | 典型特征 | 预期流转路径 | 核心验证价值 |
| :--- | :--- | :--- | :--- |
| **Case 1** | 声明未收录特种非标牌号 `SUS 304H-SpecialX` | 触发 `UNKNOWN_GRADE` 阻断挂起，滑出 480px 抽屉引导人工指定国标牌号后恢复 | 验证 Tier 1 阻断性挂起与 `resumeAudit` 恢复流转闭环 |
| **Case 2** | 标准 NB/T 47019.5，含长尾表述“表面光洁度: 0.33 μm” | Tier 1 首帧大盘，Tier 2 语义对齐至粗糙度 Ra $\le$ 0.8 μm，判定合格 | 验证 Tier 1 ➔ Tier 2 渐进式流式补丁与全绿通过 |
| **Case 3** | 标准 NB/T 47019.5，含长尾表述“表面光洁度: 1.50 μm” | 基础项达标，Tier 2 语义对齐至粗糙度判定超标，输出红灯 FAIL 否定 | 验证长尾项语义对齐后的一票否决否定流转 |
| **Case 4** | 包含高特异性非标测试项“特种非标微区抗剪切断裂韧度K1C” | 标准中无剪切规则，Tier 2 置信度不足，触发属性级歧义挂起 | 验证行内就地 HITL 确认卡片与局部人机协同 |

### 3.3 零残留卸载机制
- 通过环境变量 `NEXT_PUBLIC_ENABLE_TEST_FIXTURES` 控制；
- 默认在开发/测试环境下生效；在生产部署时设为 `'false'`，接口与前端组件完全不挂载、不渲染该测试矩阵，保障生产纯净。

---

## 4. 踩坑与经验沉淀 (Lessons Learned)

### 4.1 结构化直通分支跳过牌号消歧校验引发的漏判陷阱
- **现象**：前端直传结构化数据时，Case 1 未能按预期唤起 HITL 抽屉，而是直接判为 FAIL；
- **根因**：直通分支原本写死 `grade_normalization: { is_matched: true }`，导致未收录非标牌号跳过了消歧器；
- **沉淀**：任何输入数据源（无论是 OCR 抽取、直传结构化 JSON 还是测试 Payload），必须强制执行 `GradeNormalizer.normalize()` 严格校验，杜绝任何直通假定。

### 4.2 遗留回调引发的 404 伪异常
- **现象**：前端装载测试用例或点击待处理队列卡片时弹出“未找到预设样本: [doc_xxx]”红框；
- **根因**：顶层父页面老旧的 `onSelectSample={id => handleExecuteAudit(id)}` 误将内部文档 ID 当作样本 ID 调用提交接口；
- **沉淀**：组件间通信必须严格界定职责边界，工作台内部文档状态切换应完全组件内聚，避免向父级泄露不一致的参数语义。
