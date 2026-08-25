# NormScale 设计系统规范 (Design System)

> **文档定位**：本文件为 NormScale（工业质量证明书智能合规检验系统）的前端视觉与交互设计基准（`DESIGN.md`），用于指导 Google Stitch 的原型生成以及后续 Next.js 15 / Tailwind CSS 的组件实现。

---

## 1. 设计基调与核心定位 (Design Vibe & Identity)

* **产品定位**：企业级 B2B 工业质量合规检验与智能决策系统（Enterprise B2B Industrial Quality Inspection & Compliance Dashboard）。
* **设计基调**：**现代工业严谨感、高信息密度、硬核工程美学、双模自适应**（Modern Industrial Precision / Engineering Grade / Dual-Theme Adaptive）。
* **配色策略**：
  * **默认采用浅色配色（Light Mode - Default）**：以冷白、极浅石板灰（Slate-50/100）为底色，卡片采用纯白与极细中灰边框，搭配高对比度文字与状态胶囊，适合白天高强度质检与文档对照，清新明亮、不易视觉疲劳；
  * **支持一键切换至深暗模式（Dark Mode - Alternative）**：以深暗工业蓝灰（Dark Slate #0B0F17）为底色，半透明发光微边框，适合夜间或工业中控大屏展示；
  * **顶部常驻明暗切换开关（Theme Toggle）**：位于右上角导航栏（太阳 ☀️ / 月亮 🌙 图标快速切换）。
* **核心排版标准**：关键工业参数、化学元素符号、炉批号与动态公式强制使用 Monospace 等宽字体呈现，确保数值纵向严整对齐。

---

## 2. 双模色彩系统与状态语义 (Color Palette & Tokens)

系统使用经过严格无障碍（WCAG AA）对比度校准的工业主题色板：

### 2.1 默认浅色模式色板 (Light Mode - Default)

| 语义层级 | 颜色名称 | 十六进制 (Hex) | Tailwind 类名 | 视觉用途 |
| :--- | :--- | :--- | :--- | :--- |
| **画布底色 (Background)** | Slate Mist Light | `#F8FAFC` | `bg-slate-50` | 整个应用的主背景，极浅冷白灰 |
| **主容器/侧栏 (Surface 1)** | Pure White / Surface | `#FFFFFF` | `bg-white` | 顶部导航、侧边栏、工作区底板 |
| **卡片/面板表面 (Surface 2)** | White Panel | `#FFFFFF` | `bg-white shadow-sm` | 数据卡片、核验矩阵表格面板 |
| **描边/分割线 (Borders)** | Slate Light Border | `#E2E8F0` / `#CBD5E1` | `border-slate-200` | 卡片边框、表格细线，清晰划分区域 |
| **主文本 (Text Primary)** | Deep Charcoal Slate | `#0F172A` | `text-slate-900` | 页面主标题、指标实测关键数字 |
| **次级文本 (Text Secondary)**| Slate Neutral | `#475569` | `text-slate-600` | 表头名称、元数据说明、辅助标签 |
| **弱化文本 (Text Muted)** | Muted Gray | `#94A3B8` | `text-slate-400` | 占位符、次要时间戳、单位符号 |
| **品牌主色 (Primary Accent)**| Precision Steel Blue | `#0284C7` / `#0EA5E9` | `text-sky-600` / `bg-sky-600` | 主操作按钮、选中国标项、交互高亮 |
| **状态：合格 (PASS)** | Emerald Light Pill | 背景 `#ECFDF5` / 文字 `#047857` | `bg-emerald-50 text-emerald-700 border-emerald-200` | 判定合格、数值达标、一票否决未触发 |
| **状态：严重不合格 (FAIL)** | Crimson Light Pill | 背景 `#FEF2F2` / 文字 `#B91C1C` | `bg-red-50 text-red-700 border-red-200` | 判定拒收、数值超标、一票否决阻断 |
| **状态：缺项/警示 (MISSING)**| Amber Light Pill | 背景 `#FFFBEB` / 文字 `#B45309` | `bg-amber-50 text-amber-700 border-amber-200` | 强制项漏检、修约临界预警、格式异常 |
| **状态：人机挂起 (HITL)** | Violet Light Pill | 背景 `#F5F3FF` / 文字 `#6D28D9` | `bg-purple-50 text-purple-700 border-purple-200` | 牌号消歧未中、OCR低置信度、需人工审批 |

---

### 2.2 深暗模式色板 (Dark Mode - Alternative)

| 语义层级 | 颜色名称 | 十六进制 (Hex) | Tailwind 类名 | 视觉用途 |
| :--- | :--- | :--- | :--- | :--- |
| **画布底色 (Background)** | Deep Industrial Slate | `#0B0F17` | `dark:bg-slate-950` | 整个应用的主背景，沉浸式深暗色 |
| **主容器表面 (Surface 1)** | Industrial Slate Navy | `#111827` | `dark:bg-gray-900` | 侧边栏、顶部导航、工作区主容器底色 |
| **卡片/面板表面 (Surface 2)** | Muted Zinc Container | `#1E293B` | `dark:bg-slate-800` | 数据卡片、核验矩阵表格行、面板表面 |
| **描边/分割线 (Borders)** | Slate Dark Border | `#334155` | `dark:border-slate-700` | 卡片边框、表格细线，清晰划分区域 |
| **主文本 (Text Primary)** | Crisp Slate White | `#F8FAFC` | `dark:text-slate-100` | 深色下的高亮标题与关键数据 |
| **次级文本 (Text Secondary)**| Muted Slate | `#94A3B8` | `dark:text-slate-400` | 表头名称、次级字段 |
| **品牌主色 (Primary Accent)**| Electric Sky Blue | `#38BDF8` | `dark:text-sky-400` / `dark:bg-sky-500` | 激活状态图标、OCR 识别框发光外边框 |
| **状态：合格 (PASS)** | Emerald Dark Pill | 背景 `rgba(16,185,129,0.12)` / 文字 `#34D399` | `dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30` | 判定合格 |
| **状态：严重不合格 (FAIL)** | Crimson Dark Pill | 背景 `rgba(239,68,68,0.12)` / 文字 `#F87171` | `dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30` | 判定拒收 |
| **状态：缺项/警示 (MISSING)**| Amber Dark Pill | 背景 `rgba(245,158,11,0.12)` / 文字 `#FBBF24` | `dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30` | 漏检/预警 |
| **状态：人机挂起 (HITL)** | Violet Dark Pill | 背景 `rgba(139,92,246,0.12)` / 文字 `#A78BFA` | `dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/30` | 人工介入 |

---

## 3. 字体与排版层级 (Typography Hierarchy)

* **主界面字体 (UI Sans-Serif)**：`Inter`, `Geist Sans`, 或现代中文字体（`PingFang SC`, `HarmonyOS Sans`, `Microsoft YaHei`）。
* **数据与代码字体 (Data & Code Monospace)**：`JetBrains Mono`, `Geist Mono`, `Roboto Mono`。
  * *应用场景*：化学元素表（C, Si, Mn, P, S）、实测数值（`0.038%`）、炉批号（`H260815A`）、AST 动态公式（`Ti >= 5*(C+N)`）、耗时度量（`4.2ms`）。

### 排版比例规格
* **页面主标题 (Page Hero / H1)**：`24px / 1.5rem`，Semi-Bold (600)，浅色下 `text-slate-900` / 深色下 `dark:text-slate-100`。
* **区块/卡片标题 (Section Title / H2)**：`16px / 1.0rem`，Medium (500)，浅色下 `text-slate-800` / 深色下 `dark:text-slate-200`。
* **正文与表格内容 (Body & Cell)**：`13px / 0.8125rem`，Regular (400)，浅色下 `text-slate-700` / 深色下 `dark:text-slate-300`。
* **辅助说明与元数据 (Caption / Meta)**：`11px / 0.6875rem`，Regular (400)，浅色下 `text-slate-500` / 深色下 `dark:text-slate-400`。
* **大字号决策结论 (Decision Big Text)**：`26px ~ 30px`，Bold (700)，配合红/绿状态高对比度徽章。

---

## 4. 空间、栅格与布局规范 (Layout & Spacing)

### 4.1 核心主界面：宽屏双列并排布局 (Dual-Column 4:6 Grid)
* **左列 (40% 宽度，最小 480px)**：
  * **原件审查区**：高清 PDF/扫描件渲染容器（浅色下为淡灰底衬 `#F1F5F9`，深色下为 `#111827`）。
  * **交互联动**：支持平滑缩放（Zoom 50% ~ 200%）、旋转、翻页。当鼠标在右侧核验表格某一行悬停时，左侧原件上对应的 OCR 识别框（Bounding Box）高亮发光并居中定位。
* **右列 (60% 宽度)**：
  * **智能核验决策中枢**：纵向可滚动的多模块卡片流（综合判定横幅 $\to$ 化学成分表 $\to$ 力学性能与公式 $\to$ 工艺定性条款 $\to$ 毫秒级审计轨迹）。

### 4.2 间距与圆角设计 (Spacing & Radius)
* **圆角规格 (Border Radius)**：
  * 卡片与面板容器：`rounded-lg` (8px)；
  * 状态徽章与小标签：`rounded-md` (4px 或 6px)；
  * 按钮：`rounded-md` (6px)。
* **内边距规范 (Density & Padding)**：
  * 工业级紧凑排版，表格单元格垂直内边距：`py-2` (8px)，水平内边距：`px-3` (12px)；
  * 卡片内边距：`p-4` (16px)。

---

## 5. 核心 UI 组件规范 (Component Specifications)

### 5.1 顶部导航与明暗切换开关 (Theme Toggle Switcher)
* 位于导航栏右上角，呈现为一个平滑药丸形切换按钮或图标按钮：
  * 浅色模式下：显示浅灰底太阳图标 `☀️ 浅色 (Light)`；
  * 点击即时平滑切换为深暗模式 `🌙 深色 (Dark)`。

### 5.2 状态徽章 (Status Badges)
* **PASS (合格)**：
  * *浅色*：`bg-emerald-50 text-emerald-700 border border-emerald-200`，带实心绿点 `● PASS`；
  * *深色*：`dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30`。
* **FAIL (不合格/超标)**：
  * *浅色*：`bg-red-50 text-red-700 border border-red-200`，带红叉 `✕ FAIL (+0.008%)`；
  * *深色*：`dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30`。
* **MISSING (漏检项)**：
  * *浅色*：`bg-amber-50 text-amber-700 border border-amber-200`，带三角警示 `▲ MISSING`；
  * *深色*：`dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30`。
* **HITL PENDING (待人工处理)**：
  * *浅色*：`bg-purple-50 text-purple-700 border border-purple-200`，带呼吸灯图标 `◈ HITL PENDING`；
  * *深色*：`dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/30`。

### 5.3 确定性比对矩阵表格 (Deterministic Matrix Table)
* 浅色模式下采用白底加极浅斑马纹（`odd:bg-slate-50/50`），悬停高亮（`hover:bg-sky-50/60`）；
* 数值超标行（FAIL）整行附加微弱浅红警示底色（浅色下 `bg-red-50/70`，深色下 `dark:bg-red-950/20`），并带有左侧红色 3px 警示指示条；
* 表格包含列：`受检指标 (Key)`、`实测数值 (Actual)`、`执行标准极值 (Standard Limit)`、`GB/T 8170 修约值`、`绝对偏差量 (Delta)`、`合规判定 (Status)`。

### 5.4 人机协同挂起抽屉 (HITL Slide-over Drawer)
* 从屏幕右侧平滑滑出（`width: 480px`，`z-index: 50`）；
* 浅色下为纯白背景（`bg-white shadow-2xl border-l border-slate-200`），深色下为深灰背景（`dark:bg-slate-900 dark:border-slate-700`）；
* 抽屉内部包含结构化表单：未知牌号消歧选择器、原件图片局部裁切比对框、人工数值输入框、特批放行签署开关。
