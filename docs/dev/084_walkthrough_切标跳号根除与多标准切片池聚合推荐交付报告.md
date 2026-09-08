# 084 研发走查报告：切标跳号根除与多标准切片池聚合推荐交付报告

## 1. 背景与缺陷分析

用户在步骤 3 实测切换标准及组合勾选标准时，发现以下两个异常：
1. **编号跳号现象**：勾选 NB/T 标准时，任务编号从 `RUN-48` 直接跳到 `RUN-50`，反选跳到 `RUN-52`（每次递增 2）；
2. **多标准牌号推荐失效**：单选 GB/T 或 NB/T 时抽屉均能高匹配推荐 `06Cr19Ni10 (S30408)`；但同时勾选两部标准时，抽屉提示“当前标准规则库未检索到高匹配候选，请使用下方手动输入”。

---

## 2. 根因与解决方案

### 2.1 问题一：编号跳号（跳 2）
- **根因**：`handleToggleStandard` 在执行 `setSession`（将批次置为 `UNAUDITED`）的同时，在回调内手动调用了 `evaluateBatches`，触发了一次自增（`RUN-49`）；随后 React 状态刷新，步骤 3 顶层的自动调度 `useEffect` 侦测到批次处于 `UNAUDITED` 且签名去重锁为空，再次派发了 `evaluateBatches`，导致第二次自增（`RUN-50`）并掐断了 `RUN-49`。
- **方案（按指示复用步骤 3 自动调度 useEffect）**：彻底移除了 `handleToggleStandard` 内的手动派发逻辑，仅保留声明式数据更新并重置防抖锁 `batchEvaluatingKeyRef.current = ''`；核验调度 100% 收敛至步骤 3 顶层 `useEffect` 唯一执行，保证每次切标编号严格递增 1。

### 2.2 问题二：多标准推荐候选失效
- **根因**：多标准同时生效时，系统拼接的标准为 `"GB/T 13296-2023、NB/T 47019.5-2021"`。推荐器旧逻辑直接拿此完整字符串去 `ruleStore.getCompleteStandard` 索取单份标准文件，因无此复合文件名的切片库而返回 `null`，切片池为空并直接退化返回 `[]`。
- **方案**：
  1. `CandidateGradeRecommender` 升级入参支持 `standardIds?: string[]`，并在内部对顿号、逗号、分号进行智能解构；
  2. 循环遍历所有选中的标准，合并动态加载全部规则切片；
  3. 增加**跨标准共有牌号激励加权**：若某候选牌号在勾选的多份标准中均有收录，给予 5% 的共有契合度激励加分；
  4. 切片池按 `primary_grade` 主键去重，保留最高分切片；
  5. 在 `src/workflow/nodes/normalize.node.ts` 中透传 `standardIds: options?.forcedStandardIds`。

---

## 3. 质量门禁与验证

1. **单测覆盖**：
   - 在 `tests/normalizer/candidate-grade-recommender.test.ts` 中新增场景 6（顿号分隔字符串聚合）与场景 7（`standardIds` 数组聚合及共有牌号推荐）测试；
   - 运行结果：`vitest run tests/normalizer/candidate-grade-recommender.test.ts` 7 个单测全部通过。
2. **全量测试**：
   - 运行结果：`pnpm test` 全量 46 个测试套件、223 个单测 100% 绿色通过。
3. **类型与构建**：
   - `pnpm exec tsc --noEmit`：0 错误通过；
   - `pnpm run build`：Next.js 15 App Router 生产打包成功。
