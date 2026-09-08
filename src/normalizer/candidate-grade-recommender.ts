import { IRuleStore } from '../repository/rule-store.interface.ts';
import { SpecificationSlice } from '../schemas/standard.schema.ts';
import { CandidateGradeOption } from '../workflow/state.interface.ts';
import { logger } from '../logger/index.ts';

export interface RecommendCandidateParams {
  rawGrade: string;
  declaredStandard?: string;
  standardIds?: string[];
  testRecords?: Array<{
    property_key?: string;
    raw_property_name?: string;
    measured_value_num?: number | null;
    measured_value_raw?: unknown;
    raw_value?: unknown;
    category?: string;
  }>;
  ruleStore?: IRuleStore;
  maxCandidates?: number;
}

interface ScoredCandidate {
  slice: SpecificationSlice;
  tokenScore: number;
  chemScore: number;
  totalScore: number;
}

/**
 * ============================================================================
 * 材料牌号候选动态推荐引擎 (Candidate Grade Recommender)
 * ============================================================================
 * 
 * 核心设计原则：
 * 1. 严禁写死任何规格切片列表：100% 通过 IRuleStore 动态读取当前标准下全部收录的规格切片；
 * 2. 纯代码确定性两层双标尺计算：
 *    - 标尺 1: 牌号词根与别名倒排索引匹配度 (Token / Alias Similarity)
 *    - 标尺 2: 实测化学成分指纹数学区间落入度 (Chemical Fingerprint Overlap)
 * 3. 极速响应 (< 1ms)、零 Token 消耗、零模型幻觉，确保推荐项必有规则切片可闭环。
 * ============================================================================
 */
export class CandidateGradeRecommender {
  private static readonly COMMON_ELEMENTS = new Set([
    'C', 'SI', 'MN', 'P', 'S', 'NI', 'CR', 'MO', 'TI', 'NB', 'N', 'CU', 'AL', 'V', 'W', 'CO', 'B',
  ]);

  /**
   * 执行动态推荐
   */
  public static async recommend(params: RecommendCandidateParams): Promise<CandidateGradeOption[]> {
    const {
      rawGrade,
      declaredStandard,
      standardIds,
      testRecords = [],
      ruleStore,
      maxCandidates = 3,
    } = params;

    if (!rawGrade || (!declaredStandard && (!standardIds || standardIds.length === 0)) || !ruleStore) {
      logger.warn('NORMALIZER', '[CandidateGradeRecommender] 缺少必要参数，无法动态计算推荐牌号');
      return [];
    }

    // 1. 智能解构多标准代号并动态加载各标准的全部规则切片
    const targetStandards: string[] = [];
    if (Array.isArray(standardIds) && standardIds.length > 0) {
      for (const s of standardIds) {
        if (s && s.trim()) targetStandards.push(s.trim());
      }
    } else if (declaredStandard) {
      const parts = declaredStandard.split(/[、,，;；\n]+/).map(s => s.trim()).filter(Boolean);
      targetStandards.push(...parts);
    }

    if (targetStandards.length === 0) {
      targetStandards.push('GB/T 13296-2023');
    }

    let availableSlices: SpecificationSlice[] = [];
    const sliceStandardMap = new Map<SpecificationSlice, string>();
    const gradeStandardCountMap = new Map<string, number>();
    const seenGradePerStd = new Set<string>();

    for (const stdId of targetStandards) {
      try {
        const completeStandard = await ruleStore.getCompleteStandard(stdId);
        if (completeStandard?.slices && completeStandard.slices.length > 0) {
          for (const slice of completeStandard.slices) {
            availableSlices.push(slice);
            sliceStandardMap.set(slice, stdId);

            const gKey = (slice.primary_grade || slice.spec_key).trim().toUpperCase();
            const stdGKey = `${stdId}::${gKey}`;
            if (!seenGradePerStd.has(stdGKey)) {
              seenGradePerStd.add(stdGKey);
              gradeStandardCountMap.set(gKey, (gradeStandardCountMap.get(gKey) || 0) + 1);
            }
          }
        }
      } catch (err) {
        logger.error('NORMALIZER', `[CandidateGradeRecommender] 读取标准 [${stdId}] 切片失败`, err);
      }
    }

    if (availableSlices.length === 0) {
      logger.warn('NORMALIZER', `[CandidateGradeRecommender] 标准 [${targetStandards.join('、')}] 未找到可用规格切片`);
      return [];
    }

    // 2. 提取质保书中的化学成分实测指纹
    const measuredElements = this.extractChemicalMap(testRecords);
    const hasChemicalData = Object.keys(measuredElements).length >= 2;

    // 3. 提取待消歧牌号核心词根
    const rawTokens = this.extractGradeTokens(rawGrade);

    // 4. 对切片池中每个候选切片执行双标尺打分
    const scoredList: ScoredCandidate[] = [];

    for (const slice of availableSlices) {
      const tokenScore = this.calculateTokenScore(rawGrade, rawTokens, slice);
      const chemScore = hasChemicalData ? this.calculateChemScore(measuredElements, slice) : 0.5;

      // 综合加权评分：有化学数据时成分占 60% 权重，词根占 40%；无成分时 100% 取词根分
      let totalScore = hasChemicalData
        ? 0.6 * chemScore + 0.4 * tokenScore
        : tokenScore;

      // 多标准共有牌号加权激励：若在所选的多份标准中均有收录，给予 5% 的共有契合度激励加分
      const gKey = (slice.primary_grade || slice.spec_key).trim().toUpperCase();
      const appearedCount = gradeStandardCountMap.get(gKey) || 1;
      if (targetStandards.length > 1 && appearedCount >= targetStandards.length) {
        totalScore = Math.min(0.99, totalScore + 0.05);
      }

      scoredList.push({
        slice,
        tokenScore,
        chemScore,
        totalScore,
      });
    }

    // 5. 按综合得分降序排列并按牌号主键去重 (同一 primary_grade 保留最高分切片)
    scoredList.sort((a, b) => b.totalScore - a.totalScore);

    const dedupedList: ScoredCandidate[] = [];
    const seenGrades = new Set<string>();
    for (const item of scoredList) {
      const gKey = (item.slice.primary_grade || item.slice.spec_key).trim().toUpperCase();
      if (!seenGrades.has(gKey)) {
        seenGrades.add(gKey);
        dedupedList.push(item);
      }
    }

    // 6. 截取 Top-K 并格式化为 CandidateGradeOption
    const topCandidates = dedupedList.slice(0, maxCandidates);

    return topCandidates.map((item, index) => {
      const { slice, totalScore } = item;
      const pct = Math.min(99, Math.max(50, Math.round(totalScore * 100)));
      const isRecommended = index === 0;

      const codeLabel: string = slice.unified_code
        ? `${slice.primary_grade} (${slice.unified_code})`
        : (slice.primary_grade || slice.spec_key || 'UNKNOWN');

      const stdForSlice = sliceStandardMap.get(slice) || targetStandards.join('、');

      return {
        id: slice.primary_grade || slice.spec_key,
        code: codeLabel,
        match: `${pct}% 匹配${isRecommended ? ' (推荐)' : ''}`,
        standard: stdForSlice,
        recommended: isRecommended,
      };
    });
  }

  /**
   * 从 testRecords 提取化学元素实测字典
   */
  private static extractChemicalMap(testRecords: NonNullable<RecommendCandidateParams['testRecords']>): Record<string, number> {
    const result: Record<string, number> = {};

    for (const rec of testRecords) {
      const keyRaw = (rec.property_key || rec.raw_property_name || '').trim().toUpperCase();
      // 提取核心元素符号 (例如 'C含量', 'C', 'CHEM_C' -> 'C')
      const matchedElem = this.matchElementSymbol(keyRaw);
      if (!matchedElem) continue;

      let valNum: number | undefined = undefined;
      if (typeof rec.measured_value_num === 'number' && !Number.isNaN(rec.measured_value_num)) {
        valNum = rec.measured_value_num;
      } else if (rec.measured_value_raw !== undefined && rec.measured_value_raw !== null) {
        const parsed = parseFloat(String(rec.measured_value_raw).replace(/[^\d.-]/g, ''));
        if (!Number.isNaN(parsed)) valNum = parsed;
      } else if (rec.raw_value !== undefined && rec.raw_value !== null) {
        const parsed = parseFloat(String(rec.raw_value).replace(/[^\d.-]/g, ''));
        if (!Number.isNaN(parsed)) valNum = parsed;
      }

      if (valNum !== undefined) {
        result[matchedElem] = valNum;
      }
    }

    return result;
  }

  private static matchElementSymbol(keyRaw: string): string | undefined {
    const clean = keyRaw.replace(/[^A-Z]/g, '');
    if (this.COMMON_ELEMENTS.has(clean)) return clean;
    // 匹配前缀 (如 'CHEMC' -> 'C', 'CARBON' -> 'C')
    for (const elem of this.COMMON_ELEMENTS) {
      if (clean === elem || clean === `CHEM${elem}` || clean === `ELEMENT${elem}`) {
        return elem;
      }
    }
    return undefined;
  }

  /**
   * 提取牌号中的核心特征词根
   */
  private static extractGradeTokens(raw: string): string[] {
    const clean = raw.toUpperCase().replace(/[()（）[\]]/g, ' ');
    const tokens = clean.split(/[\s\-_/]+/).filter(Boolean);
    const result = new Set<string>();

    for (const t of tokens) {
      result.add(t);
      // 提取纯数字部分 (如 'SUS304H' -> '304', '304H')
      const numMatch = t.match(/\d+/);
      if (numMatch) {
        result.add(numMatch[0]);
      }
      const numSuffixMatch = t.match(/\d+[A-Z]+/);
      if (numSuffixMatch) {
        result.add(numSuffixMatch[0]);
      }
    }

    return Array.from(result);
  }

  /**
   * 标尺 1: 词根与别名倒排索引相似度计算 [0, 1]
   */
  private static calculateTokenScore(rawGrade: string, rawTokens: string[], slice: SpecificationSlice): number {
    const cleanRaw = rawGrade.toUpperCase().replace(/[\s\-_]/g, '');

    // 收集切片的所有可识别键名
    const sliceKeys: string[] = [
      slice.primary_grade || '',
      slice.unified_code || '',
      slice.spec_key || '',
      slice.display_name || '',
      ...(slice.aliases || []),
    ].map(s => s.toUpperCase().replace(/[\s\-_]/g, '')).filter(Boolean);

    let maxScore = 0.1;

    for (const key of sliceKeys) {
      // 1. 完全包含别名或主牌号 (如 'SUS304H' 包含在 'SUS 304H-SPECIALX' 中)
      if (cleanRaw.includes(key) || key.includes(cleanRaw)) {
        return 0.95;
      }

      // 2. 核心特征词根完全匹配 (如 '304H' 或 '304')
      for (const token of rawTokens) {
        if (token.length >= 3 && key.includes(token)) {
          const isExactSeries = token.length >= 4 ? 0.90 : 0.80;
          if (isExactSeries > maxScore) maxScore = isExactSeries;
        }
      }

      // 3. Jaro-Winkler 风格轻量前缀/子串匹配
      const sim = this.calculateStringSimilarity(cleanRaw, key);
      if (sim > maxScore) maxScore = sim;
    }

    return Math.min(1.0, Math.max(0.1, maxScore));
  }

  /**
   * 标尺 2: 实测化学成分指纹落入度计算 [0, 1]
   */
  private static calculateChemScore(
    measured: Record<string, number>,
    slice: SpecificationSlice
  ): number {
    // 提取该切片的所有化学成分规则
    const chemRules = (slice.evaluation_rules || []).filter(
      r => r.category === 'chemical' && r.rule_type === 'numeric_range'
    );

    if (chemRules.length === 0) return 0.5;

    const ruleMap: Record<string, { min: number | null; max: number | null }> = {};
    for (const r of chemRules) {
      const elem = (r.property_key || '').trim().toUpperCase();
      if (elem && r.criteria) {
        ruleMap[elem] = {
          min: typeof r.criteria.min === 'number' ? r.criteria.min : null,
          max: typeof r.criteria.max === 'number' ? r.criteria.max : null,
        };
      }
    }

    let totalPoints = 0;
    let maxPossiblePoints = 0;

    // 逐项评估实测值是否落入规则区间
    for (const [elem, val] of Object.entries(measured)) {
      const rule = ruleMap[elem];
      if (!rule) {
        // 实测有该元素但切片中未规定指标：若含量较高 (如 > 0.1% 的特殊合金)，轻微扣分
        if (['TI', 'MO', 'NB', 'CU'].includes(elem) && val > 0.05) {
          totalPoints += 0.5;
        } else {
          totalPoints += 0.9;
        }
        maxPossiblePoints += 1.0;
        continue;
      }

      maxPossiblePoints += 1.0;
      const { min, max } = rule;

      const isMinOk = min === null || val >= min;
      const isMaxOk = max === null || val <= max;

      if (isMinOk && isMaxOk) {
        // 完全合规，得满分
        totalPoints += 1.0;
      } else {
        // 超标/低于下限，按偏差百分比高斯惩罚递减
        let deviationPct = 0;
        if (min !== null && val < min) {
          deviationPct = (min - val) / Math.max(0.01, min);
        } else if (max !== null && val > max) {
          deviationPct = (val - max) / Math.max(0.01, max);
        }

        const penalty = Math.min(1.0, deviationPct * 2.5);
        totalPoints += Math.max(0, 1.0 - penalty);
      }
    }

    // 反向特征元素检验：如果切片强制要求某合金元素 (如 321 必须有 Ti, 316 必须有 Mo)，而实测未测出
    for (const [elem, rule] of Object.entries(ruleMap)) {
      if (['TI', 'MO', 'NB'].includes(elem) && (rule.min ?? 0) > 0.05) {
        if (measured[elem] === undefined) {
          // 关键特征元素缺失，扣分
          totalPoints = Math.max(0, totalPoints - 0.5);
        }
      }
    }

    if (maxPossiblePoints === 0) return 0.5;
    return Math.min(1.0, Math.max(0.0, totalPoints / maxPossiblePoints));
  }

  /**
   * 轻量字符串子串重合相似度
   */
  private static calculateStringSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0.0;

    let common = 0;
    const len = Math.min(s1.length, s2.length);
    for (let i = 0; i < len; i++) {
      if (s1[i] === s2[i]) common++;
    }

    return common / Math.max(s1.length, s2.length);
  }
}
