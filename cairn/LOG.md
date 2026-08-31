# Project Cairn 日志

> **文档维护原则（上下文截断自愈基准）**：
> 本日志按时间倒序（最新条目在顶部）记录实质性进展、关键决策与成果指针，单条不超过 20 行。
> 当会话被压缩截断后，配合 `cairn/ROADMAP.md` 可作为复原当前最新代码与设计真相的索引。详细结论必须原地沉淀至 `cairn/<topic>.md` 知识专题中。

## 2026-08-31 · 前端 Mock 数据彻底清理与 config.json 在 AdminConsole 系统管理页面的双向动态映射

- 服务端配置与缓存检索 API (`/api/admin/config` & `/api/documents/cached`)：实现 `config.json` 的严格 Zod 契约校验读写持久化，以及 `.cache/parses/` 本地真实已解析文档摘要动态提取；
- 系统管理页面全面重构 (`AdminConsole`)：彻底移除写死假模型与假日志；动态映射渲染全部 OpenAI 兼容模型卡片，支持在线编辑 BaseURL/Model/超时/Thinking Effort/环境变量名，支持一键切换默认模型与持久化保存；
- 工作台与历史台账真实化 (`WaterfallWorkbench` & `AuditLedger`)：步骤 1 待处理队列初始清空，历史缓存栏自动请求真实已解析文件；历史台账移除假 Session 数据，纯读真实保存结果，无数据时呈现工业空台账状态；
- 全套 27 个测试套件（119 个测试用例）100% 全部通过。

## 2026-08-31 · Phase 9 真实文档解析、OpenAI 兼容模型直连、MD5 结果缓存与严格错误门禁全链路落地

- OpenAI 兼容协议抽取器 (`OpenAiCompatibleExtractor`)：遵循通用 `/v1/chat/completions` 标准，基于 `config.json` 解耦模型厂商；实现工业级 MTC 结构化抽取 Prompt 与 `SessionDocument` 装配；
- MD5 抽取结果持久化缓存仓储 (`ParseCacheStore`)：持久化至 `.cache/parses/<md5>.json`，实现已解析文档毫秒级秒开（0 Token 消耗）；支持 `reparseDocument` 强制绕过缓存重新解析；
- 文档解析与上传 API 端点 (`/api/documents/parse`)：计算物理文件 MD5 指纹，优先检索本地缓存；执行严格错误门禁（无 API Key 或网络失败时绝对不降级拟真，直接阻断并提示维护配置）；
- 工作台全链路贯通 (`WaterfallWorkbench` & `BatchContextBar`)：步骤 1 开放真实本地文件选择/拖拽上传，步骤 2 标题栏集成【重新解析】操作；25 个测试套件（116 个单元测试）全部通过。

## 2026-08-31 · 路线图里程碑更新与文档 MD5 解析结果持久化缓存设计决策

- ROADMAP 里程碑演进：勾选完成 Phase 8（多文档异步并发调度与流式终端），正式确立并插入 **Phase 9: 真实文档解析、Moonshot/Kimi 模型直连与 MD5 抽取结果持久化缓存引擎**；
- MD5 抽取结果持久化缓存策略（`.cache/parses/<md5>.json`）：
  - 价值：消除重复文档在开发测试与生产重放时的 Token 与时间消耗，实现毫秒级秒开；
  - 契约：持久化文件哈希、解析时间戳、模型版本、Token 开销指标、原始打字流与结构化 `CertificateExtract` 数据；
  - 机制：提供 `forceReparse: boolean` 参数支持质检员手动一键绕过缓存重新解析；
- 严格错误门禁（严禁静默拟真）：当未配置 API Key 或模型调用失败时，除非队列文档已全部命中缓存，否则一律阻断执行并显式提示联系管理员维护配置。

## 2026-08-31 · 多文档异步并发解析 (Worker Pool)、大模型实时流式终端与 Session 累计 Token 开销全景落地

- 多文档异步并发调度 (`useDocumentParser`)：构建并发上限为 2 的异步解析工作池，支持批量选取多份文档后一键切入步骤 2；首份文档就绪即刻开放核对，后台并发解析其余文档；
- 大模型实时流式输出终端 (`LlmStreamingTerminal`)：背景色与浅色/深色主题动态完全对齐（`bg-surface-container-lowest` / `dark:bg-surface-dark`），移除 `font-mono` 统一采用无衬线系统标准字体；拟真呈现打字机 JSON 输出、微步阶段指示与动态进度条；解析就绪后延迟 800ms 自动平滑折叠；
- Session 累计 Token 开销与耗时指标：步骤 2 标题行右侧实时展示全 Session 累计输入/输出 Tokens 及总耗时，支持质检员随时点击【查看模型流式输出】展开回溯；
- 顶栏文档选择器深度集成微感知 (`BatchContextBar`)：下拉菜单集成文档并发状态徽标（`成功就绪`、`解析中 XX%`、`排队中`），支持主动切换至解析中文档动态承接流式打字；全界面遵循严格无 Emoji 工业级规范。

## 2026-08-31 · PDF 顶栏浮窗重构、鼠标全向拖拽平移、html-to-image 像素级 PNG 截图与步骤 4 恢复指引

- PDF 顶栏居中徽标重构：将原页面内绝对定位的蓝色浮窗移至顶部工具栏居中位（标题与缩放控件之间），彻底解决大比例放大滚动到最顶端时遮挡或无法点击退出的问题；
- PDF 初始水平绝对居中修复：将 PDF 默认缩放由 125% 修正为 100%（460px 完美适配 500px 列宽），并在文档与缩放变更时自动校准 `scrollLeft` 水平居中，彻底消除首次加载偏左错位；
- 鼠标全向拖拽平移支持 (Drag-to-pan)：通过全局 window 级事件监听与动态容器扩展，彻底解决原先只能垂直滚动的限制，完美支持左右横向、上下纵向与对角线斜向自由平滑拖拽；
- PNG 截图文字偏移与重叠遮挡根治：升级为浏览器底层渲染管线的 `html-to-image`（SVG foreignObject + 2x 视网膜高清输出），并通过显式配置 `width/height` 与 `style: { margin: 0, left: 0, top: 0, maxWidth: none }` 彻底消除左侧空白与右侧截断，实现 100% 完整、精准对齐的无损长图导出；
- 步骤 4 代码保留与重启指引：编制 `cairn/step4-reactivation-guide.md`，详尽记录步骤 4 现有视图保留现状与未来 3 处极简恢复改动清单。

## 2026-08-31 · 工作台步骤 4 隐藏与步骤 3 动作流转三按钮（保存结果/保存截图/开启新任务）落地

- 步骤 4 入口收敛：底部 Stepper 导航栏调整为 3 步连线展示（隐藏归档/导出），垂直滑动受控边界限制在步骤 3（`goToStep <= 2`），移除原有前往步骤 4 按钮；
- 步骤 3 动作区三联按钮：
  - 【保存结果】（主要高亮位）：当前 Session 完整系统与人工判定数据存入 `localStorage`，打通 `AuditLedger` 历史检验台账；
  - 【保存截图】（次要位）：采用原生 HTML5 Canvas + SVG foreignObject 离屏栅格化，零第三方依赖生成 2x 高清 PNG 图片并触发下载；
  - 【开启新任务】（次要位）：自动静默归档当前检验结果，生成全新初始 Session 并平滑返回步骤 1；
- 浮动 Toast 反馈：挂载工业级顶部轻量 Toast 提示组件，自动呈现操作结果。

## 2026-08-30 · PDF 视窗缩放上限扩展至 300% 与自动放大保持/退出重构

- 缩放上限与控制优化：将 PDF 视窗全局缩放范围由 `75%~175%` 放宽至 `50%~300%`，步长优化为 `25%`；点击中间百分比数值支持一键还原 100%；移除 `maxWidth: 100%` 限制，使得大比例放大下支持无损横向滚动查验；
- 聚焦放大保持设计：鼠标离开字段或 BBox 后取消自动回缩，持续锁定 200% 聚焦视窗，使质检员可从容将鼠标移至右侧输入框打字录入；
- 退出放大交互：放大提示徽标常驻提供【退出放大 (ESC)】点击按钮，并全局监听键盘 `ESC` 键一键退出，翻页与切换批次自动重置。

## 2026-08-28 · 步骤 2 结构化数据常态可编辑与置信度预警 ⚠️ 悬浮详情落地

- 方案一落地（常态直接编辑）：将步骤 2 右侧解析数据大表及专业子 Tab 的实测值单元格全面升级为常态可编辑状态（原生 input 交互），无需点击额外的 edit 按钮即可就地校准，修改后即时保存并联动同步下游步骤；
- 置信度低冗余警示：对低置信度（<85%）或标记需核实的字段，仅在单元格右侧紧凑呈现单个“⚠️”警示标，鼠标 hover 时通过浮层优雅展示 OCR 识别置信度百分比与原件核验指引；
- 视觉与字体净化：全量清理步骤 2 实测表与 4x3 元数据卡片中的 `font-mono`，统一为现代无衬线规范字体，保持原件 BBox 悬浮聚焦放大联动。

## 2026-08-28 · 全景合规比对大表判定状态列 HITL 标签统一为显式琥珀黄

- 样式收敛修正：在 `WaterfallWorkbench.tsx` 的全景合规比对矩阵中，将【判定状态】一列渲染 HITL 状态标签的样式直接收敛为显式琥珀黄组合类（`bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 shadow-2xs`），彻底消除此前残留的淡紫色，实现与炉批选择器徽标、横幅琥珀黄视觉统一。

## 2026-08-28 · 部署 4 大 HITL 典型场景专属检验批次与比对矩阵项目级联动

- 场景验证样本就绪：在 `doc_tisco_02` 中依次部署 4 个专属工业试样炉批：`TS-2026-9903`（牌号语义消歧）、`TS-2026-9904`（涡流替代水压确权）、`TS-2026-9905`（国标与能标晶间腐蚀条款冲突仲裁）、`TS-2026-9906`（金相微观组织定性语义争议）；
- 全景矩阵状态联动：在合规比对矩阵中将各场景待决项（镍元素、水压探伤、耐腐蚀、显微组织）与各批次精准关联，动态呈现琥珀黄 `? 待消歧` / `? 待确权` / `? 待仲裁` / `? 待定性`；
- 抽屉与闭环自愈：点击对应批次的【处理】按钮自动分发呈现该场景定制化表单，提交后即时重算转为正常流转态。

## 2026-08-28 · 全面确立 HITL 琥珀黄语义主题色与挂起横幅状态机交互优化

- 主题色规范收敛：将全系统 HITL 协同状态的主题色统一定位为“琥珀黄”（Amber，Token: `#FEF3C7` / `#92400E`），消除此前选择器与下拉面板的红/紫混杂不一致；
- 进度指标补全：在会话上下文栏总进度中新增动态 `X HITL` 琥珀黄徽标，完整覆盖 PASS / FAIL / HITL 三态；
- 挂起横幅与按钮收敛：修正横幅优先级判定，挂起时全栏渲染琥珀黄色系；人工复核区在 HITL 期间收敛为仅提供高饱和琥珀黄【处理】按钮，流转后才恢复【拒收】与【审批通过】。

## 2026-08-28 · 步骤 3 人机协同 (HITL) 必要场景确立与侧边抽屉架构规范定稿

- 权责边界厘清：严格解耦“双轨制终审”与“HITL 挂起协同”，明确特批放行与人工否决由主界面横幅原生处理；HITL 严格仅在系统由于前提阻断“无法确定性计算”时触发挂起；
- 4 大必要挂起场景确立：明确收敛为【材料牌号语义消歧】、【替代条款与免做项确权】、【多标准互斥仲裁】与【定性条款语义争议】；
- 界面形态锁定：确定采用方案 A（约 500px 侧边抽屉），具备主屏无遮挡对照、动态场景分发、裁决提交后即时刷新客观计算等核心特性；沉淀规范至 [`cairn/hitl-scenarios-and-drawer.md`](file:///Users/shiromaple/Github/NormScale/cairn/hitl-scenarios-and-drawer.md)。

## 2026-08-28 · 步骤 3 全景合规比对矩阵列顺序调优（标准条款前置）

- 标准依据优先视觉流向：在步骤 3 全景合规比对矩阵中，将【执行标准要求 [Min, Max] / 条款规范】列调换至【报告测量值 / 实际结果】列之前；
- 认知心理模型顺畅：阅读顺序遵循“指标名称 -> 准入红线/标准要求 -> 实际检测试验值 -> 偏差与判定结果”，更符合质检工程师对标核验习惯；
- 质量验证：严格遵守无主动子代理和无全量单测原则，`tsc --noEmit` 0 错误顺利通过，热重载即时生效。

## 2026-08-28 · 步骤 2 提取列表类别标签文案与配色向步骤 3 规格完全对齐

- 统一类别简写与视觉色系：将步骤 2 页面（数据核对大表）中各项的类别标签由原本的长文案与散乱色彩，完全统一为步骤 3 标准简写与配色系统：`化分`（天蓝）、`力学`（翡翠绿）、`工艺`（紫罗兰）、`金相`（青蓝）、`腐蚀`（明橙）、`探伤`（靛蓝）、`尺寸`（蓝绿）、`表面`（蓝绿）；
- 界面视觉一致性：步骤 2 与步骤 3 表格第一列类别 Chip 达成 100% 样式与文本对齐，交互体验平滑连贯；
- 质量验证：严格遵守无主动子代理和无全量单测原则，`tsc --noEmit` 0 错误顺利通过，热重载即时生效。

## 2026-08-28 · 综合判定横幅双轨制（系统客观判定 55% vs 人工复核判定 45%）落地与规范定稿

- 双轨制权责解耦：综合判定横幅左右拆分为【系统客观判定】与【人工复核判定】，明确确立“人工判定非必须、可撤销，且绝不覆盖系统判定的客观计算结果”的核心原则；
- 布局与交互演进：状态标签调整至“人工复核”正下方，文案升级为 `APPROVE` 与 `REJECT`；移除独立撤销链接，升级为再次点击已激活按钮直接撤销（Toggle）；修复分栏列宽与容器高度溢出，操作按钮精准自适应占满横幅容器自然高度，彻底消除文字纵向折行与按钮异常柱状拉伸；移除右列 `justify-between` 并让下方横幅 `flex-1` 吸收垂直空隙，说明文字解除截断改为 `line-clamp-2` 完整展示；
- 冲突独立分栏背景色：未签认时右侧继承系统底色保持视觉一致，当人工签认与系统计算冲突时（如系统 PASS 但人工 REJECT），右侧突变独立呈现绯红/翡翠绿警示底色，形成鲜明责任审计对比；
- 数据契约与架构沉淀：在 `BatchSpecimen` 引入 `systemVerdict` 与 `humanVerdict` 双轨字段，建立专题规范 [`cairn/dual-track-verdict.md`](file:///Users/shiromaple/Github/NormScale/cairn/dual-track-verdict.md)，定义终审放行仲裁矩阵，供后续后端服务对齐；
- 质量验证：严格遵循不使用子代理与不执行全量单测原则，`tsc --noEmit` 0 错误顺利通过，热重载即时生效。

## 2026-08-28 · 步骤 3 执行标准多选可搜与材料牌号动态级联索引 Combobox 重构落地

- 执行标准多选可搜（Multi-Select Combobox）：将单一切换按钮重构为独立下拉选择器，字号提升并呈现选中态，支持 Checkbox 多选勾选（如同时选中 NB/T 47019.5 与 GB/T 13296），顶部集成实时模糊搜索输入框；
- 材料牌号动态级联索引（Single-Select Combobox）：牌号下拉候选列表由当前勾选的执行标准集合动态生成并集，共同收录牌号打上翡翠色“双标覆盖”标签，支持按代码或品名模糊搜索与“智能同名匹配优先”平滑过渡；
- 右侧常驻重置按钮（Reset to Declared）：右上角常驻 `[ ↺ 重置原件 ]` 交互按钮，发生人工切换时亮起并伴随“人工重置规则”徽章，点击一键恢复质保书原件声明标准与牌号；
- 质量验证：严格遵循不使用子代理与不执行全量单测原则，`tsc --noEmit` 0 错误通过，无构建与语法隐患；
- 缺陷自愈修复：修复 `activeStandard` 解析正则错误包含 `\s` 导致国家/行业标准内部空格被劈成 `NB/T`、`47019.5-2021` 等 4 个碎片的视觉与计数缺陷，实现严格按顿号切分并自动缝合历史碎片，Chip 正确呈现完整标准代号（已选 2 部）。

## 2026-08-28 · 步骤 3 顶部草图重构落地：质保书客观信息与判定基准语义解耦、双按钮决策流

- 结构解耦与对等双栏：左侧卡片确立为纯粹的【质保书信息】，完整展示产品名称、质保书编号、原件声明标准、牌号、双炉号、交货规格与供货商；
- 判定基准与切换闭环：右侧划分为独立的【当前执行标准与牌号基准】，支持在线切换标准/牌号，人工重置徽标与“恢复默认”链接内聚在基准卡片中；
- 质检裁决动作规范化：右下综合判定看板设立固定双按钮——主按钮高亮“审批通过”（记录人工合格确认）与副按钮“拒收”（记录人工不合格确认）；HITL 待决态时并列呈现“处理”按钮唤出协同抽屉；
- 协作原则遵循：坚决跳过子代理验证与全量单元测试，`pnpm typecheck` 严格 0 错误保障。

## 2026-08-28 · NB/T 47019.5-2021 原生标准拆解入库与多标准合规比对引擎架构设计

- NB/T 47019.5-2021 原生标准拆解入库：依据 `standard.schema.ts` 完成锅炉热交换器用管订货技术条件第 5 部分（不锈钢）全量条款拆解，建立 `data/standards/NB_T_47019_5_2021/` 标准库与 S32168、S30408、S31603、S34778、S31008 等规格切片，100% 通过 Zod Schema 校验与离线单测；
- S32168 双标准差异精细化比对：识别出 NB/T 47019.5 较通用国标 GB/T 13296 的核心加严点——断后伸长率由 35% 提升至 40%、晶间腐蚀每批强制必检、水压提高至 20MPa 且替代涡流灵敏度提高至 E2H；
- 多标准引用合规比对引擎架构设计：确立“主基准标准 + 订货附加技术条件叠加切片”模型与“严苛者优先（Strict Superiority）”仲裁原则，在 `cairn/multi-standard-engine.md` 沉淀领域知识与全景矩阵双标尺透明追溯呈现方案；
- 路线图规划：在 `cairn/ROADMAP.md` 中将“多标准引用规则叠加与双标尺透明追溯引擎”明确登记为上线前必达里程碑（Phase 9），当前坚守前端界面构建优先节奏。

## 2026-08-27 · 步骤 3 页面重构落地：全景合规比对矩阵、规则切片在线切换与三态 HITL 决策流

- 全景合规比对矩阵（Master Compliance Matrix）：彻底废除左右分栏导致实测值重复展示与视线跳跃的低效架构，将步骤 2 确认的全部 23 项指标与执行标准要求同行相邻高密度并排，阅读核验效率提升 100%；
- 覆盖 9 大类专业 Filter 页签：全部（23 项）、化学（9 项）、力学（4 项）、工艺（2 项）、金相（1 项）、腐蚀（1 项）、探伤（2 项）、尺寸表面（2 项）与非标扩展（2 项）；
- 规则切片在线切换（Manual Override）：支持从标准库（GB/T 13296、NB/T 47019.5 等）自由切换材料牌号（如切至 S30408），系统即时联动判定结果（Cr 17.41% < 18.00% 触发 FAIL 告警与一键生成拒收单），并支持一键恢复原件切片；
- 三态判定与人机协同决策横幅：动态支持 PASS（全项合规）、FAIL（一票否决）与 HITL（待协同裁决），并提供行内特批放行与拒收处置；
- 全量测试 23 个套件 111 项单元测试与 `pnpm build` 100% 验证通过。

## 2026-08-27 · 解析数据置信度列移除、试验方法去伪求真与结果/依据纯文本独立 BBox 溯源落地

- 移除冗余置信度列：从解析数据总览大表及化学成分卡片中彻底剔除“置信度”列，横向空间等比释放给“检验项目”、“测得值”与“依据标准”，彻底消除折行挤压；
- 试验方法去伪求真：化学成分 9 元素由于源文档未打印独立方法标准，如实客观展示为 `-`（依据产品总标准），彻底根除此前脑补的 `GB/T 4336` 幻觉；
- 依据与结果纯文本独立 BBox 溯源：
  - 测得值单元格与试验依据单元格拆分为两个独立的交互项，且严格遵循无图标、无边框的极简工业表格排版；
  - Hover 测得值：左侧视窗精准高亮原件数值（如 `621、620` 或 `合格 OK`）；
  - Hover 试验依据：左侧视窗精准高亮原件方法标准区域（如 Page 2 表头 `GB/T 228.1-2021` 或 Page 1 执行标准列）；
- 全量 23 个测试套件 111 项单测与 `pnpm typecheck` 100% 持续通过。

## 2026-08-27 · Cairn 知识审计（Audit）：长对话经验全面提炼与 3 大知识专题建立

- 知识审计与提炼落盘：依据 `references/audit.md` 全面审查近两日长对话与开发记录中的未沉淀资产，正式提炼并落盘 3 个核心专题文档：
  - `cairn/mtc-schema-evolution.md`：工业质保书双炉号（Heat vs Pack No.）追溯领域建模与基于通用扩展池的 Schema 零破坏性演进；
  - `cairn/viewport-scroll-isolation.md`：复杂分栏核验工作台视口隔离、单侧定向滚动调度与 CSS 隐式 auto 规避；
  - `cairn/ocr-bbox-lens-guide.md`：工业源文档视觉 OCR BBox 标注联动、1000ms 防晕延时放大与单实线零遮挡规范。
- 联动更新：`cairn/architecture.md` 完成相关专题双向链接。

## 2026-08-27 · 源文档高亮框单实线重构、零遮挡优化与 BBox 坐标回归第一版基准

- 边框线型与遮挡优化（用户确认完全符合预期）：
  - 彻底移除 `ring-2 ring-offset-1`，改用纯粹单实线 `border-2 border-primary`，配合轻透背景 `bg-primary/10`，彻底不掩盖底层的黑色表格线与字迹；
  - 移除原覆盖在单元格上方的 `-top-7` 悬浮 Tooltip（彻底杜绝压在相邻表头或相邻行文字上的遮挡问题），改为在 PDF 页面左上角空白边距呈现非侵入式状态徽标 `已定位 / 聚焦放大 200%`。
- BBox 坐标回归第一版成熟基准：
  - 针对上一轮全量重新测量因切图页边距差异导致 Y 轴整体上浮 1 行的偏差，全面回滚 Page 1、Page 2、Page 3 至用户认可的第一版成熟 Y 坐标；
  - 仅对延伸率进行细微 X 轴收拢（`x: 68.8, w: 19.8`），解决第一版中延伸率左边框轻微跨越列黑线的问题，其余全部维持第一版精准效果。
- 全量 23 个测试套件 111 项单测与 `pnpm typecheck` 100% 持续通过。

## 2026-08-27 · PDF 原件视窗高亮停留 1 秒原位自动平滑放大 200% 与即时缩回复原落地

- 原位整页平滑缩放架构（Canvas Scale）：
  - 以当前高亮 BBox 几何中心点 `(x + w/2, y + h/2)` 为动态 `transform-origin`，使用 GPU 加速 `transform: scale(2)` 对该页平滑放大至 200%；
  - 仅作用于左侧 PDF 视窗内部（`overflow-x-auto`），被放大页挂载 `z-30 shadow-2xl ring-2 ring-primary/60` 与“聚焦放大 200%”徽标，全局页面与其他分栏完全静止。
- 防晕眩 1000ms 延迟与离开即时缩回复原调度：
  - 统一在 `handleFieldHover` 与 `scrollToRightField` 中注入 1000ms 防抖倒计时：快速划过表格行不触发缩放，仅稳定停顿 $\ge 1$ 秒后激活 200% 聚光灯效果；
  - 鼠标离开（`handleFieldHover(null)`）立即撤销放大，通过 `cubic-bezier(0.16, 1, 0.3, 1)` 在 250ms 内极速平滑缩回原尺寸；
  - 独立于右上角全局手动缩放基准值，复原时无缝保持原有缩放设置。
- 全量 23 个测试套件 111 项单测与 `pnpm typecheck` 100% 持续通过。

## 2026-08-27 · CertificateHeaderSchema 双炉号与长尾扩展池演进 & 前端双炉号复合单元格落地

- Schema 双轨制演进：
  - 在 `CertificateHeaderSchema` 中补充法定核心追溯字段 `heat_treatment_lot_number`（热处理炉号/装炉号 Pack No.）与通用扩展池 `additional_identifiers`（兜底合同号、捆号、TS 许可证等未知元数据），启用 `.passthrough()`。
  - 在 `BatchSpecimen` 中补充 `packNo`，并在 `doc_zpje_01` 的 3 个炉批 Mock 数据中注入真实热处理装炉号 `Z26022C`。
- 4×3 基础元数据网格双炉号复合单元格调优：
  - 单元格标题统一为 `冶炼炉号/热处理炉号(Heat/Pack No.)`，去除内部子标题；
  - 内部 `grid-cols-2` 放置两个原生文本框（Heat No. 与 Pack No.），高度与邻近控件保持严格一致（26px）；
  - 实现独立的 BBox 双向联动：Hover Heat 单独高亮源文档原材料炉号（Page 1 左侧），Hover Pack 单独高亮源文档钢管热处理炉号（Page 1 右侧）。
- 全量 23 个测试套件 111 项单测与 `pnpm typecheck` 100% 持续通过。

## 2026-08-27 · Step 2 左右双栏独立滚动条重构与双向悬浮单侧定向滚动

- 视口与滚动条架构解耦：消除 Step 2 外部全局纵向滚动条（`overflow-hidden`），顶部 `BatchContextBar` 固定常驻，左右两栏（左 45% PDF 原件预览、右 55% 提取数据核对）分别挂载全高独立的纵向滚动条。
- 双向悬浮单侧定向滚动调度：
  - 彻底移除 `element.scrollIntoView()`（避免跨容器冒泡导致全局页面剧烈上下位移）；
  - 封装 `scrollToLeftBBox` 与 `scrollToRightField`：悬浮左侧 BBox 时仅定向计算并平滑滚动右侧视窗（`rightScrollContainerRef.current.scrollTo`），左侧视窗与全局页面静止；
  - 悬浮右侧字段/表格行时仅定向计算并平滑滚动左侧 PDF 视窗（`pdfScrollContainerRef.current.scrollTo`），右侧视窗与全局页面静止。
- 全量 23 个测试套件 111 项单测与 `pnpm typecheck` 100% 持续通过。

## 2026-08-27 · 真实质保书.pdf (镇海石化建安 S32168) Mock 接入与源文档双向悬浮高亮联动

- 真实文档资产提取：利用原生 PDFKit 将 3 页《质保书.pdf》（镇海石化建安工程 S32168 换热管）高保真切图为 2x Retina PNG（`public/samples/zpje/page-[1-3].png`）。
- 多炉批与跨页 BBox 契约：新建 `src/types/bbox.ts`，定义涵盖 3 页且支持 3 个炉批行垂直偏移的百分比自适应 BBox 字典（元数据、化学成分、拉伸/硬度、晶粒度、扩口/压扁、尺寸/表面与清单）。
- 真实多文档共存机制：在保留既有宝武、太钢等历史 Mock 的同时，将《质保书.pdf》置于首位作为默认激活文档 (`doc_zpje_01`)，默认激活批次 `Z26022C-DB7`。
- 双向悬浮高亮与平滑滚动：
  - 左侧视窗多页平铺渲染，悬浮右侧任一元数据输入框或实测表格行，触发左侧视窗平滑滚动至对应页并高亮脉冲（Pulse）对应 BBox；
  - 悬浮左侧 BBox 同步高亮右侧对应字段/表格行；
  - 动态点亮“金相组织”、“几何尺寸”、“表面质量”分类页签与各专业视图卡片。
- 新增 `tests/extractor/zpje-bbox.test.ts`，全量 23 个测试套件 111 项单测与 `pnpm typecheck` 100% 通过。

## 2026-08-26 · 批次号左对齐与材料牌号匹配度标识移入标题行优化

- 基础元数据网格微调：将批次号输入框由右对齐优化为左对齐紧随标签；
- 材料牌号空间优化：将“匹配度 99%”徽标从输入框内部移入“材料牌号 (Material Grade)”标题行右侧，输入框独占整行宽度，完美完整呈现长牌号字符串（如 `022Cr17Ni12Mo2 (S31603)`）无遮挡。
- 浏览器实机截图验证与全量测试套件 100% 通过。

## 2026-08-26 · Step 2 基础元数据 4x3 统一网格重构与实测表格精细化调优

- 基础元数据重构为严格的 4 行 3 列统一响应式网格：第 1 行由左至右对齐“标题”、“批次号编辑”、“OCR 置信度徽标”，第 2-4 行容纳 9 项核心元数据，实现全网格垂直对齐。
- 实测数据页签精简化：去除页签内多余图标及右侧多余统计文案，仅保留类别名与动态计数 Badge。
- 表格列宽与换行修复：为“类别”列设置固定宽与 `whitespace-nowrap`，彻底解决“化学成分”等文本折行问题。
- 置信度展示优化：低置信度数据直接在置信度单元格就地使用琥珀色高亮徽标（如 `82% ⚠️`）提示，省去冗余文本，极大释放表格横向空间。
- 浏览器实机验证与 108 项测试 100% 通过。

## 2026-08-26 · 落地批次号双向同步联动、3x3 元数据网格与全景总览+动态分类页签

- 扩展 `src/schemas/certificate.schema.ts` 契约，新增 `construction_number: z.string().optional()`（施工号/工程项目编号）。
- 基础元数据重构：将“批次号”单独拎出置于“OCR 置信度”左侧，支持就地编辑并双向实时同步上方全局选择器与 Session 树；主体 9 个元数据字段重构为 3×3 紧凑响应式网格。
- 提取数据重构：落地“全部实测项总览”平铺视图，并依据 `standard.schema.ts` 9 大标准类别动态渲染页签（无数据类别自动隐藏，带数量 Badge），支持各专业视图深度复核。
- `pnpm typecheck` 与 108 项测试 100% 验证通过。

## 2026-08-26 · Step 2 字段全面汉化与基于 certificate.schema.ts 的完整性补全

- 全面汉化“化学成分提取核对”与“力学与工艺条款核对”所有表头与字段标签，保留专业代号（$R_m$、$R_{p0.2}$、$A$、Hardness 等）。
- 依据 `src/schemas/certificate.schema.ts` 补全核心追溯与前置条件元数据：新增“质保书编号 (Certificate No)”与“交货热处理状态 (Delivery State)”。
- 在力学选项卡中补充展示“工艺试验与无损检测条款 (压扁试验、晶间腐蚀 Method E、无损检测 NDT 声称等级)”与 AST 免检提示，与 Step 3 规则比对完全闭环呼应。
- `pnpm typecheck` 与 108 项测试 100% 验证通过。

## 2026-08-26 · 彻底解耦 OCR 置信度与材料牌号匹配度数据模型

- 在 `BatchSpecimen` 模型中正式拆分出 `ocrConfidence`（Stage 1 图像视觉抽取置信度）与 `gradeMatchConfidence`（Stage 2 牌号国标别名消歧匹配度）。
- 修正 Step 2 界面数据绑定：“当前批次 OCR 置信度”徽章与“牌号匹配度”胶囊分别消费对应独立指标。
- `pnpm typecheck` 与 108 项测试 100% 验证通过。

## 2026-08-26 · 简化 Session ID 展示并迁移 OCR 置信度徽章至元数据卡片

- 简化 Session ID 显示为末尾短 UUID（如 `#8F9C2E1A`），Hover 时展示完整全局唯一 ID，杜绝小屏幕与 1440px 容器内的折行挤压。
- 优化选择器卡片内部宽度与间距，保持单行紧凑排版。
- 将 `OCR 置信度` 徽章移至 Step 2 右侧“基础元数据提取核对”卡片标题右侧并排呈现。
- `pnpm typecheck` 与 108 项测试 100% 验证通过。

## 2026-08-26 · 落地“标题行 + 下方独立选择器卡片”双层空间布局

- 根据用户示意图完成 1:1 像素级还原：上方为主标题行（左侧步骤标题，中间对齐批次正上方呈现 `OCR 置信度` 徽章，右侧可选 HITL 抽屉按钮），下方为白底圆角选择器卡片。
- Step 2 阶段显式展示 `OCR 置信度: 98%` 徽章，Step 3/Step 4 保持纯净聚焦。
- 批次号突出高亮（`border-2 border-primary ring-2 ring-primary/25`），下一批次按钮可用时应用主色提醒。
- `pnpm typecheck` 与 108 项测试 100% 验证通过。

## 2026-08-26 · 融合步骤主标题至批次选择器统一容器并优化批次视觉焦点

- 将各步骤主标题（如 `Step2 解析数据核对`、`Step3 标准规则比对`、`Step4 报告归档与导出`）上移并与两层树选择器合入同一个高质感卡片容器 [`BatchContextBar.tsx`](file:///Users/shiromaple/Github/NormScale/src/components/BatchContextBar.tsx)。
- 大幅强化当前 Focus 批次号的视觉权重（字号微扩、强调边框 `border-2 border-primary` 与 `ring-2 ring-primary/25` 高亮），方便检验员一眼锁定当前批次。
- Step 2 阶段将状态标签从 `PASS` 改为 `SUCCESS`（代表 OCR/文档解析成功），`FAIL` 代表解析失败。
- 批次级 `OCR 置信度` 徽章直接与批次号选择器并排定位展示。
- “下一批次”按钮在可用状态下自动应用系统主强调主题色（`bg-primary text-on-primary`）提醒流转。
- `pnpm typecheck` 与 108 项测试 100% 验证通过。

## 2026-08-26 · 引入作业会话 (Session) 两层树架构与统一批次级联选择条

- 确立 `Session (全局唯一高熵 UUID)` $\to$ `Document (物理文件)` $\to$ `Batch/Specimen (炉批试样)` 两层树状作业模型。
- Session ID 升级为：`SESS-${YYYYMMDD}-${HHMMSS}-${8位高熵随机UUID}`，杜绝多用户毫秒级并发碰撞。
- 在 Step 2（核对数据）、Step 3（比对标准）、Step 4（归档导出）顶部挂载统一两层树状批次级联选择条 [`BatchContextBar.tsx`](file:///Users/shiromaple/Github/NormScale/src/components/BatchContextBar.tsx)。
- Step 1 取消次级幽灵按钮，将新建 Session 入口收窄至底部唯一主动作按钮；历史台账 [`AuditLedger.tsx`](file:///Users/shiromaple/Github/NormScale/src/components/AuditLedger.tsx) 升级为按 Session 聚合并支持一键反显回载至工作台。
- `pnpm typecheck` 与 108 项测试 100% 验证通过。

## 2026-08-26 · Step 1 动作区新增“跳过解析，直接比对”次级幽灵按钮

- 在 Step 1 底部动作栏的主按钮左侧新增次级幽灵按钮（`fast_forward` 图标与边框风格）。
- 点击直接跳转至 Step 3 标准切片规则比对阶段，满足快速校验场景。
- `pnpm typecheck` 与 108 项测试 100% 通过。

## 2026-08-26 · 支持待处理文档卡片 Hover 移出/取消与历史缓存联动

- 待处理文档卡片右上角增加 Hover 出现的 `×` 快捷操作按钮（`close`）。
- 未上传完成的文档支持一键“取消上传”；已上传完成（就绪）的文档支持“移出待处理队列”，并无缝保留/补充至下方“历史已缓存文档”列表中供一键复用。
- 点击历史已缓存文档支持快速恢复至待处理队列并自动流转。
- `pnpm typecheck` 与 108 项测试 100% 验证通过。

## 2026-08-26 · 优化上传文档页面布局与底部导航栏 1440px 定宽居中

- 底部导航栏设置为定宽 1440px 居中（`w-[1440px] max-w-full mx-auto`）。
- 移除 Step 1 页面冗余的“查看近期批次”按钮与“搜索缓存凭证”控件。
- 重构待处理质保书队列为 DocEx 物理文档卡片风格（显示 PDF 图标、文档名称与“就绪”传输状态，支持一个文档承载单/多批次）。
- 移除 Step 1 内部重复的“开始执行智能核验流转”按钮，统一由底部 Stepper 动作流转。
- `pnpm typecheck` 与 108 项测试 100% 通过。

## 2026-08-25 · 修复暗色模式下力学条款与定性条款容器背景对比度缺陷

- 修复 `WaterfallWorkbench.tsx` 中 Step 2 力学性能子 Tab 与 Step 3 模块 C 定性条款容器缺少 `dark:bg-surface-dark-low` 和暗色文字类导致文字背景泛白混淆的问题。
- 修复 `StandardExplorer.tsx` 中工艺条款与 AST 动态公式容器的暗色模式样式映射。
- `pnpm typecheck` 与 108 项单元/集成测试持续 100% 验证通过。

## 2026-08-25 · 沉淀完整的中文工业设计系统规范文档 (docs/DESIGN.md)

- 整理并输出了 NormScale 完整设计哲学、MD3 表面层级配色体系（冷蓝底与高反差白卡片）、状态语义色、双字体规范（Inter + JetBrains Mono）、Material Symbols 图标映射表。
- 规范了受控垂直步进滑动容器与常驻 Stepper Bar 交互模型，以及 Step 1~4 和 HITL 抽屉的设计资产。
- 详细规范参见：[docs/DESIGN.md](file:///Users/shiromaple/Github/NormScale/docs/DESIGN.md)。

## 2026-08-25 · 完成 NormScale 前端 1:1 像素精细化重构与受控步进平滑滑动交互

- 全面引入 Google Material Symbols Outlined 图标字体与 JetBrains Mono / Inter 字体体系。
- 注入 MD3 表面层级配色系统（`#f7f9ff`, `#ffffff`, `#006194`, `#ebeef4`），彻底解决色差与灰度扁平问题。
- 实现 Step 1~4 受控垂直平滑滑动机制（`transition-transform 500ms`），锁定非自由全局滚轮脱焦，通过底部固定 Stepper Bar 与操作按钮精准流转。
- 1:1 还原设计稿 1、2、3、4、5 与 HITL 抽屉全部细节（A4 纸张、PASS/REJECT 水印、OCR BBox、2x2 导出卡片、AST 公式框）。
- `pnpm typecheck`、108 项测试与 `pnpm build` 100% 验证通过。
- 详细验收参见：[docs/015_walkthrough_frontend_refactor.md](file:///Users/shiromaple/Github/NormScale/docs/015_walkthrough_frontend_refactor.md)。

## 2026-08-24 · 完成 Phase 7 全套前端页面、纵向瀑布流工作台与四大主视图落地

- 落地纵向瀑布流质检工作台（`WaterfallWorkbench`），实现吸顶步骤锚点导航（`01 批量上传` $\to$ `02 原件 BBox 解析对齐` $\to$ `03 标准绑定` $\to$ `04 国家标准合规比对与裁决`）。
- 严守领域模型单一真理原则：BBox 坐标核验隔离在 Stage 2，Stage 4 纯粹比对 `CertificateExtract` 标准真值与国家标准切片。
- 构建合格放行单（`PassReleaseModal`）与不合格拒收处置通知书（`RejectionNoticeModal`）两大公文级模态框。
- 构建国家标准知识库浏览器（`StandardExplorer`，31个切片检索）与系统管理控制台（`AdminConsole`，模型配置/日志流/权限）。
- 全站实现纯正中文语境、低饱和度工业极简美学与明暗双模一键切换。`pnpm typecheck` 0 错误，全量 108 项测试 100% 通过，`pnpm build` 生产打包成功。
- 详细实施与验证总结参见：[docs/013_implementation_plan_phase_7.md](file:///Users/shiromaple/Github/NormScale/docs/013_implementation_plan_phase_7.md) 与 [docs/014_walkthrough_phase_7.md](file:///Users/shiromaple/Github/NormScale/docs/014_walkthrough_phase_7.md)。

## 2026-08-23 · 完成基于 Stitch (Gemini 3.1 Pro) 的 UI/UX 高保真设计与规范沉淀

- 使用 `mcp:stitch` 与 `GEMINI_3_1_PRO` 模型完成 NormScale 工业级设计系统与两大核心屏幕设计。
- 交付屏幕 1（质检工作台）与屏幕 2（人机协同复核抽屉），固化无 Emoji、纯 Lucide 矢量、Inter+JetBrains Mono 等宽字体与 0px 直角几何规范。
- 详细设计方案与高清预览图已沉淀至 [docs/012_stitch_ui_ux_design.md](file:///Users/shiromaple/Github/NormScale/docs/012_stitch_ui_ux_design.md)。

## 2026-08-23 · 战略推进顺序优化：聚焦纵向切穿 (Vertical Slice)，Phase 7 前置为全流程交互深化

- 明确系统演进方略：横向多品类标准扩充与存储升级后置为 Phase 9，优先攻坚纵向全流程业务闭环。
- Phase 7 确立为：**NormScale 前端交互与工作流纵向深化**（PDF 双屏对照、标准切片知识库浏览器、历史核验台账、深度 HITL 覆写与签章）。
- Phase 8 确立为：**DocEx 质保书专用抽取 REST API 服务构建与真机联调**。
- 详细路线图已同步更新至 [cairn/ROADMAP.md](file:///Users/shiromaple/Github/NormScale/cairn/ROADMAP.md)。

## 2026-08-23 · 完成 Phase 6 Next.js 15 API 服务层与物资验收决策看板构建
 
- 构建 Next.js 15 App Router API 路由体系（`/api/standards`, `/api/samples`, `/api/audit/submit`, `/api/audit/status`, `/api/audit/resume`）。
- 落地现代极简工业风物资验收看板（左侧质保书结构化解析视图，右侧红/黄/绿合规判定矩阵与审计时间轴）。
- 实现基于 `framer-motion` 的 HITL 人机协同干预抽屉（支持牌号修正建议、实测微调、特批放行与恢复流转）。
- 确立无 Emoji、纯 Lucide 矢量图标、字号基准（严禁滥用 `text-xs`）与点击微回弹前端规范。
- API 路由集成测试全部通过，Next.js 生产打包成功，全量 22 个套件 108 项测试 100% 通过。
- 详细实施与验证总结参见：[docs/009_implementation_plan_phase_6.md](file:///Users/shiromaple/Github/NormScale/docs/009_implementation_plan_phase_6.md)。

## 2026-08-22 · 完成 Phase 5 LangGraph 状态图与人机协同 (HITL) 编排层构建
 
- 建立 `QualityAuditStateAnnotation` 状态通道，设计 `traces` 累积通道消除 Checkpoint 序列化方法丢失问题。
- 构建 7 大节点（`Extract`, `Normalize`, `RetrieveStandard`, `DeterministicEval`, `SemanticReview`, `HumanReview`, `DecisionAggregator`）。
- 实现基于 `interrupt()` 与 `MemorySaver` 的未知牌号与低置信度自动挂起，支持质检员修正后精准恢复。
- 封装高层 `WorkflowEngine` 调度门面；21 个测试套件 104 项单测 100% 通过（全绿）。
- 详细实施与验证总结参见：[docs/007_implementation_plan_phase_5.md](file:///Users/shiromaple/Github/NormScale/docs/007_implementation_plan_phase_5.md)。
- 
 ## 2026-08-22 · 完成 Phase 4 领域日志系统、审计轨迹与性能度量构建
 
- 建立 `ILogger` 门面与 `DefaultDomainLogger`，支持 ANSI 多色高亮、自然语言排版与多模块 Tag 隔离。
- 实现 `PerformanceProfiler` 微秒级性能分析器，支持同步与异步函数的高精度无侵入耗时度量。
- 实现 `MemoryTraceCollector` 内存轨迹收集器，将决策过程与性能指标自动注入 `AuditReport` 报告中。
- 完成 `Extractor`, `Normalizer`, `Repository`, `Engine` 四大执行层全链路埋点；19 个套件 98 项单测全绿。
- 详细实施与验证总结参见：[docs/005_implementation_plan_phase_4.md](file:///Users/shiromaple/Github/NormScale/docs/005_implementation_plan_phase_4.md)。
- 
 ## 2026-08-22 · 完成 Phase 3 质保书提取抽象与确定性归一化流水线构建
 
- 建立 `ICertificateExtractor` 提取抽象接口，支持 Mock、DocEx HTTP Client 与 Direct LLM 适配器。
- 实现 `UnitNormalizer` 物理量单位换算器（基于 BigNumber 消除浮点误差，支持 $kgf/mm^2, psi, ksi \to MPa$）。
- 实现 `GradeNormalizer` 牌号消歧器，联动 31 个规格切片倒排索引实现秒级牌号别名解析与消歧。
- 实现 `PropertyKeyNormalizer` 属性映射器、`QualitativeNormalizer` 定性清洗器与 `DimensionNormalizer` 尺寸解构器。
- 构建 `CertificateNormalizer` 总控流水线，验证归一化后无缝输入核心引擎；16 个测试套件 92 项单测全部通过。
- 详细实施与验证总结参见：[docs/003_implementation_plan_phase_3.md](file:///Users/shiromaple/Github/NormScale/docs/003_implementation_plan_phase_3.md)。
- 
 ## 2026-08-22 · 完成 Phase 2 规格切片架构、全量31个钢级入库与规则检索仓库构建

- 升级元模型至 Specification Slice 架构，抽象支持牌号、紧固件性能等级、法兰压力等级及胶料代号。
- 实现 `IRuleStore` 仓库模式与 `FileRuleStore`（基于内存倒排索引，别名与统一代号 $O(1)$ 极速解析）。
- 对照《GB 13296-2023.pdf》全量录入 31 个钢级切片规则、表1/表2尺寸公差表及全文条款集。
- 实现尺寸公差评估器与 `pnpm standard:validate` 离线校验工具，全部 65 项单测 100% 通过。
- 详细实施与验证总结参见：[cairn/architecture.md](file:///Users/shiromaple/Github/NormScale/cairn/architecture.md)。

## 2026-08-22 · 完成 Phase 1 元模型与确定性规则核验引擎构建

- 完成 Zod 强类型 Universal Meta-Schema 契约建模（标准/质保书/判定矩阵）。
- 实现 GB/T 8170 工业修约算法、安全 AST 动态公式求值器、逻辑组与漏检扫描器。
- 构建《GB/T 13296-2023》黄金基准规则与 5 组业务场景测试，Vitest 51 项单测全部通过。
- 详细执行与验证记录参见：[docs/001_implementation_plan_phase_1.md](file:///Users/shiromaple/Github/NormScale/docs/001_implementation_plan_phase_1.md)。

## 2026-08-21 · 确立全局路线图与系统架构基准

- 研读 `docs/000_架构设计讨论.md`，梳理业务背景与双轨核验技术决策。
- 确立 6 阶段渐进式落地路线图：[ROADMAP.md](file:///Users/shiromaple/Github/NormScale/cairn/ROADMAP.md)。
- 沉淀核心架构与元模型知识至知识专题：[architecture.md](file:///Users/shiromaple/Github/NormScale/cairn/architecture.md)。
- 建立实施计划并在准备就绪后启动 Phase 1 核心引擎构建。

## 2026-08-21 · 初始化 Project Cairn

- 初始化 Project Cairn 项目知识体系结构。
- 历史知识迁移模式：`start_fresh`。
- 详细配置请参见 `AGENTS.md` 和 `.cairn/config.yaml`。
