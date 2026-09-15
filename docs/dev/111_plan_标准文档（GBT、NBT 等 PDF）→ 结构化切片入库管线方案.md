# 标准文档（GB/T、NB/T 等 PDF）→ 结构化切片入库管线方案

## 需求与结论

**需求**：将各类标准文档 PDF 按预设 schema（`src/schemas/standard.schema.ts`，即你附件中的契约）稳定解析为结构化数据，归档至 `data/standards/<STD>/`（meta.json / slices/*.json / clauses.json）。

**选型结论：采用「确定性代码 harness + LLM 有界步骤」形态，不采用纯 SKILL 形态。**

### 为什么不是 SKILL（方案对比）

| 维度 | 纯 SKILL（agent + 脚本集） | 确定性 harness（推荐） |
|---|---|---|
| 可重复性 | 依赖 agent 会话状态，每次执行路径可能漂移 | 同一输入同一输出，管线阶段固定 |
| 质量门禁 | 校验靠 agent 自觉执行，可能跳过 | Zod + 领域 linter + 溯源断言硬门禁，不过不入库 |
| 常态化新增（你的回答） | 每次都需重新理解流程 | `pnpm standard:ingest <pdf>` 一条命令 |
| 全自动+抽检（你的回答） | 无强制抽检证据链 | 自动生成带来源条款对照的抽检报告 |
| 可回归/可进 CI | 无法 | 与现有 `pnpm standard:validate` 同一门禁体系 |
| Token 成本 | 无缓存概念 | MD5 内容寻址 + 分块缓存，重跑零重复开销 |

SKILL 的正确定位是「开发期加速器」（交互式调试某一部难搞的标准），可在管线稳定后作为薄封装后补，不作为入库的生产形态。这也与项目既有基调一致：Schema 唯一真理源、确定性为主 LLM 为辅、MD5 内容寻址（见 `cairn/architecture.md`）。

## 架构设计：`src/ingestion/` 五阶段管线

```
PDF → [S0 预处理] → [S1 结构分块] → [S2 LLM 分块初提] → [S3 确定性校验门禁] → [S4 落盘+抽检报告]
       确定性          确定性           有界 LLM            确定性（核心）         确定性
```

### S0 预处理（确定性）
- 输入 PDF 计算 MD5，中间产物缓存至 `.cache/standard-ingest/{md5}/`（沿用项目 MD5 内容寻址哲学）。
- Node 端引入 `pdfjs-dist`（legacy build，Node 可用）提取矢量文本层与字符坐标，重建文本流 `text.txt`。
- 扫描件（无文本层）：首版显式报错并提示，不静默降级；后续对接 Phase 11 规划的 PaddleOCR 或多模态视觉输入。

### S1 结构分块与路由（确定性）
- 按标准文档章节惯例正则切块：章节号（`4`、`5.2`、`5.2.1`）、`表 N`、`附录 X` 锚点。
- 块分类路由：化学成分表块 / 力学性能表块 / 工艺与探伤条款块 / 尺寸公差表块 / 范围与术语文本块。
- 产出 `blocks.json`（块类型 + 章节号 + 原文文本），作为 LLM 输入与 S3 溯源断言的依据。

### S2 LLM 分块结构化初提（有界 LLM）
- 复用 `src/extractor/openai-compatible-extractor.ts` 的 OpenAI 兼容客户端调用逻辑与 `prompt-builder.ts` 已验证的「Schema 反射生成 Prompt」模式，目标 schema 换成 `standard.schema.ts`。
- 按块类型分别提取：牌号表 → slices 草稿（每牌号一份 evaluation_rules）；前言/范围 → meta 草稿；正文 → clauses 草稿。
- **强制溯源字段**：要求 LLM 为每条规则标注 `source_clause`（来源章节号），供 S3 字面断言。

### S3 确定性校验门禁（质量核心，对应"全自动+抽检"中的"全自动"）
1. **Zod 契约校验**：复用并扩展 `src/tools/validate-standards.ts`（现有 `pnpm standard:validate` 门禁）。
2. **领域 linter**：数值区间 min ≤ max；化学成分 ∈ [0,100]；rule_id 全局唯一；unit 白名单；每切片至少覆盖 chemical + mechanical 类别。
3. **溯源断言（防幻觉核心）**：每条 numeric 规则的 min/max 数值必须在其 `source_clause` 对应原文块中字面出现，否则判 hallucination 拒绝入库。
4. **对账**：原文牌号表行数 vs 生成 slices 数；公差表阶梯行数对账。
5. 失败处理：携带错误上下文有限重试该块（≤2 次）；仍失败则该块标记 `MANUAL_REVIEW` 显式报出，**绝不静默通过**（沿用项目"严禁静默拟真"原则）。

### S4 落盘与抽检报告（对应"抽检"）
- 门禁全过后写入 `data/standards/<STD>/`（目录命名沿用 `GB_T_13296_2023` 惯例）。
- 生成 `review-report.md`：每切片关键指标 ↔ 来源条款原文对照表，供人工抽检。
- 自动执行 `pnpm standard:validate` 作为最终回归。

### 版本与缓存门禁
- 引入 `ingestConfigVersion`（绑定 standard.schema.ts 结构与入库 Prompt），变更即失效重提——复用现有 `parserConfigVersion` 思路。

## 实施步骤

1. 新增依赖 `pdfjs-dist`（devDependency 即可，管线为离线工具）。
2. 新建 `src/ingestion/`：`preprocess.ts`（S0）、`segmenter.ts`（S1）、`llm-extract.ts`（S2）、`gates.ts`（S3 linter + 溯源断言）、`ingest-pipeline.ts`（编排 + 缓存 + 版本门禁）。
3. 新建 CLI `scripts/ingest-standard.ts`（Node 22 `--experimental-strip-types` 运行，与项目 `.ts` 后缀 import 风格一致），注册 `pnpm standard:ingest`。
4. 新建 `tests/ingestion/`：分块器、linter、溯源断言单测（fixture 文本）；以已入库的 GB/T 13296-2023（31 切片）与 NB/T 47019.5 为 golden 参照做一致性回归。
5. 端到端验证：用 `docs/standards/` 下现有 PDF 重放入库，与现有人工切片比对差异；`pnpm typecheck`、`pnpm test`、`pnpm standard:validate` 全绿。
6. 完成后按 Cairn 检查点更新 `cairn/LOG.md` 与 `cairn/ROADMAP.md`（开放问题 7 闭环）。

## 明确边界
- 不做前端 UI（纯离线 CLI 工具链）。
- 扫描件 OCR 首版不支持（显式报错），不阻塞主流矢量 PDF。
- 不改动现有 `data/standards/` 已入库数据，仅新增标准走新管线。
