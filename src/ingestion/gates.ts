import {
  SpecificationSliceSchema,
  StandardClauseSchema,
  StandardMetaSchema,
} from '../schemas/standard.schema.ts';
import type { DraftClause, DraftRule, DraftSlice, TextBlock } from './types.ts';

/* ==========================================================================
   S3 质量门禁 (Gates) —— 防幻觉核心，纯函数便于单测
   1. Zod 契约校验（复用 standard.schema.ts）
   2. 领域 linter：numeric min<=max；化学成分数值 ∈ [0,100]；rule_id 全局唯一；
      unit 白名单；每切片至少覆盖 chemical + mechanical 类别
   3. 溯源断言：每条 numeric 规则的 min/max 必须在其声明 source_clause 对应的
      原文块文本中字面出现（去除空白后包含），否则判 hallucination
   4. 对账：原文牌号表行数 vs 生成切片数
   任何失败显式报出并标记 MANUAL_REVIEW，绝不静默通过
   ========================================================================== */

export type GateIssueCode =
  | 'SCHEMA'
  | 'LINT_NUMERIC_RANGE'
  | 'LINT_CHEMICAL_BOUND'
  | 'LINT_DUP_RULE_ID'
  | 'LINT_UNIT'
  | 'LINT_CATEGORY_COVERAGE'
  | 'TRACE_SOURCE_CLAUSE'
  | 'TRACE_NUMBER_LITERAL'
  | 'RECONCILE_GRADE_COUNT';

export interface GateIssue {
  severity: 'ERROR';
  code: GateIssueCode;
  message: string;
}

export interface GateInput {
  meta: Record<string, unknown>;
  slices: DraftSlice[];
  clauses: DraftClause[];
  /** 条款号 -> 原文块文本 索引（由 buildClauseTextIndex 生成） */
  clauseTextIndex: Record<string, string>;
  /** 原文牌号表行数（S1 countGradeRows 汇总）；null 表示跳过对账 */
  expectedGradeRows: number | null;
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

/**
 * S3 主入口：执行全部质量门禁并返回结果
 */
export function runGates(input: GateInput): GateResult {
  const issues: GateIssue[] = [];
  const issue = (code: GateIssueCode, message: string): void => {
    issues.push({ severity: 'ERROR', code, message });
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
  const seenRuleIds = new Map<string, string>();
  for (const slice of validSlices) {
    const categories = new Set(slice.evaluation_rules.map((r) => r.category));
    if (!categories.has('chemical') || !categories.has('mechanical')) {
      issue('LINT_CATEGORY_COVERAGE', `切片 ${slice.spec_key} 类别覆盖不全：缺少 ${!categories.has('chemical') ? 'chemical' : 'mechanical'} 类规则`);
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

      for (const unit of collectUnits(rule)) {
        if (!UNIT_WHITELIST.has(unit)) {
          issue('LINT_UNIT', `${ref} 单位 "${unit}" 不在白名单内`);
        }
      }
    }
  }

  // 3. 溯源断言（防幻觉核心）
  for (const slice of validSlices) {
    for (const rule of slice.evaluation_rules) {
      if (rule.rule_type !== 'numeric_range' && rule.rule_type !== 'or_choice_group') continue;
      if (!rule.source_clause) {
        issue('TRACE_SOURCE_CLAUSE', `切片 ${slice.spec_key} 规则 ${rule.rule_id} 缺少 source_clause`);
        continue;
      }
      const sourceText = input.clauseTextIndex[rule.source_clause];
      if (!sourceText) {
        issue('TRACE_SOURCE_CLAUSE', `切片 ${slice.spec_key} 规则 ${rule.rule_id} 声明的 source_clause="${rule.source_clause}" 在原文切块中不存在`);
        continue;
      }
      for (const value of collectTraceableValues(rule)) {
        if (!literallyContains(sourceText, value)) {
          issue('TRACE_NUMBER_LITERAL', `切片 ${slice.spec_key} 规则 ${rule.rule_id} 数值 ${value} 未在其声明来源条款 ${rule.source_clause} 的原文中字面出现，判为幻觉`);
        }
      }
    }
  }

  // 4. 牌号行数对账
  if (input.expectedGradeRows !== null && input.slices.length !== input.expectedGradeRows) {
    issue('RECONCILE_GRADE_COUNT', `原文牌号表行数(${input.expectedGradeRows})与生成切片数(${input.slices.length})不一致`);
  }

  const passed = issues.length === 0;
  return { passed, requiresManualReview: !passed, issues };
}
