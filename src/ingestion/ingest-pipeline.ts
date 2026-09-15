import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NoTextLayerError, pdfCacheDir, preprocessPdf } from './preprocess.ts';
import { countGradeRows, segmentText } from './segmenter.ts';
import { createDefaultChatClient, dedupeDraftRules, extractAll, fillSliceHarnessFields, isAppendixLikeRef, normalizeSourceClauseRefs, sanitizeToleranceNumericFields } from './llm-extract.ts';
import { buildClauseTextIndex, FULL_RULE_FAMILIES, runGates } from './gates.ts';
import type { GateIssue } from './gates.ts';
import type { ChatClient, DraftToleranceTable, ExtractionDrafts, TextBlock } from './types.ts';
import { diffStandards, loadStandardDir, scanPropertyKeyCatalog, sliceFileKey, stdDirNameFromMeta } from './promote.ts';
import type { SliceOnDisk } from './promote.ts';
import { transcribePdfByVision } from './vision-transcribe.ts';
import type { RenderPagesFn } from './vision-transcribe.ts';

/* ==========================================================================
   S4 入库编排 (Ingest Pipeline)
   - 串联 S0 预处理 -> S1 切块 -> S2 LLM 提取 -> S3 质量门禁
   - 缓存与版本门禁：缓存目录记录 ingestConfigVersion，不匹配则整目录重提
   - 门禁全过后产物只写入 staging（.cache/standard-ingest/staging/<STD_DIR>/，
     含 meta.json/clauses.json/slices/review-report.md），绝不直接触碰 data/standards；
     data/standards 仅接受 promote.ts 的显式 promote（no-net-loss + 按族合并 + 完成门禁）
   - review-report.md 含与存量同标准的规则级全量 diff 章节（存在丢失项不得判定全部通过），
     并对跨标准外部公差引用做显著标注（需人工补录被引标准数据）；
     视觉转录来源的文档在报告顶部显著标注（溯源断言对象为转录文本，人工抽检权重应提高）
   - 文本来源分流（v3）：PDF 无文本层（扫描件）或 S1 检出乱码块（字体子集化无 ToUnicode）
     时整篇转多模态视觉转录通道（--no-vision 可关闭退回显式报错）；
     转录标记写入 drafts/meta.text_source='vision'
   - 任何失败显式抛错或标记 MANUAL_REVIEW，绝不静默通过
   ========================================================================== */

// 入库配置版本：S0 预处理 / S1 切块规则 / S2 prompt 变更时递增，触发缓存重提
// 注：S3 门禁每次运行均实时执行（不缓存），其策略变更无需递增版本
// 1.2.0：v2 提取范围扩充（process_rules/dynamic_formulas/tolerance_tables 三任务 + 全量族默认）
// 1.2.1：真实 E2E 修复——property_key 闭集注入 prompt、检验一览表排除、同切片按 property_key 去重、meta 中文约束
// 1.2.2：golden 对账修复——子孙条款类型继承（S1）、替代组结构保真/外部引用禁编造/粗糙度结构 prompt（S2）
// 1.3.0：多模态视觉转录通道（S0/S1 分流 + vision-text 缓存 + text_source 标记 + --no-vision）
// 1.3.1：视觉转录调用解除 response_format json_object 强制（转录须为纯文本，否则模型把转录包成 JSON）
// 1.3.2：版本门禁时序修复——先于一切缓存读取执行失效清空（原实现在 preprocess/vision-text 读取之后才清空，过期缓存被读入内存）
// 1.3.3：乱码检测剔除点线引导符（公式编号/目次的 "......(3)" 排版噪声不再误判 garbled）
// 1.3.4：乱码检测兼容 LaTeX 公式标记剔除；视觉转录 prompt 禁 LaTeX 输出
// 1.3.5：公差表数值字段纯数值字符串确定性纠偏（sanitizeToleranceNumericFields，提取侧与缓存草稿幂等）；prompt 强化 number 输出
//       附：source_clause 引用归一（normalizeSourceClauseRefs，剥离模型抄入的"【条款号】"prompt 标记）为管线级幂等后处理，缓存草稿每次运行均生效，无需递增版本
// 1.3.6：process_rules prompt 增加兜底协商条款禁出规则（"协商可采用其他方法"类无判定准则条款不产生规则）
export const ingestConfigVersion = '1.3.6';

export class GarbledTextLayerError extends Error {
  public garbledRefs: string[];

  constructor(garbledRefs: string[]) {
    super(`检测到文本层乱码块（${garbledRefs.join('、')}）：PDF 表格页字体子集化且缺失 ToUnicode CMap，矢量文本不可用。离线管线拒绝降级处理，请更换 PDF 原件或先 OCR。`);
    this.name = 'GarbledTextLayerError';
    this.garbledRefs = garbledRefs;
  }
}

export interface IngestOptions {
  /** S0 输入：PDF 路径（与 rawText 二选一） */
  pdfPath?: string;
  /** 测试注入：直接提供全文文本，跳过 S0（S1->S4 集成测试用） */
  rawText?: string;
  /** S2 聊天客户端；缺省走 config.json 默认 LLM 配置 */
  chatClient?: ChatClient;
  /** 视觉转录聊天客户端（多模态）；缺省回落到 chatClient，再走 config.json 默认 LLM 配置 */
  visionChatClient?: ChatClient;
  /** 关闭视觉转录通道：无文本层/乱码显式报错（退回 v1 语义），不转多模态 */
  noVision?: boolean;
  /** 测试注入：替换 PDF 页面渲染实现（隔离 @napi-rs/canvas 真实渲染） */
  renderPages?: RenderPagesFn;
  /** 正式库根目录；缺省 data/standards。仅用于存量对账/注册表扫描与报告，绝不直接写入。测试必须指向临时目录 */
  outRoot?: string;
  /** 缓存根目录；缺省 .cache/standard-ingest */
  cacheRoot?: string;
  /**
   * staging 根目录；缺省 <cacheRoot>/staging（即 .cache/standard-ingest/staging）。
   * 管线产物只写这里，promote 前不触碰正式库
   */
  stagingRoot?: string;
  /** 声明的提取规则族（写入 meta.extracted_families 并驱动类别覆盖 lint）；缺省 v2 全量七族（FULL_RULE_FAMILIES），管线/CLI 可显式声明部分族收窄范围 */
  declaredFamilies?: string[];
  /** 整标准全量提取产物：不写 coverage/extracted_families 部分覆盖标记（v2 全量通道用） */
  fullCoverage?: boolean;
  /** 忽略缓存与版本门禁，全量重提 */
  force?: boolean;
  onProgress?: (message: string) => void;
}

export interface IngestResult {
  status: 'OK' | 'MANUAL_REVIEW';
  /** 目标正式库目录（信息性；S4 不写入，须显式 promote） */
  stdDir: string;
  /** 实际写入的 staging 产物目录（meta.json/clauses.json/slices/review-report.md） */
  stagingDir?: string;
  issues: GateIssue[];
  reportPath?: string;
  /** S2 提取草稿（供抽检与测试断言） */
  drafts?: ExtractionDrafts;
}

interface CacheBundle {
  md5: string;
  cacheDir: string;
  fullText: string;
  blocks: TextBlock[];
  drafts: ExtractionDrafts;
}

function readJsonIfExists<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/**
 * 版本门禁：缓存目录中的 version.json 与当前 ingestConfigVersion 比对，不匹配则清空重提
 */
function checkVersionGate(cacheDir: string, force?: boolean): void {
  if (force && fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    return;
  }
  const versionFile = path.join(cacheDir, 'version.json');
  const version = readJsonIfExists<{ ingestConfigVersion?: string }>(versionFile);
  if (version && version.ingestConfigVersion !== ingestConfigVersion) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

/**
 * 生成人工抽检报告：每切片关键指标 <-> 来源条款原文对照表 +
 * 与既有存量的规则级全量 diff（存在丢失项时按验收口径不得判定"全部通过"）+
 * 跨标准外部公差引用显著标注（需人工补录被引标准数据）
 */
function buildReviewReport(
  metaId: string,
  drafts: ExtractionDrafts,
  clauseTextIndex: Record<string, string>,
  issues: GateIssue[],
  existingStdDir: string | null,
): string {
  const lines: string[] = [];
  lines.push(`# 标准入库人工抽检报告：${metaId}`);
  lines.push('');
  lines.push(`- 入库管线版本: ${ingestConfigVersion}`);
  lines.push(`- 切片数: ${drafts.slices.length}，条款数: ${drafts.clauses.length}，公差表: ${drafts.tolerance_tables.length} 项`);
  lines.push(`- 落盘位置: staging（正式库须显式 promote，no-net-loss 门禁把关）`);
  // 视觉转录来源显著标注：溯源断言对象为转录文本（自洽性校验，弱于文本层），人工抽检权重应提高
  if (drafts.meta.text_source === 'vision') {
    lines.push('- 文本来源: 多模态视觉转录（非 PDF 文本层）——溯源断言对象为转录文本，属自洽性校验（弱于文本层），人工抽检权重应提高');
  }
  lines.push('');

  // 跨标准外部公差引用显著标注：被引标准数据严禁臆造，须人工补录后方可参与几何判定
  const externalRefs = drafts.tolerance_tables.filter(
    (t) => typeof t.external_reference === 'string' && t.external_reference.trim().length > 0,
  );
  if (externalRefs.length > 0) {
    lines.push(`## ⚠️ 跨标准外部公差引用（${externalRefs.length} 项，MANUAL_REVIEW：需人工补录被引标准数据）`);
    lines.push('');
    for (const t of externalRefs) {
      lines.push(`- **${t.table_id}** ${t.table_name} -> 外部引用: ${t.external_reference}（rules 为空，严禁臆造；被引标准公差表数据须人工补录后方可参与判定）`);
    }
    lines.push('');
  }

  // 与存量同标准的规则级全量 diff（新增/丢失/变更三类清单）
  let diffSection: string[] | null = null;
  let diffLostCount = 0;
  if (existingStdDir) {
    const base = loadStandardDir(existingStdDir);
    const candidateSlices = drafts.slices.map((s) => {
      const { evaluation_rules, ...rest } = s;
      return {
        ...rest,
        evaluation_rules: evaluation_rules.map(({ source_clause: _sourceClause, applies_to_grades: _applies, ...rule }) => rule),
      } as unknown as SliceOnDisk;
    });
    const diff = diffStandards(base, { dir: existingStdDir, meta: drafts.meta as Record<string, unknown>, slices: candidateSlices });
    diffLostCount = diff.lost.length;
    diffSection = [];
    diffSection.push('## 与存量规则级全量 diff（同标准既有库内容）');
    diffSection.push('');
    diffSection.push(`- 规则总数: 存量 ${diff.baseRuleCount} -> 本次产物 ${diff.candidateRuleCount}`);
    diffSection.push(`- 新增 ${diff.added.length} 条 / 丢失 ${diff.lost.length} 条 / 变更 ${diff.changed.length} 条`);
    if (diff.lost.length > 0) {
      diffSection.push('');
      diffSection.push('### 丢失（no-net-loss 门禁将拦截 promote，存在丢失项按验收口径不得判定全部通过）');
      for (const entry of diff.lost) diffSection.push(`- ${entry.detail}`);
    }
    if (diff.changed.length > 0) {
      diffSection.push('');
      diffSection.push('### 变更（property_key / criteria 数值比对不一致）');
      for (const entry of diff.changed) diffSection.push(`- ${entry.detail}`);
    }
    if (diff.added.length > 0) {
      diffSection.push('');
      diffSection.push('### 新增');
      for (const entry of diff.added) diffSection.push(`- ${entry.detail}`);
    }
    diffSection.push('');
    const verdict =
      diff.lost.length > 0
        ? `存在丢失项 ${diff.lost.length} 条：按验收口径本报告不得判定"全部通过"，promote 将被 no-net-loss 门禁拦截（或经 --force 显式确认）`
        : '无丢失项：与存量对比通过规则级全量 diff 验收口径';
    diffSection.push(`- diff 结论: ${verdict}`);
    diffSection.push('');
  }

  lines.push(
    `- 门禁结论: ${
      issues.length > 0
        ? '存在阻塞项，需人工复核'
        : diffLostCount > 0
          ? 'S3 门禁通过，但与存量全量 diff 存在丢失项——按验收口径不得判定全部通过'
          : '全部通过'
    }`,
  );
  lines.push('');

  if (issues.length > 0) {
    lines.push('## 待人工复核项');
    lines.push('');
    for (const issue of issues) {
      lines.push(`- [${issue.code}] ${issue.message}`);
    }
    lines.push('');
  }

  if (diffSection) {
    lines.push(...diffSection);
  }

  lines.push('## 切片关键指标 ↔ 来源条款原文对照');
  lines.push('');
  for (const slice of drafts.slices) {
    lines.push(`### ${slice.spec_key} ${slice.primary_grade || ''}（${slice.display_name}）`);
    lines.push('');
    lines.push('| rule_id | 类别 | 类型 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const rule of slice.evaluation_rules) {
      const c = rule.criteria as { min?: unknown; max?: unknown; unit?: unknown };
      const min = typeof c.min === 'number' ? String(c.min) : '';
      const max = typeof c.max === 'number' ? String(c.max) : '';
      const unit = typeof c.unit === 'string' ? c.unit : '';
      const excerpt = (clauseTextIndex[rule.source_clause] || '（来源条款未找到）').replace(/\n+/g, ' ').slice(0, 90);
      lines.push(`| ${rule.rule_id} | ${rule.category} | ${rule.rule_type} | ${rule.property_key} | ${min} | ${max} | ${unit} | ${rule.source_clause} | ${excerpt} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * S4 主入口：标准文档 PDF -> 结构化切片全链路入库
 */
export async function ingestStandard(options: IngestOptions): Promise<IngestResult> {
  const progress = options.onProgress || ((): void => undefined);
  const outRoot = options.outRoot || path.resolve(process.cwd(), 'data/standards');
  const cacheRoot = options.cacheRoot || path.resolve(process.cwd(), '.cache/standard-ingest');
  if (!options.pdfPath && options.rawText === undefined) {
    throw new Error('ingestStandard 需要提供 pdfPath 或 rawText 之一');
  }

  // S0 预处理（rawText 注入时跳过，仍按内容 MD5 归缓存）
  let md5: string;
  let cacheDir: string;
  let fullText: string;
  let textSource: 'text' | 'vision' = 'text';
  const visionChat = options.visionChatClient || options.chatClient || createDefaultChatClient();
  const runVisionTranscribe = async (targetCacheDir: string): Promise<string> => {
    progress('转多模态视觉转录通道（整篇逐页转录，--no-vision 可关闭）...');
    const vision = await transcribePdfByVision({
      pdfPath: options.pdfPath!,
      cacheDir: targetCacheDir,
      chat: visionChat,
      renderPages: options.renderPages,
      onProgress: (msg) => progress('  ' + msg),
    });
    return vision.fullText;
  };

  if (options.rawText !== undefined) {
    fullText = options.rawText;
    md5 = crypto.createHash('md5').update(fullText, 'utf8').digest('hex');
    cacheDir = path.join(cacheRoot, md5);
    checkVersionGate(cacheDir, options.force);
  } else {
    progress('S0 预处理：提取 PDF 矢量文本层...');
    // 版本门禁必须先于一切缓存读取：先定位缓存目录并执行失效清空，
    // 再让 preprocess / vision-text 偏好读取缓存，杜绝过期缓存先被读入内存后才清空的时序漏洞
    const cacheInfo = pdfCacheDir(options.pdfPath!, cacheRoot);
    md5 = cacheInfo.md5;
    cacheDir = cacheInfo.cacheDir;
    checkVersionGate(cacheDir, options.force);
    // 无文本层（扫描件）：转视觉通道；--no-vision 显式报错退回。其余异常原样上抛。
    const pre: Awaited<ReturnType<typeof preprocessPdf>> | null = await (async () => {
      try {
        return await preprocessPdf(options.pdfPath!, cacheRoot);
      } catch (err) {
        if (err instanceof NoTextLayerError && !options.noVision) return null;
        throw err;
      }
    })();
    if (pre) {
      fullText = pre.fullText;
    } else {
      fullText = await runVisionTranscribe(cacheDir);
      textSource = 'vision';
    }
    // 视觉转录产物优先级：同一 PDF 既有 vision-text.txt 时作为主文本（缓存重跑一致：
    // blocks/drafts 均按转录文本生成，避免与文本层乱码文本混用）
    const visionTextFile = path.join(cacheDir, 'vision-text.txt');
    if (fs.existsSync(visionTextFile)) {
      fullText = fs.readFileSync(visionTextFile, 'utf8');
      textSource = 'vision';
    }
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, 'version.json'), JSON.stringify({ ingestConfigVersion, md5, textSource }, null, 2));

  const cached: CacheBundle = {
    md5,
    cacheDir,
    fullText,
    blocks: readJsonIfExists<TextBlock[]>(path.join(cacheDir, 'blocks.json')) || [],
    drafts: readJsonIfExists<ExtractionDrafts>(path.join(cacheDir, 'drafts.json')) || { meta: {}, slices: [], clauses: [], tolerance_tables: [] },
  };
  // v1 缓存草稿字段归一（版本门禁已保证 v2 重提，此处仅防御性兜底，绝不静默吞错）
  if (!Array.isArray(cached.drafts.tolerance_tables)) cached.drafts.tolerance_tables = [];
  if (!Array.isArray(cached.drafts.unmounted_rules)) cached.drafts.unmounted_rules = [];

  // S1 确定性切块（缓存命中则跳过）
  if (cached.blocks.length === 0) {
    progress('S1 切块：按章节号/表/附录锚点确定性切块...');
    cached.blocks = segmentText(fullText);
    fs.writeFileSync(path.join(cacheDir, 'blocks.json'), JSON.stringify(cached.blocks, null, 2));
  }

  // S1 乱码分流：文本层乱码块（字体子集化无 ToUnicode）整篇转视觉重转录后重新切块。
  // rawText 注入模式无 PDF 可供渲染，保持显式报错；视觉转录文本仍乱码则显式失败（模型输出异常）
  let garbled = cached.blocks.filter((b) => b.blockType === 'garbled').map((b) => b.clauseRef);
  if (garbled.length > 0) {
    if (options.rawText !== undefined || options.noVision || textSource === 'vision') {
      throw new GarbledTextLayerError(garbled);
    }
    fullText = await runVisionTranscribe(cacheDir);
    textSource = 'vision';
    cached.fullText = fullText;
    progress('S1 重新切块：基于视觉转录文本...');
    cached.blocks = segmentText(fullText);
    fs.writeFileSync(path.join(cacheDir, 'blocks.json'), JSON.stringify(cached.blocks, null, 2));
    garbled = cached.blocks.filter((b) => b.blockType === 'garbled').map((b) => b.clauseRef);
    if (garbled.length > 0) {
      throw new Error(`视觉转录文本仍检出乱码块（${garbled.join('、')}）：多模态转录输出异常，已显式失败（不静默降级）。请检查视觉模型输出或改用 --no-vision 人工处理。`);
    }
  }

  // S2 有界 LLM 提取（缓存命中则跳过）；rule_id 幂等去重对新鲜与缓存草稿同等生效。
  // property_key 目录（S2 prompt 闭集注入 + S3 命名漂移注册表同源）：空库返回空 Map——
  // 注入降级为不注入、注册表 lint 跳过，首次建库不阻断
  const propertyKeyCatalog = scanPropertyKeyCatalog(outRoot);
  if (cached.drafts.slices.length === 0 && Object.keys(cached.drafts.meta).length === 0) {
    progress('S2 提取：LLM 按块类型提取 meta/切片/条款/工艺探伤规则/动态公式/公差表草稿...');
    const chat = options.chatClient || createDefaultChatClient();
    cached.drafts = await extractAll(cached.blocks, chat, (msg) => progress('  ' + msg), propertyKeyCatalog);
    fs.writeFileSync(path.join(cacheDir, 'drafts.json'), JSON.stringify(cached.drafts, null, 2));
  }
  dedupeDraftRules(cached.drafts);
  sanitizeToleranceNumericFields(cached.drafts);
  normalizeSourceClauseRefs(cached.drafts);
  // S2 产物契约（含缓存草稿归一）：spec_type/standard_code/description 由 harness 确定性补齐
  fillSliceHarnessFields(cached.drafts);
  // v3 文本来源标记：视觉转录通道产物显式记录（review-report 显著标注，溯源断言对象为转录文本）
  if (textSource === 'vision') {
    cached.drafts.meta.text_source = 'vision';
  }

  // v2 公差表落 meta.tolerance_tables：剥离 S2 内部锚点 source_block；
  // 跨标准外部引用记录保留在 meta 中（review-report 显著标注，被引标准数据须人工补录）。
  // 无公差表时删除该键，避免向存量 meta 注入空噪声（存量表净减由 promote no-net-loss 把关）
  if (cached.drafts.tolerance_tables.length > 0) {
    cached.drafts.meta.tolerance_tables = cached.drafts.tolerance_tables.map((t: DraftToleranceTable) => {
      const { source_block: _sourceBlock, ...rest } = t;
      return rest;
    });
  } else {
    delete cached.drafts.meta.tolerance_tables;
  }

  // S2 产物声明提取规则族：写入 drafts/meta.extracted_families，驱动 S3 类别覆盖 lint，
  // 并作为 promote 按族合并的合并范围依据（整标准全量提取时不写部分覆盖标记）
  const declaredFamilies =
    options.declaredFamilies && options.declaredFamilies.length > 0 ? options.declaredFamilies : [...FULL_RULE_FAMILIES];
  if (!options.fullCoverage) {
    cached.drafts.meta.extracted_families = declaredFamilies;
  }

  // S3 质量门禁（含 property_key 注册表命名漂移 lint；注册表与 S2 闭集注入同源，空库跳过）
  progress('S3 门禁：Zod 契约 + 领域 linter + 命名漂移注册表 + 公式 lint + 溯源断言 + 牌号对账...');
  const clauseTextIndex = buildClauseTextIndex(cached.blocks);
  const expectedGradeRows = cached.blocks
    .filter((b) => b.blockType === 'chemistry_table' && !isAppendixLikeRef(b.clauseRef))
    .reduce((sum, b) => sum + countGradeRows(b.text), 0);
  const gate = runGates({
    meta: cached.drafts.meta,
    slices: cached.drafts.slices,
    clauses: cached.drafts.clauses,
    clauseTextIndex,
    expectedGradeRows: expectedGradeRows > 0 ? expectedGradeRows : null,
    declaredFamilies,
    propertyKeyRegistry: new Set(propertyKeyCatalog.keys()),
    toleranceTables: cached.drafts.tolerance_tables,
    unmountedRules: cached.drafts.unmounted_rules,
  });

  const metaId = String(cached.drafts.meta.standard_id || 'UNKNOWN_STANDARD');
  const stdDirName = stdDirNameFromMeta(cached.drafts.meta);
  const stdDir = path.join(outRoot, stdDirName);
  const existingStdDir = fs.existsSync(path.join(stdDir, 'meta.json')) ? stdDir : null;
  const report = buildReviewReport(metaId, cached.drafts, clauseTextIndex, gate.issues, existingStdDir);

  if (!gate.passed) {
    // 任何门禁失败：不写入 staging/正式库，报告落缓存目录并标记 MANUAL_REVIEW
    const reportPath = path.join(cacheDir, 'review-report.md');
    fs.writeFileSync(reportPath, report, 'utf8');
    progress(`S3 门禁未通过：${gate.issues.length} 个问题，已标记 MANUAL_REVIEW`);
    return { status: 'MANUAL_REVIEW', stdDir, issues: gate.issues, reportPath, drafts: cached.drafts };
  }

  // S4 写入 staging（可重写的暂存区，非正式库）+ 抽检报告；正式库仅接受显式 promote
  const stagingRoot = options.stagingRoot || path.join(cacheRoot, 'staging');
  const stagingDir = path.join(stagingRoot, stdDirName);
  progress(`S4 落盘 staging：写入 ${stagingDir}（正式库未触碰，须显式 promote 且过 no-net-loss 门禁）`);
  const slicesDir = path.join(stagingDir, 'slices');
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(slicesDir, { recursive: true });
  fs.writeFileSync(path.join(stagingDir, 'meta.json'), JSON.stringify(cached.drafts.meta, null, 2));
  fs.writeFileSync(
    path.join(stagingDir, 'clauses.json'),
    JSON.stringify(cached.drafts.clauses.map(({ clause_id, title, text }) => ({ clause_id, title, text })), null, 2),
  );
  for (const slice of cached.drafts.slices) {
    const stripSource = {
      ...slice,
      evaluation_rules: slice.evaluation_rules.map(({ source_clause: _sourceClause, applies_to_grades: _applies, ...rule }) => rule),
    };
    // 部分覆盖产物标记（与存量切片标记形态一致）：promote 按族合并后由 updateCoverageMarkers 清除/更新
    if (!options.fullCoverage) {
      (stripSource as Record<string, unknown>).coverage = 'partial';
      (stripSource as Record<string, unknown>).extracted_families = [...declaredFamilies];
    }
    fs.writeFileSync(path.join(slicesDir, `${sliceFileKey(slice)}.json`), JSON.stringify(stripSource, null, 2));
  }
  const reportPath = path.join(stagingDir, 'review-report.md');
  fs.writeFileSync(reportPath, report, 'utf8');

  if (existingStdDir) {
    progress('S4 对账：staging 产物与存量同标准规则级全量 diff 已写入抽检报告，promote 前请人工复核');
  }
  return { status: 'OK', stdDir, stagingDir, issues: [], reportPath, drafts: cached.drafts };
}
