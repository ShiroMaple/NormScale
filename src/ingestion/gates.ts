import {
  DimensionToleranceTableSchema,
  SpecificationSliceSchema,
  StandardClauseSchema,
  StandardMetaSchema,
} from '../schemas/standard.schema.ts';
import { PropertyKeyNormalizer } from '../normalizer/property-key-normalizer.ts';
import type { DraftClause, DraftRule, DraftSlice, DraftToleranceTable, TextBlock } from './types.ts';

/* ==========================================================================
   S3 质量门禁 (Gates) —— 防幻觉核心，纯函数便于单测
   1. Zod 契约校验（复用 standard.schema.ts，含 meta.tolerance_tables 公差表）
   2. 领域 linter：numeric min<=max；化学成分数值 ∈ [0,100]；rule_id 全局唯一；
      unit 白名单；每切片覆盖声明规则族（declaredFamilies，缺省 v2 全量七族）；
      中文标准文本字段语言一致性（须含 CJK，防 LLM 译成英文）；
      切片关键字段 strict 必填（spec_type/standard_code/description/display_name，
      防止 Zod 缺省值静默补齐）；property_key 注册表防命名漂移；
      dynamic_expression 公式白名单 lint（仅 ctx.chemical.<元素>/数字/四则/括号）；
      applies_to_grades 牌号适用性 ⊆ 切片牌号全集（防臆造牌号）；
      公差表结构 lint（外部引用严禁携带臆造 rules）
   3. 溯源断言（两级，防幻觉核心）：每条 numeric 规则的 min/max 必须先在其声明 source_clause 对应的
      原文块文本中字面出现（去除空白后包含）；未命中再查全文档拼接文本——命中记 WARN（块边界漂移，
      溯源弱化，供人工知悉），全文档也未命中才判 hallucination（ERROR）；dynamic_expression 公式中的
      数值常量同样两级溯源（公式数值溯源）
   4. 对账：原文牌号表行数 vs 生成切片数
   任何 ERROR 失败显式报出并标记 MANUAL_REVIEW；WARN 为提示项不阻塞入库，单独成节
   ========================================================================== */

export type GateIssueCode =
  | 'SCHEMA'
  | 'LINT_NUMERIC_RANGE'
  | 'LINT_CHEMICAL_BOUND'
  | 'LINT_DUP_RULE_ID'
  | 'LINT_UNIT'
  | 'LINT_CATEGORY_COVERAGE'
  | 'LINT_LANGUAGE_CONSISTENCY'
  | 'LINT_REQUIRED_FIELDS'
  | 'LINT_PROPERTY_KEY_REGISTRY'
  | 'LINT_PROPERTY_KEY_COLLISION'
  | 'LINT_FORMULA'
  | 'LINT_APPLIES_TO_GRADES'
  | 'LINT_TOLERANCE_TABLE'
  | 'LINT_VISUAL_RESULT'
  | 'LINT_QUALITATIVE_DESCRIPTION'
  | 'TRACE_SOURCE_CLAUSE'
  | 'TRACE_NUMBER_LITERAL'
  | 'TRACE_FORMULA_LITERAL'
  | 'TRACE_BLOCK_BOUNDARY'
  | 'EXTERNAL_TOLERANCE_REFERENCE'
  | 'RECONCILE_GRADE_COUNT';

export interface GateIssue {
  /**
   * ERROR：阻塞项，转 MANUAL_REVIEW；
   * WARN：提示项（如溯源块边界漂移），不阻塞入库、单独成节供人工知悉
   */
  severity: 'ERROR' | 'WARN';
  code: GateIssueCode;
  message: string;
}

/**
 * v2 全量提取规则族（S2 提取范围）：管线缺省声明族与 gates 类别覆盖 lint 缺省回退均以此为基准；
 * 管线/CLI 可显式声明部分族（declaredFamilies）收窄范围
 */
export const FULL_RULE_FAMILIES: readonly string[] = [
  'chemical',
  'mechanical',
  'process',
  'metallographic',
  'corrosion',
  'ndt',
  'surface',
];

export interface GateInput {
  meta: Record<string, unknown>;
  slices: DraftSlice[];
  clauses: DraftClause[];
  /** 条款号 -> 原文块文本 索引（由 buildClauseTextIndex 生成） */
  clauseTextIndex: Record<string, string>;
  /** 原文牌号表行数（S1 countGradeRows 汇总）；null 表示跳过对账 */
  expectedGradeRows: number | null;
  /**
   * 声明的提取规则族（如 ['chemical','mechanical']，写入 drafts/meta.extracted_families）；
   * 类别覆盖 lint 由声明范围驱动而非写死双族。缺省回退 v2 全量七族（FULL_RULE_FAMILIES）
   */
  declaredFamilies?: readonly string[];
  /**
   * 既有标准库 property_key 注册表（全局扫描 ∪ 本标准存量 key）。
   * 产物出现注册表外的 key 判为疑似命名漂移；空集/缺省时跳过该 lint（全新标准品类扩张合法）
   */
  propertyKeyRegistry?: ReadonlySet<string> | readonly string[];
  /** v2 尺寸公差表草稿（S2 tolerance_tables 任务产物）；缺省空数组 */
  toleranceTables?: DraftToleranceTable[];
  /** v2 牌号适用性展开后未挂载到任何切片的规则（S2 移交，严禁静默丢弃，须拦截） */
  unmountedRules?: DraftRule[];
  /**
   * v1.4.1 两级溯源兜底：全部切块文本的拼接（由管线传入）。溯源断言先查声明条款块文本，
   * 未命中再查全文档拼接文本——命中则记 WARN（块边界漂移，溯源弱化），全文档也未命中才判 ERROR。
   * 缺省时保持单级断言（纯函数缺省行为不变）
   */
  fullDocumentText?: string;
  /** 阶段 C profile：语言一致性 lint 开关（en-asme 档关闭 CJK 要求，缺省 true 与历史行为一致） */
  requireCjk?: boolean;
}

export interface GateResult {
  passed: boolean;
  requiresManualReview: boolean;
  issues: GateIssue[];
}

// 指标单位白名单：出现在白名单外的 unit 视为疑似幻觉，显式报出
const UNIT_WHITELIST = new Set([
  '%', 'MPa', 'GPa', 'N/mm2', 'N/mm²',
  'HRB', 'HBW', 'HV', 'HRC',
  'J', 'kJ', 'J/cm2', 'mm', 'μm', 'um',
  '级', '°', '℃',
]);

// expected_visual_result 闭集白名单（视觉判定结论机器码；语义真相由 description 原文层承载）：
// 无裂纹 / 无裂纹或裂口 / 无渗漏 / 清洁通过——与 golden 及引擎宽松解析（logic-evaluator 合格/无裂/NO_CRACK 族）对齐
const EXPECTED_VISUAL_RESULT_WHITELIST = new Set([
  'NO_CRACKS',
  'NO_CRACKS_OR_SPLITS',
  'NO_LEAKS',
  'CLEAN_PASS',
]);

// 定性规则类别：机器码 criteria 仅做路由，语义真相须由含 CJK 的描述性字段承载（原文层）
const QUALITATIVE_RULE_TYPES = new Set(['qualitative_pass', 'qualitative_enum', 'exemption']);

const CJK_IDEOGRAPH_RE = /[一-鿿]/;
const EMBEDDED_HEADING_RE = /^(\d{1,2}(?:\.\d{1,2}){0,3})[ \t　]+\S/;

/**
 * 由切块结果构建 条款号 -> 原文文本 索引
 * 表格块可能吞并后续条款行（块内不再按章节号切分），因此同时把块内
 * 嵌的章节号区间文本登记为其条款号的索引
 */
export function buildClauseTextIndex(blocks: TextBlock[]): Record<string, string> {
  const index: Record<string, string> = {};
  const push = (ref: string, text: string): void => {
    if (!ref || text.trim().length === 0) return;
    index[ref] = index[ref] ? index[ref] + '\n' + text : text;
  };

  for (const block of blocks) {
    if (block.blockType === 'garbled') continue;
    const lines = block.text.split('\n');
    const headings: { i: number; ref: string }[] = [];
    lines.forEach((line, i) => {
      const m = EMBEDDED_HEADING_RE.exec(line.trim());
      if (m && Number.parseInt(m[1] || '0', 10) !== 0 && CJK_IDEOGRAPH_RE.test(line)) {
        headings.push({ i, ref: m[1] || '' });
      }
    });

    if (headings.length === 0) {
      push(block.clauseRef, block.text);
      continue;
    }
    // 块首至第一个内嵌标题归块自身锚点
    push(block.clauseRef, lines.slice(0, headings[0]?.i ?? 0).join('\n'));
    headings.forEach((h, k) => {
      const end = k + 1 < headings.length ? headings[k + 1]!.i : lines.length;
      push(h.ref, lines.slice(h.i, end).join('\n'));
    });
  }
  return index;
}

/** 去除全部空白后的字面包含判断（容忍 PDF 提取的字间空格噪声） */
function literallyContains(haystack: string, value: number): boolean {
  const squashed = haystack.replace(/\s+/g, '');
  return squashed.includes(String(value));
}

/** 提取一条草稿规则中所有需要溯源断言的数值（min/max 及其 or_choice 选项） */
function collectTraceableValues(rule: DraftRule): number[] {
  const values: number[] = [];
  const push = (v: unknown): void => {
    if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
  };
  push(rule.criteria?.min);
  push(rule.criteria?.max);
  const options = rule.criteria?.options;
  if (Array.isArray(options)) {
    for (const opt of options) {
      push((opt as { criteria?: { min?: unknown; max?: unknown } })?.criteria?.min);
      push((opt as { criteria?: { min?: unknown; max?: unknown } })?.criteria?.max);
    }
  }
  return values;
}

/** 收集一条规则中出现的所有 unit 值 */
function collectUnits(rule: DraftRule): string[] {
  const units: string[] = [];
  const fromCriteria = (c: { unit?: unknown } | undefined): void => {
    if (typeof c?.unit === 'string' && c.unit.trim().length > 0) units.push(c.unit.trim());
  };
  fromCriteria(rule.criteria as { unit?: unknown });
  const options = rule.criteria?.options;
  if (Array.isArray(options)) {
    for (const opt of options) fromCriteria((opt as { criteria?: { unit?: unknown } }).criteria);
  }
  return units;
}

/* ---------- v2：动态公式 lint 与公式数值溯源 ---------- */

// 公式白名单 token：ctx.chemical.<元素符号> | 数字（含小数） | 四则运算符 | 括号 | 空白；
// 剥离全部合法 token 后仍有残留即判非法（防注入、防未知变量、防函数调用）
const FORMULA_ALLOWED_TOKEN_RE = /ctx\.chemical\.[A-Z][a-z]?|\d+(?:\.\d+)?|[+\-*/()\s]/g;

// 压扁间距公式白名单 token：S（壁厚）/ D（外径）快捷变量 | 数字 | 四则运算符 | 括号 | 空白
// （与引擎 SafeMathEvaluator 的快捷变量映射一致，α 等希腊字母必须已代入为数值）
const DISTANCE_FORMULA_ALLOWED_TOKEN_RE = /[SD]|\d+(?:\.\d+)?|[+\-*/()\s]/g;

function lintFormula(ref: string, formula: unknown, issue: (code: GateIssueCode, message: string) => void): void {
  if (formula === undefined || formula === null) return;
  if (typeof formula !== 'string' || formula.trim().length === 0) {
    issue('LINT_FORMULA', `${ref} 公式字段存在但为空或非字符串`);
    return;
  }
  const remainder = formula.replace(FORMULA_ALLOWED_TOKEN_RE, '');
  if (remainder.length > 0) {
    issue(
      'LINT_FORMULA',
      `${ref} 公式 "${formula}" 含白名单外内容 "${remainder}"（仅允许 ctx.chemical.<元素符号>、数字与四则运算符/括号）`,
    );
  }
}

/** 压扁间距公式 lint：formula_distance_H 必须非空且仅含 S/D 变量、数字与四则运算符/括号（可求值化检查） */
function lintDistanceFormula(ref: string, formula: unknown, issue: (code: GateIssueCode, message: string) => void): void {
  if (typeof formula !== 'string' || formula.trim().length === 0) {
    issue('LINT_FORMULA', `${ref} dynamic_formula_pass 规则缺少非空 formula_distance_H`);
    return;
  }
  const remainder = formula.replace(DISTANCE_FORMULA_ALLOWED_TOKEN_RE, '');
  if (remainder.length > 0) {
    issue(
      'LINT_FORMULA',
      `${ref} 压扁间距公式 "${formula}" 含白名单外内容 "${remainder}"（仅允许 S/D 变量、数字与四则运算符/括号；希腊字母系数须代入数值）`,
    );
  }
}

/** 提取公式中的数值常量（保序，含小数；元素符号与 ctx 路径不含数字，无干扰） */
function extractFormulaNumberLiterals(formula: string): number[] {
  const matches = formula.match(/\d+(?:\.\d+)?/g) || [];
  return matches.map((m) => Number(m));
}

/**
 * S3 主入口：执行全部质量门禁并返回结果
 */
export function runGates(input: GateInput): GateResult {
  const issues: GateIssue[] = [];
  const issue = (code: GateIssueCode, message: string): void => {
    issues.push({ severity: 'ERROR', code, message });
  };
  // WARN 通道：提示性发现（块边界漂移等），不阻塞入库、不入 requiresManualReview 判定
  const warn = (code: GateIssueCode, message: string): void => {
    issues.push({ severity: 'WARN', code, message });
  };

  // 1. Zod 契约校验
  const metaParsed = StandardMetaSchema.safeParse(input.meta);
  if (!metaParsed.success) {
    issue('SCHEMA', `meta 元信息契约校验失败: ${metaParsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
  }

  const validSlices: DraftSlice[] = [];
  for (const slice of input.slices) {
    const parsed = SpecificationSliceSchema.safeParse(slice);
    if (!parsed.success) {
      issue('SCHEMA', `切片 ${slice.spec_key || '(无 spec_key)'} 契约校验失败: ${parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
    } else {
      validSlices.push(slice);
    }
  }
  for (const clause of input.clauses) {
    const parsed = StandardClauseSchema.safeParse(clause);
    if (!parsed.success) {
      issue('SCHEMA', `条款 ${clause.clause_id || '(无 clause_id)'} 契约校验失败: ${parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
    }
  }

  // 2. 领域 linter
  const declaredFamilies =
    input.declaredFamilies && input.declaredFamilies.length > 0
      ? [...input.declaredFamilies]
      : [...FULL_RULE_FAMILIES];
  // 既有标准库 property_key 注册表：全局注册表 ∪ 本标准存量 key 命中其一即可；
  // 全新标准品类扩张合法，因此空注册表（标准库为空）时跳过该 lint
  const propertyKeyRegistry = input.propertyKeyRegistry
    ? new Set<string>(input.propertyKeyRegistry)
    : null;

  // 2.0a 注册表归一化碰撞检测：两个不同注册 key 经 PropertyKeyNormalizer 归一到同一
  // canonical 时告警（WARN）——以质保书侧归一化输出为 canonical 基准（如 flattening 与
  // flattening_test 并存会导致证书侧归一后无法区分两标准），提示合并注册 key
  if (propertyKeyRegistry && propertyKeyRegistry.size > 1) {
    const canonicalToKeys = new Map<string, string[]>();
    for (const key of propertyKeyRegistry) {
      const canonical = PropertyKeyNormalizer.normalize(key).property_key;
      const list = canonicalToKeys.get(canonical) ?? [];
      list.push(key);
      canonicalToKeys.set(canonical, list);
    }
    for (const [canonical, keys] of canonicalToKeys) {
      if (keys.length > 1) {
        warn(
          'LINT_PROPERTY_KEY_COLLISION',
          `注册表 property_key 归一化碰撞：${keys.map((k) => `"${k}"`).join(' 与 ')} 经 PropertyKeyNormalizer 均得到 canonical "${canonical}"——以归一化输出为基准合并注册 key（数据修正），否则证书侧归一后两标准规则不可区分`,
        );
      }
    }
  }

  // 2.1 中文标准文本字段语言一致性：standard_id 以 GB/NB 开头且 requireCjk 开启时（en 档关闭），
  //     自然语言字段必须含 CJK，防止 LLM 将标准名称/说明/切片名称译成英文（命名漂移事故防线之一）
  const stdIdRaw = input.meta?.standard_id;
  const standardId = typeof stdIdRaw === 'string' ? stdIdRaw.trim() : '';
  const requireCjk = input.requireCjk !== false;
  if (requireCjk && /^(GB|NB)/i.test(standardId)) {
    const lintCjk = (label: string, value: unknown): void => {
      if (typeof value !== 'string' || value.trim().length === 0) return;
      if (!CJK_IDEOGRAPH_RE.test(value)) {
        issue('LINT_LANGUAGE_CONSISTENCY', `${label} 未含 CJK 字符（中文标准文本字段禁止被译为英文）: "${value.slice(0, 40)}"`);
      }
    };
    lintCjk('meta.standard_name', input.meta.standard_name);
    lintCjk('meta.description', input.meta.description);
    for (const slice of input.slices) {
      const label = `切片 ${slice.spec_key || '(无 spec_key)'}`;
      // display_name 为例外：牌号代号式命名（如 "06Cr19Ni10 (S30408)"）是标准库既定惯例，
      // 仅当 display_name 不含牌号代号特征（不含 spec_key/primary_grade）时才要求 CJK
      const dn = typeof slice.display_name === 'string' ? slice.display_name : '';
      const isGradeCodeStyle = (slice.spec_key && dn.includes(slice.spec_key)) || (slice.primary_grade && dn.includes(slice.primary_grade));
      if (!isGradeCodeStyle) {
        lintCjk(`${label} display_name`, slice.display_name);
      }
      lintCjk(`${label} description`, slice.description);
    }
  }

  // 2.2 切片关键字段 strict 必填：Zod 对 spec_type/description 有缺省或可选，缺失会被静默
  //     补齐/放行，这里显式拦截并转人工复核
  const REQUIRED_SLICE_FIELDS = ['spec_type', 'standard_code', 'description', 'display_name'] as const;
  for (const slice of input.slices) {
    const record = slice as unknown as Record<string, unknown>;
    const missing = REQUIRED_SLICE_FIELDS.filter((f) => {
      const v = record[f];
      return typeof v !== 'string' || v.trim().length === 0;
    });
    if (missing.length > 0) {
      issue('LINT_REQUIRED_FIELDS', `切片 ${slice.spec_key || '(无 spec_key)'} 缺少关键字段: ${missing.join('、')}（不得以缺省值静默补齐）`);
    }
  }

  const seenRuleIds = new Map<string, string>();
  // 类别覆盖分两级：
  // - 逐切片级仅约束全牌号普适的表驱动族（chemical/mechanical 来自牌号×指标矩阵，每切片必有）；
  // - 条件适用族（process/metallographic/corrosion/ndt/surface 由条款挂载，可能仅适用部分牌号，
  //   如晶粒度仅 07 系四牌号）做标准级检查：声明族在全库零规则才算整族漏提
  const PER_SLICE_FAMILIES = ['chemical', 'mechanical'];
  for (const slice of validSlices) {
    const categories = new Set(slice.evaluation_rules.map((r) => r.category));
    const missingFamilies = declaredFamilies.filter((f) => PER_SLICE_FAMILIES.includes(f) && !categories.has(f));
    if (missingFamilies.length > 0) {
      issue('LINT_CATEGORY_COVERAGE', `切片 ${slice.spec_key} 类别覆盖不全（声明提取范围 ${declaredFamilies.join('/')}）：缺少 ${missingFamilies.join('、')} 类规则`);
    }
    for (const rule of slice.evaluation_rules) {
      const ref = `${slice.spec_key}/${rule.rule_id}`;
      if (seenRuleIds.has(rule.rule_id)) {
        issue('LINT_DUP_RULE_ID', `rule_id 全局重复: ${rule.rule_id}（${seenRuleIds.get(rule.rule_id)} 与 ${ref}）`);
      } else {
        seenRuleIds.set(rule.rule_id, ref);
      }

      if (rule.rule_type === 'numeric_range') {
        const c = rule.criteria as { min?: unknown; max?: unknown };
        if (typeof c.min === 'number' && typeof c.max === 'number' && c.min > c.max) {
          issue('LINT_NUMERIC_RANGE', `${ref} min(${c.min}) > max(${c.max})`);
        }
        if (rule.category === 'chemical') {
          for (const [boundLabel, v] of [['min', c.min], ['max', c.max]] as const) {
            if (typeof v === 'number' && (v < 0 || v > 100)) {
              issue('LINT_CHEMICAL_BOUND', `${ref} 化学成分 ${boundLabel}=${v} 超出 [0,100] 区间`);
            }
          }
        }
      }

      // v2 动态公式 lint：formula_min/formula_max 白名单（ctx.chemical.<元素>/数字/四则/括号），
      // 且二者至少一个非空——无公式的 dynamic_expression 应降级为 numeric_range，禁止静默放行
      if (rule.rule_type === 'dynamic_expression') {
        const c = rule.criteria as { formula_min?: unknown; formula_max?: unknown };
        lintFormula(ref, c.formula_min, issue);
        lintFormula(ref, c.formula_max, issue);
        const hasFormula =
          (typeof c.formula_min === 'string' && c.formula_min.trim().length > 0) ||
          (typeof c.formula_max === 'string' && c.formula_max.trim().length > 0);
        if (!hasFormula) {
          issue('LINT_FORMULA', `${ref} dynamic_expression 规则缺少非空 formula_min/formula_max`);
        }
      }

      // 压扁间距公式 lint：formula_distance_H 必须可求值（S/D 变量、数字、四则/括号；希腊字母系数已代入）
      if (rule.rule_type === 'dynamic_formula_pass') {
        const c = rule.criteria as { formula_distance_H?: unknown };
        lintDistanceFormula(ref, c.formula_distance_H, issue);
      }

      // 项3.1 expected_visual_result 闭集 lint：dynamic_formula_pass/qualitative_and_numeric 的
      // 视觉判定结论机器码必须从白名单选取（缺省时 schema 默认 NO_CRACKS，放行），集外显式拦截
      if (rule.rule_type === 'dynamic_formula_pass' || rule.rule_type === 'qualitative_and_numeric') {
        const visual = (rule.criteria as { expected_visual_result?: unknown }).expected_visual_result;
        if (visual !== undefined && visual !== null && typeof visual === 'string' && visual.trim().length > 0) {
          if (!EXPECTED_VISUAL_RESULT_WHITELIST.has(visual.trim())) {
            issue('LINT_VISUAL_RESULT', `${ref} expected_visual_result "${visual}" 不在闭集白名单内（允许: ${[...EXPECTED_VISUAL_RESULT_WHITELIST].join('/')}）`);
          }
        }
      }

      // 项3.2 定性规则原文双层记录 lint：qualitative_pass/qualitative_enum/exemption 的机器码 criteria
      // 仅做路由，必须携带描述性字段（description 或 criteria.criteria_description）作为语义真相原文层；
      // zh 档要求含 CJK（防译英），en 档（requireCjk=false）英文原文即为源语言，仅要求非空
      if (QUALITATIVE_RULE_TYPES.has(rule.rule_type)) {
        const criteriaDescription = (rule.criteria as { criteria_description?: unknown }).criteria_description;
        const descriptionText = typeof rule.description === 'string' && rule.description.trim().length > 0
          ? rule.description
          : typeof criteriaDescription === 'string' && criteriaDescription.trim().length > 0
            ? criteriaDescription
            : null;
        if (descriptionText === null) {
          issue('LINT_QUALITATIVE_DESCRIPTION', `${ref} 定性规则（${rule.rule_type}）缺少语义真相原文层：必须携带 description 或 criteria.criteria_description`);
        } else if (requireCjk && !CJK_IDEOGRAPH_RE.test(descriptionText)) {
          issue('LINT_QUALITATIVE_DESCRIPTION', `${ref} 定性规则（${rule.rule_type}）描述性字段不含 CJK 字符（中文标准原文层禁止被译为英文）: "${descriptionText.slice(0, 40)}"`);
        }
      }

      for (const unit of collectUnits(rule)) {
        if (!UNIT_WHITELIST.has(unit)) {
          issue('LINT_UNIT', `${ref} 单位 "${unit}" 不在白名单内`);
        }
      }

      if (propertyKeyRegistry && propertyKeyRegistry.size > 0 && !propertyKeyRegistry.has(rule.property_key)) {
        issue('LINT_PROPERTY_KEY_REGISTRY', `${ref} property_key "${rule.property_key}" 不在既有标准库注册表中（疑似命名漂移），转人工抽检确认`);
      }
    }
  }

  // 2.3.1 条件适用族标准级检查：声明族在全库零规则 = 整族漏提（如晶粒度条款整段未提取）；
  //       族在部分切片存在属合法的条件适用（如晶粒度仅 07 系四牌号），不逐切片强约束
  const standardLevelFamilies = declaredFamilies.filter((f) => !['chemical', 'mechanical'].includes(f));
  for (const family of standardLevelFamilies) {
    const total = validSlices.reduce(
      (sum, s) => sum + s.evaluation_rules.filter((r) => r.category === family).length,
      0,
    );
    if (total === 0) {
      issue('LINT_CATEGORY_COVERAGE', `声明提取族 ${family} 在全部切片中零规则，判定整族漏提（若为该标准确无此类要求，请从 declaredFamilies 中移除该族）`);
    }
  }

  // 2.4 v2 牌号适用性白名单校验：挂载后规则的 applies_to_grades 必须 ⊆ 切片牌号全集（防臆造牌号）；
  //     组织类型兜底标记 "ORG:<type>:OTHERS" 为管线内部展开语义（挂载前有效，挂载后产物不应再携带），
  //     若残留则校验标记形态合法性；S2 展开未挂载到任何切片的规则一律拦截（严禁静默丢弃）
  const gradeUniverse = new Set<string>();
  for (const slice of input.slices) {
    for (const token of [slice.spec_key, slice.primary_grade, slice.unified_code]) {
      if (typeof token === 'string' && token.trim().length > 0) gradeUniverse.add(token.trim());
    }
  }
  const ORG_MARKER_VALID_RE = /^ORG:[a-z_]+:OTHERS$/;
  for (const slice of validSlices) {
    for (const rule of slice.evaluation_rules) {
      if (!rule.applies_to_grades || rule.applies_to_grades.length === 0) continue;
      const orgMarkers = rule.applies_to_grades.filter((g) => g.startsWith('ORG:'));
      for (const marker of orgMarkers) {
        if (!ORG_MARKER_VALID_RE.test(marker)) {
          issue('LINT_APPLIES_TO_GRADES', `切片 ${slice.spec_key} 规则 ${rule.rule_id} 残留非法组织类型标记 "${marker}"（合法形态: ORG:<structure_type>:OTHERS，应为挂载前内部语义，挂载后不应出现）`);
        }
      }
      const unknown = rule.applies_to_grades.filter((g) => g !== 'ALL' && !g.startsWith('ORG:') && !gradeUniverse.has(g));
      if (unknown.length > 0) {
        issue('LINT_APPLIES_TO_GRADES', `切片 ${slice.spec_key} 规则 ${rule.rule_id} 的 applies_to_grades 含切片牌号全集外的牌号: ${unknown.join('、')}（防臆造牌号）`);
      }
    }
  }
  for (const rule of input.unmountedRules ?? []) {
    const applies = rule.applies_to_grades ?? [];
    issue(
      'LINT_APPLIES_TO_GRADES',
      `规则 ${rule.rule_id || '(无 rule_id)'}（${rule.category}/${rule.property_key}）applies_to_grades=[${applies.join('、') || '缺失'}] 未匹配到任何切片，已拦截（严禁静默丢弃）`,
    );
  }

  // 2.5 v2 尺寸公差表 lint：结构契约校验；跨标准外部引用严禁携带臆造 rules，
  //     并产生 MANUAL_REVIEW 级 issue 提示人工补录被引标准数据
  for (const table of input.toleranceTables ?? []) {
    if (table.external_reference) {
      if (table.rules.length > 0) {
        issue('LINT_TOLERANCE_TABLE', `公差表 ${table.table_id} 声明外部引用 "${table.external_reference}" 但携带 ${table.rules.length} 条 rules（严禁臆造被引标准数据）`);
      }
      issue(
        'EXTERNAL_TOLERANCE_REFERENCE',
        `公差表 ${table.table_id}（${table.table_name}）为跨标准外部引用: ${table.external_reference}——被引标准公差数据未入库，需人工补录后方可参与几何判定`,
      );
      continue;
    }
    const parsedTable = DimensionToleranceTableSchema.safeParse({
      table_id: table.table_id,
      table_name: table.table_name,
      rules: table.rules,
    });
    if (!parsedTable.success) {
      issue('LINT_TOLERANCE_TABLE', `公差表 ${table.table_id || '(无 table_id)'} 结构契约校验失败: ${parsedTable.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
    }
  }

  // 3. 溯源断言（防幻觉核心，两级）
  // ① 声明条款块文本命中 -> 通过；② 未命中则查全文档拼接文本（跨页续表/块边界漂移场景，
  //   提取模型读完整块而 gates 索引被内嵌标题切分）：命中记 WARN（溯源弱化，供人工知悉）；
  // ③ 全文档也未命中 -> ERROR（真幻觉）。缺省无全文档文本时保持单级行为
  const fullDocumentText = typeof input.fullDocumentText === 'string' ? input.fullDocumentText : '';
  for (const slice of validSlices) {
    for (const rule of slice.evaluation_rules) {
      const needsTrace =
        rule.rule_type === 'numeric_range' ||
        rule.rule_type === 'or_choice_group' ||
        rule.rule_type === 'dynamic_expression';
      if (!needsTrace) continue;
      if (!rule.source_clause) {
        issue('TRACE_SOURCE_CLAUSE', `切片 ${slice.spec_key} 规则 ${rule.rule_id} 缺少 source_clause`);
        continue;
      }
      const sourceText = input.clauseTextIndex[rule.source_clause];
      if (!sourceText) {
        issue('TRACE_SOURCE_CLAUSE', `切片 ${slice.spec_key} 规则 ${rule.rule_id} 声明的 source_clause="${rule.source_clause}" 在原文切块中不存在`);
        continue;
      }
      if (rule.rule_type === 'dynamic_expression') {
        // v2 公式数值溯源：公式中的数值常量必须在原文中字面出现（如 5、0.70）
        const c = rule.criteria as { formula_min?: unknown; formula_max?: unknown };
        for (const formula of [c.formula_min, c.formula_max]) {
          if (typeof formula !== 'string') continue;
          for (const value of extractFormulaNumberLiterals(formula)) {
            if (literallyContains(sourceText, value)) continue;
            const detail = `切片 ${slice.spec_key} 规则 ${rule.rule_id} 公式 "${formula}" 中常量 ${value} 未在其声明来源条款 ${rule.source_clause} 的原文中字面出现，判为幻觉`;
            if (fullDocumentText.length > 0 && literallyContains(fullDocumentText, value)) {
              warn('TRACE_BLOCK_BOUNDARY', `${detail}——但在全文档拼接文本中命中：疑似切块边界漂移，溯源弱化，转人工知悉`);
            } else {
              issue('TRACE_FORMULA_LITERAL', detail);
            }
          }
        }
      } else {
        for (const value of collectTraceableValues(rule)) {
          if (literallyContains(sourceText, value)) continue;
          const detail = `切片 ${slice.spec_key} 规则 ${rule.rule_id} 数值 ${value} 未在其声明来源条款 ${rule.source_clause} 的原文中字面出现，判为幻觉`;
          if (fullDocumentText.length > 0 && literallyContains(fullDocumentText, value)) {
            warn('TRACE_BLOCK_BOUNDARY', `${detail}——但在全文档拼接文本中命中：疑似切块边界漂移，溯源弱化，转人工知悉`);
          } else {
            issue('TRACE_NUMBER_LITERAL', detail);
          }
        }
      }
    }
  }

  // 4. 牌号行数对账
  if (input.expectedGradeRows !== null && input.slices.length !== input.expectedGradeRows) {
    issue('RECONCILE_GRADE_COUNT', `原文牌号表行数(${input.expectedGradeRows})与生成切片数(${input.slices.length})不一致`);
  }

  // passed 只看 ERROR：WARN（块边界漂移等提示）不阻塞入库、不转 MANUAL_REVIEW
  const passed = issues.every((i) => i.severity !== 'ERROR');
  return { passed, requiresManualReview: !passed, issues };
}
