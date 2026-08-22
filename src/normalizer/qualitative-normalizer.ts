export interface NormalizedQualitativeResult {
  /** 原始文本字符串 */
  original_text: string;
  /** 归一化判定结论枚举 ('PASS' | 'FAIL' | 'NOT_TESTED') */
  qualitative_result: 'PASS' | 'FAIL' | 'NOT_TESTED';
  /** 提取到的无损探伤等验收等级 (如 'E3H', 'U2', 'Method_E') */
  claimed_level?: string;
  /** 归一化说明 */
  message?: string;
}

/**
 * ============================================================================
 * 定性试验结论与探伤等级归一化器 (Qualitative Result Normalizer)
 * ============================================================================
 * 
 * 针对压扁、扩口、晶间腐蚀、无损探伤等定性测试项目，将供应商质保书中的各种自然语言
 * （如 '未见开裂'、'合格'、'OK'、'E3H 等级合格'、'无晶腐倾向'）规范化为可供引擎判定的
 * 确定性枚举值，并自动提取质保书上声称的验收等级。
 * ============================================================================
 */
export class QualitativeNormalizer {
  /** 合格语义正则模式 */
  private static readonly PASS_PATTERNS = [
    /^PASS$/i, /^OK$/i, /^YES$/i,
    /合格/, /符合/, /完好/, /未见(裂纹|开裂|异常|缺陷)/, /无(裂纹|开裂|缺陷|晶间腐蚀倾向|晶腐倾向)/,
    /NO_CRACKS/i, /NO_DEFECTS/i, /ACCEPTABLE/i, /CONFORM/i,
  ];

  /** 不合格语义正则模式 */
  private static readonly FAIL_PATTERNS = [
    /^FAIL$/i, /^NG$/i, /^NO$/i, /不合格/, /不符合/, /开裂/, /超标/, /有裂纹/, /超差/,
    /REJECT/i, /CRACKS_FOUND/i,
  ];

  /** 未检/免做语义正则模式 */
  private static readonly NOT_TESTED_PATTERNS = [
    /未做/, /未测/, /免做/, /免检/, /^[-/\\_]+$/, /^N\/?A$/i, /^NONE$/i,
  ];

  /** 无损探伤与晶腐常用验收等级/方法正则识别 (如 E3H, E2, U2, U3, Method_E, Method_A, E法, A法) */
  private static readonly CLAIMED_LEVEL_REGEX = /(?:^|[\s(（,，])(E[1-4]H?|U[1-4]|METHOD_[A-E]|[A-E]法)(?:$|[\s)）,，\u4e00-\u9fa5])/i;

  public static normalize(rawInput: unknown): NormalizedQualitativeResult {
    const str = String(rawInput || '').trim();
    if (!str) {
      return { original_text: '', qualitative_result: 'NOT_TESTED' };
    }

    // 1. 提取声称的探伤或方法等级 (如 'E3H', 'U2')
    let claimed_level: string | undefined;
    const levelMatch = str.match(this.CLAIMED_LEVEL_REGEX);
    if (levelMatch && levelMatch[1]) {
      claimed_level = levelMatch[1].toUpperCase();
      if (claimed_level === 'E法') claimed_level = 'Method_E';
      if (claimed_level === 'A法') claimed_level = 'Method_A';
    }

    // 2. 检查是否为未做/免做
    for (const pat of this.NOT_TESTED_PATTERNS) {
      if (pat.test(str)) {
        return {
          original_text: str,
          qualitative_result: 'NOT_TESTED',
          claimed_level,
        };
      }
    }

    // 3. 检查不合格语义 (优先级高于合格)
    for (const pat of this.FAIL_PATTERNS) {
      if (pat.test(str)) {
        return {
          original_text: str,
          qualitative_result: 'FAIL',
          claimed_level,
          message: '识别为不合格结论: ' + str,
        };
      }
    }

    // 4. 检查合格语义
    for (const pat of this.PASS_PATTERNS) {
      if (pat.test(str)) {
        return {
          original_text: str,
          qualitative_result: 'PASS',
          claimed_level,
          message: '识别为合格结论: ' + str,
        };
      }
    }

    // 5. 兜底为 PASS（如果带有 E3H 或 U2 等验收等级且无不合格字眼）
    if (claimed_level) {
      return {
        original_text: str,
        qualitative_result: 'PASS',
        claimed_level,
      };
    }

    return {
      original_text: str,
      qualitative_result: 'PASS',
    };
  }
}
