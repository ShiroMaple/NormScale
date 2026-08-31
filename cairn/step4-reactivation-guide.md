---
title: 步骤 4 代码保留与重启启用指引
type: project_topic
authoring_mode: ai_generated
contains:
  - decision
  - guide
---

# 步骤 4（检验报告生成与归档导出）代码保留与重启启用指引

> **文档定位**：本指南记录了工作台第 4 步（质检报告/证明书生成与导出归档）的代码现状与未来重新启用时的完整操作步骤。

---

## 1. 代码现状与保留说明

当前阶段为了聚焦前 3 个步骤的核心录入、核对与比对体验，工作台暂时收敛了步骤 4 的入口，但**步骤 4 的全部 UI 布局与业务逻辑代码均完整保留在代码库中，未做任何实质性删除**：

- **组件位置**：[`src/components/WaterfallWorkbench.tsx`](file:///Users/shiromaple/Github/NormScale/src/components/WaterfallWorkbench.tsx)
- **保留代码段**：步骤 4 的 `<section>` 视图容器（原行号约 2800~3300 行），完整包含：
  1. 统一两层树状批次选择条 (`BatchContextBar`)；
  2. 工业标准质检证明书/合规报告排版预览（红头凭证格式、受检单位、执行标准、材料牌号、规格尺寸、炉批号等）；
  3. 化学成分与力学性能全项实测合规比对总览表；
  4. 最终判定盖章（`合格 PASS / 拒收 REJECTED` 防伪拟真印章与数字哈希校验码）；
  5. 底部系统审计信息与签发责任人。

---

## 2. 后续重启恢复步骤 4 的修改清单（仅需 3 处）

未来当需要恢复展示第 4 步时，仅需在 [`src/components/WaterfallWorkbench.tsx`](file:///Users/shiromaple/Github/NormScale/src/components/WaterfallWorkbench.tsx) 中进行以下 3 处极简修改：

### 修改 1：放开步数受控滑动上限（由 2 恢复为 3）

在 `WaterfallWorkbench.tsx` 的 `goToStep` 函数中：

```tsx
// 将 stepIdx <= 2 改回 stepIdx <= 3
const goToStep = (stepIdx: number) => {
  if (stepIdx >= 0 && stepIdx <= 3) {
    setCurrentStep(stepIdx);
  }
};
```

---

### 修改 2：恢复底部导航条 Stepper 第 4 步指示锚点

在底部 `footer` 的步骤指示器数组中，恢复第 4 个步骤项：

```tsx
{/* 底部指示器恢复为 4 步 */}
{[
  { id: 0, title: '上传文档', icon: 'upload_file' },
  { id: 1, title: '核对数据', icon: 'fact_check' },
  { id: 2, title: '比对标准', icon: 'compare_arrows' },
  { id: 3, title: '归档/导出', icon: 'archive' }, // 恢复此项
].map((step, idx) => { ... })}
```

---

### 修改 3：在步骤 3 底部增加“下一步：生成质检报告”流转按钮，并挂载步骤 4 动作

在底部右侧操作按钮区：

1. **步骤 3 (`currentStep === 2`)**：在【保存结果】旁增加或将主要按钮引导至步骤 4：
   ```tsx
   <button
     type="button"
     onClick={() => goToStep(3)}
     className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
   >
     <span>{isPass ? '比对通过，生成质检报告' : '生成拒收说明'}</span>
     <span className="material-symbols-outlined text-base">arrow_forward</span>
   </button>
   ```

2. **步骤 4 (`currentStep === 3`)**：渲染步骤 4 专属动作按钮（如确认打印/导出与开启新任务）：
   ```tsx
   {currentStep === 3 && (
     <>
       <button
         type="button"
         onClick={() => window.print()}
         className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
       >
         <span>确认导出</span>
         <span className="material-symbols-outlined text-base">file_download</span>
       </button>
       <button
         type="button"
         onClick={handleStartNewTask}
         className="px-4 py-2 rounded-lg border border-outline-variant dark:border-border-dark text-xs font-bold text-on-surface dark:text-surface-bright hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors cursor-pointer"
       >
         开启新任务
       </button>
     </>
   )}
   ```

---

## 3. 验证方式

修改上述 3 处后，执行 `pnpm typecheck` 确认 0 错误，在浏览器步骤 3 点击“生成质检报告”即可平滑滑入步骤 4 完整报告视窗。
