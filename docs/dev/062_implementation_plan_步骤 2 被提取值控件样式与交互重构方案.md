# 步骤 2 被提取值控件样式与交互重构方案

## 需求背景
在“步骤 2：核对解析数据”页面中，当前所有从质保书中提取的字段（基础元数据 10 个字段、实测检验项所有表格与卡片项）均直接使用常驻的 `<input />` 边框输入框展示，使得页面略显厚重。
本次改造将所有被提取值状态统一调整为：**默认以主题色加粗常规 Text 清爽展示；鼠标悬浮在所在区域时平滑淡出主题色编辑按钮；点击编辑按钮切换为文本输入框；按 Enter 键或失焦（Blur）自动保存并恢复文本态，按 Esc 取消还原；空值展示为浅灰“--”；继续保持与左侧 PDF 原件切图的双向联动高亮能力**。

---

## 用户决策确认结果（基于 /grill-me 访谈）
1. **进入与退出机制**：仅点击悬浮显现的编辑按钮进入编辑态；按 `Enter` 键或点击外部（失焦 `Blur`）自动保存并退出编辑态，按 `Esc` 键撤销还原。
2. **常规文本视觉外观**：无外层输入框边框与白底，展示主题色（`#006194`）加粗文本；鼠标悬浮在所在区域时展示微弱淡灰底纹与编辑按钮。
3. **编辑按钮布局**：固定浮现在数值容器最右侧（若带单位如 `wt%`，紧邻单位），采用主题色（`#006194`）细圆角图标按钮（Material Symbol `edit`），默认透明，hover 平滑淡入。
4. **覆盖范围与空值/联动**：
   - 上方“基础元数据”全部 10 个字段；
   - 下方“实测检验项目”全景平铺表格及分类卡片视图；
   - 空值呈现为浅灰 `--`；
   - 鼠标悬浮在该项上时，完整保留与左侧 PDF 切图（BBox）的双向联动高亮。

---

## 拟定变更详情

### 组件抽象与封装
为遵循单一职责原则（SRP）与最小爆炸半径，不随意在各处复制几十行重复的编辑状态逻辑，在 [`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx) 内部（或同目录提取独立可复用子组件）封装 `EditableValueField` 组件：

#### [MODIFY] [`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- **新增子组件 `EditableValueField`**：
  - **Props 接口**：
    - `value: string`：当前字段提取值
    - `onChange: (newVal: string) => void`：保存更新回调（调用 `handleUpdateExtractValue`）
    - `fieldId: string`：字段 ID（用于 hover/focus 联动与 DOM 锚点）
    - `unit?: string`：单位后缀（如 `wt%`、`mm` 等）
    - `placeholder?: string`：缺省占位符（默认 `--`）
    - `isHighlighted?: boolean`：当前是否正被 PDF 选框或鼠标悬浮高亮
    - `onHover?: (fieldId: string) => void`：悬浮时触发 PDF 切片联动
    - `onLeave?: () => void`：鼠标离开时取消联动
    - `align?: 'left' | 'right'`：对齐方式
    - `className?: string`：外层容器样式微调
  - **内部状态与行为**：
    - `isEditing: boolean`（受控/非受控编辑态，进入时自动 `autoFocus` 并全选文字）
    - `tempValue: string`（编辑期间暂存文本，便于 Esc 撤销还原）
    - `handleStartEdit()`：点击编辑按钮触发
    - `handleSave()`：失焦或按 Enter 时触发保存并退出
    - `handleCancel()`：按 Esc 时还原初始值并退出
  - **视图层**：
    - 常规态：`group` 容器，左侧显示主题色加粗文字，右侧隐蔽的编辑图标按钮（`opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:bg-primary/10`）。
    - 编辑态：聚焦的 `<input />` 控件，边框使用 `border-primary ring-2 ring-primary/40`。

- **替换调用点**：
  1. **上方基础元数据卡片**（10 个字段）：
     - `meta_certificateNo` (质保书编号)
     - `meta_constructionNo` (施工号)
     - `meta_supplier` (供货厂家)
     - `meta_productName` (产品品名)
     - `meta_grade` (材料牌号)
     - `meta_standard` (声称执行标准)
     - `meta_heatNo` (冶炼炉号)
     - `meta_packNo` (热处理批号)
     - `meta_dimensions` (交货几何规格)
     - `meta_deliveryState` (热处理状态)
  2. **下方实测检验项目**：
     - 全景平铺表格视图（行内提取测得值单元格）
     - 化学成分专属表格视图（行内数值单元格，保留 `wt%` 单位）
     - 其他专业分类驱动卡片视图（右侧对齐数值单元格）

---

## 验证方案

### 自动化测试
运行单元测试确保既有业务逻辑与状态流转无损：
```bash
pnpm test
```

### 手动交互验证
1. 打开步骤 2 页面，检查所有提取值是否呈现为干净的主题色加粗文本，无突兀的常态输入框线框。
2. 鼠标悬浮在任意值上，检查：
   - 所在卡片/单元格是否平滑浮现主题色（`#006194`）编辑图标；
   - 左侧 PDF 切图区域是否同步呈现蓝色/黄色 BBox 联动高亮。
3. 点击编辑按钮，检查是否立刻切换为输入框并自动聚焦光标。
4. 修改内容后按 `Enter` 或点击页面空白处（失焦），检查数据是否成功更新并恢复为纯文本展示。
5. 修改内容过程中按 `Esc`，检查是否撤销修改并还原原值。
6. 测试空值字段（`--`），确认点击编辑后能正常输入新值。
