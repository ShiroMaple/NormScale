# NormScale 路线图 (Roadmap)

> **文档维护原则（上下文截断自愈基准）**：
> 本路线图与 `cairn/LOG.md` 共同作为会话上下文被压缩截断时的**唯一真相与冷启动导航基准**。
> 任何新会话或协作者进入后，必须能够在 30 秒内明确：
> 1. **全盘进展（Where we are）**：哪些 Phase 已完成交付，核心代码与测试指标如何；
> 2. **当前下一步（What's next）**：当前焦点 Phase 的明确行动项清单，无需重新推导；
> 3. **开放决策（Open decisions）**：哪些跨阶段技术决策或业务边界悬而未决，避免踩坑与决策漂移。

**当前焦点**：**Phase 8 - NormScale 专用的 MTC 质保书内建解析层设计与实现 (Native Parser & OCR BBox Engine)**
- **待执行行动项清单（Next Steps）**：
  1. **内建版面分析与表格识别 (Layout Analysis & Table Structure Recognition)**：设计 NormScale 专用的 MTC 质保书版面分析引擎，提取多语言、多表格布局与坐标；
  2. **OCR 文本定位与 BBox 坐标对齐 (Word-level BBox Alignment)**：将识别出的理化指标与 PDF/图片视窗建立精确像素坐标级关联，支撑前端 Stage 2 的 BBox 高亮交互；
  3. **标准 Schema 契约数据直通**：直接产出符合 `certificate.schema.ts` 的结构化单据，作为后续全流程唯一的真理来源（Single Source of Truth）；
  4. **可插拔多源适配**：保留外部解析源（如 DocEx）的兼容抽象接口。

## 里程碑 (Milestones)

- [x] **Phase 1: 元模型与确定性规则核验引擎**
- [x] **Phase 2: 标准规则库存储、规格切片 (Specification Slice) 与离线入库管线**
- [x] **Phase 3: 质保书提取与归一化适配层**
- [x] **Phase 4: 领域日志系统、审计轨迹与性能度量**
- [x] **Phase 5: LangGraph 状态图与人机协同编排**
- [x] **Phase 6: API 服务层与物资验收决策看板原型**
- [x] **Phase 7: NormScale 业务工作流与全套前端页面深度纵向贯通**
  - 纵向瀑布流质检工作台（`WaterfallWorkbench`，吸顶步骤锚点 01~04）
  - 原件 BBox 坐标解析核对与归一化（产生 `CertificateExtract` 唯一真理数据）
  - 标准规则库切片与条款知识浏览器 (`StandardExplorer`，31个钢级切片与 AST 公式)
  - 历史质检台账明细与任务回溯 (`AuditLedger`)
  - 系统管理与运维配置控制台 (`AdminConsole`，模型/日志/权限)
  - 闭环模态框：物资合格放行单 (`PassReleaseModal`) 与不合格拒收处置通知书 (`RejectionNoticeModal`)
  - 全站中文语境、低饱和度工业极简美学与明暗主题一键切换
- [ ] **Phase 8: NormScale 专用的 MTC 质保书内建解析层设计与实现 (Native Parser & OCR BBox Engine)**
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
