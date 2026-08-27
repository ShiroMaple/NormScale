# PDF 原件视窗高亮停留 1s 自动平滑放大 200% 实施方案

## 1. 需求与交互设计共识

基于用户指令与 `/grill-me` 互动推导，本项目在 Step 2 质保证书解析数据核对工作台中，新增“PDF 源文档高亮智能聚焦放大（Smart Auto-Magnify）”特性：

1. **原位平滑缩放模式（Canvas Scale）**：
   - 针对当前高亮 BBox 所在的 PDF 页面，以该 BBox 几何中心点 `(x + w/2, y + h/2)` 为基准中心（`transform-origin`），使用 CSS `transform: scale(2)` 平滑放大至 200%；
   - 仅作用于左侧 PDF 原件预览视窗内部，全局页面与其他分栏完全静止；
   - 被放大的页面提升层叠上下文（`z-20 shadow-2xl`），带来高保真质检聚光灯体验。
2. **防晕眩 1 秒延时触发机制（1000ms Debounce）**：
   - 无论是从右侧输入框/表格行悬浮触发，还是直接在左侧 PDF 的 BBox 区域悬浮；
   - 仅当鼠标在**同一个字段持续停留 $\ge 1000$ms** 时，才激活 200% 放大；
   - 快速滑过或在 1 秒内移走鼠标，立即取消计时器，绝不触发缩放，彻底杜绝视觉晃动与晕眩。
3. **解除高亮后立即平滑缩回（250ms Transition）**：
   - 鼠标一旦离开（`handleFieldHover(null)`）或切换至其他字段，立即清空放大状态，在 **250ms**（`cubic-bezier(0.16, 1, 0.3, 1)`）内利落平滑缩回原始尺寸。
4. **与全局手动缩放控件解耦**：
   - 右上角手动缩放控件（`- 100% +`）负责全局基准比例（`zoomLevel`）；
   - 自动放大作为独立聚光灯效果，不篡改用户基准值，复原时无缝保持原比例。

---

## 2. 核心架构与代码变更设计

### 核心修改文件：[`src/components/WaterfallWorkbench.tsx`](file:///Users/shiromaple/Github/NormScale/src/components/WaterfallWorkbench.tsx)

#### A. 引入自动放大状态与计时器引用
```typescript
// 当前正式进入 200% 放大的字段 ID
const [magnifiedFieldId, setMagnifiedFieldId] = useState<string | null>(null);

// 1 秒防晕倒计时器 Ref
const magnifyTimerRef = useRef<NodeJS.Timeout | null>(null);
```

#### B. 统一在 `handleFieldHover` 中注入 1000ms 调度机制
```typescript
const handleFieldHover = (fieldId: string | null) => {
  // 1. 先清空上一个未完成的放大倒计时
  if (magnifyTimerRef.current) {
    clearTimeout(magnifyTimerRef.current);
    magnifyTimerRef.current = null;
  }

  // 2. 更新瞬时高亮态与定向滚动
  setHighlightedFieldId(fieldId);
  if (fieldId) {
    scrollToLeftBBox(fieldId);

    // 3. 启动 1000ms 防晕倒计时：持续停顿满 1s 后才激活 200% 放大
    magnifyTimerRef.current = setTimeout(() => {
      setMagnifiedFieldId(fieldId);
    }, 1000);
  } else {
    // 4. 移开后立即撤销放大，触发 250ms 平滑缩回
    setMagnifiedFieldId(null);
  }
};
```

#### C. 在左侧 PDF 视窗页面节点应用动态 Transform
在 `currentDoc.samplePages.map((pageSrc, pageIdx) => { ... })` 渲染循环中：
1. 查找当前页面是否包含当前被正式放大的 `magnifiedFieldId` 对应的 `targetBox`；
2. 若存在且处于放大态：
   - 计算中心点：
     ```typescript
     const originX = targetBox.x + targetBox.w / 2;
     const originY = targetBox.y + targetBox.h / 2;
     ```
   - 动态样式：
     ```typescript
     style={{
       width: `${460 * (zoomLevel / 100)}px`,
       maxWidth: '100%',
       aspectRatio: '1 / 1.414',
       transform: isPageMagnified ? 'scale(2)' : 'scale(1)',
       transformOrigin: isPageMagnified ? `${originX}% ${originY}%` : 'center center',
       transition: 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 250ms ease-out',
       zIndex: isPageMagnified ? 30 : 1,
     }}
     ```
   - 在左侧父级滚动容器 `pdfScrollContainerRef` 上增加 `overflow-x-auto`，确保当页面以边缘为中心放大时，横向也能自由且平滑地浏览。

---

## 3. 验证与验收计划

### 自动化验证
```bash
# 严格类型检查
pnpm typecheck

# 运行全部 23 个测试套件，确保 111 项单测全部通过
pnpm test
```

### 浏览器实机交互验证
1. **短时间滑过测试**：在右侧 4×3 元数据网格和下方化学成分各行快速滑动鼠标，观察左侧 PDF 标注框高亮跟随，但**绝不触发放大**（未满 1s）；
2. **停留 1 秒自动放大测试**：
   - 鼠标停留在“碳含量 (C: 0.018)”上超过 1 秒，左侧 PDF 第 1 页立即以碳含量 BBox 为中心平滑展开放大至 200%；
   - 观察周围文字和数值（0.018 wt%）清晰锐利、居中可辨；
3. **离开立即复原测试**：鼠标移出表格行，页面在 250ms 内自然平滑缩回 100%，无卡顿无跳动；
4. **左侧原件悬浮测试**：鼠标直接悬浮在左侧 PDF 第 1 页的 `原材料炉号 (Heat No.)` 标注框上超过 1 秒，同样精准放大 200%。
