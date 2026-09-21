import type { DraftRule, TextBlock } from './types.ts';
import { AGREEMENT_RE, extractTriggerCondition, STRUCTURE_TYPE_MAP } from './clause-patterns.ts';

/* ==========================================================================
   确定性硬度表解析器 (Hardness Table Parser) —— v1.7.4，纯函数零 LLM
   根治硬度 or_choice_group 数值缺失（管线 LLM 两轮产出空 options，单次清晰调用证明信息
   完全在文本里）。覆盖已确认样例：NB/T 47019.5 表4（多牌号分组+其他行+折行）、
   GB/T 13296-2023 表5（单牌号/单列名行+其他行）。
   - 列对位由标尺表头行（HBW/HRB/HV 出现顺序）决定，不硬编码顺序；
   - "≤217" -> max=217（逐字数值）； "—" 跳过该标尺；
   - "其他"行 -> applies_to_grades=["ORG:<type>:OTHERS"]（ORG 挂载机制已存在）；
   - 触发条件/协商语境复用 clause-patterns 的确定性正则（同块或前文）
   ========================================================================== */

/** 标尺令牌（硬度表列头） */
const SCALE_TOKEN_RE = /\b(HBW|HRB|HV|HRC)\b/g;
/** 值令牌："≤217" / "—" 形态（允许前导比较符） */
const VALUE_TOKEN_RE = /^[≤<＜≥>＞＝=]?\s*\d+(?:\.\d+)?$|^—+$/;
/** 组织类型前缀（行首） */
const ORG_PREFIX_RE = /^(奥氏体|铁素体|马氏体|双相|奥氏体-铁素体|沉淀硬化)型?/;
/** 值令牌中的数值抽取（逐字，不含比较符） */
const VALUE_NUMBER_RE = /\d+(?:\.\d+)?/;

export interface HardnessParseResult {
  /** 命中：识别到标尺表头且解析出 ≥1 条数据行 */
  hit: boolean;
  rules: DraftRule[];
}

interface HardnessRow {
  orgType: string;
  gradesText: string;
  values: string[];
}

/** 行内容装配：尾部的连续值令牌归为值列，其余为牌号片段；片段间以顿号拼接（折行原文顿号由 splitter 去重吸收） */
function appendLine(row: HardnessRow, line: string): void {
  const tokens = line.split(/\s+/).filter((t) => t.length > 0);
  let valueStart = tokens.length;
  while (valueStart > 0 && VALUE_TOKEN_RE.test(tokens[valueStart - 1]!)) valueStart--;
  const gradePart = tokens.slice(0, valueStart).join(' ');
  if (gradePart.length > 0) {
    row.gradesText += (row.gradesText.length > 0 ? '、' : '') + gradePart;
  }
  row.values.push(...tokens.slice(valueStart));
}

/** 牌号片段 -> applies 令牌：'其他' -> ORG 标记；显式牌号顿号/逗号折行拼接拆分（连续分隔符合并） */
function gradesToApplies(gradesText: string, orgType: string): string[] {
  const trimmed = gradesText.trim();
  if (trimmed === '其他') return [`ORG:${orgType}:OTHERS`];
  return trimmed
    .split(/[、，,]+/)
    .map((g) => g.trim())
    .filter((g) => g.length >= 2 && /[A-Za-z0-9]/.test(g));
}

/**
 * 确定性硬度表解析主入口（同输入同输出）。
 * @param block 候选块（机械表/条款块均可，内部先识别标尺表头）
 * @param contextText 同块或相邻前文文本（触发条件/协商语境解析用，调用方取前置块拼接）
 */
export function parseHardnessTable(block: TextBlock, contextText = ''): HardnessParseResult {
  const lines = block.text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 标尺表头行：≥2 个标尺令牌且不含值令牌的行
  let scale: string[] | null = null;
  let headerIdx = -1;
  for (const [i, line] of lines.entries()) {
    const tokens = line.match(SCALE_TOKEN_RE);
    if (!tokens || new Set(tokens).size < 2) continue;
    if (line.split(/\s+/).some((t) => VALUE_TOKEN_RE.test(t))) continue;
    scale = [...new Set(tokens)];
    headerIdx = i;
    break;
  }
  if (!scale) return { hit: false, rules: [] };

  // 行装配：组织词行首开启新行组；非组织行延续当前组（折行拼接）
  const rows: HardnessRow[] = [];
  let current: HardnessRow | null = null;
  let lastOrg = '';
  const closeRow = (): void => {
    if (current && current.values.length > 0) rows.push(current);
    current = null;
  };
  for (const line of lines.slice(headerIdx + 1)) {
    const orgMatch = ORG_PREFIX_RE.exec(line);
    if (orgMatch) {
      closeRow();
      lastOrg = STRUCTURE_TYPE_MAP[orgMatch[1]!] ?? lastOrg;
      current = { orgType: lastOrg, gradesText: '', values: [] };
      const afterOrg = line.slice(orgMatch[0].length).trim();
      if (afterOrg.length > 0) appendLine(current, afterOrg);
      continue;
    }
    // 表注行不参与行组（"注N：…" 与 en 上标注记）
    if (/^注\s*\d*\s*[:：]/.test(line) || /^[A-Z]\s+(?:Maximum|Minimum|Where|Alternatively|See)\b/.test(line)) continue;
    if (!current) current = { orgType: lastOrg, gradesText: '', values: [] };
    // 牌号片段出现在值之后 = 新行组开始（NB "其他 ≤187 ≤90 ≤200"行；同组织类型延续）
    if (current.values.length > 0) {
      const tokens = line.split(/\s+/).filter((t) => t.length > 0);
      let valueStart = tokens.length;
      while (valueStart > 0 && VALUE_TOKEN_RE.test(tokens[valueStart - 1]!)) valueStart--;
      if (valueStart > 0) {
        closeRow();
        current = { orgType: lastOrg, gradesText: '', values: [] };
      }
    }
    appendLine(current, line);
  }
  closeRow();
  if (rows.length === 0) return { hit: false, rules: [] };

  // 语境：触发条件（壁厚/外径 ≤/≥ X）与协商降级（复用 clause-patterns 确定性正则）
  const context = `${contextText}\n${block.text}`;
  const triggerCondition = extractTriggerCondition(context);
  const isAgreed = AGREEMENT_RE.test(context);
  const sourceClause = block.clauseRef;

  const rules: DraftRule[] = rows.map((row, i) => {
    const options = row.values
      .slice(0, scale!.length)
      .map((token, idx) => ({ token, subKey: scale![idx]! }))
      .filter(({ token }) => !/^—+$/.test(token.trim()))
      .map(({ token, subKey }) => {
        const numMatch = VALUE_NUMBER_RE.exec(token)!;
        return {
          sub_key: subKey,
          rule_type: 'numeric_range' as const,
          criteria: { min: null, max: Number(numMatch[0]), unit: subKey },
        };
      });
    return {
      rule_id: `DET_HARDNESS_${(row.orgType || 'GENERAL').toUpperCase()}_${i + 1}`,
      category: 'mechanical',
      property_key: 'hardness',
      display_name: '硬度试验 (HRB/HBW/HV)',
      description: `确定性硬度表解析：${sourceClause} 第 ${i + 1} 数据行（组织类型 ${row.orgType || '未标注'}）`,
      rule_type: 'or_choice_group',
      requirement_level: isAgreed ? 'OPTIONAL_AGREED' : 'CONDITIONAL',
      trigger_condition: triggerCondition ?? undefined,
      criteria: { options },
      source_clause: sourceClause,
      applies_to_grades: gradesToApplies(row.gradesText, row.orgType),
      deterministic: true,
    };
  });
  return { hit: true, rules };
}

/** 硬度规则 criteria 是否数值缺失（v1.7.4 管线级修复的判定：options 空或全部无数值 max） */
export function hasMissingHardnessOptions(rule: DraftRule): boolean {
  if (rule.property_key !== 'hardness' || rule.rule_type !== 'or_choice_group') return false;
  const options = (rule.criteria as { options?: unknown }).options;
  if (!Array.isArray(options) || options.length === 0) return true;
  return options.every((opt) => {
    const criteria = (opt as { criteria?: { max?: unknown } })?.criteria;
    return typeof criteria?.max !== 'number';
  });
}

/**
 * 硬度空 options 确定性修复（管线级回放，幂等，无需 LLM 重提）：
 * 对草稿中数值缺失的硬度规则，按 source_clause 定位原块并做确定性解析，
 * 用解析产出的 options 就地替换（经 mountRulesByGrades 判定该切片在解析规则的适用范围内）；
 * 无对应解析结果时保持原样（交人工/S3，绝不臆造）。
 */
export function repairHardnessOptions(drafts: { slices: Array<{ spec_key: string; primary_grade?: string; unified_code?: string; evaluation_rules: DraftRule[] }> }, blocks: TextBlock[]): number {
  const parseCache = new Map<string, HardnessParseResult>();
  // 条款→表引用解析：LLM 常将 source_clause 声明为引用条款（如 6.4"硬度应符合表 4 的规定"），
  // 数值实表在 表N 块——声明块解析不命中时，按其文本中的 表N 引用接力解析
  const parseWithRefChain = (sourceRef: string): HardnessParseResult => {
    if (parseCache.has(sourceRef)) return parseCache.get(sourceRef)!;
    const block = blocks.find((b) => b.clauseRef === sourceRef);
    const idx = block ? blocks.indexOf(block) : -1;
    const contextText = block && idx >= 0 ? blocks.slice(Math.max(0, idx - 3), idx).map((b) => b.text).join('\n') : '';
    let parsed = block ? parseHardnessTable(block, contextText) : { hit: false, rules: [] };
    if ((!parsed.hit || parsed.rules.length === 0) && block) {
      const tableRefs = [...block.text.matchAll(/表\s*(\d+[A-Za-z]?)/g)].map((m) => '表' + m[1]);
      for (const ref of tableRefs) {
        if (ref === sourceRef || parseCache.has(ref)) continue;
        const refBlock = blocks.find((b) => b.clauseRef === ref);
        if (!refBlock) continue;
        const refParsed = parseHardnessTable(refBlock, block.text);
        parseCache.set(ref, refParsed);
        if (refParsed.hit && refParsed.rules.length > 0) {
          parsed = refParsed;
          break;
        }
      }
    }
    parseCache.set(sourceRef, parsed);
    return parsed;
  };
  let repaired = 0;
  for (const slice of drafts.slices) {
    for (const rule of slice.evaluation_rules) {
      if (!hasMissingHardnessOptions(rule)) continue;
      const parsed = parseWithRefChain(rule.source_clause);
      if (!parsed.hit || parsed.rules.length === 0) continue;
      // 该切片须落在某条解析规则的适用范围内（复用挂载判定）
      const { perSlice } = mountRulesForRepair(parsed.rules, slice);
      const candidate = perSlice.find((r) => r.property_key === 'hardness' && r.rule_type === 'or_choice_group');
      if (!candidate) continue;
      rule.criteria = { options: JSON.parse(JSON.stringify(candidate.criteria.options)) };
      repaired += 1;
    }
  }
  return repaired;
}

/** 单切片挂载判定（repairHardnessOptions 内部复用，避免循环依赖 llm-extract） */
function mountRulesForRepair(rules: DraftRule[], slice: { spec_key: string; primary_grade?: string; unified_code?: string }): { perSlice: DraftRule[] } {
  const ORG_SCOPE_MARKER_RE = /^ORG:([a-z_]+):OTHERS$/;
  const tokens = new Set([slice.spec_key, slice.primary_grade, slice.unified_code].filter((t): t is string => typeof t === 'string' && t.length > 0));
  const matched = rules.filter((r) => {
    const applies = r.applies_to_grades ?? [];
    if (applies.includes('ALL')) return true;
    if (applies.some((g) => tokens.has(g))) return true;
    return applies.some((g) => {
      const m = ORG_SCOPE_MARKER_RE.exec(g);
      return m ? (slice as { structure_type?: string }).structure_type === m[1] : false;
    });
  });
  return { perSlice: matched };
}
