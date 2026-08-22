import { RuleCategory } from '../schemas/standard.schema';

export interface NormalizedPropertyResult {
  /** 原始提取到的检验项名称 (如 '抗拉强度 Rm', 'C', 'ReH (Rp0.2)') */
  raw_property_name: string;
  /** 标准归一化后的属性键名 (如 'tensile_strength', 'C', 'yield_strength_rp02') */
  property_key: string;
  /** 所属的标准检验类别 (如 'mechanical', 'chemical', 'process', 'ndt') */
  category: RuleCategory;
  /** 界面友好的规范展示名 (如 '抗拉强度 (Rm)', '规定塑性延伸强度 (Rp0.2)') */
  display_name: string;
  /** 次级测试指标类型 (如硬度试验中的 'HRB' | 'HBW' | 'HV') */
  sub_property?: string;
  /** 是否成功匹配到已知标准检验项 */
  is_known: boolean;
}

/**
 * ============================================================================
 * 检验项目名称与类别归一化映射器 (Property Key Normalizer)
 * ============================================================================
 * 
 * 供应商质保书中检验项的表达五花八门（中英文混写、缩写不同、带标准公式符号等）。
 * 例如力学拉伸项目可能写作 '抗拉强度'、'Rm'、'TS'、'Tensile Strength'、'抗张力'；
 * 屈服强度可能写作 '屈服点'、'ReH'、'ReL'、'Rp0.2'、'YS'、'0.2% Yield'。
 * 
 * 本类利用规则匹配与智能模式识别，将所有异构名称映射为系统统一的 property_key 与 category。
 * ============================================================================
 */
export class PropertyKeyNormalizer {
  /** 常见化学元素符号集合 */
  private static readonly CHEMICAL_ELEMENTS: Record<string, string> = {
    'C': '碳', 'SI': '硅', 'MN': '锰', 'P': '磷', 'S': '硫',
    'NI': '镍', 'CR': '铬', 'MO': '钼', 'CU': '铜', 'N': '氮',
    'TI': '钛', 'NB': '铌', 'AL': '铝', 'V': '钒', 'W': '钨',
    'B': '硼', 'CO': '钴', 'FE': '铁', 'PB': '铅', 'SN': '锡',
  };

  /** 化学中文名称到化学元素符号映射 */
  private static readonly CHEMICAL_CHINESE_MAP: Record<string, string> = {
    '碳': 'C', '碳含量': 'C', 'CARBON': 'C',
    '硅': 'Si', '硅含量': 'Si', 'SILICON': 'Si',
    '锰': 'Mn', '锰含量': 'Mn', 'MANGANESE': 'Mn',
    '磷': 'P', '磷含量': 'P', 'PHOSPHORUS': 'P',
    '硫': 'S', '硫含量': 'S', 'SULFUR': 'S',
    '镍': 'Ni', '镍含量': 'Ni', 'NICKEL': 'Ni',
    '铬': 'Cr', '铬含量': 'Cr', 'CHROMIUM': 'Cr',
    '钼': 'Mo', '钼含量': 'Mo', 'MOLYBDENUM': 'Mo',
    '铜': 'Cu', '铜含量': 'Cu', 'COPPER': 'Cu',
    '氮': 'N', '氮含量': 'N', 'NITROGEN': 'N',
    '钛': 'Ti', '钛含量': 'Ti', 'TITANIUM': 'Ti',
    '铌': 'Nb', '铌含量': 'Nb', 'NIOBIUM': 'Nb',
    '铝': 'Al', '铝含量': 'Al', 'ALUMINUM': 'Al',
  };

  /**
   * 核心归一化方法
   */
  public static normalize(rawName: string, rawCategoryHint?: string): NormalizedPropertyResult {
    const str = rawName.trim();
    const upperStr = str.toUpperCase().replace(/[\s\-_/():（）\[\]]/g, '');

    // 1. 优先化学成分判定
    // (a) 纯化学符号 (如 'C', 'SI', 'NI', 'CR', 'MO', 'TI')
    if (this.CHEMICAL_ELEMENTS[upperStr]) {
      const symbol = upperStr.charAt(0) + upperStr.slice(1).toLowerCase();
      return {
        raw_property_name: rawName,
        property_key: symbol,
        category: 'chemical',
        display_name: '化学元素 ' + symbol + ' (' + this.CHEMICAL_ELEMENTS[upperStr] + ')',
        is_known: true,
      };
    }
    // (b) 中文化学名 (如 '碳', '镍含量')
    if (this.CHEMICAL_CHINESE_MAP[upperStr]) {
      const symbol = this.CHEMICAL_CHINESE_MAP[upperStr];
      return {
        raw_property_name: rawName,
        property_key: symbol,
        category: 'chemical',
        display_name: '化学元素 ' + symbol,
        is_known: true,
      };
    }

    // 2. 力学性能判定
    // (a) 抗拉强度 (Tensile Strength, Rm, TS)
    if (/^(RM|TS|TENSILE|抗拉强度|抗张强度|拉伸强度)/i.test(upperStr) || upperStr.includes('抗拉强度')) {
      return {
        raw_property_name: rawName,
        property_key: 'tensile_strength',
        category: 'mechanical',
        display_name: '抗拉强度 (Rm)',
        is_known: true,
      };
    }

    // (b) 屈服强度 / 规定塑性延伸强度 (Yield Strength, Rp0.2, ReH, ReL, YS)
    if (/^(RP02|RP0.2|REH|REL|YS|YIELD|屈服强度|规定塑性延伸强度|规定非比例延伸强度)/i.test(upperStr) || upperStr.includes('屈服强度') || upperStr.includes('RP02')) {
      return {
        raw_property_name: rawName,
        property_key: 'yield_strength_rp02',
        category: 'mechanical',
        display_name: '规定塑性延伸强度 (Rp0.2)',
        is_known: true,
      };
    }

    // (c) 断后伸长率 (Elongation, A, EL, A50)
    if (/^(ELONGATION|EL|A50|A|断后伸长率|伸长率|延伸率)$/i.test(upperStr) || upperStr.includes('伸长率') || upperStr.includes('延伸率')) {
      return {
        raw_property_name: rawName,
        property_key: 'elongation_A',
        category: 'mechanical',
        display_name: '断后伸长率 (A)',
        is_known: true,
      };
    }

    // (d) 硬度 (Hardness, HRB, HBW, HV, HRC)
    if (upperStr.includes('HRB') || upperStr.includes('洛氏')) {
      return {
        raw_property_name: rawName,
        property_key: 'hardness',
        category: 'mechanical',
        display_name: '洛氏硬度 (HRB)',
        sub_property: 'HRB',
        is_known: true,
      };
    }
    if (upperStr.includes('HBW') || upperStr.includes('HBS') || upperStr.includes('布氏')) {
      return {
        raw_property_name: rawName,
        property_key: 'hardness',
        category: 'mechanical',
        display_name: '布氏硬度 (HBW)',
        sub_property: 'HBW',
        is_known: true,
      };
    }
    if (upperStr.includes('HV') || upperStr.includes('维氏')) {
      return {
        raw_property_name: rawName,
        property_key: 'hardness',
        category: 'mechanical',
        display_name: '维氏硬度 (HV)',
        sub_property: 'HV',
        is_known: true,
      };
    }
    if (upperStr.includes('硬度') || upperStr.includes('HARDNESS')) {
      return {
        raw_property_name: rawName,
        property_key: 'hardness',
        category: 'mechanical',
        display_name: '硬度 (Hardness)',
        is_known: true,
      };
    }

    // (e) 冲击功 (Impact Absorbed Energy, AKV, KV2)
    if (upperStr.includes('冲击') || upperStr.includes('AKV') || upperStr.includes('CHARPY')) {
      return {
        raw_property_name: rawName,
        property_key: 'impact_absorbed_energy',
        category: 'mechanical',
        display_name: '冲击吸收能量 (KV2)',
        is_known: true,
      };
    }

    // 3. 工艺性能判定
    if (upperStr.includes('压扁') || upperStr.includes('FLATTENING')) {
      return {
        raw_property_name: rawName,
        property_key: 'flattening_test',
        category: 'process',
        display_name: '压扁试验',
        is_known: true,
      };
    }
    if (upperStr.includes('扩口') || upperStr.includes('FLARING')) {
      return {
        raw_property_name: rawName,
        property_key: 'flaring_test',
        category: 'process',
        display_name: '扩口试验',
        is_known: true,
      };
    }
    if (upperStr.includes('弯曲') || upperStr.includes('BENDING')) {
      return {
        raw_property_name: rawName,
        property_key: 'bending_test',
        category: 'process',
        display_name: '弯曲试验',
        is_known: true,
      };
    }

    // 4. 金相组织与晶粒度
    if (upperStr.includes('晶粒度') || upperStr.includes('GRAINSIZE')) {
      return {
        raw_property_name: rawName,
        property_key: 'grain_size',
        category: 'metallographic',
        display_name: '奥氏体晶粒度',
        is_known: true,
      };
    }

    // 5. 耐腐蚀性能
    if (upperStr.includes('晶间腐蚀') || upperStr.includes('晶腐') || upperStr.includes('IGC') || upperStr.includes('CORROSION')) {
      return {
        raw_property_name: rawName,
        property_key: 'intergranular_corrosion',
        category: 'corrosion',
        display_name: '晶间腐蚀试验 (E法)',
        is_known: true,
      };
    }

    // 6. 无损检测 (NDT)
    if (upperStr.includes('涡流') || upperStr.includes('EDDY') || upperStr === 'ET') {
      return {
        raw_property_name: rawName,
        property_key: 'eddy_current_test',
        category: 'ndt',
        display_name: '涡流探伤 (ET)',
        is_known: true,
      };
    }
    if (upperStr.includes('超声') || upperStr.includes('ULTRASONIC') || upperStr === 'UT') {
      return {
        raw_property_name: rawName,
        property_key: 'ultrasonic_test',
        category: 'ndt',
        display_name: '超声波探伤 (UT)',
        is_known: true,
      };
    }
    if (upperStr.includes('水压') || upperStr.includes('液压') || upperStr.includes('HYDROSTATIC')) {
      return {
        raw_property_name: rawName,
        property_key: 'hydraulic_test',
        category: 'ndt',
        display_name: '液压(水压)试验',
        is_known: true,
      };
    }

    // 7. 兜底为其他类别
    const fallbackCat: RuleCategory = (rawCategoryHint as RuleCategory) || 'other';
    return {
      raw_property_name: rawName,
      property_key: rawName.trim().toLowerCase().replace(/[\s\-]/g, '_'),
      category: fallbackCat,
      display_name: rawName,
      is_known: false,
    };
  }
}
