---
type: project_topic
status: active
summary: "复杂分栏核验工作台视口隔离、单侧定向滚动调度器设计，与 CSS overflow 容器规则导致的下拉菜单截断及内部滚动条规避模式。"
tags:
  - viewport-isolation
  - dual-scrollbar
  - directional-scroll
  - css-overflow
contains:
  - pattern
  - pitfall
created: "2026-08-27"
updated: "2026-08-27"
related:
  - cairn/architecture.md
authoring_mode: ai_generated
---

# 复杂分栏核验工作台视口隔离与定向滚动设计模式

## 1. 业务场景与交互困境

在工业质保书核验的 Step 2（提取数据核对）中，质检员需要同时比对左侧原始 PDF 切图（多页纵向平铺）与右侧 20+ 个结构化指标（基础元数据卡片 + 9 类检验项大表）。

### 历史交互缺陷与踩坑记录

1. **全局页面剧烈上下位移（冒泡抖动）**：
   - *现象*：鼠标滑过右侧输入框时，整个浏览器页面上下乱窜，导致检验员眩晕甚至点错；
   - *根因*：使用 `element.scrollIntoView()` 会沿着 DOM 树向所有父级容器冒泡触发滚动，强行卷动外层主页面。
2. **整页滚动条与内部滚动条重叠**：
   - *现象*：外层页面有滚动条，右侧表格又有滚动条，出现“滚动条套娃”；
   - *根因*：外层布局高度未锁定（缺少 `overflow-hidden h-full`），导致滚动容器嵌套未解耦。
3. **下拉菜单被自身容器剪裁并出现横向滚动条**：
   - *现象*：点击批次选择器卡片中的下拉菜单时，菜单被父容器截断在卡片内部，卡片右侧出现竖向滚动条；
   - *根因（W3C 规范级陷阱）*：根据 W3C CSS 规范，当容器显式配置 `overflow-x: auto` 时，浏览器的 `overflow-y` 必须被隐式计算为 `auto`（不可为 `visible`）。当子元素高度超出时，强制生成内部滚动条。

---

## 2. 核心解决方案与架构模式

### 模式 1：视口双全高容器解耦（Viewport Lock）
- 将 Step 2 外层 `<section>` 声明为：`overflow-hidden flex flex-col h-full`；
- 顶部统一上下文条 [`BatchContextBar`](file:///Users/shiromaple/Github/NormScale/src/components/BatchContextBar.tsx) 挂载 `shrink-0`，固定置顶；
- 左右两栏（左 45% PDF 原件预览、右 55% 提取数据核对）分别分配全高独立的纵向滚动条：
  ```tsx
  {/* 左栏 */}
  <div className="w-[45%] h-full flex flex-col min-h-0">
    <div ref={pdfScrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar ...">
  </div>
  {/* 右栏 */}
  <div className="w-[55%] h-full flex flex-col min-h-0">
    <div ref={rightScrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar ...">
  </div>
  ```

### 模式 2：双向单侧定向滚动调度器（Isolated Directional Scroll）
彻底弃用 `scrollIntoView()`，使用受控的 `scrollTo` 精确计算单侧视口偏移：

1. **悬浮右侧字段 $\to$ 仅单向滚动左侧 PDF**：
   ```typescript
   const scrollToLeftBBox = (fieldId: string | null) => {
     setHighlightedFieldId(fieldId);
     if (!fieldId) return;
     const container = pdfScrollContainerRef.current;
     const targetElem = document.getElementById(`bbox-${box.id}`);
     if (container && targetElem) {
       const containerRect = container.getBoundingClientRect();
       const targetRect = targetElem.getBoundingClientRect();
       const targetTopInContainer = targetRect.top - containerRect.top + container.scrollTop;
       const targetScrollTop = targetTopInContainer - (container.clientHeight / 2) + (targetRect.height / 2);
       container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
     }
   };
   ```
2. **悬浮左侧 BBox $\to$ 仅单向滚动右侧表格**：
   - 增加**视口可视缓冲判定**：若目标元素已处于右侧容器可视区内（上下留 40px 缓冲），则直接高亮，**不触发重复跳跃**。

### 模式 3：选择器溢出穿透与堆叠上下文策略
- 解决下拉菜单被剪裁：
  - 卡片外层移除 `overflow-x-auto`，显式声明 `overflow-visible relative z-30`；
  - 内部单行排列依靠 `shrink-0` 紧凑尺寸与文本 `truncate`，彻底杜绝隐式 `overflow-y: auto` 的触发。
