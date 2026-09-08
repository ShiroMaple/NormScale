# 质保书原件声明解耦、消歧自动重算、终审权解绑与重置归零交付走查报告

## 一、交付目标与完成情况总览

针对质检员在 Case 1 实测中反馈的问题，本轮工作已全部实现代码级落地与全链路验证：

| 序号 | 核心问题 | 修复要点 | 交付状态 |
| :--- | :--- | :--- | :--- |
| **1** | **质保书原始牌号被篡改** | 确立原件事实不可变原则，消歧仅写入 `overrideGrade`，严禁修改 `b.grade`；左侧质保书信息保持原始提取牌号 `SUS 304H-SpecialX` 不动，仅右侧「执行标准与技术协议」后的「核验牌号」更新为消歧钢级 `06Cr19Ni10`。 | **已解决** |
| **2** | **消歧后比对矩阵为 0 项未自动重算** | 修复服务端 LangGraph `streamAudit` 中断落盘逻辑，确保 Checkpointer 记录合法挂起任务；彻底移除前端虚假 PASS 降级，消歧恢复后自动驱动全量规则比对，比对矩阵直接输出 16 项比对指标并正确判定为 FAIL（一票否决）。 | **已解决** |
| **3** | **步骤 2 重新解析后步骤 3 残留上一轮旧状态** | 在 `reparseDocument` 与 `handleDocumentParsed` 中实现级联重置契约：清空当前文档批次的旧报告与视图缓存，重置状态为 `UNAUDITED`，并彻底释放调度防重锁 `batchEvaluatingKeyRef`，再次进入步骤 3 时自动拉起全新比对。 | **已解决** |
| **4** | **处理 HITL 消歧后系统越权勾选人工复核 REJECT** | 彻底解绑前置消歧输入与双轨制人工终审审批（`humanVerdict`）。消歧恢复执行后，保持 `humanVerdict: null`（未复核），把终审决策权与审批理由完全交还质检工程师，杜绝系统因算法 FAIL 自动塞入拒收说明。 | **已解决** |
| **5** | **仅指定牌号却误显“标准已变更”徽章** | 细化核验基准徽章语义：标准与牌号均变更显示「标准与牌号已变更」；仅标准变更显示「标准已变更」；仅牌号变更（如 Case 1 牌号消歧）精准显示「牌号已指定」。 | **已解决** |
| **6** | **“重置”按钮无法重置 `overrideGrade`** | 确立按钮分工并重构 `handleResetGrade`：显式归零 `overrideGrade` 与 `overrideStandard`、清空旧报告与当前批次 `batchPresentationMap` 视图缓存、释放调度防重锁，以原件声明基准重新拉起完整核验。 | **已解决** |
| **7** | **重置后 HITL 未能再次触发与 taskId 状态残留隐患** | 引入 `RUN-${counter}` 执行实例强隔离：每次发起核验生成唯一线程 `sessionId::batchNo::RUN-${counter}`，重置后自动启动全新独立线程，彻底消除 Checkpoint 幽灵数据残留，确保未知牌号 100% 确定性再次触发 HITL 挂起。 | **已解决** |

---

## 二、关键代码与架构改动

### 1. 质保书事实与核验标尺严格解耦
- **文件**：[WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- **改动详情**：
  1. 在 `handleResolveHitl` 中，严格保留 `b.grade` 不变，仅将消歧建议写入 `overrideGrade`：
     ```typescript
     grade: b.grade, // 严格保持质保书原件声明牌号不变
     overrideGrade: nextOverrideGrade,
     ```
  2. 步骤 3 视图呈现：
     - 左侧「质保书信息」卡片（第 4413 行）保持 `{renderExtractedValue(currentBatch.grade)}`，永久展示原始纸质单据声明的事实牌号 `SUS 304H-SpecialX`，不做任何附加修改；
     - 右侧「执行标准与技术协议」栏（第 4495 行）由原 `currentBatch.grade` 改为 `activeGrade`（即 `currentBatch.overrideGrade || currentBatch.grade`），准确展示当前用于执行合规判定的材料牌号基准（`核验牌号: 06Cr19Ni10`）。

### 2. 根除虚假 PASS 降级，消歧后自动联动真实比对引擎
- **文件**：[workflow-engine.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/workflow-engine.ts)、[WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- **改动详情**：
  1. 服务端流式中断修复：在 `streamAudit` 中，避免在遇到 `update.hitlContext` 时提前 `return`，允许状态图推进至 `human_review` 节点的 `interrupt()` 并持久化断点快照，使 `/api/audit/resume` 能够无缝通过 `Command({ resume })` 恢复执行；
  2. 彻底删除前端 `if (!resumedReport) nextVerdict = 'PASS'` 的假降级逻辑；
  3. 在 `handleResolveHitl` 中，若服务端未能直接返回规则报告，立即携带消歧后的 `targetBatch`（带最新 `overrideGrade`）调用 `evaluateBatches([targetBatch], selectedStandardIds)` 发起完整比对，驱动规则库产出完整的 16 条比对项，消除 0 比对项的真空态。

### 3. 步骤 2 重新解析时的级联重置机制（Cascading Reset）
- **文件**：[WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- **改动详情**：
  1. 将调度防重锁 `batchEvaluatingKeyRef` 提升至组件顶层作用域，建立跨步骤的生命周期管理；
  2. 在用户点击步骤 2 顶栏的「重新解析」按钮时（`onReparseDocument`），以及大模型流式解析完成触发 `handleDocumentParsed` 回调时：
     - 级联将文档下所有批次状态归零：`verdict = 'UNAUDITED'`、`auditReport = undefined`、`overrideGrade = undefined`、`overrideStandard = undefined`；
     - 清除 `batchPresentationMap` 中对应批次的视图缓存；
     - 清空调度防重锁 `batchEvaluatingKeyRef.current = ''`；
  3. 当质检员重新核对完毕并点击底部的“比对标准”进入步骤 3 时，系统自动、无阻碍地对所有批次重新调用比对引擎，彻底消除历史状态残留。

### 4. 人工终审权与前置消歧彻底解绑（Dual-Track Integrity）
- **文件**：[WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- **改动详情**：
  1. 契约矫正：在 `handleResolveHitl` 的处理链路中，显式设定：
     ```typescript
     humanVerdict: null,
     humanVerdictSummary: undefined,
     humanVerifiedAt: undefined,
     ```
  2. 权限隔离：彻底消除旧逻辑中因算法比对出现 FAIL 时越权替质检员选择 `REJECT` 并回填消歧说明的缺陷，终审审批决策权 100% 交还质检工程师。

### 5. 核验基准变更徽章精细化分流
- **文件**：[WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- **改动详情**：
  细化界面徽章渲染逻辑，避免无差别笼统展示“标准已变更”：
  ```tsx
  {isStandardOverridden && isGradeOverridden && <span>标准与牌号已变更</span>}
  {isStandardOverridden && !isGradeOverridden && <span>标准已变更</span>}
  {!isStandardOverridden && isGradeOverridden && <span>牌号已指定</span>}
  ```

### 6. 「重置」按钮归零重构与重新核验职责分工
- **文件**：[WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)、[session.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/types/session.ts)
- **改动详情**：
  1. 职责分工明确：
     - **重新核验**：基于当前设定的核验基准（包括已指定的牌号/标准）重新驱动合规比对引擎；
     - **重置**：清除质检员指定的人工变更，还原为质保书原件物理声明事实；
  2. `handleResetGrade` 彻底归零：
     - 显式将批次的 `overrideGrade: undefined, overrideStandard: undefined, auditReport: undefined, verdict: 'UNAUDITED', humanVerdict: null`；
     - 级联删除 `batchPresentationMap` 中当前批次的旧状态与比对报告；
     - 释放调度防重锁 `batchEvaluatingKeyRef.current = ''`；
     - 以干净的原件基准重新拉起流式核验 `evaluateBatch(cleanBatch)`。

### 7. 执行实例强隔离（`RUN-${counter}`）与幽灵状态根除
- **文件**：[workflow-engine.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/workflow-engine.ts)、[state.interface.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/state.interface.ts)、[submit/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/audit/submit/route.ts)、[WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- **改动详情**：
  1. 契约定义：在 `WorkflowOptions` 中增加 `runId?: string`，服务端线程标识生成规则升级：
     ```typescript
     const threadId = (options?.sessionId && options?.batchNo)
       ? (options.runId ? `${options.sessionId}::${options.batchNo}::${options.runId}` : `${options.sessionId}::${options.batchNo}`)
       : (options?.contextId || `TASK-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
     ```
  2. 前端计数器：在工作台中维护 `batchRunCountersRef`，每次对批次发起核验（初次核验、重新核验、重置核验）自增 `nextBatchRunId`（产出 `RUN-1`，`RUN-2`...）；
  3. 恢复对齐：在 `handleResolveHitl` 中优先从 `batchPresentationMap[batchNo].taskId` 获取当前处于挂起中断的真实活跃线程 ID；
  4. 彻底解决重置后 HITL 不触发的 Bug：重置后以 `RUN-2` 发起全新运行，Checkpointer 没有任何历史 `humanCorrection` 残留，未知牌号 100% 确定性再次触发 HITL 挂起抽屉。

---

## 三、质量门禁与验证

### 1. 全量自动化测试回归
执行命令：
```powershell
pnpm test
```
**46 个测试套件，221 个测试用例全部 100% 绿色通过**（包含新增的 `多轮生命周期隔离验证：同一批次在 RUN-1 恢复完成后，使用 RUN-2 重新核验能够纯净再次触发 HITL 挂起` 专项回归测试）。

### 2. TypeScript 严格类型检查
执行命令：
```powershell
pnpm exec tsc --noEmit
```
**0 错误，0 警告。**

### 3. Next.js 15 生产打包构建
执行命令：
```powershell
pnpm build
```
全量 12 个路由静态与动态构建成功，无任何构建错误。

