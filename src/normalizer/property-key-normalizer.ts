import fs from 'fs';
import path from 'path';
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
  /** 是否属于非标安全沙箱项 (未命中已知规则，需隔离不参与判废) */
  is_sandbox?: boolean;
  /** 是否由质检员人工确认沉淀的动态自学习别名 */
  is_learned?: boolean;
}

export interface NormalizationContext {
  /** 实测原始值或文本 (如 '0.33', 0.33, '合格') */
  measuredRaw?: unknown;
  /** 量纲单位 (如 'μm', 'MPa', '%', 'J') */
  unit?: string | null;
}

/** 动态自学习别名字典条目 */
export interface LearnedAliasEntry {
  id?: string;
  raw_alias: string;
  property_key: string;
  category: RuleCategory;
  display_name?: string;
  learned_at?: string;
  source?: 'human_confirmed' | 'llm_auto_promoted';
  source_cert_no?: string;
  status?: 'active' | 'revoked';
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
 * 本类利用规则匹配、智能模式识别与质检员经验自学习机制，将所有异构名称映射为系统统一的 property_key 与 category。
 * ============================================================================
 */
export class PropertyKeyNormalizer {
  /** 动态自学习别名内存倒排索引表 (键为大写清洗后的别名) */
  private static learnedAliasesMap: Map<string, LearnedAliasEntry> = new Map();
  private static isInitialized: boolean = false;
  private static customStoragePath?: string;

  /** 常见化学元素符号集合 */
  private static readonly CHEMICAL_ELEMENTS: Record<string, string> = {
    'C': '碳', 'SI': '硅', 'MN': '锰', 'P': '磷', 'S': '硫',
    'NI': '镍', 'CR': '铬', 'MO': '钼', 'CU': '铜', 'N': '氮',
    'TI': '钛', 'NB': '铌', 'AL': '铝', 'V': '钒', 'W': '钨',
    'B': '硼', 'CO': '钴', 'FE': '铁', 'PB': '铅', 'SN': '锡',
  };

  /**
   * 初始化加载本地已学习的别名规则库
   */
  public static initLearnedAliases(customPath?: string): void {
    if (customPath) {
      this.customStoragePath = customPath;
    } else {
      this.customStoragePath = undefined;
    }
    this.learnedAliasesMap.clear();
    const filePath = this.customStoragePath || path.resolve(process.cwd(), 'data/standards/user_learned_aliases.json');
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.raw_alias && item.property_key) {
              const cleanKey = item.raw_alias.toUpperCase().replace(/[\s\-_/():（）\[\]]/g, '');
              const entry: LearnedAliasEntry = {
                ...item,
                id: item.id || `alias_${Buffer.from(cleanKey).toString('hex').substring(0, 12)}`,
                status: item.status || 'active',
              };
              this.learnedAliasesMap.set(cleanKey, entry);
            }
          }
        }
      }
    } catch {
      // 防御性静默，确保文件异常不崩溃主核验链路
    }
    this.isInitialized = true;
  }

  /**
   * 注册并持久化新的自学习别名映射 (质检员经验沉淀回流)
   */
  public static registerLearnedAlias(
    rawAlias: string,
    targetPropertyKey: string,
    category?: RuleCategory,
    displayName?: string,
    persist: boolean = true,
    sourceCertNo?: string
  ): LearnedAliasEntry {
    if (!this.isInitialized) {
      this.initLearnedAliases();
    }

    const cleanKey = rawAlias.toUpperCase().replace(/[\s\-_/():（）\[\]]/g, '');
    const inferredCategory = category || this.inferCategoryFromPropertyKey(targetPropertyKey);
    const existing = this.learnedAliasesMap.get(cleanKey);
    const entry: LearnedAliasEntry = {
      id: existing?.id || `alias_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      raw_alias: rawAlias,
      property_key: targetPropertyKey,
      category: inferredCategory,
      display_name: displayName || targetPropertyKey,
      learned_at: new Date().toISOString(),
      source: 'human_confirmed',
      source_cert_no: sourceCertNo || existing?.source_cert_no,
      status: 'active',
    };

    this.learnedAliasesMap.set(cleanKey, entry);

    if (persist) {
      this.saveLearnedAliasesToFile();
    }

    return entry;
  }

  /**
   * 获取所有已沉淀自学习别名（用于白盒化审阅与管理）
   */
  public static listAllLearnedAliases(): LearnedAliasEntry[] {
    if (!this.isInitialized) {
      this.initLearnedAliases();
    }
    return Array.from(this.learnedAliasesMap.values());
  }

  /**
   * 撤销指定的已学习别名（软撤销，状态变为 revoked，不参与 Tier 1 判定）
   */
  public static revokeLearnedAlias(idOrAlias: string): boolean {
    if (!this.isInitialized) {
      this.initLearnedAliases();
    }
    for (const [cleanKey, item] of this.learnedAliasesMap.entries()) {
      if (item.id === idOrAlias || item.raw_alias === idOrAlias || cleanKey === idOrAlias.toUpperCase().replace(/[\s\-_/():（）\[\]]/g, '')) {
        item.status = 'revoked';
        this.learnedAliasesMap.set(cleanKey, item);
        this.saveLearnedAliasesToFile();
        return true;
      }
    }
    return false;
  }

  /**
   * 恢复被撤销的已学习别名（重新激活为 active）
   */
  public static restoreLearnedAlias(idOrAlias: string): boolean {
    if (!this.isInitialized) {
      this.initLearnedAliases();
    }
    for (const [cleanKey, item] of this.learnedAliasesMap.entries()) {
      if (item.id === idOrAlias || item.raw_alias === idOrAlias || cleanKey === idOrAlias.toUpperCase().replace(/[\s\-_/():（）\[\]]/g, '')) {
        item.status = 'active';
        this.learnedAliasesMap.set(cleanKey, item);
        this.saveLearnedAliasesToFile();
        return true;
      }
    }
    return false;
  }

  /**
   * 物理删除指定的自学习别名记录
   */
  public static deleteLearnedAlias(idOrAlias: string): boolean {
    if (!this.isInitialized) {
      this.initLearnedAliases();
    }
    for (const [cleanKey, item] of this.learnedAliasesMap.entries()) {
      if (item.id === idOrAlias || item.raw_alias === idOrAlias || cleanKey === idOrAlias.toUpperCase().replace(/[\s\-_/():（）\[\]]/g, '')) {
        this.learnedAliasesMap.delete(cleanKey);
        this.saveLearnedAliasesToFile();
        return true;
      }
    }
    return false;
  }

  /**
   * 清空当前学习到的别名 (用于单元测试隔离)
   */
  public static clearLearnedAliases(): void {
    this.learnedAliasesMap.clear();
    this.isInitialized = true;
  }

  /**
   * 将自学习别名异步/安全写入本地持久化文件
   */
  private static saveLearnedAliasesToFile(): void {
    const filePath = this.customStoragePath || path.resolve(process.cwd(), 'data/standards/user_learned_aliases.json');
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.learnedAliasesMap.values());
      fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8');
    } catch {
      // 防御性异常处理
    }
  }

  /**
   * 根据目标 property_key 智能推断检验大类 (RuleCategory)
   */
  private static inferCategoryFromPropertyKey(key: string): RuleCategory {
    const k = key.toLowerCase();
    if (this.CHEMICAL_ELEMENTS[key.toUpperCase()] || ['c', 'si', 'mn', 'p', 's', 'ni', 'cr', 'mo', 'ti', 'nb', 'n', 'cu'].includes(k)) {
      return 'chemical';
    }
    if (k.includes('tensile') || k.includes('yield') || k.includes('elongation') || k.includes('hardness') || k.includes('impact')) {
      return 'mechanical';
    }
    if (k.includes('roughness') || k.includes('surface')) {
      return 'surface';
    }
    if (k.includes('corrosion') || k.includes('intergranular')) {
      return 'corrosion';
    }
    if (k.includes('flattening') || k.includes('flaring') || k.includes('bending')) {
      return 'process';
    }
    if (k.includes('eddy') || k.includes('ultrasonic') || k.includes('ndt') || k.includes('pressure')) {
      return 'ndt';
    }
    if (k.includes('grain') || k.includes('metallographic')) {
      return 'metallographic';
    }
    if (k.includes('dimension') || k.includes('diameter') || k.includes('thickness')) {
      return 'geometric';
    }
    return 'other';
  }

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
   * 
   * @param rawName 原始检验项名称
   * @param rawCategoryHint 可选的大类提示
   * @param context 可选的实测值与量纲上下文 (用于数据类型与量纲感知消歧)
   */
  public static normalize(
    rawName: string,
    rawCategoryHint?: string,
    context?: NormalizationContext
  ): NormalizedPropertyResult {
    const str = rawName.trim();
    // 自动剥离常见工程与视觉标记前缀 (如 geo_surface_quality -> surface_quality, proc_flaring -> flaring)
    const strippedStr = str.replace(/^(geo|proc|ndt|mech|metallo|chem)_/i, '');
    const upperStr = strippedStr.toUpperCase().replace(/[\s\-_/():（）\[\]]/g, '');

    // 0. 优先命中质检员确认沉淀的动态自学习别名字典 (Tier 1 Fast-Path 经验直通)
    if (!this.isInitialized) {
      this.initLearnedAliases();
    }
    const learned = this.learnedAliasesMap.get(upperStr);
    if (learned && learned.status !== 'revoked') {
      return {
        raw_property_name: rawName,
        property_key: learned.property_key,
        category: learned.category,
        display_name: learned.display_name || learned.property_key,
        is_known: true,
        is_learned: true,
      };
    }

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
    if (/^(ELONGATION|EL|A50|A|断后伸长率|伸长率|延伸率)/i.test(upperStr) || upperStr.includes('伸长率') || upperStr.includes('延伸率') || upperStr.includes('ELONGATION')) {
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
    if (upperStr.includes('致密性') || upperStr.includes('承压') || upperStr.includes('PRESSURETIGHTNESS')) {
      return {
        raw_property_name: rawName,
        property_key: 'pressure_tightness',
        category: 'ndt',
        display_name: '承压/致密性检验',
        is_known: true,
      };
    }

    // 7. 表面质量与几何尺寸
    // (a) 表面粗糙度 (特异性优先，定量属性)
    if (
      /^(ROUGHNESS|RA|RZ|RQ|表面粗糙度|粗糙度|光洁度)/i.test(upperStr) ||
      upperStr.includes('粗糙度') ||
      upperStr.includes('ROUGHNESS') ||
      upperStr.includes('光洁度') ||
      upperStr === 'RA' ||
      upperStr === 'RZ'
    ) {
      return {
        raw_property_name: rawName,
        property_key: 'surface_roughness',
        category: 'surface',
        display_name: '表面粗糙度 (Ra/Rz)',
        sub_property: upperStr.includes('RZ') ? 'Rz' : 'Ra',
        is_known: true,
      };
    }

    // (b) 表面外观质量 (定性属性)
    if (upperStr.includes('表面') || upperStr.includes('SURFACE') || upperStr.includes('外观')) {
      // 若伴随量纲或实测纯数值上下文，进行量纲感知纠偏
      if (context) {
        const cleanUnit = (context.unit || '').trim().toLowerCase();
        const isMicroMeter = cleanUnit === 'μm' || cleanUnit === 'um' || cleanUnit === 'nm';
        const isNumericFloat = typeof context.measuredRaw === 'number' ||
          (typeof context.measuredRaw === 'string' && /^[0-9]+(\.[0-9]+)?$/.test(context.measuredRaw.trim()));

        if (isMicroMeter || (isNumericFloat && cleanUnit !== '')) {
          return {
            raw_property_name: rawName,
            property_key: 'surface_roughness',
            category: 'surface',
            display_name: '表面粗糙度 (量纲推断)',
            sub_property: cleanUnit || 'μm',
            is_known: true,
          };
        }
      }

      return {
        raw_property_name: rawName,
        property_key: 'surface_quality',
        category: 'surface',
        display_name: '表面外观质量',
        is_known: true,
      };
    }
    if (upperStr.includes('尺寸') || upperStr.includes('DIMENSION') || upperStr.includes('几何尺寸') || upperStr.includes('外径壁厚')) {
      return {
        raw_property_name: rawName,
        property_key: 'dimensions',
        category: 'geometric',
        display_name: '几何尺寸规格',
        is_known: true,
      };
    }

    // 8. 金相补充项目
    if (upperStr.includes('铁素体') || upperStr.includes('FERRITE')) {
      return {
        raw_property_name: rawName,
        property_key: 'ferrite_content',
        category: 'metallographic',
        display_name: '铁素体含量',
        is_known: true,
      };
    }

    // 9. 兜底为其他类别 / 安全沙箱 (确保 category 必须为合法 RuleCategory 枚举)
    const fallbackCat: RuleCategory = this.normalizeCategoryHint(rawCategoryHint);
    return {
      raw_property_name: rawName,
      property_key: rawName.trim().toLowerCase().replace(/[\s\-]/g, '_'),
      category: fallbackCat,
      display_name: rawName,
      is_known: false,
      is_sandbox: true,
    };
  }

  /**
   * 规范化中英文类别提示为标准系统内部 RuleCategory 枚举
   */
  public static normalizeCategoryHint(hint?: string): RuleCategory {
    if (!hint) return 'other';
    const h = hint.toLowerCase().trim();
    if (h.includes('化') || h.includes('chem')) return 'chemical';
    if (h.includes('力') || h.includes('拉') || h.includes('硬') || h.includes('mech')) return 'mechanical';
    if (h.includes('工') || h.includes('proc')) return 'process';
    if (h.includes('金') || h.includes('相') || h.includes('晶') || h.includes('metall')) return 'metallographic';
    if (h.includes('腐') || h.includes('蚀') || h.includes('corr')) return 'corrosion';
    if (h.includes('损') || h.includes('探') || h.includes('ndt')) return 'ndt';
    if (h.includes('尺') || h.includes('寸') || h.includes('geom')) return 'geometric';
    if (h.includes('表') || h.includes('面') || h.includes('surf')) return 'surface';
    const validCats = ['chemical', 'mechanical', 'process', 'metallographic', 'corrosion', 'ndt', 'geometric', 'surface', 'other'];
    if (validCats.includes(h)) return h as RuleCategory;
    return 'other';
  }
}
