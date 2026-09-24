import fs from 'node:fs';
import path from 'node:path';
import {
  SpecificationSlice,
  SpecificationSliceSchema,
  StandardMeta,
  StandardRuleSet,
  StandardRuleSetSchema,
  StandardClause,
  GradeRule,
  EvaluationRule,
} from '../schemas/standard.schema';
import { IRuleStore, StandardOverview } from './rule-store.interface';
import { logger } from '../logger';
import { PerformanceProfiler } from '../logger/profiler';
import {
  CompositeSlice,
  composeMultiStandardSlices,
  SliceWithStandardMeta,
} from '../engine/multi-standard-composer';

interface StandardEntry {
  meta: StandardMeta;
  slices: Map<string, SpecificationSlice>; // routingKey -> slice
  uniqueSlices: SpecificationSlice[];
  clauses?: StandardClause[];
}

export class FileRuleStore implements IRuleStore {
  private baseDir: string;
  // 规范化标准 ID -> 标准条目 (唯一主键)
  private standardsMap: Map<string, StandardEntry> = new Map();
  // 别名/目录名/无点号变体 -> 规范化标准 ID (用于别名路由解析)
  private standardAliasesMap: Map<string, string> = new Map();
  private initialized = false;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), 'data/standards');
  }

  /**
   * 确保内存倒排索引已构建
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.reload();
    }
  }

  /**
   * 标准代号归一化 (如 'GB/T 13296-2023' -> 'GBT132962023')
   */
  public normalizeStandardId(id: string): string {
    return id.toUpperCase().replace(/[\s\-_/\\]/g, '');
  }

  /**
   * 规格别名归一化 (如 'tp-304' -> 'TP304', 'TP316L (UNS S31603)' -> 'TP316L')
   */
  public normalizeRoutingKey(key: string): string {
    const cleaned = key
      .replace(/\s*[(（][^()（）]*[)）]/g, '')
      .trim();
    return cleaned.toUpperCase().replace(/[\s\-_]/g, '');
  }

  /**
   * 根据标准代号或别名（支持带/不带点号、下划线目录名等变体）解析标准条目
   */
  private getStandardEntry(standardId: string): StandardEntry | undefined {
    const norm = this.normalizeStandardId(standardId);
    let entry = this.standardsMap.get(norm);
    if (entry) return entry;

    const canonicalId = this.standardAliasesMap.get(norm);
    if (canonicalId) {
      entry = this.standardsMap.get(canonicalId);
      if (entry) return entry;
    }

    const dotless = norm.replace(/\./g, '');
    entry = this.standardsMap.get(dotless);
    if (entry) return entry;

    const dotlessCanonical = this.standardAliasesMap.get(dotless);
    if (dotlessCanonical) {
      return this.standardsMap.get(dotlessCanonical);
    }

    return undefined;
  }

  /**
   * 扫描文件系统，构建内存倒排索引
   */
  public async reload(): Promise<void> {
    await PerformanceProfiler.profileAsync('REPOSITORY', '构建标准规则库内存倒排索引', async () => {
      this.standardsMap.clear();
      this.standardAliasesMap.clear();

      if (!fs.existsSync(this.baseDir)) {
        this.initialized = true;
        logger.warn('REPOSITORY', `标准库根目录不存在: ${this.baseDir}`);
        return;
      }

      const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(this.baseDir, entry.name);

        if (entry.isDirectory()) {
          // 模块化切片目录结构 (data/standards/GB_T_13296_2023/)
          await this.loadModularStandard(fullPath);
        } else if (
          entry.isFile() &&
          entry.name.endsWith('.json') &&
          !entry.name.includes('alias') &&
          !entry.name.startsWith('test_')
        ) {
          // 单体 JSON 兼容模式 (data/standards/GB_T_13296_2023.json)
          await this.loadMonolithicStandard(fullPath);
        }
      }

      this.initialized = true;
      let totalSlices = 0;
      for (const entry of this.standardsMap.values()) {
        totalSlices += entry.uniqueSlices.length;
      }
      logger.info('REPOSITORY', `规则仓库就绪，已装载 ${this.standardsMap.size} 部标准、共计 ${totalSlices} 个规格切片`);
    }, logger);
  }

  private async loadModularStandard(dirPath: string): Promise<void> {
    const metaPath = path.join(dirPath, 'meta.json');
    if (!fs.existsSync(metaPath)) return;

    try {
      const metaContent = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const stdId = metaContent.standard_code || metaContent.standard_id;
      const stdName = metaContent.title || metaContent.standard_name || stdId;
      if (!stdId) return;

      const meta: StandardMeta = {
        standard_id: stdId,
        standard_name: stdName,
        version: metaContent.publication_year || metaContent.version,
        description: metaContent.description,
        status: metaContent.status === 'WITHDRAWN' ? 'WITHDRAWN' : 'CURRENT',
        material_category: metaContent.material_category,
        applies_to_forms: metaContent.applies_to_forms || [],
        tolerance_tables: metaContent.tolerance_tables,
      };
      const normStdId = this.normalizeStandardId(meta.standard_id);

      const slicesMap = new Map<string, SpecificationSlice>();
      const uniqueSlices: SpecificationSlice[] = [];

      // 1. 新 RASE 拓扑模式：rules.json + indices/grade_index.json
      const rulesPath = path.join(dirPath, 'rules.json');
      const gradeIndexPath = path.join(dirPath, 'indices', 'grade_index.json');

      if (fs.existsSync(rulesPath) && fs.existsSync(gradeIndexPath)) {
        try {
          const rulesList = JSON.parse(fs.readFileSync(rulesPath, 'utf8')) as any[];
          const ruleMap = new Map<string, any>();
          for (const r of rulesList) {
            if (r.rule_id) ruleMap.set(r.rule_id, r);
          }

          const gradeIndex = JSON.parse(fs.readFileSync(gradeIndexPath, 'utf8')) as Record<string, string[]>;
          const gradesMeta = Array.isArray(metaContent.grades) ? metaContent.grades : [];

          // 依据牌号元数据与倒排索引装配切片
          for (const [gradeKey, ruleIds] of Object.entries(gradeIndex)) {
            const gMeta = gradesMeta.find((g: any) => g.spec_key === gradeKey || g.primary_grade === gradeKey || g.unified_code === gradeKey) || {
              spec_key: gradeKey,
              primary_grade: gradeKey,
              unified_code: gradeKey,
              aliases: [],
            };

            const evalRules: EvaluationRule[] = [];
            for (const rid of ruleIds) {
              const rase = ruleMap.get(rid);
              if (!rase) continue;
              evalRules.push(this.convertRaseRuleToEvaluationRule(rase, meta.standard_id));
            }

            const slice: SpecificationSlice = {
              spec_key: gMeta.spec_key || gradeKey,
              spec_type: 'grade',
              display_name: `${gMeta.primary_grade || gradeKey}${gMeta.unified_code && gMeta.unified_code !== gMeta.primary_grade ? ` (${gMeta.unified_code})` : ''}`,
              primary_grade: gMeta.primary_grade || gradeKey,
              unified_code: gMeta.unified_code || gradeKey,
              standard_code: meta.standard_id,
              structure_type: gMeta.structure_type,
              aliases: gMeta.aliases || [],
              evaluation_rules: evalRules,
            };

            uniqueSlices.push(slice);
            this.indexSlice(slicesMap, slice);
          }
        } catch (e) {
          logger.warn('REPOSITORY', `装载 RASE 拓扑规则异常 [${dirPath}]: ${e instanceof Error ? e.stack : String(e)}`);
        }
      }

      // 2. 兼容历史 slices/ 目录切片
      const slicesDir = path.join(dirPath, 'slices');
      if (fs.existsSync(slicesDir)) {
        const sliceFiles = fs.readdirSync(slicesDir).filter(f => f.endsWith('.json'));

        for (const sf of sliceFiles) {
          const slicePath = path.join(slicesDir, sf);
          const sliceContent = JSON.parse(fs.readFileSync(slicePath, 'utf8'));
          const slice = SpecificationSliceSchema.parse(sliceContent);

          uniqueSlices.push(slice);
          this.indexSlice(slicesMap, slice);
        }
      }

      let clauses: StandardClause[] | undefined = undefined;
      const clausesTreePath = path.join(dirPath, 'clauses_tree.json');
      const clausesPath = path.join(dirPath, 'clauses.json');
      if (fs.existsSync(clausesTreePath)) {
        try {
          const rawTree = JSON.parse(fs.readFileSync(clausesTreePath, 'utf8'));
          const flatList: StandardClause[] = [];
          const recurse = (nodes: any[]) => {
            for (const node of nodes) {
              if (node.clause_id && (node.text || node.title)) {
                flatList.push({
                  clause_id: String(node.clause_id),
                  title: String(node.title || node.clause_id),
                  text: String(node.text || ''),
                });
              }
              if (Array.isArray(node.children)) recurse(node.children);
            }
          };
          if (Array.isArray(rawTree)) recurse(rawTree);
          clauses = flatList;
        } catch (e) {
          logger.warn('REPOSITORY', `读取 clauses_tree.json 异常: ${clausesTreePath}`, { error: String(e) });
        }
      } else if (fs.existsSync(clausesPath)) {
        try {
          clauses = JSON.parse(fs.readFileSync(clausesPath, 'utf8'));
        } catch (e) {
          logger.warn('REPOSITORY', `读取条款文件异常: ${clausesPath}`, { error: String(e) });
        }
      }

      const entry = {
        meta,
        slices: slicesMap,
        uniqueSlices,
        clauses,
      };

      this.standardsMap.set(normStdId, entry);

      // 防御性别名映射：若文件夹名称或无点号变体与标准代号不同，一并建立别名映射
      const folderNorm = this.normalizeStandardId(path.basename(dirPath));
      if (folderNorm && folderNorm !== normStdId) {
        this.standardAliasesMap.set(folderNorm, normStdId);
      }
      const dotlessNorm = normStdId.replace(/\./g, '');
      if (dotlessNorm && dotlessNorm !== normStdId) {
        this.standardAliasesMap.set(dotlessNorm, normStdId);
      }
    } catch (err) {
      logger.error('REPOSITORY', `[FileRuleStore] 加载模块化标准失败: ${dirPath}`, err);
    }
  }

  /**
   * 将标准管线点分数据元 ID 投影为系统通用 property_key
   */
  private mapDataElementToPropertyKey(dataElementId: string): string {
    if (!dataElementId) return '';
    if (dataElementId.startsWith('chem.element.')) {
      return dataElementId.substring('chem.element.'.length);
    }
    switch (dataElementId) {
      case 'mech.tensile_strength.Rm': return 'tensile_strength';
      case 'mech.yield_strength.Rp02': return 'yield_strength_rp02';
      case 'mech.elongation.A': return 'elongation_A';
      case 'mech.hardness.HBW':
      case 'mech.hardness.HRB':
      case 'mech.hardness.HV':
        return 'hardness';
      case 'test.flattening': return 'flattening_test';
      case 'test.flaring': return 'flaring_test';
      case 'test.bending': return 'bending_test';
      case 'test.hydrostatic': return 'hydraulic_test';
      case 'test.eddy_current': return 'eddy_current_test';
      case 'test.pressure_tightness': return 'pressure_tightness';
      case 'test.ultrasonic': return 'ultrasonic_test';
      case 'test.intergranular_corrosion': return 'intergranular_corrosion';
      case 'test.grain_size': return 'grain_size';
      case 'test.surface_quality': return 'surface_quality';
      case 'process.surface_roughness': return 'surface_roughness';
      default: return dataElementId;
    }
  }

  /**
   * 获取规范的用户界面与报告简明展示名称
   */
  private getStandardDisplayName(propertyKey: string, dataElementId?: string, rawDesc?: string): string {
    const nameMap: Record<string, string> = {
      'tensile_strength': '抗拉强度 (Rm)',
      'yield_strength_rp02': '规定塑性延伸强度 (Rp0.2)',
      'elongation_A': '断后伸长率 (A)',
      'hardness': '硬度试验',
      'flattening_test': '压扁试验',
      'flaring_test': '扩口试验',
      'bending_test': '弯曲试验',
      'hydraulic_test': '液压试验',
      'eddy_current_test': '涡流检测',
      'pressure_tightness': '承压/致密性检验',
      'ultrasonic_test': '超声检测',
      'intergranular_corrosion': '晶间腐蚀试验',
      'grain_size': '晶粒度级别',
      'surface_quality': '表面质量',
      'surface_roughness': '表面粗糙度',
    };
    if (nameMap[propertyKey]) return nameMap[propertyKey];
    if (dataElementId && dataElementId.startsWith('chem.element.')) {
      const el = dataElementId.substring('chem.element.'.length);
      return `${el}含量 (${el})`;
    }
    return rawDesc || propertyKey;
  }

  /**
   * 将 RASE 分类投影为系统标准技术大类
   */
  private mapCategory(cat?: string, dataElementId?: string): string {
    if (!cat) return 'other';
    if (cat === 'chemical') return 'chemical';
    if (cat === 'mechanical') return 'mechanical';
    if (cat === 'dimensional') return 'geometric';
    if (cat === 'process') return 'process';
    if (cat === 'test') {
      if (dataElementId?.startsWith('test.hydrostatic') || dataElementId?.startsWith('test.eddy') || dataElementId?.startsWith('test.ultrasonic')) {
        return 'ndt';
      }
      if (dataElementId?.startsWith('test.intergranular')) {
        return 'corrosion';
      }
      if (dataElementId?.startsWith('test.grain')) {
        return 'metallographic';
      }
      if (dataElementId?.startsWith('test.surface') || dataElementId?.includes('roughness')) {
        return 'surface';
      }
      return 'process';
    }
    return cat;
  }

  /**
   * 将原子 RASE 规则平滑投影为 EvaluationRule 结构以兼容现有流水线
   */
  private convertRaseRuleToEvaluationRule(rase: any, standardId?: string): EvaluationRule {
    const op = rase.requirement?.operator;
    const val = rase.requirement?.value;
    const unit = rase.requirement?.unit || '';

    let rule_type: any = 'numeric_range';
    let criteria: Record<string, any> = { unit };

    if (op === '<=' || op === '<') {
      criteria.max = val;
      criteria.max_inclusive = op === '<=';
    } else if (op === '>=' || op === '>') {
      criteria.min = val;
      criteria.min_inclusive = op === '>=';
    } else if (op === 'between' && Array.isArray(val)) {
      criteria.min = val[0];
      criteria.max = val[1];
    } else if (op === '==' || op === 'in' || op === 'contains') {
      rule_type = 'qualitative_enum';
      criteria.expected = String(val);
    }

    const dataElementId = rase.selection?.data_element_id || rase.rule_id;
    const propertyKey = this.mapDataElementToPropertyKey(dataElementId);
    const category = this.mapCategory(rase.selection?.category, dataElementId);
    const isNB = (standardId && standardId.includes('NB')) || rase.rule_id.includes('NB') || rase.requirement?.description?.includes('NB/T') || rase.clause_ref?.includes('NB');

    if (rase.requirement?.rounding_decimals !== undefined) {
      criteria.rounding_decimals = rase.requirement.rounding_decimals;
    } else if (isNB && category === 'mechanical' && (propertyKey === 'tensile_strength' || propertyKey === 'yield_strength_rp02')) {
      criteria.rounding_decimals = 0;
    }

    // 动态跨字段公式 (例如 Ti: 4 * (C + N))
    if (rase.requirement?.formula) {
      rule_type = 'dynamic_expression';
      let normFormula = rase.requirement.formula;
      normFormula = normFormula.replace(/chem\.element\.([A-Za-z0-9]+)/g, 'ctx.chemical.$1');
      criteria.formula_min = normFormula;
      if (typeof val === 'number') {
        criteria.max = val;
      }
    }

    // 豁免规则识别 (例如 07Cr19Ni11Ti 晶间腐蚀免做)
    let requirement_level: any = rase.conformance_level === 'OPTIONAL' ? 'OPTIONAL_AGREED' : 'MANDATORY';
    if (rase.rule_id.endsWith('_EXEMPT') || rase.requirement?.description?.includes('豁免')) {
      rule_type = 'exemption';
      requirement_level = 'EXEMPT';
      criteria.reason = rase.requirement?.description || '标准明确免做项';
    }

    // 前置几何/工艺触发条件推导 (例如壁厚 >= 1.7mm 触发硬度，焊接工艺触发接头反弯)
    let trigger_condition: string | undefined;
    if (Array.isArray(rase.applicability)) {
      const conds: string[] = [];
      for (const app of rase.applicability) {
        if (app.field === 'product.wall_thickness' || app.field === 'wall_thickness') {
          conds.push(`ctx.header.dimensions.wall_thickness_mm ${app.operator} ${app.value}`);
        } else if (app.field === 'product.outer_diameter' || app.field === 'outer_diameter') {
          conds.push(`ctx.header.dimensions.outer_diameter_mm ${app.operator} ${app.value}`);
        } else if (app.field === 'product.manufacturing_process' || app.field === 'manufacturing_process') {
          conds.push(`ctx.header.manufacturing_process ${app.operator} '${app.value}'`);
        } else if (app.field === 'product.material_form' || app.field === 'material_form') {
          conds.push(`ctx.header.material_form ${app.operator} '${app.value}'`);
        }
      }
      if (conds.length > 0) {
        trigger_condition = conds.join(' && ');
      }
    }

    // 承压/致密性替代组识别
    if (dataElementId === 'test.pressure_tightness' || propertyKey === 'pressure_tightness') {
      rule_type = 'alternative_group';
      const isNB = (standardId && standardId.includes('NB')) || rase.rule_id.includes('NB') || rase.requirement?.description?.includes('NB/T') || rase.clause_ref?.includes('NB');
      criteria = {
        group_logic: 'AT_LEAST_ONE_PASS',
        candidates: [
          {
            candidate_key: 'hydraulic_test',
            display_name: '液压试验',
            test_standard: 'GB/T 241',
          },
          {
            candidate_key: 'eddy_current_test',
            display_name: '涡流检测',
            required_level: isNB ? 'E2H' : 'E3H',
            test_standard: 'GB/T 7735-2016',
          },
        ],
      };
    }

    const displayName = this.getStandardDisplayName(propertyKey, dataElementId, rase.requirement?.description);

    let subProperty: string | undefined;
    if (dataElementId?.startsWith('mech.hardness.')) {
      subProperty = dataElementId.substring('mech.hardness.'.length);
      criteria['sub_property'] = subProperty;
    }

    return {
      rule_id: rase.rule_id,
      category,
      property_key: propertyKey,
      sub_property: subProperty,
      display_name: displayName,
      rule_type,
      requirement_level,
      trigger_condition,
      criteria,
      selection: rase.selection,
      applicability: rase.applicability,
      requirement: rase.requirement,
      group: rase.group,
    } as any;
  }

  private async loadMonolithicStandard(filePath: string): Promise<void> {
    try {
      const fileText = fs.readFileSync(filePath, 'utf8');
      const content = JSON.parse(fileText);
      if (!content || typeof content !== 'object' || Array.isArray(content) || !content.standard_meta) {
        return;
      }
      const ruleSet = StandardRuleSetSchema.parse(content);
      const meta = ruleSet.standard_meta;
      const normStdId = this.normalizeStandardId(meta.standard_id);

      // 如果已有模块化加载，优先使用模块化
      if (this.getStandardEntry(normStdId)) return;

      const slicesMap = new Map<string, SpecificationSlice>();
      const uniqueSlices: SpecificationSlice[] = [];

      // 1. 如果包含 slices
      if (ruleSet.slices && ruleSet.slices.length > 0) {
        for (const slice of ruleSet.slices) {
          uniqueSlices.push(slice);
          this.indexSlice(slicesMap, slice);
        }
      }

      // 2. 如果包含旧版 grade_rules，自动适配转为 SpecificationSlice
      if (ruleSet.grade_rules && ruleSet.grade_rules.length > 0) {
        for (const gr of ruleSet.grade_rules) {
          const adaptedSlice: SpecificationSlice = {
            spec_key: gr.grade_info.unified_code || gr.grade_info.primary_grade,
            spec_type: 'grade',
            display_name: gr.grade_info.unified_code
              ? `${gr.grade_info.primary_grade} (${gr.grade_info.unified_code})`
              : gr.grade_info.primary_grade,
            primary_grade: gr.grade_info.primary_grade,
            unified_code: gr.grade_info.unified_code,
            standard_code: gr.grade_info.standard_code,
            structure_type: gr.grade_info.structure_type,
            aliases: gr.grade_info.aliases || [],
            description: gr.description,
            applicability_scope: gr.applicability_scope,
            evaluation_rules: gr.evaluation_rules,
          };
          uniqueSlices.push(adaptedSlice);
          this.indexSlice(slicesMap, adaptedSlice);
        }
      }

      this.standardsMap.set(normStdId, {
        meta,
        slices: slicesMap,
        uniqueSlices,
      });

      const dotlessNorm = normStdId.replace(/\./g, '');
      if (dotlessNorm && dotlessNorm !== normStdId) {
        this.standardAliasesMap.set(dotlessNorm, normStdId);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('REPOSITORY', `[FileRuleStore] 跳过非标准文件或解析异常: ${filePath} (${errMsg})`);
    }
  }

  /**
   * 将切片的主键、牌号、统一代号、别名等全部加入内存倒排索引
   */
  private indexSlice(slicesMap: Map<string, SpecificationSlice>, slice: SpecificationSlice): void {
    const keysToIndex = new Set<string>();

    if (slice.spec_key) keysToIndex.add(slice.spec_key);
    if (slice.primary_grade) keysToIndex.add(slice.primary_grade);
    if (slice.unified_code) keysToIndex.add(slice.unified_code);
    if (slice.standard_code) keysToIndex.add(slice.standard_code);
    if (slice.display_name) keysToIndex.add(slice.display_name);

    if (slice.aliases) {
      for (const a of slice.aliases) {
        keysToIndex.add(a);
      }
    }

    for (const k of keysToIndex) {
      const rawNorm = k.toUpperCase().replace(/[\s\-_]/g, '');
      if (rawNorm) slicesMap.set(rawNorm, slice);

      const cleanedNorm = this.normalizeRoutingKey(k);
      if (cleanedNorm) slicesMap.set(cleanedNorm, slice);

      // 若自身带有括号 (如 022Cr17Ni12Mo2 (S31603) 或 TP316L (UNS S31603))，将括号内提取项也单独索引
      const bracketMatch = k.match(/[(（]([^()（）]+)[)）]/);
      if (bracketMatch && bracketMatch[1]) {
        const innerClean = bracketMatch[1].replace(/UNS\s*/i, '').trim();
        const innerNorm = innerClean.toUpperCase().replace(/[\s\-_]/g, '');
        if (innerNorm) slicesMap.set(innerNorm, slice);
      }
    }
  }

  public async resolveRuleSlice(standardId: string, routingKey: string): Promise<SpecificationSlice | undefined> {
    await this.ensureInitialized();
    const standardEntry = this.getStandardEntry(standardId);
    if (!standardEntry) {
      logger.debug('REPOSITORY', `未找到标准代号: [${standardId}]`);
      return undefined;
    }

    // 1. 尝试使用清洗后的主键匹配 (已剔除括号与外围说明)
    const normKey = this.normalizeRoutingKey(routingKey);
    let slice = standardEntry.slices.get(normKey);

    // 2. 若未命中且原始 key 中包含括号 (如 'TP316L (UNS S31603)')，尝试使用括号内部提取的内容匹配
    if (!slice) {
      const bracketMatch = routingKey.match(/[(（]([^()（）]+)[)）]/);
      if (bracketMatch && bracketMatch[1]) {
        const innerClean = bracketMatch[1].replace(/UNS\s*/i, '').trim();
        const innerNorm = innerClean.toUpperCase().replace(/[\s\-_]/g, '');
        slice = standardEntry.slices.get(innerNorm);
      }
    }

    // 3. 若仍未命中，尝试原始直通 (纯大写去空格)
    if (!slice) {
      const rawKey = routingKey.toUpperCase().replace(/[\s\-_]/g, '');
      slice = standardEntry.slices.get(rawKey);
    }

    if (slice) {
      logger.debug('REPOSITORY', `倒排索引精准命中规格切片: [${standardId}] -> 路由键 [${routingKey}] 映射至 [${slice.spec_key}]`);
    } else {
      logger.debug('REPOSITORY', `标准 [${standardId}] 内部未找到规格切片路由键: [${routingKey}]`);
    }
    return slice;
  }

  public async resolveCompositeSlice(
    standardIds: string[],
    routingKey: string
  ): Promise<CompositeSlice | undefined> {
    await this.ensureInitialized();
    if (!standardIds || standardIds.length === 0) return undefined;

    const slicesWithMeta: SliceWithStandardMeta[] = [];
    const missingStandards: string[] = [];

    for (const stdId of standardIds) {
      const slice = await this.resolveRuleSlice(stdId, routingKey);
      if (slice) {
        const meta = await this.getStandardMeta(stdId);
        slicesWithMeta.push({
          slice,
          standardId: stdId,
          standardName: meta?.standard_name,
        });
      } else {
        missingStandards.push(stdId);
      }
    }

    // 严格质量红线：若参与的标准中任意一部未能匹配切片，严禁静默丢弃，返回 undefined 交由流程显式阻断
    if (missingStandards.length > 0) {
      logger.warn('REPOSITORY', `标准 [${missingStandards.join(', ')}] 未能命中规格切片 [${routingKey}]，中止静默降级`);
      return undefined;
    }

    if (slicesWithMeta.length === 0) {
      logger.warn('REPOSITORY', `多标准检索未命中任何切片: [${standardIds.join(', ')}] -> [${routingKey}]`);
      return undefined;
    }

    return composeMultiStandardSlices(slicesWithMeta);
  }

  public async getStandardMeta(standardId: string): Promise<StandardMeta | undefined> {
    await this.ensureInitialized();
    return this.getStandardEntry(standardId)?.meta;
  }

  public async getCompleteStandard(standardId: string): Promise<StandardRuleSet | undefined> {
    await this.ensureInitialized();
    const standardEntry = this.getStandardEntry(standardId);
    if (!standardEntry) return undefined;

    // 转换切片为兼容的 grade_rules
    const gradeRules: GradeRule[] = standardEntry.uniqueSlices.map(s => ({
      grade_info: {
        primary_grade: s.primary_grade || s.spec_key,
        unified_code: s.unified_code,
        standard_code: s.standard_code,
        structure_type: s.structure_type,
        aliases: s.aliases,
      },
      description: s.description,
      applicability_scope: s.applicability_scope,
      evaluation_rules: s.evaluation_rules,
    }));

    return {
      standard_meta: standardEntry.meta,
      grade_rules: gradeRules,
      slices: standardEntry.uniqueSlices,
      clauses: standardEntry.clauses,
    };
  }

  public async listAvailableStandards(): Promise<StandardOverview[]> {
    await this.ensureInitialized();
    const result: StandardOverview[] = [];
    const seenStandardIds = new Set<string>();

    for (const entry of this.standardsMap.values()) {
      if (seenStandardIds.has(entry.meta.standard_id)) continue;
      seenStandardIds.add(entry.meta.standard_id);

      result.push({
        standard_id: entry.meta.standard_id,
        standard_name: entry.meta.standard_name,
        version: entry.meta.version,
        status: entry.meta.status,
        slice_count: entry.uniqueSlices.length,
        available_slices: entry.uniqueSlices.map(s => s.spec_key),
        slice_details: entry.uniqueSlices.map(s => ({
          spec_key: s.spec_key,
          primary_grade: s.primary_grade || s.spec_key,
          unified_code: s.unified_code,
          display_name: s.display_name || `${s.primary_grade || s.spec_key}${s.unified_code ? ` (${s.unified_code})` : ''}`,
          aliases: s.aliases || [],
        })),
      });
    }

    return result;
  }
}
