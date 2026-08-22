---
type: project_topic
status: active
summary: "NormScale 系统的双轨核心架构设计：离线结构化规则库 + 确定性计算引擎（数值/公式/逻辑组）+ 语义 RAG 辅助 + Universal Meta-Schema 元模型设计 + LangGraph 有状态编排。"
tags:
  - architecture
  - compliance-engine
  - meta-schema
  - langgraph
  - rag
contains:
  - decision
  - procedure
created: "2026-08-21"
updated: "2026-08-22"
related: []
authoring_mode: ai_generated
---

# NormScale 系统架构设计与技术基准

## 形成背景

物资供应部门在采购时收到不同供应商提供的工业产品质量证明书（MTC），包含材料牌号、几何规格、化学成分、力学性能、工艺试验及无损探伤等各项实测指标。传统人工验收耗时繁琐且容易漏判，而现有通用文档提取工具（如 DocEx）仅能完成单次单向内容抽取，无法承载涉及跨文档标准规则比对、前置规格路由、条件嵌套判定与质量事故阻断的强状态业务流。

## 当前结论与核心决策

### 1. 双轨核验架构（确定性规则为主 + 语义 RAG 为辅）

- **否定纯向量 RAG 用于数值核验**：Embedding 模型对微小数值差异不敏感（如碳含量超标 $0.005\%$ 易被误判为极其相似），且切 Chunk 会割裂国标表格中的前置尺寸条件（如壁厚 $\ge 1.7\text{mm}$ 才做硬度）。
- **理化指标走代码级确定性计算**：将国家/行业标准的化学成分、拉伸强度、硬度等结构化为规则库。比对时通过 TypeScript 纯代码进行区间比对与 GB/T 8170 数值修约（基于高精度算法），耗时 $<1\text{ms}$ 且**零幻觉**。
- **定性条款走语义 RAG**：对于表面质量、晶间腐蚀试验方法、热处理说明等文字型条款，通过 ChromaDB/ClauseStore 检索标准条款并交由 LLM 进行语义判定。

### 2. 通用规格切片模型与仓储模式（Specification Slice & IRuleStore）

系统不仅解耦具体材料品类，更将规则组织从单一“化学牌号”泛化为**通用规格切片（Specification Slice）**：

- **泛化规格切片（Specification Slice）**：统一承载金属牌号（S30408/Q345R）、紧固件性能等级（GB/T 3098.1 8.8/10.9）、法兰压力等级（GB/T 9124 PN16/Class 150）与密封件胶料代号（NBR 70）。
- **仓储隔离模式（IRuleStore）**：
  - `IRuleStore` 接口定义了 `resolveRuleSlice`、`getStandardMeta`、`getCompleteStandard` 与 `listAvailableStandards` 契约。
  - 当前实现 `FileRuleStore`：基于模块化目录（`data/standards/<STD>/slices/*.json`），通过内存倒排索引提供 $O(1)$ 级别别名（如 SUS304 $\to$ S30408）秒级路由（$<0.1\text{ms}$）。
  - 后续可通过接口平滑替换为 `PostgresRuleStore` / `SqliteRuleStore`，上层引擎零侵入。
- **阶梯几何尺寸公差表（DimensionToleranceTable）**：独立抽象《GB/T 13296-2023》表 1（最小壁厚）与表 2（公称壁厚），由 `tolerance-evaluator` 依据工艺与口径动态求得允许极值。

### 3. 通用材料元模型设计（Universal Meta-Schema）

系统通过统一的元模型驱动：

- **Standard Meta-Schema**：
  - `standard_meta`：标准代号、名称、版本、适用材料大类、公差阶梯表。
  - `applicability_scope`：形态、制造工艺、交货状态、几何尺寸前置条件。
  - `evaluation_rules`：支持 `numeric_range`（定量数值）、`dynamic_expression`（跨元素动态公式，如 $Ti \ge 4 \times (C+N)$）、`or_choice_group`（硬度多选一）、`alternative_group`（涡流替代水压）、`qualitative_enum`（探伤等级）、`exemption`（标准免做项）。
- **Certificate Meta-Schema**：
  - `header`：证书编号、供应商、执行标准、牌号、炉批号、几何尺寸。
  - `test_records`：扁平化的实测记录列表（类别、指标 Key、实测数值/原始字符串、单位、试验标准方法）。

### 4. LangGraph 状态图与人机协同（Human-in-the-Loop）

工业质检包含提取容错、标准消歧与一票否决决策：

- **节点流转**：`Extract_MTC` $\to$ `Rule_Routing` $\to$ `Deterministic_Eval` $\to$ `Semantic_RAG` $\to$ `Aggregate_Decision`。
- **人机干预点（Interrupt/Resume）**：当遇到 OCR 提取关键字段置信度低、牌号未在规则库收录或发生严重质量偏差报警时，挂起等待质检人员确认后恢复。
- **全局决策规则**：执行**一票否决制**（数值超标或强制项 MISSING 即判定 FAIL）。

## 决策日志

- **2026-08-22**：将标准规则库从单体 JSON 升级为通用规格切片（Specification Slice）与 `IRuleStore` 仓库模式；全量录入《GB/T 13296-2023》31 个钢级规则并构建离线校验工具链。
- **2026-08-21**：确认独立构建 NormScale 项目，不与 DocEx 主干直接耦合；确立“离线结构化规则库 + 确定性计算引擎 + LangGraph 有状态编排”的系统基调。
