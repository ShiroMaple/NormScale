# 步骤 2 与步骤 3 被提取值控件样式与交互验收总结

## 1. 变更内容概述
按照既定实施方案，已将“步骤 2：核对解析数据”与“步骤 3：比对标准”页面中所有被提取值文本样式全面统一：

1. **新建组件 [`EditableValueField.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/EditableValueField.tsx)**：
   - **默认状态**：展示为主题色（`#006194`）加粗纯文本，移除厚重的输入框线框与白底，保持清爽工整的表单排版。空值时呈现浅灰 `--`。
   - **悬浮交互**：鼠标悬浮在所在区域时，背景呈现淡薄微高亮，并于最右侧平滑淡入主题色编辑按钮（Material Symbol `edit` 图标，尺寸已精修缩小 2px 为 `12px`）。
   - **编辑状态**：点击编辑按钮切换为具备 `autoFocus` 与全选功能的文本输入框（带 `ring-2 ring-primary/40` 主题色外光晕）。
   - **保存与取消**：按 `Enter` 键或点击外部（失焦 `Blur`）自动持久化保存并切回纯文本；按 `Escape` 键撤销本次修改并还原原值。
   - **BBox 联动保留**：悬浮于该组件上时，保持原有的与左侧原件 PDF 切图（BBox）双向高亮联动定位能力。

2. **基础元数据网格排版重构 [`WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)**：
   - **取消施工号显示**；
   - **冶炼炉号**与**热处理炉号**分别移至第 2 行原施工号与供货厂家位置；
   - **最底行（第 4 行）**调整为：**交货几何规格**、**热处理状态**、**供货厂家**；
   - 形成工整对称的 4 行 3 列标准工业网格：
     - **第 1 行**：基础元数据标题 | 批次号 (`meta_batchNo`) | OCR 置信度徽章
     - **第 2 行**：质保书编号 (`meta_certificateNo`) | 冶炼炉号 (`meta_heatNo`) | 热处理炉号 (`meta_packNo`)
     - **第 3 行**：产品品名 (`meta_productName`) | 材料牌号 (`meta_grade`) | 声称执行标准 (`meta_standard`)
     - **第 4 行**：交货几何规格 (`meta_dimensions`) | 热处理状态 (`meta_deliveryState`) | 供货厂家 (`meta_supplier`)

3. **左侧 PDF 预览默认缩放比例调至 150%**：
   - 初始 `zoomLevel` 状态由 `100` 升级为 **`150`**；
   - 居中缩放快捷按钮提示与重置目标同步联动为「点击一键还原为 150%」。

4. **步骤 3「质保书信息」卡片提取值样式统一**：
   - 卡片中 8 个字段（产品名称、质保书编号、声明标准、材料牌号、冶炼炉号、热处理装炉号、交货规格、供货厂商）的被提取值统一重构为加粗主题色（亮色 `text-primary`、暗色 `dark:text-primary-fixed-dim`）；
   - 空值字段以全站统一的浅灰 `--`（`text-outline-variant italic font-normal`）弱化呈现。

---

## 2. 验证结果

### 2.1 自动化测试与静态类型检查
- **TypeScript 严格类型检查**：`pnpm typecheck`（`tsc --noEmit`）通过，0 错误。
- **单元测试套件**：`pnpm test`（Vitest 40 个测试文件、196 项测试）全部通过。

### 2.2 浏览器端到端交互验证
通过无头浏览器在 `http://localhost:3000` 进行了全流程实测验证：

| 验证项 | 预期行为 | 实测结果 |
| :--- | :--- | :--- |
| **小笔图标尺寸** | 图标由 14px 缩小 2px 至 12px，更精致内敛 | **通过**，视觉权重与 11px/12px 文字更协调 |
| **施工号隐藏** | 基础元数据网格中不再出现施工号 | **通过**，无冗余字段占位 |
| **炉号移位** | 冶炼炉号与热处理炉号分别位于第 2 行中、右两列 | **通过**，双炉号独立成列清晰呈现 |
| **第 4 行对齐** | 第 4 行呈现为规格、热处理状态、供货厂家 | **通过**，4行3列完整对称网格达成 |
| **PDF 默认缩放** | 步骤 2 左侧 PDF 默认以 150% 比例呈现，工具栏显示 150% | **通过**，原件图文更清晰，核对体验显著提升 |
| **步骤 3 质保书信息** | 8 个提取值文字统一加粗显示主题蓝，无粗细不一或黑蓝混杂 | **通过**，全量统一为加粗主题蓝 |

---

## 3. 视觉验证截图

### 步骤 3 质保书信息卡片最新统一样式
所有提取值统一加粗主题蓝呈现，界面层次清晰分明：
![步骤3质保书信息提取值样式统一](C:/Users/gaoft/.gemini/antigravity-ide/brain/56cb3a62-c99a-436a-b451-b82f4bb2f10a/step3_cert_info_card_1788745135982.png)

---

## 4. 步骤 3 人工复核区域浅灰底与决策按钮优化

### 4.1 调整要点
1. **解除系统判定背景色连带影响**：
   - 默认未复核状态（`!currentBatch.humanVerdict`）下，人工复核区域保持中性浅灰底（`bg-surface-container-low dark:bg-surface-dark-low text-on-surface dark:text-surface-bright md:border-outline-variant/50 dark:md:border-border-dark`），不再被左侧客观判定（如系统 FAIL 浅红 / PASS 浅绿）直接染色；
   - 仅当工程师主动做出裁决时，动态流转为对应状态色（拒收为淡红 `bg-status-fail-bg`，审批通过为淡绿 `bg-status-pass-bg`）。
2. **规范按钮规格与高度（移除拉伸）**：
   - 移除 `self-stretch` 与 `items-stretch`，改为 `flex items-center gap-2 shrink-0` 垂直居中排布；
   - 设定紧凑工业按钮规格：高度统一指定为 `h-8`（32px），水平内边距 `px-4`；
   - 未复核时，“拒收”按钮采用红字红细边（`border-red-300 dark:border-red-800/60 text-red-700 dark:text-red-400 bg-surface-container-lowest`），“审批通过”采用主主题色蓝底，层次分明。

### 4.2 验证截图

#### (1) 默认未复核状态（中性浅灰底，32px 紧凑高度垂直居中按钮）
![未复核默认浅灰底与合适高度按钮](C:/Users/gaoft/.gemini/antigravity-ide/brain/56cb3a62-c99a-436a-b451-b82f4bb2f10a/decision_banner_unreviewed_1788745585933.png)

#### (2) 点击「拒收」后动态流转（淡红底，拒收按钮高亮激活）
![人工标记拒收状态](C:/Users/gaoft/.gemini/antigravity-ide/brain/56cb3a62-c99a-436a-b451-b82f4bb2f10a/decision_banner_rejected_1788745590581.png)

#### (3) 再次点击撤回，无缝还原为中性浅灰底
![撤回标记恢复未复核浅灰底](C:/Users/gaoft/.gemini/antigravity-ide/brain/56cb3a62-c99a-436a-b451-b82f4bb2f10a/decision_banner_untoggled_1788745595867.png)

---

## 5. 步骤 3 全景合规比对矩阵「剪刀差」说明与悬浮气泡优化

### 5.1 调整要点
1. **替换标签字样并集成 Info 图标**：
   - 将原「责任归属」字样替换为一体化胶囊标签 **「剪刀差 ℹ️」**（`bg-amber-200/90 text-amber-950 text-[10px] font-bold` 带 Material Symbol `info` 图标）；
   - 保留直接的订货加严条款责任阐述，直截了当。
   - 图标尺寸精修：将 Material Symbol 的样式类定义包裹入 `@layer components`，并为 info 图标应用 `!text-[10px] leading-none` 和内联 `fontSize: '10px'`，确保其渲染高度与相邻的 10px 中文字体严格等比对其，不再偏大。
2. **术语说明由常态展开重构为鼠标悬浮气泡，根除双重气泡**：
   - 从常态 DOM 流中移除了长达数行的静态“术语说明”文本，释放表格垂直行高；
   - 彻底移除触发浏览器原生提示的 `title` 属性，杜绝了白底原生气泡与暗色定制气泡同时浮现的「双重气泡」问题；
   - 鼠标悬浮于「剪刀差 ℹ️」标签时，仅弹出深色精致悬浮卡片（`bg-inverse-surface text-inverse-on-surface`，带指向箭头与琥珀黄标头）。

### 5.2 验证截图

#### (1) 常态展示：10px 等比 info 图标与清爽的「剪刀差 ℹ️」胶囊标签
![常态展示剪刀差胶囊标签与10px图标](C:/Users/gaoft/.gemini/antigravity-ide/brain/56cb3a62-c99a-436a-b451-b82f4bb2f10a/scissor_gap_badge_normal_1788746870558.png)

#### (2) 悬浮交互：仅展示单一暗色精致术语说明气泡（无白底原生提示干扰）
![鼠标悬浮展开单一暗色气泡](C:/Users/gaoft/.gemini/antigravity-ide/brain/56cb3a62-c99a-436a-b451-b82f4bb2f10a/scissor_gap_badge_hover_dark_tooltip_1788746931865.png)
