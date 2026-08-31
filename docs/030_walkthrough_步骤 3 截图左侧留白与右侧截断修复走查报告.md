# 步骤 3 截图左侧留白与右侧截断修复走查报告

## 专项优化明细

### 1. 原因剖析
- **html2canvas 底层缺陷**：此前采用的 `html2canvas` 依赖纯 JavaScript 重新模拟解析 CSS 并使用 Canvas 2D 绘图，在遇到现代 CSS Grid、Flex 间距与复合 Tailwind 工具类时频发字体基线偏移、多行文本挤压重叠等问题；
- **SVG 转换时的 `mx-auto` 与父级 Padding 偏移**：
  - 升级为 `html-to-image` 后，目标元素 `step-3-workbench-panel` 包含 `max-w-[1440px] mx-auto w-full`，其外层 `<section>` 带有 `p-6`（24px 内边距）；
  - `html-to-image` 将 DOM 节点转换为 SVG `<foreignObject>` 时，SVG 视口大小被设置为目标元素的宽度，但克隆节点依然携带了 `margin-left: auto`（计算出的水平偏移约 24px）；
  - 导致渲染起点向右平移了 24px，左侧出现了 24px 的空白区域，而右侧边界（包括右上角标签、“审批通过”按钮与表格右侧边框）相应被裁切截断了 24px。

### 2. 优化落地
- **全面切换至 `html-to-image` 原生渲染**：直接调用浏览器底层 C++ 渲染管线（Blink / WebKit），保证文字基线几何居中、多行文本与颜色无任何形变；
- **显式规格与样式覆盖**：
  - 在调用 `toPng` 时显式提取并传入 `width: targetWidth, height: targetHeight`；
  - 在 `style` 选项中配置：
    ```ts
    style: {
      margin: '0',
      transform: 'none',
      left: '0',
      top: '0',
      maxWidth: 'none',
      width: `${targetWidth}px`,
      height: `${targetHeight}px`,
    }
    ```
  - 彻底抹平了 `mx-auto` 的平移偏差，使克隆 DOM 从 `x=0` 像素起始点严格满幅渲染至 `x=targetWidth`；
- **交付效果**：
  1. **左侧零留白**：左边缘与内容紧密对齐；
  2. **右侧零截断**：“当前执行标准与牌号基准”卡片、所有右侧动作按钮（“拒收”、“审批通过”）以及表格全部列内容**100% 完整呈现**；
  3. **文字零偏移与无重叠**：完全保留了浏览器底层原生渲染的排版质感与 2x 视网膜高清度。

---

## 验证结果

- **TypeScript 类型检查**：`pnpm typecheck` (`tsc --noEmit`) **0 错误**通过。
- **本地服务状态**：`http://localhost:3000` 正常提供服务（HTTP 200）。
- **实测产物验证**：实测生成的 PNG 截图全宽满幅呈现，排版工整无瑕疵。
