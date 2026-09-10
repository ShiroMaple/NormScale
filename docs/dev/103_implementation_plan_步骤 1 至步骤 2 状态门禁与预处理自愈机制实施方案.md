# 步骤 1 至步骤 2 状态门禁与预处理自愈机制实施方案

## 背景与问题陈述
在当前系统中，用户在步骤 1 上传文档后，由于切图、文本提取与服务端指纹落盘（`runInstantPreprocess`）是异步执行的，而操作按钮与步骤条跳转此前只校验了文档数量存在性（`queuedDocs.length > 0`），导致存在两个关键漏洞：
1. **右下角主按钮门禁缺失**：在预处理进行中的 1~3 秒内，用户即可点击「解析文档，核对数据」，传入未就绪的空切图与空文本，导致后端解析缺少输入、前端步骤 2 切图白屏以及异步结果回写冲突；
2. **步骤指示器可直跳**：用户可在未解析甚至未就绪时直接点击顶部步骤 2，进入无任何任务与数据的空白假死状态。

根据与用户的交互讨论结论，本方案通过多层防御性编程彻底消除该时序与状态隐患。

---

## 拟定变更方案

### 1. 右下角流转主按钮门禁与交互反馈
#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- **门禁状态计算**：
  引入 `isAnyDocPreprocessing = queuedDocs.some(d => d.status === '预处理中...' || d.status === '上传中')`。
- **按钮状态与视觉**：
  - `disabled={queuedDocs.length === 0 || isAnyDocPreprocessing}`；
  - 当 `isAnyDocPreprocessing` 为 true 时：
    - 文案动态切换为 `文档预处理中...`；
    - 前置展示带微旋转动画的 Material Symbols `progress_activity` 环形 Loading 图标；
    - 样式呈现半透明等待光标 `cursor-not-allowed opacity-70`；
  - 预处理全部就绪后，平滑恢复为高亮主色按钮，文案为 `解析文档，核对数据`。

---

### 2. 步骤条导航（Step Bar）非法直跳拦截
#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 修改 `goToStep(stepIdx: number)`：
  - 若 `stepIdx > 0`：
    - 首先校验 `queuedDocs.length === 0`，若为空提示「请先在步骤 1 上传或选择待检验文档」；
    - 校验是否有文档仍处于预处理中（`isAnyDocPreprocessing`），若有则弹出 Toast 提醒：「文档切图与文本正在预处理中，请稍候...」并严格阻断跳转；
    - 若队列中文档尚未启动过解析（`tasks` 中无该文档），弹出 Toast 提醒：「请点击右下角“解析文档，核对数据”启动检验流程」并阻断跳转。

---

### 3. 步骤 2 启动解析前的“二次防御自检与自愈流水线”
#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
在 `handleStartNewSessionAndAdvance` 执行最开始，增加严密的文档完整性自检网关：

```
[用户点击解析按钮]
        │
        ▼
[检查 1: 是否有文档处于"预处理中"] ──是──> [Toast 提示"文档预处理中，请稍候..."，拦截并保持在步骤 1]
        │ 否
        ▼
[检查 2: 产物完整性校验] (必须有有效 pages 切图列表)
        │
        ├─ 产物完备 ────────────────────> [正常创建 Session，流转至步骤 2 并启动多线程解析]
        │
        └─ 产物缺失
              │
              ├─ 原件 (uploadedFilesMap[docId]) 仍在
              │     │
              │     ▼
              │  [文档状态重设为"预处理中..."]
              │  [Toast: "检测到切图产物不全，正在自动重新生成..."]
              │  [主按钮锁定为等待态，调用 runInstantPreprocess 自动修复]
              │  [修复成功后恢复就绪，等待用户再次点击]
              │
              └─ 原件也缺失 (如内存丢失或异常损坏)
                    │
                    ▼
                 [仅将该损坏文档从 queuedDocs 与 session.documents 中精准剔除]
                 [Toast 错误提示: "文档 [xxx] 资源丢失已移除，请重新上传"]
                 [保持在步骤 1，其余健康文档不受影响]
```

- **预处理就绪判定标准**：
  文档的 `pages` 存在且 `pages.length > 0`；若是文本型 PDF 则预处理提取文本已就绪。
- **自愈重做预处理函数抽离**：
  将当前在 `handleRealFiles` 内部的 `runInstantPreprocess(file, docId)` 提取为可复用的独立辅助函数，使自愈流水线可安全复用。

---

### 4. 预处理落盘完成后即时刷新已缓存列表
#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 在 `runInstantPreprocess` 的 `if (data.success)` 成功分支中：
  在触发状态更新与 Toast 之后，立即调用 `refreshCachedDocs()`；
- 确保右侧历史缓存队列及专测矩阵与服务端的缓存状态实时同步。

---

## 验证方案

### 自动化与构建验证
1. **类型检查**：运行 `pnpm exec tsc --noEmit` 确保无 TypeScript 类型错误；
2. **单元测试回归**：运行 `pnpm test` 确保现有 52 套件、258 项测试保持全部通过。

### 手动交互流转验证（通过浏览器工具验证真实行为）
1. **主按钮状态验证**：上传真实 PDF，观察在上传并预处理的前 1~2 秒内，右下角主按钮是否呈现「文档预处理中...」+ 旋转 Loading + 禁用态，以及预处理就绪后是否瞬时恢复高亮。
2. **步骤条直跳拦截验证**：在上传文档后立即点击步骤条的「核对数据」，验证是否弹出友好 Toast 阻断跳转，未出现白屏或空数据。
3. **缓存刷新验证**：验证预处理完成后，历史缓存列表是否即时自动刷新。
