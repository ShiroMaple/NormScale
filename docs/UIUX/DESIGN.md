# NormScale 工业质量证明书智能合规检验系统 · 设计系统规范 (DESIGN.md)

> **版本**：v1.0.0 · Industrial Precision Edition  
> **设计语言**：MD3 工业精密工程级设计系统 (Material Design 3 Surface Hierarchy & Industrial Slate)  
> **适用范围**：NormScale 质检工作台、历史检验台账、国家标准知识库、系统管理后台及全套工业端交互组件。

---

## 1. 设计哲学与定位 (Design Philosophy)

NormScale 作为面向承压设备、特种不锈钢管道与高端装备制造的**工业级质量证明书（MTC）合规核验引擎**，其界面设计必须传达以下核心特质：

- **工业严谨与精密（Industrial Rigor & Precision）**：摒弃浮夸的多余装饰，强化理化检验数据、标准条款代号、AST 算法与公差偏差的刻度感与对齐秩序。
- **高对比与通透层次（High-Contrast Surface Elevation）**：采用 Material Design 3 的表面容器层级体系，以极淡冷蓝为底，承托纯白高反差卡片，呈现通透而立体的工程软件质感。
- **双模自适应（Calibrated Dual-Theme）**：提供日间工业冷白（Light Mode）与夜间深色中控室（Dark Mode）双套完整调色板。
- **受控流转与沉浸体验（Controlled Focus & Frictionless Flow）**：质检流程按 4 步骤闭环推进，锁定非自由脱焦滚轮，配合平滑垂直步进滑动与常驻底部导航。

---

## 2. 色彩系统与语义 Tokens (Color System & Tokens)

### 2.1 表面层级配色体系 (Surface Container Hierarchy)

| Token 名称 | 浅色模式 (Light) | 深色模式 (Dark) | 语义用途说明 |
|---|---|---|---|
| `background` / `surface-bright` | `#F7F9FF` | `#0B0F17` | 页面全局背景底色（极淡冷蓝 / 深灰中控室黑） |
| `surface-container-lowest` | `#FFFFFF` | `#131B26` | 最顶层卡片、主内容容器、A4 报告纸张底色 |
| `surface-container-low` | `#F1F4FA` | `#0E1620` | 次级面板背景、输入框底色、表格斑马纹 |
| `surface-container` | `#EBEEF4` | `#17212F` | 三级嵌套区块、边栏与阅读器视窗背景 |
| `surface-container-high` | `#E5E8EE` | `#1A2433` | 悬浮高亮、按钮底色、次级徽章背景 |
| `surface-container-highest` | `#DFE3E8` | `#243247` | 分割线、激活态边框底色 |

---

### 2.2 品牌与重点色彩 (Brand & Accent Colors)

| Token 名称 | Hex 编码 | 用途说明 |
|---|---|---|
| `primary` | `#006194` | 工业深青蓝，主行动按钮（Primary CTA）、关键代号、激活 Tab |
| `primary-container` | `#007BB9` | 主色高亮容器、重点操作按钮悬浮态 |
| `primary-fixed` | `#CCE5FF` | 浅蓝胶囊徽章底色、OCR 标注框选中态 |
| `primary-fixed-dim` | `#93CCFF` | 深色模式下主色文字与图标高亮色 |
| `on-primary` | `#FFFFFF` | 主色按钮内部文字与反白图标 |
| `secondary` | `#505F76` | 次级灰色、辅助说明文字与次级图标 |
| `outline` | `#707881` | 主边框、输入框默认描边 |
| `outline-variant` | `#BFC7D2` | 次级细分割线（60% 透明度）、轻量卡片边框 |

---

### 2.3 工业质检语义状态色 (Industrial Status Colors)

| 检验状态 | 背景色 Token (`bg`) | 文字色 Token (`text`) | 语义场景 |
|---|---|---|---|
| **合格放行 (PASS)** | `#ECFDF5` (`status-pass-bg`) | `#047857` (`status-pass-text`) | 规则比对通过、放行印章、100% 合格率 |
| **一票否决 (FAIL)** | `#FEF2F2` (`status-fail-bg`) | `#B91C1C` (`status-fail-text`) | 指标超标、强制检验缺失、拒收留存印章 |
| **警示补验 (WARNING)** | `#FFFBEB` (`status-missing-bg`)| `#B45309` (`status-missing-text`)| 临界公差偏离、非强制项未录入、需人工核实 |
| **人机协同 (HITL)** | `#F5F3FF` (`status-hitl-bg`) | `#6D28D9` (`status-hitl-text`) | 牌号消歧挂起、置信度低于阈值、AST 公式提示 |

---

## 3. 字体与数字排版体系 (Typography System)

### 3.1 字体家族定义 (Font Families)

- **UI 与正文字体**：`Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  - 用于标题、操作按钮、正文说明、导航栏与表单标签。
- **理化检验等宽字体**：`"JetBrains Mono", monospace`
  - 专门用于化学元素质量分数（`0.025 wt%`）、力学性能数值（`573.68 MPa`）、炉批号（`HT-2026-0881`）、执行标准代号（`GB/T 13296-2023`）、AST 公式、SHA-256 存证哈希与时间戳。

---

### 3.2 字阶与行高规范 (Type Scale)

| 字阶 Token | 字体大小 | 行高 (Line Height) | 字重 (Weight) | 适用场景 |
|---|---|---|---|---|
| `decision-hero` | `28px` | `1.2` | `700 (Bold)` | Step 3 综合判定大横幅、合格/拒收大结论 |
| `headline-lg` | `24px` | `1.5` | `600 (Semibold)` | 页面主标题（如“批量质保证书录入”）、Logo 标头 |
| `section-title` | `16px` | `1.5` | `500 (Medium)` | 模块卡片标题（如“模块 A: 化学成分比对表”） |
| `body-md` | `13px` | `1.4` | `400 (Regular)` | 正文段落、表单输入框文本、列表项 |
| `data-mono` | `13px` | `1.5` | `400/700` | 检验比对表格数据、实测值、标准公差范围 |
| `caption` | `11px` | `1.4` | `400 (Regular)` | 辅助说明、字段名提示、副标题、时间戳 |

---

## 4. 图标系统 (Iconography System)

系统统一使用 **Google Material Symbols Outlined** 字体图标，搭配实心（`FILL: 1`）与线框（`FILL: 0`）权重：

```css
.material-symbols-outlined {
  font-family: 'Material Symbols Outlined' !important;
  font-size: 20px;
  line-height: 1;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  vertical-align: middle;
}
.material-symbols-outlined.fill-1 {
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
```

### 核心符号映射表

| 图标名称 (Symbol) | 场景与用途 |
|---|---|
| `precision_manufacturing` (fill-1) | 系统主 Logo 机械精密制造齿轮徽标 |
| `upload_file` | Step 1 上传文档标识 |
| `fact_check` | Step 2 数据核对与 OCR 解析校验标识 |
| `compare_arrows` | Step 3 标准切片规则比对标识 |
| `archive` | Step 4 归档与报告导出标识 |
| `picture_as_pdf` (fill-1) | 历史凭证卡片、PDF 阅读器工具栏红标 |
| `verified` / `check_circle` | 合格检验、已完成步骤指示器 |
| `report_problem` / `cancel` | 一票否决不合格项、致命超标警示 |
| `emergency_home` / `contact_support` | HITL 人机协同中断挂起标识 |
| `auto_awesome` / `calculate` | AST 动态公式求解器、智能消歧映射 |
| `table_view` / `data_object` / `verified_user` | Excel、JSON 接口、CA 区块链存证卡片图标 |

---

## 5. 材质、阴影与拟真渲染 (Materials & Elevation)

### 5.1 拟真 PDF 纸张视窗 (`.paper-texture`)
```css
.paper-texture {
  background-color: #ffffff;
  background-image: radial-gradient(#e5e8ee 0.75px, transparent 0.75px);
  background-size: 16px 16px;
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04);
}
.dark .paper-texture {
  background-color: #131b26;
  background-image: radial-gradient(#243247 0.75px, transparent 0.75px);
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.3);
}
```

### 5.2 交互式 OCR BBox 标注框 (`.ocr-box`)
- **黄色高亮层（牌号与力学）**：`rgba(254, 240, 138, 0.35)` 底色 + `1px dashed #ca8a04` 描边；悬浮或联动时放大为 `1.5px solid #a16207` 并附带外发光。
- **青色高亮层（化学成分矩阵）**：`rgba(204, 229, 255, 0.35)` 底色 + `1px dashed #006194` 描边；悬浮时外扩高亮。

### 5.3 报告对角线水印大章 (Watermark Stamp)
在 Step 4 A4 报告纸张内嵌入倾斜 `-25°`、字号 `72px`、透明度 `15%` 的绝对定位大印章：
- **PASS 报告**：翡翠绿色 `PASS` 印章；
- **REJECT 报告**：绯红色 `REJECT` 印章。

---

## 6. 交互架构与步骤流转规范 (Interaction & Motion)

### 6.1 受控步进滑动容器 (Controlled Step Slider)
- **非自由滚动锁定**：全局外层视口采用 `h-screen overflow-hidden`，防止用户随意滚动脱焦；
- **滑动过渡曲线**：
  ```css
  transition-transform duration-500 ease-[cubic-bezier(0.25, 1, 0.5, 1)];
  transform: translateY(-${currentStep * 100}%);
  ```
- **局部容器滚动**：每个 Step 拥有专属内部视口（`overflow-y-auto custom-scrollbar`），当内容超过屏幕高度时在步骤内独立滑动，不影响全局布局。

---

### 6.2 底部常驻导航条 (Fixed Stepper Bar)
- 常驻屏幕底部（`h-16 shrink-0 z-30`），采用 MD3 卡片阴影与细边框；
- **4 步骤连线指示器**：
  - `01 上传文档` $\to$ `02 核对数据` $\to$ `03 比对标准` $\to$ `04 归档/导出`；
  - 步骤已完成呈现翡翠绿对勾（`check_circle`），当前步骤呈现实心深蓝胶囊高亮（`bg-primary text-on-primary font-bold`）；
- **右侧流转按钮上下文绑定**：
  - Step 1: `下一步：核对结果 ->`
  - Step 2: `<- 返回上一步` + `核对完成，开始比对 ->`
  - Step 3: `<- 返回上一步` + `比对通过，生成质检报告 ->`（或 `生成拒收说明 ->`）
  - Step 4: `<- 返回上一步` + `确认导出 (Print)` + `开启新任务`

---

## 7. 模块与页面结构详解 (Layout Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│ TopNavBar: NormScale | 工业质保证书合规检验   [工作台|台账|标准库|管理]  (Sun)(Bell) SQE │
├────────────────────────────────────────────────────────────────────────┤
│ [Step 1: 批量录入] 5:5 左右双栏                                          │
│  ├─ 左侧: 项目配置面板 (Area Optimization) + 大尺寸虚线拖拽上传框         │
│  ├─ 右侧: 待处理单据队列卡片 (S30408 / 316L / UNKNOWN)                  │
│  └─ 底部: 历史缓存凭证搜索 + 3 列红标 PDF 卡片                           │
│────────────────────────────────────────────────────────────────────────│
│ [Step 2: 数据核对] 45:55 左右双栏                                        │
│  ├─ 左侧: 拟真 PDF 纸张阅读器 (缩放 75%~175% / 旋转 / 页码 / OCR BBox)  │
│  └─ 右侧: 基础元数据双列表单 + 化学/力学表格 (含 82% 需人工核实警示 Tag)   │
│────────────────────────────────────────────────────────────────────────│
│ [Step 3: 标准比对] 40:60 左右双栏                                        │
│  ├─ 左侧: 质保书实测值快照瓦片 (6 个化学成分 + 4 个力学性能卡片)          │
│  └─ 右侧: 锁定规则切片 + 综合判定大横幅 + 模块 A/B/C + 紫色 AST 公式提示   │
│────────────────────────────────────────────────────────────────────────│
│ [Step 4: 归档导出 / 拒收处置] 40:60 左右双栏                             │
│  ├─ 左侧: A4 拟真报告打印预览 (对角线 PASS/REJECT 印章 + 电子签名)        │
│  └─ 右侧: 2x2 导出格式卡片 (PDF盖章/Excel/JSON/CA) + SHA-256 + NAS 路径 │
├────────────────────────────────────────────────────────────────────────┤
│ BottomStepper: [01 上传] ── [02 核对] ── [03 比对] ── [04 导出]   [返回] [下一步] │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 8. 技术实现与样式代码参考 (Implementation Reference)

### 8.1 Tailwind Config 核心配置片段
```typescript
// tailwind.config.ts
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#F7F9FF',
        'surface-container-lowest': '#FFFFFF',
        'surface-container-low': '#F1F4FA',
        'surface-container': '#EBEEF4',
        'surface-container-high': '#E5E8EE',
        'surface-container-highest': '#DFE3E8',
        primary: '#006194',
        'primary-container': '#007BB9',
        'primary-fixed': '#CCE5FF',
        'primary-fixed-dim': '#93CCFF',
        'on-primary': '#FFFFFF',
        secondary: '#505F76',
        'on-surface': '#181C20',
        'on-surface-variant': '#3F4850',
        outline: '#707881',
        'outline-variant': '#BFC7D2',
        'status-pass-bg': '#ECFDF5',
        'status-pass-text': '#047857',
        'status-fail-bg': '#FEF2F2',
        'status-fail-text': '#B91C1C',
        'status-missing-bg': '#FFFBEB',
        'status-missing-text': '#B45309',
        'status-hitl-bg': '#F5F3FF',
        'status-hitl-text': '#6D28D9',
      },
      fontFamily: {
        'body-md': ['Inter', 'sans-serif'],
        'data-mono': ['JetBrains Mono', 'monospace'],
      },
    },
  },
};
```

---

## 9. 维护与演进准则 (Maintenance Guidelines)

1. **零新增无意义依赖**：图标统一基于 `Material Symbols Outlined` 字体渲染，禁止混用第三方杂乱 SVG 图标包；
2. **严守 JetBrains Mono 数据规范**：所有关于理化检验数值、炉号、批号、公差范围、AST 公式与时间戳，必须统一指定 `font-mono` 或 `font-data-mono`；
3. **单据切换与真理来源原则**：BBox OCR 交互严格约束在 Step 2 阶段，核验完成后的结构化数据契约（`CertificateExtract`）为后续比对与归档的唯一真理来源。
