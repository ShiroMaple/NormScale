# NormScale 路线图 (Roadmap)

> **文档维护原则（上下文截断自愈基准）**：
> 本路线图与 `cairn/LOG.md` 共同作为会话上下文被压缩截断时的**唯一真相与冷启动导航基准**。
> 任何新会话或协作者进入后，必须能够在 30 秒内明确：
> 1. **全盘进展（Where we are）**：哪些 Phase 已完成交付，核心代码与测试指标如何；
> 2. **当前下一步（What's next）**：当前焦点 Phase 的明确行动项清单，无需重新推导；
> 3. **开放决策（Open decisions）**：哪些跨阶段技术决策或业务边界悬而未决，避免踩坑与决策漂移。

**当前焦点**：**Phase 11 - 横向多品类标准扩充、存储升级与生产容器化 (原 Phase 10)**
- **核心定位**：将 NormScale 从单一不锈钢换热管扩展至碳钢、合金钢等多品类管板锻件标准，存储向生产级演进并完成容器化；
- **标准扩充**：扩充 GB/T 8163、GB/T 5310、ASME SA-213、EN 10216 等多品类标准切片库；
- **存储与运维**：升级 `FileRuleStore` 为 `SqliteRuleStore` / `PostgresRuleStore`，接入 ONNX Runtime 物理坐标抽取，完成全链路监控与 Docker 生产镜像交付。

## 里程碑 (Milestones)

- [x] **Phase 1: 元模型与确定性规则核验引擎**
- [x] **Phase 2: 标准规则库存储、规格切片 (Specification Slice) 与离线入库管线**
- [x] **Phase 3: 质保书提取与归一化适配层**
- [x] **Phase 4: 领域日志系统、审计轨迹与性能度量**
- [x] **Phase 5: LangGraph 状态图与人机协同编排**
- [x] **Phase 6: API 服务层与物资验收决策看板原型**
- [x] **Phase 7: NormScale 业务工作流与全套前端页面深度纵向贯通**
- [x] **Phase 8: NormScale 专用的 MTC 质保书内建解析层、多文档异步并发调度与流式终端 (Native Parser & Async Worker Pool)**
- [x] **Phase 9: 步骤 1 真实文档预处理、文本层分离、两级缓存索引与配置项版本失效门禁引擎 (Document Preprocessing, Two-Tier Cache & Version Invalidation Engine)**
- [x] **Phase 10: 多标准引用规则叠加与双标尺透明追溯引擎 (上线前必达 / Pre-launch Mandatory)**
  - 核心定位：处理工业质保书同时引用多份标准（如通用产品标准 GB/T 13296 与特种设备订货技术条件 NB/T 47019.5）的复杂技术契约；
  - 算法实现：纯函数切片合成器 `composeMultiStandardSlices()`，支持任意 $N \ge 2$ 份标准规则叠加，实现“检验项目取全量并集、共有指标取严苛交集（包络线原则 / Strict Superiority）”；
  - 双标尺追溯：全景矩阵与核验报告中注入多标准对比依据、单标独立核验矩阵与剪刀差归因（Scissors Attribution）明确责任边界；
  - 双轨制判定契约支持：实现放行仲裁矩阵 `resolveFinalDisposition`，系统客观计算判定与质检员人工签认双轨并行流转，绝对不抹除系统客观计算数据；
  - 前端全景比对矩阵联动：步骤 3 全景大表支持多标尺彩色徽标、主导加严标准标识与剪刀差高亮警示。
- [x] **Phase 10.5: LangGraph 有状态编排重构、渐进式流式通信与测试资产物理隔离归档**
  - 多批次并发线程隔离：LangGraph `MemorySaver` checkpointer 按 `thread_id: ${sessionId}::${batchNo}` 复合隔离，杜绝批次状态竞争；
  - 渐进式流式推流 (SSE)：Tier 1 确定性规则秒级下发 `tier1_ready` 全景大盘，长尾项异步推流 `tier2_patch` 补丁，兼顾吞吐与极速响应；
  - 知识经验自学习闭环：质检员在 HITL 中确认的属性映射自动沉淀至 `data/learned_aliases.json`，下次直通 Tier 1 Fast-Path；
  - 生产提取器安全加固：彻底从服务端生产单例与默认 fallback 中剥离 `MockCertificateExtractor`，消除假数据伪造隐雷；
  - 四维分层典型场景测试资产物理隔离归档：独立收敛至 `tests/fixtures/scenarios/`，受控于 `NEXT_PUBLIC_ENABLE_TEST_FIXTURES` 环境变量，支持一键零残留卸载；详见 [`cairn/langgraph-orchestration-and-fixtures.md`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/langgraph-orchestration-and-fixtures.md)。
- [ ] **Phase 11: 横向多品类标准扩充、存储升级与生产容器化 (原 Phase 10)**
  - 扩充管材、板材、锻件等多品类标准规则库
  - 升级 `FileRuleStore` 为 `SqliteRuleStore` / `PostgresRuleStore`（JSONB 索引 + 事务读写），对接生产级分布式向量库
  - 接入后端 PaddleOCR (ONNX Runtime) 服务，用于纯图片与扫描件（`isTextBased === false`）的物理字符 Token 坐标抽取与 `tokens.json` 统一格式产出
  - 全链路结构化日志、可观测性追踪与 Docker 容器化打包

## 开放问题 (Open Questions)

1. **[已解决] 工业 PDF 与扫描件物理 BBox 定位与视觉放大方案**：已全面落地。矢量 PDF 通过客户端 PDF.js 提取 Token 百分比坐标并由 `BBoxAnchorMatcher` 自动回溯匹配，无矢量文本的扫描件规划由后端 PaddleOCR 生成统一 `tokens.json`；前端 100% 消费标准 `bboxes` 并在步骤 2 支持鼠标 Hover 150% 聚光灯聚焦放大与视窗平滑滚动。
2. **[已解决] 质保书双标准/多标准引用的叠加裁决与透明追溯**：已全面闭环落地。纯函数合成器 `composeMultiStandardSlices()` 泛化支持 $N \ge 2$ 份标准叠加，全量并集+严苛交集，输出带 `composite_trace` 的 `CompositeSlice`；引擎支持多标尺独立裁决与加严剪刀差责任归因；放行仲裁矩阵 `resolveFinalDisposition` 规范化 7 种流转处置；工作台步骤 3 全景比对大表与综合判定看板已端到端接通并 100% 测试通过。
3. **[已解决] 标准知识库浏览器形态与数据联动**：已全面落地。顶部导航设置独立【标准库】视图，前端组件 `StandardExplorer` 彻底移除硬编码静态切片，基于 `IRuleStore` 与 `GET /api/standards/[standardId]` 动态渲染，支持两级标准与牌号联动、组织类型过滤、自适应 Tab 与条款检索。
4. **DocEx 联调协议字段对齐**：DocEx 抽取端点输出结构是否严格以 NormScale 的 `RawCertificatePayload` 契约为准？
5. **标准规则库存储演进触发点**：当前通过 Repository 接口层隔离文件系统，当标准数量超过多少（如 > 100 部）或引入多用户在线规则编辑时触发数据库存储插件化切换？
6. **[引擎与前端全景矩阵已闭环] 采购技术协议与标准优先级调度体系（Technical Agreement Priority & Override Hierarchy）**：
   - 行业合理性：技术协议属于买卖双方专用要约合同，行业普遍遵循【技术协议 > 行业订货标 > 企业标 > 国家通用标】；
   - 比对引擎闭环：五级优先级调度与加严主导生效，协议放宽法定底线时高亮预警【合同放宽法标风险】（`is_statutory_relaxation_risk: true`）并生成双层主结论（`standard_compliance_verdict` 与 `agreement_compliance_verdict`）；
   - 步骤 1 前端入口就绪：独立划定技术协议单份 PDF 上传卡片并标记【功能待实施 · 暂未接入后端】；
   - 步骤 3 全景比对矩阵彻底打通：100% 引擎驱动，彻底废除伪造 mock 数据与硬编码 if-else；
   - 牌号免选落地：步骤 3 移除牌号下拉框，只读展示原件声明牌号；原牌号位置替换为【应用技术协议】卡片（选项留空待完善）。
7. **标准离线入库工具链**：离线标准结构化初期采用“人工编写模板”还是“LLM 自动结构化初提 + 人工核验”工作流？
8. **提取层服务边界与 DocEx REST API 待办**：当前 DocEx 项目端尚未实现专用的 MTC 质保书提取 REST API 端点（此项为未来联动待办），因此 Phase 3 优先通过 `ICertificateExtractor` 接口抽象完成协议契约与适配层（Mock / Direct LLM / HTTP Client），待 DocEx API 就绪后直接填入 URL 配置即可无缝打通。
9. **历史遗留逻辑 Mock 排查与分支覆盖率专项治理**：
   - 核心洞察：数据 Mock 易于全局检索排查，但埋设在条件分支（如 fast-path 直通、错误降级、短路假定）中的“逻辑 Mock”隐蔽极深，常规行覆盖率单测常因未走异常分支而漏过隐雷；
   - 治理规划：后续专项安排带分支覆盖率（Branch Coverage 门禁 ≥ 80%）的测试度量体系，推行“分支覆盖补齐法”对各核心节点的决策分支逐一穿透，杜绝非标牌号或异常数据的静默放行漏洞。
