# 质量证明书 Schema 检验项目动态解耦与反射架构升级计划（已融合反馈优化）

## 概述

本方案旨在响应业务与真实单据质检需求，对 [src/schemas/certificate.schema.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/schemas/certificate.schema.ts) 及下游抽取、验证与展示链路进行全景式动态化升级：
1. **显式解耦无损探伤**：将原单一字符串 `ndt` 解耦为独立的 `ndt_et`（涡流检测）与 `ndt_ut`（超声波检测）；
2. **支持弹性检验数组与推荐规范字典**：在 Schema 中引入 `additional_tests` 弹性检验数组契约，并在 Prompt 模板中内置常用长尾检验项推荐命名枚举（如 `ndt_pt`, `ndt_mt`, `proc_hydraulic`, `proc_bending`），约束模型归类，彻底消除命名碎片化；
3. **运行时 Schema 反射与内存缓存 (Memoization)**：由 `certificate.schema.ts` 统一反射派生 Prompt 结构模板、BBox 闭集白名单、前端提取核验表格等，并对反射结果进行模块级内存缓存，消除重复 CPU 开销；
4. **前端 UI 防御性容错渲染**：为长尾弹性字段提供完整降级策略，当 `value_num` 或 `unit` 缺失时自动安全回退至纯文本展示，防止空指针与渲染异常。

---

## 核心设计与用户反馈落地

> [!IMPORTANT]
> **1. 探伤项字段命名契约规范与长尾项推荐约束**
> - **核心预设项**：
>   - 涡流检测：`ndt_et`（BBox ID: `ndt_et`，依据方法: `method_ndt_et`，标准参考: `GB/T 7735`）；
>   - 超声波检测：`ndt_ut`（BBox ID: `ndt_ut`，依据方法: `method_ndt_ut`，标准参考: `GB/T 5777`）；
> - **长尾弹性推荐命名约束 (Prompt 规范引导)**：
>   在 Prompt 模板中显式声明推荐的常用长尾 key 与中文映射：
>   `proc_hydraulic` (水压试验), `ndt_pt` (渗透检测), `ndt_mt` (磁粉检测), `proc_bending` (弯曲试验), `mech_impact` (夏比冲击), `mech_high_temp_tensile` (高温拉伸) 等，引导模型遵循统一标准，避免命名分化。

> [!TIP]
> **2. 运行时反射性能优化 (In-Memory Memoization)**
> - 对 `getCertificateInspectionFieldDefinitions()`、`getValidBBoxIdWhitelist()` 以及动态模板构建函数引入模块级惰性缓存（Lazy Cache）；
> - 首次调用时反射生成并缓存在内存变量中，后续调用均为 $O(1)$ 毫秒级内存读取，确保高并发调用下的极致性能。

> [!NOTE]
> **3. 前端 UI 严谨防御性渲染**
> - 在 [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx) 的核验大表与全景矩阵中，严格执行 Optional Chaining (`?.`) 与空值回退（`?? '--'`）；
> - 若 `value_num` 存在且有效则展示数值与修约，若不存在则无缝回退展示 `result` / 纯文本描述，杜绝因格式不齐引发的组件奔溃。

---

## 拟定改动文件与实施步骤

### 1. Schema 契约与反射缓存层 (`src/schemas/certificate.schema.ts`)

#### [MODIFY] [certificate.schema.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/schemas/certificate.schema.ts)
- **定义 `AdditionalTestItemSchema`**：包含 `key`, `name`, `category`, `standard`, `result`, `value_num`, `unit`, `conclusion`；
- **定义 `BatchInspectionSchema`**：包含核心理化（化学、拉伸、硬度）、工艺（压扁、扩口、晶间腐蚀、晶粒度）、无损（`ndt_et`, `ndt_ut`, 兼容旧 `ndt`）及 `additional_tests: z.array(AdditionalTestItemSchema)`；
- **定义长尾常用推荐项字典 `RECOMMENDED_ADDITIONAL_TEST_KEYS`**；
- **实现带 Memoization 的反射函数**：
  - `getCertificateInspectionFieldDefinitions()`（带缓存）；
  - `getValidBBoxIdWhitelist()`（带缓存，包含所有表头 ID、化学元素 ID、工艺力学探伤 ID 及依据方法 ID）；
  - `buildDynamicSchemaStructureTemplate()`（带缓存，注入推荐规范）。

---

### 2. 抽取层与 Prompt 动态适配 (`src/extractor/`)

#### [MODIFY] [prompt-builder.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/extractor/prompt-builder.ts)
- 废除静态写死的 `STANDARD_PHYSICAL_FIELDS`；
- 统一消费 `certificate.schema.ts` 的动态反射与带缓存白名单；
- 动态注入带有长尾规范约束的 Prompt 模板。

#### [MODIFY] [openai-compatible-extractor.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/extractor/openai-compatible-extractor.ts)
- 在 `formatToSessionDocument` 中适配 `ndt_et`, `ndt_ut` 与 `additional_tests`；
- 具备对历史兼容字段 `ndt` 的自动平滑回填与降级机制。

---

### 3. 会话模型契约 (`src/types/session.ts`)

#### [MODIFY] [session.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/types/session.ts)
- 更新 `BatchSpecimen.process`：包含 `ndt_et?: string`, `ndt_ut?: string`, `ndt?: string`；
- 在 `BatchSpecimen` 增加 `additionalTests?: AdditionalTestItem[]`。

---

### 4. 前端工作台动态表格与防御性渲染 (`src/components/WaterfallWorkbench.tsx`)

#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 步骤 2 提取核对总览表 (`allExtractItems`)：
  - 动态从 Schema 反射配置渲染 `ndt_et`（涡流）与 `ndt_ut`（超声）；
  - 动态安全映射 `currentBatch.additionalTests`，对缺失 `value_num`/`unit` 进行纯文本优雅降级；
  - 保持独立 BBox Hover 悬浮高亮与 150% 视网膜聚光灯放大联动；
- 步骤 2 独立子 Tab 视图 (`activeTabCategory === 'ndt'`)：
  - 并列呈现“涡流检测 (ET)”与“超声波检测 (UT)”独立卡片及附加探伤卡片；
- 步骤 3 全景比对矩阵 (`complianceMatrixItems`)：
  - 分别对 `ndt_et` 与 `ndt_ut` 挂载独立合规比对；
  - 动态纳入 `additionalTests` 项比对；
- 内联就地编辑 (`handleFieldInlineEdit`)：
  - 支持 `ndt_et` 与 `ndt_ut` 的实时保存。

---

### 5. 系统配置与缓存版本联动 (`config.json`)

#### [MODIFY] [config.json](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/config.json)
- 将 `parser.version` 递增为 `1.1.0`。

---

## 验证计划 (Verification Plan)

1. **类型安全**：`pnpm typecheck` 严格 0 错误；
2. **测试回归**：`pnpm test` 运行全部测试套件，新增对 `ndt_et`/`ndt_ut`、Schema 反射缓存及防御性渲染的单测覆盖；
3. **真实样本验证**：验证单测及真实质保书解析，确认涡流检测与超声波检测被正确解耦为两个独立试验项目。
