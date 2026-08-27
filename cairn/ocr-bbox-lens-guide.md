---
type: project_topic
status: active
summary: "工业源文档 OCR 视觉 BBox 标注联动、1000ms 防晕眩延迟聚焦放大、250ms 极速复原，与单实线高透光零遮挡的工程交互实践指南。"
tags:
  - ocr-bbox
  - canvas-scale
  - visual-inspection
  - debounce-lens
contains:
  - pattern
  - pitfall
  - standard
created: "2026-08-27"
updated: "2026-08-27"
related:
  - cairn/architecture.md
  - cairn/viewport-scroll-isolation.md
authoring_mode: ai_generated
---

# 工业源文档视觉 BBox 标注联动与防晕聚光灯工程规范

## 1. 背景与高保真质检挑战

在工业物资合规核验中，质检员需要对照质保证书原件核实印章、手写修改迹、关键公差数值与微量元素含量。

### 关键挑战与踩坑回顾

1. **高频抽搐与视觉晕眩**：
   - 质检员在右侧表格快速滑动浏览多行数据时，如果源文档视窗随鼠标每次经过即时缩放，会造成毁灭性的视觉眩晕。
2. **高亮边框视觉降噪与遮挡**：
   - 采用带有 `ring-offset` 的 Tailwind 边框样式时，会在外侧生成 1px 白色环隙，视觉上形成厚重的“双实线”；
   - 悬浮在单元格上方的蓝色 Tooltip（如 `-top-7`）会直接盖死上一行关键表头（如延伸率标准值 `≥40`）或相邻批次行；
   - 过浓的背景色填充（如 `bg-primary/25`）会严重降低底层黑色宋体或印章字迹的对比度。
3. **坐标系与切图页边距陷阱**：
   - 依赖反滤波解压扫描得到的原始物理像素，若切图渲染时未考虑容器的实际宽高比或页边距，重新全局对齐可能导致 Y 轴整体上浮（如出现整体偏高 1 行的回归缺陷）；
   - 必须以真实渲染基准为锚点，优先保护已验证的垂直行基准，仅在跨列穿透时做最小局部微调。

---

## 2. 核心架构与工程实现规范

### 规范 1：防晕眩 1000ms 防抖与 250ms 即时缩回复原调度
- **1 秒延迟防抖**：在 `handleFieldHover` 与 `scrollToRightField` 中统一注入 `setTimeout(..., 1000)`：
  ```typescript
  // 立即取消前序计时器
  if (magnifyTimerRef.current) {
    clearTimeout(magnifyTimerRef.current);
    magnifyTimerRef.current = null;
  }
  setHighlightedFieldId(fieldId);

  if (fieldId) {
    // 鼠标在同一字段稳定停顿满 1 秒后才激活 200% 聚光灯放大
    magnifyTimerRef.current = setTimeout(() => {
      setMagnifiedFieldId(fieldId);
    }, 1000);
  } else {
    // 鼠标离开立即撤销，触发 250ms 极速平滑缩回
    setMagnifiedFieldId(null);
  }
  ```
- **解耦全局基准**：自动放大仅作为临时聚光灯效果，不篡改右上角全局手动缩放基准值（`- 100% +`），复原时无缝保持原有比例。

### 规范 2：原位整页平滑缩放（Canvas Scale）算法
- 摒弃改动 DOM 真实宽高的 Reflow 重排做法，使用 GPU 硬件加速的 CSS 合成层：
  ```tsx
  style={{
    width: `${460 * (zoomLevel / 100)}px`,
    aspectRatio: '1 / 1.414',
    transform: isPageMagnified ? 'scale(2)' : 'scale(1)',
    transformOrigin: `${originX}% ${originY}%`,
    transition: 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 250ms ease-out',
    zIndex: isPageMagnified ? 30 : 1,
  }}
  ```
- 缩放中心 `(originX, originY)` 严格取目标 BBox 的几何中心 `(box.x + box.w/2, box.y + box.h/2)`，使被观察项原地向四周扩展，视线焦点丝毫无需位移。

### 规范 3：单实线、高透光与零遮挡视觉规范
- **线型规范**：
  - 弃用 `ring-2 ring-offset-1`，使用纯单实线 `border-2 border-primary`（未高亮时为 `border border-dashed border-primary/20`）；
  - 背景色采用高透光的 `bg-primary/10`（90% 透光），底层原件字迹与表格细线 100% 清晰可辨。
- **零遮挡标签规范**：
  - 彻底去除覆盖在单元格上方的浮动浮层（避免遮挡上一行表头）；
  - 统一在 PDF 页面左上角空白页边距处常驻呈现状态胶囊：
    ```tsx
    {(isPageMagnified || isHighlighted) && (
      <div className="absolute top-2 left-2 px-2.5 py-1 bg-primary/95 text-on-primary font-mono text-[11px] font-bold rounded backdrop-blur-xs z-30 pointer-events-none shadow-md flex items-center gap-1.5 animate-fade-in max-w-[65%] truncate">
        <span className="material-symbols-outlined text-xs">
          {isPageMagnified ? 'zoom_in' : 'filter_center_focus'}
        </span>
        <span className="truncate">
          {isPageMagnified ? '聚焦放大 200%' : '已定位'}: {highlightedBox?.label}
        </span>
      </div>
    )}
    ```
