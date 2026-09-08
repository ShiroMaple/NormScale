# 质保书四维分层场景矩阵修复与测试资产物理隔离归档实施方案

本文档针对用户在体验四维分层核验场景矩阵时发现的 4 项问题，提出系统性的修复与工程化物理隔离方案。

---

## 一、问题根因剖析

### 1. 为什么会抛出“未找到预设样本: [doc_f944232d]”？
* **抛出组件**：服务端接口 [src/app/api/audit/submit/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/audit/submit/route.ts) 第 352 行抛出 404，由根视图页面 [src/app/page.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/page.tsx) 第 180-185 行的全局错误提示横幅捕获并呈现为红色警示弹框。
* **抛出根因**：在 [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx) 中，当质检员点击待处理队列卡片或从缓存恢复文档时（第 628 行 `onSelectSample(finalDocId)`，第 2282 行 `onClick={() => onSelectSample(doc.id)}`），触发了由父组件 `page.tsx` 传入的早期遗留回调 `onSelectSample={id => handleExecuteAudit(id)}`。该回调误把文档 ID（如 `doc_57cf180b`）当作 mock 样本名直接传给 `/api/audit/submit` 的 `sampleId`，导致查表未命中抛出 404。
* **修复方案**：彻底在 `page.tsx` 中剔除该遗留拦截；`WaterfallWorkbench` 内部文档点击只需更新自身的 `selectedDocId` 与批次状态，核验流转统一由其内部完善的 `evaluateBatches` 调度。

### 2. 为什么 Case 1 没有走到 HITL 状态？
* **根因**：在 [src/workflow/nodes/normalize.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/normalize.node.ts) 第 70-80 行，当输入数据已包含结构化字段 `rec0?.property_key` 时，直通逻辑直接硬编码了：
  ```ts
  grade_normalization: { is_matched: true, primary_grade: certificate.header.declared_grade, confidence: 1.0 }
  ```
  这直接**绕过了材料牌号消歧器 `GradeNormalizer` 的检验**，把未收录的非标牌号 `SUS 304H-SpecialX` 盲目判定为 `is_matched: true`，导致跳过了 `UNKNOWN_GRADE` 的 `hitlContext` 中断生成。随后标准检索节点因为标准库里查不到该非标牌号切片，退化为无规则核验，最终被判为 `FAIL 一票否决`。
* **修复方案**：在 `normalize.node.ts` 直通分支中，必须显式调用 `this.gradeNormalizer.normalize(certificate.header.declared_grade, certificate.header.declared_standard)`。对于未收录牌号，其 `is_matched` 为 `false`，即刻生成 `UNKNOWN_GRADE` 的 `hitlContext`，并触发 LangGraph 阻断挂起，前端 480px 抽屉即时展开。

### 3. 界面布局调整
* **需求**：将步骤 1 欢迎区中的「分层核验典型场景专测矩阵」从顶部下移至「历史已缓存文档」模块的下方。

### 4. 测试用例与资产的单独归档和隔离路径
* **需求**：测试用例做单独归档，代码分支走专用路径并清晰标注是测试数据，以便后续无痕清理。
* **方案**：采用工程化物理隔离。
  1. 归档目录：新建 [tests/fixtures/scenarios/](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/fixtures/scenarios/)，将 4 套场景的定义、高保真矢量 PDF 原件与结构化解析缓存集中放置于此；
  2. 运行时解耦：通过环境变量开关 `NEXT_PUBLIC_ENABLE_TEST_FIXTURES`（缺省在开发/测试环境下开启，生产构建可关闭）进行受控呈现；
  3. 视觉与元数据标注：在 API 返回与前端 UI 卡片上醒目标注 `[专测数据·随时可卸载]`，清理时只需关闭开关或删除该目录。

---

## 二、拟定代码改动清单 (Proposed Changes)

### 1. 架构解耦与遗留逻辑清除

#### [MODIFY] [page.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/page.tsx)
* 移除 `handleExecuteAudit` 中对 `sampleId` 的老旧调用与 `onSelectSample={id => handleExecuteAudit(id)}`；
* 将 `WaterfallWorkbench` 的 `onSelectSample` 降级为仅用于内部文档选中或完全由工作台自闭环管理；
* 清理无用的旧全局错误提示拦截。

#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
* 待处理队列卡片点击（第 2282 行）由 `onSelectSample(doc.id)` 改为内聚的 `setSelectedDocId(doc.id)` 并切换当前批次；
* 在 `handleRestoreFromCache` 中移除多余的 `onSelectSample(finalDocId)` 调用；
* 将「分层核验典型场景专测矩阵」卡片区块移动到「历史已缓存文档」组件下方；
* 在卡片角标与标题处明确标注 `[测试专测]` 徽标；
* 受环境变量 `NEXT_PUBLIC_ENABLE_TEST_FIXTURES` 控制是否渲染专测矩阵。

---

### 2. 工作流状态机与 HITL 阻断修复

#### [MODIFY] [normalize.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/normalize.node.ts)
* 移除结构化直通分支中的假数据与写死逻辑：无论是否已有 `property_key`，均强制通过 `this.gradeNormalizer.normalize(...)` 对牌号进行标准化消歧与有效性检验；
* 若牌号未匹配（`is_matched === false`），确保 `audit_log.grade_normalization.is_matched` 真实置为 `false`，从而稳固触发 `UNKNOWN_GRADE` 的 `hitlContext`；
* 触发 `hitlContext` 后安全中断，流向 `human_review` 节点。

#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
* 完善 `handleResolveHitl`：质检员在 480px 抽屉选择国标牌号后，除了更新会话数据外，调用 `apiClient.resumeAudit` 唤醒 LangGraph 状态机并更新核验报告，完成真实闭环。

---

### 3. 测试资产物理隔离与归档

#### [NEW] [tests/fixtures/scenarios/index.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/fixtures/scenarios/index.ts)
* 集中定义 Case 1 ~ Case 4 四维场景测试数据清单、PDF 原件路径、缓存文件路径与场景元数据；
* 导出纯净读取函数与环境变量保护守卫。

#### [MODIFY] [mock-extractor.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/extractor/mock-extractor.ts)
* 将 Case 1 ~ Case 4 样本数据移入 `tests/fixtures/scenarios/` 归档，主抽取器保持最小化，仅在非生产环境下从归档中加载，避免核心代码膨胀。

#### [MODIFY] [samples/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/samples/route.ts)
* 检查 `process.env.NEXT_PUBLIC_ENABLE_TEST_FIXTURES` 开关；
* 读取 `tests/fixtures/scenarios/` 中的归档元数据，所有返回数据均携带 `is_test_fixture: true` 标记。

---

## 三、验证计划 (Verification Plan)

### 1. 自动化测试验证
* 运行新增与现有端到端测试用例：
  ```powershell
  pnpm test tests/e2e/four-tier-scenarios.test.ts
  ```
  验证：
  - Case 1 无论是传原始字典还是 `batchSpecimen` 结构，均能精确触发 `hitl_interrupt` 且 reason 为 `UNKNOWN_GRADE`；
  - 质检员确认牌号后调用 `resumeAudit`，能够顺利恢复执行并输出合格报告；
  - Case 2 顺利流转至 Tier 2 并 PASS；
  - Case 3 顺利流转至 Tier 2 并 FAIL；
  - Case 4 触发行内歧义 HITL 挂起。
* 全量单元与集成测试回归：
  ```powershell
  pnpm test
  ```
  确保 45+ 个测试套件全量绿色通过。

### 2. TypeScript 类型与构建验证
* 运行类型检查：
  ```powershell
  pnpm exec tsc --noEmit
  ```
* 运行 Next.js 生产环境构建：
  ```powershell
  pnpm build
  ```
  确保零类型警告与 12 路由打包成功。

### 3. 界面实机流转验证
* 打开工作台步骤 1，确认「历史已缓存文档」位于上方，「分层核验典型场景专测矩阵」位于下方；
* 点击 Case 1【一键装载】，确认不再弹出任何“未找到预设样本: [doc_xxx]”的红框提示；
* 前往步骤 3，确认 Case 1 自动挂起并滑出 480px HITL 抽屉提示指定牌号；
* 选择等效国标牌号后恢复，确认比对矩阵即时刷新并正常合规放行。
