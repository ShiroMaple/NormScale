import BigNumber from 'bignumber.js';

export interface NormalizedNumericValue {
  /** 归一化后的基准数值 (数字格式) */
  value: number;
  /** 转换后的国家标准基准单位 (如 'MPa', '%', 'mm', 'J') */
  target_unit: string;
  /** 原始提取到的单位 (如 'kgf/mm²', 'psi', 'cm') */
  original_unit?: string;
  /** 原始数值字符串 (如 '520 N/mm2', '<0.005') */
  original_raw_text: string;
  /** 是否包含比较前缀 (如 '<', '<=', '>', '>=') */
  comparison_operator?: '<' | '<=' | '>' | '>=';
  /** 是否发生过跨单位换算 (如 kgf/mm² -> MPa) */
  is_converted: boolean;
  /** 转换系数说明 (如 '1 kgf/mm² = 9.80665 MPa') */
  conversion_formula?: string;
}

/**
 * ============================================================================
 * 物理量数值与工程单位归一化转换器 (Physical Unit Normalizer)
 * ============================================================================
 * 
 * 工业质量证明书中常见的物理量单位异构极其严重（例如美标使用 psi/ksi，
 * 日标或老国标使用 kgf/mm²，欧洲使用 N/mm²，而中国国家标准统一使用 MPa）。
 * 
 * 本类基于 BigNumber 进行确定性换算，杜绝 JavaScript 原生浮点误差，
 * 并支持自动从字符串中剥离修饰前缀（如 '<0.01'、'≥520'）。
 * ============================================================================
 */
export class UnitNormalizer {
  /** kgf/mm² 转 MPa 精确换算常数 (1 kgf = 9.80665 N) */
  private static readonly KGF_MM2_TO_MPA = new BigNumber('9.80665');
  /** psi 转 MPa 换算常数 (1 psi = 0.006894757293168361 MPa) */
  private static readonly PSI_TO_MPA = new BigNumber('0.006894757293168361');
  /** ksi 转 MPa 换算常数 (1 ksi = 6.894757293168361 MPa) */
  private static readonly KSI_TO_MPA = new BigNumber('6.894757293168361');

  /**
   * 归一化清洗力学性能与强度类物理量（统一输出为 MPa）
   * 支持输入: 520, '520 MPa', '520 N/mm2', '53.0 kgf/mm2', '75.4 ksi', '75400 psi'
   */
  public static normalizeStrength(rawValue: unknown, rawUnit?: string): NormalizedNumericValue {
    const parsed = this.extractNumericAndUnit(rawValue, rawUnit);
    const unitLower = (parsed.unit || '').toLowerCase().replace(/\s/g, '');
    const bnVal = new BigNumber(parsed.numericString);

    if (bnVal.isNaN()) {
      throw new Error('无法解析力学强度数值: ' + String(rawValue));
    }

    // 1. 工程应力单位 kgf/mm² -> MPa (乘以 9.80665)
    if (unitLower.includes('kgf') || unitLower === 'kg/mm2' || unitLower === 'kg/mm²') {
      const converted = bnVal.times(this.KGF_MM2_TO_MPA);
      return {
        value: converted.toNumber(),
        target_unit: 'MPa',
        original_unit: parsed.unit || 'kgf/mm²',
        original_raw_text: String(rawValue),
        comparison_operator: parsed.operator,
        is_converted: true,
        conversion_formula: 'val * 9.80665 (kgf/mm² -> MPa)',
      };
    }

    // 2. 美标单位 psi -> MPa
    if (unitLower === 'psi') {
      const converted = bnVal.times(this.PSI_TO_MPA);
      return {
        value: converted.toNumber(),
        target_unit: 'MPa',
        original_unit: 'psi',
        original_raw_text: String(rawValue),
        comparison_operator: parsed.operator,
        is_converted: true,
        conversion_formula: 'val * 0.00689476 (psi -> MPa)',
      };
    }

    // 3. 美标单位 ksi -> MPa
    if (unitLower === 'ksi') {
      const converted = bnVal.times(this.KSI_TO_MPA);
      return {
        value: converted.toNumber(),
        target_unit: 'MPa',
        original_unit: 'ksi',
        original_raw_text: String(rawValue),
        comparison_operator: parsed.operator,
        is_converted: true,
        conversion_formula: 'val * 6.89476 (ksi -> MPa)',
      };
    }

    // 4. 标准国际单位 MPa 或 N/mm² (1:1 直接对应)
    return {
      value: bnVal.toNumber(),
      target_unit: 'MPa',
      original_unit: parsed.unit || 'MPa',
      original_raw_text: String(rawValue),
      comparison_operator: parsed.operator,
      is_converted: false,
    };
  }

  /**
   * 归一化化学成分元素含量或伸长率（统一输出为 %）
   * 支持输入: 0.04, '0.04%', '0.04 %', '<0.005'
   */
  public static normalizePercentage(rawValue: unknown, rawUnit?: string): NormalizedNumericValue {
    const parsed = this.extractNumericAndUnit(rawValue, rawUnit);
    const bnVal = new BigNumber(parsed.numericString);

    if (bnVal.isNaN()) {
      throw new Error('无法解析百分比含量数值: ' + String(rawValue));
    }

    return {
      value: bnVal.toNumber(),
      target_unit: '%',
      original_unit: parsed.unit || '%',
      original_raw_text: String(rawValue),
      comparison_operator: parsed.operator,
      is_converted: false,
    };
  }

  /**
   * 归一化几何长度与尺寸数值（统一输出为毫米 mm）
   * 支持输入: 25.0, '25mm', '2.5cm', '6m', '1 inch', '1in'
   */
  public static normalizeDimension(rawValue: unknown, rawUnit?: string): NormalizedNumericValue {
    const parsed = this.extractNumericAndUnit(rawValue, rawUnit);
    const unitLower = (parsed.unit || '').toLowerCase().replace(/\s/g, '');
    const bnVal = new BigNumber(parsed.numericString);

    if (bnVal.isNaN()) {
      throw new Error('无法解析几何尺寸数值: ' + String(rawValue));
    }

    // 厘米 cm -> 毫米 mm (* 10)
    if (unitLower === 'cm') {
      return {
        value: bnVal.times(10).toNumber(),
        target_unit: 'mm',
        original_unit: 'cm',
        original_raw_text: String(rawValue),
        comparison_operator: parsed.operator,
        is_converted: true,
        conversion_formula: 'val * 10 (cm -> mm)',
      };
    }

    // 米 m -> 毫米 mm (* 1000)
    if (unitLower === 'm' || unitLower === 'meter') {
      return {
        value: bnVal.times(1000).toNumber(),
        target_unit: 'mm',
        original_unit: 'm',
        original_raw_text: String(rawValue),
        comparison_operator: parsed.operator,
        is_converted: true,
        conversion_formula: 'val * 1000 (m -> mm)',
      };
    }

    // 英寸 inch -> 毫米 mm (* 25.4)
    if (unitLower === 'inch' || unitLower === 'in' || unitLower === '"') {
      return {
        value: bnVal.times(new BigNumber('25.4')).toNumber(),
        target_unit: 'mm',
        original_unit: 'inch',
        original_raw_text: String(rawValue),
        comparison_operator: parsed.operator,
        is_converted: true,
        conversion_formula: 'val * 25.4 (inch -> mm)',
      };
    }

    return {
      value: bnVal.toNumber(),
      target_unit: 'mm',
      original_unit: parsed.unit || 'mm',
      original_raw_text: String(rawValue),
      comparison_operator: parsed.operator,
      is_converted: false,
    };
  }

  /**
   * 内部核心方法：从任意输入中提取纯数字串、比较操作符与单位
   */
  private static extractNumericAndUnit(rawValue: unknown, explicitUnit?: string): {
    numericString: string;
    unit?: string;
    operator?: '<' | '<=' | '>' | '>=';
  } {
    if (typeof rawValue === 'number') {
      return { numericString: String(rawValue), unit: explicitUnit };
    }

    const str = String(rawValue || '').trim();
    if (!str) {
      throw new Error('数值输入为空');
    }

    let operator: '<' | '<=' | '>' | '>=' | undefined;
    let cleanStr = str;

    // 1. 识别比较符号前缀
    if (cleanStr.startsWith('<=') || cleanStr.startsWith('≤')) {
      operator = '<=';
      cleanStr = cleanStr.replace(/^(<=|≤)/, '').trim();
    } else if (cleanStr.startsWith('<')) {
      operator = '<';
      cleanStr = cleanStr.substring(1).trim();
    } else if (cleanStr.startsWith('>=') || cleanStr.startsWith('≥')) {
      operator = '>=';
      cleanStr = cleanStr.replace(/^(>=|≥)/, '').trim();
    } else if (cleanStr.startsWith('>')) {
      operator = '>';
      cleanStr = cleanStr.substring(1).trim();
    }

    // 2. 正则提取主体数字部分与尾部单位 (如 '520.5 MPa' -> num: '520.5', unit: 'MPa')
    const match = cleanStr.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*)$/);
    if (!match) {
      throw new Error('无法从字符串中提取有效数字: ' + str);
    }

    const numPart = match[1] || '0';
    const inlineUnit = match[2]?.trim();
    const unit = inlineUnit || explicitUnit;

    return {
      numericString: numPart,
      unit: unit ? unit : undefined,
      operator,
    };
  }
}
