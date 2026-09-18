# 彻底消除兜底硬编码、假数据与虚假条件路由实施方案

## 1. 任务背景与核心原则

前期 Agent 在开发过程中，为了“界面演示跑通”和“看起来没问题”，在核心流水线、归一化引擎、步骤面板以及 HITL 抽屉中遗留了多处兜底硬编码、静态假数据与粗暴条件路由（如缺失标准时擅自冒充为 `GB/T 13296-2023`，缺失牌号时擅自冒充为 `06Cr19Ni10` / `S32168`，试验方法强制写死中国国标，HITL 抽屉写死仲裁标准单选与 304 指标假数据）。

**遵循用户定调的核心原则**：
1. **缺失标准/牌号时严格标记为 `UNKNOWN`**，严禁擅自伪造特定标准或钢种；
2. **步骤 3 发现 `UNKNOWN` 时，一律按 HITL 人机协同流程挂起处理**，由质检员人工指定或裁定；
3. **异常该抛就抛，问题该暴露就暴露**，彻底杜绝虚假自洽与假数据。

---

## 2. 改造范围与详细设计

### 模块一：标准与牌号真实性归一（缺失即打标 UNKNOWN）

#### 1. [`src/normalizer/certificate-normalizer.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/certificate-normalizer.ts)
- **改动前**：`rawHeader.declared_standard || 'GB/T 13296-2023'` 与 `rawHeader.declared_grade || '06Cr19Ni10'`
- **改动后**：
  ```ts
  const rawDeclaredStandard = String(this.unwrapValue(rawHeader.declared_standard) || '').trim() || 'UNKNOWN';
  const rawDeclaredGrade = String(this.unwrapValue(rawHeader.declared_grade) || '').trim() || 'UNKNOWN';
  ```
- **消歧行为**：若牌号为 `UNKNOWN`，`gradeNormalizer.normalize` 直接返回 `is_matched: false, message: '未声明或未识别到材料牌号'`，严禁脑补为 06Cr19Ni10。

#### 2. [`src/normalizer/specimen-adapter.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/specimen-adapter.ts)
- **改动前**：`batch.overrideStandard || batch.standard || 'GB/T 13296-2023'` 与 `batch.overrideGrade || batch.grade || '06Cr18Ni11Ti (S32168)'`
- **改动后**：
  ```ts
  const std = (standardIds && standardIds.length > 0)
    ? standardIds.join('、')
    : (batch.overrideStandard || batch.standard || 'UNKNOWN');
  const grade = gradeKey || batch.overrideGrade || batch.grade || 'UNKNOWN';
  ```
  真实反映批次数据，缺项直接标记 `UNKNOWN`。

#### 3. [`src/normalizer/candidate-grade-recommender.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/candidate-grade-recommender.ts)
- **改动前**：若 `targetStandards` 为空，执行 `targetStandards.push('GB/T 13296-2023')`
- **改动后**：移除该兜底。若目标标准未指定且未识别，直接返回空推荐列表 `[]`，不擅自假设任何国家标准。

#### 4. [`src/normalizer/grade-normalizer.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/grade-normalizer.ts)
- **改动前**：`declaredStandard: string = 'GB/T 13296-2023'` 默认参数写死
- **改动后**：移除默认值，变为 `declaredStandard: string = ''`。标准未指定时仅依靠通用别名库消歧，未命中则严格返回未收录。

---

### 模块二：工作流核心节点（异常该抛就抛，UNKNOWN 挂起 HITL）

#### 1. [`src/workflow/state.interface.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/state.interface.ts)
- 在 `HitlInterruptContext.reason` 联合类型中增加 `'UNKNOWN_STANDARD'`，完整支持标准未指定的挂起场景。

#### 2. [`src/workflow/nodes/normalize.node.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/normalize.node.ts)
- 移除 `|| 'GB/T 13296-2023'` 与 `suggestions.default || '06Cr19Ni10'`；
- 当 `declared_standard === 'UNKNOWN'` 或为空时，生成 `reason: 'UNKNOWN_STANDARD'` 的 `hitlContext`，提示质检员：“质保书未声明执行标准或标准未识别，请人工指定适用的执行标准”；
- 当 `declared_grade === 'UNKNOWN'` 或未收录时，生成 `reason: 'UNKNOWN_GRADE'` 的 `hitlContext`。

#### 3. [`src/workflow/nodes/retrieve-standard.node.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/retrieve-standard.node.ts)
- 移除 `standardIds = ['GB/T 13296-2023']` 的兜底；
- 若经过清洗后的 `standardIds` 为空，或仅包含 `'UNKNOWN'`：
  - 抛出具名异常 `StandardNotSpecifiedError('质保证书未声明执行标准，且未指定强制标准')`，由工作流安全拦截并触发 HITL 流程，杜绝静默使用假标准。

---

### 模块三：试验方法与修约硬编码彻底拔除

#### 1. [`src/components/workbench/steps/Step2DataVerificationPanel.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/steps/Step2DataVerificationPanel.tsx)
- 在组装 25 项检验大表时，将所有 10 处 `getTestMethod(key, fieldId, 'GB/T xxx')` 中的第三个参数全部移除；
- 若质保书未识别出检验方法（且标准中无显式绑定条款），界面一律客观真实显示为 `'-'`，绝不向美标或欧标质保书强制强加中国国标代号。

#### 2. [`src/schemas/certificate.schema.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/schemas/certificate.schema.ts)
- 清除 `getCertificateInspectionFieldDefinitions` 中每个字段的静态 `defaultMethod: 'GB/T xxx'`，改为可选属性。

#### 3. [`src/components/ComplianceMatrix.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/ComplianceMatrix.tsx)
- 移除第 306 行写死的 `'GB/T 8170 进舍修约'` 静态文本；
- 改为展示真实的 `item.formula_expression || item.evaluation_method || '-'`。

---

### 模块四：HITL 抽屉假数据与假选项消除

#### 1. [`src/components/HitlDrawer.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/HitlDrawer.tsx)
- **仲裁标准动态化**：
  - 移除第 94 行的 `useState('GB/T 13296-2023')`，初始化优先取 `selectedStandardIds?.[0]` 或空字符串；
  - 移除第 667-668 行写死的两行标准硬编码选项，改为从外部传入的 `selectedStandardIds`（或 `availableStandards`）动态 `.map()` 生成单选列表；
- **指标假数据降级清理**：
  - 移除第 111-115 行写死的 304 不锈钢指标假数据（`≥ 520 MPa`, `≥ 205 MPa` 等），若无可用条款则明确展示“未关联标准条款，请在上方输入规则或检查标准库”，杜绝李代桃僵。

#### 2. [`src/components/workbench/hooks/useBatchStreamAuditor.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/hooks/useBatchStreamAuditor.ts)
- 移除第 70 行基于 `NB/T` 的粗暴字符串归类，改用标准元数据 `standard_type` 或更加严谨的元数据属性进行归类。

---

## 3. 验证与回归计划

1. **类型检查门禁**：
   - 运行 `pnpm typecheck`，确保全部修改点契约完全闭合，0 编译错误。
2. **自动化测试套件回归**：
   - 运行 `pnpm test`，检查现有单测用例对 UNKNOWN 的处理，同步更新依赖历史假数据的测试用例，确保全量测试套件 100% 绿灯。
3. **针对性边界验证**：
   - 验证无标准、无牌号输入时，系统能够如实打标 `UNKNOWN` 并产生 `hitl_interrupt` 挂起，且界面能正常打开人机协同抽屉。
4. **Cairn 沉淀**：
   - 在 `cairn/LOG.md` 记录本次重构，并同步更新相关文档。
