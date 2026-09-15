# 执行方案：质保书重复提取与覆写误判的系统性治理

## 背景与目标

`测试质保书1.pdf` 批次 Z26022C-E1 的 FAIL 误判根因链：LLM 防御性过提取 → 复合串 `"Rp0.2=334、343 MPa；…"` 进入 additionalTests → `specimen-adapter.ts:372` 首数字正则抓出 `0.2` → Tier 2 消歧改写其 property_key 为 `yield_strength_rp02` → `core.ts:404` last-write-wins 覆写正牌 334 MPa → 误判 FAIL。

治理原则（已经讨论确认）：**让系统不需要精准识别重复也能不出错**。去重降级为 UI 折叠；引擎不信任后置来源；解析器不静默标量化复合串；Tier 2 结构性只填空缺。

## 跨任务契约（所有子 Agent 必须遵守的字段命名）

- `AdditionalTestItem` 新增可选字段（`certificate.schema.ts` 的 `AdditionalTestItemSchema`，L95-104）：
  - `is_composite?: boolean` — result 含 ≥2 段 `标识符[:：=]数值` 赋值（形态判定，不用关键词枚举）
  - `is_suspected_duplicate?: boolean` — 归一化 key 与已占用核心槽位碰撞
  - `duplicate_of?: string` — 碰撞的核心槽位 property_key
  - `duplicate_reason?: string` — 中文人读原因
- `TestRecord` 新增可选字段（`TestRecordSchema`，L70-87，已有 `.passthrough()`）：
  - `provenance?: 'core' | 'additional' | 'tier2_resolved'`
- 优先级：`core(3) > additional(2) > tier2_resolved(1)`；同级先到先赢。
- 全程**打标降级，禁止静默删数据**；每次降级/冲突用 `logger.warn('NORMALIZER'|'ENGINE'|'WORKFLOW', ...)` 记录（logger 用法见 `src/logger/index.ts`，惯例：模块 tag + `[组件名]` 中文消息 + metadata 对象）。

## 任务分解与执行波次

### Wave 1（3 个 coder 子 Agent 并行）

**任务 B：标量化修复 + 三道防线改打标（normalizer/extractor/schema）**
- 新建 `src/normalizer/numeric-parse.ts`，导出 `parseMeasuredNum(raw: string): number | undefined`：
  - 空串 → undefined；
  - 复合形态守卫：串中 `[:：=]` 后紧跟数值的赋值段 ≥2 → undefined（绝不标量化复合串）；
  - 取首个"非内嵌于标识符"的数字：用负向后行 `(?<![A-Za-z0-9.])` 排除 `Rp0.2`、`HV1`、`No.2` 中的伪数字；`Rp0.2=334、343 MPa` → 334；`<0.01` → 0.01；`334、343 MPa` → 334（保持现有多值取首行为）。
- `specimen-adapter.ts` 全部首数字提取点改用该 helper：L24、L37（chemical）、L74（屈服回退链）、L139（未知 mech 键）、L229（grain_size）、L372（additionalRecords，bug 点）。注意 L112 硬度多值平均与 L341/346/347 dimensions 不动。
- `filterRedundantAdditionalTests`（L431-515）重构为 `annotateAdditionalTests`：**不再 return false 删条目**，改为返回带标记的数组：
  - 删除防线 1 的关键词正则枚举（L462-475），替换为形态判定：result 含 ≥2 段赋值 → `is_composite: true`；
  - 保留防线 2 的 key 碰撞逻辑（L477-506）改为打标 `is_suspected_duplicate + duplicate_of + duplicate_reason`；
  - 删除防线 3 泛名正则（L508-511）——复合串已被形态判定覆盖，单值泛名条目是合法数据。
- 两个调用点同步改造：`openai-compatible-extractor.ts` L605-609、`specimen-adapter.ts` L159（函数名与语义变化）。
- 被标 `is_composite` 的条目在 additionalRecords 映射（L366-397）中：`measured_value_num` 强制为 undefined（即使 parseMeasuredNum 返回了值），仅保留 raw/定性结果，杜绝其进入数值比对。
- `specimen-adapter.ts` 构造 records 时写 provenance：chemical/mechanical/process/dimensions → `'core'`；additionalRecords → `'additional'`。
- `certificate.schema.ts`：`AdditionalTestItemSchema` 增加 4 个可选标记字段。
- `prompt-builder.ts` 规则 5 微调：要求 additional_tests 条目必须原子化（单指标单值），禁止多指标打包串（保留 Gemini 已加的互斥排重表述）。
- 重写 `tests/normalizer/specimen-adapter.test.ts`：防线 1/3 删除用例改为"打标不删除"断言；新增 parseMeasuredNum 单测（`Rp0.2=334、343 MPa`→334、复合串→undefined、`HV1 143`→143、`<0.01`→0.01）；保留 L128 全链路 334 纯净断言。

**任务 C：Tier 2 fill-only 结构性改造（workflow）**
- `llm-property-resolver.node.ts`：
  - 写回处（LLM 分支 L142-163、启发式分支 L275-296）增加**写时守卫**：目标 `targetRule.key`（经 PropertyKeyNormalizer 归一化）若已被 test_records 中**另一条**带值记录占用 → 放弃改写，转 ambiguousList + `logger.warn`；不得仅依赖 L86-98 候选池扣除（那是过滤，不是结构保证）。
  - 改写成功时在 record 上写 `provenance: 'tier2_resolved'`。
  - 保留现有 0.85 升级 / 0.6 HITL 阈值逻辑。
- `tests/workflow/llm-property-resolver.test.ts` 新增用例：
  - 已匹配核心槽位（test_records 已有 yield_strength_rp02=334）时，Tier 2 对任何候选不得再改写为该 key；
  - 候选池扣除逻辑（L86-98）的直接测试；
  - 写时守卫触发 → 进 ambiguousList 且原 record 不变。

**任务 D：步骤 2 UI 打标折叠（前端）**
- `WaterfallWorkbench.tsx` additionalTests 映射段（L4131-4190）：
  - 条目带 `is_suspected_duplicate || is_composite` 时：跳过 L4138-4154 的关键词分类推断（防止被打回 mechanical 类重复展示），归入新类别 `'duplicate'`（标签"疑似重复/已折叠"，灰色徽标）；
  - `status: 'warn'`，`note` 取 `duplicate_reason` 或"复合打包串，已排除出比对"；
  - 复用 L4287-4337 低置信度气泡模式展示原因；
  - 类别页签（L4244-4268）中 duplicate 类排最后，默认不展开其行（受控折叠，先例 L3090-3112）。
- 编辑回写（L1345-1371）不受影响，保持可编辑。
- 类型检查：`AdditionalTestItem` 新字段经 schema re-export（`src/types/session.ts:10,14`）自动可用，无需改类型文件。

### Wave 2（1 个 coder 子 Agent，待 Wave 1 完成）

**任务 A：引擎覆写信任模型（engine，最关键）**
- `certificate.schema.ts`：`TestRecordSchema` 增加 `provenance` 可选枚举字段。
- `core.ts` buildContext recordsMap 构建（L373-417）：
  - 同构冲突分支（L403-405）与 L410-411 无条件覆写 `#num/#qual` 处，引入 provenance 优先级：高优先级记录占主槽位与类型槽位；**被挤出的记录存入 `${k}#superseded`（仅诊断用，不参与查找链）**，并 `logger.warn('ENGINE', ...)` 记录双方 property_key/值/provenance；
  - 同级冲突先到先赢 + warn；
  - 无 provenance 的旧缓存数据按 `'additional'` 处理（保守低位）；
  - 评估查找链（L553-563）与 `hasReportedTestRecord`（L461-476）**不读** `#superseded`。
- 新建 `tests/engine/records-map-conflict.test.ts`：
  - 两条同 key 定量记录（core=334 在前，additional=0.2 在后）→ 评估用 334；
  - 反序（additional 在前 core 在后）→ 仍用 334（优先级高于顺序）；
  - 无 provenance 同级冲突 → 先到先赢且有 warn；
  - 被挤出记录可在 `#superseded` 槽位取回（provenance 不丢失）。

### Wave 3（1 个 coder 子 Agent，待 Wave 2 完成）

**任务 E：Z26022C-E1 全链路回归夹具**
- 新建 `tests/regression/z26022c-e1.test.ts`（目录不存在则建），fixture 内联 JSON 模拟 `测试质保书1.pdf` 该批次提取结果：mechanical 四字段齐备 + additional_tests 含 `"室温拉伸试验": "Rp0.2=334、343 MPa；Rm=675、669 MPa；A=48.0、48.0 %"` 与 `"硬度试验（HV1）"` 复合/重复条目（参考 `tests/api/audit-submit-batch.test.ts:107-150` 的 realBatch 写法与 `data/standards/NB_T_47019_5_2021/slices/S32168_06Cr18Ni11Ti.json` 标准切片）。
- 断言三层：
  1. 适配层：复合条目被标 `is_composite` 且**仍在** additionalTests 中（不删除），其 test_record 无 `measured_value_num`；
  2. 引擎层：yield_strength_rp02 评估值=334（或 334/343 按修约规则），判定 PASS；
  3. 破坏变体：手工剥掉标记与 provenance（模拟旧缓存数据）→ 引擎仍凭优先级用 334 判 PASS。
- 该测试只跑本地引擎与适配器，不发起 LLM 请求。

## 验证（全部完成后由我执行）

1. `pnpm typecheck` → 0 错误；
2. `pnpm test` → 全部套件通过（基线 55 套件 276 项 + 新增）；
3. `git diff --stat` 审查改动面，确认无任务外文件被改；
4. 按 AGENTS.md Cairn 门禁：在 `cairn/LOG.md` 顶部追加一条记录（摘要+指针）。

## 风险与注意

- Wave 1 三个任务文件不相交（B: normalizer+extractor+schema+prompt-builder；C: workflow；D: WaterfallWorkbench），可安全并行；schema 的 TestRecord 改动留给 Wave 2 的任务 A，避免同文件并行编辑。
- 任务 B 删除防线 1/3 会破坏现有测试——必须同步重写，不允许删测试了事。
- 引擎改动（任务 A）影响所有比对路径，-wave 2 完成后必须先跑全量测试再启动 Wave 3。
- 被标记条目在前端仍可编辑、在数据中仍保留，满足"宁可打标提示，不可静默盲删"原则。
