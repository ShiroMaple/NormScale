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

### 5. 步骤 1：文档预处理、文本层分离、两级缓存索引与配置项版本失效架构

针对工业质量证明书（MTC）多来源、多页码、可能包含矢量文本或纯扫描图片的异构特征，确立了步骤 1 的全流程规范与两级缓存策略：

- **1. 格式严格准入与原件落盘**：
  - 格式门禁：严格仅支持工业 PDF 文档及主流图片格式（`PNG / JPEG / JPG / BMP`），非法格式直接在入口处拦截（400）；
  - 原件落盘：所有上传原件以 MD5 哈希命名持久化存储于 `.cache/uploads/{md5}.{ext}`。
- **2. PDF 矢量文本层检测与分离**：
  - 在客户端通过 PDF.js 矢量文本分析抽取文本层。若存在有效文本（$>20$ 字符），抽取并持久化分离为 `text.txt`；在调用大模型时作为高精度字面量参考输入，避免由于视觉分辨率或字体粘连导致的微小数字识别偏差。
- **3. PDF 高保真逐页切图**：
  - 统一在客户端将 PDF 各页栅格化渲染为 2.0x Retina PNG 高清图片，与 `text.txt` 共同存入 `.cache/preprocessed/{md5}/` 目录（`page-1.png`, `page-2.png`, ...）。
- **4. 自包含元数据索引清单**：
  - 在 `ParseCacheStore` 中建立自包含清单（记录原件路径、MD5、预处理切图/文本目录、`parserConfigVersion`、大模型推理 Token 耗时与结构化解析结果），杜绝多表维护的不一致风险。
- **5. 双重缓存命中机制**：
  - 支持“从历史缓存卡片选择载入”与“重新上传相同 MD5 文件”两种场景的双重自动命中与状态点亮。
- **6. 两级复用策略（Two-Tier Cache Retrieval）**：
  - **第一级（解析级缓存）**：若存在该 MD5 且配置项版本匹配的解析结果，默认秒级复用（0 Token 开销）；
  - **第二级（预处理级缓存）**：若未曾解析、用户选择“无视缓存重新解析”或配置项版本过期失效，直接复用 `.cache/preprocessed/{md5}/` 下已有的切图与 `text.txt`，跳过重复渲染切图直接调用大模型。
- **7. 配置项版本（Prompt / Schema）失效门禁**：
  - 引入由运维管理员在控制台（`AdminConsole` / `config.json`）维护的 `parserConfigVersion`（与 `certificate.schema.ts` 结构与 Prompt 绑定）；
  - 仅当记录的配置项版本与当前系统运行版本完全一致时才可复用解析结果；一旦版本升级，旧解析缓存自动失效并无缝触发重析。
- **8. 级联删除与台账物理隔离**：
  - 在删除历史缓存记录时，级联清理 `.cache/uploads/` 原件、`.cache/preprocessed/{md5}/` 切图/文本与 `.cache/parses/{md5}.json`；
  - 明确隔离边界：绝对不影响历史检验台账（`AuditLedger`）的独立归档存证记录。
- **9. 纯双模态输入契约**：
  - 绕过第三方私有文件上传接口，采用标准 OpenAI 兼容视觉多模态格式（文本层 Prompt + 各页高清切图 Base64），保证跨云端与本地大模型的 100% 兼容性。

### 6. 视觉 BBox 物理定位引擎与扫描件 PaddleOCR 演进架构

针对质检人员在步骤 2 核对数据时对源文档字面物理位置的可视化追溯需求，确立了“矢量文本锚点匹配 + 后端轻量 PaddleOCR 兜底”的统一分层架构：

- **1. 矢量文本锚点匹配引擎 (`BBoxAnchorMatcher`)**：
  - 矢量 PDF（占日常质保书 90%+）在预处理阶段由客户端 PDF.js 提取各页字符物理视口百分比坐标（`textTokens`），持久化存入 `.cache/preprocessed/{md5}/tokens.json`；
  - 大模型解析输出结构化 JSON（包含编号、炉号、牌号、化学、力学等指标）后，服务端通过 `BBoxAnchorMatcher` 将提取数值精确反向匹配至 `tokens.json`，秒级生成 100% 真实、亚毫米级物理精度的 `FieldBBox[]`；
  - **历史缓存自愈机制**：在 `parse/route.ts` 命中历史解析缓存时，若检测到旧缓存中 `bboxes` 为空，自动依据本地 `tokens.json` 即时回补并写回持久化缓存。
- **2. 扫描件/纯图片 OCR 演进决策（后端集成 PaddleOCR）**：
  - 决策：针对无矢量文本层的扫描件与拍照图片（`isTextBased === false`），后续通过在后端引入轻量级 **PaddleOCR (ONNX Runtime Node.js)** 进行字符级物理坐标检测；
  - 输出规范：PaddleOCR 运行后输出与 PDF.js 格式完全统一的 `tokens.json`，使下游 `BBoxAnchorMatcher` 与前端 150% 聚光灯聚焦放大 UI 100% 复用，代码零侵入。

---

## 4 大下游模块开发约束（步骤 1 关联设计）

后续在开发或重构其他模块时，**必须严格遵守以下由步骤 1 确立的架构契约**：

1. **步骤 2（核对解析数据 & BBox 联动）消费契约**：
   - 步骤 2 必须 100% 依赖步骤 1 输出的 `pages` 高清切图与大模型接口动态返回的 `bboxes` 字段；
   - 严禁在步骤 2 重新发起原件解析或切图，严禁引入任何客户端静态兜底或硬编码 BBox 字典。
2. **步骤 3（全景规则比对 & 异常回溯）重析契约**：
   - 当质检员在步骤 3 发现某项关键指标未抽全或因 Prompt 缺陷导致解析偏差时，可点击“无视缓存重新解析”；
   - 此时必须传递 `forceReparse=true` 并携带当前最新的 `parserConfigVersion`，直接复用步骤 1 的第二级预处理产物重新调用大模型。
3. **系统运维控制台（AdminConsole）升级门禁契约**：
   - 运维/研发人员在修改 `src/schemas/certificate.schema.ts` 字段结构或更新大模型 System Prompt 时，**必须在 `config.json` 中递增 `parser.version`**（如从 `1.0.0` 升级至 `1.1.0`）；
   - 系统将据此自动使旧版解析缓存失效，杜绝旧格式 JSON 污染新业务逻辑。
4. **历史台账（AuditLedger）存证隔离契约**：
   - 历史台账保存的是质检完成态（包含最终判定、人工修正痕迹与合规报表）的永久审计存证；
   - 步骤 1 的缓存级联删除（`deleteCascade`）严格限制在 `.cache/` 目录内部，严禁触碰 `localStorage` / 数据库中的 `AuditLedger` 存证镜像。

---

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

### 踩坑 4：将文件名 (filename) 作为缓存命中、去重或数据关联依据的碰撞陷阱（2026-09-02 补充）
- **现象**：早期代码在历史缓存列表聚合、单据恢复与待处理队列过滤时残存基于 `filename` 的等值匹配与同名清理逻辑。在用户上传同名但不同内容的不同批次质保书（如均命名为 `质保书.pdf`）时，导致不同炉批号数据错位覆盖或旧缓存被误删。
- **根因**：混淆了“人类可读展示名称（filename）”与“数据实体物理唯一标识（Content-Addressed MD5 / docId）”的系统语义边界。工业采购验收中，不同供应商、不同批次的 MTC 文档重名是极高频事件。
- **工程规范**：
  1. **纯 MD5 内容寻址唯一性**：物理落盘、解析索引、缓存有效性校验与去重判定 **100% 严格基于文件二进制内容 MD5 哈希**；
  2. **严禁按文件名跨实体覆盖或删除**：`filename` 严格仅作为元数据中的“纯展示字段（Label）”，绝不允许用于任何数据库/缓存的 Key、相等性匹配、覆盖或级联清理条件；
  3. **会话实例隔离**：内存中的队列与 Session 关联严格通过唯一的 `docId` 与 `md5` 精确绑定。

## 决策日志

- **2026-09-02**：彻底拔除全工程所有按 `filename` 匹配/清理缓存的逻辑漏洞，确立纯 MD5 内容寻址作为唯一可信凭据；修复历史缓存文档流转与单据恢复链路；单测 100% 通过。
- **2026-09-01**：确立 BBox 物理定位引擎标准（矢量 PDF 文本锚点匹配 + 后端 PaddleOCR 扫描件处理决策）；落地 `BBoxAnchorMatcher` 自动坐标生成与历史缓存自愈机制；单测 100% 通过。
- **2026-09-01**：完成步骤 1 预处理、文本层分离、两级缓存索引与配置项版本失效架构重构，确立 4 大下游模块开发约束；全工程拔除 `filename.includes('质保书')` 等特化硬编码，单测 100% 通过。
- **2026-08-22**：将标准规则库从单体 JSON 升级为通用规格切片（Specification Slice）与 `IRuleStore` 仓库模式；全量录入《GB/T 13296-2023》31 个钢级规则并构建离线校验工具链。
- **2026-08-21**：确认独立构建 NormScale 项目，不与 DocEx 主干直接耦合；确立“离线结构化规则库 + 确定性计算引擎 + LangGraph 有状态编排”的系统基调。
