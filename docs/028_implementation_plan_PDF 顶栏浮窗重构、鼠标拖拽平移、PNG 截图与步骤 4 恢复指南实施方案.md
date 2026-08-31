# PDF 顶栏浮窗重构、鼠标拖拽平移、PNG 截图与步骤 4 恢复指南实施方案

本方案解决 4 项具体优化需求：
1. 将 PDF 预览内部的放大状态浮窗重构至**上方顶栏中间**，解决放大后顶格无法点击还原的问题；
2. 为 PDF 视窗增加**鼠标左键按住拖拽平移 (Drag-to-pan)** 浏览支持；
3. 引入并使用 `html2canvas` 解决“保存截图”存为 SVG 的安全限制问题，生成真正的高清 `.png` 文件；
4. 编制 **步骤 4 重启恢复指南** 知识文档，说明步骤 4 现有代码保留情况与后续一键启用步骤。

---

## User Review Required

> [!IMPORTANT]
> - **依赖安装授权**：经过确认，将执行 `pnpm add html2canvas` 与 `pnpm add -D @types/html2canvas`，以彻底规避浏览器的 Canvas foreignObject 跨域污染限制，生成高质量标准 PNG 截图。
> - **PDF 顶栏胶囊**：原页面内的蓝色浮窗将完全移至 PDF 顶部导航栏居中位置，样式与颜色保持一致，放大时常驻顶栏，绝不被页面缩放影响或截断。
> - **拖拽平移体验**：视窗内按住鼠标左键即可自由平移拖拽，光标为 `grab` / `grabbing`，微小点击正常触发 BBox 联动。

---

## Proposed Changes

### 1. 依赖管理

- 运行 `pnpm add html2canvas` 与 `pnpm add -D @types/html2canvas`。

---

### 2. 前端工作台组件

#### [MODIFY] [WaterfallWorkbench.tsx](file:///Users/shiromaple/Github/NormScale/src/components/WaterfallWorkbench.tsx)

1. **PDF 顶栏布局重构与居中浮窗胶囊**：
   - 在 PDF 工具栏 `div`（包含标题与缩放控件）正中间插入居中定位徽标胶囊：
     ```tsx
     {/* 居中常驻放大与定位提示徽章（独立于页面缩放，绝不遮挡且永远可点击） */}
     {(isPageMagnified || highlightedFieldId) && (
       <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary text-on-primary text-[11px] font-bold rounded-lg shadow-sm animate-fade-in truncate max-w-[320px]">
         <span className="material-symbols-outlined text-xs shrink-0">
           {isPageMagnified ? 'zoom_in' : 'filter_center_focus'}
         </span>
         <span className="truncate">
           {isPageMagnified ? '聚焦放大 200%' : '已定位'}: {activeFieldLabel}
         </span>
         {isPageMagnified && (
           <button
             type="button"
             onClick={handleResetMagnify}
             className="ml-1 px-1.5 py-0.5 rounded bg-white/20 hover:bg-white/30 text-white text-[10px] font-normal transition-colors cursor-pointer shrink-0"
             title="按 ESC 键亦可快速退出放大"
           >
             退出 (ESC)
           </button>
         )}
       </div>
     )}
     ```
   - 彻底移除在 `samplePages.map` 页面内部的 `absolute top-2 left-2` 浮动徽标。

2. **PDF 视窗鼠标拖拽平移 (Drag-to-pan)**：
   - 维护 `isDragging`, `dragStartX`, `dragStartY`, `scrollStartX`, `scrollStartY` 等 Ref 状态；
   - 在 `pdfScrollContainerRef` 上绑定 `onMouseDown`, `onMouseMove`, `onMouseUp`, `onMouseLeave`；
   - 增加样式 `cursor-grab`（按住拖拽时为 `cursor-grabbing`）和 `select-none`。

3. **升级 `handleSaveStep3Screenshot` 为 `html2canvas` 纯真 PNG 输出**：
   - 导入 `html2canvas from 'html2canvas'`；
   - 调用 `html2canvas(element, { scale: 2, useCORS: true, backgroundColor: isDark ? '#141218' : '#ffffff' })`；
   - 导出为 `NormScale_合规比对结果_${currentBatch.batchNo}_${dateStr}.png` 并下载；
   - 提示导出成功 Toast。

---

### 3. 文档沉淀与 Cairn 知识库

#### [NEW] [cairn/step4-reactivation-guide.md](file:///Users/shiromaple/Github/NormScale/cairn/step4-reactivation-guide.md)
- 详尽记录步骤 4（检验报告生成与归档）的代码保留现状、视图结构、涉及的 state 与 footer 恢复改动清单，便于后续随时重新接入。

#### [MODIFY] [cairn/LOG.md](file:///Users/shiromaple/Github/NormScale/cairn/LOG.md)
- 记录本次改动日志。

---

## Verification Plan

### Automated Tests
- 运行 TypeScript 类型检查：
  ```bash
  pnpm typecheck
  ```
  确认无任何类型报错。

### Manual Verification
1. **PDF 顶栏浮窗测试**：
   - 悬浮某一字段或 BBox 放大 200%，观察居中蓝色胶囊是否稳定出现在顶部工具栏中间；
   - 将滚动条向上滚动到最顶端，验证【退出 (ESC)】按钮依然完全可见、完全可点击，点击或按 ESC 即刻恢复；
2. **鼠标拖拽平移测试**：
   - 在 PDF 预览区域按住鼠标左键任意拖动，验证视窗顺畅平移；
   - 单击 BBox 验证仍能正常选中高亮；
3. **PNG 截图测试**：
   - 在步骤 3 点击【保存截图】，验证下载的文件为真正的高清 `.png` 图片（而不是 `.svg`），且图片能正常打开、内容完整清晰；
4. **文档检查**：
   - 检查 `cairn/step4-reactivation-guide.md` 是否完整记录步骤 4 恢复说明。
