# NormScale 比对引擎核心求值重构实施计划 (Implementation Plan)

## 1. 目标与背景 (Context & Goals)

### 1.1 背景与现状
上游标准提取管线 NormHub 已完成 v2.0.0 重构，彻底废弃了原有的牌号规格切片架构（`SpecificationSlice` / `StandardRuleSet`），全面升级为符合国际 RASE 体系的原子规则流拓扑（`StandardDocument` + `RASERule` 扁平五元组：S-A-R-E）。
在将复合检验规则拆分为独立原子规则后，为了解决“三选一”（如硬度 HRB / HBW / HV）与“替代检验”（如涡流替代水压）丢失组语义导致的引擎误判缺失问题，上游已在 `standard.schema.ts` 的 `RASERule` 中原生注入了显式 `group` 元数据。

由于下游 NormScale 仍有部分模块依赖废弃的 `StandardRuleSetSchema`，且旧的求值器（`logic-evaluator.ts`）依赖旧的切片结构，导致现行工作流测试出现断言中断。

### 1.2 重构核心目标
1. **契约与架构对齐**：全面适配上游 RASE 原子规则流，平稳淘汰已废弃的切片旧模型，接入 `rules.json` + `grade_index.json` + `dictionary_mapping.json`。
2. **逻辑组语义恢复与求值**：实现 `RuleGrouper` 与 `RuleGroupEvaluator`，精准支撑 `OR` 与 `AND` 逻辑组求值，落实**宽严相济（`PASS_WITH_WARNING`）**裁决，并对未报送的备选项执行**就地抑制（Suppression）**，消除硬度/无损检测误报。
3. **去硬编码与规范对齐**：利用 Schema 原生 `group.semantic_code` 与数据元字典，实现 $O(1)$ 机器级对齐，彻底杜绝下游文本字符串猜测。
4. **多标准与技术协议叠加合成**：实现 `MultiStandardGroupComposer`，落实**技术协议严格排他原则（Strict Pinning）**，并修复 `min_pass` 在排他裁剪时的计算漏洞。
5. **前后端零破坏双层诊断报告**：顶层输出 `group_results` 矩阵，扁平 `item_results` 就地打标 `is_suppressed`，保证现有表格矩阵平滑兼容。

---

## 2. 架构设计与模块分工 (Architecture Blueprint)

```
                                [标准入库产物: rules.json + grade_index.json + dictionary_mapping.json]
                                                               │
                                                               ▼
                                                  【模块 1: RASE 规则加载器】
                                                 RASERuleLoader / FileRuleStore
                                                               │ (加载 Active Rules)
                                                               ▼
                                                  【模块 2: 规则分组预处理器】
                                                          RuleGrouper
                                                               │
                             ┌─────────────────────────────────┴─────────────────────────────────┐
                             ▼                                                                   ▼
                 [无 group: 独立原子规则]                                              [有 group: 逻辑组候选集合]
                             │                                                                   │
                             │                                                                   ▼
                             │                                                   【模块 3: 多标与技术协议合成器】
                             │                                                    MultiStandardGroupComposer
                             │                                                   (优先级加严 / 严格排他锁定 Pinning)
                             │                                                                   │
                             └─────────────────────────────────┬─────────────────────────────────┘
                                                               ▼
                                                【模块 4: 合规评估调度中枢】
                                                    ComplianceEngine.evaluate
                                                               │
                                   ┌───────────────────────────┴───────────────────────────┐
                                   ▼                                                       ▼
                      [原子求值 delegate (单次执行)]                           【模块 5: 逻辑组求值器】
                       evaluateNumericRange / Dynamic                          RuleGroupEvaluator
                                   │                                          (OR / AND 门槛与抑制裁决)
                                   │                                                       │
                                   └───────────────────────────┬───────────────────────────┘
                                                               ▼
                                                【模块 6: 双层诊断报告生成】
                                           DiagnosticResult (item_results + group_results)
```

---

## 3. 分阶段实施路线图 (Phased Implementation Roadmap)

### Phase 1: 契约层与基础设施扩展 (`src/schemas/`)
* **目标**：在 `standard.schema.ts` 中建立向前兼容的开放语义枚举与 `RuleGroup` 契约；在 `report.schema.ts` 中扩展组诊断接口。
* **变更文件**：
  - `src/schemas/standard.schema.ts`
  - `src/schemas/report.schema.ts`
* **关键实现点**：
  1. 引入开放容错的 `GroupSemanticCodeSchema`（已知枚举 + 大写下划线字符串正则联合体）：
     ```typescript
     export const KnownGroupSemanticCodeSchema = z.enum([
       'HARDNESS_CHOICE',            // 硬度多标尺任选其一 (HBW / HRB / HV)
       'TIGHTNESS_ALTERNATIVE',      // 致密性承压检验替代组 (水压试验 / 涡流检测)
       'IMPACT_SPECIMEN_GROUP',      // 冲击试验试样组 (如多试样或不同取向)
       'CORROSION_ALTERNATIVE',      // 晶间腐蚀试验方法替代组 (Method A/B/C/E)
       'CUSTOM_TECHNICAL_GROUP',     // 技术协议自定义专有逻辑组
     ]);
     export const GroupSemanticCodeSchema = z.union([
       KnownGroupSemanticCodeSchema,
       z.string().regex(/^[A-Z0-9_]{3,64}$/),
     ]);
     ```
  2. 完善 `RuleGroupSchema`，包含 `id`, `semantic_code`, `op`, `name`, `min_pass`。
  3. 在 `report.schema.ts` 中定义 `RuleGroupDiagnosticResult`，并在 `RuleEvaluationItemResult` 增加可选扩展字段 `group_id?: string; is_suppressed?: boolean;`。

---

### Phase 2: 规则存储与切片加载适配 (`src/repository/`)
* **目标**：彻底修复 `FileRuleStore` 中对废弃 `StandardRuleSetSchema` 的调用崩溃，平滑适配 `rules.json` + `indices/grade_index.json`。
* **变更文件**：
  - `src/repository/file-rule-store.ts`
  - `src/repository/rule-store.interface.ts`
* **关键实现点**：
  1. 识别 `rules.json` 拓扑：当目录下存在 `rules.json` 和 `indices/grade_index.json` 时，通过牌号索引直接读取对应的 `RASERule[]`。
  2. 建立轻量适配桥接：将加载出的 RASE 规则直接封装为求值引擎可消费的结构，杜绝依赖已被淘汰的切片文件。

---

### Phase 3: 规则归组与逻辑组求值器实现 (`src/engine/`)
* **目标**：新建 `rule-grouper.ts` 与 `rule-group-evaluator.ts`，实现无硬编码求值与单次计算结果复用。
* **新建文件**：
  - `src/engine/rule-grouper.ts`
  - `src/engine/rule-group-evaluator.ts`
* **关键实现点**：
  1. `RuleGrouper.partition(activeRules)`：基于 `rule.group?.id` 或 `rule.group?.semantic_code` 将规则精准解耦为独立规则与聚合组。
  2. `RuleGroupEvaluator.evaluate(...)`：
     - 单次调用原子求值委托 `evaluatorDelegate(rule)`，将 `raw_item_result` 保存在 `EvaluatedSubRule` 中。
     - **OR 组判定**：
       - `pass_count >= min_pass`：组合格。未报送/未达标的子项标记 `is_suppressed = true`；若有超标项，判定为 `PASS_WITH_WARNING` 并记录审计日志。
       - `pass_count < min_pass`：组判定为 `FAIL`，聚合组告警说明，若组内包含强制规则，标记 `is_blocking = true`。
     - **AND 组判定**：所有子项均需 PASS。

---

### Phase 4: 多标准与技术协议合成器升级 (`MultiStandardGroupComposer`)
* **目标**：在 `src/engine/multi-standard-composer.ts` 中升级逻辑组跨标加严与技术协议排他锁定逻辑。
* **变更/新建文件**：
  - `src/engine/multi-standard-group-composer.ts`
  - `src/engine/multi-standard-composer.ts`
* **关键实现点**：
  1. 基于 `group.semantic_code` 进行跨标准 $O(1)$ 归组，彻底杜绝文本启发式搜索。
  2. **严格排他修复（Strict Pinning Bug Fix）**：
     ```typescript
     // 严禁赋值为 activeDataElements.size，必须保持 OR 判定门槛
     const originalMinPass = primaryGroup.groupMeta.min_pass ?? 1;
     const effectiveMinPass = Math.min(originalMinPass, activeDataElements.size);
     ```
  3. 组内子项数值取严（上限取 min，下限取 max），协议新增/锁定项标记 `isPinnedByAgreement`。

---

### Phase 5: 核心调度集成与双层诊断报告生成 (`src/engine/core.ts`)
* **目标**：升级 `ComplianceEngine.evaluate` / `evaluateSlice` 主调度流，完成结果回写与一票否决门禁联动。
* **变更文件**：
  - `src/engine/core.ts`
  - `src/engine/index.ts`
* **关键实现点**：
  1. 调度流程织入：
     - 步骤 A：独立规则常规求值并收集；
     - 步骤 B：执行组求值，复用内部已计算完成的 `raw_item_result`，向扁平 `itemResults` 就地写入 `group_id` 与 `is_suppressed`，豁免项重写状态为 `SKIPPED`；
     - 步骤 C：收集顶层 `groupResults`；
     - 步骤 D：门禁判断——仅当 `groupResult.status === 'FAIL' && groupResult.is_blocking` 时，才将组失败摘要推入 `missingMandatory` / `blocking_issues`。
  2. 输出兼容 `AuditReport` 与扩展的 `DiagnosticResult`。

---

### Phase 6: 全方位单元测试与端到端回归 (`tests/engine/`)
* **目标**：新建针对性专项测试套件，恢复破损的工作流测试，确保 100% 绿灯。
* **新建/更新测试文件**：
  - `tests/engine/rule-group-evaluator.test.ts` (单元测试)
  - `tests/engine/multi-standard-group-composer.test.ts` (多标与协议排他测试)
  - `tests/engine/compliance-engine-rase.test.ts` (核心调度与抑制门禁测试)
* **测试用例覆盖矩阵**：
  - **用例 1（单项达标豁免）**：硬度三选一 MTC 仅报送 HBW=180，HRB/HV 缺失 $\rightarrow$ 组输出 `PASS`，扁平项 HRB/HV 标记 `is_suppressed`，无漏检警告。
  - **用例 2（全不达标否决）**：MTC 仅报送 HBW=220（超标）$\rightarrow$ 组输出 `FAIL`，触发一票否决阻断。
  - **用例 3（部分达标部分超标）**：MTC 报送 HBW=180 与 HRB=95（超标）$\rightarrow$ 组输出 `PASS_WITH_WARNING`，不阻断放行。
  - **用例 4（技术协议排他锁定）**：国标三选一，技术协议排除 HRB 仅保留 HBW 与 HV $\rightarrow$ `min_pass` 保持为 1，排除项不予核验。
  - **用例 5（独立原子规则兼容）**：无 group 的化学成分与拉伸规则保持原有独立核验逻辑。

---

## 4. 关键风险与防御策略 (Risks & Safeguards)

| 风险项 | 风险等级 | 规避与防御策略 |
|---|---|---|
| **旧测试与切片依赖断裂** | 高 | 在 `FileRuleStore` 增加健壮的防御性检查：若 `rules.json` 存在则走 RASE 规约，缺失切片时不抛空指针异常，优雅回退。 |
| **二次求值性能退化** | 中 | 强制 `EvaluatedSubRule` 持有 `raw_item_result` 单次计算产物，后置组装只做浅引用复制，禁止二次执行 `evaluateSingleRule`。 |
| **Schema 演进枚举阻断** | 中 | `GroupSemanticCodeSchema` 采用 Zod Union 结构，允许动态大写字符串扩展，隔离上游突发新代号导致的运行时崩溃。 |
| **前端比对矩阵破坏** | 低 | 扁平 `item_results` 保留所有原子项，仅对豁免项变更状态文本并附加打标属性，UI 表格无需推倒重写即可获得豁免徽章。 |

---

## 5. 验收标准 (Definition of Done)
1. `pnpm exec tsc --noEmit` 保持 0 错误；
2. 新增的 `rule-group-evaluator.test.ts` 与 `multi-standard-group-composer.test.ts` 100% 通过；
3. 现存因 `StandardRuleSetSchema` 报错的 workflow 套件恢复正常通过；
4. 真实 MTC 样本比对在硬度三选一与承压替代检验场景下零误报。
