# 支持执行标准自由清空至 0 部与缺少声明标准统一空状态方案

## 背景与目标

根据用户的实测反馈与方案讨论：
1. **不对称与强行劫持缺陷**：当前 `handleToggleStandard` 存在硬编码回退到 `dynamicStandardsCatalog[0]` 的逻辑，导致取消 NB/T 时被强制劫持为 GB/T，而取消 GB/T 时不响应；同时 `resolveStandardIds` 在标准为空时擅自回退为 `catalog[0]`，剥夺了用户清空标准的权利；
2. **统一空状态规范（方案 2）**：彻底放开清空限制，允许 `selectedStandardIds` 变为 `[]`（0 部已选）；当质保书原件本身缺少声明标准时，自然落入该同一路径；
3. **界面与交互一致性**：表格中央统一展示「尚未选择执行标准，请在上方选择至少一部标准以开始合规比对」空状态，提供一键打开选择器按钮，核验按钮合理置灰，点击重置忠实恢复原件基准。

---

## 拟定修改方案

### 1. 移除擅自默认填充标准逻辑 (`src/components/workbench/hooks/useBatchStreamAuditor.ts`)
#### [MODIFY] [useBatchStreamAuditor.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/hooks/useBatchStreamAuditor.ts)
- 在 `resolveStandardIds(activeStandard, catalog)` 中：
  - 彻底删除末尾的 `const defaultStdId = catalog[0]?.id; return defaultStdId ? [defaultStdId] : [];`；
  - 当 `activeStandard` 为空串、`UNKNOWN` 或未提供时，直接返回 `[]`；
- 在 `evaluateBatches` 中增加防空守卫：
  - 若 `stdIds.length === 0`，不发起核验网络请求，防止向后端发送无意义的空标准任务。

### 2. 重构标准切换取消逻辑 (`src/components/WaterfallWorkbench.tsx`)
#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 在 `handleToggleStandard` 中：
  - 彻底删除 `if (selectedStandardIds.length <= 1)` 下强行切换为 `dynamicStandardsCatalog[0]` 的逻辑；
  - 无论当前剩余几部标准，点击已选标准一律从已选列表中过滤移除，允许 `newSelected = []`；
  - 当 `newSelected` 为空时，当前批次 `overrideStandard` 设置为 `""`（空串标记已清空），清空 `auditReport` 并将 `verdict` 重置为 `UNAUDITED`；
- 在自动核验 `useEffect` 中：
  - 增加对 `selectedStandardIds.length === 0` 的守卫，在未选标准时不自动发起核验。

### 3. 表格与选择器空状态渲染加固 (`src/components/workbench/steps/Step3ComplianceEvaluationPanel.tsx`)
#### [MODIFY] [Step3ComplianceEvaluationPanel.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/steps/Step3ComplianceEvaluationPanel.tsx)
- 执行标准选择器：
  - 当 `selectedStandardIds.length === 0` 时，外层 Chip 区域展示占位文本：`请选择执行标准`；
  - 徽章显示：`已选 0 部`；
- 顶部常驻操作栏：
  - 「开始核验」按钮：当 `selectedStandardIds.length === 0` 时设置 `disabled`，title 提示 `请先选择至少一部执行标准`；
- 比对矩阵表格中央空状态：
  - 当 `selectedStandardIds.length === 0` 时，优先渲染通用引导卡片：
    - 主标题：`尚未选择执行标准`；
    - 说明文案：`请在上方选择至少一部标准以开始合规比对`；
    - 操作按钮：`选择执行标准`（点击自动展开下拉菜单）；
- 原件参数卡片：
  - 质保书声明标准若未声明显示默认的 `--`。

---

## 验证计划

### 1. 自动化测试与工程门禁
- 运行 `pnpm test`，确保现有 86 套件 534 项单测保持 100% 绿灯；
- 运行 `pnpm exec tsc --noEmit` 0 错误；
- 运行 `pnpm audit:hygiene` 验证通过。

### 2. 交互场景手动验证
- **场景 1（GB/T 与 NB/T 取消对称性）**：
  - 单选 NB/T 47019.5，点击取消，变为 0 部，表格进入「尚未选择执行标准」空状态，不再自动跳到 GB/T；
  - 单选 GB/T 13296，点击取消，变为 0 部，表格进入「尚未选择执行标准」空状态，行为完全对称。
- **场景 2（原件缺标准场景）**：
  - 缺少声明标准的质保书进入步骤 3 时，默认已选 0 部，表格展示「尚未选择执行标准」，点击下拉框选择标准后正常触发核验。
- **场景 3（重置行为）**：
  - 清空标准后点击「重置」，能正确恢复至质保书原件基准。
