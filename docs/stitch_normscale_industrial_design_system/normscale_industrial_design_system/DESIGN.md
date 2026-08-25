---
name: NormScale Industrial Design System
colors:
  surface: '#f7f9ff'
  surface-dim: '#d7dae0'
  surface-bright: '#f7f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4fa'
  surface-container: '#ebeef4'
  surface-container-high: '#e5e8ee'
  surface-container-highest: '#dfe3e8'
  on-surface: '#181c20'
  on-surface-variant: '#3f4850'
  inverse-surface: '#2d3135'
  inverse-on-surface: '#eef1f7'
  outline: '#707881'
  outline-variant: '#bfc7d2'
  surface-tint: '#006398'
  primary: '#006194'
  on-primary: '#ffffff'
  primary-container: '#007bb9'
  on-primary-container: '#fdfcff'
  inverse-primary: '#93ccff'
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fc'
  on-secondary-container: '#57657a'
  tertiary: '#894d00'
  on-tertiary: '#ffffff'
  tertiary-container: '#ac6200'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cce5ff'
  primary-fixed-dim: '#93ccff'
  on-primary-fixed: '#001d31'
  on-primary-fixed-variant: '#004b73'
  secondary-fixed: '#d5e3fc'
  secondary-fixed-dim: '#b9c7df'
  on-secondary-fixed: '#0d1c2e'
  on-secondary-fixed-variant: '#3a485b'
  tertiary-fixed: '#ffdcc0'
  tertiary-fixed-dim: '#ffb875'
  on-tertiary-fixed: '#2d1600'
  on-tertiary-fixed-variant: '#6b3b00'
  background: '#f7f9ff'
  on-background: '#181c20'
  surface-variant: '#dfe3e8'
  background-light: '#F8FAFC'
  surface-light: '#FFFFFF'
  border-light: '#E2E8F0'
  text-primary-light: '#0F172A'
  background-dark: '#0B0F17'
  surface-dark: '#1E293B'
  border-dark: '#334155'
  text-primary-dark: '#F8FAFC'
  primary-dark: '#38BDF8'
  status-pass-bg: '#ECFDF5'
  status-pass-text: '#047857'
  status-fail-bg: '#FEF2F2'
  status-fail-text: '#B91C1C'
  status-warning-bg: '#FFFBEB'
  status-warning-text: '#B45309'
  status-hitl-bg: '#F5F3FF'
  status-hitl-text: '#6D28D9'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  data-display:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-padding: 1rem
  gutter: 1rem
  cell-py: 0.5rem
  cell-px: 0.75rem
  stack-gap: 0.5rem
---

# NormScale 工业级设计系统 (NormScale Industrial Design System)

> **文档定位**：本文件为 NormScale（工业质量证明书智能合规检验系统）的前端视觉与交互设计基准（`DESIGN.md`），整合了浅色模式与深色模式的配色方案，用于指导后续开发。

---

## 1. 设计基调与核心定位 (Design Vibe & Identity)

* **产品定位**：企业级 B2B 工业质量合规检验与智能决策系统。
* **设计基调**：**现代工业严谨感、高信息密度、硬核工程美学、双模自适应**。
* **核心排版标准**：关键工业参数、化学元素符号、炉批号与动态公式强制使用 Monospace 等宽字体呈现。

---

## 2. 双模色彩系统 (Dual-Theme Color Palette)

### 2.1 浅色模式 (Light Mode - Default)
*源自：{{DATA:SCREEN:SCREEN_5}}*

| 语义层级 | 颜色名称 | 十六进制 (Hex) | 视觉用途 |
| :--- | :--- | :--- | :--- |
| **画布底色 (Background)** | Slate Mist Light | `#F8FAFC` | 应用主背景，极浅冷白灰 |
| **主容器表面 (Surface)** | Pure White | `#FFFFFF` | 导航栏、侧边栏、卡片底色 |
| **描边/分割线 (Borders)** | Slate Light Border | `#E2E8F0` | 卡片边框、表格细线 |
| **主文本 (Text Primary)** | Deep Charcoal | `#0F172A` | 标题、关键实测数值 |
| **次级文本 (Text Secondary)**| Slate Neutral | `#475569` | 表头名称、辅助说明 |
| **品牌主色 (Primary)** | Precision Steel Blue | `#0284C7` | 主操作按钮、交互高亮 |

### 2.2 深色模式 (Dark Mode)
*源自：{{DATA:SCREEN:SCREEN_3}}*

| 语义层级 | 颜色名称 | 十六进制 (Hex) | 视觉用途 |
| :--- | :--- | :--- | :--- |
| **画布底色 (Background)** | Deep Industrial Slate | `#0B0F17` | 应用主背景，沉浸式深暗色 |
| **主容器表面 (Surface)** | Muted Zinc | `#1E293B` | 深色下的卡片与容器表面 |
| **描边/分割线 (Borders)** | Slate Dark Border | `#334155` | 深色卡片边框 |
| **主文本 (Text Primary)** | Crisp Slate White | `#F8FAFC` | 深色下的高亮标题与关键数据 |
| **品牌主色 (Primary)** | Electric Sky Blue | `#38BDF8` | 激活状态图标、OCR 识别框发光边框 |

---

## 3. 状态语义颜色 (Status Semantic Colors)

| 状态 | 浅色模式 (Light) | 深色模式 (Dark) | 描述 |
| :--- | :--- | :--- | :--- |
| **合格 (PASS)** | 背景 `#ECFDF5` / 文字 `#047857` | 背景 `rgba(16,185,129,0.1)` / 文字 `#34D399` | 判定合格 |
| **不合格 (FAIL)** | 背景 `#FEF2F2` / 文字 `#B91C1C` | 背景 `rgba(239,68,68,0.1)` / 文字 `#F87171` | 判定拒收 |
| **警示 (WARNING)** | 背景 `#FFFBEB` / 文字 `#B45309` | 背景 `rgba(245,158,11,0.1)` / 文字 `#FBBF24` | 漏检/预警 |
| **挂起 (HITL)** | 背景 `#F5F3FF` / 文字 `#6D28D9` | 背景 `rgba(139,92,246,0.1)` / 文字 `#A78BFA` | 人机协同 |

---

## 4. 字体与间距 (Typography & Spacing)

* **UI 字体**：Inter / 现代无衬线中文字体。
* **数据字体**：Monospace (JetBrains Mono / Roboto Mono)。
* **圆角**：卡片 `rounded-lg` (8px)，按钮/标签 `rounded-md` (6px)。
* **间距**：工业级紧凑布局，卡片内边距 `p-4` (16px)，表格单元格 `py-2 px-3`。
