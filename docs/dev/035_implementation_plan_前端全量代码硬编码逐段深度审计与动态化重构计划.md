# 前端全量代码硬编码逐段深度审计与动态化重构计划

## 背景与目标

在前期快速原型与交互验证阶段，前端组件中散落了部分静态假数据、写死的方法标准代号、二值化枚举强制转换以及固化的提示文案。这些硬编码会导致：
1. **真实文档数据被伪造或截断**：例如用户提取到实际试验描述，被 UI 强制显示为写死的模板文本；
2. **多标准/非标文件不适配**：例如写死国标号（如 `GB/T 246-2017`），当处理国外标准（ASTM/ASME/ISO）或订货附加技术条件时出现虚假依据；
3. **可编辑交互状态回弹**：在数据核对阶段，用户手动修改实测内容后，被组件内部硬编码三元表达式或强类型归一化覆盖破坏；
4. **弹窗与报告模态框残留 Mock**：合格放行单、拒收处置通知书等组件内写死假厂家、假批号和假条款。

本计划旨在**逐段理解与深度分析**前端全部核心组件与数据流，彻底根除所有形式的硬编码隐患，达成 100% 真实数据驱动（Data-Driven）与零伪造（Zero-Mock）基准。

---

## 审计方法论与工作准则

> [!IMPORTANT]
> **严禁纯脚本正则匹配替换**：不同组件中硬编码的表现形式多样（如 JSX 静态文本、三元表达式 fallback、数据映射默认值、`value || 'xxx'` 等），必须进行**逐文件、逐函数、逐段语义分析**与数据流追踪。

1. **数据流溯源原则**：所有展示在界面上的字段，必须有明确的数据源（大模型抽取结果 `BatchSpecimen`、标准库切片 `StandardSpecificationSlice`、或质检员手动编辑状态）。
2. **未提取字段自然留空**：若源文档未包含某字段或模型未检出，一律显示为空字符串 `''` 或统一占位符 `--`，严禁擅自补充“合格”、“按标准要求”等假数据。
3. **编辑状态无损持久化**：用户在任何可编辑输入框中键入的任意字符，必须 100% 原样保留至当前 Session 状态树，禁止在中间层做破坏性归一化。
4. **标准依据动态级联**：检验方法依据必须优先读取质保书提取的方法标准，次选读取当前绑定的标准切片方法，无方法时客观展示 `-`。

---

## 用户确认项与核心决策规范

> [!IMPORTANT]
> **1. 默认会话（`DEFAULT_INSPECTION_SESSION`）隔离准则**：
> - `DEFAULT_INSPECTION_SESSION` **仅作为演示用途的历史检验台账（Audit Ledger）记录留存**，绝不允许出现在工作台（`WaterfallWorkbench`）的正常检验流程中；
> - 工作台初始状态必须为纯净的空会话（`documents: []`）；
> - 当待处理队列为空且无活动文档时，底部导航栏禁止跳步至步骤 2/步骤 3（弹出操作提示）；步骤 2 与步骤 3 视窗若无文档则渲染纯净工业空状态卡片，绝不回退至 `DEFAULT_INSPECTION_SESSION`；
> - 步骤 3 点击【开启新任务】时，自动生成纯净空会话并平滑返回步骤 1。
>
> **2. 测试文件规范**：
> - 真实测试文件已统一迁移至：[`docs/test/测试质保书1.pdf`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/docs/test/测试质保书1.pdf)。

---

## 逐模块排查与重构计划

---

### 模块一：核心工作台四大步骤深度审计 (`WaterfallWorkbench.tsx`)

#### 1. Step 1: 批量上传与待处理队列
- [ ] **排查点 1**：文件上传后的初始批次构建（`handleRealFiles`）是否存在预设字段写死；
- [ ] **排查点 2**：从缓存加载已解析文件（`loadCachedDocumentToSession`）时，数据字段转换是否保持纯净无补丁；
- [ ] **排查点 3**：清空队列与新建 Session 时的初始状态重置完整性。

#### 2. Step 2: 结构化解析数据核对
- [ ] **排查点 4 (4×3 基础元数据网格)**：
  - 检查 `grade`、`standard`、`dimensions`、`deliveryState`、`heatNo`、`packNo`、`certificateNo`、`constructionNo`、`supplier` 等输入框的 `value` 与 `onChange` 是否存在硬编码 fallback；
- [ ] **排查点 5 (全景核对大表 `allExtractItems`)**：
  - 力学性能（抗拉、屈服、延伸率、硬度）：检查 `method`、`confidence` 及可编辑更新逻辑；
  - 金相组织（晶粒度）：动态判断 `grainSize` 真实值，清除写死 `'7.0 级'`；
  - 无损检测（涡流/超声/水压）：动态呈现 `ndt` 提取原文，消除假置信度与假状态判断；
  - 几何尺寸与表面质量：动态从 `dimensions` 与 `surfaceQuality` 映射，消除写死行；
- [ ] **排查点 6 (独立专业视图 Subtabs)**：
  - 逐一审查 Tab 1~Tab 8 的 JSX 模板，将内部写死的静态 `依据方法：GB/T xxx` 改造为动态读取或自适应说明。

#### 3. Step 3: 全景比对矩阵与判定决策流
- [ ] **排查点 7 (`complianceMatrixItems` 构造逻辑)**：
  - 逐项检查化学元素（`chemical.map`）、力学项目、工艺项目、金相、腐蚀、探伤、尺寸表面的标准要求（`standardRequirement`）与偏差计算（`deviation`）是否完全由标准库切片驱动；
  - 消除状态判定（`status` / `statusLabel`）中对固定字符串（如 `'PASS'`）的单点假设；
- [ ] **排查点 8 (执行标准与牌号切换器)**：
  - 检查 `activeStandard` 与 `activeGrade` 切换时的级联逻辑，确保切片重算基于规则库动态匹配，无硬编码牌号规则。

#### 4. Step 4: 报告归档与导出视图
- [ ] **排查点 9**：检查归档凭证卡片、导出预览中的摘要文案、检验员签名、报告编号生成机制，确保全部动态注入。

---

### 模块二：独立弹窗与报告模态框组件审计

#### 1. [PassReleaseModal.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/PassReleaseModal.tsx)
- [ ] **存在隐患**：L25-L33 与 L225-L230 中包含硬编码的供应商名称（`浙江某特种不锈钢...`）、炉批号（`H304-8891`）、尺寸（`38.0mm × 3.0mm`）以及压扁/晶间腐蚀固定表格项；
- [ ] **改造方案**：完全基于传入的 `report: AuditReport` 或当前 `BatchSpecimen` 动态提取，无数据项展示为 `--` 或隐藏，表格项 100% 遍历 `report.item_results`。

#### 2. [RejectionNoticeModal.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/RejectionNoticeModal.tsx)
- [ ] **存在隐患**：L25 写死的处置说明文本、L31-L36 写死的供应商与炉批号、L62-L64 写死的质检员姓名工号（`张建华 (QA-8821)`）；
- [ ] **改造方案**：处置说明根据实际触发的 `missing_mandatory_items` 或 `failed_rules` 动态生成默认草稿，表头追溯信息纯读 `report`，签发人动态绑定当前登录/系统质检员配置。

#### 3. [CertificateViewer.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/CertificateViewer.tsx)
- [ ] **存在隐患**：L67、L99、L108、L118 等多处在缺少数据时展示写死的供货单位、炉号与热处理参数；
- [ ] **改造方案**：全面改造为 `report.xxx || '--'` 纯净动态展示。

#### 4. [ExportReportModal.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/ExportReportModal.tsx)
- [ ] **排查点**：检查 JSON 导出与打印视图的数据绑定纯净度。

---

### 模块三：上下文控制与协同组件审计

#### 1. [BatchContextBar.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/BatchContextBar.tsx)
- [ ] **排查点**：检查顶部多批次切换卡片、进度统计徽标（PASS / FAIL / HITL / 解析中）计算逻辑，消除任何静态假批次数据。

#### 2. [HitlDrawer.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/HitlDrawer.tsx)
- [ ] **排查点**：检查 4 大 HITL 典型场景表单，确保条款依据、事实对比与任务号 100% 动态读取 `hitlContext`。

#### 3. [AdminConsole.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/AdminConsole.tsx) 与 [AuditLedger.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/AuditLedger.tsx)
- [ ] **排查点**：确认台账列表与系统配置完全读取真实本地持久化数据。

---

### 模块四：数据模型与 BBox 契约层 (`src/types/`)

#### 1. [src/types/bbox.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/types/bbox.ts)
- [ ] **排查点**：规范 BBox `label` 字段为通用指示文本（例如将 `'压扁试验标准: GB/T 246-2017'` 规范为 `'压扁试验依据标准'`，将 `'晶间腐蚀结果 (5.0%形变): 合格 OK'` 规范为 `'晶间腐蚀试验结果'`），消除标注层写死的特定标准号与结论。

---

## 实施阶段规划 (Phased Execution)

| 阶段 | 重点目标 | 涉及核心文件 | 预期交付与验证 |
|---|---|---|---|
| **Phase A** | 核心工作台 Step 2 数据提取大表与各专业子 Tab 深度去硬编码 | `WaterfallWorkbench.tsx` | 确保真实 MTC 所有 23 项指标 100% 纯动态渲染与无损编辑 |
| **Phase B** | 核心工作台 Step 3 全景比对矩阵与判定流深度去硬编码 | `WaterfallWorkbench.tsx` | 确保比对矩阵指标、偏差与条款依据 100% 由标准库切片驱动 |
| **Phase C** | 放行通知单、拒收通知书与导出模态框全面动态化 | `PassReleaseModal.tsx`, `RejectionNoticeModal.tsx`, `CertificateViewer.tsx` | 彻底移除所有假供应商、假工号与写死条款，100% 绑定 `report` |
| **Phase D** | 上下文工具栏、BBox 标注元数据与全局兜底数据纯净化 | `BatchContextBar.tsx`, `bbox.ts`, `session.ts` | 统一全局占位符规范，通过全量 TypeScript 检查与 121 项测试 |

---

## 验证计划

### 1. 自动化测试闭环
- **类型系统安全**：`pnpm typecheck`（必须 0 错误）；
- **全量单元与集成测试**：`pnpm test`（覆盖全部 27 个测试套件，121 项测试全绿）。

### 2. 真实数据流端到端验证
- **场景 1 (真实标准 PDF 上传)**：上传真实《质保书.pdf》，验证步骤 2 中化学、力学、工艺、金相、腐蚀各字段实测值与依据标准是否准确反映提取原文；
- **场景 2 (在线即时编辑与无回弹)**：在步骤 2 输入框中任意修改字段文本，验证在切换批次/切换步骤时修改内容完整保留且不发生文本回弹；
- **场景 3 (模态框报告生成)**：在步骤 3 分别触发“合格放行单”与“拒收处置通知书”，核验模态框内供应商、炉批号、不合格原因等数据是否与当前 Session 100% 动态对齐。
