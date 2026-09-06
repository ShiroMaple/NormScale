# 质保书全批次异步并行核验与状态解耦交付报告

针对用户指出的“各批次未异步并行比对、默认显示为假 PASS、切换到该批次时才变为真实 FAIL”问题，已全量完成端到端落地、语义解耦与并发调度重构。

---

## 一、问题根因与重构方案对比

| 维度 | 重构前 (存在严重误导) | 重构后 (方案 C 落地) |
|---|---|---|
| **提取阶段状态赋值** | 结构化解析完成后直接硬编码 `verdict: 'PASS'`，导致未比对批次带着假通过状态进入步骤 3。 | 初始状态置为 `verdict: 'UNAUDITED'`，明确表达“提取完成，待合规比对”。 |
| **核验触发时机** | 单批次惰性计算（仅计算当前选中的批次，其余批次闲置挂起，切换时才计算）。 | **全批次异步并行核验**：进入步骤 3 时，利用 `Promise.all` 自动并发发起当前文档所有未核验批次的规则比对。 |
| **批次切换体验** | 切换到未算批次时临时发请求，状态发生从绿变红的突变跳变。 | 所有批次在进入步骤 3 后的几十毫秒内全部计算完毕，切换批次时**毫秒级直出**，再无跳变。 |
| **下拉菜单与进度统计** | 下拉框将未算批次误报为 `PASS ✓`，右侧显示虚高的 `2 PASS  1 FAIL`。 | 下拉框未算时显示中性 `待比对`，已算则展示真实 `PASS` / `FAIL`；右侧总进度精确反映实际合格/不合格炉批数。 |
| **标准切换联动** | 仅单批次重算，其他批次标准与状态失调。 | 切换/增减执行标准时，自动将新标准广播给当前文档所有批次，并触发全批次并发重新比对。 |

---

## 二、代码修改清单

### 1. 数据模型与提取器解耦 ([`src/types/session.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/types/session.ts), [`src/extractor/openai-compatible-extractor.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/extractor/openai-compatible-extractor.ts))
- 将 `BatchSpecimen.verdict` 与 `systemVerdict` 扩展支持 `'UNAUDITED'` 待比对状态；
- 大模型提取组装批次数据时，赋初始值 `verdict: 'UNAUDITED'`，消除假通过。

### 2. 下拉菜单与进度条渲染校准 ([`src/components/BatchContextBar.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/BatchContextBar.tsx))
- 步骤 2 提取模式下，提取完成显示 `SUCCESS ✓`；
- 步骤 3/4 合规模式下，未比对显示中性灰底 `待比对`，已核验显示 `PASS ✓` / `FAIL ✗` / `HITL`；
- 右侧总进度概览精准统计，不再误把未核验算作 PASS。

### 3. 全批次异步并行核验调度器 ([`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx))
- 实现 `evaluateBatches(batchesToEval: BatchSpecimen[], forcedStdIds?: string[])` 异步并发调度器；
- 进入步骤 3 时自动筛选所有 `UNAUDITED` 批次通过 `Promise.all` 并发向后端提交核验；
- 支持切换标准全批次并行重算、单批次快速重算。

---

## 三、致密性/水压替代检验容差增强与加严剪刀差释义卡片落地 (无 EMOJI)

### 1. 致密性/水压试验组误判未达标根治 ([`src/engine/logic-evaluator.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/logic-evaluator.ts))
- **根因**：原 `evaluateAlternativeGroup` 对实测合格判断采用了严格全等 `=== '合格'`，质保书提取为 `合格 OK`、`无渗漏` 或包含外文时被误判为 `false`。
- **修复**：升级为双向正负向工业关键词正则容差匹配：
  - 负向拦截：`/不合格|未达到|未通过|有渗漏|渗水|破裂|开裂|UNQUALIFIED|\bFAIL\b|\bFALSE\b/i`
  - 正向达标：`/合格|PASS|OK|QUALIFIED|无渗漏|完好|NO_LEAK|\bTRUE\b/i`
  - 结合声称等级匹配，子项标记统一规范为 `(达标 / 未达标)`。
- **新增用例**：在 [`tests/engine/logic-evaluator.test.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/engine/logic-evaluator.test.ts) 中增加包含 `合格 OK`、`有渗漏` 的场景测试。

### 2. 剪刀差归因去重与工业术语释义卡片 ([`src/engine/core.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/core.ts), [`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx))
- **判定逻辑去重**：剪刀差时的 `result.message` 不再塞入长篇归因文本，而是专注于实测对比事实：`不合格: 实测值 0.052 % (≤ 0.030 % [NB/T 47019.5-2021] / ≤ 0.080 % [GB/T 13296-2023])`；
- **微型释义卡片**：在判定逻辑单元格下方，采用独立浅琥珀色卡片呈现责任归属与术语解释：
  - **责任归属**：明确责任归属于哪部标准的订货加严条款；
  - **术语说明**：规范阐述“什么是加严剪刀差”（实测指标满足通用推荐国标但未达到承压订货加严标，按严苛就高原则判定不合格）；
  - **严格零 EMOJI 约束**：卡片与文本中完全不使用任何 Emoji 图标，采用纯净、严谨的工业工程风格。

## 四、标准代号指纹归一化与前后端映射闭环 (无 EMOJI)

### 1. 共享指纹提取算法 ([`src/lib/utils.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/lib/utils.ts))
- 导出通用的 `normalizeStandardId(id: string)` 算法，消除空格、连字符、破折号、斜杠与大小写差异；
- 将 `NB/T47019.5-2021`、`NB/T 47019.5-2021` 等不同形态统一归一化为纯净指纹 `NBT47019.52021`。

### 2. 前端初始化与 Combobox 闭环 ([`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx))
- **初始化映射提升**：`selectedStandardIds` 计算时通过指纹匹配标准目录，无论质保书提取是否带空格，一律自动映射提升为官方规范标准 ID（`NB/T 47019.5-2021`）；
- **Combobox 下拉勾选态对齐**：复选框初态基于指纹判断，天然显示为已勾选 `check_box`，根除初态未勾选假象；
- **防重切换**：`handleToggleStandard` 基于指纹比对是否存在，杜绝因空格差异将同一个标准重复追加为 3 部及导致全景矩阵重复比对。

### 3. 后端检索层防御性去重 ([`src/workflow/nodes/retrieve-standard.node.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/retrieve-standard.node.ts))
- 在多标准合成前执行基于 `normalizeStandardId` 的去重，防御外部冗余输入。

## 五、标准集合等价性双闭环判定与「标准已变更」标签状态闭环 (无 EMOJI)

### 1. 集合等价性算法 ([`src/lib/utils.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/lib/utils.ts))
- 导出 `areStandardCollectionsEquivalent(collectionA, collectionB)` 算法；
- 提取并比对两者的指纹集合，彻底免疫勾选操作引起的项排序倒置（如 `GB在前 vs NB在前`）、内部空格有无及不同分隔符干扰。

### 2. 状态写入与派生双闭环守卫 ([`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx))
- **操作写入守卫**：在 `handleToggleStandard` 中，当用户取消勾选又重新勾选（即还原为原始声明标准集合）时，系统自动识别等价性并将 `overrideStandard` 重置为 `undefined`；
- **派生计算守卫**：`isOverridden` 升级为基于 `areStandardCollectionsEquivalent` 进行深度集合比对。只要当前选定标准与原件声明标准一致，`isOverridden` 立即为 `false`，彻底根除“还原后标签仍残留”的问题。

### 3. 标签语义工业规范化 ([`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx))
- 发生实质变更时的黄底徽标文案由「定制标准」正式更名为「标准已变更」，更符合质量检验业务语义。

---

## 六、全量验证结果

1. **TypeScript 严格类型检查**：`pnpm exec tsc --noEmit` 0 错误通过。
2. **自动化测试套件**：`pnpm test` 全量 **40 个测试套件，196 个测试用例 100% 通过**。
3. **Next.js 生产环境打包**：`pnpm build` 顺利完成，12 个静态/动态路由全部构建通过。
