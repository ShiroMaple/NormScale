# NormScale 路线图 (Roadmap)

> **文档维护原则（上下文截断自愈基准）**：
> 本路线图与 `cairn/LOG.md` 共同作为会话上下文被压缩截断时的**唯一真相与冷启动导航基准**。
> 任何新会话或协作者进入后，必须能够在 30 秒内明确：
> 1. **全盘进展（Where we are）**：哪些 Phase 已完成交付，核心代码与测试指标如何；
> 2. **当前下一步（What's next）**：当前焦点 Phase 的明确行动项清单，无需重新推导；
> 3. **开放决策（Open decisions）**：哪些跨阶段技术决策或业务边界悬而未决，避免踩坑与决策漂移。

**当前焦点**：**Phase 7 - NormScale 业务工作流与前端交互深度纵向贯通 (Deep Interactive UX & Real Workflow)**
- **待执行行动项清单（Next Steps）**：
  1. **真实文件上传与原件视图 (Real Document Upload & PDF/Image Viewer)**：支持拖拽真实质保书文件，左侧呈现原件预览并与右侧结构化提取数据形成对照；
  2. **标准切片与条款知识浏览器 (Standard Rule & Slice Explorer)**：提供独立的标准知识库查阅面板，支持质检员检索 GB/T 13296 全量 31 个钢级规则、GB/T 8170 进舍修约说明与 AST 公式；
  3. **历史核验台账与任务回溯检索 (Audit Ledger & Task History)**：构建质检台账列表，支持按批号、炉号、日期、状态（PASS/FAIL/HITL）多维检索与历史报告回溯；
  4. **深层 HITL 干预矩阵 (Comprehensive HITL & Exception Handling)**：支持单项实测值的手动覆写/修正、不合格指标特批豁免放行审批与质检工程师电子签章。

## 里程碑 (Milestones)

- [x] **Phase 1: 元模型与确定性规则核验引擎**
  - 定义 Standard Meta-Schema、Certificate Meta-Schema 与 Audit Report Schema（TypeScript + Zod）
  - 实现 GB/T 8170 数值修约、数值区间、安全 AST 动态公式求值器、OR/替代逻辑组比较器与漏检扫描器
  - 构建 GB/T 13296-2023 黄金测试基准，Vitest 单元测试通过率 100%（51 项用例），覆盖率超 90%
- [x] **Phase 2: 标准规则库存储、规格切片 (Specification Slice) 与离线入库管线**
  - 架构升级：从单一牌号映射升级为通用规格切片（Specification Slice）存储与路由架构，统一支持牌号（钢管/板材）、性能等级（紧固件 8.8/10.9）、压力等级（法兰 PN16/Class 150）与胶料代号（密封圈 NBR 70）
  - 实现基于文件与索引缓存的秒级标准规则检索器（`FileRuleStore`），支持多标准、多切片动态按需加载与 $O(1)$ 别名路由
  - 接入文本条款向量/关键词全文检索层（`ClauseStore`，用于定性说明与工艺技术条款 RAG 检索）
  - 构建《GB/T 13296-2023》全量 31 个钢级规则切片及表1/表2几何尺寸公差表，提供 `pnpm standard:validate` 离线校验工具（65 项测试全部通过）
- [x] **Phase 3: 质保书提取与归一化适配层**
  - 建立统一提取抽象接口 `ICertificateExtractor`，支持本地确定性 Mock、DocEx HTTP Client 与 Direct LLM 多后端适配
  - 实现材料牌号消歧器 `GradeNormalizer`（联动 31 个切片别名字典秒级映射 SUS304/TP316L/904L/254SMO 等）
  - 实现物理量工程单位换算器 `UnitNormalizer`（基于 BigNumber 实现 kgf/mm²、psi/ksi $\to$ MPa 零精度损失转换）
  - 实现检验项名称映射 `PropertyKeyNormalizer`、定性结论清洗 `QualitativeNormalizer` 与尺寸解析 `DimensionNormalizer`
  - 构建 `CertificateNormalizer` 归一化总控流水线，92 项单元测试 100% 通过
- [x] **Phase 4: 领域日志系统、审计轨迹与性能度量**
  - 构建 `ILogger` 门面与轻量级自然语言日志引擎，支持 `[EXTRACTOR]`、`[NORMALIZER]`、`[REPOSITORY]`、`[ENGINE]`、`[PERF]` 分级多色标签
  - 实现微秒级 `PerformanceProfiler` 性能度量器，精确统计各阶段耗时（切片加载、牌号消歧、单位换算、规则比对等）
  - 实现 `MemoryTraceCollector` 内存审计轨迹收集器，将自然语言决策轨迹与性能指标无缝注入 `AuditReport`
  - 完成核心模块全链路日志埋点，19 个测试套件 98 项单元测试 100% 通过
- [x] **Phase 5: LangGraph 状态图与人机协同编排**
  - 定义 `QualityAuditStateAnnotation` 状态通道与序列化安全的 `traces` 累积通道
  - 编排 7 大流水线节点（`Extract` $\to$ `Normalize` $\to$ `RetrieveStandard` $\to$ `DeterministicEval` $\to$ `SemanticReview` $\to$ `HumanReview` $\to$ `DecisionAggregator`）
  - 实现基于 `interrupt()` 与 `MemorySaver` 的 HITL 人机协同断点挂起与质检员人工修正精准恢复机制
  - 封装开箱即用的 `WorkflowEngine` 门面 API，21 个测试套件 104 项单测 100% 通过
- [x] **Phase 6: API 服务层与物资验收决策看板原型**
  - 开发 Next.js 15 App Router 接口体系（`/api/standards`, `/api/samples`, `/api/audit/submit`, `/api/audit/status/[taskId]`, `/api/audit/resume/[taskId]`）
  - 构建宽屏双列交互看板 UI（左侧原始质保书结构化视图，右侧红/黄/绿合规判定矩阵与自然语言决策轨迹流）
  - 构建基于 `framer-motion` 的 HITL 人机协同干预抽屉组件（支持牌号修正建议、实测值微调、特批放行与恢复流转）
  - 编写 API Route 路由层集成测试，Next.js 15 生产级打包成功，22 个测试套件 108 项测试 100% 通过
- [ ] **Phase 7: NormScale 业务工作流与前端交互深度纵向贯通**
  - 真实 PDF/图像上传与原件视图对照
  - 标准规则库切片与条款知识浏览器 (Standard Explorer)
  - 历史核验台账与任务回溯检索 (Audit Ledger)
  - 深度 HITL 干预矩阵（值覆写、指标特批放行、质检多级签章）
- [ ] **Phase 8: DocEx 质保书专用抽取 REST API 服务构建与真机联调**
  - 在 DocEx 项目端实现面向 MTC 的版面分析与结构化抽取 REST API 端点（`POST /api/v1/extract/mtc`）
  - 激活 NormScale 侧 `HttpCertificateExtractor`，完成跨项目真实 PDF 提取与全流程真机联调
- [ ] **Phase 9: 横向多品类标准扩充、存储升级与生产容器化 (原 Phase 7 后置)**
  - 扩充管材、板材、锻件等多品类标准规则库
  - 升级 `FileRuleStore` 为 `SqliteRuleStore` / `PostgresRuleStore`（JSONB 索引 + 事务读写），对接生产级分布式向量库
  - 全链路结构化日志、可观测性追踪与 Docker 容器化打包

## 开放问题 (Open Questions)

1. **PDF 预览与字段对齐方案**：在左侧 PDF 原件预览中，是否需要实现“点击右侧实测数据行，左侧 PDF 自动滚动并用黄色高亮框圈出对应 OCR 识别区域（Bounding Box 溯源）”？
2. **标准知识库浏览器入口形态**：标准知识库采用“顶部导航 Tab 切换独立页面”，还是“主看板内唤出右侧全屏 Drawer/Modal”？
3. **DocEx 联调协议字段对齐**：DocEx 抽取端点输出结构是否严格以 NormScale 的 `RawCertificatePayload` 契约为准？
4. **标准规则库存储演进触发点**：当前通过 Repository 接口层隔离文件系统，当标准数量超过多少（如 > 100 部）或引入多用户在线规则编辑时触发数据库存储插件化切换？
5. **标准离线入库工具链**：离线标准结构化初期采用“人工编写模板”还是“LLM 自动结构化初提 + 人工核验”工作流？
6. **提取层服务边界与 DocEx REST API 待办**：当前 DocEx 项目端尚未实现专用的 MTC 质保书提取 REST API 端点（此项为未来联动待办），因此 Phase 3 优先通过 `ICertificateExtractor` 接口抽象完成协议契约与适配层（Mock / Direct LLM / HTTP Client），待 DocEx API 就绪后直接填入 URL 配置即可无缝打通。
