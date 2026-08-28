# 步骤 3 人机协同 (HITL) 侧边抽屉重构与闭环裁决实施方案

根据系统架构原则与用户决策，严格解耦**主界面双轨制终审**（特批放行与人工否决）与**HITL 工作流挂起协同**。本方案聚焦于系统由于前提阻断“无法确定性给出 PASS/FAIL”时的 4 大必要挂起场景，采用 **方案 A（约 500px 侧边抽屉）** 实现无遮挡对照、场景化动态渲染与闭环重算。

---

## User Review Required

> [!IMPORTANT]
> **双轨制与 HITL 的交互分工原则**：
> 1. **特批放行 (Concession)** 与 **人工否决 (Veto)** 继续由主界面横幅的 `✓ APPROVE` 与 `✗ REJECT` 直接完成，**不弹出 HITL 抽屉**；
> 2. **HITL 抽屉仅在系统判定为 `MANUAL_REVIEW / HITL 待质检员裁决` 时触发**（点击紫色【处理】按钮唤起）；
> 3. 抽屉提交后，**参数将直接注入质检引擎并重新触发确定性计算**，系统判定即时由 `HITL` 刷新为 `PASS` 或 `FAIL`。

---

## Open Questions

目前方案已根据用户反馈收敛，无阻断性开放问题。

---

## Proposed Changes

### 数据模型与契约层 (Workflow & State Contract)

#### [MODIFY] [state.interface.ts](file:///Users/shiromaple/Github/NormScale/src/workflow/state.interface.ts)
- 扩展 `HitlInterruptContext.reason` 枚举：
  - `'UNKNOWN_GRADE'`：材料牌号语义消歧
  - `'ALTERNATIVE_CLAUSE'`：标准等效替代条款确权（如涡流替代水压）
  - `'MULTI_STANDARD_CONFLICT'`：多标准互斥条款仲裁
  - `'QUALITATIVE_AMBIGUITY'`：定性文字条款语义争议
  - `'MANUAL_REQUEST'`：通用人工介入
- 在 `HitlInterruptContext` 补充结构化上下文数据字段（候选牌号列表、替代条款条款号与缺失/替代项描述、冲突标准对比数据等）；
- 扩展 `HumanCorrectionInput` 支持多场景裁决结果载荷（`corrected_grade`、`accepted_alternative_clause`、`arbitrated_standard_id`、`qualitative_verdict`、`waiver_notes`、`inspector_id`）。

---

### 组件与交互层 (UI & Components)

#### [MODIFY] [HitlDrawer.tsx](file:///Users/shiromaple/Github/NormScale/src/components/HitlDrawer.tsx)
- 重构为 **500px 工业级侧边抽屉**（方案 A），左边距无遮挡，方便对照主界面全景比对矩阵；
- 顶部看板：展示当前挂起批次号、挂起原因 Badge、阶段说明与快捷关闭；
- **动态场景渲染器 (Dynamic Scenario Form)**：
  1. **场景 1（牌号消歧）**：候选国家标准钢级单选卡片（含成分匹配度百分比、推荐标签与标准号），保留手动输入其他牌号；
  2. **场景 2（替代条款确权）**：展示标准替代依据（如 GB/T 13296 第 7.5 条）与原件出具情况，提供“【认可替代（转为 PASS）】 / 【不予认可（按缺项 FAIL 处理）】”二元裁决单选/开关；
  3. **场景 3（多标准冲突仲裁）**：并排展示互斥标准条款，提供主基准标准单选；
  4. **场景 4（定性条款语义争议）**：左右分栏展示质保书原始文字描述 vs 国标条款原文，提供“符合 / 需复验”裁决；
- 审计追溯与签名栏：必填/选填处理依据说明文本域、质检员工号与电子防伪摘要；
- 底部控制栏：“挂起暂不处理（关闭抽屉）”与“确认裁决并恢复流转（主操作，触发回调）”。

#### [MODIFY] [WaterfallWorkbench.tsx](file:///Users/shiromaple/Github/NormScale/src/components/WaterfallWorkbench.tsx)
- 完善横幅上紫色【处理】按钮与 HITL 抽屉的联动：
  - 构造/传递当前批次的特定 `HitlInterruptContext`；
  - 实现本地批次人机裁决状态闭环：当用户在抽屉中点击“确认裁决并恢复流转”后，立即基于质检员提交的修正数据重新计算当前批次；
  - 示例：若用户在场景 2 中认可涡流替代水压，水压项状态更新为 `PASS (替代组生效)`，系统综合判定自动由 `HITL` 刷新为 `PASS`，横幅即刻更新！

#### [MODIFY] [page.tsx](file:///Users/shiromaple/Github/NormScale/src/app/page.tsx)
- 确保 `HitlDrawer` 能够无缝接收来自 `WaterfallWorkbench` 的当前批次上下文及恢复回调。

---

## Verification Plan

### Automated Tests
- 运行代码类型检查与语法门禁：
  ```bash
  pnpm typecheck
  ```
- 验证无新增依赖，保持 `pnpm-lock.yaml` 一致性。

### Manual Verification
1. **场景 1（牌号消歧）演练**：
   - 载入带有非标牌号或切换至挂起批次，点击横幅【处理】按钮；
   - 检查右侧抽屉滑出时，主界面全景比对矩阵依然清晰可见，无视线阻挡；
   - 选中推荐牌号 `S30408` 并点击提交，观察工作台重新绑定标准切片并即时刷新全项比对结果。
2. **场景 2（替代条款确权）演练**：
   - 查看涉及水压缺失但有涡流探伤的挂起批次；
   - 打开抽屉切换“认可替代”/“不予认可”，提交后观察系统判定是否精准由 `HITL` 转变为 `PASS` 或 `FAIL`。
3. **取消与挂起验证**：
   - 打开抽屉后点击“挂起暂不处理”或右上角关闭按钮，确认批次保持挂起状态，横幅【处理】按钮常驻有效。
