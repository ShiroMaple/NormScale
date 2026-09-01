# 前端代码全量硬编码深度审计、默认会话隔离与弹窗动态化完成报告

## 1. 任务概述

依据用户指示，我们针对此前前端开发中遗留的硬编码问题进行了逐段深入的语义理解与系统性重构，涵盖：
1. **默认演示会话严格隔离**：`DEFAULT_INSPECTION_SESSION` 仅作为演示用途的历史检验台账（`AuditLedger`）留存，绝不进入正常工作台检验流程；
2. **步骤 2 压扁/扩口/晶间腐蚀输入回弹与硬编码修复**：移除强制二值化截断逻辑，完整保留用户输入的任何文本，消除假置信度与静态告警；
3. **工作台空会话保护与空状态防御**：在未上传文档时阻断跳步至步骤 2/3，并在各步骤视窗展示工业级空状态提示卡片；
4. **弹窗与模态框全面动态化**：对 `PassReleaseModal.tsx`、`RejectionNoticeModal.tsx`、`CertificateViewer.tsx` 进行彻底去硬编码，清除写死的供应商、炉批号、尺寸、15 项假数据表格及假工号；
5. **数据模型契约与 BBox 规范化**：`src/types/bbox.ts` 标签去硬编码，`src/schemas/report.schema.ts` 扩展可选元数据字段；
6. **自动化回归与类型验证**：新增 `tests/extractor/session-isolation.test.ts`，28 个测试套件（125 个测试）全部通过，TypeScript 0 错误。

---

## 2. 核心修改明细

### A. 核心工作台 `WaterfallWorkbench.tsx`
- **会话纯净化与空会话初始化**：
  - `session` 默认初始化为 `documents: []` 的纯净空会话；
  - `currentDoc` 和 `currentBatch` 彻底移除对 `DEFAULT_INSPECTION_SESSION` 的 fallback，当无活动文档时保持 `undefined`；
  - `goToStep` 增加门禁拦截：若 `session.documents.length === 0` 且 `stepIdx > 0`，提示 `请先在步骤 1 上传或选择待检验文档` 并阻止跳步；
  - 步骤 2、步骤 3、步骤 4 增加 `(!currentDoc || !currentBatch)` 时的工业级空状态卡片（包含“前往步骤 1 上传文档”快捷按钮）；
  - `handleStartNewTask` 重置为纯净空会话；
  - 修复 Step 4 纸张预览中写死的日期 `2026-08-26 15:30` 与假签名 `Signature (QA)`。
- **压扁试验与晶间腐蚀试验修复**：
  - `handleUpdateExtractValue` 移除强制二值化为 `'PASS' | 'FAIL'` 的截断逻辑，直接保留用户的真实实测输入字符串；
  - `allExtractItems` 移除 `proc_flattening`、`proc_flaring`、`corrosion_intergranular` 的假置信度（98%/50%）与静态“未检测到”告警，依据方法由写死国标改为动态通用代号；
  - 工艺性能、耐腐蚀试验及表面质量独立专业子 Tab 100% 依据真实存在项动态渲染；
  - Step 3 全景比对矩阵判定逻辑支持各类肯定性非 FAIL 文本判定。

### B. 弹窗与模态框全面动态化
- **[PassReleaseModal.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/PassReleaseModal.tsx)**：
  - 清除写死供应商（`浙江某特种不锈钢管道实业有限公司`）、炉批号（`H304-8891 / LOT-889101`）、规格（`38.0mm × 3.0mm × 6000mm`）及硬编码 15 项指标表格 fallback；
  - 动态读取 `report` 真实字段，当 `item_results` 为空时展示优雅空提示；
  - 签名人员动态绑定 `inspectorName` 与 `supervisorName`。
- **[RejectionNoticeModal.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/RejectionNoticeModal.tsx)**：
  - 动态生成处置说明文本与单据编号 `RJN-YYYYMMDD-XXXX`；
  - 条款依据动态绑定真实执行标准代号，移除固定假条款序号（如 `第 6.4.1 条`）；
  - 签核责任人动态绑定 `inspectorName` 与 `supervisorName`。
- **[CertificateViewer.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/CertificateViewer.tsx)**：
  - 供货单位、标准、牌号、炉批号、几何规格与热处理状态全部改为 100% 动态读取 `report`。

### C. 历史台账与数据模型
- **[AuditLedger.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/AuditLedger.tsx)**：
  - 当本地 `localStorage` 无存储会话时，承载并展示 `DEFAULT_INSPECTION_SESSION` 作为一份演示用途的历史检验台账记录。
- **[bbox.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/types/bbox.ts)**：
  - 移除 BBox label 中如 `合格 OK`、`GB/T 246-2017` 等硬编码判定结果，重命名为通用语义指标指示（如 `压扁试验实测结果`、`压扁试验依据标准`）。
- **[report.schema.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/schemas/report.schema.ts)**：
  - 在 `AuditReportSchema` 中补充 `supplier_name`, `heat_number`, `lot_number`, `dimensions`, `delivery_state`, `inspector`, `supervisor` 等可选上下文元数据字段。

---

## 3. 验证结果

### 自动化测试套件
执行 `pnpm test`：
```
Test Files  28 passed (28)
     Tests  125 passed (125)
  Duration  3.97s
```
- 新增测试套件 `tests/extractor/session-isolation.test.ts` 覆盖：
  - `DEFAULT_INSPECTION_SESSION` 演示台账完整性校验；
  - 纯净空 Session 初始化隔离校验；
  - 动态 `AuditReport` 契约元数据校验；
  - BBox 语义标签泛化校验。

### TypeScript 严格类型检查
执行 `pnpm typecheck`：
```
$ tsc --noEmit
# 0 错误通过
```
