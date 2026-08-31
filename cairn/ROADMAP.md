# NormScale 路线图 (Roadmap)

> **文档维护原则（上下文截断自愈基准）**：
> 本路线图与 `cairn/LOG.md` 共同作为会话上下文被压缩截断时的**唯一真相与冷启动导航基准**。
> 任何新会话或协作者进入后，必须能够在 30 秒内明确：
> 1. **全盘进展（Where we are）**：哪些 Phase 已完成交付，核心代码与测试指标如何；
> 2. **当前下一步（What's next）**：当前焦点 Phase 的明确行动项清单，无需重新推导；
> 3. **开放决策（Open decisions）**：哪些跨阶段技术决策或业务边界悬而未决，避免踩坑与决策漂移。

**当前焦点**：**Phase 9 - 真实文档解析、Moonshot/Kimi 模型直连与 MD5 抽取结果持久化缓存引擎 (Real Document Parsing & MD5 Cache Engine)**
- **待执行行动项清单（Next Steps）**：
  1. **真实文件上传与 MD5 存证指纹计算**：在步骤 1 支持真实本地 PDF / 图片拖拽上传，服务端秒级计算文件 `md5` / `sha256` 存证指纹；
  2. **MD5 解析结果持久化缓存机制 (.cache/parses/<md5>.json)**：
     - 若 MD5 命中缓存，直接秒级重放已解析的结构化数据与 BBox，Token 开销归零，耗时降至毫秒级；
     - 支持 `forceReparse`（强制重新解析）机制，便于提示词迭代与质检员手动刷新；
  3. **基于 config.json 的 Moonshot / Kimi 大模型直连抽取管线**：读取 `config.json` 中的 `standard` / `highspeed` 模型配置与 API Key，打通真实 MTC 结构化抽取与 SSE 流式输出；
  4. **步骤 2 真实切图与 BBox 坐标联动呈现**：服务端将 PDF 渲染为高清切图，右侧数据表格与左侧真实切图建立精准像素级 BBox 联动。

## 里程碑 (Milestones)

- [x] **Phase 1: 元模型与确定性规则核验引擎**
- [x] **Phase 2: 标准规则库存储、规格切片 (Specification Slice) 与离线入库管线**
- [x] **Phase 3: 质保书提取与归一化适配层**
- [x] **Phase 4: 领域日志系统、审计轨迹与性能度量**
- [x] **Phase 5: LangGraph 状态图与人机协同编排**
- [x] **Phase 6: API 服务层与物资验收决策看板原型**
- [x] **Phase 7: NormScale 业务工作流与全套前端页面深度纵向贯通**
- [x] **Phase 8: NormScale 专用的 MTC 质保书内建解析层、多文档异步并发调度与流式终端 (Native Parser & Async Worker Pool)**
- [ ] **Phase 9: 真实文档解析、Moonshot/Kimi 模型直连与 MD5 抽取结果持久化缓存引擎 (Real Document Parsing & MD5 Cache Engine)**
- [ ] **Phase 10: 多标准引用规则叠加与双标尺透明追溯引擎 (上线前必达 / Pre-launch Mandatory)**
  - 核心定位：处理工业质保书同时引用多份标准（如通用产品标准 GB/T 13296 与特种设备订货技术条件 NB/T 47019.5）的复杂技术契约
  - 算法实现：`composeMultiStandardSlices()` 纯函数切片合成器，实现“检验项目取并集、共有指标取严苛交集（包络线原则 / Strict Superiority）”
  - 双标尺追溯：全景矩阵与核验报告中注入双标准对比依据，明确剪刀差归因责任边界
  - 双轨制判定契约支持：后端接入放行仲裁矩阵（Release Arbitration Matrix）与双轨判定数据持久化，绝对不抹除系统客观计算结论，详见 [`cairn/dual-track-verdict.md`](file:///Users/shiromaple/Github/NormScale/cairn/dual-track-verdict.md)
  - 关联规范：详见 [`cairn/multi-standard-engine.md`](file:///Users/shiromaple/Github/NormScale/cairn/multi-standard-engine.md) 与 [`cairn/dual-track-verdict.md`](file:///Users/shiromaple/Github/NormScale/cairn/dual-track-verdict.md)
- [ ] **Phase 11: 横向多品类标准扩充、存储升级与生产容器化 (原 Phase 10)**
  - 扩充管材、板材、锻件等多品类标准规则库
  - 升级 `FileRuleStore` 为 `SqliteRuleStore` / `PostgresRuleStore`（JSONB 索引 + 事务读写），对接生产级分布式向量库
  - 全链路结构化日志、可观测性追踪与 Docker 容器化打包

## 开放问题 (Open Questions)

1. **[已解决] PDF 预览与字段对齐方案**：已在 Step 2 全面落地。采用多页高保真 2x Retina PNG 纵向平铺视窗，结合百分比自适应 BBox 标注层；鼠标悬浮右侧解析字段/实测数据行时平滑滚动至对应页并脉冲高亮源文档 BBox，悬浮左侧 BBox 同步反向高亮右侧对应项。
2. **[待实现·上线前必达] 质保书双标准/多标准引用的叠加裁决**：当前两套标准规则切片已解耦入库，设计规范已在 `cairn/multi-standard-engine.md` 定稿。遵循“前端构建优先”原则暂缓后端大改，但上线前必须在引擎层闭环 `composeMultiStandardSlices` 与双标尺透出。
3. **标准知识库浏览器入口形态**：标准知识库采用“顶部导航 Tab 切换独立页面”，还是“主看板内唤出右侧全屏 Drawer/Modal”？
4. **DocEx 联调协议字段对齐**：DocEx 抽取端点输出结构是否严格以 NormScale 的 `RawCertificatePayload` 契约为准？
5. **标准规则库存储演进触发点**：当前通过 Repository 接口层隔离文件系统，当标准数量超过多少（如 > 100 部）或引入多用户在线规则编辑时触发数据库存储插件化切换？
6. **标准离线入库工具链**：离线标准结构化初期采用“人工编写模板”还是“LLM 自动结构化初提 + 人工核验”工作流？
7. **提取层服务边界与 DocEx REST API 待办**：当前 DocEx 项目端尚未实现专用的 MTC 质保书提取 REST API 端点（此项为未来联动待办），因此 Phase 3 优先通过 `ICertificateExtractor` 接口抽象完成协议契约与适配层（Mock / Direct LLM / HTTP Client），待 DocEx API 就绪后直接填入 URL 配置即可无缝打通。
