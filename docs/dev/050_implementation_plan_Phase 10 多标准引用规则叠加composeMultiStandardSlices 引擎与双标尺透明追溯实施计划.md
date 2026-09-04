# Phase 10: 多标准引用规则叠加、composeMultiStandardSlices 引擎与双标尺透明追溯实施计划

本方案针对工业质量证明书（MTC）同时声明两份及以上技术标准（如通用产品制造标准 `GB/T 13296-2023` 与承压订货技术条件 `NB/T 47019.5-2021`）的复杂技术契约，构建规则叠加合成器、双标尺合规归因引擎与双轨制终审放行仲裁体系。

---

## 核心设计与业务背景

在特种设备（承压锅炉管、换热器管）制造与采购中，材料经常处于“通用制造国标 + 承压订货行标 + 业主工程专有协议/国际认证标准”的**多重契约（$N \ge 2$）**约束之下：
1. **支持任意数量标准（$N \ge 2$）的泛化合成**：
   - 不管是双标（GB/T + NB/T）还是三标/四标（如 GB/T 13296 + NB/T 47019.5 + 业主工程技术协议 + ASME SA-213），合成器 `composeMultiStandardSlices` 均采用数组批处理模型，纯函数支持任意 $N \ge 2$ 扩展；
2. **检验项目取全量并集（Union）**：
   - 涵盖全部 $N$ 份标准中规定的所有检验项目（包括通用项与各标准专有的扩口、晶粒度、表面质量、冲击吸收功等），杜绝任何标准要求的漏检；
3. **共有项目取严苛交集（Strict Superiority / Envelope Principle）**：
   - 下限指标（如伸长率 $A$、抗拉强度 $R_m$）：$\text{Req}_{\min} = \max_{i=1}^N (S_i.\min)$；
   - 上限指标（如有害元素 P、S 含量）：$\text{Req}_{\max} = \min_{i=1}^N (S_i.\max)$；
   - 检验要求等级：$\text{MANDATORY} \succ \text{CONDITIONAL} \succ \text{OPTIONAL\_AGREED} \succ \text{EXEMPT}$；
   - 无损探伤灵敏度：$U2 \succ U2.5 \succ U3$，$E2H \succ E3H \succ E4H$；
4. **多标尺双维度完整透明溯源（Two-Dimensional Full Traceability）**：
   - **维度 A·规则合成期来源溯源（Source Provenance）**：每条合成规则内部挂载 `composite_trace`，完整记录所有参与标准的原始指标快照，并显式标记哪份标准起到了主导加严作用（`is_governing_strict: true`），生成如 `取 NB/T 47019.5 下限 ≥40.0% (严于 GB/T 13296 的 35.0%)` 的归因理由；
   - **维度 B·实测核验期逐标独立裁决（Per-Standard Independent Evaluation）**：核验时不仅对比合成后的最严包络线，同时并行对比每一份来源标准的单体限值，输出各标准独立合格/不合格结论（如：`GB: PASS (≥35%)`、`NB: FAIL (≥40%)`、`ASME: PASS (≥30%)`）；
   - **加严剪刀差明确责任归属（Scissors Attribution）**：当指标仅因某一部或某几部订货加严标准不达标时，判定结论明确指出：“满足基础国标与国际标，但未达行业订货加严标，责任归属于 NB/T 47019.5 加严条款”；
5. **终审放行仲裁矩阵（Release Arbitration Matrix）**：
   - 系统客观计算判定（`systemVerdict`）永不抹除；
   - 结合质检工程师人工签认（`humanVerdict`），按照仲裁矩阵输出最终流转处置（`RELEASE`, `RELEASE_VERIFIED`, `CONCESSION_RELEASE`, `REJECTED_BY_SYSTEM`, `REJECTED_BY_HUMAN` 等）。

---

## User Review Required

> [!IMPORTANT]
> **多标准属性名对齐策略**：在现有标准切片中，GB/T 使用 `elongation_A`, `tensile_strength`, `yield_strength_rp02`，而 NB/T 使用 `elongation_a`, `tensile_rm`, `yield_rp02`。切片合成器将利用已有的 `PropertyKeyNormalizer.normalize` 自动对齐为规范属性键，确保共有指标准确配对，同时保留原标准的 `rule_id` 与溯源引用。

> [!NOTE]
> **双轨制数据兼容性**：数据持久化继续完全兼容现有 `BatchSpecimen` 与 `.cache/audit/{sessionId}.json` 格式，`systemVerdict` 和 `humanVerdict` 保持并行独立，`verdict` 字段作为兼容层自动映射最终状态。

---

## Proposed Changes

### 1. 比对与合成核心引擎层 (Core Engine)

#### [NEW] [src/engine/multi-standard-composer.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/multi-standard-composer.ts)
- 实现纯函数切片合成器 `composeMultiStandardSlices()`：
  - 输入：`Array<{ slice: SpecificationSlice; standardId: string; standardName?: string }>`
  - 属性归一化对齐：调用 `PropertyKeyNormalizer.normalize` 消除各标准由于命名字段差异（如 `tensile_rm` vs `tensile_strength`）引起的割裂；
  - 检验项目取并集（Union）：所有标准的检验项目一并进入合成规则集；
  - 共有指标严苛交集（Strict Superiority）：
    - 数值下限取 $\max$，上限取 $\min$；
    - 检验等级取最高优先级；
    - 无损探伤取最高灵敏度等级；
  - 规则溯源标记：在每条合成规则中附带 `composite_trace`，记录各标准原始指标、哪份标准起到了加严作用、双标展示文本（如 `≥ 40.0% [NB] / ≥ 35.0% [GB]`）与归因理由；
  - 输出：`CompositeSlice`。

#### [NEW] [src/engine/dual-track-verdict.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/dual-track-verdict.ts)
- 定义放行仲裁矩阵类型与纯函数 `resolveFinalDisposition()`：
  - `SystemVerdict`: `'PASS' | 'FAIL' | 'MANUAL_REVIEW'`
  - `HumanVerdict`: `'PASS' | 'REJECT' | 'WAIVED' | null | undefined`
  - `FinalDisposition`:
    - `RELEASE` (PASS + null)
    - `RELEASE_VERIFIED` (PASS + PASS)
    - `REJECTED_BY_HUMAN` (PASS + REJECT)
    - `REJECTED_BY_SYSTEM` (FAIL + null)
    - `REJECT_CONFIRMED` (FAIL + REJECT)
    - `CONCESSION_RELEASE` (FAIL + PASS)
    - `PENDING_REVIEW` (MANUAL_REVIEW)
  - 辅助方法：生成各状态的标签文字、主题配色、权限提示与审计日志。

#### [MODIFY] [src/schemas/report.schema.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/schemas/report.schema.ts)
- 在 `RuleEvaluationItemResultSchema` 中扩展可选的多标准双标尺溯源字段：
  - `dual_standard_requirement_text?: string`（多标综合要求描述，如："≥ 40.0% [NB/T 47019.5] / ≥ 35.0% [GB/T 13296] / ≥ 30.0% [ASME SA-213]"）
  - `is_scissors_difference?: boolean`（是否处于加严剪刀差失效区间）
  - `strict_standard_id?: string`（起主导加严作用的标准 ID）
  - `scissors_attribution?: string`（剪刀差归因责任说明）
  - `multi_standard_evaluations?: Array<{ standard_id: string; standard_short: string; requirement_text: string; status: AuditStatus; deviation?: number | null; is_governing?: boolean; message: string }>`（**结构化逐标独立核验结论清单**，实现对每份标准的精准溯源）
- 在 `AuditReportSchema` 中补充 `final_disposition?: string`。

#### [MODIFY] [src/engine/core.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/core.ts)
- 扩展 `ComplianceEngine`：
  - 支持直接接收 `CompositeSlice` 或多个标准切片进行合规裁决：`evaluateSlice(slice: SpecificationSlice, cert: CertificateExtract, options?: EngineEvaluationOptions)` 与 `evaluateMultiStandard(...)`；
  - 在逐项评估循环中，若规则包含 `composite_trace`，自动双向检验：
    - 实测值对比合成后严苛阈值；
    - 实测值分别对比各来源标准的原始阈值；
    - 智能识别“加严剪刀差区间”（满足基准标准但不满足订货加严标准），生成明确的双标尺责任归因判定文本与判定明细；
- 导出新增纯函数与接口。

#### [MODIFY] [src/engine/index.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/index.ts)
- 统一导出 `composeMultiStandardSlices`、`CompositeSlice`、`resolveFinalDisposition`、`FinalDisposition` 等新模块。

---

### 2. 标准仓储层扩展 (Repository Layer)

#### [MODIFY] [src/repository/rule-store.interface.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/repository/rule-store.interface.ts) & [src/repository/file-rule-store.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/repository/file-rule-store.ts)
- 在 `IRuleStore` 与 `FileRuleStore` 中新增便捷方法：
  - `resolveCompositeSlice(standardIds: string[], routingKey: string): Promise<CompositeSlice | undefined>`
  - 自动从倒排索引检索各标准的 `SpecificationSlice`，调用 `composeMultiStandardSlices` 纯函数合成后返回，并对结果做内存惰性缓存（Memoization）。

---

### 3. 前端工作台与全景比对矩阵深度贯通 (UI Workbench)

#### [MODIFY] [src/components/WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 在步骤 3 全景比对矩阵数据构建中，全面接入多标准合成与双标尺透明追溯：
  - 将当前选中的 `selectedStandardIds`（如 `GB/T 13296-2023` + `NB/T 47019.5-2021`）与 `activeGrade`（如 `S32168`）输入合成器；
  - “执行标准要求 [Min, Max] / 条款规范”列：真实回显双标对比要求（如 `≥ 40.0% [NB/T 47019.5] / ≥ 35.0% [GB/T 13296]`）；
  - “偏差量 / 吻合度”列：真实计算相对最严标准的数值偏离量；
  - “判定状态”与“规则依据”列：当落入剪刀差区间时，清晰高亮 `✗ FAIL (未达标)` 并附带责任边界说明：`满足通用国标 (≥35%)，但不满足订货条件 (≥40%)，按就高原则判定`；
  - 顶部综合判定与放行按钮区域：完整接入 `resolveFinalDisposition`，展示系统判定与人工复核双轨状态（放行 / 特批放行 / 拒收 / 待协同）。

#### [MODIFY] [src/components/ComplianceMatrix.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/ComplianceMatrix.tsx)
- 适配 `RuleEvaluationItemResult` 的双标尺要求文本与剪刀差标签，增强多标准核验明细的渲染表现力。

---

## Verification Plan

### Automated Tests
1. **切片合成器专项测试**：
   - 编写 `tests/engine/multi-standard-composer.test.ts`：
     - 测试检验项目并集（GB 的项 + NB 专属的扩口、晶粒度、表面质量均并入）；
     - 测试共有项目严苛交集（S32168 伸长率 $\ge 40\%$、抗拉强度 $\ge 520\text{MPa}$、有害元素下限）；
     - 测试涡流/超声质量等级就高优先（$E2H \succ E3H$）；
     - 测试属性归一化匹配（`tensile_rm` 与 `tensile_strength` 自动配对）。
2. **双轨制放行仲裁矩阵专项测试**：
   - 编写 `tests/engine/dual-track-verdict.test.ts`：
     - 覆盖仲裁矩阵全部 7 种组合（PASS+null, PASS+PASS, PASS+REJECT, FAIL+null, FAIL+REJECT, FAIL+PASS, MANUAL_REVIEW）；
     - 验证各状态的特批放行说明与审计合法性。
3. **双标尺剪刀差与合规评估集成测试**：
   - 编写 `tests/engine/multi-standard-evaluation.test.ts`：
     - 测试全合格样本（$A = 42.5\%$）：系统判定 PASS，双标均合格；
     - 测试加严剪刀差失效样本（$A = 38.0\%$）：系统判定 FAIL，准确生成剪刀差归因信息；
     - 测试双不达标样本（$A = 30.0\%$）：系统判定 FAIL，明确指出双标准均未达标。
4. **全量回归验证**：
   - 运行全量测试套件：`pnpm test`（当前 35 个套件必须全部继续 100% 绿色通过）；
   - 运行类型检查门禁：`pnpm typecheck`（必须 0 错误）。

### Manual Verification
- 启动本地工作台（或通过测试脚本），在步骤 3 选定 `GB/T 13296-2023` 与 `NB/T 47019.5-2021` 双标准，查看 S32168 试样全景比对矩阵中伸长率、抗拉强度、扩口试验与探伤项的双标尺追溯标签呈现与剪刀差判定展示。
