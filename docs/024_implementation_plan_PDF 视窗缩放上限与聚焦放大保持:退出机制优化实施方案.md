# PDF 视窗缩放上限与聚焦放大保持/退出机制优化实施方案

解决质保书 PDF 视窗在缩放时无法进一步放大（受限于 175% 硬编码上限及 maxWidth:100%），以及优化 hover 自动放大后的保持体验（取消移开自动回缩，支持鼠标移到右侧表格直接录入，提供清晰的手动退出途径）。

## User Review Required

> [!IMPORTANT]
> - **放大保持行为**：鼠标从字段移开后将**持续保持 200% 聚焦放大状态**，不再自动弹回 100%。质检员可从容将鼠标移至右侧单元格直接修改。
> - **退出放大途径**：
>   1. 悬浮徽标增加显式点击按钮：`退出放大 (ESC)`；
>   2. 监听全局键盘 `Escape` 键，按下即退回常规比例；
>   3. 聚焦到新字段时，平滑转移到新的放大坐标。
> - **全局缩放放宽**：缩放范围由 `75% ~ 175%` 调整为 `50% ~ 300%`，步长为 `25%`，点击百分比文字一键恢复 `100%`。

---

## Proposed Changes

### 前端工作台组件

#### [MODIFY] [WaterfallWorkbench.tsx](file:///Users/shiromaple/Github/NormScale/src/components/WaterfallWorkbench.tsx)

1. **红框内缩放控制按钮与样式解耦**：
   - 将缩放上下限从 `Math.max(75, prev - 15)` 和 `Math.min(175, prev + 15)` 调整为：
     - 下限：`50%`
     - 上限：`300%`
     - 步长：`25%`
   - 将缩放中间的百分比数字 `<span className="px-1 font-bold">{zoomLevel}%</span>` 赋予点击重置交互：点击直接一键将 `zoomLevel` 恢复为 `100%`，并添加 `title="点击还原为 100%"` 提示；
   - 移除页面容器样式中的 `maxWidth: '100%'`（原先强制限制了当缩放比例大于视口宽度时的实际渲染宽度），并保留 `overflow-x-auto`，使得放大到 200%、300% 时真实生效并支持横向平滑滚动查验。

2. **自动放大保持与退出交互重构**：
   - 修改 `scrollToLeftBBox(fieldId)` 与 `scrollToRightField(fieldId)`：
     - 当 `fieldId === null`（鼠标移出）时，**不再执行 `setMagnifiedFieldId(null)`**，保留当前的 `magnifiedFieldId`，使放大状态持续锁定；
     - 当悬浮到新的非空 `fieldId` 时，清除旧定时器并启动新字段的聚焦与平滑转移；
   - 增加退出放大与还原的统一方法：`handleResetMagnify = () => setMagnifiedFieldId(null)`；
   - 增加键盘事件监听：当按下 `Escape` 且 `magnifiedFieldId` 存在时，触发 `handleResetMagnify()`；
   - 升级左侧 PDF 视窗左上角的放大徽章：
     - 处于放大状态时，右侧增加一个清晰的关闭按钮：
       ```tsx
       <button
         onClick={handleResetMagnify}
         className="ml-2 px-1.5 py-0.5 rounded bg-white/20 hover:bg-white/30 text-white text-[11px] font-normal transition-colors"
       >
         退出放大 (ESC)
       </button>
       ```
     - 质检员可直观点击关闭，亦可直接按键盘 ESC 键退出。

---

## Verification Plan

### Automated Tests
- 运行 TypeScript 严格类型检查：
  ```bash
  pnpm typecheck
  ```
  确认无任何类型报错或变量未定义问题。

### Manual Verification
1. **缩放测试**：
   - 连续点击红框内的 `+` 按钮，验证缩放比例可平滑越过 175%，最高可放大至 300%，且页面真实以高倍率呈现，支持左右滑动；
   - 点击 `-` 按钮，验证可平滑缩小至 50%；
   - 点击中间的百分比数字（如 250%），验证一键瞬间恢复为 100%。
2. **自动放大保持与退出测试**：
   - 在右侧表格某项（如抗拉强度或钛元素）悬浮满 1 秒，观察左侧 PDF 视窗平滑聚焦放大 200%；
   - 将鼠标从该行移开，移向右侧单元格，观察左侧 PDF **依然稳稳保持放大视窗**，不再发生自动回缩跳动；
   - 在右侧单元格中直接键入数值修改，左侧始终保持清晰放大；
   - 按键盘 `ESC` 键，或点击左侧左上角徽标中的【退出放大 (ESC)】，验证平滑恢复 100% 比例；
   - 悬浮到另一个项目（如屈服强度），验证平滑转移至新位置。
