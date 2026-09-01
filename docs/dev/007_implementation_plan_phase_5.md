# Phase 5: LangGraph 状态图与人机协同（HITL）编排层实施方案

## 1. 目标与背景

随着 Phase 1（确定性核验引擎）、Phase 2（规则切片仓库与全量标准入库）、Phase 3（质保书提取抽象与归一化流水线）以及 Phase 4（领域日志系统与性能度量）的全部交付，NormScale 已拥有完备的底层核验与清洗算力。

本阶段（**Phase 5**）的核心目标是：**将零散的抽取、清洗、规则检索、确定性核验、条款语义复核以及人工干预节点，编排为一个强健、高可观测且具备中断/恢复（Human-in-the-Loop, HITL）能力的 LangGraph 状态图工作流引擎**。

---

## 2. 用户评审要点

> [!IMPORTANT]
> **1. 外部依赖引入门禁确认**：
> 按照项目规则与 ROADMAP 规划，本阶段通过 `pnpm add @langchain/langgraph @langchain/core @langchain/langgraph-checkpoint` 引入官方 LangGraph 状态图引擎与 Checkpointer，支持声明式状态图、条件分支与 `interrupt()` 断点机制。

> [!NOTE]
> **2. 人机协同（HITL）自动挂起与恢复场景**：
> - **未知牌号挂起**：当声明牌号未能消歧命中标准规则切片时，状态机自动挂起，等待质检员人工指定或确认等效牌号；
> - **低置信度数据复核**：当 OCR/提取置信度低于安全阈值（如 `< 0.8`）时挂起，提示质检员核对原始单据；
> - **人工修正恢复（Resume）**：质检员提交修正数据后，状态机从 Checkpoint 精确恢复并重新流转，最终输出包含全量轨迹的 `AuditReport`。

---

## 3. 状态图架构与流程拓扑

```mermaid
flowchart TD
    START([● 任务启动: PDF / 图像 / JSON / 预设样本]) --> ExtractNode["<b>1. Extract_Node (抽取节点)</b><br/>调用 ICertificateExtractor 获取 RawPayload"]
    ExtractNode --> NormalizeNode["<b>2. Normalize_Node (清洗消歧节点)</b><br/>执行牌号消歧、单位换算与尺寸解构"]
    
    NormalizeNode --> CondCheck1{"牌号未识别 OR<br/>置信度 < 0.8 ?"}
    
    CondCheck1 -- 是 (触发 HITL) --> HumanReviewNode["<b>⚠️ Human_Review_Node (人工干预断点)</b><br/>LangGraph interrupt() 挂起状态<br/>等待质检员人工修正牌号或核实数据"]
    HumanReviewNode -- "质检员提交修正 (Resume)" --> RetrieveStandardNode
    
    CondCheck1 -- 否 (自动流转) --> RetrieveStandardNode["<b>3. Retrieve_Standard_Node (标准检索节点)</b><br/>从 FileRuleStore 加载 SpecificationSlice 规则切片"]
    
    RetrieveStandardNode --> DeterministicEvalNode["<b>4. Deterministic_Eval_Node (核心核验节点)</b><br/>调用 ComplianceEngine 执行数值修约、公差计算与一票否决"]
    
    DeterministicEvalNode --> SemanticReviewNode["<b>5. Semantic_Review_Node (语义条款复核节点)</b><br/>基于 ClauseStore 检索并复核定性技术条款与特殊协议说明"]
    
    SemanticReviewNode --> CondCheck2{"存在严重缺陷需<br/>特批放行 (Waiver) ?"}
    CondCheck2 -- 是 (需要特批) --> HumanReviewNode
    CondCheck2 -- 否 --> DecisionAggregatorNode["<b>6. Decision_Aggregator_Node (决策汇总节点)</b><br/>组装 AuditReport，附加 audit_traces 与 performance_metrics"]
    
    DecisionAggregatorNode --> END([🏁 流程结束: 输出最终质检核验报告])
```

---

## 4. 核心技术设计

### 4.1 状态数据模型 (`QualityAuditState`)
在 LangGraph 中定义专用的状态通道（Channels），并特别配置序列化安全的 `traces` 累加通道：
```typescript
export const QualityAuditStateAnnotation = Annotation.Root({
  /** 任务唯一标识 (用于 Checkpoint 状态持久化与恢复) */
  taskId: Annotation<string>(),
  /** 原始质保证书输入 (Buffer, Base64 或预设样本标识) */
  input: Annotation<Buffer | Uint8Array | string>(),
  /** 运行期配置参数 */
  options: Annotation<WorkflowOptions | undefined>(),
  /** 当前工作流生命周期状态 */
  workflowStatus: Annotation<WorkflowStatus>(),
  /** 提取层输出的原始松散载荷 */
  rawPayload: Annotation<RawCertificatePayload | undefined>(),
  /** 确定性归一化后的标准质保书对象 */
  normalizedCert: Annotation<CertificateExtract | undefined>(),
  /** 归一化审计日志 (牌号消歧、单位换算公式等) */
  normalizationAudit: Annotation<NormalizationAuditLog | undefined>(),
  /** 命中的标准规则全集 */
  standardRuleSet: Annotation<StandardRuleSet | undefined>(),
  /** 命中的具体规格切片 */
  matchedSlice: Annotation<SpecificationSlice | undefined>(),
  /** 确定性规则核验单项明细矩阵 */
  itemResults: Annotation<RuleEvaluationItemResult[] | undefined>(),
  /** 文本性技术条款语义复核明细 */
  semanticReviewResults: Annotation<SemanticReviewItem[] | undefined>(),
  /** 人机协同中断挂起上下文 */
  hitlContext: Annotation<HitlInterruptContext | undefined>(),
  /** 人工修正与恢复提交数据 */
  humanCorrection: Annotation<HumanCorrectionInput | undefined>(),
  /** 内存审计轨迹收集器 */
  collector: Annotation<ITraceCollector | undefined>(),
  /** 全流程审计轨迹累积通道 (纯 JSON 数据，跨 Checkpoint 安全持久化) */
  traces: Annotation<AuditTraceItem[]>({
    reducer: (curr, update) => (curr || []).concat(update || []),
    default: () => [],
  }),
  /** 最终完整质检核验报告 (包含决策汇总、单项明细与审计轨迹) */
  finalReport: Annotation<AuditReport | undefined>(),
  /** 错误异常信息 */
  error: Annotation<string | undefined>(),
});
```

### 4.2 人机协同（HITL）中断与恢复机制
利用 LangGraph 的 `interrupt()` 与 `MemorySaver` Checkpointer：
1. **自动挂起触发条件**：
   - 牌号未能消歧命中规则切片（`grade_normalization.is_matched === false`）；
   - OCR 整体置信度低于阈值（如 `< 0.8`）或关键受检指标存在识别歧义；
   - 出现一票否决严重缺陷但属于允许人工特批放行（Waiver）的协议条款。
2. **恢复机制（Resume）**：
   - 质检员在前端面板上查看挂起详情并提交人工修正数据（如将未知牌号指定为 `06Cr19Ni10` 或手动修正数值）；
   - 调用 `workflowEngine.resumeAudit(taskId, correctionData)`，图引擎从 Checkpoint 精确恢复，继续执行后续核验流程。

---

## 5. 变动与新建文件清单

### 1. 依赖管理 (`package.json`)
#### [MODIFY] [package.json](file:///Users/shiromaple/Github/NormScale/package.json)
- 安装 `@langchain/langgraph`、`@langchain/core` 与 `@langchain/langgraph-checkpoint`。
- 增加 `langgraph:dev` 调试脚本。

---

### 2. 工作流状态契约与任务节点 (`src/workflow/`)
#### [NEW] [state.interface.ts](file:///Users/shiromaple/Github/NormScale/src/workflow/state.interface.ts)
- 定义 `QualityAuditState`（含状态通道、阶段状态、抽取载荷、清洗结果、核验明细、HITL 上下文、最终报告及 `traces` 累加通道）。

#### [NEW] [trace-helper.ts](file:///Users/shiromaple/Github/NormScale/src/workflow/trace-helper.ts)
- 提供 `getSafeCollector`，解决 Checkpoint 序列化后类方法原型丢失的问题。

#### [NEW] [extract.node.ts](file:///Users/shiromaple/Github/NormScale/src/workflow/nodes/extract.node.ts)
- 调度 `ICertificateExtractor`，执行文档提取并度量耗时。

#### [NEW] [normalize.node.ts](file:///Users/shiromaple/Github/NormScale/src/workflow/nodes/normalize.node.ts)
- 调度 `CertificateNormalizer`，执行牌号消歧、单位换算与尺寸解构。

#### [NEW] [retrieve-standard.node.ts](file:///Users/shiromaple/Github/NormScale/src/workflow/nodes/retrieve-standard.node.ts)
- 调度 `IRuleStore`，按声明标准与牌号加载对应规则切片。

#### [NEW] [deterministic-eval.node.ts](file:///Users/shiromaple/Github/NormScale/src/workflow/nodes/deterministic-eval.node.ts)
- 调度 `ComplianceEngine`，执行数值修约、AST公式求值与一票否决规则比对。

#### [NEW] [semantic-review.node.ts](file:///Users/shiromaple/Github/NormScale/src/workflow/nodes/semantic-review.node.ts)
- 调度 `ClauseStore`，执行文本性条款检索与定性工艺说明复核。

#### [NEW] [human-review.node.ts](file:///Users/shiromaple/Github/NormScale/src/workflow/nodes/human-review.node.ts)
- 实现 LangGraph `interrupt()` 断点与人工干预数据回填。

#### [NEW] [decision-aggregator.node.ts](file:///Users/shiromaple/Github/NormScale/src/workflow/nodes/decision-aggregator.node.ts)
- 聚合核验明细、语义复核结果与审验轨迹，组装生成最终 `AuditReport`。

---

### 3. 状态图编排与总控引擎 (`src/workflow/`)
#### [NEW] [audit-graph.ts](file:///Users/shiromaple/Github/NormScale/src/workflow/audit-graph.ts)
- 使用 `StateGraph` 构建拓扑结构，配置条件边（路由至 `human_review` 或继续流转），接入 `MemorySaver` Checkpointer。

#### [NEW] [workflow-engine.ts](file:///Users/shiromaple/Github/NormScale/src/workflow/workflow-engine.ts)
- 封装高层外观 API：`submitAudit()`、`resumeAudit()`、`getTaskState()`。

#### [NEW] [index.ts](file:///Users/shiromaple/Github/NormScale/src/workflow/index.ts)
- 模块导出与导读注释。

#### [MODIFY] [src/index.ts](file:///Users/shiromaple/Github/NormScale/src/index.ts)
- 导出 `src/workflow` 模块。

#### [NEW] [langgraph.json](file:///Users/shiromaple/Github/NormScale/langgraph.json)
- 配置 LangGraph CLI / Studio 本地可视化调试环境。

---

### 4. 自动化测试套件 (`tests/workflow/`)
#### [NEW] [audit-graph.test.ts](file:///Users/shiromaple/Github/NormScale/tests/workflow/audit-graph.test.ts)
- 测试 1: Happy Path 全自动核验流转（提取 -> 清洗 -> 比对 -> 报告）；
- 测试 2: 未知牌号触发 HITL 挂起，人工修正后恢复执行并最终判定；
- 测试 3: 低置信度触发 HITL 挂起与恢复；
- 测试 4: 报告中的 `audit_traces` 与 `performance_metrics` 全链路完整性验证。

#### [NEW] [workflow-engine.test.ts](file:///Users/shiromaple/Github/NormScale/tests/workflow/workflow-engine.test.ts)
- 测试任务状态快照查询、自定义 options 配置与异常拦截。

---

## 6. 验证计划

1. **工作流测试**：`pnpm test tests/workflow` 验证全状态图流转与中断/恢复；
2. **全量回归**：`pnpm test:coverage` 验证全量 21 个套件、104 项单测全绿；
3. **类型安全**：`pnpm typecheck`（`tsc --noEmit`）0 错误；
4. **标准验证**：`pnpm standard:validate` 验证 31 个规格切片无异常。
