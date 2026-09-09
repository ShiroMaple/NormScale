import fs from 'node:fs';
import path from 'node:path';
import {
  SpecificationSlice,
  SpecificationSliceSchema,
  StandardMeta,
  StandardMetaSchema,
  StandardRuleSet,
  StandardRuleSetSchema,
  StandardClause,
  GradeRule,
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
   * 规格别名归一化 (如 'tp-304' -> 'TP304')
   */
  public normalizeRoutingKey(key: string): string {
    return key.toUpperCase().replace(/[\s\-_]/g, '');
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
      const meta = StandardMetaSchema.parse(metaContent);
      const normStdId = this.normalizeStandardId(meta.standard_id);

      const slicesMap = new Map<string, SpecificationSlice>();
      const uniqueSlices: SpecificationSlice[] = [];

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

      const clausesPath = path.join(dirPath, 'clauses.json');
      let clauses: StandardClause[] | undefined = undefined;
      if (fs.existsSync(clausesPath)) {
        try {
          clauses = JSON.parse(fs.readFileSync(clausesPath, 'utf8'));
        } catch (e) {
          console.warn(`[FileRuleStore] 读取条款文件异常: ${clausesPath}`, e);
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
      console.error(`[FileRuleStore] 加载模块化标准失败: ${dirPath}`, err);
    }
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
      const normK = this.normalizeRoutingKey(k);
      slicesMap.set(normK, slice);
    }
  }

  public async resolveRuleSlice(standardId: string, routingKey: string): Promise<SpecificationSlice | undefined> {
    await this.ensureInitialized();
    const standardEntry = this.getStandardEntry(standardId);
    if (!standardEntry) {
      logger.debug('REPOSITORY', `未找到标准代号: [${standardId}]`);
      return undefined;
    }

    const normKey = this.normalizeRoutingKey(routingKey);
    const slice = standardEntry.slices.get(normKey);
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
    for (const stdId of standardIds) {
      const slice = await this.resolveRuleSlice(stdId, routingKey);
      if (slice) {
        const meta = await this.getStandardMeta(stdId);
        slicesWithMeta.push({
          slice,
          standardId: stdId,
          standardName: meta?.standard_name,
        });
      }
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
