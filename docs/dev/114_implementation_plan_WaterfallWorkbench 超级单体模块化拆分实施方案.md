# WaterfallWorkbench 超级单体模块化拆分实施方案

## 1. 背景与目标

`src/components/WaterfallWorkbench.tsx` 目前是一个超过 6,500 行、387 KB 的超级单体组件，混杂了：
1. 页面级垂直平滑视窗滑动控制器与全局 Footer/Header 状态联动；
2. 会话生命周期、文档解析队列、缓存恢复与真实上传逻辑；
3. PDF.js 高清切图视窗渲染、自适应缩放/旋转、OCR 边界框高亮联动；
4. SSE 异步流式多标准合规判定调度、Tier 1 & Tier 2 状态机、全景比对矩阵与 HITL 人机协同抽屉；
5. 结果台账保存、截图生成与任务重置。

**重构目标**：
- 在 **零破坏性变更（100% 向下兼容）、零功能回归、零视觉/动画偏差** 的前提下，将 `WaterfallWorkbench.tsx` 收敛至 **≤ 250 行** 的轻量总装容器；
- 将庞大内部逻辑按领域沉淀为结构清晰的独立子模块，单函数行数控制在 30 行以内，复杂度严格受控；
- 建立专属单测，确保项目已有 72 个套件（483 项单测）持续 100% 绿灯，重构收官通过 KIMI-CU 实机端到端复测验收。

---

## 2. 正常操作交互逻辑与基准（Golden Flow Baseline）

在前期实机执行中，以历史已解析缓存文档 **「测试质保书1.pdf」** 为例，完整 3 步骤交互逻辑与生命周期基准如下：

### 阶段 1：步骤 1 文档载入与队列识别
- **操作触发**：在步骤 1「历史已解析缓存」列表中点击卡片 `测试质保书1.pdf`；
- **数据流转**：
  - 调用 `/api/documents/cached?md5=test-cert-1-mock-md5`，拉取文档元数据、炉批信息与高清切图；
  - 自动插入 `queuedDocs` 待处理队列（计数变为 1），卡片状态高亮显示为 `已命中解析缓存`；
  - 选中状态就绪，激活右下角主操作按钮 `解析文档，核对数据 ->`；
- **验收要点**：拆分后点击缓存卡片必须瞬时载入队列，不可丢失预处理切图或炉批元数据。

### 阶段 2：转场 1 -> 2 垂直平滑滑动
- **操作触发**：点击右下角 `解析文档，核对数据 ->`；
- **视觉动画**：外层容器触发 `translateY(-100%)` 平滑下滚，耗时 500ms（贝塞尔曲线 `cubic-bezier(0.25, 1, 0.5, 1)`）；
- **视窗挂载**：步骤 2 顶部常驻 `BatchContextBar` 展示当前批次 `#F00AD0BE / 测试质保书1.pdf (3 炉批) / Z26022C-DB7 SUCCESS`；
- **验收要点**：平滑滚动不得脱焦或出现白屏卡顿，顶部批次栏必须完整呈现。

### 阶段 3：步骤 2 数据核对与 PDF.js 双向联动
- **双栏交互**：
  - 左侧视窗：PDF.js 渲染高清页面，缩放控件、旋转控制与 OCR BBox 边界框高亮准确贴合；
  - 右侧核对表：基础元数据、化学成分、力学性能、工艺试验共 25 项实测指标渲染就绪，支持就地编辑；
- **就绪判定**：实测数据完整后，右下角主按钮文案呈现 `核对完成，比对标准 ->`；
- **验收要点**：PDF 画布与坐标反查逻辑解耦至 `usePdfViewerLens` 后，高亮红框与点击定位必须 100% 对齐。

### 阶段 4：转场 2 -> 3 与流式标准比对
- **操作触发**：点击 `核对完成，比对标准 ->`，容器平滑滑动至 `translateY(-200%)`；
- **流式异步调度**：
  - 步骤 3 自动侦听进入，唯一调度 `evaluateBatches`，通过 `apiClient.submitAuditStream` 建立 SSE 异步管道；
  - 目标标准自动匹配 `NB/T 47019.5-2021` 与 `GB/T 13296-2023`；
  - 状态流转依次经历：`tier1_evaluating` -> `tier1_ready` -> `tier2_resolving` -> `completed`；
- **结果呈现**：
  - 判定大卡显示为 `PASS 全项合规 (流转: 系统算法放行)`；
  - 27 项判定全景大表（包含化学元素区间、抗拉/屈服强度要求等）展示限值与合格标识；
- **验收要点**：调度防重锁（去重锁）必须有效，杜绝重复触发导致的 SSE 连接跳号或状态覆写。

### 阶段 5：会话归档与重置回到步骤 1
- **操作触发**：在步骤 3 底部导航栏点击 `开启新任务`（位于 x≈955, y≈865）；
- **生命周期动作**：
  - 触发当前会话静默保存归档；
  - 原子重置内部状态机：清空 `queuedDocs` 队列、重置 `session`、清空选中文档与批次号；
  - 主滑动容器平滑回滚至 `translateY(0)`（步骤 1 初始状态）；
- **验收要点**：重置后待处理队列必须为 0，缓存列表可重新无缝点击装载。

---

## 3. 架构设计与目录划分

在 `src/components/` 下新建 `workbench/` 模块子目录，形成高内聚、低耦合的分层架构：

```
src/components/
├── WaterfallWorkbench.tsx               # [重构后] 轻量级总装容器（≤250行），负责三大 Hook 组合与步骤滑动挂载
└── workbench/
    ├── types.ts                         # 统一领域类型、异常类定义与向后兼容 Barrel 导出
    ├── hooks/
    │   ├── useWorkbenchSession.ts       # 领域 Hook 1: 会话管理、文档队列、缓存载入与预处理调度
    │   ├── usePdfViewerLens.ts          # 领域 Hook 2: PDF 视窗缩放/旋转/自适应与 OCR BBox 坐标联动
    │   └── useBatchStreamAuditor.ts     # 领域 Hook 3: SSE 流式比对驱动、多标准管理、Tier1/2状态机与 HITL 调度
    ├── steps/
    │   ├── Step1DocumentQueuePanel.tsx  # 步骤 1 完整视图面板（文件拖拽、待检队列、历史缓存）
    │   ├── Step2DataVerificationPanel.tsx # 步骤 2 完整视图面板（PDF.js 画布 + 结构化数据核对表）
    │   └── Step3ComplianceEvaluationPanel.tsx # 步骤 3 完整视图面板（多标准选择、判定大卡、全景比对表）
    └── components/
        ├── WorkbenchFooterBar.tsx       # 底部常驻 3 步骤连线导航、操作按钮与截图菜单
        ├── CachedDocsGrid.tsx           # 步骤 1 历史缓存文档卡片列表
        ├── ScenarioSelectorCard.tsx     # 步骤 1 典型测试用例场景卡片
        └── ComplianceMatrixTable.tsx    # 步骤 3 全景比对明细指标表格
```

---

## 4. 四阶段渐进式重构路线

### 阶段 1：基础契约层与叶子组件抽取（Minimal Blast Radius）
1. **新建 [workbench/types.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/types.ts)**：
   - 迁移 `StandardCatalogItem`、`StandardCatalogGrade`、`StandardCatalogEmptyError`、`ScenarioSampleMissingError`、`formatHitlReasonBadge` 等定义；
   - 提取各组件 Props 接口；
2. **提取 [workbench/components/WorkbenchFooterBar.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/components/WorkbenchFooterBar.tsx)**：
   - 抽离定宽 1440px 常驻底部 Footer（包含 3 步骤指示器、返回上一步、截图分体按钮、开启新任务、保存结果等）；
3. **提取通用子卡片**：
   - 抽离 [CachedDocsGrid.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/components/CachedDocsGrid.tsx)、[ScenarioSelectorCard.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/components/ScenarioSelectorCard.tsx)；
4. **验证门禁 1**：在 `WaterfallWorkbench.tsx` 中透明 re-export，引入新提取的叶子组件；运行 `pnpm tsc --noEmit` 与 `pnpm test`，确保 100% 绿灯。

---

### 阶段 2：步骤 1 视图面板化与 `useWorkbenchSession`
1. **新建 [workbench/hooks/useWorkbenchSession.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/hooks/useWorkbenchSession.ts)**：
   - 封装 `session`, `queuedDocs`, `selectedDocId`, `selectedBatchNo`, `handleRestoreFromCache`, `handleRealFiles`, `handleStartNewTask`；
   - 编写配套单元测试 `tests/hooks/useWorkbenchSession.test.ts`；
2. **新建 [workbench/steps/Step1DocumentQueuePanel.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/steps/Step1DocumentQueuePanel.tsx)**：
   - 将步骤 1 的所有 JSX 与布局内聚至此面板；
3. **验证门禁 2**：`WaterfallWorkbench.tsx` 挂载 `Step1DocumentQueuePanel`，运行全量类型检查与单测通过。

---

### 阶段 3：步骤 2 视图面板化与 `usePdfViewerLens`
1. **新建 [workbench/hooks/usePdfViewerLens.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/hooks/usePdfViewerLens.ts)**：
   - 封装 `zoomLevel`, `rotation`, `pageOrientationOverride`, `docBboxesMap`, PDF 视窗缩放与 OCR 坐标联动计算；
   - 编写配套单元测试 `tests/hooks/usePdfViewerLens.test.ts`；
2. **新建 [workbench/steps/Step2DataVerificationPanel.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/steps/Step2DataVerificationPanel.tsx)**：
   - 内聚 PDF.js 预览双栏与 25 项理化数据核对表，复用已有的 `EditableValueField`；
3. **验证门禁 3**：`WaterfallWorkbench.tsx` 挂载 `Step2DataVerificationPanel`，运行全量类型检查与单测通过。

---

### 阶段 4：步骤 3 视图面板化、主容器最终收敛与端到端实机复测
1. **新建 [workbench/hooks/useBatchStreamAuditor.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/hooks/useBatchStreamAuditor.ts)**：
   - 封装 `batchPresentationMap`, `evaluateBatches`, `submitAuditStream` SSE 通信、Tier 1 & Tier 2 流式状态收敛、HITL 侧抽屉上下文与台账保存；
   - 编写配套单元测试 `tests/hooks/useBatchStreamAuditor.test.ts`；
2. **新建 [workbench/steps/Step3ComplianceEvaluationPanel.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/steps/Step3ComplianceEvaluationPanel.tsx)**：
   - 抽离多标准选择栏、判定结果大卡、全景比对矩阵与 HITL 抽屉；
3. **收敛 [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)**：
   - 主组件仅保留 `currentStep` 滑动状态、三大领域 Hook 的装配组合与 3 个 Step 面板挂载，代码行数收敛至 ≤ 250 行；
4. **验证门禁 4（最终收官验收）**：
   - `pnpm tsc --noEmit` 0 错误；
   - `pnpm test` 72+ 套件全量通过；
   - 使用 KIMI-CU 在真实 Edge 浏览器中执行「测试质保书1」完整 3 步骤金标准操作，比对验收基准。

---

## 5. 风险与防御策略

| 风险点 | 潜在影响 | 防御机制 |
|---|---|---|
| 视窗滑动动画卡顿或断裂 | 步骤切换视觉跳动，非平滑过渡 | 保持外层受控 `translateY(-${currentStep * 100}%)` 结构与贝塞尔曲线不变，各步骤面板只作为普通 section 挂载 |
| OCR 坐标框在拆分后偏离 | PDF 预览高亮标注对不准实际文字位置 | `usePdfViewerLens` 保留像素自适应比例与原始缩放计算纯函数，单测覆盖边界情况 |
| SSE 流式连接重复触发 | 批次核验 runId 跳号或状态互相覆盖 | 严格复用 `pendingBatches` 与 `auditDedupKeyRef` 防重锁机制，仅在进入步骤 3 时由 Hook 内唯一派发 |
| 外部模块 import 报 TS 错误 | 打破其他调用处的编译兼容性 | 在 `WaterfallWorkbench.tsx` 中使用 `export * from './workbench/types'` 全量 Barrel 重导出 |
