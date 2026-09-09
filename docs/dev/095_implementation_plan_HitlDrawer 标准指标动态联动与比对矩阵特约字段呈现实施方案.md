# HitlDrawer 标准指标动态联动与比对矩阵特约字段呈现实施方案

## 背景与问题陈述

用户在针对典型场景（Case 4 及 Case 3）进行实测验证中提出以下两点关键问题与复验要求：
1. **下拉选项动态联动**：在人机协同（HITL）抽屉中选择“映射对齐至现行标准指标”时，下拉框选项目前为写死的 5 个静态力学选项（冲击功、抗拉、屈服、硬度、伸长率），未根据当前选定标准（如 `NB/T 47019.5-2021`）及材料牌号规则池动态加载指标条目。
2. **比对矩阵缺失 HITL 裁定字段**：质检员在 HITL 侧边栏中对特种非标指标（如 `特种非标抗剪切断裂韧度 K1C`）进行处置裁定（例如选择“认可为供需协议特约合格项 (放行 PASS)”）并恢复流转后，该指标未在步骤 3 的“全景合规比对矩阵”大表中列出，导致质检审核结果在表格中丢失。
3. **Case 3 复验**：重新复验无缓存真实核验流转下 Case 3 表面外观质量（合格）与表面粗糙度（1.50 μm 超标 FAIL 一票否决）的判定表现。

---

## 拟实施的变更细节

### 1. 工作流与状态节点增强

#### [MODIFY] [normalize.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/normalize.node.ts)
- 当质检员选择协议特约项（`special_protocol_item`）或拒绝项时，在改写 `property_key` 的同时保留原始名称 `raw_property_name` 与 `display_name`，打标 `is_special_protocol = true`，避免名称丢失。

#### [MODIFY] [decision-aggregator.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/decision-aggregator.node.ts)
- 在组装最终 `AuditReport` 时，挂载 `human_correction`（包含质检员审批说明 `waiver_notes`、修正键值映射及质检员标识），确保前端工作台可完整读取质检裁定依据。

---

### 2. HITL 抽屉交互与规则动态联动

#### [MODIFY] [HitlDrawer.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/HitlDrawer.tsx)
- 拓展 `HitlDrawerProps`，新增 `candidateRules?: Array<{ key: string; name: string; category?: string; requirement_text?: string; unit?: string; }>`；
- 彻底移除写死的 5 项静态 `<option>`，改为基于 `candidateRules`（或从 `hitlContext` 中携带的候选规则池）按专业分类（化分、力学、工艺、金相、探伤、表面等）使用 `<optgroup>` 分组动态渲染；
- 下拉选项文本清晰展示：`[中文名称] (属性键) — 标准要求与单位`，方便质检员精准对齐。

---

### 3. 工作台全景比对矩阵纳管特约与非标项

#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 在向 `HitlDrawer` 传递 props 时，提取当前批次适用的全量标准规则清单作为 `candidateRules` 传入；
- 重构 `complianceMatrixItems` 组装逻辑：
  - 除了现有的 `currentBatch.auditReport.item_results`，全面遍历 `auditReport.unmatched_certificate_records` 以及批次中已登记的 HITL 裁定项；
  - **协议特约放行项**（`special_protocol_item` / 质检特批）：展示原始项目名（如 `特种非标抗剪切断裂韧度 K1C`）、实测值（如 `42.5 MPa·m^0.5`）、要求规范（`订货技术协议特约增补条款`）、判定状态 `✓ PASS`（徽标：`协议特约放行`），在判定逻辑一栏完整呈现质检员填写的审批依据；
  - **特种非标否决项**（`unrecognized_rejected_item`）：展示实测值、判定状态 `✗ FAIL`（徽标：`特种非标否决`），并在问题项大盘中正常归类；
  - **常规额外报送项**：展示实测值，判定状态 `- N/A`（徽标：`额外报送`，供参考）；
  - **映射对齐项**：若质检员将字段映射到标准指标，在对应标准行打上 `HITL人工对齐` 徽标并追加质检说明。

---

## 验证计划

### 1. 自动化测试
- 运行场景矩阵 E2E 测试：
  `pnpm test tests/e2e/four-tier-scenarios.test.ts`
- 运行工作流与消歧集成测试：
  `pnpm test tests/workflow/llm-property-resolver.test.ts`
- 全量单测套件通过验证：
  `pnpm test`
- 类型检查：
  `pnpm type-check` 或 `pnpm exec tsc --noEmit`

### 2. 实机浏览器子代理复验
- 启动本地服务 `http://localhost:3000`；
- **Case 4 复验**：
  1. 切换到 Case 4，观察进入 HITL 状态；
  2. 打开 HITL 抽屉，检查“映射对齐至现行标准指标”中的下拉选项是否已动态展示当前标准的完整规则分类（化分、力学、工艺、金相、探伤、表面等）；
  3. 选择“认可为供需协议特约合格项 (放行 PASS)”，输入审批说明后点击“确认并恢复流转”；
  4. 验证比对矩阵表格底部【非标与扩展】中是否清晰呈现 `特种非标抗剪切断裂韧度 K1C`、实测值、`✓ PASS`（协议特约放行）以及审批说明。
- **Case 3 复验**：
  1. 切换到 Case 3 执行无缓存重新核验；
  2. 验证表面外观质量正常判定为 `PASS`，表面粗糙度对齐后判定为 `FAIL 超标`，整单结论为 FAIL。
