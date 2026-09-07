# NormScale 质保书长尾键名归一化与多批次分层核验重构方案（分步规划版）

本方案针对质保书比对中暴露出的两大核心问题（钛含量修约精度脱节、表面质量与粗糙度串项误判），结合系统的 LangGraph 底座，构建**“后端计算唯一真理源 + 多批次线程级隔离 + 三层渐进式核验漏斗 + 前端渐进式流式呈现”**的完整体系。

考虑到整体改动涵盖“切片数据层、归一化算法层、LangGraph 调度层、前后端通信层以及前端展示层”，为控制每次改动的爆炸半径并确保每一步均可离线验证，本方案采取**四阶段分步推进（Staged Rollout）**策略。

---

## 审查与确认项

> [!IMPORTANT]
> **已达成共识的核心系统原则：**
> 1. **计算与真理源彻底归属后端**：所有公式修约、指标比对、剪刀差归因、LLM 意图裁决以及 HITL 状态机均在后端运行，前端仅作为纯净无状态的呈现容器；
> 2. **多批次并发线程隔离**：一个 Session 中的 $N$ 个批次对应后端 $N$ 个独立的 LangGraph 执行线程（`thread_id: ${sessionId}::${batchNo}`），状态、检查点与挂起上下文完全物理隔离，互不阻塞；
> 3. **体验渐进式流式交付**：Tier 1 毫秒级返回核心大盘结果；长尾待决项行内展示微光对齐提示；HITL 原生行内卡片交互；
> 4. **全流程严守无表情符号（No Emoji）与中文输出**。

---

## 待确定事项 (Open Questions)

> [!NOTE]
> 1. **Phase 1 立即见效性**：Phase 1 实施后，无需等待 LangGraph 和 UI 的大规模改造，即可直接在现有工作台中彻底解决《测试质保书2.pdf》的钛修约与表面质量误判问题；
> 2. **离线环境降级保障**：在未配置外网 LLM Key 时，Tier 2 自动转入“确定性沙箱标记”，保证系统离线单测与本地开发体验 100% 顺畅。

---

## 分步实施规划 (Staged Implementation Roadmap)

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: 核心引擎与数据切片修正 (确定性基石，彻底修复测试用例2)            │
│ - 钛修约统一为3位                                                      │
│ - 表面外观与粗糙度原子化解耦                                           │
│ - 确定性归一化四大原则落地 (特异性优先、量纲感知、防覆盖、安全沙箱)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 交付标准: 测试质保书2核心指标全绿
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 2: 后端 LangGraph 多批次线程隔离与三层架构编排                   │
│ - 线程 ID 格式化: ${sessionId}::${batchNo}，实现 N 批次并发物理隔离     │
│ - 状态图扩展: 引入 LLM Property Resolver 与长尾待决池                   │
│ - 增强 Human Review 节点支持属性歧义与剪刀差异常挂起                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 交付标准: 后端多线程独立测试通过
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 3: 渐进式流式通信与前端展示容器升级 (UI/UX 体验升维)             │
│ - API 接入 SSE / 渐进式流式事件响应 (tier1_ready -> tier2_patch)       │
│ - 前端 WaterfallWorkbench 建立 batchNo 槽位隔离存储，切换零污染       │
│ - 矩阵行三态渲染 (已定型 / 语义对齐中 / 行内 HITL 交互卡片)             │
│ - 结果旗帜渐进式多阶段演进                                             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 交付标准: 首屏秒出，局部微光，批次秒切
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 4: 知识经验闭环反哺与端到端全量验收                              │
│ - 质检员 HITL 确认经验沉淀至本地规则库                                 │
│ - 全量单元测试 + 构建打包 + Cairn 知识库沉淀                           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 拟定变更文件与详细设计

### Phase 1: 核心引擎与数据切片修正（高优先级 · 立即执行）

本阶段聚焦于消除数据不一致与归一化串项，确保核心判定的 100% 准确率。

#### 1. [MODIFY] [S32168_06Cr18Ni11Ti.json](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/data/standards/NB_T_47019_5_2021/slices/S32168_06Cr18Ni11Ti.json)
- 将 `CHEM_NB_S32168_TI` 的 `"rounding_decimals": 2` 修改为 `3`；
- 将 `SURFACE_NB_S32168_QUALITY` 的名称修改为 `表面外观质量`，明确规则类型为纯文本定性匹配（`qualitative`）；
- 增加独立的定量规则 `SURFACE_NB_S32168_ROUGHNESS`（`property_key: "surface_roughness"`，单位 `μm`，支持 Ra ≤ 0.8 数值判定）。

#### 2. [MODIFY] [property-key-normalizer.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/property-key-normalizer.ts)
- **特异性优先分级**：增加粗糙度独立分支（匹配 `ROUGHNESS`, `RA`, `RZ`, `粗糙度`），并在顺序上前置于广义“表面/外观”；
- **量纲与类型感知**：
  - 定义 `NormalizationContext { measuredRaw?: any; unit?: string }`；
  - 若属性名仅写“表面”，但 `unit` 为 `μm` 或实测值为浮点数，自动重定向至 `surface_roughness`；
- **安全沙箱标记**：未收录项返回 `is_known: false` 与 `category: 'other'`。

#### 3. [MODIFY] [route.ts (submit)](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/audit/submit/route.ts) 与 [core.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/core.ts)
- 组装实测记录时重构 `recordsMap`，实施**防冲毁机制**：
  - 外观定性记录与粗糙度定量记录使用独立槽位存储，杜绝后者覆盖前者；
  - 非标沙箱项独立存入 `sandbox_records`，不参与标准必检项判废，消除虚假红灯。

#### 4. [MODIFY] [property-key-normalizer.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/normalizer/property-key-normalizer.test.ts)
- 补充测试用例：
  - “表面粗糙度”正确识别为 `surface_roughness`；
  - “表面质量”正确识别为 `surface_quality`；
  - 模糊输入“表面”伴随 `unit: 'μm'` 与实测值 `0.33` 时，量纲感知成功纠偏为粗糙度；
  - 验证防冲毁机制下，外观合格与粗糙度并存。

---

### Phase 2: 后端 LangGraph 多批次线程隔离与三层编排

本阶段构建长尾处理与人机协同的后端调度中枢，实现多批次强物理隔离。

#### 1. [MODIFY] [workflow-engine.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/workflow-engine.ts)
- 强化线程标识：
  - 入参支持显式传入 `sessionId` 与 `batchNo`；
  - 统一构造 `thread_id: ${sessionId}::${batchNo}`，通过 `config.configurable.thread_id` 注入 LangGraph；
  - 单一单例 `MemorySaver` 依据该 thread_id 自动划分独立的内存快照存储。

#### 2. [MODIFY] [state.interface.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/state.interface.ts)
- 新增 `PropertyResolutionCandidate` 接口，包含原始项、候选键名、推断置信度、来源层级（`tier1` / `tier2` / `tier3`）；
- `QualityAuditState` 新增 `unresolvedProperties?: PropertyResolutionCandidate[]`；
- `HitlInterruptContext` 扩充 `reason` 枚举，支持 `'PROPERTY_AMBIGUITY'` 与 `'SHEARS_ANOMALY'`。

#### 3. [NEW] [llm-property-resolver.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/llm-property-resolver.node.ts)
- 构建受限候选集解析节点：
  - 从当前标准切片规则池中提取合法的标准指标作为限定候选集；
  - 调用 LLM 进行语义、别名、单位与条件的结构化对齐；
  - 高置信度（≥ 0.85）自动合入规范记录；低置信度注入待决池。

#### 4. [MODIFY] [human-review.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/human-review.node.ts)
- 支持长尾条目的人机协同挂起：
  - 针对低置信度指标触发 `interrupt()`；
  - 保存当前批次现场并等待质检员人工确认。

#### 5. [MODIFY] [audit-graph.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/audit-graph.ts)
- 更新状态图拓扑：
  `normalize -> [条件分支: 有未决长尾?] -> llm_resolver -> [条件分支: 有歧义/低置信?] -> human_review -> retrieve_standard`。

---

### Phase 3: 渐进式流式通信与前端展示容器升级

本阶段实现极致跟手的响应体验与多批次零污染视图。

#### 1. [MODIFY] [route.ts (submit)](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/audit/submit/route.ts)
- 支持渐进式流响应：
  - 先发射 `event: tier1_ready`（携带 Tier 1 完整报告和 pending 状态列表）；
  - 后续异步发射 `event: tier2_patch` 或 `event: hitl_interrupt`。

#### 2. [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- **批次槽位状态机**：
  - 前端以 `batchNo` 为键建立展示状态池：`batchReports: Record<string, BatchPresentationState>`；
  - 批次切换仅做指针切片，严禁任何业务重算；
- **比对矩阵行三态渲染**：
  - 定型行：呈现常规检验数据与剪刀差；
  - 对齐中行：显示微光加载条（Shimmer）及“语义条款对齐中...”；
  - 行内 HITL 卡片：展示抽取项、AI 推荐映射及采纳/修改按钮；
- **结果旗帜状态机**：
  - 渐进呈现：`核心指标就绪 (18/19) · 1项条款对齐中` -> `全项核验合格`。

---

### Phase 4: 知识经验闭环反哺与端到端全量验收

本阶段沉淀质检员决策，实现系统自进化，并完成全链路回归验证。

#### 1. [NEW/MODIFY] 动态字典回流逻辑
- 质检员确认的别名映射异步回写入本地规则库，同类项下次直通 Tier 1。
#### 2. 全量端到端验证
- 运行 `pnpm test`（覆盖所有单元测试套件）；
- 运行 `pnpm exec tsc --noEmit` 校验严格 TypeScript 类型；
- 真实核验《测试质保书2.pdf》，验证钛修约 3 位一致性合并与表面外观/粗糙度无串项展示。

---

## 阶段验收与推进建议

建议我们**严格按照此规划逐步推进**：
1. **立即开启 Phase 1**：在最小爆炸半径内，直接修复钛含量修约与表面串项这两个阻断性业务 Bug，并运行单测验证；
2. **Phase 1 验收完成后**，向您汇报成果并继续推进 Phase 2 及后续阶段。
