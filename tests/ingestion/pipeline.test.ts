import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ingestStandard } from '@/ingestion/ingest-pipeline';
import { StandardMetaSchema, SpecificationSliceSchema, StandardClauseSchema } from '@/schemas/standard.schema';
import type { ChatClient } from '@/ingestion/types';

/* 集成测试：注入 mock 聊天客户端（返回预制 JSON），用小型 fixture 文本走通 S1->S4 到临时目录。
   严禁写真实 data/standards，严禁任何真实 LLM 网络调用。 */

const FIXTURE_TEXT = `
GB/T 99999-2024
前 言
本文件按照 GB/T 1.1—2020 的规定起草。
1 范围
本文件规定了锅炉、热交换器用不锈钢无缝钢管的技术要求。
本文件适用于锅炉、热交换器用不锈钢无缝钢管。
7 技术要求
7.1 钢的牌号和化学成分
7.1.1 钢的牌号和化学成分(熔炼分析)应符合表2的规定。
表2 钢的牌号和化学成分
组织
类型
序号 牌号 统一数字代号 化学成分（质量分数） C Si Mn P S Ni Cr
不大于
奥氏体型
1 06Cr19Ni10 S30408 0.08 1.00 2.00 0.035 0.015 8.00~
11.00
18.00~
20.00
— —
2 022Cr19Ni10 S30403 0.030 1.00 2.00 0.035 0.015 8.00~
12.00
18.00~
20.00
— —
7.4 力学性能
7.4.1 热处理状态钢管的室温纵向拉伸性能应符合表3的规定。
表3 室温力学性能
组织类型 序号 牌号 统一数字代号 抗拉强度Rm/MPa 规定塑性延伸强度Rp0.2/MPa 断后伸长率A/%
奥氏体型
1 06Cr19Ni10 S30408 520 205 35
2 022Cr19Ni10 S30403 480 175 35
7.5 液压试验
7.5.1 钢管应逐根进行液压试验，试验压力按式 P=2SR/D 计算。最大试验压力不超过 20 MPa，稳压时间不少于 10s。
`.trim();

interface MockResponse {
  meta?: Record<string, unknown>;
  slices?: unknown;
  clauses?: unknown;
}

function createMockChat(overrides: MockResponse = {}): ChatClient {
  return async (_messages, opts) => {
    switch (opts.task) {
      case 'meta':
        return JSON.stringify(
          overrides.meta ?? {
            standard_id: 'GB/T 99999-2024',
            standard_name: '试验用不锈钢无缝钢管标准',
            version: '2024',
            description: '本文件规定了锅炉、热交换器用不锈钢无缝钢管的技术要求。本文件适用于锅炉、热交换器用不锈钢无缝钢管。',
            status: 'CURRENT',
            material_category: 'ferrous_pipe',
            applies_to_forms: ['tube_seamless'],
          },
        );
      case 'slices_chemical':
        return JSON.stringify(
          overrides.slices ?? {
            slices: [
              {
                spec_key: 'S30408',
                spec_type: 'grade',
                standard_code: 'GB/T 99999-2024',
                primary_grade: '06Cr19Ni10',
                structure_type: 'austenitic',
                display_name: '06Cr19Ni10 (S30408) 不锈钢管',
                description: 'GB/T 99999-2024 表2 化学成分切片',
                aliases: [],
                chemical_rules: [
                  { rule_id: 'CHEM_S30408_C', category: 'chemical', property_key: 'C', display_name: 'C含量 (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: '表2' },
                  { rule_id: 'CHEM_S30408_Ni', category: 'chemical', property_key: 'Ni', display_name: 'Ni含量 (Ni)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 8, max: 11, unit: '%', rounding_decimals: 2 }, source_clause: '表2' },
                ],
              },
              {
                spec_key: 'S30403',
                spec_type: 'grade',
                standard_code: 'GB/T 99999-2024',
                primary_grade: '022Cr19Ni10',
                structure_type: 'austenitic',
                display_name: '022Cr19Ni10 (S30403) 不锈钢管',
                description: 'GB/T 99999-2024 表2 化学成分切片',
                aliases: [],
                chemical_rules: [
                  { rule_id: 'CHEM_S30403_C', category: 'chemical', property_key: 'C', display_name: 'C含量 (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.030, unit: '%', rounding_decimals: 3 }, source_clause: '表2' },
                ],
              },
            ],
          },
        );
      case 'slices_mechanical':
        return JSON.stringify({
          slices: [
            {
              spec_key: 'S30408',
              spec_type: 'grade',
              standard_code: 'GB/T 99999-2024',
              primary_grade: '06Cr19Ni10',
              display_name: '06Cr19Ni10 (S30408) 不锈钢管',
              description: 'GB/T 99999-2024 表3 力学性能切片',
              aliases: [],
              mechanical_rules: [
                { rule_id: 'MECH_S30408_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 520, max: null, unit: 'MPa' }, source_clause: '表3' },
                { rule_id: 'MECH_S30408_RP02', category: 'mechanical', property_key: 'yield_strength_rp02', display_name: '规定塑性延伸强度 (Rp0.2)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 205, max: null, unit: 'MPa' }, source_clause: '表3' },
              ],
            },
            {
              spec_key: 'S30403',
              spec_type: 'grade',
              standard_code: 'GB/T 99999-2024',
              primary_grade: '022Cr19Ni10',
              display_name: '022Cr19Ni10 (S30403) 不锈钢管',
              description: 'GB/T 99999-2024 表3 力学性能切片',
              aliases: [],
              mechanical_rules: [
                { rule_id: 'MECH_S30403_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 480, max: null, unit: 'MPa' }, source_clause: '表3' },
              ],
            },
          ],
        });
      case 'clauses':
        return JSON.stringify(
          overrides.clauses ?? {
            clauses: [
              { clause_id: '7.5.1', title: '液压试验', text: '钢管应逐根进行液压试验，试验压力按式 P=2SR/D 计算。最大试验压力不超过 20 MPa，稳压时间不少于 10s。' },
            ],
          },
        );
      default:
        throw new Error(`未知任务类型: ${opts.task}`);
    }
  };
}

describe('S1->S4 入库管线集成测试（mock LLM，临时目录）', () => {
  let tmpRoot: string;
  let outRoot: string;
  let cacheRoot: string;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'normscale-ingest-it-'));
    outRoot = path.join(tmpRoot, 'standards');
    cacheRoot = path.join(tmpRoot, 'cache');
    fs.mkdirSync(outRoot, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('全链路走通：S1 切块 -> S2 提取 -> S3 门禁 -> S4 staging 落盘（正式库零触碰）', async () => {
    const result = await ingestStandard({
      rawText: FIXTURE_TEXT,
      chatClient: createMockChat(),
      outRoot,
      cacheRoot,
    });

    expect(result.status).toBe('OK');
    expect(result.issues).toEqual([]);


    // 产物只落 staging（缺省 <cacheRoot>/staging），正式库目录不得生成
    const stagingDir = path.join(cacheRoot, 'staging', 'GB_T_99999_2024');
    expect(result.stagingDir).toBe(stagingDir);
    const stdDir = path.join(outRoot, 'GB_T_99999_2024');
    expect(result.stdDir).toBe(stdDir);
    expect(fs.existsSync(stdDir)).toBe(false);

    // meta.json 契约合法且声明提取规则族
    const meta = JSON.parse(fs.readFileSync(path.join(stagingDir, 'meta.json'), 'utf8'));
    expect(() => StandardMetaSchema.parse(meta)).not.toThrow();
    expect(meta.standard_id).toBe('GB/T 99999-2024');
    expect(meta.extracted_families).toEqual(['chemical', 'mechanical']);

    // clauses.json 契约合法
    const clauses = JSON.parse(fs.readFileSync(path.join(stagingDir, 'clauses.json'), 'utf8'));
    expect(clauses.length).toBe(1);
    expect(() => StandardClauseSchema.parse(clauses[0])).not.toThrow();

    // 两个切片文件，命名沿用 GB_T_13296 惯例
    const sliceFiles = fs.readdirSync(path.join(stagingDir, 'slices')).filter((f) => f.endsWith('.json'));
    expect(sliceFiles.sort()).toEqual(['S30403_022Cr19Ni10.json', 'S30408_06Cr19Ni10.json']);

    const s30408 = JSON.parse(fs.readFileSync(path.join(stagingDir, 'slices', 'S30408_06Cr19Ni10.json'), 'utf8'));
    expect(() => SpecificationSliceSchema.parse(s30408)).not.toThrow();
    expect(s30408.spec_key).toBe('S30408');
    // 部分覆盖产物标记（与存量切片标记形态一致）
    expect(s30408.coverage).toBe('partial');
    expect(s30408.extracted_families).toEqual(['chemical', 'mechanical']);
    // 化学 + 力学规则均覆盖，且 source_clause 已剥离
    const categories = new Set(s30408.evaluation_rules.map((r: { category: string }) => r.category));
    expect(categories.has('chemical')).toBe(true);
    expect(categories.has('mechanical')).toBe(true);
    s30408.evaluation_rules.forEach((r: Record<string, unknown>) => {
      expect(r).not.toHaveProperty('source_clause');
    });
    const cRule = s30408.evaluation_rules.find((r: { rule_id: string }) => r.rule_id === 'CHEM_S30408_C');
    expect(cRule.criteria.max).toBe(0.08);

    // 人工抽检报告生成且含关键对照
    const report = fs.readFileSync(path.join(stagingDir, 'review-report.md'), 'utf8');
    expect(report).toContain('GB/T 99999-2024');
    expect(report).toContain('CHEM_S30408_C');
    expect(report).toContain('来源条款');
    expect(report).toContain('全部通过');
    // 无存量同标准 -> 无 diff 章节
    expect(report).not.toContain('与存量规则级全量 diff');

    // 缓存中间产物齐备
    expect(fs.existsSync(path.join(cacheRoot))).toBe(true);
  }, 60000);

  it('存量同标准存在时：staging 报告含规则级全量 diff 且存在丢失项不得判定全部通过', async () => {
    // 预置存量标准（同 standard_id），含一条候选产物没有的旧规则
    const existingDir = path.join(outRoot, 'GB_T_99999_2024');
    fs.mkdirSync(path.join(existingDir, 'slices'), { recursive: true });
    fs.writeFileSync(
      path.join(existingDir, 'meta.json'),
      JSON.stringify({
        standard_id: 'GB/T 99999-2024',
        standard_name: '试验用不锈钢无缝钢管标准',
        version: '2024',
        status: 'CURRENT',
        material_category: 'ferrous_pipe',
        applies_to_forms: ['tube_seamless'],
      }),
    );
    fs.writeFileSync(path.join(existingDir, 'clauses.json'), JSON.stringify([]));
    fs.writeFileSync(
      path.join(existingDir, 'slices', 'S30408_06Cr19Ni10.json'),
      JSON.stringify({
        spec_key: 'S30408',
        spec_type: 'grade',
        display_name: '06Cr19Ni10 (S30408) 不锈钢管',
        primary_grade: '06Cr19Ni10',
        standard_code: 'GB/T 99999-2024',
        description: '存量切片',
        aliases: [],
        evaluation_rules: [
          // 与候选同 rule_id 且数值一致 -> diff 中无变更项（注册表同时覆盖候选 property_key）
          { rule_id: 'CHEM_S30408_C', category: 'chemical', property_key: 'C', display_name: 'C含量 (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 } },
          { rule_id: 'CHEM_S30408_Ni', category: 'chemical', property_key: 'Ni', display_name: 'Ni含量 (Ni)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 8, max: 11, unit: '%', rounding_decimals: 2 } },
          { rule_id: 'MECH_S30408_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 520, max: null, unit: 'MPa' } },
          { rule_id: 'MECH_S30408_RP02', category: 'mechanical', property_key: 'yield_strength_rp02', display_name: '规定塑性延伸强度 (Rp0.2)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 205, max: null, unit: 'MPa' } },
          // 候选产物没有的存量规则 -> diff 丢失项
          { rule_id: 'MECH_S30408_LEGACY', category: 'mechanical', property_key: 'hardness', display_name: '硬度 (HBW)', rule_type: 'or_choice_group', requirement_level: 'OPTIONAL_AGREED', criteria: { options: [{ sub_key: 'HBW', rule_type: 'numeric_range', criteria: { max: 192, unit: 'HBW' } }] } },
        ],
      }),
    );

    const result = await ingestStandard({
      rawText: FIXTURE_TEXT,
      chatClient: createMockChat(),
      outRoot,
      cacheRoot,
    });

    expect(result.status).toBe('OK');
    const report = fs.readFileSync(path.join(result.stagingDir!, 'review-report.md'), 'utf8');
    expect(report).toContain('与存量规则级全量 diff');
    expect(report).toContain('MECH_S30408_LEGACY');
    expect(report).toContain('丢失');
    expect(report).toContain('不得判定');
    expect(report).not.toContain('- 门禁结论: 全部通过');
    // 存量目录未被触碰
    expect(fs.existsSync(path.join(existingDir, 'slices', 'S30408_06Cr19Ni10.json'))).toBe(true);
  }, 60000);

  it('命名漂移 wiring：注册表外的 property_key 触发 MANUAL_REVIEW 且不落 staging', async () => {
    const driftOut = path.join(tmpRoot, 'drift-out');
    const driftCache = path.join(tmpRoot, 'drift-cache');
    fs.mkdirSync(driftOut, { recursive: true });

    // 预置一部含已知 key 的标准，使注册表非空
    const existingDir = path.join(driftOut, 'GB_T_11111_2020');
    fs.mkdirSync(path.join(existingDir, 'slices'), { recursive: true });
    fs.writeFileSync(
      path.join(existingDir, 'meta.json'),
      JSON.stringify({ standard_id: 'GB/T 11111-2020', standard_name: '既有标准', status: 'CURRENT' }),
    );
    fs.writeFileSync(path.join(existingDir, 'clauses.json'), JSON.stringify([]));
    fs.writeFileSync(
      path.join(existingDir, 'slices', 'S30408_06Cr19Ni10.json'),
      JSON.stringify({
        spec_key: 'S30408',
        spec_type: 'grade',
        display_name: '06Cr19Ni10 (S30408) 不锈钢管',
        evaluation_rules: [
          { rule_id: 'CHEM_S30408_C', category: 'chemical', property_key: 'C', display_name: 'C含量 (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { max: 0.08, unit: '%' } },
        ],
      }),
    );

    // 候选产物使用注册表外的 property_key（LLM 命名漂移）
    const driftChat = createMockChat({
      slices: {
        slices: [
          {
            spec_key: 'S30408',
            spec_type: 'grade',
            standard_code: 'GB/T 99999-2024',
            primary_grade: '06Cr19Ni10',
            structure_type: 'austenitic',
            display_name: '06Cr19Ni10 (S30408) 不锈钢管',
            description: 'GB/T 99999-2024 表2 化学成分切片',
            aliases: [],
            chemical_rules: [
              { rule_id: 'CHEM_S30408_C', category: 'chemical', property_key: 'carbon_content', display_name: 'C含量 (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: '表2' },
            ],
          },
          {
            spec_key: 'S30403',
            spec_type: 'grade',
            standard_code: 'GB/T 99999-2024',
            primary_grade: '022Cr19Ni10',
            structure_type: 'austenitic',
            display_name: '022Cr19Ni10 (S30403) 不锈钢管',
            description: 'GB/T 99999-2024 表2 化学成分切片',
            aliases: [],
            chemical_rules: [
              { rule_id: 'CHEM_S30403_C', category: 'chemical', property_key: 'C', display_name: 'C含量 (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.030, unit: '%', rounding_decimals: 3 }, source_clause: '表2' },
            ],
          },
        ],
      },
    });

    const result = await ingestStandard({
      rawText: FIXTURE_TEXT,
      chatClient: driftChat,
      outRoot: driftOut,
      cacheRoot: driftCache,
    });

    expect(result.status).toBe('MANUAL_REVIEW');
    expect(result.issues.some((i) => i.code === 'LINT_PROPERTY_KEY_REGISTRY' && i.message.includes('carbon_content'))).toBe(true);
    // 门禁失败：staging 与正式库均不得生成该标准目录
    expect(fs.existsSync(path.join(driftCache, 'staging', 'GB_T_99999_2024'))).toBe(false);
    expect(fs.existsSync(path.join(driftOut, 'GB_T_99999_2024'))).toBe(false);
  }, 60000);

  it('门禁失败路径：幻觉数值 -> MANUAL_REVIEW，不写正式库', async () => {
    const hallucinatedDir = path.join(tmpRoot, 'halluc-out');
    const hallucCache = path.join(tmpRoot, 'halluc-cache');
    fs.mkdirSync(hallucinatedDir, { recursive: true });

    // C 上限 0.09 不在原文（原文为 0.08）-> 溯源断言必拒
    const badChat = createMockChat({
      slices: {
        slices: [
          {
            spec_key: 'S30408',
            primary_grade: '06Cr19Ni10',
            structure_type: 'austenitic',
            display_name: '06Cr19Ni10 (S30408)',
            aliases: [],
            chemical_rules: [
              { rule_id: 'CHEM_S30408_C', category: 'chemical', property_key: 'C', display_name: 'C含量 (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.09, unit: '%', rounding_decimals: 3 }, source_clause: '表2' },
            ],
          },
        ],
      },
    });

    const result = await ingestStandard({
      rawText: FIXTURE_TEXT,
      chatClient: badChat,
      outRoot: hallucinatedDir,
      cacheRoot: hallucCache,
    });

    expect(result.status).toBe('MANUAL_REVIEW');
    expect(result.issues.some((i) => i.code === 'TRACE_NUMBER_LITERAL')).toBe(true);
    // 正式库目录不得生成
    expect(fs.existsSync(path.join(hallucinatedDir, 'GB_T_99999_2024'))).toBe(false);
    // 报告落缓存目录
    expect(result.reportPath).toBeTruthy();
    expect(fs.existsSync(result.reportPath!)).toBe(true);
  }, 60000);

  it('乱码文本显式抛 GarbledTextLayerError，绝不静默降级', async () => {
    const garbledText = `${FIXTURE_TEXT}\n, #-./,. ,/"),0($1 .2,3 ,2.. /2.. .2.-3 .2.,3 02..!,.2.. ,42..!,12.. $ $ $ $`;
    const garbledOut = path.join(tmpRoot, 'garble-out');
    fs.mkdirSync(garbledOut, { recursive: true });

    await expect(
      ingestStandard({
        rawText: garbledText,
        chatClient: createMockChat(),
        outRoot: garbledOut,
        cacheRoot: path.join(tmpRoot, 'garble-cache'),
      }),
    ).rejects.toThrow(/乱码/);
  }, 60000);
});
