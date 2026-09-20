# 统一多标合成架构（单标归为 N=1 特例）与来源胶囊常驻改造方案

## 背景与问题复盘

在当前系统中，用户输入未收录的美标质保书（`ASTM A312 / A312M`，牌号 `TP316L (UNS S31603)`）并选择替代标准后，暴露了以下两个相互交织的深层缺陷：
1. **牌号括号未剥离导致切片路由落空**：
   前端核验请求带上了未清洗的原始牌号字串 `TP316L (UNS S31603)`，覆盖了节点 2 清洗消歧后的统一牌号；而底层 `FileRuleStore.normalizeRoutingKey` 仅替换了空格连字符，未剔除括号及附注，导致在 `GB/T 13296` 和 `NB/T 47019.5` 倒排索引中均未命中规格切片，`resolveCompositeSlice` 返回 `undefined`。
2. **双轨分支静默丢弃标准与丢失胶囊（最大暗坑）**：
   节点 4（`DeterministicEvalNode`）存在双轨分支逻辑：当 `compositeSlice` 失败时，静默降级走入 `ComplianceEngine.evaluate(standardRuleSet!)`，且 `standardRuleSet` 仅加载了数组中的第 1 部标准（`GB/T 13296`）。系统“假装成功”但实际上悄悄丢弃了第 2 部标准（`NB/T 47019.5`），且因走老分支而丢失了所有来源胶囊与多标追溯元数据。

经过与用户的交互对齐（`/grill-me`），确立了如下核心改进原则：
- **单轨统一**：彻底废除老旧的 `evaluate` 单标独立分支，将单标准核验作为多标准合成核验在 $N=1$ 时的特例；
- **双向穿透**：路由键索引自动支持括号清洗与别名探测，未覆盖牌号时优先使用归一化主牌号；
- **严格质量红线**：杜绝静默回退，所选标准若有未收录切片，在节点 3 显式精准阻断；
- **胶囊常驻**：无论 $N=1$ 还是 $N \ge 2$，比对矩阵第 3 列始终佩戴来源标准编号胶囊，第 7 列判定说明格式高度一致。

---

## 拟定修改方案

### 1. 牌号路由键清洗与别名双向穿透 (`src/repository/file-rule-store.ts`)
#### [MODIFY] [file-rule-store.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/repository/file-rule-store.ts)
- 增强 `normalizeRoutingKey(key: string)`：
  - 增加括号与附注剥离逻辑（例如 `TP316L (UNS S31603)` 自动清洗剥离附注，同时提取 `TP316L` 与 `S31603` 进行索引注册）；
  - 在 `resolveRuleSlice(standardId, routingKey)` 中，若直接未命中，自动尝试剥离括号后的纯净子串并联动静态别名表匹配切片。

### 2. 标准检索节点去除强制覆盖并严格校验切片 (`src/workflow/nodes/retrieve-standard.node.ts`)
#### [MODIFY] [retrieve-standard.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/retrieve-standard.node.ts)
- 牌号键选择优化：若用户未在 UI 上手动指定 `overrideGrade`（即 `batch.overrideGrade` 为空），切片检索优先采用 `normalizedCert.header.declared_grade`（节点 2 消歧后的标准主牌号，如 `022Cr17Ni12Mo2` 或 `S31603`）；
- 阻断与诊断加严：调用 `store.resolveCompositeSlice(standardIds, gradeKey)`，若参与的多部标准中某部未能提取到有效切片，明确抛出错误，严禁回退单标；
- 输出保证：节点 3 确保产出 `compositeSlice`。

### 3. 多标尺合成器支持单标 $N=1$ 特例 (`src/engine/multi-standard-composer.ts`)
#### [MODIFY] [multi-standard-composer.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/multi-standard-composer.ts)
- 在 `composeMultiStandardSlices` 中：
  - 当 `slicesWithMeta.length === 1`（单标准）时，完整构建该切片规则的 `composite_trace`：
    - `sources: [sourceTrace]`；
    - `dual_standard_requirement_text: `${reqText} [${stdShort}]``；
    - `multi_standard_evaluations` 填充该单标准的独立评定条目；
  - 使得无论是 1 部标准还是 N 部标准，产出的 `CompositeSlice` 均拥有统一的追溯元数据。

### 4. 核验节点彻底消灭双轨分支 (`src/workflow/nodes/deterministic-eval.node.ts`)
#### [MODIFY] [deterministic-eval.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/deterministic-eval.node.ts)
- 废除 `ComplianceEngine.evaluate(standardRuleSet, normalizedCert)` 回退分支；
- 统一且唯一调用 `ComplianceEngine.evaluateSlice(compositeSlice!, normalizedCert, { collector })`；
- 若 `compositeSlice` 缺失直接阻断报错。

### 5. 前端面板胶囊渲染加固 (`src/components/workbench/steps/Step3ComplianceEvaluationPanel.tsx`)
#### [MODIFY] [Step3ComplianceEvaluationPanel.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/workbench/steps/Step3ComplianceEvaluationPanel.tsx)
- 表格第 3 列（执行标准要求/条款规范）：
  - 统一优先根据 `row.multiStandardEvaluations` 或 `row.standardRequirement` 中提取的标准号展示标准胶囊；
  - 若数据源缺失方括号且 `selectedStandardIds.length === 1`，则以当前生效的单一执行标准作为兜底胶囊佩戴展示，确保**来源胶囊 100% 常驻**；
- 表格第 7 列（判定逻辑/审核说明）：
  - 保持与后端统一的 `合格: 实测值 X (≤ Y [标准号])` 格式呈现。

---

## 验证计划

### 1. 自动化回归与单元测试
- 运行 `pnpm test`，确保 86 个测试套件 534 项单测保持 100% 绿灯；
- 运行 `pnpm exec tsc --noEmit` 保证 TypeScript 0 错误；
- 运行 `pnpm audit:hygiene` 验证架构纯洁性。

### 2. 业务场景验证
- 测试输入 `ASTM A312` 质保书：
  - 场景 A：仅选择 1 部替代标准 `NB/T 47019.5-2021`，比对矩阵第 3 列正确展示 `NB/T 47019.5-2021` 胶囊；
  - 场景 B：选择 2 部替代标准 `GB/T 13296-2023` + `NB/T 47019.5-2021`，切片正常合成，比对矩阵第 3 列分别佩戴两部标准的来源胶囊。
