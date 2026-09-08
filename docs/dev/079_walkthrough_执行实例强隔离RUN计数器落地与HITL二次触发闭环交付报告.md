# 执行实例强隔离（RUN-${counter}）落地与 HITL 二次触发闭环交付报告

## 一、背景与问题

在质检员测试 Case 1（未知牌号 `SUS 304H-SpecialX`）时发现：
1. 第一次流式核验触发未知牌号 HITL 挂起，质检员在抽屉中处理消歧后恢复执行，得出系统判定；
2. 随后质检员点击「重置」按钮，核验牌号正确还原为原件牌号，但 **HITL 抽屉未能再次被触发**；
3. 根因排查：
   - 服务端与前端将 `thread_id` / `taskId` 固定为 `${sessionId}::${batchNo}`；
   - 点击重置后，新的核验复用了相同的 `thread_id`，LangGraph 从 Checkpointer 加载了先前的历史快照，快照中残留了 `state.humanCorrection`（幽灵状态）；
   - 条件路由判定 `if (state.hitlContext && !state.humanCorrection)` 判定为 false，直接跳过了 `human_review` 挂起节点。

---

## 二、架构改动与实施落地

### 1. 契约升级与运行隔离（Execution Run Isolation）
- **文件**：`src/workflow/state.interface.ts`、`src/workflow/workflow-engine.ts`、`src/app/api/audit/submit/route.ts`
- **实现**：
  - 在 `WorkflowOptions` 中增加 `runId?: string`；
  - `submitAudit` 与 `streamAudit` 在计算 `threadId` 时升级为：
    ```typescript
    const threadId = (options?.sessionId && options?.batchNo)
      ? (options.runId ? `${options.sessionId}::${options.batchNo}::${options.runId}` : `${options.sessionId}::${options.batchNo}`)
      : (options?.contextId || `TASK-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
    ```
  - 未传 `runId` 时平稳向下兼容，确保全量历史单元测试不受影响。

### 2. 前端批次 Run 计数器闭环
- **文件**：`src/components/WaterfallWorkbench.tsx`
- **实现**：
  - 维护 `batchRunCountersRef`，在每次向服务端发起批次核验（初次核验、重新核验、重置核验）时，自增并下发 `runId: RUN-${counter}`（如 `RUN-1`，`RUN-2`）；
  - `handleResolveHitl` 与 `HitlDrawer` 优先绑定当前批次最新活跃的 `taskId`（包含 `RUN-${counter}` 后缀）；
  - 点击「重置」后，清空旧视图，以原件基准拉起 `RUN-2`，底层为崭新纯净的 LangGraph 线程，**100% 确定性再次触发 HITL 挂起**。

---

## 三、质量门禁验证

1. **单测回归验证**：
   - 增加 `多轮生命周期隔离验证：同一批次在 RUN-1 恢复完成后，使用 RUN-2 重新核验能够纯净再次触发 HITL 挂起` 专项单测；
   - 执行 `pnpm test`：**46 个测试套件，221 个测试用例全部通过**。
2. **TypeScript 严格类型检查**：
   - 执行 `pnpm exec tsc --noEmit`：**0 错误，0 警告**。
3. **Next.js 15 生产打包**：
   - 执行 `pnpm build`：全量 12 路由打包成功。
