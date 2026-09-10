# 历史检验台账 (Audit Ledger) 动态关联与全息功能构建计划

本项目旨在将前端「历史检验台账」页面与服务端真实持久化的检验会话（以 Session 为单位，`.cache/audit/` 下已有 42 份真实 JSON 记录）进行全链路动态打通，解决当前仅有静态/本地缓存雏形、缺乏真实业务维度、主键冲突隐患及操作断层等问题。

---

## 核心设计与决策确认

1. **真实数据源对接**：彻底移除 `localStorage` 读取，全面接入 `/api/audit/save` 服务端 API；
2. **双轨溯源与主键解耦 (Specimen Identifier Resolver)**：
   - 解决 Batch No 与 Heat No 矛盾：采用 `batchKey = ${docId}_${batchNo || heatNo}_${subBatchIndex}` 作为底层唯一物理槽位主键；
   - 界面表头统一命名为 **「炉批 / 检验批号」**，采用双行工业排版：首行加粗展示核心主溯源号（优先 Batch No，若无则 Heat No），次行小字展示辅助炉号或 `[以炉定批]` 标识；检索时同时模糊匹配炉号与批次号；
3. **严格禁止 `font-mono`**：全局彻底清理所有 `font-mono` 类名，统一采用现代工业无衬线字体与 `tabular-nums` 等宽数字排版；
4. **全景比对矩阵快速查验抽屉 (Quick Audit Drawer)**：行内提供快捷查验按钮，异步按需读取完整比对报告（化学/力学/工艺/特约项），质检员无需覆盖工作台现场即可随时调阅历史核验凭据；
5. **两层树状模型与全息业务字段**：完整呈现执行标准、供货厂家、双轨制判定（SYS PASS/FAIL vs 人工终审 APPROVE/REJECT/待复核）、合规指标统计胶囊及 SHA-256 存证哈希。

---

## User Review Required

> [!IMPORTANT]
> - **字体样式约束**：全页面严格禁止使用 `font-mono`，所有数字及代码段采用系统标准工业无衬线字体 + `tabular-nums`。
> - **工作台回载联动**：点击【加载至工作台】时，复用主页面的未保存防覆盖警告确认弹窗（`isConfirmModalOpen`），保障质检现场数据安全。
> - **归档删除权限**：删除操作调用 `DELETE /api/audit/save?sessionId=...`，提供防误触二次确认对话框。

---

## Proposed Changes

### 1. 服务层与数据契约扩展 (Backend & Types)

#### [MODIFY] [audit-ledger.service.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/services/audit-ledger.service.ts)
- 扩展 `AuditSessionSummary` 契约，新增轻量级文档与批次摘要模型（`AuditDocSummary`、`AuditBatchSummary`）；
- 在 `listSessions()` 遍历 `.cache/audit/` JSON 时，提取各会话包含的牌号集合（`grades: string[]`）、标准集合（`standards: string[]`）、供应商集合（`suppliers: string[]`）以及轻量文档/批次列表；
- 避免下发大体积的全部原始测量数值，既保证列表请求毫秒级首屏，又满足前端两层树状展开的实时渲染需求。

---

### 2. 前端历史检验台账组件重构 (Frontend UI)

#### [MODIFY] [AuditLedger.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/AuditLedger.tsx)
- **数据流改造**：接入 `/api/audit/save`（支持加载态骨架屏、刷新按键、空状态处理）；
- **排版与字体**：全局移除所有 `font-mono`，统一使用系统现代无衬线字体与 `tabular-nums`；
- **顶部 KPI 看板**：统计归档会话总数、累计检验炉批数、综合合格率 (%)、待人工终审批次、系统拦截批次；
- **多维过滤体系**：
  - 状态快捷分类页签：全部 / 全项合格 (PASS) / 存在拦截 (FAIL) / 待人工终审 (Pending) / HITL 协同处理；
  - 复合模糊检索栏：同时支持检索 Session ID、炉批号、熔炼炉号、材料牌号、标准代号、供货商、质保书号；
- **Session 汇总卡片 (第 1 层)**：
  - 会话 ID、会话标题、归档时间、文档数与批次数；
  - 综合判定状态徽章（如 `双轨放行`、`系统拦截`、`待人工终审`）；
  - 涵盖标准标签（如 `NB/T 47019.5-2021`）与材料牌号标签；
  - 动作区：【展开/折叠】、【加载至工作台】、【删除归档】（带确认弹窗）；
- **文档与批次工业明细大表 (第 2 层)**：
  - 文档概览行（文件名、大小、页数、批次计数）；
  - 批次全息大表：
    1. 炉批 / 检验批号（智能双轨呈现）
    2. 材质单号 (MTC No)
    3. 材料牌号 (Grade)
    4. 执行标准 (Standard)
    5. 供货厂家 (Supplier)
    6. 规格尺寸 (Dimensions)
    7. 判定结论（系统判定 + 人工终审 + HITL 标记）
    8. 合规指标概览（如 20/20 项全绿或 1 项超标）
    9. 报告号与存证哈希（SHA-256，支持一键复制）
    10. 行内动作：【比对矩阵】、【加载此会话】；
- **全景比对矩阵快速查验抽屉 (Quick Audit Drawer)**：
  - 点击行内【比对矩阵】后，右侧滑出只读抽屉；
  - 若该会话尚未加载全量细节，自动异步拉取 `GET /api/audit/save?sessionId=...` 并缓存；
  - 展示化学成分、力学性能、工艺与探伤、特约条款等全量判定大表及规则条目，免切工作台即可速查。

---

### 3. 测试与质量门禁

#### [NEW] [audit-ledger.service.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/unit/audit-ledger.service.test.ts)
- 编写单元测试，覆盖 `AuditLedgerService`：
  - 验证 `listSessions()` 正确聚合两层摘要、提取 `grades`/`standards`/`suppliers`，以及解析双轨批次标识；
  - 验证 `getSession()` 完整提取与 `deleteSession()` 物理清理流程。

---

## Verification Plan

### Automated Tests
1. 类型检查：
   ```bash
   pnpm exec tsc --noEmit
   ```
   *预期结果*：0 错误。
2. 单元测试与端到端测试：
   ```bash
   pnpm test tests/unit/audit-ledger.service.test.ts
   pnpm test tests/e2e/four-tier-scenarios.test.ts
   ```
   *预期结果*：全部测试套件 100% 绿灯。

### Manual Verification
1. 启动并访问台账页面：
   - 确认无 `font-mono` 残留；
   - 确认能完整列出服务端真实 42 条历史检验台账；
   - 验证顶部 KPI 统计数字与过滤页签切换（全部/合格/拦截/待终审/HITL）即时生效；
   - 展开折叠卡片，核实炉批/检验批号双轨显示、执行标准、供货商、双轨制判定等字段是否准确规范；
   - 点击【比对矩阵】，测试右侧只读抽屉是否秒级拉取并正确渲染各项指标比对大表；
   - 测试【加载至工作台】的覆盖警告弹窗与现场恢复；
   - 测试【删除归档】弹窗与后端真实删除联动。
