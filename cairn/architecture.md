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
  - lesson
  - pitfall
created: "2026-08-21"
updated: "2026-09-01"
related:
  - cairn/mtc-schema-evolution.md
  - cairn/viewport-scroll-isolation.md
  - cairn/ocr-bbox-lens-guide.md
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

## 踩坑经验与反硬编码规范（2026-09-01 补充）

### 踩坑 1：样本特化 ID 与伪造 Fallback 残留陷阱
- **现象**：在对接真实多钢厂多格式质保书时，代码中残存 `if (docId === 'doc_zpje_01')`、`currentBatch.batchNo.includes('DB7')`、`if (!samplePages) return;` 等特化保护逻辑，导致新文件 BBox 坐标联动失效、尺寸数据写死、人工切换牌号时弹出虚假超标原因。
- **根因**：早期 POC 演示为了高保真交互写死了静态样本，在后续真实 API 接入时采用“打补丁”式的条件分支保护，而非重构为通用的空值安全契约。
- **工程规范**：
  1. **Schema-First 驱动**：UI 组件 100% 消费标准数据结构，严禁编写任何针对具体业务 `docId` / `batchNo` 的判断分支；
  2. **Zero-Mock by Default**：未提取字段严格留空（`''`）并显示浅色占位符（`placeholder="--"`），严禁编写任何带有业务假数据的默认 fallback；
  3. **静态扫描与黑盒验证**：将历史测试样本特征词加入扫描门禁，编写全链路未知文档端到端测试。

### 踩坑 2：流式打字状态高频触发导致 Object URL 泄漏与 iframe 剧烈重载
- **现象**：流式打字（30ms/次）触发父组件频繁重渲染，PDF 预览视窗剧烈闪烁。
- **根因**：在 JSX 渲染体内部直接调用 `URL.createObjectURL(uploadedFile)`，每次 re-render 生成新 Blob URL 导致 `<iframe src={url}>` 被浏览器判定为加载新页面而每秒重载数十次。
- **工程规范**：
  - 在文件加入队列时单次创建并在状态（`uploadedFileUrls`）中缓存 Blob URL，组件卸载时统一注销；JSX 中严格仅读取缓存 URL。

### 踩坑 3：真实上传文档视窗缩放与 BBox 交互图层解耦
- **现象**：物理上传 PDF 无法响应 `zoomLevel`（50%~300%）调节，且无法进行 BBox 高亮框聚焦。
- **工程规范**：
  - 真实上传文档统一渲染在标准画幅容器（`#pdf-page-1`）中，容器宽高与 `transform: scale(...)` 严格绑定 `zoomLevel` 与聚光灯放大状态；
  - 画布上层叠加透明、高透光、零遮挡的百分比 BBox 交互标注图层，实现与右侧字段的双向平滑联动。

## 决策日志

- **2026-09-01**：全面拔除全工程所有样本特化分支（`doc_zpje_01`、`DB7`、写死条款与假工号），确立零 Mock 动态契约规范；实现真实上传 PDF 的稳定去闪烁渲染、50%~300% 缩放与双向 BBox 定位联动。
- **2026-08-22**：将标准规则库从单体 JSON 升级为通用规格切片（Specification Slice）与 `IRuleStore` 仓库模式；全量录入《GB/T 13296-2023》31 个钢级规则并构建离线校验工具链。
- **2026-08-21**：确认独立构建 NormScale 项目，不与 DocEx 主干直接耦合；确立“离线结构化规则库 + 确定性计算引擎 + LangGraph 有状态编排”的系统基调。
