# 多批次流式核验并发竞态防御与计算资源熔断保护实施方案

针对用户频繁切换标准、重新核验、连击重置等操作可能引发的“旧任务时序幽灵覆盖”与“算力无端开销”问题，本方案构建一套**「交互置灰 + 网络熔断 + 服务端级联退出 + 版本令牌校验」**的四层纵深防御体系。

---

## 一、方案背景与解决的核心问题

1. **同批次纵向时序竞态（Race Condition）**：
   - 场景：批次发起了长耗时的 `RUN-1`，随后用户快速点击重新核验或重置发起了短耗时的 `RUN-2`；
   - 隐患：`RUN-2` 先跑完并渲染正确结果，随后 `RUN-1` 旧网络流才到达，将界面与会话数据强行冲刷覆盖回 `RUN-1` 的陈旧结果；
   - 解决：通过前端 `AbortController` 物理掐断旧请求，并在回调层引入 `RunId` 版本令牌校验。

2. **频繁连击与快速切标的算力无端浪费（Wasted Resources）**：
   - 场景：用户快速连续点击重新核验，或快速在下拉框中连续增删多部标准；
   - 隐患：前端并发派发多次全量核验请求，服务端重复调用大模型，占用并发连接与 Token 额度；
   - 解决：采用「掐旧启新（Abort & Replace）」模式，确保同一批次在任意时刻系统只有最后一次点击（Latest Only）处于活跃执行，将系统开销牢牢压制在 $O(1)$。

---

## 二、架构改动与详细设计

### 1. 前端层：批次级 `AbortController` 熔断锁（Abort & Replace）
- **目标文件**：`src/components/WaterfallWorkbench.tsx`
- **机制**：
  1. 在工作台中维护引用字典：
     ```typescript
     const batchAbortControllersRef = useRef<Record<string, AbortController>>({});
     ```
  2. 在 `evaluateBatches` 调度单个批次前：
     - 检查 `batchAbortControllersRef.current[batch.batchNo]`，若已存在活跃控制器，立即调用 `.abort('NEW_RUN_DISPATCHED')`；
     - 创建全新 `AbortController` 并存入引用字典；
     - 将 `controller.signal` 透传给 `apiClient.submitAuditStream(..., ..., controller.signal)`；
  3. 当批次完成（`onComplete`、`onError`）或用户离开当前文档/开启新任务时，主动释放并注销控制器。

### 2. 前端层：版本令牌防弃包校验（Run Token Guard）
- **目标文件**：`src/components/WaterfallWorkbench.tsx`
- **机制**：
  在 `onTier1Ready`、`onTier2Patch`、`onHitlInterrupt`、`onComplete` 等回调中：
  ```typescript
  // 仅当事件属于当前批次最新的 runId 时才更新状态
  const activeRunId = `RUN-${batchRunCountersRef.current[batch.batchNo] || 0}`;
  if (data.taskId && !data.taskId.endsWith(activeRunId)) {
    // 迟到的陈旧数据包，直接静默丢弃
    return;
  }
  ```

### 3. 服务端层：HTTP 连接断开级联中止（Server Cascading Abort）
- **目标文件**：`src/app/api/audit/submit/route.ts`
- **机制**：
  在 `ReadableStream` 生成器管道中，绑定客户端中断信号：
  ```typescript
  if (request.signal.aborted) {
    return;
  }
  request.signal.addEventListener('abort', () => {
    controller.close();
  });
  ```
  当客户端调用 `abort()` 关闭连接后，服务端立即停止推进流式生成器，避免无谓的大模型与规则计算。

### 4. 交互层：按钮等价置灰与冷却保护（Idempotency & Throttle）
- **目标文件**：`src/components/WaterfallWorkbench.tsx`
- **机制**：
  1. 「重置」按钮：严格保持 `disabled={!isOverridden}`，重置后瞬间变灰，物理上杜绝连续连击；
  2. 「重新核验」按钮：增加 500ms 轻量防连击冷却锁，避免极速盲目连击。

---

## 三、涉及改动文件清单

| 文件路径 | 变更类型 | 变更职责 |
| :--- | :--- | :--- |
| `src/components/WaterfallWorkbench.tsx` | MODIFY | 挂载批次级 `AbortController` 管理、回调版本令牌校验、组件销毁清理 |
| `src/app/api/audit/submit/route.ts` | MODIFY | 接入 `request.signal` 客户端断开级联熔断 |
| `tests/workflow/stream-audit.test.ts` | MODIFY | 增加针对流式中止与 Abort 信号的自动化单测 |

---

## 四、验证计划

### 1. 自动化单元测试
- 运行 `pnpm test tests/workflow/stream-audit.test.ts`，验证 `signal.abort()` 能够干净中止流；
- 全量回归测试：`pnpm test`（确保全部 46 个测试套件通过）。

### 2. 静态检查与编译构建
- `pnpm exec tsc --noEmit`（0 错误，0 警告）；
- `pnpm build`（Next.js 15 生产打包构建成功）。

### 3. 场景模拟验证
- 模拟同一批次连续派发多次核验，验证前序请求在毫秒级被 abort 且没有旧数据冲刷界面。
