import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DATA_SENSITIVE_SUITES,
  PromoteError,
  checkNoNetLoss,
  diffStandards,
  loadStandardDir,
  promoteStaging,
  scanPropertyKeyRegistry,
  stdDirNameFromMeta,
} from '@/ingestion/promote';
import type { SliceOnDisk } from '@/ingestion/promote';

/* promote 单测：全部使用临时目录构造 staging 产物与存量标准，严禁触碰真实 data/standards。
   完成门禁（validateAllStandards + 数据敏感套件）中的测试套件执行一律注入 mock runner。 */

const STD_ID = 'GB/T 88888-2024';

function makeRule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    rule_id: 'CHEM_S88888_C',
    category: 'chemical',
    property_key: 'C',
    display_name: 'C含量 (C)',
    description: '熔炼分析碳含量指标',
    rule_type: 'numeric_range',
    requirement_level: 'MANDATORY',
    criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 },
    ...overrides,
  };
}

function makeSlice(overrides: Record<string, unknown> = {}): SliceOnDisk {
  return {
    spec_key: 'S88888',
    spec_type: 'grade',
    display_name: '06Cr19Ni10 (S88888) 不锈钢管',
    primary_grade: '06Cr19Ni10',
    unified_code: 'S88888',
    standard_code: STD_ID,
    structure_type: 'austenitic',
    description: '试验切片',
    aliases: [],
    evaluation_rules: [makeRule()],
    ...overrides,
  } as unknown as SliceOnDisk;
}

function makeMeta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    standard_id: STD_ID,
    standard_name: '试验用不锈钢无缝钢管标准',
    version: '2024',
    description: '本文件适用于锅炉、热交换器用不锈钢无缝钢管。',
    status: 'CURRENT',
    material_category: 'ferrous_pipe',
    applies_to_forms: ['tube_seamless'],
    ...overrides,
  };
}

function writeStandardDir(dir: string, meta: Record<string, unknown>, slices: SliceOnDisk[]): void {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'slices'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(dir, 'clauses.json'), JSON.stringify([], null, 2));
  for (const slice of slices) {
    fs.writeFileSync(
      path.join(dir, 'slices', `${slice.spec_key}_${slice.primary_grade || ''}.json`),
      JSON.stringify(slice, null, 2),
    );
  }
}

const OK_RUNNER = () => ({ code: 0, tail: 'all green' });

describe('S5 promote：staging 晋级正式库', () => {
  let tmpRoot: string;
  let outRoot: string;
  let stagingRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'normscale-promote-'));
    outRoot = path.join(tmpRoot, 'standards');
    stagingRoot = path.join(tmpRoot, 'staging');
    fs.mkdirSync(outRoot, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeStaging(name: string, meta: Record<string, unknown>, slices: SliceOnDisk[]): string {
    const dir = path.join(stagingRoot, name);
    writeStandardDir(dir, meta, slices);
    return dir;
  }

  it('全新入库：目标目录不存在时无 families 元数据也放行，且完成门禁通过才成立', () => {
    const stagingDir = writeStaging('GB_T_88888_2024', makeMeta(), [makeSlice()]);
    const suitesSeen: string[][] = [];
    const result = promoteStaging({
      stagingDir,
      outRoot,
      testRunner: (suites) => {
        suitesSeen.push([...suites]);
        return { code: 0, tail: '' };
      },
    });

    expect(result.fresh).toBe(true);
    expect(result.forced).toBe(false);
    expect(result.mergedFamilies).toEqual([]);
    expect(result.diff).toBeNull();
    expect(fs.existsSync(path.join(outRoot, 'GB_T_88888_2024', 'meta.json'))).toBe(true);
    expect(result.validation.success).toBe(true);
    expect(suitesSeen).toEqual([[...DATA_SENSITIVE_SUITES]]);
  });

  it('no-net-loss 门禁：候选产物净减存量规则时拒绝 promote，存量保持原状', () => {
    const baseSlice = makeSlice({
      evaluation_rules: [makeRule(), makeRule({ rule_id: 'MECH_S88888_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', description: '抗拉强度指标', criteria: { min: 520, max: null, unit: 'MPa' } })],
    });
    writeStandardDir(path.join(outRoot, 'GB_T_88888_2024'), makeMeta(), [baseSlice]);

    // 候选仅含 chemical 规则（声明 chem+mech 但产物缺 mech -> 合并后存量 mech 规则丢失）
    const stagingDir = writeStaging(
      'GB_T_88888_2024',
      makeMeta({ extracted_families: ['chemical', 'mechanical'] }),
      [makeSlice({ coverage: 'partial', extracted_families: ['chemical', 'mechanical'] })],
    );

    let runnerCalled = false;
    expect(() =>
      promoteStaging({
        stagingDir,
        outRoot,
        testRunner: () => {
          runnerCalled = true;
          return { code: 0, tail: '' };
        },
      }),
    ).toThrow(PromoteError);
    expect(() => promoteStaging({ stagingDir, outRoot, testRunner: OK_RUNNER })).toThrow(/MECH_S88888_RM/);
    // 拒绝发生在写入前：完成门禁不应执行，存量 untouched
    expect(runnerCalled).toBe(false);
    const kept = JSON.parse(
      fs.readFileSync(path.join(outRoot, 'GB_T_88888_2024', 'slices', 'S88888_06Cr19Ni10.json'), 'utf8'),
    ) as { evaluation_rules: Array<{ rule_id: string }> };
    expect(kept.evaluation_rules.map((r) => r.rule_id).sort()).toEqual(['CHEM_S88888_C', 'MECH_S88888_RM']);
  });

  it('--force 放行净减：promote 成立且 meta 记录 forced 标记', () => {
    const baseSlice = makeSlice({
      evaluation_rules: [makeRule(), makeRule({ rule_id: 'MECH_S88888_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', description: '抗拉强度指标', criteria: { min: 520, max: null, unit: 'MPa' } })],
    });
    writeStandardDir(path.join(outRoot, 'GB_T_88888_2024'), makeMeta(), [baseSlice]);

    const stagingDir = writeStaging(
      'GB_T_88888_2024',
      makeMeta({ extracted_families: ['chemical', 'mechanical'] }),
      [makeSlice({ coverage: 'partial', extracted_families: ['chemical', 'mechanical'] })],
    );

    const result = promoteStaging({ stagingDir, outRoot, force: true, testRunner: OK_RUNNER });
    expect(result.forced).toBe(true);
    expect(result.diff?.lost.map((e) => e.ruleRef)).toEqual(['S88888/MECH_S88888_RM']);

    const promotedMeta = JSON.parse(fs.readFileSync(path.join(outRoot, 'GB_T_88888_2024', 'meta.json'), 'utf8')) as {
      promote?: { forced: boolean };
    };
    expect(promotedMeta.promote?.forced).toBe(true);
    const promotedSlice = JSON.parse(
      fs.readFileSync(path.join(outRoot, 'GB_T_88888_2024', 'slices', 'S88888_06Cr19Ni10.json'), 'utf8'),
    ) as { evaluation_rules: Array<{ rule_id: string }> };
    expect(promotedSlice.evaluation_rules.map((r) => r.rule_id)).toEqual(['CHEM_S88888_C']);
  });

  it('按规则族合并：chem+mech 候选 promote 到含 process/ndt 规则的存量目录，存量规则保留且候选族规则被接管', () => {
    const baseSlice = makeSlice({
      evaluation_rules: [
        makeRule({ criteria: { min: null, max: 0.12, unit: '%', rounding_decimals: 3 } }),
        makeRule({ rule_id: 'PROC_S88888_FLATTEN', category: 'process', property_key: 'flattening_test', display_name: '压扁试验', description: '压扁试验无裂纹', rule_type: 'dynamic_formula_pass', requirement_level: 'MANDATORY', criteria: { formula_distance_H: '(1+0.09)*S/(0.09+S/D)', expected_visual_result: 'NO_CRACKS' } }),
        makeRule({ rule_id: 'NDT_S88888_HYDRO', category: 'ndt', property_key: 'pressure_tightness', display_name: '液压试验', description: '逐根液压试验', rule_type: 'alternative_group', requirement_level: 'MANDATORY', criteria: { group_logic: 'AT_LEAST_ONE_PASS', candidates: [{ candidate_key: 'hydro', max_pressure_cap: 20 }] } }),
      ],
    });
    const baseOnlySlice = makeSlice({
      spec_key: 'S88889',
      unified_code: 'S88889',
      display_name: '022Cr19Ni10 (S88889) 不锈钢管',
      primary_grade: '022Cr19Ni10',
      evaluation_rules: [makeRule({ rule_id: 'NDT_S88889_US', category: 'ndt', property_key: 'ultrasonic_test', display_name: '超声探伤', description: '超声验收等级 U2', rule_type: 'qualitative_enum', requirement_level: 'MANDATORY', criteria: { required_level: 'U2' } })],
    });
    writeStandardDir(path.join(outRoot, 'GB_T_88888_2024'), makeMeta(), [baseSlice, baseOnlySlice]);

    // 候选：chem 规则数值更新（0.08 -> 0.06）+ 新增 mech 规则；不触碰 process/ndt
    const stagingDir = writeStaging(
      'GB_T_88888_2024',
      makeMeta({ extracted_families: ['chemical', 'mechanical'] }),
      [
        makeSlice({
          coverage: 'partial',
          extracted_families: ['chemical', 'mechanical'],
          evaluation_rules: [
            makeRule({ criteria: { min: null, max: 0.06, unit: '%', rounding_decimals: 3 } }),
            makeRule({ rule_id: 'MECH_S88888_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', description: '抗拉强度指标', criteria: { min: 520, max: null, unit: 'MPa' } }),
          ],
        }),
      ],
    );

    const result = promoteStaging({ stagingDir, outRoot, testRunner: OK_RUNNER });
    expect(result.fresh).toBe(false);
    expect(result.forced).toBe(false);
    expect(result.mergedFamilies).toEqual(['chemical', 'mechanical']);
    // 变更被报告（chem 数值变化 + mech 新增），但无丢失 -> 无 net-loss 拦截
    expect(result.diff?.changed.some((e) => e.ruleRef === 'S88888/CHEM_S88888_C')).toBe(true);
    expect(result.diff?.added.some((e) => e.ruleRef === 'S88888/MECH_S88888_RM')).toBe(true);
    expect(result.diff?.lost).toEqual([]);

    const merged = JSON.parse(
      fs.readFileSync(path.join(outRoot, 'GB_T_88888_2024', 'slices', 'S88888_06Cr19Ni10.json'), 'utf8'),
    ) as SliceOnDisk;
    const byId = new Map(merged.evaluation_rules.map((r) => [r.rule_id, r]));
    // 存量 process/ndt 规则保留
    expect(byId.has('PROC_S88888_FLATTEN')).toBe(true);
    expect(byId.has('NDT_S88888_HYDRO')).toBe(true);
    // 候选 chemical 规则接管（数值已更新）
    expect((byId.get('CHEM_S88888_C')!.criteria as { max: number }).max).toBe(0.06);
    // 候选 mechanical 规则并入
    expect(byId.has('MECH_S88888_RM')).toBe(true);
    // 切片覆盖 chem/mech/process/ndt 全族 -> coverage 标记清除
    expect(merged.coverage).toBeUndefined();
    expect(merged.extracted_families).toBeUndefined();

    // 仅存量存在的切片原样保留
    expect(fs.existsSync(path.join(outRoot, 'GB_T_88888_2024', 'slices', 'S88889_022Cr19Ni10.json'))).toBe(true);
  });

  it('按族合并后 coverage 收敛：未覆盖全族的切片保留 partial 且 families 收敛为实际类别', () => {
    const partialBase = makeSlice({
      coverage: 'partial',
      extracted_families: ['process'],
      evaluation_rules: [makeRule({ rule_id: 'PROC_S88888_FLATTEN', category: 'process', property_key: 'flattening_test', display_name: '压扁试验', description: '压扁试验无裂纹', rule_type: 'dynamic_formula_pass', requirement_level: 'MANDATORY', criteria: { expected_visual_result: 'NO_CRACKS' } })],
    });
    const goldenBase = makeSlice({
      spec_key: 'S88889',
      unified_code: 'S88889',
      display_name: '022Cr19Ni10 (S88889) 不锈钢管',
      primary_grade: '022Cr19Ni10',
      evaluation_rules: [makeRule({ rule_id: 'NDT_S88889_US', category: 'ndt', property_key: 'ultrasonic_test', display_name: '超声探伤', description: '超声验收等级 U2', rule_type: 'qualitative_enum', requirement_level: 'MANDATORY', criteria: { required_level: 'U2' } })],
    });
    writeStandardDir(path.join(outRoot, 'GB_T_88888_2024'), makeMeta(), [partialBase, goldenBase]);

    const stagingDir = writeStaging(
      'GB_T_88888_2024',
      makeMeta({ extracted_families: ['chemical'] }),
      [makeSlice({ coverage: 'partial', extracted_families: ['chemical'] })],
    );

    promoteStaging({ stagingDir, outRoot, testRunner: OK_RUNNER });

    const merged = JSON.parse(
      fs.readFileSync(path.join(outRoot, 'GB_T_88888_2024', 'slices', 'S88888_06Cr19Ni10.json'), 'utf8'),
    ) as SliceOnDisk;
    // 全族 = chemical/process/ndt，该切片仅 chemical+process -> 保持 partial 且 families 收敛
    expect(merged.coverage).toBe('partial');
    expect(merged.extracted_families).toEqual(['chemical', 'process']);
    // meta 声明族收敛为全部 partial 切片族的并集（S88889 仅 ndt 族，合并后同样标记 partial）
    const meta = JSON.parse(fs.readFileSync(path.join(outRoot, 'GB_T_88888_2024', 'meta.json'), 'utf8')) as {
      extracted_families?: string[];
    };
    expect(meta.extracted_families).toEqual(['chemical', 'ndt', 'process']);
  });

  it('无 extracted_families 元数据的 staging 产物禁止 promote 到已存在的标准目录', () => {
    writeStandardDir(path.join(outRoot, 'GB_T_88888_2024'), makeMeta(), [makeSlice()]);
    const stagingDir = writeStaging('GB_T_88888_2024', makeMeta(), [makeSlice()]);

    expect(() => promoteStaging({ stagingDir, outRoot, testRunner: OK_RUNNER })).toThrow(/extracted_families/);
    // 存量未被触碰
    const kept = JSON.parse(
      fs.readFileSync(path.join(outRoot, 'GB_T_88888_2024', 'slices', 'S88888_06Cr19Ni10.json'), 'utf8'),
    ) as SliceOnDisk;
    expect(kept.evaluation_rules).toHaveLength(1);
  });

  it('数据敏感套件失败：promote 不成立且存量目录自动回滚', () => {
    const baseSlice = makeSlice({
      evaluation_rules: [makeRule(), makeRule({ rule_id: 'MECH_S88888_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', description: '抗拉强度指标', criteria: { min: 520, max: null, unit: 'MPa' } })],
    });
    writeStandardDir(path.join(outRoot, 'GB_T_88888_2024'), makeMeta(), [baseSlice]);

    const stagingDir = writeStaging(
      'GB_T_88888_2024',
      makeMeta({ extracted_families: ['chemical', 'mechanical'] }),
      [
        makeSlice({
          coverage: 'partial',
          extracted_families: ['chemical', 'mechanical'],
          evaluation_rules: [
            makeRule(),
            makeRule({ rule_id: 'MECH_S88888_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', description: '抗拉强度指标', criteria: { min: 520, max: null, unit: 'MPa' } }),
          ],
        }),
      ],
    );

    expect(() =>
      promoteStaging({
        stagingDir,
        outRoot,
        testRunner: () => ({ code: 1, tail: 'FAIL tests/engine/x' }),
      }),
    ).toThrow(/数据敏感套件退出码 1/);

    // 回滚：存量内容恢复（mech 规则仍在，meta 无 forced 标记）
    const kept = JSON.parse(
      fs.readFileSync(path.join(outRoot, 'GB_T_88888_2024', 'slices', 'S88888_06Cr19Ni10.json'), 'utf8'),
    ) as SliceOnDisk;
    expect(kept.evaluation_rules.map((r) => r.rule_id).sort()).toEqual(['CHEM_S88888_C', 'MECH_S88888_RM']);
    const meta = JSON.parse(fs.readFileSync(path.join(outRoot, 'GB_T_88888_2024', 'meta.json'), 'utf8')) as {
      promote?: unknown;
      extracted_families?: unknown;
    };
    expect(meta.promote).toBeUndefined();
    expect(meta.extracted_families).toBeUndefined();
  });

  it('全新入库时数据敏感套件失败：写入被撤销，目标目录不存在', () => {
    const stagingDir = writeStaging('GB_T_88888_2024', makeMeta(), [makeSlice()]);
    expect(() =>
      promoteStaging({ stagingDir, outRoot, testRunner: () => ({ code: 1, tail: 'boom' }) }),
    ).toThrow(PromoteError);
    expect(fs.existsSync(path.join(outRoot, 'GB_T_88888_2024'))).toBe(false);
  });

  it('staging 产物契约非法（切片不合 Zod schema）显式拒绝且不写正式库', () => {
    const stagingDir = path.join(stagingRoot, 'GB_T_88888_2024');
    fs.mkdirSync(path.join(stagingDir, 'slices'), { recursive: true });
    fs.writeFileSync(path.join(stagingDir, 'meta.json'), JSON.stringify(makeMeta()));
    fs.writeFileSync(path.join(stagingDir, 'clauses.json'), JSON.stringify([]));
    fs.writeFileSync(
      path.join(stagingDir, 'slices', 'S88888_06Cr19Ni10.json'),
      JSON.stringify({ spec_key: 'S88888' }), // 缺 display_name/evaluation_rules 等必填
    );
    expect(() => promoteStaging({ stagingDir, outRoot, testRunner: OK_RUNNER })).toThrow(/契约校验失败/);
    expect(fs.existsSync(path.join(outRoot, 'GB_T_88888_2024'))).toBe(false);
  });

  it('meta 字段净减（含 tolerance_tables）被 no-net-loss 拦截', () => {
    const baseMeta = makeMeta({
      tolerance_tables: [
        {
          table_id: 'GB_T_88888_2024_TABLE_1',
          table_name: '表1 外径允许偏差',
          rules: [
            {
              dimension_property: 'outer_diameter',
              process: 'cold_drawn',
              delivery_mode: 'min_wall',
              range_max: 25,
              plus_tolerance_value: 0.1,
              minus_tolerance_value: -0.1,
            },
          ],
        },
      ],
    });
    writeStandardDir(path.join(outRoot, 'GB_T_88888_2024'), baseMeta, [makeSlice()]);

    // 候选丢失 tolerance_tables -> meta 字段净减
    const stagingDir = writeStaging(
      'GB_T_88888_2024',
      makeMeta({ extracted_families: ['chemical', 'mechanical'] }),
      [makeSlice({ coverage: 'partial', extracted_families: ['chemical', 'mechanical'] })],
    );

    expect(() => promoteStaging({ stagingDir, outRoot, testRunner: OK_RUNNER })).toThrow(/公差表净减/);
    const netLoss = checkNoNetLoss(
      loadStandardDir(path.join(outRoot, 'GB_T_88888_2024')),
      loadStandardDir(stagingDir),
    );
    expect(netLoss.hasNetLoss).toBe(true);
    expect(netLoss.diff.lostToleranceTables).toEqual(['GB_T_88888_2024_TABLE_1']);
  });
});

describe('S5 支撑函数：规则级全量 diff 与注册表扫描', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'normscale-diff-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('diffStandards 按 rule_id + property_key + criteria 数值分类新增/丢失/变更', () => {
    const base = loadStandardDirFrom(tmpRoot, 'base', [
      makeSlice({
        evaluation_rules: [
          makeRule(), // 保持不变
          makeRule({ rule_id: 'MECH_S88888_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', criteria: { min: 520, max: null, unit: 'MPa' } }),
          makeRule({ rule_id: 'CHEM_S88888_LOST', property_key: 'Ni', display_name: 'Ni含量 (Ni)', criteria: { min: 8, max: 11, unit: '%' } }),
        ],
      }),
    ]);
    const candidate = loadStandardDirFrom(tmpRoot, 'candidate', [
      makeSlice({
        evaluation_rules: [
          makeRule(),
          makeRule({ rule_id: 'MECH_S88888_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', criteria: { min: 480, max: null, unit: 'MPa' } }), // 数值变更
          makeRule({ rule_id: 'CHEM_S88888_NEW', property_key: 'Cr', display_name: 'Cr含量 (Cr)', criteria: { min: 18, max: 20, unit: '%' } }), // 新增
        ],
      }),
    ]);

    const diff = diffStandards(base, candidate);
    expect(diff.lost.map((e) => e.ruleRef)).toEqual(['S88888/CHEM_S88888_LOST']);
    expect(diff.changed.map((e) => e.ruleRef)).toEqual(['S88888/MECH_S88888_RM']);
    expect(diff.changed[0]!.detail).toContain('520');
    expect(diff.changed[0]!.detail).toContain('480');
    expect(diff.added.map((e) => e.ruleRef)).toEqual(['S88888/CHEM_S88888_NEW']);
    expect(diff.baseRuleCount).toBe(3);
    expect(diff.candidateRuleCount).toBe(3);
    expect(diff.lostPropertyKeys).toEqual(['Ni']);
    expect(diff.lostRuleFields).toEqual([]);
    expect(diff.lostMetaFields).toEqual([]);
  });

  it('diffStandards 检出 property_key 变更与 meta 字段净减', () => {
    const base = loadStandardDirFrom(tmpRoot, 'base', [makeSlice()], makeMeta({ extra_field: 'x' }));
    const candidateSlice = makeSlice({
      evaluation_rules: [makeRule({ property_key: 'carbon', display_name: 'C含量 (C)' })],
    });
    const candidate = loadStandardDirFrom(tmpRoot, 'candidate', [candidateSlice]);

    const diff = diffStandards(base, candidate);
    expect(diff.changed.map((e) => e.ruleRef)).toEqual(['S88888/CHEM_S88888_C']);
    expect(diff.changed[0]!.detail).toContain('C -> carbon');
    expect(diff.lostPropertyKeys).toEqual(['C']);
    expect(diff.lostMetaFields).toEqual(['extra_field']);
  });

  it('scanPropertyKeyRegistry 汇集模块化与单体标准的 property_key', () => {
    const modular = path.join(tmpRoot, 'standards-modular');
    writeDir(modular, 'GB_T_88888_2024', [makeSlice()]);
    const registry = scanPropertyKeyRegistry(modular);
    expect(registry.has('C')).toBe(true);
    expect(registry.has('flattening_test')).toBe(false);
    expect(scanPropertyKeyRegistry(path.join(tmpRoot, 'not-exist')).size).toBe(0);
  });

  it('stdDirNameFromMeta 与 S4 目录命名规则一致', () => {
    expect(stdDirNameFromMeta({ standard_id: 'NB/T 47019.5-2021' })).toBe('NB_T_47019_5_2021');
    expect(stdDirNameFromMeta({ standard_id: 'GB/T 13296-2023' })).toBe('GB_T_13296_2023');
  });
});

function writeDir(root: string, name: string, slices: SliceOnDisk[], meta = makeMeta()): string {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, 'slices'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(dir, 'clauses.json'), JSON.stringify([], null, 2));
  for (const slice of slices) {
    fs.writeFileSync(
      path.join(dir, 'slices', `${slice.spec_key}_${slice.primary_grade || ''}.json`),
      JSON.stringify(slice, null, 2),
    );
  }
  return dir;
}

function loadStandardDirFrom(tmpRoot: string, name: string, slices: SliceOnDisk[], meta = makeMeta()) {
  const root = path.join(tmpRoot, `root-${name}`);
  const dir = writeDir(root, 'GB_T_88888_2024', slices, meta);
  return loadStandardDir(dir);
}
