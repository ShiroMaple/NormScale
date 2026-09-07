# 质保书长尾归一化与 LangGraph 三层核验重构交付报告 (Phase 1 & Phase 2)

本报告总结了 **Phase 1（核心引擎与数据切片修正）** 与 **Phase 2（后端 LangGraph 多批次线程隔离与三层工作流编排）** 的全量落地工作与验证成果。

---

## 一、Phase 1 成果回顾：确定性基石与立即修复

1. **钛含量 (Ti) 公式修约精度对齐**：
   * 在 [S32168_06Cr18Ni11Ti.json](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/data/standards/NB_T_47019_5_2021/slices/S32168_06Cr18Ni11Ti.json) 中将 Ti 动态公式 `rounding_decimals` 从 2 修正为 **3 位小数**（与 GB 对齐统一算得 0.155%）；
   * 两部标准指标预算严密一致，在步骤 3 比对矩阵中正常触发紧凑折叠合并，消除了虚假加严剪刀差。
2. **表面质量与表面粗糙度原子化解耦**：
   * 切片标准解耦为定性规则 `surface_quality`（表面外观质量）与定量规则 `surface_roughness`（表面粗糙度 Ra $\le$ 0.8 μm）；
   * [PropertyKeyNormalizer](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/property-key-normalizer.ts) 落实**特异性优先分级**（粗糙度优先于外观）与**数据类型/量纲感知校验**（单位为 `μm` 或浮点数自动纠偏为粗糙度）；
   * [core.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/core.ts) 与 [route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/audit/submit/route.ts) 引入**防冲毁类型专用槽位**（`#num` 与 `#qual`），粗糙度实测值与表面合格记录各自独立建档，杜绝覆盖。

---

## 二、Phase 2 成果：多批次线程隔离与三层渐进式工作流编排

### 1. 多批次并发物理线程隔离（Thread Isolation）
* **文件**：[src/workflow/workflow-engine.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/workflow-engine.ts)、[src/workflow/state.interface.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/state.interface.ts)
* **机制**：
  * 支持接收 `sessionId` 与 `batchNo`，统一构造格式化唯一的执行线程：`thread_id: ${sessionId}::${batchNo}`；
  * LangGraph Checkpoint（`MemorySaver`）基于此线程标识实现状态完全物理隔离；
  * **验证**：在 [`tests/workflow/multi-batch-isolation.test.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/workflow/multi-batch-isolation.test.ts) 中实测验证：批次 A 触发未知牌号挂起（`suspended_hitl`），批次 B 并发执行顺利完成（`completed`），互不阻塞、互不污染，且批次 A 可独立恢复。

### 2. Tier 2 受限候选集长尾消歧节点（LLM Property Resolver）
* **文件**：[src/workflow/nodes/llm-property-resolver.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/llm-property-resolver.node.ts)
* **机制**：
  * 从当前标准切片规则池中动态提取封闭候选集（如 `surface_roughness`、`dimensions` 等）；
  * 执行受限语义意图对齐：
    - 高置信度（$\ge 0.85$）：自动将长尾别名（如“表面光洁度”）升级为标准规则指标，并无缝合并入 `normalizedCert.test_records`；
    - 低置信度（$< 0.85$）：保留在待决池，若属于关键质检项，自动构建 `HitlInterruptContext` 触发人机协同挂起。

### 3. 状态图拓扑与人机协同（HITL）闭环
* **文件**：[src/workflow/audit-graph.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/audit-graph.ts)、[src/workflow/nodes/human-review.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/human-review.node.ts)
* **机制**：
  * 状态图新增拓扑节点：`llm_property_resolver`；
  * 条件分支流转：
    `normalize -> (有长尾未决项) -> llm_property_resolver -> (有低置信/歧义) -> human_review -> normalize -> retrieve_standard`；
  * `humanCorrection` 支持传入 `corrected_property_keys`，质检员确认后重回流转。

---

## 三、全量验证指标

| 验证项 | 验证命令 / 方式 | 结果 | 状态 |
| :--- | :--- | :--- | :--- |
| **自动化测试套件** | `pnpm test` | **42 个测试套件，203 个测试用例全绿**（新增多批次隔离测试与 Tier 2 消歧测试） | 通过 |
| **TypeScript 类型检查** | `pnpm exec tsc --noEmit` | **0 错误** | 通过 |
| **Next.js 15 生产构建** | `pnpm build` | **0 错误**，12 个 API 与静态页面编译打包完成 | 通过 |

---

## 四、后续推进（Phase 3 规划）

接下来进入 **Phase 3（渐进式流式通信与前端展示容器升级）**：
1. **通信层**：`/api/audit/submit` 接入 SSE / 流式响应（先行发射 `tier1_ready`，后续异步补丁 `tier2_patch` 或 `hitl_interrupt`）；
2. **前端容器**：`WaterfallWorkbench.tsx` 实现以 `batchNo` 为键的独立展示槽位存储，实现切换批次零污染；
3. **交互形态**：矩阵行三态渲染（已定型行、对齐微光行、行内 HITL 确认卡片）与结果旗帜多状态平滑演进。
