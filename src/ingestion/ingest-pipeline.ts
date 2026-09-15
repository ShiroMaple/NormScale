import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preprocessPdf } from './preprocess.ts';
import { countGradeRows, segmentText } from './segmenter.ts';
import { createDefaultChatClient, dedupeDraftRules, extractAll, fillSliceHarnessFields, isAppendixLikeRef } from './llm-extract.ts';
import { buildClauseTextIndex, runGates } from './gates.ts';
import type { GateIssue } from './gates.ts';
import type { ChatClient, ExtractionDrafts, TextBlock } from './types.ts';
import { diffStandards, loadStandardDir, scanPropertyKeyRegistry, sliceFileKey, stdDirNameFromMeta } from './promote.ts';
import type { SliceOnDisk } from './promote.ts';

/* ==========================================================================
   S4 入库编排 (Ingest Pipeline)
   - 串联 S0 预处理 -> S1 切块 -> S2 LLM 提取 -> S3 质量门禁
   - 缓存与版本门禁：缓存目录记录 ingestConfigVersion，不匹配则整目录重提
   - 门禁全过后产物只写入 staging（.cache/standard-ingest/staging/<STD_DIR>/，
     含 meta.json/clauses.json/slices/review-report.md），绝不直接触碰 data/standards；
     data/standards 仅接受 promote.ts 的显式 promote（no-net-loss + 按族合并 + 完成门禁）
   - review-report.md 含与存量同标准的规则级全量 diff 章节（存在丢失项不得判定全部通过）
   - 任何失败显式抛错或标记 MANUAL_REVIEW，绝不静默通过
   ========================================================================== */

// 入库配置版本：S1 切块规则 / S2 prompt / S3 门禁策略变更时递增，触发缓存重提
export const ingestConfigVersion = '1.1.0';

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
  /** 正式库根目录；缺省 data/standards。仅用于存量对账/注册表扫描与报告，绝不直接写入。测试必须指向临时目录 */
  outRoot?: string;
  /** 缓存根目录；缺省 .cache/standard-ingest */
  cacheRoot?: string;
  /**
   * staging 根目录；缺省 <cacheRoot>/staging（即 .cache/standard-ingest/staging）。
   * 管线产物只写这里，promote 前不触碰正式库
   */
  stagingRoot?: string;
  /** 声明的提取规则族（写入 meta.extracted_families 并驱动类别覆盖 lint）；缺省 ['chemical','mechanical']（v1 提取范围） */
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
 * 与既有存量的规则级全量 diff（存在丢失项时按验收口径不得判定"全部通过"）
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
  lines.push(`- 切片数: ${drafts.slices.length}，条款数: ${drafts.clauses.length}`);
  lines.push(`- 落盘位置: staging（正式库须显式 promote，no-net-loss 门禁把关）`);
  lines.push('');

  // 与存量同标准的规则级全量 diff（新增/丢失/变更三类清单）
  let diffSection: string[] | null = null;
  let diffLostCount = 0;
  if (existingStdDir) {
    const base = loadStandardDir(existingStdDir);
    const candidateSlices = drafts.slices.map((s) => {
      const { evaluation_rules, ...rest } = s;
      return {
        ...rest,
        evaluation_rules: evaluation_rules.map(({ source_clause: _sourceClause, ...rule }) => rule),
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
    lines.push('| rule_id | 类别 | 指标 | 下限 | 上限 | 单位 | 来源条款 | 原文摘录 |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const rule of slice.evaluation_rules) {
      const c = rule.criteria as { min?: unknown; max?: unknown; unit?: unknown };
      const min = typeof c.min === 'number' ? String(c.min) : '';
      const max = typeof c.max === 'number' ? String(c.max) : '';
      const unit = typeof c.unit === 'string' ? c.unit : '';
      const excerpt = (clauseTextIndex[rule.source_clause] || '（来源条款未找到）').replace(/\n+/g, ' ').slice(0, 90);
      lines.push(`| ${rule.rule_id} | ${rule.category} | ${rule.property_key} | ${min} | ${max} | ${unit} | ${rule.source_clause} | ${excerpt} |`);
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
  if (options.rawText !== undefined) {
    fullText = options.rawText;
    md5 = crypto.createHash('md5').update(fullText, 'utf8').digest('hex');
    cacheDir = path.join(cacheRoot, md5);
  } else {
    progress('S0 预处理：提取 PDF 矢量文本层...');
    const pre = await preprocessPdf(options.pdfPath!, cacheRoot);
    md5 = pre.md5;
    cacheDir = pre.cacheDir;
    fullText = pre.fullText;
  }
  checkVersionGate(cacheDir, options.force);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, 'version.json'), JSON.stringify({ ingestConfigVersion, md5 }, null, 2));

  const cached: CacheBundle = {
    md5,
    cacheDir,
    fullText,
    blocks: readJsonIfExists<TextBlock[]>(path.join(cacheDir, 'blocks.json')) || [],
    drafts: readJsonIfExists<ExtractionDrafts>(path.join(cacheDir, 'drafts.json')) || { meta: {}, slices: [], clauses: [] },
  };

  // S1 确定性切块（缓存命中则跳过）
  if (cached.blocks.length === 0) {
    progress('S1 切块：按章节号/表/附录锚点确定性切块...');
    cached.blocks = segmentText(fullText);
    fs.writeFileSync(path.join(cacheDir, 'blocks.json'), JSON.stringify(cached.blocks, null, 2));
  }

  const garbled = cached.blocks.filter((b) => b.blockType === 'garbled').map((b) => b.clauseRef);
  if (garbled.length > 0) {
    throw new GarbledTextLayerError(garbled);
  }

  // S2 有界 LLM 提取（缓存命中则跳过）；rule_id 幂等去重对新鲜与缓存草稿同等生效
  if (cached.drafts.slices.length === 0 && Object.keys(cached.drafts.meta).length === 0) {
    progress('S2 提取：LLM 按块类型提取 meta/切片/条款草稿...');
    const chat = options.chatClient || createDefaultChatClient();
    cached.drafts = await extractAll(cached.blocks, chat, (msg) => progress('  ' + msg));
    fs.writeFileSync(path.join(cacheDir, 'drafts.json'), JSON.stringify(cached.drafts, null, 2));
  }
  dedupeDraftRules(cached.drafts);
  // S2 产物契约（含缓存草稿归一）：spec_type/standard_code/description 由 harness 确定性补齐
  fillSliceHarnessFields(cached.drafts);

  // S2 产物声明提取规则族：写入 drafts/meta.extracted_families，驱动 S3 类别覆盖 lint，
  // 并作为 promote 按族合并的合并范围依据（整标准全量提取时不写部分覆盖标记）
  const declaredFamilies = options.declaredFamilies && options.declaredFamilies.length > 0 ? options.declaredFamilies : ['chemical', 'mechanical'];
  if (!options.fullCoverage) {
    cached.drafts.meta.extracted_families = declaredFamilies;
  }

  // S3 质量门禁（含 property_key 注册表命名漂移 lint；注册表来自正式库全量扫描，空库跳过）
  progress('S3 门禁：Zod 契约 + 领域 linter + 命名漂移注册表 + 溯源断言 + 牌号对账...');
  const clauseTextIndex = buildClauseTextIndex(cached.blocks);
  const expectedGradeRows = cached.blocks
    .filter((b) => b.blockType === 'chemistry_table' && !isAppendixLikeRef(b.clauseRef))
    .reduce((sum, b) => sum + countGradeRows(b.text), 0);
  const propertyKeyRegistry = scanPropertyKeyRegistry(outRoot);
  const gate = runGates({
    meta: cached.drafts.meta,
    slices: cached.drafts.slices,
    clauses: cached.drafts.clauses,
    clauseTextIndex,
    expectedGradeRows: expectedGradeRows > 0 ? expectedGradeRows : null,
    declaredFamilies,
    propertyKeyRegistry,
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
      evaluation_rules: slice.evaluation_rules.map(({ source_clause: _sourceClause, ...rule }) => rule),
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
