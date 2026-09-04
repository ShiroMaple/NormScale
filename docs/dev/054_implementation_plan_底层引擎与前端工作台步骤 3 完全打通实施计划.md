# 底层引擎与前端工作台步骤 3 完全打通实施计划

本计划旨在实现底层比对引擎（`ComplianceEngine` / `MultiStandardComposer` / LangGraph 状态图）与前端工作台（`WaterfallWorkbench`）步骤 3 的**完全无缝贯通**，彻底根除所有硬编码文案、静态假数据与局部模拟特例。

---

## 用户审查与架构决策确认 (User Review Confirmed)

根据与用户的 `/grill-me` 深度研讨，核心技术路线与设计决策已形成高度共识：
1. **驱动架构**：以 LangGraph 状态图作为统一后端驱动，对前端暴露干净的 `POST /api/audit/submit` 契约，跳过冗余抽取，同步输出完整 `AuditReport`；
2. **触发策略**：步骤 3 进入、切换批次、改选标准或牌号时自动响应式核验（防抖与骨架 Loading）；**对历史台账载入的数据保留原汁原味历史报告，防静默重新核验**，保留【重新核验】手动按钮；
3. **矩阵数据源**：表格 100% 由引擎返回的 `AuditReport.item_results` 真实驱动，标准必检但未测项标记 `【✗ 漏检/未检验】`，质保书独占非标项作为 `【ℹ️ 供参考】` 排布在末尾；
4. **去硬编码**：彻底废除前端 `STANDARDS_CATALOG` 静态硬编码数组，由 `GET /api/standards` 动态返回全部已收录标准及其 31+ 个完整规格切片。

---

## 拟变更文件与组件划分 (Proposed Changes)

### 1. 后端工作流与状态图适配层 (Workflow & Graph Nodes)

#### [MODIFY] [extract.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/extract.node.ts)
- 增加结构化数据直通逻辑：检查入参，若已传入预解析的 `CertificateExtract` 或结构化 `BatchSpecimen`，直接跳过 Mock/OCR 提取，直通注入 `rawCertificate`。

#### [MODIFY] [normalize.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/normalize.node.ts)
- 兼容直通数据结构：若已包含标准化的 `test_records` 与 `header`，直接校验归一化输出，避免二次正则损耗。

#### [MODIFY] [retrieve-standard.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/retrieve-standard.node.ts)
- 升级为**多标准合成检索**：支持从 `options.forcedStandardIds` 或 `normalizedCert.header.declared_standard` 中解析多标准代号数组；
- 调用 `FileRuleStore.resolveCompositeSlice(standardIds, gradeKey)`，将生成的 `CompositeSlice` 与 `composite_meta` 注入工作流状态图。

#### [MODIFY] [deterministic-eval.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/deterministic-eval.node.ts)
- 升级为合成切片求值：调用 `ComplianceEngine.evaluateSlice(compositeSlice, normalizedCert)`，输出携带多标尺彩色标签、剪刀差归因、放宽法标风险标记（`is_statutory_relaxation_risk`）与双层主结论（`standard_compliance_verdict` / `agreement_compliance_verdict`）的完整 `AuditReport`。

#### [MODIFY] [submit/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/audit/submit/route.ts)
- 扩展 `SubmitAuditRequestSchema`：支持直接提交 `batchSpecimen: z.record(z.any())` 与 `standardIds: z.array(z.string()).optional()`，便于前端工作台开箱即用。

---

### 2. 标准库数据仓储与 API 暴露层 (Standards API)

#### [MODIFY] [standards/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/standards/route.ts)
- 增强返回契约：确保 `GET /api/standards` 返回的各标准元数据中，携带完整规格切片清单（包含切片代码、主牌号、中文显示名、描述、别名数组、所属大类等），满足前端下拉框多维检索需要。

---

### 3. 前端工作台完全去假与真值贯通 (WaterfallWorkbench UI)

#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- **彻底删除静态 `STANDARDS_CATALOG`**：
  - 改为从父级传入的 `standardsData` 或内部 Hook 动态派生标准与牌号下拉字典；
  - 动态渲染所有 31+ 规格切片（含 S30408, S31603, S32168, S34778, S31008 等全部工业牌号）；
- **建立工作台批次核验请求调度**：
  - 新增 `evaluateBatch(batch: BatchSpecimen, standardIds: string[], grade: string)` 辅助函数；
  - 接入 `POST /api/audit/submit`，将当前批次实测数据转为 `CertificateExtract` 输入并获取 `AuditReport`；
- **批次报告缓存与状态闭环**：
  - 在 `currentBatch` 中持久化 `auditReport`；
  - **台账载入安全机制**：检查 `currentBatch.auditReport` 是否已存在（来自历史台账保存），若是则直接复用历史结果，绝不自动重新发起核验；仅在用户主动更改标准、切换牌号或点击【重新核验】时才刷新；
- **全景比对矩阵彻底去硬编码**：
  - **彻底废除 `chemRows` 与 `complianceMatrixItems` 内部硬编码数组**；
  - **彻底删除断后伸长率 A 内部针对 35/40 的 if-else 局部写死代码**；
  - 表格数据直接遍历渲染 `currentBatch.auditReport.item_results`；
  - 标准要求列直接消费 `dual_standard_requirement_text` 与 `multi_standard_evaluations` 动态标签；
  - 偏差量列直接消费引擎计算的 `tolerance_delta` 与 `message`；
  - 判定状态列直接消费 `status`（`PASS` / `FAIL` / `MANUAL_REVIEW`）；
  - 规则依据列直接消费 `composite_trace.arbitration_reason` 或 `ruleBasis`；
  - 漏检项呈现：对 `status === 'FAIL'` 且 `message` 包含“未检测到/漏检”的必检项，以醒目警示样式呈现；
  - 质保书长尾非标项（如工程施工号等）以 `INFO` 标签规范附于表底。

---

## 验证计划 (Verification Plan)

### 1. 自动化接口与工作流测试
- 编写/运行 `tests/api/audit-submit-batch.test.ts`：
  - 验证传入真实 `batchSpecimen` 数据与 `['GB/T 13296-2023', 'NB/T 47019.5-2021']` 多标准时，工作流直通并毫秒级返回合法 `AuditReport`；
  - 验证加严剪刀差与放宽法标风险字段在接口返回中完整齐备。
- 执行全量回归测试：
  ```bash
  pnpm run typecheck
  pnpm test
  ```

### 2. 交互与界面端到端验证
- 启动本地开发服务：`pnpm run dev`；
- **场景 1：多标准动态切换真值测试**：
  - 在步骤 1 上传或选择质保书，进入步骤 3；
  - 在标准多选框中勾选 `GB/T 13296` 与 `NB/T 47019.5`，牌号选择 `S32168`；
  - 验证化学成分所有元素（C、Si、Mn、P、S 等）展现真实标准上下限与偏差量，绝无“符合标尺区间”硬编码文案；
  - 验证抗拉强度 $R_m$ 显示真实 $\ge 520\text{ MPa}$，屈服强度 $R_{p0.2}$ 显示真实 $\ge 205\text{ MPa}$；
  - 验证断后伸长率 $A$ 的加严剪刀差与归因标签来自引擎输出而非前端写死；
- **场景 2：历史台账载入防重算测试**：
  - 从顶部切换至“历史台账”，点击加载历史会话；
  - 切入步骤 3，验证历史核验结论与大表立即原位复原，未触发后台重算；
  - 手动修改材料牌号后，验证界面平滑触发重新核验并刷新大表。
