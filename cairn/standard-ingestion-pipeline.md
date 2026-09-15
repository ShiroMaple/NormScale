---
type: project_topic
status: active
summary: "标准文档（GB/T、NB/T 等 PDF）离线入库管线：确定性 harness 五阶段架构（预处理/切块/LLM 初提/质量门禁/staging 落盘），staging+promote+no-net-loss 晋级制，规则级全量 diff 验收口径，CLI pnpm standard:ingest，溯源断言防幻觉。"
tags:
  - ingestion
  - standards
  - llm
  - pipeline
  - quality-gates
contains:
  - decision
  - procedure
  - pitfall
  - lesson
created: "2026-09-14"
updated: "2026-09-15"
related:
  - cairn/architecture.md
  - cairn/ROADMAP.md
authoring_mode: ai_generated
---

# 标准文档离线入库管线（Standard Ingestion Pipeline）

## 定位与核心决策

将标准文档 PDF 按 `src/schemas/standard.schema.ts` 契约结构化归档至 `data/standards/<STD>/`（meta.json / slices/*.json / clauses.json）。

**形态决策（ROADMAP 开放问题 7 闭环）**：采用「确定性代码 harness + LLM 有界步骤」，不采用纯 SKILL 形态。理由：常态化新增需要同输入同输出、质量门禁硬执行、可进 CI 回归、MD5 缓存零重复 Token 开销；SKILL 仅适合作为开发期交互调试加速器，不作为生产入库形态。

## 五阶段架构（`src/ingestion/`）

```
PDF → S0 预处理 → S1 确定性切块 → S2 LLM 分块初提 → S3 确定性质量门禁 → S4 落盘+抽检报告
     preprocess.ts  segmenter.ts    llm-extract.ts     gates.ts            ingest-pipeline.ts
```

- **S0**：pdfjs-dist（legacy build，Node）提取矢量文本层；MD5 内容寻址缓存至 `.cache/standard-ingest/{md5}/`；扫描件（<200 字符文本层）显式抛 `NoTextLayerError`。
- **S1**：纯函数锚点切块（章节号 / `表 N` / `附录 X` / 前言），路由为 chemistry_table / mechanical_table / tolerance_table / process_ndt_clauses / scope_text / garbled / other；行级乱码检测（无 CJK 且标点占比 >0.3 且符号种类 ≥6）。
- **S2**：chat 客户端可注入（测试零网络）；默认走 config.json 默认 LLM（OpenAI 兼容，temperature=1，max_tokens=32768，超时独立 `llm.ingestTimeoutMs` 缺省 300s）；按块类型分任务、**逐块调用**；每条规则强制携带 `source_clause`；有限重试 ≤2 次并携带错误上下文。切片 harness 字段（spec_type/standard_code/description）由 `fillSliceHarnessFields` 确定性补齐（同输入同输出，严禁依赖 Zod 缺省值静默补齐）。
- **S2 v2 提取任务（T4）**：在 meta/化学切片/力学切片/条款之外新增三通道——`process_rules`（工艺/探伤/金相/腐蚀/表面规则，rule_type 覆盖 qualitative_enum/alternative_group/or_choice_group/dynamic_formula_pass 等，每条带 `applies_to_grades` 由 `mountRulesByGrades` 确定性展开挂载）、`dynamic_formulas`（Ti≥5×(C+N) 等 dynamic_expression）、`tolerance_tables`（公差阶梯表；**跨标准外部引用严禁臆造数值**，产出空 rules + MANUAL_REVIEW issue）；property_key 注册表以闭集白名单形式注入 prompt（语义匹配严格选既有 key，防命名漂移）；检验项目一览表块（表5/表6 形态）排除出规则提取通道；同切片按 property_key 确定性去重（保留 criteria 更丰富者）。
- **S3**（防幻觉核心，纯函数）：Zod 契约 + 领域 linter（min≤max、化学成分 ∈[0,100]、rule_id 全局唯一、unit 白名单、**类别覆盖两级制**——chemical/mechanical 逐切片强约束，process/metallographic/corrosion/ndt/surface 标准级零规则才判整族漏提（条件适用族如晶粒度仅 07 系四牌号属合法）、**中文标准（GB/NB 开头）文本字段必须含 CJK**、**切片关键字段 strict 必填**、**property_key 注册表防命名漂移**、**公式 lint**（白名单标识符 ctx.chemical.* + 常数溯源）+ **applies_to_grades 白名单校验**（⊆ 牌号全集 + unmounted 拦截））+ **溯源断言**（numeric 数值必须在 source_clause 原文块中字面出现，去空白比对）+ 牌号行数对账；失败标记 MANUAL_REVIEW，绝不静默通过。
- **S4**：门禁全过只写 **staging**（`.cache/standard-ingest/staging/<STD_DIR>/`，meta.json/clauses.json/slices/review-report.md），**绝不直接触碰 data/standards**；部分覆盖产物切片携带 `coverage:'partial'` + `extracted_families` 标记（整标准全量提取通道 `fullCoverage` 不标记）；review-report.md 含与存量同标准的**规则级全量 diff**（新增/丢失/变更，按 rule_id + property_key + criteria 数值比对），存在丢失项按验收口径不得判定"全部通过"。
- **S5 promote**（`promote.ts`）：正式库仅接受显式晋级——① 带 `extracted_families` 的部分覆盖产物**按规则族合并**（候选只接管声明族的规则，存量其余族保留；合并后更新/清除 coverage 标记；无 families 元数据禁止晋级已存在目录）；② **no-net-loss 门禁**（规则总数/property_key 集合/规则字段集合/meta 字段集合含 tolerance_tables 不得净减，净减须 `--force` 并在 meta 记录 forced 标记）；③ 完成门禁 `validateAllStandards` + 数据敏感套件（`tests/engine tests/repository tests/api tests/e2e`，spawnSync 真实执行，可注入 mock），不过自动回滚。
- **版本门禁**：`ingestConfigVersion`（ingest-pipeline.ts，T1 起 1.1.0）变更即清空缓存重提；drafts.json 缓存使中断重跑零重复 LLM 调用。

## 使用方式

```bash
pnpm standard:ingest -- "docs/standards/<标准>.pdf"            # 管线 -> staging（正式库零触碰）
node --experimental-strip-types scripts/ingest-standard.ts --promote <STD_DIR 或 staging 路径> [--force]   # 显式晋级
node --experimental-strip-types scripts/ingest-standard.ts <pdf> --out <临时目录>  # 验证性运行
```

## 端到端验证结论（2026-09-14，2026-09-15 修订口径，2026-09-15 T4 扩充）

- NB/T 47019.5-2021 真实 PDF 全链路入库：22 个切片（含铁素体型 S11306），门禁全绿；
- **修订（纠正昨日误导性表述）**：此前记录"与 golden 对比 30/30 一致"仅是 **5 个重叠牌号 × 6 项核心指标（C/Cr/Ni/Rm/Rp0.2/A）数值抽查**，对规则族丢失**零发现能力**——v1 提取通道只有 chemical/mechanical，工艺/探伤/晶粒度等族被整体丢弃而抽查完全无感。规则级完整性验收以 S4/S5 的规则级全量 diff 为准；
- **T4 v2 验证（ingestConfigVersion 1.2.2，真实 LLM）**：七族提取通道全开后，与 golden 五族规则清单（`tests/fixtures/nb-golden-family-rules.json`，31 条）按 spec_key+property_key 对账：**丢失 0 条**；新增均为合法项（edge_curling 卷边试验=表5 约定项目；surface_roughness 定性形态=本文件仅外部引用 NB/T 47019.1 7.11.4 无数值，严禁编造的忠实结果）；结构保真残留：pressure_tightness 未聚合成 alternative_group、flattening 未带压扁公式（内容仍在但结构弱于 golden，promote 时 no-net-loss 会拦截降级）；
- 全量单测 + `standard:validate` 全绿（2026-09-15 T4 后：66 套件 415 项）。

## 事故教训（2026-09-15）

**v1 半成品被手动覆盖正式库事件**：管线 v1 的 S4 曾 `rmSync` 整目录重写 `data/standards/<STD>`，验证性产物（仅 chem+mech 两族的部分覆盖切片）被手动复制进正式库，直接覆盖 5 份人工 golden 切片（含晶粒度等 7 族规则），导致 **17 项测试变红，其中含"超标漏判 PASS"危险退化**（缺失规则族使校验静默放过超标项）。教训与由此确立的防线：

1. **落盘语义**：管线产物只写 staging，`data/standards` 仅接受显式 promote（删除 S4 的 `rmSync` 正式库重写）；
2. **no-net-loss 门禁**：晋级已存在标准时，规则总数/property_key/规则字段/meta 字段（含 tolerance_tables）不得净减，净减须 `--force` 显式确认并留 forced 标记；
3. **按规则族合并**：部分覆盖产物只更新其声明族，杜绝半成品整目录覆盖；
4. **验收口径**：与存量的对比必须是规则级全量 diff（rule_id + property_key + criteria 数值），数值抽查（如 30/30）不能作为完整性证据；
5. **完成门禁**：晋级后须过 validateAllStandards + 数据敏感测试套件，不过自动回滚。

## 踩坑与教训

1. **字体子集化无 ToUnicode CMap 的 PDF 文本层为乱码**：GB 13296-2023.pdf 表格页即此情况，S1 行级乱码检测识别为 garbled 块并显式抛 `GarbledTextLayerError` 拒绝降级。此类原件需先 OCR（后续对接 Phase 11 PaddleOCR）或走多模态视觉输入，是管线当前明确的能力边界。
2. **非流式整表 JSON 输出体积远超在线流式场景**：60s 超时与默认输出上限会导致超时/JSON 截断；离线管线须独立超时（≥300s）、显式 `max_tokens` 放宽、并按块逐块调用控制单次输出体积。
3. **附录（资料性）表格是正文表的子集重复**：`表A.1` 锚点不含"附录"字样，仅按 `附录` 前缀过滤会漏；统一 `isAppendixLikeRef`（附录前缀或 `表<字母>.` 模式）同时约束提取路由与对账基准，并以 rule_id 幂等去重兜底（保留先出现者）。
4. **PDF 表格文本层列粘连**：组织类型列文本（"体型"）会与序号行粘连导致行计数漏行，行计数正则须容忍行首 1-4 个 CJK 字前缀。
5. **CJK 语言一致性 lint 的误报边界**：切片 display_name 采用牌号代号式命名（如 "06Cr19Ni10 (S30408)"）是标准库既定惯例，纯 ASCII 不代表被翻译；lint 仅当 display_name 不含 spec_key/primary_grade 特征时才要求 CJK，否则真实重跑必触发假 MANUAL_REVIEW。
6. **property_key 命名漂移洪水与闭集收敛**：v2 首轮真实 E2E 产出 330 条注册表 lint（LLM 自由发明 key）；将注册表按类别分组注入 prompt 作为闭集白名单后收敛至个位数（残留为真新增指标，走人工抽检——设计意图）。凡 LLM 需产出受控词汇表的场景，一律闭集注入而非事后拦截。
7. **检验项目一览表不是规则本体**：表5/表6 这类"序号+试验项目+取样数量"清单与正文条款并存，双重提取产生大量重复规则；一览表块确定性排除出规则提取通道（仅作覆盖核对参考）。
8. **子孙条款类型继承**：纯 CJK 正文行（<40 字）会被标题正则误判独立成块且不含路由关键词落 other（如 6.11.1 表面质量正文），由 `inheritAncestorBlockType` 按 clauseRef 层级继承最近非 other 祖先进程，否则整段条款静默漏提。
9. **类别覆盖 lint 的两级制**：条件适用族（晶粒度仅 07 系四牌号）逐切片强约束必然误报；chemical/mechanical 逐切片强约束（表驱动普适），其余族标准级零规则才判整族漏提。
10. **模型结构遵从度非确定性**：alternative_group 聚合与 dynamic_formula_pass 公式结构即便注入 golden 范式示例也不保证遵守（T4 E2E 残留）；no-net-loss 门禁在 promote 时拦截此类"内容在但结构降级"的产物，不得依赖 prompt  alone 保证结构保真。
11. **视觉转录通道的四个实测坑**（GB 13296 E2E 收敛过程）：① chat 客户端全局强制 `response_format: json_object` 会把转录逼成 JSON 包裹形态，转录任务必须解除；② 版本门禁必须先于一切缓存读取执行，否则过期缓存（如旧版 vision-text）被读入内存后才清空目录，时序漏洞导致新旧文本混用；③ 乱码检测需剔除点线引导符（公式编号 "......(1)"）与 LaTeX 标记（`\frac{\pi}`），否则合法公式行被误判 garbled；④ 公差表数值字段模型偶发输出字符串，由 `sanitizeToleranceNumericFields` 确定性纠偏（仅纯数值字面量转换，其余交 S3 拦截，不猜测）。

## 明确边界

- ~~v1 仅提取 chemical / mechanical numeric_range~~（T4 已扩充至七族 + 动态公式 + 公差阶梯表；结构保真残留见踩坑 10）；
- ~~扫描件/乱码文本层不支持~~（v1.3 起由多模态视觉转录通道接管，见下节）；
- 不改动既有已入库数据（staging + promote 门禁保证）。

## 多模态视觉转录通道（v1.3，`vision-transcribe.ts`）

- **分流条件**：S0 无文本层（`NoTextLayerError`）或 S1 检出乱码块（字体子集化无 ToUnicode）→ 整篇转视觉通道；`--no-vision` 退回显式报错；文本层完好的文档不受影响。
- **流程**：pdfjs-dist + `@napi-rs/canvas` 逐页渲染 PNG（scale 2.0）→ 逐页多模态转录（纯文本，表格按行展开，禁 LaTeX）→ `vision-text.txt` 缓存 → 续走 S1→S4 完全复用。
- **透明性契约**：drafts/meta 带 `text_source: 'vision'`，review-report 顶部显著标注并提示提高人工抽检权重；此时 S3 溯源断言为"转录文本自洽性校验"（弱于文本层独立真相源），数值缺失会走 TRACE/MANUAL_REVIEW 而非静默通过。
- **视觉调用解除 `response_format: json_object`**：转录任务必须纯文本输出（v1.3.0 曾因此全篇转录被包成 JSON 导致 S1 零表格块）。

## 视觉通道 E2E 验证（GB 13296-2023，乱码 PDF，v1.3.5 真实多模态）

- 19 页视觉转录 → 全链路提取 31 切片全族规则；
- 与 GB 31 份 golden 切片对账：**规则族丢失 0 条；化学/力学数值抽查 337 条 0 差异**；
- 已知偏差：golden 的 exemption（6 牌号晶间腐蚀免检）/enum_acceptance 等精细 rule_type 被泛化为 qualitative_enum（内容正确、语义粒度降级，promote 时 no-net-loss 拦截）；铁素体三牌号被过度挂晶间腐蚀规则（7.7.1 仅约束奥氏体型）；
- 命名存量瑕疵暴露：注册表中 `flattening`（NB 切片）与 `flattening_test`（GB 切片）两个 canonical 并存，导致同义 key 跨 run 摆动不被注册表 lint 捕获——注册表去重归一化列入后续治理。
