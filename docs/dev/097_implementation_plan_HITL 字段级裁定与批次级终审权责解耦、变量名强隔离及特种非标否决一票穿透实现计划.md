# HITL 字段级裁定与批次级终审权责解耦、变量名强隔离及特种非标否决一票穿透实现计划

## 背景与问题陈述

用户在 Case 4 实机操作中发现了关键逻辑与架构缺陷：
1. **权责越界与混淆**：质检员在 HITL 抽屉中对具体字段（如 `Shear Toughness K1C`）选择放行或否决，只是**字段级的输入纠偏与条款裁定**；但代码在 `handleResolveHitl` 中直接将该意见提升为**批次级终审（设置了 `humanVerdict = 'PASS'`）**，擅自替质检工程师给整批质保证书盖章，导致右上角【审批通过 ✓ APPROVE】被强制高亮选中，状态旗帜被置为“人机双重核准放行”。
2. **非标否决一票穿透失效**：当用户对特种非标项选择【不予认可 / 判定无效（缺项否决 FAIL）】时，后端规则引擎未将 `unmatched_certificate_records` 中的否决项计入 `fail_count`，导致服务端返回的 `overall_status` 仍为 PASS，叠加前端硬编码的 `humanVerdict = 'PASS'`，最终呈现出“用户明明否决了非标项，系统却判定人机双重核准放行”的荒谬现象。
3. **变量命名缺乏语义区隔**：HITL 抽屉的人工纠偏与批次级人工复核在命名上存在混淆空间，容易导致 Agent 或开发者在后续迭代中再次产生幻觉。

---

## 解决方案与设计

### 1. 变量命名强力物理区隔 (Strong Naming Separation)
- **批次级终审 (Batch-Level Final Review)**：
  - 核心属性：`batchFinalVerdict`（或 `humanVerdict`，明确注释为 `BATCH_FINAL_VERDICT_ONLY`）、`batchFinalReviewNotes`、`batchFinalReviewedAt`。
  - 权限归属：**仅限质检工程师在全景比对矩阵审阅完毕后，手动点击右上角【拒收】/【审批通过】触发**。
- **HITL 字段级裁定 (Field-Level HITL Correction)**：
  - 核心属性：`hitlFieldCorrection`（重构旧名 `hitlCorrection`）、`hitlFieldNotes`（重构旧名 `waiver_notes` 在批次层的误用）。
  - 权限归属：**仅作为质保书抽取或规则对齐时的中间数据纠偏快照**，严禁触碰批次终审。

### 2. 彻底清理 `handleResolveHitl` 越权代码
- 在 `handleResolveHitl` 中，恢复流转后**始终保持 `humanVerdict: null`、`humanVerdictSummary: undefined`、`humanVerifiedAt: undefined`**。
- 批次右上角【人工复核:】看板保持为中性的灰色**【未复核】**；
- 状态旗帜计算时：
  - 若系统判定为 PASS，且批次未复核（`humanVerdict === null`），状态旗帜显示为：“`流转: 待质检工程师终审核签`”；
  - 只有工程师手动点击【审批通过】后，才变为“`流转: 人机双重核准放行`”。

### 3. 特种非标否决一票否决穿透 (Strict Gatekeeping)
- **规则引擎层 (`src/engine/core.ts`)**：
  在统计 `unmatchedRecords` 时，凡带有 `is_rejected === true` 或 `property_key === 'unrecognized_rejected_item'` 的项，自动转化为一条 `status: 'FAIL'`、`requirement_level: 'MANDATORY'` 的 `RuleEvaluationItemResult` 推入 `itemResults`；
  - `buildSummary` 自动将 `failCount` 累加，`overallStatus` 自动强制判定为 `'FAIL'`，`hasCriticalFail = true`！
- **工作台展示层 (`src/components/WaterfallWorkbench.tsx`)**：
  在计算 `sysVerdict` 与 `computedIsPass` 时，加入：
  `const hasMatrixFail = complianceMatrixItems.some(i => i.status === 'FAIL');`
  只要矩阵中有任何一项为 FAIL（包括被否决的特种非标项），系统判定 `sysVerdict` 严格为 **`FAIL`**，状态看板红底警示：“`系统判定: FAIL 一票否决 · 包含质检工程师不予认可的特种非标指标`”，流转状态为：“`流转: 系统已拦截待处置`”。

---

## 拟修改文件清单

1. **[MODIFY] [src/types/session.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/types/session.ts)**
   - 显式分离并重构字段命名：
     - `humanVerdict` / `humanVerdictSummary`: 批次级人工终审；
     - `hitlFieldCorrection`: 字段级 HITL 裁定快照；
2. **[MODIFY] [src/engine/core.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/core.ts)**
   - 在 `evaluateCertificateAgainstStandard` 与 `evaluateSpecificationSlice` 中，将被人工否决的非标项推入 `itemResults`（`status: 'FAIL'`），驱动 `summary.overall_status` 严格变为 `FAIL`；
3. **[MODIFY] [src/components/WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)**
   - 彻底移除 `handleResolveHitl` 中的 `humanVerdict: 'PASS'` 越权赋值；
   - 更新批次状态更新，使用 `hitlFieldCorrection` 变量名；
   - 在计算 `computedIsPass` 和 `sysVerdict` 时联动矩阵每一项的 `status === 'FAIL'`，杜绝漏洞；
4. **[MODIFY] [tests/e2e/four-tier-scenarios.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/e2e/four-tier-scenarios.test.ts)**
   - 扩展 Case 4 测试用例：
     - 测试分支 1：协议特约放行 ➔ 恢复后系统 PASS，但批次 `humanVerdict` 严格为 `null`，非标项为 PASS；
     - 测试分支 2：非标缺项否决 ➔ 恢复后系统直接 FAIL，`summary.overall_status === 'FAIL'`，非标项为 FAIL，批次 `humanVerdict` 严格为 `null`。

---

## 验证计划

### 自动化测试
1. `pnpm exec tsc --noEmit`：保证 strict 模式 0 错误；
2. `pnpm test tests/e2e/four-tier-scenarios.test.ts`：验证放行与否决双分支的系统判定与批次终审解耦；
3. `pnpm test tests/normalizer/dynamic-alias-learning.test.ts`：保证别名学习不受影响。

### 手动核验标准（提供给用户）
1. 装载 Case 4，在抽屉中选【认可为供需协议特约合格项 (放行 PASS)】：
   - 矩阵中显示 `Shear Toughness K1C`，`✓ PASS`；
   - 左侧系统判定为“PASS 全项合规”，流转为“流转: 待质检工程师终审核签”；
   - 右侧【人工复核:】为灰底【未复核】，按钮【审批通过】未被自动选中；
   - 用户手动点击【审批通过】后，才变为绿底【✓ APPROVE】和“流转: 人机双重核准放行”。
2. 装载 Case 4，在抽屉中选【不予认可 / 判定无效 (缺项否决 FAIL)】：
   - 矩阵中显示 `Shear Toughness K1C`，`✗ FAIL`（特种非标否决）；
   - 左侧系统判定为“FAIL 一票否决”，流转为“流转: 系统已拦截待处置”；
   - 右侧【人工复核:】为灰底【未复核】，绝不出现“审批通过”或“人机双重核准放行”。
