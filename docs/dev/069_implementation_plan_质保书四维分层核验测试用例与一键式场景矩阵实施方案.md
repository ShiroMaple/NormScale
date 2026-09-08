# 质保书四维分层核验测试用例与一键式场景矩阵实施方案 (方案 A + B 结合)

本方案旨在为 **Tier 1 - HITL**、**Tier 1 ➡️ Tier 2 - 通过**、**Tier 1 ➡️ Tier 2 - 否定 (超标)**、**Tier 1 ➡️ Tier 2 - HITL** 这 4 种核心分支构建确定性的真实原件（PDF/PNG）与开箱即用的前端交互载体，使产品演示、功能验收与自动化测试均能达到秒级极速呈现与 100% 确定性。

---

## User Review Required

> [!IMPORTANT]
> **四种测试用例的原件与数据规划**
> 1. **用例 1（Tier 1 - HITL）**：
>    - **原件名称**：`[用例1] Tier1-HITL-未收录非标牌号.pdf` (`case1_tier1_hitl_unknown_grade.pdf`)
>    - **触发机理**：声明牌号为未收录的特种牌号 `SUS 304H-SpecialX`，标准号 `GB/T 13296-2023`，常规化学力学项齐全。
>    - **预期效果**：归一化阶段牌号低置信，触发 LangGraph `interrupt()` 全局阻断，工作台右侧弹出 480px 人机协同修正抽屉。
> 2. **用例 2（Tier 1 ➡️ Tier 2 - 通过）**：
>    - **原件名称**：`[用例2] Tier1-Tier2-通过-长尾光洁度达标.pdf` (`case2_tier1_to_tier2_pass.pdf`)
>    - **触发机理**：标准 `NB/T 47019.5-2021`，牌号 `06Cr18Ni11Ti`，常规项齐全，长尾字段为 `表面光洁度: 0.33 μm`。
>    - **预期效果**：Tier 1 首发大盘合格；微光呼吸行展示“条款对齐中”；Tier 2 语义对齐至标准粗糙度 `surface_roughness` (Ra $\le 0.8\mu m$)，增量核验通过，旗帜平滑演进为全项绿灯。
> 3. **用例 3（Tier 1 ➡️ Tier 2 - 否定/超标）**：
>    - **原件名称**：`[用例3] Tier1-Tier2-超标-长尾光洁度超差.pdf` (`case3_tier1_to_tier2_fail.pdf`)
>    - **触发机理**：标准 `NB/T 47019.5-2021`，牌号 `06Cr18Ni11Ti`，常规项齐全，长尾字段为 `表面光洁度: 1.5 μm`。
>    - **预期效果**：Tier 1 首发大盘；Tier 2 对齐粗糙度；增量核验判定 1.5 超过标准限值 0.8 μm，判定 `FAIL`，旗帜报警，问题项 Tab 亮红标。
> 4. **用例 4（Tier 1 ➡️ Tier 2 - HITL）**：
>    - **原件名称**：`[用例4] Tier1-Tier2-HITL-特种指标语义歧义.pdf` (`case4_tier1_to_tier2_hitl.pdf`)
>    - **触发机理**：标准 `NB/T 47019.5-2021`，牌号 `06Cr18Ni11Ti`，常规项齐全，包含非标特异力学项目 `特种非标微区抗剪切强度: 85 MPa`。
>    - **预期效果**：Tier 1 首发大盘；Tier 2 检索标准切片规则池无匹配项，置信度不足，发射 `hitl_interrupt`；比对矩阵对应行原地展开行内 HITL 审核采纳卡片。

---

## Proposed Changes

### 1. 测试原件与数据生成工具链 (Part B)

#### [NEW] [scripts/generate-sample-test-cases.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/scripts/generate-sample-test-cases.ts)
- 基于轻量原生的标准 PDF 1.4 格式生成器，合成具有真实文本层、规整排列表格与对应力学/化学检测项目的 4 份标准矢量 PDF；
- 产出路径：
  - `public/samples/`：供浏览器直接下载、预览与原件高保真渲染；
  - `.cache/uploads/<md5>.pdf`：与系统文件缓存机制对齐；
  - `.cache/parses/<md5>.json`：预生成包含 `sessionDocument`、`bboxes`、`tokenStats` 的完整解析缓存，保障点击即用；
  - `.cache/preprocessed/<md5>/text.txt`：预处理矢量文本层。

#### [MODIFY] [src/extractor/mock-extractor.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/extractor/mock-extractor.ts)
- 注册这 4 个用例的确定性 Preset 数据（`case1_tier1_hitl_unknown_grade` 等），保障无外网与单元测试环境下的 100% 确定性输出。

---

### 2. 步骤 1 欢迎页与预设场景矩阵升级 (Part A)

#### [MODIFY] [src/app/api/samples/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/samples/route.ts)
- 扩充并重构样本列表，分类为两组：
  1. **“四维分层核验场景矩阵（分层架构专测）”**：包含上述 Case 1 ~ Case 4，携带明确预期流向、触发机理与下载链接；
  2. **“工业现场经典综合件”**：保留原有的 13296/47019.5 真实质保书样本。

#### [MODIFY] [src/components/WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 在步骤 1（`currentStep === 0`）中间或底部区域，增加专用的 **“分层核验场景快速验证区”**：
  - 4 块精致卡片，直观展示分支标签（`[Tier 1 挂起]`、`[Tier 2 增量通过]`、`[Tier 2 增量超标]`、`[Tier 2 行内挂起]`）；
  - 卡片集成【一键装载验证】与【下载原件 PDF】双操作；
  - 点击卡片后，无需用户手工上传与等待大模型抽取，立即将预置文档推入待处理队列与当前 Session，平滑滑动至步骤 2，用户点击“开始合规核验”即可直接观摩全套 SSE 流式演进与矩阵三态交互。

---

### 3. 自动化测试与质量保障

#### [NEW] [tests/e2e/four-tier-scenarios.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/e2e/four-tier-scenarios.test.ts)
- 编写端到端单元测试，依次执行这 4 个场景的流式核验：
  1. 校验 Case 1 抛出 `hitl_interrupt` 且 reason 为牌号异常；
  2. 校验 Case 2 先出 `tier1_ready`，再出 `tier2_patch`/`complete` 且最终 `PASS`；
  3. 校验 Case 3 先出 `tier1_ready`，再出 `tier2_patch`/`complete` 且最终 `FAIL`（粗糙度超差）；
  4. 校验 Case 4 先出 `tier1_ready`，再出 `hitl_interrupt` 且原因属于 `PROPERTY_AMBIGUITY`。

---

## Verification Plan

### Automated Tests
- 运行生成脚本：`pnpm exec tsx scripts/generate-sample-test-cases.ts`
- 运行新增单测：`pnpm test tests/e2e/four-tier-scenarios.test.ts`
- 运行全量单测回归：`pnpm test` (确保 45+ 套件全绿)
- 类型检查：`pnpm exec tsc --noEmit`
- 生产构建检查：`pnpm build`

### Manual Verification
- 启动本地服务 `pnpm dev`；
- 进入步骤 1，点击 4 块场景卡片中的任一块，观察文档队列装载；
- 前往步骤 2 验证原件 PDF 正常预览；
- 点击“开始合规核验”，在步骤 3 实时验证对应的流式推送与矩阵三态渲染。
