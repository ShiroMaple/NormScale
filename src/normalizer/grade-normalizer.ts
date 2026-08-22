import { IRuleStore } from '../repository/rule-store.interface';

export interface NormalizedGradeResult {
  /** 原始提取到的牌号字符串 (如 'SUS 304', 'TP-316L') */
  raw_grade: string;
  /** 归一化后的国家标准主牌号 (如 '06Cr19Ni10', '022Cr17Ni12Mo2') */
  primary_grade: string;
  /** 归一化后的统一数字代号 (如 'S30408', 'S31603', 'S39042') */
  unified_code?: string;
  /** 匹配命中的国家标准代号 (如 'GB/T 13296-2023') */
  standard_id?: string;
  /** 所属金相组织大类 (如 'austenitic', 'ferritic') */
  structure_type?: string;
  /** 是否在标准规则库中精确命中切片 */
  is_matched: boolean;
  /** 牌号识别置信度 (0.0 ~ 1.0) */
  confidence: number;
  /** 归一化转换说明日志 */
  message: string;
}

/**
 * ============================================================================
 * 材料牌号清洗与别名消歧归一化器 (Material Grade Normalizer)
 * ============================================================================
 * 
 * 工业质保书中材料牌号的书写极其混乱。例如同一种奥氏体不锈钢无缝管，
 * 质保书上可能写作 '06Cr19Ni10', '0Cr18Ni9', 'SUS304', 'TP304', 'TP-304',
 * 'S30408'，甚至包含标准前缀 'ASTM A213 TP304 / GB/T 13296'。
 * 
 * 本类负责将一切异构别名清洗并联动 Phase 2 规则仓库（IRuleStore），
 * 秒级消歧并对齐至标准统一数字代号与主牌号。
 * ============================================================================
 */
export class GradeNormalizer {
  private ruleStore?: IRuleStore;

  constructor(ruleStore?: IRuleStore) {
    this.ruleStore = ruleStore;
  }

  /**
   * 常见工业牌号静态别名映射兜底字典 (当未传入 ruleStore 或离线快速查表时使用)
   */
  private static readonly STATIC_ALIAS_MAP: Record<string, { primary: string; code: string; type: string }> = {
    // 304 系列 (S30408 / S30403 / S30409)
    '06CR19NI10': { primary: '06Cr19Ni10', code: 'S30408', type: 'austenitic' },
    '0CR18NI9': { primary: '06Cr19Ni10', code: 'S30408', type: 'austenitic' },
    'S30408': { primary: '06Cr19Ni10', code: 'S30408', type: 'austenitic' },
    'SUS304': { primary: '06Cr19Ni10', code: 'S30408', type: 'austenitic' },
    'TP304': { primary: '06Cr19Ni10', code: 'S30408', type: 'austenitic' },
    '304': { primary: '06Cr19Ni10', code: 'S30408', type: 'austenitic' },
    '022CR19NI10': { primary: '022Cr19Ni10', code: 'S30403', type: 'austenitic' },
    '00CR19NI10': { primary: '022Cr19Ni10', code: 'S30403', type: 'austenitic' },
    'S30403': { primary: '022Cr19Ni10', code: 'S30403', type: 'austenitic' },
    'SUS304L': { primary: '022Cr19Ni10', code: 'S30403', type: 'austenitic' },
    'TP304L': { primary: '022Cr19Ni10', code: 'S30403', type: 'austenitic' },
    '304L': { primary: '022Cr19Ni10', code: 'S30403', type: 'austenitic' },
    '07CR19NI10': { primary: '07Cr19Ni10', code: 'S30409', type: 'austenitic' },
    'S30409': { primary: '07Cr19Ni10', code: 'S30409', type: 'austenitic' },
    'TP304H': { primary: '07Cr19Ni10', code: 'S30409', type: 'austenitic' },

    // 316 系列 (S31608 / S31603 / S31668)
    '06CR17NI12MO2': { primary: '06Cr17Ni12Mo2', code: 'S31608', type: 'austenitic' },
    '0CR17NI12MO2': { primary: '06Cr17Ni12Mo2', code: 'S31608', type: 'austenitic' },
    'S31608': { primary: '06Cr17Ni12Mo2', code: 'S31608', type: 'austenitic' },
    'SUS316': { primary: '06Cr17Ni12Mo2', code: 'S31608', type: 'austenitic' },
    'TP316': { primary: '06Cr17Ni12Mo2', code: 'S31608', type: 'austenitic' },
    '022CR17NI12MO2': { primary: '022Cr17Ni12Mo2', code: 'S31603', type: 'austenitic' },
    '00CR17NI14MO2': { primary: '022Cr17Ni12Mo2', code: 'S31603', type: 'austenitic' },
    'S31603': { primary: '022Cr17Ni12Mo2', code: 'S31603', type: 'austenitic' },
    'SUS316L': { primary: '022Cr17Ni12Mo2', code: 'S31603', type: 'austenitic' },
    'TP316L': { primary: '022Cr17Ni12Mo2', code: 'S31603', type: 'austenitic' },
    '316L': { primary: '022Cr17Ni12Mo2', code: 'S31603', type: 'austenitic' },
    '06CR17NI12MO2TI': { primary: '06Cr17Ni12Mo2Ti', code: 'S31668', type: 'austenitic' },
    'S31668': { primary: '06Cr17Ni12Mo2Ti', code: 'S31668', type: 'austenitic' },
    '316TI': { primary: '06Cr17Ni12Mo2Ti', code: 'S31668', type: 'austenitic' },
    'TP316TI': { primary: '06Cr17Ni12Mo2Ti', code: 'S31668', type: 'austenitic' },

    // 321 系列 (S32168 / S32169)
    '06CR18NI11TI': { primary: '06Cr18Ni11Ti', code: 'S32168', type: 'austenitic' },
    '0CR18NI10TI': { primary: '06Cr18Ni11Ti', code: 'S32168', type: 'austenitic' },
    'S32168': { primary: '06Cr18Ni11Ti', code: 'S32168', type: 'austenitic' },
    'SUS321': { primary: '06Cr18Ni11Ti', code: 'S32168', type: 'austenitic' },
    'TP321': { primary: '06Cr18Ni11Ti', code: 'S32168', type: 'austenitic' },
    '07CR19NI11TI': { primary: '07Cr19Ni11Ti', code: 'S32169', type: 'austenitic' },
    'S32169': { primary: '07Cr19Ni11Ti', code: 'S32169', type: 'austenitic' },
    'TP321H': { primary: '07Cr19Ni11Ti', code: 'S32169', type: 'austenitic' },

    // 347 系列 (S34778 / S34779)
    '06CR18NI11NB': { primary: '06Cr18Ni11Nb', code: 'S34778', type: 'austenitic' },
    'S34778': { primary: '06Cr18Ni11Nb', code: 'S34778', type: 'austenitic' },
    'TP347': { primary: '06Cr18Ni11Nb', code: 'S34778', type: 'austenitic' },
    '07CR18NI11NB': { primary: '07Cr18Ni11Nb', code: 'S34779', type: 'austenitic' },
    'S34779': { primary: '07Cr18Ni11Nb', code: 'S34779', type: 'austenitic' },
    'TP347H': { primary: '07Cr18Ni11Nb', code: 'S34779', type: 'austenitic' },

    // 特殊超级奥氏体 (904L / 254SMO / 654SMO)
    '015CR21NI26MO5CU2': { primary: '015Cr21Ni26Mo5Cu2', code: 'S39042', type: 'austenitic' },
    'S39042': { primary: '015Cr21Ni26Mo5Cu2', code: 'S39042', type: 'austenitic' },
    '904L': { primary: '015Cr21Ni26Mo5Cu2', code: 'S39042', type: 'austenitic' },
    'N08904': { primary: '015Cr21Ni26Mo5Cu2', code: 'S39042', type: 'austenitic' },
    '015CR20NI18MO6CUN': { primary: '015Cr20Ni18Mo6CuN', code: 'S31252', type: 'austenitic' },
    'S31252': { primary: '015Cr20Ni18Mo6CuN', code: 'S31252', type: 'austenitic' },
    '254SMO': { primary: '015Cr20Ni18Mo6CuN', code: 'S31252', type: 'austenitic' },
    '022CR21NI25MO7N': { primary: '022Cr21Ni25Mo7N', code: 'S38367', type: 'austenitic' },
    'S38367': { primary: '022Cr21Ni25Mo7N', code: 'S38367', type: 'austenitic' },
    '654SMO': { primary: '022Cr21Ni25Mo7N', code: 'S38367', type: 'austenitic' },

    // 铁素体系列 (10Cr17 / TP430 / S11710)
    '10CR17': { primary: '10Cr17', code: 'S11710', type: 'ferritic' },
    '1CR17': { primary: '10Cr17', code: 'S11710', type: 'ferritic' },
    'S11710': { primary: '10Cr17', code: 'S11710', type: 'ferritic' },
    'SUS430': { primary: '10Cr17', code: 'S11710', type: 'ferritic' },
    'TP430': { primary: '10Cr17', code: 'S11710', type: 'ferritic' },
    '008CR27MO': { primary: '008Cr27Mo', code: 'S12791', type: 'ferritic' },
    'S12791': { primary: '008Cr27Mo', code: 'S12791', type: 'ferritic' },
    '06CR13': { primary: '06Cr13', code: 'S11306', type: 'ferritic' },
    'S11306': { primary: '06Cr13', code: 'S11306', type: 'ferritic' },
    'TP410S': { primary: '06Cr13', code: 'S11306', type: 'ferritic' },
  };

  /**
   * 清洗原始牌号字符串，剥离前缀、括号与空格连字符
   */
  public static cleanRawGradeString(raw: string): string {
    return raw
      .trim()
      // 剥离常见的标准前缀 (如 'ASTM A213/A213M', 'GB/T 13296-2023')
      .replace(/^(ASTM\s+[A-Z0-9/]+|GB[/_\-T\s0-9]+|JIS\s+[A-Z0-9]+)[\s:,/]+/i, '')
      // 剥离中英文括号及其中内容（若为附属说明）
      .replace(/\s*[(（][^()（）]*[)）]/g, '')
      .trim();
  }

  /**
   * 内部纯净键生成 (如 'tp - 316 l' -> 'TP316L')
   */
  private static toNormalizedKey(str: string): string {
    return str.toUpperCase().replace(/[\s\-_/\\]/g, '');
  }

  /**
   * 执行牌号归一化消歧
   * @param rawGrade 质保书提取到的原始牌号字符串
   * @param declaredStandard 声明的执行标准 (可选，默认 'GB/T 13296-2023')
   */
  public async normalize(
    rawGrade: string,
    declaredStandard: string = 'GB/T 13296-2023'
  ): Promise<NormalizedGradeResult> {
    const cleanStr = GradeNormalizer.cleanRawGradeString(rawGrade);
    const normKey = GradeNormalizer.toNormalizedKey(cleanStr);

    // 1. 若注入了 ruleStore，优先调用仓库的 O(1) 倒排索引
    if (this.ruleStore) {
      const slice = await this.ruleStore.resolveRuleSlice(declaredStandard, cleanStr);
      if (slice) {
        return {
          raw_grade: rawGrade,
          primary_grade: slice.primary_grade || slice.display_name,
          unified_code: slice.unified_code,
          standard_id: declaredStandard,
          structure_type: slice.structure_type,
          is_matched: true,
          confidence: 1.0,
          message: '已通过标准规则库精确命中规格切片 [' + slice.spec_key + ']',
        };
      }
    }

    // 2. 查静态别名映射兜底表
    if (GradeNormalizer.STATIC_ALIAS_MAP[normKey]) {
      const mapped = GradeNormalizer.STATIC_ALIAS_MAP[normKey];
      return {
        raw_grade: rawGrade,
        primary_grade: mapped.primary,
        unified_code: mapped.code,
        standard_id: declaredStandard,
        structure_type: mapped.type,
        is_matched: true,
        confidence: 0.98,
        message: '已通过静态工业别名字典消歧映射为 ' + mapped.primary + ' (' + mapped.code + ')',
      };
    }

    // 3. 未知牌号，原样保留并输出警告信息（交由 Phase 4 HITL 人工干预）
    return {
      raw_grade: rawGrade,
      primary_grade: cleanStr,
      standard_id: declaredStandard,
      is_matched: false,
      confidence: 0.5,
      message: '未在标准规则库中收录该牌号 [' + rawGrade + ']，建议质检员人工核实确认',
    };
  }
}
