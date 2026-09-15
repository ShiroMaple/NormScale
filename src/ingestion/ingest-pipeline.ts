import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preprocessPdf } from './preprocess.ts';
import { countGradeRows, segmentText } from './segmenter.ts';
import { createDefaultChatClient, dedupeDraftRules, extractAll, isAppendixLikeRef } from './llm-extract.ts';
import { buildClauseTextIndex, runGates } from './gates.ts';
import type { GateIssue } from './gates.ts';
import type { ChatClient, ExtractionDrafts, TextBlock } from './types.ts';
import { validateAllStandards } from '../tools/validate-standards.ts';

/* ==========================================================================
   S4 入库编排 (Ingest Pipeline)
   - 串联 S0 预处理 -> S1 切块 -> S2 LLM 提取 -> S3 质量门禁
   - 缓存与版本门禁：缓存目录记录 ingestConfigVersion，不匹配则整目录重提
   - 全部门禁通过后写入 data/standards/<STD_DIR>/（斜杠/点/空格转下划线），
     生成 review-report.md 人工抽检报告，并调用 validateAllStandards 最终回归
   - 任何失败显式抛错或标记 MANUAL_REVIEW，绝不静默通过
   ========================================================================== */

// 入库配置版本：S1 切块规则 / S2 prompt / S3 门禁策略变更时递增，触发缓存重提
export const ingestConfigVersion = '1.0.0';

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
  /** 入库根目录；缺省 data/standards。测试必须指向临时目录 */
  outRoot?: string;
  /** 缓存根目录；缺省 .cache/standard-ingest */
  cacheRoot?: string;
  /** 忽略缓存与版本门禁，全量重提 */
  force?: boolean;
  onProgress?: (message: string) => void;
}

export interface IngestResult {
  status: 'OK' | 'MANUAL_REVIEW';
  stdDir: string;
  issues: GateIssue[];
  reportPath?: string;
  validation?: { success: boolean; totalStandards: number; totalSlices: number; errors: string[] };
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
 * 生成人工抽检报告：每切片关键指标 <-> 来源条款原文对照表
 */
function buildReviewReport(metaId: string, drafts: ExtractionDrafts, clauseTextIndex: Record<string, string>, issues: GateIssue[]): string {
  const lines: string[] = [];
  lines.push(`# 标准入库人工抽检报告：${metaId}`);
  lines.push('');
  lines.push(`- 入库管线版本: ${ingestConfigVersion}`);
  lines.push(`- 切片数: ${drafts.slices.length}，条款数: ${drafts.clauses.length}`);
  lines.push(`- 门禁结论: ${issues.length === 0 ? '全部通过' : '存在阻塞项，需人工复核'}`);
  lines.push('');

  if (issues.length > 0) {
    lines.push('## 待人工复核项');
    lines.push('');
    for (const issue of issues) {
      lines.push(`- [${issue.code}] ${issue.message}`);
    }
    lines.push('');
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

  // S3 质量门禁
  progress('S3 门禁：Zod 契约 + 领域 linter + 溯源断言 + 牌号对账...');
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
  });

  const metaId = String(cached.drafts.meta.standard_id || 'UNKNOWN_STANDARD');
  const stdDirName = metaId.replace(/[/\s.\-—]/g, '_');
  const stdDir = path.join(outRoot, stdDirName);
  const report = buildReviewReport(metaId, cached.drafts, clauseTextIndex, gate.issues);

  if (!gate.passed) {
    // 任何门禁失败：不写入正式库，报告落缓存目录并标记 MANUAL_REVIEW
    const reportPath = path.join(cacheDir, 'review-report.md');
    fs.writeFileSync(reportPath, report, 'utf8');
    progress(`S3 门禁未通过：${gate.issues.length} 个问题，已标记 MANUAL_REVIEW`);
    return { status: 'MANUAL_REVIEW', stdDir, issues: gate.issues, reportPath, drafts: cached.drafts };
  }

  // S4 写入正式库 + 抽检报告 + 最终回归
  progress(`S4 入库：写入 ${stdDir}`);
  const metaParsed = cached.drafts.meta;
  const slicesDir = path.join(stdDir, 'slices');
  fs.rmSync(stdDir, { recursive: true, force: true });
  fs.mkdirSync(slicesDir, { recursive: true });
  fs.writeFileSync(path.join(stdDir, 'meta.json'), JSON.stringify(metaParsed, null, 2));
  fs.writeFileSync(
    path.join(stdDir, 'clauses.json'),
    JSON.stringify(cached.drafts.clauses.map(({ clause_id, title, text }) => ({ clause_id, title, text })), null, 2),
  );
  for (const slice of cached.drafts.slices) {
    const fileKey = `${slice.spec_key || slice.primary_grade || 'UNKNOWN'}_${slice.primary_grade || ''}`.replace(/[/\\:]/g, '_');
    const stripSource = {
      ...slice,
      evaluation_rules: slice.evaluation_rules.map(({ source_clause: _sourceClause, ...rule }) => rule),
    };
    fs.writeFileSync(path.join(slicesDir, `${fileKey}.json`), JSON.stringify(stripSource, null, 2));
  }
  const reportPath = path.join(stdDir, 'review-report.md');
  fs.writeFileSync(reportPath, report, 'utf8');

  progress('S4 回归：执行 validateAllStandards 最终校验...');
  const validation = validateAllStandards(outRoot);
  return { status: 'OK', stdDir, issues: [], reportPath, validation, drafts: cached.drafts };
}
