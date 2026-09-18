# 步骤 2 界面全宽铺满、6:4 视窗比例与文档等比容器实施方案

针对用户在步骤 2（数据核对与源文档对照）提出的体验升级需求，本文档拟定将内容两侧的定宽限制彻底去除以利用全屏幕，将原件预览与结构化提取的宽度比校准为 **6:4**，并使原件预览视窗容器与文档原生宽高比保持一致。

---

## 用户意图与已对齐共识

根据 `/grill-me` 互动澄清，已达成以下共识：
1. **全屏铺满与内边距**：移除外层 `max-w-[1440px]` 和 `mx-auto`，保留 `px-4 sm:px-6 py-4` 舒适安全内边距，内容横向自适应撑满整个视口，不贴死窗口边缘；
2. **视窗比例 6:4**：左侧原件预览视窗占比 **60%**，右侧结构化提取核对视窗占比 **40%**；
3. **等比容器与滚动模式**：保持全屏高度不溢出（`h-full overflow-hidden`），左右视窗各自独立滚动。左侧预览视窗内部通过当前页的实际切图宽高比（`currentDocPage` 对应的 `pageAspectRatios`，默认 A4 比例）使卡片视窗轮廓与文档物理纸张完全同比例契合呈现；
4. **BBox 联动与缩放保真**：现有的定位聚焦、鼠标拖拽平移、放大镜以及字段双向悬浮联动完全无损兼容。

---

## 拟修改文件

### 1. [Step2DataVerificationPanel.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/steps/Step2DataVerificationPanel.tsx)

#### 改动要点：
- **容器全宽**：
  - 将外层 `<div className="max-w-[1440px] mx-auto w-full h-full flex flex-col space-y-4 min-h-0">` 调整为 `<div className="w-full h-full flex flex-col space-y-4 min-h-0">`，最外层 `section` 调整为 `px-4 sm:px-6 py-4`；
- **6:4 分栏权重**：
  - 将分栏网格从 `lg:grid-cols-12`（原先左 5 右 7）重构为 `lg:grid-cols-10`：
    - 左侧原件预览视窗：`lg:col-span-6`（60% 宽度）；
    - 右侧提取核对视窗：`lg:col-span-4`（40% 宽度）；
- **原件预览视窗容器等比适配**：
  - 动态获取当前活动页真实比例：
    ```typescript
    const currentRatio = pageAspectRatios[currentDocPage] || 0.7071; // 默认标准 A4 竖版
    ```
  - 将左侧预览容器的内容展示区配置为基于 `currentRatio` 的等比自适应框架（通过 `aspect-ratio` 与 `max-w-full max-h-full` 约束），保证视窗容器轮廓与文档纸张纵横比高度一致，内部承载切图缩放与平移。

---

## 验证计划

### 1. 自动化测试与工程门禁
- 运行 TypeScript 类型检查：`pnpm exec tsc --noEmit`；
- 运行代码纯洁度审计：`pnpm audit:hygiene`；
- 运行全量单元测试：`pnpm test`（确保 85 个测试套件 530 项用例全部通过，重点包含 `tests/unit/workbench-step2-panel.test.ts`）。

### 2. 界面视觉与响应式验证
- 验证大屏视口下两侧无死黑大留白，左右视窗按照 60% : 40% 分割；
- 验证原件视窗在加载竖版（A4 0.707）或横版（1.414）质保证书时，容器比例随文档等比自适应；
- 验证 OCR BBox 高亮框、拖拽平移、缩放（50%~300%）在新的 6:4 分辨率下坐标完全吻合。
