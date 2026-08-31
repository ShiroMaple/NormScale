# 工作台步骤 4 隐藏与步骤 3 动作流转三按钮（保存结果/保存截图/开启新任务）实施方案

根据现阶段产品规划，暂时收敛工作台至前 3 个步骤，隐藏第 4 步入口，并在步骤 3 底部提供完整闭环的三大核心功能按钮：主要高亮按钮【保存结果】、次要按钮【保存截图】、次要按钮【开启新任务】。

## User Review Required

> [!IMPORTANT]
> - **步骤 4 隐藏范围**：
>   1. 底部 4 步骤连线指示器收拢为 3 步（`上传文档` -> `核对数据` -> `比对标准`）；
>   2. 页面垂直滑动锁止在步骤 3（禁止滚动至步骤 4）；
>   3. 移除步骤 3 前往步骤 4 的“下一步：生成质检报告”按钮。
> - **三联按钮工业布局**：
>   - `[返回上一步]`（返回步骤 2）；
>   - `[保存截图]`（纯前端零依赖 SVG foreignObject + Canvas 离屏渲染生成高分辨率 PNG 下载，并弹窗提示）；
>   - `[开启新任务]`（自动归档当前 Session 至本地台账，弹出提示并无缝重置返回步骤 1 上传界面）；
>   - `[保存结果]`（主要操作位，高亮主色，完整持久化当前 Session 的系统和人工修正结果至 `localStorage`，打通历史台账）。

---

## Proposed Changes

### 前端工作台核心组件

#### [MODIFY] [WaterfallWorkbench.tsx](file:///Users/shiromaple/Github/NormScale/src/components/WaterfallWorkbench.tsx)

1. **收拢底部步骤指示器与滑动边界**：
   - Stepper 列表移除 `id: 3`（归档/导出），仅渲染 `id: 0, 1, 2`；
   - `goToStep` 函数上限限制从 `3` 调整为 `2`；
2. **新增会话本地持久化逻辑（保存结果）**：
   - 编写 `handleSaveSessionResults()`：
     - 从 `localStorage.getItem('normscale_saved_sessions')` 读取既有台账数据；
     - 将当前 Session 的完整数据（含修改后的实测值、各炉批判定状态、人工复核结果、保存时间戳 `savedAt`）进行更新/追加；
     - 触发 Toast 提示：“质检结果已成功保存至本地台账 (Session ID: XXX)”；
3. **新增纯前端原生截图逻辑（保存截图）**：
   - 为步骤 3 核心内容区域容器赋予唯一 DOM ID `step3-audit-matrix`；
   - 编写 `handleExportStep3Screenshot()`：
     - 提取步骤 3 容器的 DOM 结构与全局样式表；
     - 通过 SVG `<foreignObject>` 与 HTML5 Canvas 进行离屏光栅化；
     - 自动触发文件下载：`NormScale_检验比对结果_${currentBatch.batchNo}_${日期}.png`；
     - 弹出 Toast 提示截图导出成功；
4. **新增开启新任务逻辑（开启新任务）**：
   - 编写 `handleStartNewTask()`：
     - 先行静默调用 `handleSaveSessionResults(silent=true)` 归档当前结果；
     - 重置为生成全新 Session ID 的初始状态；
     - 调用 `goToStep(0)` 平滑返回步骤 1；
     - 弹出 Toast 提示：“已自动归档当前任务并开启新检验”；
5. **重构步骤 3 底部右侧操作按钮区**：
   - 移除原来的 `goToStep(3)` 按钮；
   - 依次排布：
     - `[保存截图]`：次要按钮，带 `photo_camera` 图标；
     - `[开启新任务]`：次要按钮，带 `add_task` 图标；
     - `[保存结果]`：主要高亮按钮，带 `check_circle` 图标。
6. **Toast 状态通知组件挂载**：
   - 在工作台右上角或顶部居中挂载轻量悬浮 Toast 提示，3 秒自动淡出。

---

## Verification Plan

### Automated Tests
- 运行 TypeScript 严格类型检查：
  ```bash
  pnpm typecheck
  ```
  确认无任何类型报错。

### Manual Verification
1. **步骤 4 隐藏走查**：
   - 检查底部 Stepper 是否仅展示 3 个步骤（上传文档、核对数据、比对标准）；
   - 在步骤 3 验证无法再进入步骤 4。
2. **“保存结果”按钮走查**：
   - 在步骤 3 点击【保存结果】；
   - 验证右上角弹出高质感成功 Toast；
   - 检查 `localStorage` 中的 `normscale_saved_sessions` 是否成功记录当前数据。
3. **“保存截图”按钮走查**：
   - 在步骤 3 点击【保存截图】；
   - 观察浏览器是否自动下载生成命名为 `NormScale_检验比对结果_*.png` 的截图文件；
   - 打开图片检查排版与比对矩阵是否清晰完整。
4. **“开启新任务”按钮走查**：
   - 点击【开启新任务】；
   - 验证系统自动保存并跳转至步骤 1（上传文档），且当前 Session ID 已重置更新。
