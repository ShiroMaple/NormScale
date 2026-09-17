import type { DraftRule, DraftSlice, TextBlock } from './types.ts';

/* ==========================================================================
   确定性法条模式预扫描器 (Clause Patterns) —— 阶段 B，中英双语，纯函数零 LLM
   - 位置：extractAll 中化学切片提取完成（牌号全集与 structure_type 已知）之后、
     process_rules LLM 调用之前；模式命中的块从 LLM 输入剔除（避免双重产出），
     模式产出直接进 drafts（走 mountRulesByGrades 挂载）
   - 根治 exemption/作用域判读这类"模型遵从度赌博"：牌号清单闭集分词匹配（匹配不上
     由挂载层移交 S3，绝不静默）、组织类型过滤查表（slice.structure_type）、
     每个产出携带 source_clause 与原文句描述层
   ========================================================================== */

export interface ClausePatternResult {
  /** 模式产出规则（携带 applies_to_grades，由 mountRulesByGrades 确定性挂载） */
  rules: DraftRule[];
  /** 命中条款块锚点集合（整块从 process_rules LLM 输入剔除） */
  hitClauseRefs: Set<string>;
}

/** 组织类型词 -> slice.structure_type 查表映射（中英双语） */
const STRUCTURE_TYPE_MAP: Record<string, string> = {
  奥氏体: 'austenitic',
  铁素体: 'ferritic',
  双相: 'duplex',
  奥氏体铁素体: 'duplex',
  马氏体: 'martensitic',
  沉淀硬化: 'precipitation_hardening',
  austenitic: 'austenitic',
  ferritic: 'ferritic',
  duplex: 'duplex',
  martensitic: 'martensitic',
};

/** 检验项目映射（中英双语正则 -> property_key/category + 作用域规则默认 criteria） */
interface TestItemMapping {
  zh: RegExp;
  en: RegExp;
  property_key: string;
  category: string;
  /** 作用域限定规则的 rule_type 与默认 criteria（项目惯例，golden 已验证；豁免规则仅需 property_key/category） */
  scopeRuleType: string;
  scopeCriteria: Record<string, unknown>;
}

const TEST_ITEM_MAPPINGS: TestItemMapping[] = [
  {
    zh: /晶间腐蚀/,
    en: /intergranular corrosion/i,
    property_key: 'intergranular_corrosion',
    category: 'corrosion',
    scopeRuleType: 'qualitative_pass',
    scopeCriteria: { expected: 'NO_CORROSION_TREND' },
  },
  {
    zh: /扩口/,
    en: /flaring/i,
    property_key: 'flaring_test',
    category: 'process',
    scopeRuleType: 'qualitative_and_numeric',
    scopeCriteria: { expected_visual_result: 'NO_CRACKS' },
  },
  {
    zh: /压扁/,
    en: /flattening/i,
    property_key: 'flattening_test',
    category: 'process',
    scopeRuleType: 'dynamic_formula_pass',
    scopeCriteria: { expected_visual_result: 'NO_CRACKS' },
  },
];

function matchTestItem(sentence: string): TestItemMapping | null {
  for (const mapping of TEST_ITEM_MAPPINGS) {
    if (mapping.zh.test(sentence) || mapping.en.test(sentence)) return mapping;
  }
  return null;
}

/** 牌号清单分词：顿号/逗号/分号/斜杠/空白/和及/and/& 分隔；剥离"牌号为"前缀与"等"后缀 */
function tokenizeGradeList(raw: string): string[] {
  const cleaned = raw
    .replace(/^\s*(牌号为?|grades?\s+(of\s+)?|：|:)\s*/i, '')
    .replace(/等\s*$/, '')
    .trim();
  return cleaned
    .split(/[、，,;；/]|\s+and\s+|\s*&\s*|\s+or\s+|\s+|和|及/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** 句子切分：句号/分号/问号/感叹号断句 + 换行断句 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。；！？!?])\s*|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/* ---------- 条件触发（壁厚/外径 ≤/≥ X mm -> JS 表达式惯例） ---------- */

const ZH_CONDITION_RE = /(壁厚|外径)\s*(不小于|不大于|大于等于|小于等于|大于|小于|≥|≤|>|<)\s*([\d.]+)\s*mm/i;
const EN_CONDITION_RE = /wall thickness\s*(not less than|not greater than|greater than or equal to|less than or equal to|greater than|less than|≥|≤|>|<)\s*([\d.]+)\s*mm/i;

const CONDITION_FIELD_MAP: Record<string, string> = {
  壁厚: 'ctx.header.dimensions.wall_thickness_mm',
  外径: 'ctx.header.dimensions.outer_diameter_mm',
  'wall thickness': 'ctx.header.dimensions.wall_thickness_mm',
};

const CONDITION_OPERATOR_MAP: Record<string, string> = {
  不小于: '>=',
  大于等于: '>=',
  '≥': '>=',
  大于: '>',
  不大于: '<=',
  小于等于: '<=',
  '≤': '<=',
  小于: '<',
  'not less than': '>=',
  'greater than or equal to': '>=',
  'not greater than': '<=',
  'less than or equal to': '<=',
  'greater than': '>',
  'less than': '<',
};

function extractTriggerCondition(sentence: string): string | null {
  const zh = ZH_CONDITION_RE.exec(sentence);
  if (zh) {
    const field = CONDITION_FIELD_MAP[zh[1]!];
    const op = CONDITION_OPERATOR_MAP[zh[2]!];
    if (field && op) return `${field} ${op} ${zh[3]}`;
    return null;
  }
  const en = EN_CONDITION_RE.exec(sentence);
  if (en) {
    const field = CONDITION_FIELD_MAP['wall thickness'];
    const opKey = en[1]!.toLowerCase();
    const op = CONDITION_OPERATOR_MAP[opKey] ?? CONDITION_OPERATOR_MAP[en[1]!];
    if (field && op) return `${field} ${op} ${en[2]}`;
  }
  return null;
}

/* ---------- 协商条款（降级别标记：同句产出的非豁免规则降为 OPTIONAL_AGREED） ---------- */

const AGREEMENT_RE = /经供需双方协商|根据需方要求.{0,20}协商|when specified by the purchaser|by agreement between/i;

/* ---------- 豁免（可不进行/无需进行/可不做） ---------- */

/** 豁免牌号清单可缺省（句中无显式牌号清单，如"壁厚不小于 X mm 的钢管可不进行扩口试验"）——缺省视为 ALL */
const ZH_EXEMPTION_RE = /(?:牌号为?(.+?))?的?钢管.{0,12}?(可不进行|可不做|无需进行|不需要进行|可不做的)(.+?)(?:试验|检测)/;
const EN_EXEMPTION_RE = /(?:([A-Z0-9][A-Za-z0-9\s,;&]*?)\s+)?(?:tubes?|pipes?)\b.{0,60}?\b(?:need not be (?:tested|subjected to)|(?:is|are) exempt from|shall be exempt from)\s+(.+?)(?:\s+test(?:ing)?)?(?:[.。]|$)/i;

interface ExemptionMatch {
  grades: string[];
  rawGrades: string;
  sentence: string;
}

function extractExemption(sentence: string): ExemptionMatch | null {
  const zh = ZH_EXEMPTION_RE.exec(sentence);
  if (zh) {
    return { grades: zh[1] ? tokenizeGradeList(zh[1]) : ['ALL'], rawGrades: zh[1] ?? '', sentence };
  }
  const en = EN_EXEMPTION_RE.exec(sentence);
  if (en) {
    return { grades: en[1] ? tokenizeGradeList(en[1]) : ['ALL'], rawGrades: en[1] ?? '', sentence };
  }
  return null;
}

/* ---------- 作用域限定（其他<组织类型>钢管应进行 …；确定性计算 applies） ---------- */

const ZH_SCOPE_RE = /其他(奥氏体|铁素体|双相|马氏体)型?钢管应(?:进行|做)(.+?)(?:试验|检测)/;
const EN_SCOPE_RE = /other (austenitic|ferritic|duplex|martensitic)\s+(?:tubes?|pipes?)\s+shall be (?:tested|subjected to)/i;

interface ScopeMatch {
  structureType: string;
  sentence: string;
}

function extractScope(sentence: string): ScopeMatch | null {
  const zh = ZH_SCOPE_RE.exec(sentence);
  if (zh) return { structureType: STRUCTURE_TYPE_MAP[zh[1]!]!, sentence };
  const en = EN_SCOPE_RE.exec(sentence);
  if (en) return { structureType: STRUCTURE_TYPE_MAP[en[1]!.toLowerCase()]!, sentence };
  return null;
}

/* ---------- 牌号清单限定指标（NB 6.9 晶粒度句式：…牌号管子的晶粒度级别为 4 级～7 级） ---------- */

const GRAIN_SIZE_RE = /(.+?)牌号(?:的)?管子(?:的)?晶粒度级别(?:应)?为\s*(\d+)\s*级?\s*[～~]\s*(\d+)\s*级/;

/**
 * 确定性法条模式预扫描主入口（纯函数，同输入同输出）。
 * @param blocks process_rules 通道候选块（已排除检验一览表/附录）
 * @param slices 已合并切片（牌号全集 + structure_type 已知）
 */
export function applyClausePatterns(blocks: TextBlock[], slices: DraftSlice[]): ClausePatternResult {
  const rules: DraftRule[] = [];
  const hitClauseRefs = new Set<string>();

  for (const block of blocks) {
    let blockHit = false;
    for (const sentence of splitSentences(block.text)) {
      const grain = GRAIN_SIZE_RE.exec(sentence);
      const mapping = matchTestItem(sentence);
      if (!mapping && !grain) continue;

      const condition = extractTriggerCondition(sentence);
      const isAgreement = AGREEMENT_RE.test(sentence);
      const exemption = mapping ? extractExemption(sentence) : null;
      const scope = mapping ? extractScope(sentence) : null;

      if (exemption && mapping) {
        // 豁免：每个豁免牌号一条（挂载层按 applies 展开；闭集外的牌号由 S3 拦截，绝不静默）
        rules.push({
          rule_id: `EXEMPT_${mapping.property_key.toUpperCase()}`,
          category: mapping.category,
          property_key: mapping.property_key,
          display_name: `豁免条款（${mapping.property_key}）`,
          description: `确定性法条模式命中（豁免）：${sentence}`,
          rule_type: 'exemption',
          requirement_level: 'EXEMPT',
          trigger_condition: condition ?? undefined,
          criteria: { reason: sentence },
          source_clause: block.clauseRef,
          applies_to_grades: exemption.grades,
          deterministic: true,
        });
        blockHit = true;
      }

      if (scope && mapping) {
        // 作用域：applies 由确定性计算——组织类型查表切片，且剔除同句豁免清单内的牌号
        const exemptSet = new Set(exemption?.grades ?? []);
        const targetSlices = slices.filter(
          (s) => s.structure_type === scope.structureType &&
            ![s.spec_key, s.primary_grade, s.unified_code].some((g) => g && exemptSet.has(g)),
        );
        if (targetSlices.length > 0) {
          rules.push({
            rule_id: `SCOPE_${mapping.property_key.toUpperCase()}`,
            category: mapping.category,
            property_key: mapping.property_key,
            display_name: `作用域限定（${mapping.property_key}）`,
            description: `确定性法条模式命中（作用域限定）：${sentence}`,
            rule_type: mapping.scopeRuleType,
            requirement_level: isAgreement ? 'OPTIONAL_AGREED' : 'MANDATORY',
            trigger_condition: condition ?? undefined,
            criteria: { ...mapping.scopeCriteria },
            source_clause: block.clauseRef,
            applies_to_grades: targetSlices.map((s) => s.spec_key),
            deterministic: true,
          });
          blockHit = true;
        }
      }

      if (grain) {
        const grades = tokenizeGradeList(grain[1]!);
        if (grades.length > 0) {
          rules.push({
            rule_id: 'DET_GRAIN_SIZE',
            category: 'metallographic',
            property_key: 'grain_size',
            display_name: '晶粒度级别',
            description: `确定性法条模式命中（牌号清单限定）：${sentence}`,
            rule_type: 'numeric_range',
            requirement_level: 'MANDATORY',
            trigger_condition: condition ?? undefined,
            criteria: { min: Number(grain[2]), max: Number(grain[3]), unit: '级' },
            source_clause: block.clauseRef,
            applies_to_grades: grades,
            deterministic: true,
          });
          blockHit = true;
        }
      }
    }
    if (blockHit) hitClauseRefs.add(block.clauseRef);
  }
  return { rules, hitClauseRefs };
}
