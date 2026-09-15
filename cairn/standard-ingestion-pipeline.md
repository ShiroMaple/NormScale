---
type: project_topic
status: active
summary: "标准文档（GB/T、NB/T 等 PDF）离线入库管线：确定性 harness 五阶段架构（预处理/切块/LLM 初提/质量门禁/落盘抽检），CLI pnpm standard:ingest，溯源断言防幻觉。"
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
created: "2026-09-14"
updated: "2026-09-14"
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
- **S2**：chat 客户端可注入（测试零网络）；默认走 config.json 默认 LLM（OpenAI 兼容，temperature=1，max_tokens=32768，超时独立 `llm.ingestTimeoutMs` 缺省 300s）；按块类型分任务、**逐块调用**；每条规则强制携带 `source_clause`；有限重试 ≤2 次并携带错误上下文。
- **S3**（防幻觉核心，纯函数）：Zod 契约 + 领域 linter（min≤max、化学成分 ∈[0,100]、rule_id 全局唯一、unit 白名单、类别覆盖）+ **溯源断言**（numeric 数值必须在 source_clause 原文块中字面出现，去空白比对）+ 牌号行数对账；失败标记 MANUAL_REVIEW，绝不静默通过。
- **S4**：门禁全过写入 `data/standards/<STD_DIR>/`（目录名：斜杠/空格/点/连字符→下划线），生成 `review-report.md`（每切片关键指标↔来源条款原文对照），自动 `validateAllStandards` 最终回归。
- **版本门禁**：`ingestConfigVersion`（ingest-pipeline.ts）变更即清空缓存重提；drafts.json 缓存使中断重跑零重复 LLM 调用。

## 使用方式

```bash
pnpm standard:ingest -- "docs/standards/<标准>.pdf"            # 正式入库 data/standards
node --experimental-strip-types scripts/ingest-standard.ts <pdf> --out <临时目录>  # 验证性入库
```

## 端到端验证结论（2026-09-14）

- NB/T 47019.5-2021 真实 PDF 全链路入库：22 个切片（含铁素体型 S11306），门禁全绿；
- 与已有人工切片 golden 对比：5 个重叠牌号 × 6 项核心指标（C/Cr/Ni/Rm/Rp0.2/A）30/30 完全一致（含 NB 加严伸长率 40%）；
- 全量 305 项单测 + `standard:validate` 全绿。

## 踩坑与教训

1. **字体子集化无 ToUnicode CMap 的 PDF 文本层为乱码**：GB 13296-2023.pdf 表格页即此情况，S1 行级乱码检测识别为 garbled 块并显式抛 `GarbledTextLayerError` 拒绝降级。此类原件需先 OCR（后续对接 Phase 11 PaddleOCR）或走多模态视觉输入，是管线当前明确的能力边界。
2. **非流式整表 JSON 输出体积远超在线流式场景**：60s 超时与默认输出上限会导致超时/JSON 截断；离线管线须独立超时（≥300s）、显式 `max_tokens` 放宽、并按块逐块调用控制单次输出体积。
3. **附录（资料性）表格是正文表的子集重复**：`表A.1` 锚点不含"附录"字样，仅按 `附录` 前缀过滤会漏；统一 `isAppendixLikeRef`（附录前缀或 `表<字母>.` 模式）同时约束提取路由与对账基准，并以 rule_id 幂等去重兜底（保留先出现者）。
4. **PDF 表格文本层列粘连**：组织类型列文本（"体型"）会与序号行粘连导致行计数漏行，行计数正则须容忍行首 1-4 个 CJK 字前缀。

## 明确边界

- v1 仅提取 chemical / mechanical numeric_range 规则与文本条款；工艺/探伤规则、公差阶梯表、动态公式（如 Ti≥4×(C+N)）的自动结构化留待后续迭代；
- 扫描件/乱码文本层不支持（显式报错）；不改动既有已入库数据。
