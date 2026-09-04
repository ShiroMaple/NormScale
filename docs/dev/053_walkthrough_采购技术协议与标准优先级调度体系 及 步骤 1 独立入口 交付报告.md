# 采购技术协议与标准优先级调度体系 及 步骤 1 独立入口 交付报告

根据技术协议业务准则共识与用户明确指示，本阶段完成了两项核心交付：
1. **比对引擎升级**：构建五级标准/协议优先级调度体系（技术协议最高优先），实现加严主导与放宽法标风险拦截的分级管控机制，并输出分立的双层主结论（法定制造标准 vs 采购技术协议）；
2. **前端步骤 1 独立入口**：压缩已有质保书上传框宽度，在待处理文档队列右侧新增独立的“采购技术协议上传”卡片，限定单会话仅上传 1 份 PDF，并标明【功能待实施 · 暂未接入后端】。

---

## 一、核心变更清单

### 1. 核心比对引擎层：优先级调度与放宽法标风险分级管控
- **五级优先级梯队调度**：[`src/engine/multi-standard-composer.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/multi-standard-composer.ts)
  - 定义 `StandardCategory` 类别与 `inferStandardCategoryAndPriority` 自动推导函数：
    - **P1 采购技术协议 (`technical_agreement`, 优先级 1)**：双方要约特别约定，默认最高优先；
    - **P2 行业/专用订货标准 (`industry_standard`, 优先级 2)**：如 `NB/T 47019.5`；
    - **P3 企业标准 (`enterprise_standard`, 优先级 3)**：企业内控标准；
    - **P4 国家制造基础标准 (`national_standard`, 优先级 4)**：如 `GB/T 13296`，法定出厂基准；
    - **P5 国际及其他标准 (`international_standard` / `other`, 优先级 5)**。
  - **协议加严主导**：当技术协议提出更严指标（如断后伸长率加严至 $\ge 560\text{ MPa}$）时，自动主导规则合成生效，并标识归属协议。
  - **放宽法标风险拦截与底线留存**：
    - 当技术协议逆向放宽国家标准底线（如磷含量放宽至 $\le 0.040\%$）时，合成规则采纳协议指标，但置位 `is_statutory_relaxation_risk: true`；
    - 记录法定基准要求 `statutory_baseline` 并输出警示文案 `statutory_relaxation_warning`。
- **合规核验与双层主结论生成**：[`src/engine/core.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/core.ts)
  - `evaluateSingleRule` 向上透传放宽法标风险字段；
  - `computeDualVerdicts` 实现主结论分立：
    - `standard_compliance_verdict`：法定制造标准符合性（若实测违反国标，即使符合技术协议亦如实判定 `FAIL` 或 `MANUAL_REVIEW`）；
    - `agreement_compliance_verdict`：采购技术协议符合性（满足协议指标即评定为 `PASS`）；
    - `statutory_risk_flag: true`：全局挂起人工特批与合规复核门禁。

### 2. 数据契约与报告 Schema
- **数据结构扩展**：[`src/schemas/report.schema.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/schemas/report.schema.ts)
  - 扩展 `RuleEvaluationItemResultSchema`：
    - `is_statutory_relaxation_risk?: boolean`：放宽法定底线风险标志；
    - `statutory_baseline?: string`：法定标准基准限值；
    - `statutory_relaxation_warning?: string`：合规警示文本。
  - 扩展 `AuditReportSchema`：
    - `standard_compliance_verdict?: EvaluationStatus`：法定标准主结论；
    - `agreement_compliance_verdict?: EvaluationStatus | 'NOT_APPLICABLE'`：采购技术协议主结论；
    - `statutory_risk_flag?: boolean`：全单放宽法标风险全局预警。

### 3. 前端交互层：步骤 1 独立上传入口（待实施状态）
- **步骤 1 顶行三栏栅格重构**：[`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
  - **宽度压缩**：原左侧质保书上传虚线框由原先宽度调整压缩至 `lg:col-span-4 xl:col-span-5`；
  - **中间队列**：待处理文档队列调整为 `lg:col-span-5 xl:col-span-4`；
  - **新增右侧卡片**：在待处理文档队列右侧新增 `lg:col-span-3 xl:col-span-3` 的【技术协议上传】独立卡片。
- **业务约束与生命周期**：
  - **单会话单份限制**：会话级 `uploadedAgreementFile` 状态严格限定仅允许 1 份协议文件；
  - **格式严格限定**：文件选择器限制 `accept=".pdf"`，并在拖拽与选择入口执行文件类型防御性校验（非 PDF 弹出友好提示）；
  - **明确待实施状态**：
    - 空白未传态：展示“点击或拖拽技术协议 PDF 至此处”、“单会话限额 1 份”及紫色虚线框；
    - 已选择状态：卡片展示紫青色文档图标、文件名、文件大小、重选/移除按钮，并高亮标示【功能待实施 · 暂未接入后端】；
    - **完全隔离后端**：未向后端发起任何请求，确保不干扰已有质保书批处理管线。

---

## 二、测试与质量验证

```bash
# 1. 严格 TypeScript 类型检查 (0 错误)
pnpm run typecheck

# 2. 全量单元测试套件 (38 个测试文件，178 个用例 100% 绿色通过)
pnpm test
```

### 专项测试覆盖
1. `tests/engine/multi-standard-composer.test.ts`：
   - 采购技术协议 (TA) 默认优先级最高：加严指标（如 $R_m \ge 560\text{ MPa}$）主导生效；
   - 分级管控：当技术协议放宽法定强标底线（如磷含量放宽至 $0.040\%$）时，采纳协议限值并正确置位 `is_statutory_relaxation_risk: true` 与预警文案。
2. `tests/engine/multi-standard-evaluation.test.ts`：
   - 技术协议与国标多标准评估端到端流转；
   - 放宽法标风险场景下，双层主结论分立评定（国标 `FAIL`、协议 `PASS`、`statutory_risk_flag: true`）。

---

## 三、Project Cairn 知识沉淀
- **知识专题原地更新**：[`cairn/multi-standard-engine.md`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/multi-standard-engine.md) 第 5 节《采购技术协议优先级调度与法标放宽风险管控》；
- **项目日志同步**：[`cairn/LOG.md`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/LOG.md) 顶部追加 `2026-09-04` 里程碑记录；
- **路线图更新**：[`cairn/ROADMAP.md`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/ROADMAP.md) 开放问题 6 标记为引擎已闭环、前端入口就绪。
