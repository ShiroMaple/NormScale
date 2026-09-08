import { StandardOverviewDto } from '@/lib/api-client.ts';
import { normalizeStandardId } from '@/lib/utils.ts';

/**
 * 模糊匹配候选钢级项
 */
export interface FuzzyGradeItem {
  spec_key: string;
  primary_grade: string;
  unified_code?: string;
  display_name: string;
  aliases: string[];
  standard_id: string;
  matchedAlias?: string;
  matchScore: number;
}

/**
 * 从可用标准库中提取当前选定标准（或全局退化）的去重钢级切片候选池
 */
export function buildGradePool(
  standards: StandardOverviewDto[] = [],
  selectedStandardIds: string[] = []
): FuzzyGradeItem[] {
  if (!standards || standards.length === 0) return [];

  // 1. 优先筛选当前选定的执行标准
  const selectedNorms = new Set(selectedStandardIds.map(s => normalizeStandardId(s)));
  let targetStandards = standards.filter(std => selectedNorms.has(normalizeStandardId(std.standard_id)));

  // 若所选标准未命中任何切片（如非标或历史数据），退化为全库标准
  if (targetStandards.length === 0 || !targetStandards.some(s => s.slice_details && s.slice_details.length > 0)) {
    targetStandards = standards;
  }

  const pool: FuzzyGradeItem[] = [];
  const seenKeys = new Set<string>();

  for (const std of targetStandards) {
    if (!std.slice_details) continue;
    for (const slice of std.slice_details) {
      const uniqueKey = `${slice.primary_grade}::${slice.unified_code || ''}`;
      if (seenKeys.has(uniqueKey)) continue;
      seenKeys.add(uniqueKey);

      pool.push({
        spec_key: slice.spec_key,
        primary_grade: slice.primary_grade,
        unified_code: slice.unified_code,
        display_name: slice.display_name,
        aliases: slice.aliases || [],
        standard_id: std.standard_id,
        matchScore: 0,
      });
    }
  }

  return pool;
}

/**
 * 执行多维模糊匹配检索并按相关度排序
 * @param query 用户输入的搜索词
 * @param pool 候选钢级池
 * @param maxResults 最大返回数量，默认 8 项
 */
export function searchFuzzyGrades(
  query: string,
  pool: FuzzyGradeItem[],
  maxResults = 8
): FuzzyGradeItem[] {
  const rawQ = (query || '').trim();
  if (!rawQ) return [];

  const q = rawQ.toUpperCase();
  const cleanQ = q.replace(/[\s\-_/\\()]/g, '');

  const matched: FuzzyGradeItem[] = [];

  for (const item of pool) {
    const uCode = (item.unified_code || '').toUpperCase();
    const cleanUCode = uCode.replace(/[\s\-_/\\()]/g, '');

    const pGrade = item.primary_grade.toUpperCase();
    const cleanPGrade = pGrade.replace(/[\s\-_/\\()]/g, '');

    const dName = item.display_name.toUpperCase();
    const aliases = item.aliases.map(a => a.toUpperCase());

    let score = 0;
    let matchedAlias: string | undefined;

    // 1. 完全匹配
    if (uCode === q || pGrade === q) {
      score = 100;
    } else if (aliases.some(a => a === q)) {
      score = 95;
      matchedAlias = item.aliases.find(a => a.toUpperCase() === q);
    }
    // 2. 规范化字符完全匹配 (如 '316L' 匹配 'SUS316L' 或 'TP-316L')
    else if (cleanUCode === cleanQ || cleanPGrade === cleanQ) {
      score = 92;
    }
    // 3. 前缀匹配
    else if (uCode.startsWith(q)) {
      score = 90;
    } else if (pGrade.startsWith(q)) {
      score = 85;
    } else if (aliases.some(a => a.startsWith(q))) {
      score = 82;
      matchedAlias = item.aliases.find(a => a.toUpperCase().startsWith(q));
    }
    // 4. 子串包含匹配
    else if (uCode.includes(q)) {
      score = 80;
    } else if (pGrade.includes(q)) {
      score = 75;
    } else if (aliases.some(a => a.includes(q))) {
      score = 72;
      matchedAlias = item.aliases.find(a => a.toUpperCase().includes(q));
    } else if (dName.includes(q)) {
      score = 70;
    }
    // 5. 纯净归一化字符包含匹配
    else if (cleanQ.length >= 2 && (cleanUCode.includes(cleanQ) || cleanPGrade.includes(cleanQ))) {
      score = 65;
    } else if (cleanQ.length >= 2 && aliases.some(a => a.replace(/[\s\-_/\\()]/g, '').includes(cleanQ))) {
      score = 60;
      matchedAlias = item.aliases.find(a => a.toUpperCase().replace(/[\s\-_/\\()]/g, '').includes(cleanQ));
    }

    if (score > 0) {
      matched.push({
        ...item,
        matchedAlias,
        matchScore: score,
      });
    }
  }

  // 按分数降序排列，相同分数按主牌号长度/字母序排列
  matched.sort((a, b) => {
    if (b.matchScore !== a.matchScore) {
      return b.matchScore - a.matchScore;
    }
    return a.primary_grade.localeCompare(b.primary_grade);
  });

  return matched.slice(0, maxResults);
}
