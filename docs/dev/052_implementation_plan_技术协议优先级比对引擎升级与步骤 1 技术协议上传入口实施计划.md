# 技术协议优先级比对引擎升级与步骤 1 技术协议上传入口实施计划

根据上一阶段 `/grill-me` 达成的共识，技术协议具有专有合同要约性质，在行业中默认拥有最高优先级（【技术协议 (TA)】 > 【行业订货标 (NB)】 > 【国家基础标 (GB)】）。本项目分两部分落地：
1. **比对引擎与数据契约升级**：支持标准类别（Category）、优先级权重、共有项加严与逆向放宽（法标风险预警）检测，以及生成法定标准与技术协议的双层主结论；
2. **前端工作台步骤 1 上传区改造**：压缩现有质保书上传框宽度，在待处理文档队列右侧新增单份 PDF“技术协议上传（待实施）”交互卡片。

---

## Proposed Changes

### 1. 比对引擎与契约模型升级

#### [MODIFY] [report.schema.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/schemas/report.schema.ts)
- 在 `RuleEvaluationItemResultSchema` 中增加放宽风险字段：
  - `is_statutory_relaxation_risk?: boolean;` （技术协议放宽了国家/行业强标底线）
  - `statutory_baseline?: string;` （被放宽的国家/行业标准底线限值）
  - `statutory_relaxation_warning?: string;` （放宽法标风险告警说明）
- 在 `AuditReportSchema` 中增加双层符合性主结论：
  - `standard_compliance_verdict: 'PASS' | 'FAIL' | 'MANUAL_REVIEW';` （法定/制造标准符合性）
  - `agreement_compliance_verdict: 'PASS' | 'FAIL' | 'MANUAL_REVIEW' | 'NOT_APPLICABLE';` （采购技术协议符合性）
  - `statutory_risk_flag: boolean;` （是否存在合同放宽法标风险）

#### [MODIFY] [multi-standard-composer.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/multi-standard-composer.ts)
- 扩展 `SliceWithMeta` 类型：增加 `category?: 'technical_agreement' | 'industry_standard' | 'national_standard' | 'enterprise_standard'` 和 `priority?: number`；
- 在 `composeMultiStandardSlices` 中：
  - 依据 `priority` 或 `category` 自动建立优先级梯度（技术协议默认最高）；
  - 当共有项目存在指标差异时：
    - 若高优先级协议要求更严（如提高下限/降低上限/提高探伤等级），按严苛交集合并，标记 `is_governing_strict: true`；
    - 若高优先级协议要求宽于低优先级法定标准（如放宽公差/下限降低），采纳协议要求，但置位 `is_statutory_relaxation_risk: true` 并记录 `statutory_baseline` 与警示文案；
  - 在 `CompositeTrace` 补充 `statutory_baseline` 与 `relaxation_warning`。

#### [MODIFY] [core.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/core.ts)
- 在 `evaluateSingleRule` 中透传 `statutory_relaxation_risk` 属性；
- 当实测值落在“满足技术协议但低于国标底线”的放宽区间时，评定单项状态为 `PASS`，但挂载告警，并置位整份报告的 `statutory_risk_flag = true`；
- 在 `evaluateSlice` 汇总报告时生成双层结论：
  - `standard_compliance_verdict`（综合国标与行标各项独立判定）；
  - `agreement_compliance_verdict`（综合技术协议各项判定）；
  - 并赋给报告顶层。

---

### 2. 前端工作台步骤 1 上传交互

#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 在会话中新增组件本地状态：`uploadedAgreementFile: File | null`；
- 将步骤 1 第一行布局由双栏调整为三栏网格：
  - 左侧：质保书上传大虚线框（宽度由 `lg:col-span-6 xl:col-span-7` 压缩为 `lg:col-span-4 xl:col-span-5`）；
  - 中间：待处理文档队列（`lg:col-span-5 xl:col-span-4`）；
  - 右侧：**技术协议上传卡片**（`lg:col-span-3 xl:col-span-3`）；
- 技术协议卡片交互规范：
  - 标题：“采购技术协议 (TA)”；
  - 右上角徽标：“待实施” (Amber/Purple 标签)；
  - 限制：仅支持单份文件、限定 `.pdf` 格式；
  - 未选择文件时：显示技术协议专属上传虚线卡片，支持点击选文件与拖拽；
  - 已选择文件时：显示 PDF 图标、协议文件名、文件大小、移除按钮以及“【功能待实施】已暂存于当前会话，暂未接入后端解析”提示；
  - 暂时不向后端 API 发送上传或解析请求。

---

## Verification Plan

### Automated Tests
1. 运行 `pnpm test tests/engine/multi-standard-composer.test.ts`：验证多标准协议优先级合成、加严生效与放宽法标风险标记；
2. 运行 `pnpm test tests/engine/multi-standard-evaluation.test.ts`：验证双层结论（法定标 vs 技术协议）及放宽区间单项测试；
3. 全量运行 `pnpm test`：确保 38 个测试套件 100% 绿色通过；
4. 全量运行 `pnpm typecheck`：`tsc --noEmit` 0 错误。

### Manual Verification
1. 打开步骤 1，观察三栏网格布局视觉自适应，质保书上传框宽度自然收缩；
2. 拖拽或点击选取一个技术协议 PDF 文件，验证能够正确显示文件名、文件大小和“待实施”徽标，并验证点击“移除”按钮能够清空重选；
3. 验证选取非 PDF 文件或多次添加时具有防御性校验与提示。
