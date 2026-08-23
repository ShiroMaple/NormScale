# 前端设计与排版规范 (Frontend UI/UX & Typography Standards)

## 1. 视觉风格与设计原则
- **风格定位**：现代极简（Modern Minimalist）、注重排版层级、低饱和度专业工业质感（Slate/Zinc/Neutral 沉稳色系）。
- **绝对禁止 Emoji**：严禁在界面元素、按钮、标题、导航、卡片标题中直接硬编码渲染 Emoji（如 🛡️、🟢、🔴、⚠️ 等）。所有操作、图标和状态指示**一律使用 `lucide-react` 矢量图标**（如 `<CheckCircle2 />`, `<AlertTriangle />`, `<XCircle />`, `<ShieldCheck />` 等）。
- **禁止裸写自定义 CSS**：严禁在样式表中裸写非标自定义 CSS；必须严格使用 Tailwind CSS 工具类与原子化设计系统。

## 2. 字号与排版硬性约束 (Strict Typography Rules)
- **【字号基准】**：默认正文、表格内容、表单 Label 必须使用 `text-sm` (14px) 或 `text-base` (16px)，行高必须配合 `leading-normal` 或 `leading-relaxed`。
- **【严禁滥用 text-xs】**：`text-xs` (12px) 仅允许出现在时间戳（如 "3 mins ago"）、微型数字角标（如未读计数、状态点）和次要辅助说明中。
- **【严禁降级】**：按钮（Button）、输入框（Input）、列表项（List Item）和卡片正文一律禁止使用 `text-xs`。
- **【层级区分】**：通过字重（`font-medium` / `font-semibold`）和颜色对比度（如 `text-foreground` vs `text-muted-foreground`）来区分信息主次，而不是靠一味缩小字号。

## 3. 交互与动效规范 (Motion & Interaction)
- **列表与状态过渡**：列表渲染与动态卡片切换优先使用 `framer-motion` 实现平滑淡入（`fade-in`）与高度自适应（`AnimatePresence`）。
- **交互回弹与反馈**：所有按钮与可交互卡片必须具有 hover 变色与 `active:scale-95 duration-150` 点击轻微回弹触感。
