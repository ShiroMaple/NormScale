# 主界面 HITL 旗帜汉化、双层抽屉根除与一键采纳闭环交付报告

## 一、交付目标与完成情况总览

针对质检员在工作台主界面操作 Case 1 时反馈的 3 项关键体验与流转问题，本轮实施已全部完成代码级修复与端到端闭环验证：

| 序号 | 反馈问题 | 根因定位 | 修复方案与达成效果 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **主界面 HITL 旗帜显示 UNKNOWN_GRADE、default，牌号无别名** | 旗帜卡片直接渲染未转译枚举值；`suggestions` 键名 `default` 未经汉化直接打印；仅打印裸钢级字符串而未消费 `candidate_grades` 中的格式化代号。 | 增加 `formatHitlReasonBadge` 汉化徽章；针对牌号消歧场景优先渲染「首选建议: 06Cr19Ni10 (S30408) [98% 匹配 (推荐)]」，彻底消除机器英文。 | **已解决** |
| **2** | **点击“人工细化复核”弹出两层侧边栏，上层显示假编号 #TK-20260828-01 且均无候选** | `src/app/page.tsx` 与 `WaterfallWorkbench.tsx` 双重渲染 `<HitlDrawer>`，点击时回调同时打开两层；工作台重新打开时未继承既有上下文，覆盖了 `candidate_grades`。 | 彻底移除 `page.tsx` 中的冗余抽屉与假任务编号，收敛至工作台单一来源；`handleTriggerHitl` 继承 `batchPresentationMap` 完整上下文，保证候选列表稳定呈现。 | **已解决** |
| **3** | **点击“采纳推荐项”报错提示非标牌号无标准规则切片** | 行内按钮无条件调用 `handleInlineAdoptProperty` 提交了 `{ corrected_property_keys: { default: "06Cr19Ni10" } }`，未提交 `corrected_grade`，后端仍以原非标牌号重新比对。 | 新建 `handleInlineAdoptHitl` 路由分流，对 `UNKNOWN_GRADE` 提交 `{ corrected_grade: topGrade }`，自动完成全项标准核验并刷新批次状态与大盘。 | **已解决** |

---

## 二、关键工程与架构变更

### 1. 单一来源抽屉架构 (Single Source of Truth)
- **清理文件**：[src/app/page.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/page.tsx)
  - 彻底剥离 `<HitlDrawer>` 组件实例及 `isHitlOpen`、`currentTaskId` 等无用状态；
  - 移除了外部无意义的抽屉弹层叠加，确保全系统仅保留工作台内部这一处正本抽屉。
- **上下文继承**：[src/components/WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
  - 在 `handleTriggerHitl` 中，优先从 `batchPresentationMap[currentBatch.batchNo]?.hitlContext` 读取已生成的上下文；
  - 无论质检员点击“挂起暂不处理”后再次通过横幅“处理”或卡片“人工细化复核”唤出，推荐候选钢级与匹配度 100% 完整保留。

### 2. 界面旗帜视觉汉化与信息增强
- **汉化徽标工具函数**：
  - 新增 `formatHitlReasonBadge`：
    - `UNKNOWN_GRADE` → `材料牌号待消歧`
    - `PROPERTY_AMBIGUITY` → `非标检验项目对齐`
    - `ALTERNATIVE_CLAUSE` → `替代条款合规确权`
    - `MULTI_STANDARD_CONFLICT` → `多标准互斥仲裁`
    - `QUALITATIVE_AMBIGUITY` → `定性条款语义争议`
- **卡片候选展示**：
  - 牌号消歧场景：消费 `candidate_grades[0]`，呈现 `首选建议: 06Cr19Ni10 (S30408) [98% 匹配 (推荐)]`；
  - 属性对齐场景：非标属性名汉化键值对渲染。

### 3. 一键采纳推荐项（Inline Adoption）业务分流与流转闭环
- **分流函数**：`handleInlineAdoptHitl(batchNo, ctx)`
  - **牌号消歧（`UNKNOWN_GRADE`）**：
    提取推荐目标钢级（如 `06Cr19Ni10`），调用 `apiClient.resumeAudit(taskId, { corrected_grade: topGrade, waiver_notes: ... })`；
    核验完成后，同步将当前批次 `grade`、`overrideGrade` 刷新，并将判定状态置为合格（PASS），大盘清空黄色卡片并展示合规明细；
  - **属性对齐（`PROPERTY_AMBIGUITY`）**：
    保留属性键名映射提交链路 `{ corrected_property_keys: ... }`。

---

## 三、质量门禁验证

### 1. 全量自动化测试回归
执行命令：
```powershell
pnpm test
```
**46 个测试套件，219 个测试用例全部 100% 绿色通过。**

### 2. TypeScript 严格类型检查
执行命令：
```powershell
pnpm exec tsc --noEmit
```
**0 错误，0 警告。**

### 3. Next.js 15 生产打包构建
执行命令：
```powershell
pnpm build
```
全量 12 个路由静态与动态打包构建成功，编译用时 2.8s。
