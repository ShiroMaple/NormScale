import type { BlockType, TextBlock } from './types.ts';
import type { StandardProfile } from './standard-profile.ts';
import { ZH_CN_PROFILE } from './standard-profile.ts';

/* ==========================================================================
   S1 标准文本确定性切块器 (Segmenter)
   - 纯函数、无 IO：全文文本 -> 锚点切块 -> 块类型路由 -> 子孙条款类型继承/表注归属后处理
   - 语言/体系行为全部由 StandardProfile 注入（阶段 C）：锚点正则、标题判定、乱码检测、
     路由关键词、牌号行识别——缺省 zh-cn 档与历史实现逐常量一致
   - 锚点：章节号（4 / 5.2 / 5.2.1）、表 N（en: TABLE N，容忍页码粘连前缀）、附录/ANNEX、前言
   - 表格块内部不再按章节号切分（表格行以序号开头，形似小节号）
   - 行级乱码检测：字体子集化无 ToUnicode 的 PDF 表格页输出乱码，必须显式识别为 garbled
     块上抛，防止乱码静默进入 LLM 提取环节
   ========================================================================== */

// CJK 表意文字（乱码行判定的"无 CJK"前提，仅 zh 档 garbledTest 使用）
const CJK_IDEOGRAPH_RE = /[一-鿿]/;

/**
 * 文本层乱码检测（zh 档缺省，保持历史行为）：
 * 无 CJK 表意文字且标点占比畸高即为乱码（字体子集化无 ToUnicode 的矢量乱码特征；
 * 纯英文标题/纯数字行不会误判——它们几乎不含标点）。en 档用 profile.garbledTest
 * （字母占比过低 + 符号多样性，不能用"无 CJK"判定）。
 */
export function isGarbledText(text: string, profile: StandardProfile = ZH_CN_PROFILE): boolean {
  // 先剔除点线引导符（公式编号/目次的 "......(3)" 形态）与 LaTeX 命令标记
  // （视觉转录可能输出 \frac{\pi} 形态）：两者均为排版/标记噪声，符号多样性会误触
  // 乱码判定；真实乱码（字体子集化垃圾符号）无此形态，不受影响
  const squashed = text
    .replace(/\s+/g, '')
    .replace(/[.…·]{3,}/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '');
  if (squashed.length < 20) return false;
  if (profile.id === 'zh-cn' && CJK_IDEOGRAPH_RE.test(squashed)) return false;
  return profile.garbledTest(squashed);
}

/**
 * 判断行是否为章节标题行：编号 scheme 中英一致（en 档容忍页码粘连前缀并规范化前导零），
 * 标题部由 profile.headingTitleTest 判定（zh：纯 CJK；en：纯拉丁、无数字、不以逗/分号结尾）；
 * 含牌号表行特征的行视为表格行不切块
 */
function isClauseHeading(line: string, profile: StandardProfile): { clauseRef: string; title: string } | null {
  const heading = profile.matchHeading(line);
  if (!heading) return null;
  if (Number.parseInt(heading.clauseRef, 10) === 0) return null;
  const { min, max } = profile.headingTitleLength;
  if (heading.title.length < min || heading.title.length > max) return null;
  if (!profile.headingTitleTest(heading.title)) return null;
  // 标题部拒绝模式（en：力学表硬度列折行值 "90 HRB" 的标题部 HRB 为纯硬度单位令牌）
  if (profile.headingTitleReject?.test(heading.title)) return null;
  // 牌号表行（单行形态，去掉 /g /m 避免 lastIndex 状态污染）
  const gradeRowLineRe = new RegExp(profile.gradeRowRe.source);
  if (gradeRowLineRe.test(line)) return null;
  return heading;
}

/** 块文本是否具备牌号表特征（profile 牌号行计数或牌号令牌） */
function looksLikeGradeTable(text: string, profile: StandardProfile): boolean {
  return countGradeRows(text, profile) > 0 || profile.gradeTokenRe.test(text);
}

/**
 * 块类型路由：按 profile 路由关键词归类
 * 化学成分/力学性能表要求块内确实存在牌号行，防止前言/引用文件被误路由
 */
export function classifyBlock(clauseRef: string, text: string, profile: StandardProfile = ZH_CN_PROFILE): BlockType {
  if (isGarbledText(text, profile)) return 'garbled';
  if (profile.anchors.foreword.test(clauseRef) || clauseRef === '1') return 'scope_text';
  if (profile.scopeTextRe.test(text) && !/应符合|不应|应能|shall conform|shall be tested/i.test(text)) return 'scope_text';

  const isAppendix = profile.isAppendixRef(clauseRef);
  const isTableRef = profile.isTableRef(clauseRef) || isAppendix;
  const kw = profile.routerKeywords;
  if (isTableRef) {
    if (kw.process_ndt_clauses?.test(text)) return 'process_ndt_clauses';
    if (kw.chemistry_table?.test(text) && looksLikeGradeTable(text, profile)) return 'chemistry_table';
    if (kw.mechanical_table?.test(text) && looksLikeGradeTable(text, profile)) return 'mechanical_table';
    // 公差表仅从正文表（非附录）路由，且必须具备尺寸语境
    if (!isAppendix && kw.tolerance_table?.test(text) && profile.dimensionContext.test(text)) return 'tolerance_table';
    return 'other';
  }

  if (kw.process_ndt_clauses?.test(text)) return 'process_ndt_clauses';
  if (kw.chemistry_table?.test(text) && looksLikeGradeTable(text, profile)) return 'chemistry_table';
  if (kw.mechanical_table?.test(text) && looksLikeGradeTable(text, profile)) return 'mechanical_table';
  return 'other';
}

interface RawSegment {
  clauseRef: string;
  lines: string[];
  garbled: boolean;
}

/**
 * S1 主入口：全文文本 -> 锚点切块（纯函数）
 */
export function segmentText(fullText: string, profile: StandardProfile = ZH_CN_PROFILE): TextBlock[] {
  const lines = fullText.split('\n');
  const segments: RawSegment[] = [];
  let currentRef = profile.id === 'zh-cn' ? '前言' : 'FOREWORD';
  let currentLines: string[] = [];
  let currentGarbled = false;
  let garbleCount = 0;

  const flush = (): void => {
    if (currentLines.length > 0) {
      segments.push({ clauseRef: currentRef, lines: currentLines, garbled: currentGarbled });
      currentLines = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0 || profile.anchors.pageFooter.test(line)) continue;

    // 行级乱码检测：乱码行独立累积成块，绝不混入正常块
    if (isGarbledText(line, profile)) {
      if (!currentGarbled) {
        flush();
        garbleCount += 1;
        currentRef = `乱码区块${garbleCount}`;
        currentGarbled = true;
      }
      currentLines.push(line);
      continue;
    }
    if (currentGarbled) {
      flush();
      currentGarbled = false;
      currentRef = '未锚定';
    }

    const heading = isClauseHeading(line, profile);
    const tableAnchor = profile.anchors.table.exec(line);
    const appendixAnchor = profile.anchors.appendix.exec(line);

    if (tableAnchor) {
      flush();
      currentRef = (profile.id === 'zh-cn' ? '表' : 'TABLE') + (tableAnchor[1] || '').replace(/\s+/g, '');
      currentLines = [line];
    } else if (appendixAnchor) {
      flush();
      currentRef = (profile.id === 'zh-cn' ? '附录' : 'ANNEX') + (appendixAnchor[1] || '');
      currentLines = [line];
    } else if (heading) {
      flush();
      currentRef = heading.clauseRef;
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  const blocks = segments
    .map((s) => {
      const text = s.lines.join('\n').trim();
      return {
        blockType: s.garbled ? ('garbled' as BlockType) : classifyBlock(s.clauseRef, text, profile),
        clauseRef: s.clauseRef,
        text,
      };
    })
    .filter((b) => b.text.length > 0);
  // 子孙条款类型继承后处理（S1 产物契约）：误判为标题的正文行独立成块后按最近祖先类型修正
  // 表注归属合并后处理：表注块合并回前方最近的表块（穿透 vision【第 N 页】锚点块）
  return mergeTableNotes(inheritAncestorBlockType(blocks), profile);
}

/**
 * 纯标题块判定：去除首行 clauseRef 标题行后几乎无正文（<20 字符，如 "6.5 工艺性能" 标题块）。
 * 纯标题块的 other 类型不代表语义归属（标题本身不含路由关键词），类型继承查找时可被穿透；
 * 但有实质内容的 other 祖先语义归属不明，继承链到此为止（防止跨章节误继承）。
 */
function isPureHeadingBlock(block: TextBlock): boolean {
  const body = block.text.split('\n').slice(1).join('').replace(/\s+/g, '');
  return body.length < 20;
}

/**
 * 表注归属合并（S1 产物契约，纯函数）：表注行形态由 profile.noteLineTest 判定
 * （zh "注N："；en 上标脚注 "A Maximum…" 单字母标记行）。注块若前方最近的实质块是
 * 表块（profile.isTableRef，中间可隔 vision【第 N 页】锚点块），则合并回该表块——
 * 保证表注留在表块内（condition_adjustments/成分注记依赖）；找不到归属表块则保留原块，
 * 换行折页的注续行（不通过 noteLineTest）不在合并范围。
 */
export function mergeTableNotes(blocks: TextBlock[], profile: StandardProfile = ZH_CN_PROFILE): TextBlock[] {
  const nonEmptyLines = (b: TextBlock): string[] => b.text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const isNoteBlock = (b: TextBlock): boolean => {
    if (profile.isTableRef(b.clauseRef) || profile.isAppendixRef(b.clauseRef)) return false;
    const lines = nonEmptyLines(b);
    return lines.length > 0 && lines.every((l) => profile.noteLineTest(l));
  };
  const isPageAnchorBlock = (b: TextBlock): boolean => {
    const lines = nonEmptyLines(b);
    return lines.length > 0 && lines.every((l) => /^【第\s*\d+\s*页】$/.test(l));
  };
  const result: TextBlock[] = [];
  for (const block of blocks) {
    if (!isNoteBlock(block)) {
      result.push(block);
      continue;
    }
    // 向前穿透【第 N 页】锚点块，找最近的实质块
    let j = result.length - 1;
    while (j >= 0 && isPageAnchorBlock(result[j]!)) j--;
    const target = j >= 0 ? result[j]! : null;
    if (target && profile.isTableRef(target.clauseRef)) {
      target.text = `${target.text}\n${block.text}`;
      continue;
    }
    result.push(block);
  }
  return result;
}

/**
 * 子孙条款类型继承（纯函数）：clauseRef 为 X.Y.Z（三级及以上）且自身归类为 other 的块，
 * 自 X.Y 向 X 逐级查找最近祖先块——祖先缺失继续向上；最近祖先为 other 时，
 * 纯标题祖先可被穿透继续向上，有实质内容的 other 祖先不继承；garbled 祖先不继承；
 * 最近可继承祖先为其他类型（如 process_ndt_clauses）则继承其类型。同输入同输出。
 */
export function inheritAncestorBlockType(blocks: TextBlock[]): TextBlock[] {
  const byRef = new Map(blocks.map((b) => [b.clauseRef, b]));
  const inherit = (block: TextBlock): TextBlock => {
    if (block.blockType !== 'other') return block;
    const ref = block.clauseRef;
    if (!/^\d{1,2}\.\d{1,2}\.\d{1,2}(\.\d{1,2})?$/.test(ref)) return block;
    const parts = ref.split('.');
    for (let depth = parts.length - 1; depth >= 1; depth--) {
      const ancestor = byRef.get(parts.slice(0, depth).join('.'));
      if (!ancestor) continue; // 该级祖先块缺失，继续向上
      if (ancestor.blockType === 'garbled') return block; // 乱码祖先无类型可继承
      if (ancestor.blockType === 'other') {
        if (isPureHeadingBlock(ancestor)) continue; // 纯标题祖先可穿透，继续向上
        return block; // 有实质内容的 other 祖先：语义归属不明，不继承
      }
      return { ...block, blockType: ancestor.blockType };
    }
    return block;
  };
  return blocks.map(inherit);
}

/**
 * 统计化学成分表块内的牌号行数（S3 对账基准；牌号行形态由 profile 注入）
 */
export function countGradeRows(blockText: string, profile: StandardProfile = ZH_CN_PROFILE): number {
  const matches = blockText.match(profile.gradeRowRe);
  return matches ? matches.length : 0;
}
