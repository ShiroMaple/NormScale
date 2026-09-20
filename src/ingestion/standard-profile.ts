import type { BlockType } from './types.ts';

/* ==========================================================================
   StandardProfile：标准语言/体系配置档（阶段 C）
   - zh-cn（缺省）：行为与历史实现逐常量一致（现有全部测试不变）
   - en-asme：ASME/ASTM 英文档适配——锚点/标题判定/乱码检测/路由关键词/牌号形态/CJK lint 开关
     全部走 profile 注入，不再散落中文常量
   - 选择：CLI --profile 显式 > 嗅探自动判定（detect 置信度 >0.5 采纳）；判定结果写入抽检报告
   校准语料：SA-213/SA-213M（ASME BPVC.II.A-2023，真实文本层特征驱动，见 cairn 阶段 C 记录）
   ========================================================================== */

export type ProfileId = 'zh-cn' | 'en-asme';

export interface StandardProfile {
  id: ProfileId;
  /** 嗅探置信度（0..1）：en 档按拉丁字母占比，zh 档按 CJK 占比；>0.5 采纳 */
  detect: (text: string) => number;
  anchors: {
    /** 表锚点（en 档容忍页码粘连前缀，如 "281TABLE 1 …"） */
    table: RegExp;
    appendix: RegExp;
    foreword: RegExp;
    pageFooter: RegExp;
  };
  /** 章节标题的标题部判定（zh：纯 CJK；en：纯拉丁、无数字、不以逗/分号结尾） */
  headingTitleTest: (title: string) => boolean;
  /** 乱码检测（en 档：字母占比过低 + 符号多样性；不能用"无 CJK"判定） */
  garbledTest: (text: string) => boolean;
  /** 块类型路由关键词（按 BlockType；牌号行要求由切块器统一叠加） */
  routerKeywords: Partial<Record<BlockType, RegExp>>;
  /** 公差表路由的尺寸语境（与 tolerance_table 关键词同时要求；规格接口外增补） */
  dimensionContext: RegExp;
  /** 表注行判定（表注归属合并用；zh "注N："，en 上标脚注 "A Maximum…" 形态；规格接口外增补） */
  noteLineTest: (line: string) => boolean;
  /** 范围/前言正文正向关键词（配合通用否定词判定 scope_text；规格接口外增补） */
  scopeTextRe: RegExp;
  /** 章节标题标题部长度界（zh 2..40；en 标题含拉丁长词，放宽至 60；规格接口外增补） */
  headingTitleLength: { min: number; max: number };
  /** 标题部拒绝模式（en：力学表硬度列折行值 "90 HRB"/"25 HRC" 的标题部为纯硬度单位令牌；规格接口外增补） */
  headingTitleReject?: RegExp;
  /** clauseRef 是否表锚（表注归属合并的归属目标判定；规格接口外增补） */
  isTableRef: (clauseRef: string) => boolean;
  /** clauseRef 是否附录锚（切块/提取排除；zh "附录X" 与 "表A.1"，en "ANNEX X"/"APPENDIX X"；规格接口外增补） */
  isAppendixRef: (clauseRef: string) => boolean;
  /** 章节标题行匹配（en 容忍页码粘连前缀 "2801. Scope" 并剥离前导零；规格接口外增补） */
  matchHeading: (line: string) => { clauseRef: string; title: string } | null;
  /** 牌号令牌（looksLikeGradeTable 用） */
  gradeTokenRe: RegExp;
  /** 牌号表行（countGradeRows 用；en 形态：TP304 S30400 / T91 Type 1 K90901 / XM-19 S20910） */
  gradeRowRe: RegExp;
  /** prompt 术语段（en 档注入 ASME 牌号/UNS 惯例与英文组织类型映射） */
  promptLocale: {
    gradeConcepts: string;
    structureTypeMap: string;
  };
  gateRules: { requireCjk: boolean };
}

/* ---------------- zh-cn（缺省档：常量自 segmenter 原样迁入，行为不变） ---------------- */

// 表锚点行：如 "表3 钢的牌号和化学成分"、"表 A.1 xxx"、"表 A.1（续）"；表号后必须跟空白，排除前言中 "表3);" 行内引用
const ZH_TABLE_ANCHOR_RE = /^表\s*(\d+[A-Za-z]?|[A-Z]\.\d+)[ \t　]+(.*)$/;
const ZH_APPENDIX_ANCHOR_RE = /^附录\s*([A-ZＡ-Ｚ])(?:[^0-9A-Za-z]|$)/;
const ZH_FOREWORD_RE = /^前\s*言/;
const ZH_PAGE_FOOTER_RE = /^\s*(?:[A-Z]{1,3}\/[A-Z]{1,3}[ \t]*\d[\d.\s]*[—-][\d\s]+|\d{1,3})\s*$/;
// 纯 CJK 标题：章节标题由纯汉字与 CJK 标点构成；含字母/数字的行是表格行或条款正文
const ZH_PURE_CJK_TITLE_RE = /^[一-鿿　-〿、。，；：！？（）《》“”·—…~-]+$/;
const ZH_CJK_IDEOGRAPH_RE = /[一-鿿]/;
const ZH_PUNCT_SYMBOL_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~。、·《》]/g;

const ZH_PROCESS_KEYWORDS = /压扁|扩口|卷边|液压|水压|涡流|超声|晶间腐蚀|无损|射线|渗透|致密|晶粒度|金相|粗糙度|表面质量|弯曲|展平/;
const ZH_CHEMISTRY_KEYWORDS = /化学成分|熔炼分析/;
const ZH_MECHANICAL_KEYWORDS = /力学性能|抗拉强度|屈服强度|断后伸长率|拉伸|硬度/;
const ZH_TOLERANCE_KEYWORDS = /允许偏差|公称外径|公称壁厚/;
const ZH_DIMENSION_CONTEXT = /外径|壁厚/;
const ZH_GRADE_TOKEN_RE = /(?:\d{2,3}Cr[0-9A-Za-z]{2,}|S\d{5})/;
const ZH_GRADE_ROW_RE = /^\s*(?:[一-鿿]{1,4}\s+)?\d{1,2}\s+(?:\d{2,3}Cr[0-9A-Za-z]+|S\d{5})\b/gm;
const ZH_NOTE_LINE_RE = /^注\s*\d*\s*[:：]/;

/** zh 档乱码检测：无 CJK 且标点占比畸高（字体子集化无 ToUnicode 的矢量乱码特征） */
function zhGarbledTest(text: string): boolean {
  const squashed = text.replace(/\s+/g, '');
  if (squashed.length < 20) return false;
  if (ZH_CJK_IDEOGRAPH_RE.test(squashed)) return false;
  const punctChars = squashed.match(ZH_PUNCT_SYMBOL_RE) || [];
  if (punctChars.length / squashed.length <= 0.3) return false;
  return new Set(punctChars).size >= 6;
}

/** zh 档嗅探分：CJK 占"CJK+拉丁字母"比例（排除数字/符号噪声——标准表格数字占比高） */
function zhDetectScore(text: string): number {
  const squashed = text.replace(/\s+/g, '');
  if (squashed.length === 0) return 0;
  const cjk = squashed.match(/[一-鿿]/g) || [];
  const latin = squashed.match(/[A-Za-z]/g) || [];
  const denom = cjk.length + latin.length;
  return denom === 0 ? 0 : cjk.length / denom;
}

function cjkRatio(text: string): number {
  const squashed = text.replace(/\s+/g, '');
  if (squashed.length === 0) return 0;
  const cjk = squashed.match(/[一-鿿]/g);
  return cjk ? cjk.length / squashed.length : 0;
}

export const ZH_CN_PROFILE: StandardProfile = {
  id: 'zh-cn',
  detect: zhDetectScore,
  anchors: {
    table: ZH_TABLE_ANCHOR_RE,
    appendix: ZH_APPENDIX_ANCHOR_RE,
    foreword: ZH_FOREWORD_RE,
    pageFooter: ZH_PAGE_FOOTER_RE,
  },
  headingTitleTest: (title) => ZH_PURE_CJK_TITLE_RE.test(title),
  garbledTest: zhGarbledTest,
  routerKeywords: {
    process_ndt_clauses: ZH_PROCESS_KEYWORDS,
    chemistry_table: ZH_CHEMISTRY_KEYWORDS,
    mechanical_table: ZH_MECHANICAL_KEYWORDS,
    tolerance_table: ZH_TOLERANCE_KEYWORDS,
  },
  gradeTokenRe: ZH_GRADE_TOKEN_RE,
  gradeRowRe: ZH_GRADE_ROW_RE,
  dimensionContext: ZH_DIMENSION_CONTEXT,
  noteLineTest: (line) => ZH_NOTE_LINE_RE.test(line.trim()),
  scopeTextRe: /本文件规定|本文件适用/,
  headingTitleLength: { min: 2, max: 40 },
  isTableRef: (ref) => ref.startsWith('表'),
  isAppendixRef: (ref) => ref.startsWith('附录') || /^表[A-ZＡ-Ｚ]\./.test(ref),
  matchHeading: (line) => {
    const m = /^(\d{1,2}(?:\.\d{1,2}){0,3})[ 	　]+(\S.*)$/.exec(line);
    if (!m) return null;
    return { clauseRef: m[1] || '', title: (m[2] || '').trim() };
  },
  promptLocale: {
    gradeConcepts: 'spec_key=统一数字代号（如 S30408），primary_grade=牌号（如 06Cr19Ni10），display_name="06Cr19Ni10 (S30408)"',
    structureTypeMap: '奥氏体型->austenitic，铁素体型->ferritic，马氏体型->martensitic，奥氏体-铁素体型/双相型->duplex，沉淀硬化型->precipitation_hardening',
  },
  gateRules: { requireCjk: true },
};

/* ---------------- en-asme（ASME/ASTM 英文档；SA-213 真实文本特征校准） ---------------- */

// 表锚点：容忍页码粘连前缀（"281TABLE 1 Chemical …"）与续表（"TABLE 1 Continued"）
const EN_TABLE_ANCHOR_RE = /^\d{0,4}\s*TABLE\s+(\d+[A-Z]?)[ \t]+(.*)$/;
const EN_APPENDIX_ANCHOR_RE = /^(?:ANNEX|APPENDIX)\s+([A-Z])(?:[^0-9A-Za-z]|$)/i;
const EN_FOREWORD_RE = /^Foreword\b/i;
// 页脚/页眉行："ASME BPVC.II.A-2023 SA-213/SA-213M"、规范代号行、独立页码
const EN_PAGE_FOOTER_RE = /^\s*(?:ASME BPVC[\w.]*[ \t]*(?:[A-Z]+-\d+\/[A-Z]+-\d+M?)?|ASTM\s+[A-Z]\d+[\w/]*|\d{1,4})\s*$/;
const EN_LETTER_RE = /[A-Za-z]/g;
const EN_PUNCT_SYMBOL_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;
// 标题部：纯拉丁（允许 & / ( ) - ' — – : 与空格）、无数字、不以逗号/分号结尾
const EN_TITLE_ALLOWED_RE = /^[A-Z][A-Za-z][A-Za-z &/()\-'—–:]{0,58}$/;

// 关键词短语内空白以 \s+ 表示：PDF 提取的断行会把 "free of\nscale" 截断，逐词容忍任意空白
const EN_PROCESS_KEYWORDS = /flattening|flaring|hydrostatic|nondestructive|intergranular\s+corrosion|grain\s+size|reverse\s+bend|hardness\s+test|surface\s+condition|free\s+of\s+(?:loose\s+)?scale|pickl(?:ed|ing)|special\s+finish/i;
const EN_CHEMISTRY_KEYWORDS = /Chemical\s+Composition/i;
const EN_MECHANICAL_KEYWORDS = /Tensile|Yield\s+Strength|Hardness\s+Requirements|Elongation/i;
const EN_TOLERANCE_KEYWORDS = /Permitted\s+Variations|tolerance/i;
const EN_DIMENSION_CONTEXT = /Wall\s+Thickness|Outside\s+Diameter|Thickness/i;
// 牌号形态：TP304/TP316L/T5b/T91/H Grade、UNS K11547/S30400、XM-19
const EN_GRADE_TOKEN_RE = /(?:\b(?:TP|T|H|HT)\d{1,3}[A-Za-z]{0,3}\b|\b[KS]\d{5}\b|\bXM-\d+[A-Za-z]?\b)/;
// 牌号表行：行首牌号 + 可选 "Type n [Heat]" + UNS（K/S + 5 位数字）
const EN_GRADE_ROW_RE = /^\s*[A-Z][A-Za-z0-9-]{0,12}\s+(?:Type\s+\d+\s+(?:Heat\s+)?)?[KS]\d{5}\b/gm;

/** en 档乱码检测：字母占比过低（按非数字字符计——数值表数字占比天然高）且符号种类丰富（≥6）。
 *  不能用"无 CJK"判定（英文文本天然无 CJK）；含 UNS 牌号行（K/S+5 位数字）视为数据表护卫放行 */
function enGarbledTest(text: string): boolean {
  const squashed = text.replace(/\s+/g, '');
  if (squashed.length < 20) return false;
  if (/(?:^|[^A-Z0-9])[KS]\d{5}(?:[^0-9]|$)/.test(squashed)) return false;
  const nonDigits = squashed.replace(/\d/g, '');
  if (nonDigits.length === 0) return false;
  const letters = nonDigits.match(EN_LETTER_RE) || [];
  if (letters.length / nonDigits.length >= 0.3) return false;
  const punctChars = nonDigits.match(EN_PUNCT_SYMBOL_RE) || [];
  if (new Set(punctChars).size < 6) return false;
  return true;
}

export const EN_ASME_PROFILE: StandardProfile = {
  id: 'en-asme',
  detect: (text) => {
    const squashed = text.replace(/\s+/g, '');
    if (squashed.length === 0) return 0;
    if (cjkRatio(text) > 0.05) return 0;
    const letters = squashed.match(EN_LETTER_RE) || [];
    return letters.length / squashed.length;
  },
  anchors: {
    table: EN_TABLE_ANCHOR_RE,
    appendix: EN_APPENDIX_ANCHOR_RE,
    foreword: EN_FOREWORD_RE,
    pageFooter: EN_PAGE_FOOTER_RE,
  },
  headingTitleTest: (title) =>
    EN_TITLE_ALLOWED_RE.test(title) && !/\d/.test(title) && !/[,;，；]$/.test(title),
  garbledTest: enGarbledTest,
  routerKeywords: {
    process_ndt_clauses: EN_PROCESS_KEYWORDS,
    chemistry_table: EN_CHEMISTRY_KEYWORDS,
    mechanical_table: EN_MECHANICAL_KEYWORDS,
    tolerance_table: EN_TOLERANCE_KEYWORDS,
  },
  gradeTokenRe: EN_GRADE_TOKEN_RE,
  gradeRowRe: EN_GRADE_ROW_RE,
  dimensionContext: EN_DIMENSION_CONTEXT,
  noteLineTest: (line) => /^[A-Z]\s+\S/.test(line.trim()),
  scopeTextRe: /This specification covers|This international standard|covers seamless/i,
  headingTitleLength: { min: 2, max: 60 },
  // 力学表硬度列折行值（"90 HRB"/"25 HRC"）形似标题，标题部为纯硬度单位令牌时拒绝（SA-213 TABLE4 碎块事故）
  headingTitleReject: /^(?:HRB|HBW|HV|HRC|HS|HB)$/,
  isTableRef: (ref) => /^TABLE\d/.test(ref),
  isAppendixRef: (ref) => /^(?:ANNEX|APPENDIX)[A-Z]?/i.test(ref),
  matchHeading: (line) => {
    // ASME 标题号带尾点（"9. Mechanical Properties"）；页码粘连时先按无页码解析，
    // 条款号出现前导零（"2801." -> "01"）再回退按 3-4 位页码前缀剥离（页码 280 + 条款 1.）
    const stripZeros = (raw: string): string => raw.split('.').map((seg) => String(Number.parseInt(seg, 10))).join('.');
    const plainM = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?[ 	]+(\S.*)$/.exec(line);
    const plain = plainM ? { clauseRef: plainM[1] || '', title: (plainM[2] || '').trim() } : null;
    if (plain && !plain.clauseRef.split('.').some((seg) => seg.startsWith('0'))) {
      return plain;
    }
    const gluedM = /^(\d{3,4})(\d{1,2}(?:\.\d{1,2}){0,3})\.?[ 	]+(\S.*)$/.exec(line);
    if (gluedM) {
      return { clauseRef: stripZeros(gluedM[2] || ''), title: (gluedM[3] || '').trim() };
    }
    return plain;
  },
  promptLocale: {
    gradeConcepts: 'ASME 无统一数字代号：spec_key 用 ASME 商用牌号（如 TP304/T5b，含变体时原样保留如 "T91 Type 1"）；化学表含 UNS 列时 unified_code 必须逐字取 UNS 号（如 S30400），display_name="TP304 (S30400)"；无 UNS 列时 unified_code 留空，严禁用商用牌号冒充 unified_code（冒充将破坏 UNS 适用的规则挂载）。applies_to_grades 声明须优先用商用牌号（与 spec_key 同形态），UNS 号仅作辅助。aliases 可填 SUS304/1.4301 等国际别名',
    structureTypeMap: '英文直通：表题含 Austenitic -> austenitic，Ferritic -> ferritic，Low Alloy Steel 按合金钢归 ferritic（组织类型以表题与化学成分判读）',
  },
  gateRules: { requireCjk: false },
};

export const PROFILES: Record<ProfileId, StandardProfile> = {
  'zh-cn': ZH_CN_PROFILE,
  'en-asme': EN_ASME_PROFILE,
};

/** 自动嗅探：置信度 >0.5 的最高分档采纳，缺省 zh-cn（与历史行为一致） */
export function sniffProfile(text: string): { profile: StandardProfile; confidence: number; candidates: Array<{ id: ProfileId; score: number }> } {
  const candidates = (Object.values(PROFILES) as StandardProfile[])
    .map((p) => ({ id: p.id, score: p.detect(text) }))
    .sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  if (best.score > 0.5) {
    return { profile: PROFILES[best.id], confidence: best.score, candidates };
  }
  return { profile: ZH_CN_PROFILE, confidence: best.score, candidates };
}
