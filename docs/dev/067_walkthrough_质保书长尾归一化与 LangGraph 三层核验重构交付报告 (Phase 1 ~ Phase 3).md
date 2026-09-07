# 质保书长尾归一化与 LangGraph 三层核验重构交付报告 (Phase 1 ~ Phase 3)

本报告总结了 **Phase 1（核心引擎与数据切片修正）**、**Phase 2（后端 LangGraph 多批次线程隔离与三层工作流编排）** 以及 **Phase 3（渐进式流式通信与前端无状态展示容器升级）** 的全量落地工作与验证成果。

---

## 一、Phase 1 成果：确定性基石与数据切片修正

1. **钛含量 (Ti) 公式修约精度对齐**：
   * 在 [S32168_06Cr18Ni11Ti.json](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/data/standards/NB_T_47019_5_2021/slices/S32168_06Cr18Ni11Ti.json) 中将 Ti 动态公式 `rounding_decimals` 从 2 修正为 **3 位小数**（与 GB 对齐统一算得 0.155%）；
   * 两部标准指标预算严密一致，在步骤 3 比对矩阵中正常触发紧凑折叠合并，消除了虚假加严剪刀差。
2. **表面外观质量与表面粗糙度原子化解耦**：
   * 切片标准解耦为定性规则 `surface_quality`（表面外观质量）与定量规则 `surface_roughness`（表面粗糙度 Ra $\le$ 0.8 μm）；
   * [PropertyKeyNormalizer](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/property-key-normalizer.ts) 落实**特异性优先分级**（粗糙度优先于外观）与**数据类型/量纲感知校验**（单位为 `μm` 或浮点数自动纠偏为粗糙度）；
   * [core.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/core.ts) 与 [route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/audit/submit/route.ts) 引入**防冲毁类型专用槽位**（`#num` 与 `#qual`），粗糙度实测值与表面合格记录各自独立建档，杜绝覆盖。

---

## 二、Phase 2 成果：多批次线程隔离与三层渐进式工作流编排

1. **多批次并发物理线程隔离（Thread Isolation）**：
   * **文件**：[src/workflow/workflow-engine.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/workflow-engine.ts)、[src/workflow/state.interface.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/state.interface.ts)；
   * 支持接收 `sessionId` 与 `batchNo`，统一构造格式化唯一的执行线程：`thread_id: ${sessionId}::${batchNo}`；
   * LangGraph Checkpoint（`MemorySaver`）基于此线程标识实现状态完全物理隔离，批次间互不阻塞、互不污染。
2. **Tier 2 受限候选集长尾消歧节点（LLM Property Resolver）**：
   * **文件**：[src/workflow/nodes/llm-property-resolver.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/llm-property-resolver.node.ts)；
   * 从当前标准切片规则池中提取封闭候选集，执行受限语义对齐；
   * 置信度 $\ge 0.85$ 自动升级为标准规则指标；置信度不足时构建 `HitlInterruptContext` 触发人机协同挂起。
3. **状态图拓扑与人机协同（HITL）闭环**：
   * **文件**：[src/workflow/audit-graph.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/audit-graph.ts)、[src/workflow/nodes/human-review.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/human-review.node.ts)；
   * 拓扑结构支持挂起、人工修正回填与恢复流转。

---

## 三、Phase 3 成果：渐进式流式通信与前端无状态展示容器

### 1. 后端 SSE 渐进式流式事件调度
* **文件**：[src/workflow/workflow-engine.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/workflow-engine.ts)、[src/app/api/audit/submit/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/audit/submit/route.ts)；
* **拓扑革新**：
  * 将状态图优化为 **Tier 1 确定性规则优先计算**（Fast-Path 毫秒级直出），产出确定性规则大盘结果后，立即发射 `tier1_ready` 事件（携带已就绪报告与待决长尾项）；
  * 待决长尾项异步流向 Tier 2 / Tier 3（Smart-Path / Safe-Path），完成后发射 `tier2_patch`、`hitl_interrupt` 或 `complete`；
* **传输层**：`/api/audit/submit` 原生支持 SSE (`text/event-stream`) 协议，兼顾非流式传统 JSON 请求向下兼容。

### 2. 前端客户端 API 封装
* **文件**：[src/lib/api-client.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/lib/api-client.ts)；
* 提供 `submitAuditStream` 方法，支持 `onTier1Ready`、`onTier2Patch`、`onHitlInterrupt`、`onComplete` 与 `onError` 全生命周期监听，同时提供 Promise 异步解析。

### 3. 工作台展示容器状态池与三态渲染
* **文件**：[src/components/WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)；
* **多批次隔离槽位字典**：
  * 构建 `batchPresentationMap: Record<string, BatchPresentationState>` 状态池；
  * 用户在多批次间切换标签仅改变指针（`selectedBatchNo`），前端**零重复计算、零跨批次数据污染**；
* **比对矩阵行三态渲染**：
  * **态 1（已定型行）**：展示常规化学、力学、工艺与探伤等已核验指标及加严剪刀差说明；
  * **态 2（长尾对齐中行）**：以微光呼吸动效（Shimmer）展示原始提取项，标注“Tier 2 语义条款对齐中”与转动动效；
  * **态 3（行内人机协同卡片）**：展示歧义预警、AI 推荐标准条款与置信度，并提供【采纳推荐项】与【人工细化复核】交互按钮；
* **结果旗帜平滑演进**：
  * `核心指标就绪 (18/19) · 1 项条款对齐中`（蓝紫过渡微光） -> `全项核验合格`（终态绿色） / `待人工复核确认`（琥珀色）。

---

## 四、全量验收与质量门禁

| 验证项 | 验证命令 / 方式 | 结果 | 状态 |
| :--- | :--- | :--- | :--- |
| **自动化测试套件** | `pnpm test` | **43 个测试套件，206 个测试用例 100% 绿色通过**（新增 `stream-audit.test.ts` 流式分段测试） | 通过 |
| **TypeScript 类型检查** | `pnpm exec tsc --noEmit` | **0 错误**（严格模式 Strict 启用） | 通过 |
| **Next.js 15 生产构建** | `pnpm build` | **0 错误**，全量 12 个页面与 API 路由编译打包成功 | 通过 |
| **Cairn 知识库同步** | `cairn/LOG.md` | 已按最新优先原则追加 Phase 3 记录（$\le 20$ 行） | 通过 |
