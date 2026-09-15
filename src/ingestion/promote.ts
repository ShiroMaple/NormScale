import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { StandardMetaSchema, SpecificationSliceSchema } from '../schemas/standard.schema.ts';
import { validateAllStandards } from '../tools/validate-standards.ts';

/* ==========================================================================
   S5 暂存区晋级 (Staging Promote) —— T1 落盘语义改造
   - 管线产物默认只写 staging（.cache/standard-ingest/staging/<STD_DIR>/），
     data/standards 仅接受本模块的显式 promote，杜绝半成品整目录覆盖正式库
   - promote 三重防线：
     1) 按规则族合并：带 extracted_families 的部分覆盖产物只更新其声明族
        （rule.category ∈ families），其余族规则保留存量；合并后更新 coverage 标记
     2) no-net-loss 门禁：规则总数 / property_key 集合 / 规则字段集合 /
        meta 字段集合（含 tolerance_tables）不得净减，净减须 --force 并留 forced 标记
     3) 完成门禁：validateAllStandards + 数据敏感测试套件
        （tests/engine tests/repository tests/api tests/e2e）全绿，否则回滚
   - 规则级全量 diff（rule_id + property_key + criteria 数值比对）为
     review-report 与 no-net-loss 共用的验收口径实现
   ========================================================================== */

export class PromoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromoteError';
  }
}

/** 切片在盘上的原始形态（schema 之外允许 coverage/extracted_families 标记字段） */
export interface SliceOnDisk {
  spec_key: string;
  display_name: string;
  evaluation_rules: Array<Record<string, unknown> & { rule_id: string; category: string; property_key: string }>;
  [key: string]: unknown;
}

/** 标准目录装载结果：meta 与切片均为原始 JSON（schema 仅用于校验，不裁剪扩展字段） */
export interface LoadedStandard {
  dir: string;
  meta: Record<string, unknown>;
  slices: SliceOnDisk[];
}

/** 规则级 diff 条目：定位 spec_key/rule_id，比对 property_key 与 criteria 数值 */
export interface RuleDiffEntry {
  kind: 'added' | 'lost' | 'changed';
  ruleRef: string;
  propertyKey: string;
  detail: string;
}

export interface StandardRuleDiff {
  baseRuleCount: number;
  candidateRuleCount: number;
  added: RuleDiffEntry[];
  lost: RuleDiffEntry[];
  changed: RuleDiffEntry[];
  /** 以下为净减维度：property_key 集合 / 规则字段集合 / meta 字段集合 / 公差表 */
  lostPropertyKeys: string[];
  lostRuleFields: string[];
  lostMetaFields: string[];
  lostToleranceTables: string[];
}

export interface NetLossReport {
  diff: StandardRuleDiff;
  hasNetLoss: boolean;
  /** 逐条净减描述（拒绝 promote 时全部列入报告） */
  losses: string[];
}

/** promote 完成门禁执行的数据敏感测试套件 */
export const DATA_SENSITIVE_SUITES = ['tests/engine', 'tests/repository', 'tests/api', 'tests/e2e'] as const;

/** 数据敏感套件执行器签名：单测注入 mock，缺省真实 spawnSync vitest */
export type DataSensitiveTestRunner = (suites: readonly string[]) => { code: number; tail: string };

const TAIL_LINE_COUNT = 30;

/** 切片文件命名：与 S4 落盘惯例一致（spec_key_primary_grade，非法字符转下划线） */
export function sliceFileKey(slice: { spec_key?: string; primary_grade?: string }): string {
  return `${slice.spec_key || slice.primary_grade || 'UNKNOWN'}_${slice.primary_grade || ''}`.replace(/[/\\:]/g, '_');
}

/**
 * 由 meta.standard_id 推导正式库目录名（斜杠/空格/点/连字符→下划线），与 S4 一致
 */
export function stdDirNameFromMeta(meta: Record<string, unknown>): string {
  const id = String(meta.standard_id || 'UNKNOWN_STANDARD');
  return id.replace(/[/\s.\-—]/g, '_');
}

/**
 * 遍历标准库根目录中的全部规则（模块化目录 slices/*.json 与单体 JSON 的 slices/grade_rules 均覆盖）。
 * 扫描为 advisory 性质：单文件损坏跳过（正式契约由 validateAllStandards 把守）。
 */
function forEachStandardRule(standardsRoot: string, visit: (rule: Record<string, unknown>) => void): void {
  if (!fs.existsSync(standardsRoot)) return;

  const collectFromSlices = (slices: unknown): void => {
    if (!Array.isArray(slices)) return;
    for (const slice of slices) {
      const rules = (slice as { evaluation_rules?: unknown })?.evaluation_rules;
      if (!Array.isArray(rules)) continue;
      for (const rule of rules) {
        if (rule && typeof rule === 'object') visit(rule as Record<string, unknown>);
      }
    }
  };

  for (const entry of fs.readdirSync(standardsRoot, { withFileTypes: true })) {
    const fullPath = path.join(standardsRoot, entry.name);
    try {
      if (entry.isDirectory()) {
        const slicesDir = path.join(fullPath, 'slices');
        if (!fs.existsSync(slicesDir)) continue;
        for (const file of fs.readdirSync(slicesDir).filter((f) => f.endsWith('.json'))) {
          collectFromSlices([JSON.parse(fs.readFileSync(path.join(slicesDir, file), 'utf8'))]);
        }
      } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.includes('alias')) {
        const content = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as { slices?: unknown; grade_rules?: unknown };
        collectFromSlices(content.slices);
        if (Array.isArray(content.grade_rules)) {
          for (const gr of content.grade_rules) {
            const rules = (gr as { evaluation_rules?: unknown })?.evaluation_rules;
            if (Array.isArray(rules)) {
              for (const rule of rules) {
                if (rule && typeof rule === 'object') visit(rule as Record<string, unknown>);
              }
            }
          }
        }
      }
    } catch {
      // 注册表扫描为 advisory：跳过损坏文件，契约级校验由 validateAllStandards 负责
    }
  }
}

/**
 * 扫描标准库根目录，汇集全部 property_key 作为注册表。
 * 注册表用于 S3 命名漂移 lint。
 */
export function scanPropertyKeyRegistry(standardsRoot: string): Set<string> {
  const registry = new Set<string>();
  forEachStandardRule(standardsRoot, (rule) => {
    const key = rule.property_key;
    if (typeof key === 'string' && key.length > 0) registry.add(key);
  });
  return registry;
}

export interface PropertyKeyCatalogEntry {
  category: string;
  display_name: string;
}

/**
 * 扫描标准库根目录，汇集 property_key -> {category, display_name} 目录（同名 key 首次出现者胜，
 * 确定性依赖目录列举顺序）。供 S2 v2 prompt 闭集注入：按类别分组呈现既有命名惯例，
 * 抑制 LLM 自由发明导致的命名漂移洪水；空库/扫描失败返回空 Map（降级不注入，绝不阻断）。
 */
export function scanPropertyKeyCatalog(standardsRoot: string): Map<string, PropertyKeyCatalogEntry> {
  const catalog = new Map<string, PropertyKeyCatalogEntry>();
  forEachStandardRule(standardsRoot, (rule) => {
    const key = rule.property_key;
    if (typeof key !== 'string' || key.length === 0 || catalog.has(key)) return;
    catalog.set(key, {
      category: typeof rule.category === 'string' ? rule.category : '',
      display_name: typeof rule.display_name === 'string' ? rule.display_name : '',
    });
  });
  return catalog;
}

/**
 * 装载标准目录：meta.json + slices/*.json 契约校验（不合格显式抛 PromoteError），
 * 业务操作使用原始 JSON（保留 coverage/extracted_families 等扩展标记）
 */
export function loadStandardDir(dir: string): LoadedStandard {
  const metaPath = path.join(dir, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    throw new PromoteError(`标准目录缺少 meta.json: ${dir}`);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Record<string, unknown>;
  try {
    StandardMetaSchema.parse(meta);
  } catch (err) {
    throw new PromoteError(`${dir}/meta.json 契约校验失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  const slices: SliceOnDisk[] = [];
  const slicesDir = path.join(dir, 'slices');
  if (fs.existsSync(slicesDir)) {
    for (const file of fs.readdirSync(slicesDir).filter((f) => f.endsWith('.json')).sort()) {
      const raw = JSON.parse(fs.readFileSync(path.join(slicesDir, file), 'utf8')) as unknown;
      try {
        SpecificationSliceSchema.parse(raw);
      } catch (err) {
        throw new PromoteError(`${dir}/slices/${file} 契约校验失败: ${err instanceof Error ? err.message : String(err)}`);
      }
      slices.push(raw as SliceOnDisk);
    }
  }
  return { dir, meta, slices };
}

/** 从切片标记（coverage/extracted_families）或 meta.extracted_families 解析声明规则族；无元数据返回 null */
export function resolveDeclaredFamilies(standard: LoadedStandard): string[] | null {
  const metaFams = standard.meta.extracted_families;
  if (Array.isArray(metaFams) && metaFams.length > 0) {
    return [...new Set(metaFams.map(String))];
  }
  const sliceFams = new Set<string>();
  for (const slice of standard.slices) {
    const fams = slice.extracted_families;
    if (Array.isArray(fams)) fams.forEach((f) => sliceFams.add(String(f)));
  }
  return sliceFams.size > 0 ? [...sliceFams] : null;
}

/** 递归收集 criteria 内全部有限数值（保序，JSON key 顺序确定） */
function collectCriteriaNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectCriteriaNumbers(item, out);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectCriteriaNumbers(item, out);
  }
  return out;
}

function ruleFingerprint(rule: SliceOnDisk['evaluation_rules'][number]): string {
  return JSON.stringify({
    property_key: rule.property_key,
    rule_type: rule.rule_type ?? null,
    requirement_level: rule.requirement_level ?? null,
    criteria: collectCriteriaNumbers(rule.criteria),
  });
}

function indexRules(standard: LoadedStandard): Map<string, { rule: SliceOnDisk['evaluation_rules'][number]; specKey: string }> {
  const map = new Map<string, { rule: SliceOnDisk['evaluation_rules'][number]; specKey: string }>();
  for (const slice of standard.slices) {
    for (const rule of slice.evaluation_rules) {
      map.set(rule.rule_id, { rule, specKey: slice.spec_key });
    }
  }
  return map;
}

function toleranceTableIds(meta: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  const tables = meta.tolerance_tables;
  if (Array.isArray(tables)) {
    for (const t of tables) {
      const id = (t as { table_id?: unknown })?.table_id;
      if (typeof id === 'string') ids.add(id);
    }
  }
  return ids;
}

function ruleFieldSet(standard: LoadedStandard): Set<string> {
  const fields = new Set<string>();
  for (const slice of standard.slices) {
    for (const rule of slice.evaluation_rules) {
      Object.keys(rule).forEach((k) => fields.add(k));
    }
  }
  return fields;
}

function propertyKeySet(standard: LoadedStandard): Set<string> {
  const keys = new Set<string>();
  for (const slice of standard.slices) {
    for (const rule of slice.evaluation_rules) keys.add(rule.property_key);
  }
  return keys;
}

/**
 * 规则级全量 diff（base=存量，candidate=候选/合并产物）：
 * 按 rule_id 对齐，比对 property_key 与 criteria 数值；meta 字段集合与公差表参与净减比对。
 * 丢失/净减维度驱动 no-net-loss 门禁与 review-report 验收口径。
 */
export function diffStandards(base: LoadedStandard, candidate: LoadedStandard): StandardRuleDiff {
  const diff: StandardRuleDiff = {
    baseRuleCount: 0,
    candidateRuleCount: 0,
    added: [],
    lost: [],
    changed: [],
    lostPropertyKeys: [],
    lostRuleFields: [],
    lostMetaFields: [],
    lostToleranceTables: [],
  };

  const baseRules = indexRules(base);
  const candidateRules = indexRules(candidate);
  diff.baseRuleCount = baseRules.size;
  diff.candidateRuleCount = candidateRules.size;

  for (const [ruleId, baseEntry] of baseRules) {
    const ruleRef = `${baseEntry.specKey}/${ruleId}`;
    const candidateEntry = candidateRules.get(ruleId);
    if (!candidateEntry) {
      diff.lost.push({
        kind: 'lost',
        ruleRef,
        propertyKey: baseEntry.rule.property_key,
        detail: `存量规则丢失: ${ruleRef} (${baseEntry.rule.property_key})`,
      });
      continue;
    }
    if (ruleFingerprint(baseEntry.rule) !== ruleFingerprint(candidateEntry.rule)) {
      const baseNums = collectCriteriaNumbers(baseEntry.rule.criteria).join('/');
      const candidateNums = collectCriteriaNumbers(candidateEntry.rule.criteria).join('/');
      diff.changed.push({
        kind: 'changed',
        ruleRef,
        propertyKey: candidateEntry.rule.property_key,
        detail:
          `规则变更: ${ruleRef} property_key ${baseEntry.rule.property_key} -> ${candidateEntry.rule.property_key}; ` +
          `criteria 数值 [${baseNums}] -> [${candidateNums}]`,
      });
    }
  }
  for (const [ruleId, candidateEntry] of candidateRules) {
    if (baseRules.has(ruleId)) continue;
    diff.added.push({
      kind: 'added',
      ruleRef: `${candidateEntry.specKey}/${ruleId}`,
      propertyKey: candidateEntry.rule.property_key,
      detail: `新增规则: ${candidateEntry.specKey}/${ruleId} (${candidateEntry.rule.property_key})`,
    });
  }

  diff.lostPropertyKeys = [...propertyKeySet(base)].filter((k) => !propertyKeySet(candidate).has(k)).sort();
  diff.lostRuleFields = [...ruleFieldSet(base)].filter((f) => !ruleFieldSet(candidate).has(f)).sort();
  const candidateMetaKeys = new Set(Object.keys(candidate.meta));
  diff.lostMetaFields = Object.keys(base.meta).filter((k) => !candidateMetaKeys.has(k)).sort();
  const candidateTableIds = toleranceTableIds(candidate.meta);
  diff.lostToleranceTables = [...toleranceTableIds(base.meta)].filter((id) => !candidateTableIds.has(id)).sort();

  return diff;
}

/** no-net-loss 判定：丢失规则 / 净减 property_key / 净减规则字段 / 净减 meta 字段（含公差表）任一存在即拒绝 */
export function checkNoNetLoss(base: LoadedStandard, candidate: LoadedStandard): NetLossReport {
  const diff = diffStandards(base, candidate);
  const losses: string[] = [
    ...diff.lost.map((e) => e.detail),
    ...diff.lostPropertyKeys.map((k) => `property_key 净减: ${k}`),
    ...diff.lostRuleFields.map((f) => `规则字段净减: ${f}`),
    ...diff.lostMetaFields.map((f) => `meta 字段净减: ${f}`),
    ...diff.lostToleranceTables.map((t) => `公差表净减: ${t}`),
  ];
  return { diff, hasNetLoss: losses.length > 0, losses };
}

/**
 * 按规则族合并（base=存量切片，candidate=staging 切片，families=候选声明的提取族）：
 * - 双方共有的切片：候选仅接管 families 内的规则（按 rule_id 覆盖），存量其余族规则保留
 * - 仅存量存在的切片：原样保留
 * - 仅候选存在的切片：整体新增
 */
export function mergeSlicesByFamilies(baseSlices: SliceOnDisk[], candidateSlices: SliceOnDisk[], families: string[]): SliceOnDisk[] {
  const familySet = new Set(families);
  const baseByKey = new Map(baseSlices.map((s) => [s.spec_key, s]));
  const candidateByKey = new Map(candidateSlices.map((s) => [s.spec_key, s]));

  const merged: SliceOnDisk[] = [];
  const pushed = new Set<string>();

  for (const [specKey, candidate] of candidateByKey) {
    const base = baseByKey.get(specKey);
    if (!base) {
      merged.push(candidate);
      pushed.add(specKey);
      continue;
    }
    const keptBaseRules = base.evaluation_rules.filter((r) => !familySet.has(r.category));
    const candidateRules = candidate.evaluation_rules.filter((r) => familySet.has(r.category));
    const candidateRuleIds = new Set(candidateRules.map((r) => r.rule_id));
    merged.push({
      ...base,
      ...candidate,
      evaluation_rules: [
        ...keptBaseRules.filter((r) => !candidateRuleIds.has(r.rule_id)),
        ...candidateRules,
      ],
    });
    pushed.add(specKey);
  }
  for (const [specKey, base] of baseByKey) {
    if (pushed.has(specKey)) continue;
    merged.push(base);
  }
  return merged;
}

/**
 * 合并后更新 coverage 标记：
 * - 标准级全族 = 合并规则实际类别 ∪ 存量/候选声明族（兑现既有承诺，防止"承诺族被静默丢弃"）
 * - 切片规则类别覆盖全族 -> 清除 coverage/extracted_families（该切片已完整）
 * - 否则标记 coverage='partial' 且 extracted_families=其实际类别
 * meta 标记同步：全部切片完整则删除 meta.extracted_families，否则更新为剩余 partial 族并集
 */
export function updateCoverageMarkers(slices: SliceOnDisk[], candidateFamilies: string[]): SliceOnDisk[] {
  const stdFamilies = new Set<string>(candidateFamilies);
  for (const slice of slices) {
    slice.evaluation_rules.forEach((r) => stdFamilies.add(r.category));
    const baseFams = slice.extracted_families;
    if (slice.coverage === 'partial' && Array.isArray(baseFams)) {
      baseFams.forEach((f) => stdFamilies.add(String(f)));
    }
  }

  for (const slice of slices) {
    const cats = new Set(slice.evaluation_rules.map((r) => r.category));
    const complete = cats.size > 0 && [...stdFamilies].every((f) => cats.has(f));
    if (complete) {
      delete slice.coverage;
      delete slice.extracted_families;
    } else {
      slice.coverage = 'partial';
      slice.extracted_families = [...cats].sort();
    }
  }
  return slices;
}

/** 同步 meta 层 coverage 标记（全部切片完整 -> 删除声明族；否则收敛为剩余 partial 族并集） */
function syncMetaCoverage(meta: Record<string, unknown>, slices: SliceOnDisk[]): void {
  const partialFamilies = new Set<string>();
  for (const slice of slices) {
    if (slice.coverage === 'partial' && Array.isArray(slice.extracted_families)) {
      slice.extracted_families.forEach((f) => partialFamilies.add(String(f)));
    }
  }
  if (partialFamilies.size === 0) {
    delete meta.extracted_families;
    delete meta.coverage;
  } else {
    meta.extracted_families = [...partialFamilies].sort();
  }
}

function writeStandardDir(dir: string, meta: Record<string, unknown>, slices: SliceOnDisk[], clauses: unknown): void {
  fs.rmSync(dir, { recursive: true, force: true });
  const slicesDir = path.join(dir, 'slices');
  fs.mkdirSync(slicesDir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(dir, 'clauses.json'), JSON.stringify(clauses ?? [], null, 2));
  for (const slice of slices) {
    fs.writeFileSync(path.join(slicesDir, `${sliceFileKey(slice)}.json`), JSON.stringify(slice, null, 2));
  }
}

function readClauses(dir: string): unknown {
  const clausesPath = path.join(dir, 'clauses.json');
  if (!fs.existsSync(clausesPath)) return [];
  return JSON.parse(fs.readFileSync(clausesPath, 'utf8'));
}

/** 真实数据敏感套件执行器：spawnSync vitest run <suites>，返回退出码与输出 tail 摘要 */
export function runDataSensitiveSuites(suites: readonly string[]): { code: number; tail: string } {
  // 直接以 node 执行 vitest.mjs：跨平台稳定（Windows 下 npx.cmd 不经 shell 无法 spawn），
  // 无 shell 参数拼接注入面；套件参数为静态常量
  const vitestEntry = path.resolve(process.cwd(), 'node_modules/vitest/vitest.mjs');
  const result = spawnSync(process.execPath, [vitestEntry, 'run', ...suites], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const tail = output.split('\n').slice(-TAIL_LINE_COUNT).join('\n');
  const code = typeof result.status === 'number' ? result.status : 1;
  if (result.error) {
    return { code: code === 0 ? 1 : code, tail: `测试套件进程异常: ${result.error.message}\n${tail}` };
  }
  return { code, tail };
}

export interface PromoteOptions {
  /** 已定位的 staging 产物目录（含 meta.json）；可用 resolveStagingDir 解析 CLI 入参 */
  stagingDir: string;
  /** 正式库根目录；缺省 data/standards */
  outRoot?: string;
  /** 确认净减：no-net-loss 门禁存在净减时须显式 force 才放行，并在 meta 记录 forced 标记 */
  force?: boolean;
  /** 数据敏感套件执行器；单测注入 mock，缺省 runDataSensitiveSuites */
  testRunner?: DataSensitiveTestRunner;
  onProgress?: (message: string) => void;
}

export interface PromoteResult {
  stdDir: string;
  /** 全新入库（目标目录原本不存在） */
  fresh: boolean;
  /** 本次按族合并的规则族（空数组 = 全量产物/全新入库未触发合并） */
  mergedFamilies: string[];
  /** 发生按族合并时，合并产物 vs 存量的规则级全量 diff */
  diff: StandardRuleDiff | null;
  /** no-net-loss 存在净减且经 --force 放行 */
  forced: boolean;
  validation: { success: boolean; totalStandards: number; totalSlices: number; errors: string[] };
  dataSensitiveTests: { code: number; tail: string };
}

/**
 * promote 主入口：staging 产物 -> data/standards/<STD_DIR>
 * 任何门禁失败显式抛 PromoteError，正式库保持原状（写入失败自动回滚）
 */
export function promoteStaging(options: PromoteOptions): PromoteResult {
  const progress = options.onProgress || ((): void => undefined);
  const outRoot = options.outRoot || path.resolve(process.cwd(), 'data/standards');
  const stagingDir = path.resolve(options.stagingDir);
  if (!fs.existsSync(stagingDir) || !fs.existsSync(path.join(stagingDir, 'meta.json'))) {
    throw new PromoteError(`staging 产物不存在或缺少 meta.json: ${stagingDir}`);
  }

  const candidate = loadStandardDir(stagingDir);
  const stdDirName = stdDirNameFromMeta(candidate.meta);
  const stdDir = path.join(outRoot, stdDirName);
  const targetExisted = fs.existsSync(stdDir);
  const declaredFamilies = resolveDeclaredFamilies(candidate);

  let mergedSlices: SliceOnDisk[];
  let mergedMeta: Record<string, unknown>;
  let diff: StandardRuleDiff | null = null;
  let forced = false;
  let mergedFamilies: string[] = [];

  if (!targetExisted) {
    // 全新入库：无存量可对账，原样晋级（无 families 元数据亦合法）
    progress(`目标标准目录不存在，按全新入库晋级: ${stdDir}`);
    mergedSlices = candidate.slices;
    mergedMeta = { ...candidate.meta };
  } else {
    if (!declaredFamilies) {
      throw new PromoteError(
        `staging 产物缺少 extracted_families 元数据，禁止 promote 到已存在的标准目录 ${stdDir}：` +
          '无声明族的全量产物无法与存量安全合并（若确为整标准重写，请先显式声明覆盖全部规则族）。',
      );
    }
    mergedFamilies = declaredFamilies;
    const base = loadStandardDir(stdDir);
    progress(`按规则族合并: ${declaredFamilies.join('/')}（存量其余族规则保留）`);
    mergedSlices = mergeSlicesByFamilies(base.slices, candidate.slices, declaredFamilies);
    updateCoverageMarkers(mergedSlices, declaredFamilies);
    mergedMeta = { ...candidate.meta };
    syncMetaCoverage(mergedMeta, mergedSlices);

    const netLoss = checkNoNetLoss(base, { dir: stdDir, meta: mergedMeta, slices: mergedSlices });
    diff = netLoss.diff;
    if (netLoss.hasNetLoss) {
      if (!options.force) {
        throw new PromoteError(
          `no-net-loss 门禁拦截 promote（${netLoss.losses.length} 项净减）：\n` +
            netLoss.losses.map((l) => `  - ${l}`).join('\n') +
            '\n确认接受净减须显式追加 --force（放行后会在 meta 记录 forced 标记）。',
        );
      }
      forced = true;
      progress(`no-net-loss 存在净减 ${netLoss.losses.length} 项，经 --force 显式放行`);
    }
  }

  if (forced) {
    mergedMeta.promote = {
      forced: true,
      promoted_at: new Date().toISOString(),
      source_staging: stagingDir,
      net_loss: diff ? diff.lost.map((e) => e.ruleRef) : [],
    };
  }

  // 写入 + 完成门禁（失败回滚）：存量目录先备份，任何门禁不过即恢复原状
  const backupDir = targetExisted ? `${stdDir}.promote-bak-${process.pid}-${Date.now()}` : null;
  if (backupDir) {
    fs.renameSync(stdDir, backupDir);
  }
  let validation: PromoteResult['validation'];
  let dataSensitiveTests: PromoteResult['dataSensitiveTests'];
  try {
    writeStandardDir(stdDir, mergedMeta, mergedSlices, readClauses(stagingDir));
    progress('完成门禁：validateAllStandards 最终校验...');
    validation = validateAllStandards(outRoot);
    if (!validation.success) {
      throw new PromoteError(
        `promote 完成门禁未通过：validateAllStandards 存在 ${validation.errors.length} 项错误，promote 不成立，请先修复：\n` +
          validation.errors.slice(0, 10).map((e) => `  - ${e}`).join('\n'),
      );
    }
    progress(`完成门禁：数据敏感测试套件（${DATA_SENSITIVE_SUITES.join(' ')}）...`);
    const testRunner = options.testRunner || runDataSensitiveSuites;
    dataSensitiveTests = testRunner(DATA_SENSITIVE_SUITES);
    if (dataSensitiveTests.code !== 0) {
      throw new PromoteError(
        `promote 完成门禁未通过：数据敏感套件退出码 ${dataSensitiveTests.code}，promote 不成立，请先修复测试。输出 tail：\n${dataSensitiveTests.tail}`,
      );
    }
  } catch (err) {
    fs.rmSync(stdDir, { recursive: true, force: true });
    if (backupDir && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, stdDir);
      progress('已回滚：正式库恢复 promote 前状态');
    }
    throw err;
  }
  if (backupDir && fs.existsSync(backupDir)) {
    fs.rmSync(backupDir, { recursive: true, force: true });
  }

  return {
    stdDir,
    fresh: !targetExisted,
    mergedFamilies,
    diff,
    forced,
    validation: validation!,
    dataSensitiveTests: dataSensitiveTests!,
  };
}
