import type { BlockType, TextBlock } from './types.ts';

/* ==========================================================================
   S1 标准文本确定性切块器 (Segmenter)
   - 纯函数、无 IO：全文文本 -> 锚点切块 -> 块类型路由 -> 子孙条款类型继承后处理
   - 锚点：章节号（4 / 5.2 / 5.2.1）、表 N、附录 X、前言
   - 表格块内部不再按章节号切分（表格行以序号开头，形似小节号）
   - 另含行级乱码检测：字体子集化无 ToUnicode 的 PDF 表格页输出乱码，
     必须显式识别为 garbled 块上抛，防止乱码静默进入 LLM 提取环节
   ========================================================================== */

// 章节号行：如 "7 技术要求"、"7.4 力学性能"、"6.10.1.1 无缝管应逐根……"
const CLAUSE_HEADING_RE = /^(\d{1,2}(?:\.\d{1,2}){0,3})[ \t　]+(\S.*)$/;
// 表锚点行：如 "表3 钢的牌号和化学成分"、"表 A.1 xxx"、"表 A.1（续）"
// 要求表号后必须跟空白，排除前言中 "表3);" 之类的行内引用
const TABLE_ANCHOR_RE = /^表\s*(\d+[A-Za-z]?|[A-Z]\.\d+)[ \t　]+(.*)$/;
// 附录锚点行：如 "附录 A（资料性）……"
const APPENDIX_ANCHOR_RE = /^附录\s*([A-ZＡ-Ｚ])(?:[^0-9A-Za-z]|$)/;
// 页脚行：标准编号 / 页码
const PAGE_FOOTER_RE = /^\s*(?:[A-Z]{1,3}\/[A-Z]{1,3}[ \t]*\d[\d.\s]*[—-][\d\s]+|\d{1,3})\s*$/;
// CJK 表意文字（标题判定用：数字行/纯符号行不含表意文字）
const CJK_IDEOGRAPH_RE = /[一-鿿]/;
// 纯 CJK 标题：章节标题由纯汉字与 CJK 标点构成；含字母/数字的行是表格行或条款正文
const PURE_CJK_TITLE_RE = /^[一-鿿　-〿、。，；：！？（）《》“”·—…~-]+$/;
// 牌号令牌：块内出现牌号特征即视为牌号表（容忍单行表文本）
const GRADE_TOKEN_RE = /(?:\d{2,3}Cr[0-9A-Za-z]{2,}|S\d{5})/;
// 标点符号集：乱码文本的标志性特征（字母与数字都不算）
const PUNCT_SYMBOL_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~。、·《》]/g;
// 牌号表行特征：序号 + 牌号（如 06Cr19Ni10 / 022Cr19Ni10 / S30408 开头）
const GRADE_ROW_RE = /^\s*\d{1,2}\s+(?:\d{2,3}Cr[0-9A-Za-z]+|S\d{5}|[A-Z]{1,2}\d{2,}[A-Za-z]?)\b/;
// 牌号行计数：用于 S3 原文牌号行数对账
// 行首允许出现组织类型列前缀（如 "体型 22 06Cr13"，PDF 提取时组织类型列文本与序号行粘连）
const GRADE_ROW_COUNT_RE = /^\s*(?:[一-鿿]{1,4}\s+)?\d{1,2}\s+(?:\d{2,3}Cr[0-9A-Za-z]+|S\d{5})\b/gm;

/**
 * 文本层乱码检测：无 CJK 表意文字且标点占比畸高即为乱码
 * （典型场景：PDF 表格字体子集化且缺失 ToUnicode CMap，矢量文本输出为乱码；
 *   纯英文标题/纯数字行不会被误判，因为它们几乎不含标点）
 */
export function isGarbledText(text: string): boolean {
  // 先剔除点线引导符（公式编号/目次的 "......(3)" 形态）与 LaTeX 命令标记
  // （视觉转录可能输出 \frac{\pi} 形态）：两者均为排版/标记噪声，符号多样性会误触
  // 乱码判定；真实乱码（字体子集化垃圾符号）无此形态，不受影响
  const squashed = text
    .replace(/\s+/g, '')
    .replace(/[.…·]{3,}/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '');
  if (squashed.length < 20) return false;
  if (CJK_IDEOGRAPH_RE.test(squashed)) return false;
  const punctChars = squashed.match(PUNCT_SYMBOL_RE) || [];
  if (punctChars.length / squashed.length <= 0.3) return false;
  // 标点字符种类丰富是乱码的强特征；目次点线（仅 · （ ） 等少数符号）不算
  return new Set(punctChars).size >= 6;
}

/**
 * 判断行是否为章节标题行：
 * 标题必须为纯 CJK（汉字 + CJK 标点），含字母/数字的行视为表格行或条款正文；
 * 条款正文行（如 7.5.1 钢管应逐根……P=2SR/D）不切块，由 gates 的内嵌标题索引覆盖溯源
 */
function isClauseHeading(line: string): { clauseRef: string; title: string } | null {
  const m = CLAUSE_HEADING_RE.exec(line);
  if (!m) return null;
  const clauseRef = m[1] || '';
  const title = (m[2] || '').trim();
  if (Number.parseInt(clauseRef, 10) === 0) return null;
  if (title.length < 2 || title.length > 40) return null;
  if (!PURE_CJK_TITLE_RE.test(title)) return null;
  if (GRADE_ROW_RE.test(line)) return null;
  return { clauseRef, title };
}

/** 块文本是否具备牌号表特征（牌号行计数或牌号令牌） */
function looksLikeGradeTable(text: string): boolean {
  return countGradeRows(text) > 0 || GRADE_TOKEN_RE.test(text);
}

/**
 * 块类型路由：按标准文档惯例关键词归类
 * 化学成分/力学性能表要求块内确实存在牌号行，防止前言/引用文件被误路由
 */
export function classifyBlock(clauseRef: string, text: string): BlockType {
  if (isGarbledText(text)) return 'garbled';
  if (clauseRef === '前言' || clauseRef === '1') return 'scope_text';
  if (/本文件规定|本文件适用/.test(text) && !/应符合|不应|应能/.test(text)) return 'scope_text';

  const isAppendix = clauseRef.startsWith('附录');
  const isTableRef = clauseRef.startsWith('表') || isAppendix;
  if (isTableRef) {
    if (/压扁|扩口|卷边|液压|水压|涡流|超声|晶间|无损|射线|渗透|致密|晶粒度|金相|粗糙度|表面质量|弯曲|展平/.test(text)) return 'process_ndt_clauses';
    if (/化学成分|熔炼分析/.test(text) && looksLikeGradeTable(text)) return 'chemistry_table';
    if (/力学性能|抗拉强度|屈服强度|断后伸长率|拉伸/.test(text) && looksLikeGradeTable(text)) return 'mechanical_table';
    // 公差表仅从正文表（非附录）路由，且必须具备外径/壁厚语境
    if (!isAppendix && /允许偏差|公称外径|公称壁厚/.test(text) && /外径|壁厚/.test(text)) return 'tolerance_table';
    return 'other';
  }

  if (/压扁|扩口|卷边|液压|水压|涡流|超声|晶间腐蚀|无损|射线|渗透|致密|晶粒度|金相|粗糙度|表面质量|弯曲|展平/.test(text)) return 'process_ndt_clauses';
  if (/化学成分|熔炼分析/.test(text) && looksLikeGradeTable(text)) return 'chemistry_table';
  if (/力学性能|抗拉强度|屈服强度|断后伸长率/.test(text) && looksLikeGradeTable(text)) return 'mechanical_table';
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
export function segmentText(fullText: string): TextBlock[] {
  const lines = fullText.split('\n');
  const segments: RawSegment[] = [];
  let currentRef = '前言';
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
    if (line.length === 0 || PAGE_FOOTER_RE.test(line)) continue;

    // 行级乱码检测：乱码行独立累积成块，绝不混入正常块
    if (isGarbledText(line)) {
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

    const heading = isClauseHeading(line);
    const tableAnchor = TABLE_ANCHOR_RE.exec(line);
    const appendixAnchor = APPENDIX_ANCHOR_RE.exec(line);

    if (tableAnchor) {
      flush();
      currentRef = '表' + (tableAnchor[1] || '').replace(/\s+/g, '');
      currentLines = [line];
    } else if (appendixAnchor) {
      flush();
      currentRef = '附录' + (appendixAnchor[1] || '');
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
        blockType: s.garbled ? ('garbled' as BlockType) : classifyBlock(s.clauseRef, text),
        clauseRef: s.clauseRef,
        text,
      };
    })
    .filter((b) => b.text.length > 0);
  // 子孙条款类型继承后处理（S1 产物契约）：误判为标题的正文行（如 "6.11.1 无缝管的内外表面不应有裂缝……"）
  // 独立成块后因不含路由关键词被归为 other，进不了工艺/探伤提取通道；按最近祖先块继承类型修正
  return inheritAncestorBlockType(blocks);
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
 * 子孙条款类型继承（纯函数）：clauseRef 为 X.Y.Z（三级及以上）且自身归类为 other 的块，
 * 自 X.Y 向 X 逐级查找最近祖先块——祖先缺失继续向上；最近祖先为 other 时，
 * 纯标题祖先可被穿透继续向上，有实质内容的 other 祖先不继承；garbled 祖先不继承；
 * 最近可继承祖先为其他类型（如 process_ndt_clauses）则继承其类型。
 * 背景：CLAUSE_HEADING_RE 会将纯 CJK 正文行误判为标题独立成块（真实 E2E 曾致
 * surface_quality 条款块以 other 落块而丢失规则）；祖先块（如 6.11 表面质量）已带族类型，
 * 子孙块按最近祖先继承即可回到正确通道。同输入同输出。
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
 * 统计化学成分表块内的牌号行数（S3 对账基准）
 */
export function countGradeRows(blockText: string): number {
  const matches = blockText.match(GRADE_ROW_COUNT_RE);
  return matches ? matches.length : 0;
}
