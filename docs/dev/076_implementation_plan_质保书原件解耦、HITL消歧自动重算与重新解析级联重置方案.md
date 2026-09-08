# 质保书原件解耦、HITL消歧自动重算与重新解析级联重置方案

## 问题概述
1. **质保书原始牌号被覆写**：在 Case 1 中，原始牌号是 `SUS 304H-SpecialX`。当质检员在 HITL 抽屉选择推荐牌号 `06Cr19Ni10 (S30408)` 后，左侧「质保书信息」卡片中的牌号也被覆写，违背了原件事实不可变的原则；
2. **比对矩阵未自动重算（0 比对项）**：选择推荐牌号恢复流转后，系统显示虚假的“PASS 全项合规”，比对项为 0，只有手动点击“重新核验”才跑出真实的 16 项规则及 5 个不合格项（FAIL）；
3. **步骤 2 重新解析后步骤 3 状态残留**：用户返回步骤 2 执行“重新解析”，再进入步骤 3 时，由于去重锁 `batchEvaluatingKeyRef` 未清空且视图缓存未重置，步骤 3 仍展示上一轮的历史判定，未自动重新比对。

## 用户明确指示
- 方案 1 中，质检员已进行消歧指定后，界面上**左侧质保书信息保持不动**（严格显示原件提取出的牌号 `SUS 304H-SpecialX`），**仅修改右侧“执行标准与技术协议”后的“核验牌号”**（显示为消歧指定的牌号，如 `06Cr19Ni10`）。

## 拟实施的改动

### 1. 服务端 LangGraph 流式中断修复 (`src/workflow/workflow-engine.ts`)
- 在 `streamAudit` 中，避免在 `normalize` 节点产出 `hitlContext` 时提前 `return` 结束流，确保 LangGraph 能够正常推进至 `human_review` 节点的 `interrupt()` 并在 Checkpointer 中持久化中断快照；
- 使得 `/api/audit/resume/[taskId]` 能够无缝调用 `graph.invoke(new Command({ resume }))` 恢复执行并返回包含 16 条比对项的 `finalReport`。

### 2. 原件事实与核验基准分层解耦 (`src/components/WaterfallWorkbench.tsx`)
- 在 `handleResolveHitl` 中：
  - 绝对不修改 `b.grade`（保留质保书原件声明牌号）；
  - 消歧或指定的牌号统一写入 `b.overrideGrade`；
- 在步骤 3 UI 渲染中：
  - 左侧「质保书信息」卡片：渲染 `currentBatch.grade`，永久代表原件声明事实；
  - 右侧「执行标准与技术协议」卡片：将 `核验牌号: {currentBatch.grade}` 改为 `核验牌号: {currentBatch.overrideGrade || currentBatch.grade || '未声明'}`。

### 3. 根除虚假 PASS 降级，自动联动真实比对 (`src/components/WaterfallWorkbench.tsx`)
- 在 `handleResolveHitl` 中：
  - 移除 `if (!resumedReport) nextVerdict = 'PASS'` 的错误降级逻辑；
  - 若 `resumedReport` 返回，直接将带有 16 条比对项的真实报告同步至 Session 与 `batchPresentationMap`；
  - 若未拿到 `resumedReport`，在更新 `overrideGrade` 后立即调用 `evaluateBatches` 发起完整比对，彻底杜绝比对项为 0 的真空过渡态。

### 4. 重新解析时级联重置 (`src/components/WaterfallWorkbench.tsx` & `src/hooks/useDocumentParser.ts`)
- 在 `reparseDocument` 触发或 `handleDocumentParsed` 回调时：
  - 级联重置当前文档下所有批次状态：`verdict = 'UNAUDITED'`、`auditReport = undefined`、`overrideGrade = undefined`、`overrideStandard = undefined`、`systemVerdict = undefined`；
  - 清空 `batchPresentationMap` 中当前文档对应批次的旧状态缓存；
  - 重置 `batchEvaluatingKeyRef.current = ''`，彻底释放调度锁；
- 当用户再次进入步骤 3 时，系统毫无阻碍地自动拉起全批次重新比对。

## 验证计划
1. **自动化测试**：
   - 运行全量单元测试与集成测试：`pnpm test`，确保 46 个测试套件 100% 绿色通过；
   - 运行类型检查：`pnpm exec tsc --noEmit`，确保 0 错误。
2. **场景验证**：
   - 验证 Case 1 牌号消歧：左侧质保书信息保持 `SUS 304H-SpecialX`，右侧核验牌号变为 `06Cr19Ni10`；
   - 验证消歧后比对矩阵自动输出 16 项指标且真实判定为 FAIL（一票否决）；
   - 验证在步骤 2 点击“重新解析”后进入步骤 3，状态彻底重置并重新触发自动比对。
