import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EN_ASME_PROFILE, sniffProfile, ZH_CN_PROFILE } from '@/ingestion/standard-profile';
import { countGradeRows, isGarbledText, segmentText } from '@/ingestion/segmenter';
import { runGates } from '@/ingestion/gates';
import { extractAll } from '@/ingestion/llm-extract';
import { ingestStandard } from '@/ingestion/ingest-pipeline';
import { transcribePdfByVision } from '@/ingestion/vision-transcribe';
import type { RenderPagesFn } from '@/ingestion/vision-transcribe';
import type { ChatClient, DraftRule, DraftSlice, TextBlock } from '@/ingestion/types';

/* 阶段 C StandardProfile 测试：嗅探互不误判、en 档切块（SA-213 真实文本片段 fixture）、
   en 乱码不误伤、zh 档回归、requireCjk 开关、en prompt 术语段、管线 profile 解析。严禁真实 LLM。 */

// ---- SA-213/SA-213M 真实文本片段（scratch/text-sa-213.txt 提取，断词连字符保留原样） ----
const SA213_SNIPPET = [
  'ASME BPVC.II.A-2023 SA-213/SA-213M',
  '280',
  '2801. Scope',
  '1.1 This specification covers seamless ferritic and auste-',
  'nitic steel boiler, superheater, and heat-exchanger tubes, des-',
  'ignated Grades T5, TP304, etc. These steels are listed in Tables',
  '1 and 2.',
  '281TABLE 1 Chemical Composition Limits, %A , for Low Alloy Steel',
  'Grade UNS',
  'Designation Composition, %',
  'Carbon Manga-',
  'nese',
  'T2 K11547 0.10–0.20 0.30–0.61 0.025 0.025B 0.10–0.30 ... 0.50–0.81 0.44–0.65 ... ... ... ... ... ... ...',
  'T5 K41545 0.15 0.30–0.60 0.025 0.025 0.50 ... 4.00–6.00 0.45–0.65 ... ... ... ... ... ... ...',
  'T91 Type 1 K90901 0.07–0.14 0.30–0.60 0.020 0.010 0.20–0.50 0.40 8.0–9.5 0.85–1.05 0.18–0.25',
  '283TABLE 2 Chemical Composition Limits, %A , for Austenitic and Ferritic Stainless Steel',
  'TP304 S30400 0.08 2.00 0.045 0.030 1.00 18.0–20.0 8.0–11.0 ... ... ... ... ...',
  'TP304L S30403 0.035D 2.00 0.045 0.030 1.00 18.0–20.0 8.0–12.0 ... ... ... ... ...',
  '9. Mechanical Properties',
  '9.3 Flattening Test—One flattening test shall be made on',
  'specimens from each end of one finished tube, not the one used',
  'for the flaring test, from each lot. See 15.1.',
  '10. Hydrostatic or Nondestructive Electric Test',
  '10.1 Each tube shall be subjected to the nondestructive electric',
  'test or the hydrostatic test. The type of test to be used',
  '290TABLE 4 Tensile and Hardness Requirements',
  'Grade UNS',
  'Designation',
  'T5b K51545 60 [415] 30 [205] 30 179 HBW/',
  '190HV',
  '89 HRB',
  'TABLE 6 Permitted Variations in Average Wall Thickness for Hot',
  'Formed Tubes',
  'Tolerance in %, from specified',
  'NPS [DN] Designator Over Under',
  '1⁄8 to 21⁄2 [6 to 65] incl,',
  'all t/D ratiosA',
  '20 12.5',
].join('\n');

const ZH_SNIPPET = [
  'GB/T 13296-2023',
  '前 言',
  '本文件按照 GB/T 1.1—2020 的规定起草。',
  '1 范围',
  '本文件规定了锅炉、热交换器用不锈钢无缝钢管的技术要求。',
  '7.4 力学性能',
  '表4 室温力学性能',
  '组织类型 序号 牌号 统一数字代号 抗拉强度Rm/MPa',
  '奥氏体型',
  '1 06Cr19Ni10 S30408 520 205 35',
].join('\n');

describe('阶段 C：profile 嗅探（中英互不误判）', () => {
  it('SA-213 英文全文 -> en-asme 置信度 >0.5；zh-cn 为 0', () => {
    const sniffed = sniffProfile(SA213_SNIPPET);
    expect(sniffed.profile.id).toBe('en-asme');
    expect(sniffed.confidence).toBeGreaterThan(0.5);
    expect(sniffed.candidates.find((c) => c.id === 'zh-cn')!.score).toBe(0);
  });

  it('GB 中文片段 -> zh-cn（en 分 <0.5 不采纳；全量中文文本直接采纳且置信度充足）', () => {
    const sniffed = sniffProfile(ZH_SNIPPET);
    expect(sniffed.profile.id).toBe('zh-cn');
    // 短样本表内数字/代号拉低 CJK 占比：真实不变量是 en-asme 分低于采纳阈值（不采纳）+ 回退缺省 zh-cn
    expect(sniffed.candidates.find((c) => c.id === 'en-asme')!.score).toBeLessThan(0.5);
    expect(EN_ASME_PROFILE.detect(ZH_SNIPPET)).toBeLessThan(0.5);
    // 全量中文正文（散文为主）：zh-cn 直接采纳且置信度 >0.5，en-asme 为 0
    const zhProse = '本文件规定了锅炉、热交换器用不锈钢无缝钢管的技术要求、试验方法与检验规则。钢管应经热处理并酸洗后交货，内外表面不得有裂缝与折叠。'.repeat(30);
    const fullSniff = sniffProfile(zhProse);
    expect(fullSniff.profile.id).toBe('zh-cn');
    expect(fullSniff.confidence).toBeGreaterThan(0.5);
    expect(EN_ASME_PROFILE.detect(zhProse)).toBe(0);
  });
});

describe('阶段 C：en-asme 档切块（SA-213 真实文本片段）', () => {
  const blocks = segmentText(SA213_SNIPPET, EN_ASME_PROFILE);
  const byRef = (ref: string) => blocks.find((b) => b.clauseRef === ref);

  it('锚点切块：页脚剔除、页码粘连标题/表锚归一、条款块成形', () => {
    // 页脚行（ASME BPVC…/独立页码）被剔除
    expect(blocks.some((b) => b.text.includes('ASME BPVC.II.A-2023 SA-213/SA-213M\n280'))).toBe(false);
    // 页码粘连标题 "2801. Scope" -> 条款 1（scope_text）；正文归入 1.1 块（换行断词连字符保留原样）
    expect(byRef('1')?.blockType).toBe('scope_text');
    expect(byRef('1.1')?.text).toContain('This specification covers seamless ferritic');
    // 页码粘连表锚 "281TABLE 1" -> TABLE1（chemistry_table，牌号行计数正确）
    expect(byRef('TABLE1')?.blockType).toBe('chemistry_table');
    expect(countGradeRows(byRef('TABLE1')!.text, EN_ASME_PROFILE)).toBe(3); // T2/T5/T91 Type 1
    expect(byRef('TABLE2')?.blockType).toBe('chemistry_table');
    // 条款块：压扁/液压 -> process_ndt_clauses；标题块 other
    expect(byRef('9')?.blockType).toBe('other'); // 纯标题块
    expect(byRef('9.3')?.blockType).toBe('process_ndt_clauses');
    expect(byRef('10')?.blockType).toBe('process_ndt_clauses');
    // 力学表与公差表
    expect(byRef('TABLE4')?.blockType).toBe('mechanical_table');
    expect(byRef('TABLE6')?.blockType).toBe('tolerance_table');
    // 乱码零误伤
    expect(blocks.some((b) => b.blockType === 'garbled')).toBe(false);
  });

  it('en 乱码检测：健康英文/数据表不误伤，真乱码判真', () => {
    expect(isGarbledText('The material shall conform to the requirements as to tensile properties given in Table 4.', EN_ASME_PROFILE)).toBe(false);
    expect(isGarbledText('T2 K11547 0.10–0.20 0.30–0.61 0.025 0.025B 0.10–0.30 ... 0.50–0.81 0.44–0.65 ... ... ... ...', EN_ASME_PROFILE)).toBe(false);
    expect(isGarbledText(', #-./,. ,/"),0($1 .2,3 ,2.. /2.. .2.-3 .2.,3 02..!,.2.. ,42..!,12..', EN_ASME_PROFILE)).toBe(true);
    // zh 档缺省行为不变（健康英文行因"无 CJK + 符号多样性不足"不误判，与历史一致）
    expect(isGarbledText('The material shall conform to requirements.')).toBe(false);
  });

  it('同文本 zh 档对照：无法路由英文块（other 为主），验证 profile 必要性', () => {
    const zhBlocks = segmentText(SA213_SNIPPET, ZH_CN_PROFILE);
    expect(zhBlocks.find((b) => b.clauseRef === 'TABLE1')?.blockType).not.toBe('chemistry_table');
  });
});

describe('阶段 C：requireCjk 开关（en 档关闭 CJK 语言 lint）', () => {
  const enSlice: DraftSlice = {
    spec_key: 'TP304',
    spec_type: 'grade',
    standard_code: 'SA-213/SA-213M',
    display_name: 'TP304 (S30400)',
    primary_grade: 'TP304',
    unified_code: 'S30400',
    structure_type: 'austenitic',
    description: 'Seamless austenitic alloy-steel boiler tube grade.',
    aliases: ['SUS304', '1.4301'],
    evaluation_rules: [
      { rule_id: 'CHEM_C', category: 'chemical', property_key: 'C', display_name: 'Carbon (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%' }, source_clause: 'TABLE1' },
      { rule_id: 'MECH_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: 'Tensile Strength (Rm)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 515, max: null, unit: 'MPa' }, source_clause: 'TABLE4' },
    ] as DraftRule[],
  };
  const gate = (requireCjk?: boolean) =>
    runGates({
      meta: {
        standard_id: 'GB/T 99999-2024',
        standard_name: 'Seamless Ferritic and Austenitic Alloy-Steel Boiler Tubes',
        version: '2024',
        description: 'This specification covers seamless ferritic and austenitic steel boiler tubes.',
        status: 'CURRENT',
        material_category: 'ferrous_pipe',
        applies_to_forms: ['tube_seamless'],
      },
      slices: [enSlice],
      clauses: [],
      clauseTextIndex: {},
      expectedGradeRows: null,
      declaredFamilies: ['chemical', 'mechanical'],
      requireCjk,
    });

  it('requireCjk=false：英文 display_name/description 不触发语言 lint', () => {
    const result = gate(false);
    expect(result.issues.some((i) => i.code === 'LINT_LANGUAGE_CONSISTENCY')).toBe(false);
  });

  it('缺省 requireCjk=true：非 CJK 描述仍被拦截（行为不变）', () => {
    const result = gate(undefined);
    expect(result.issues.some((i) => i.code === 'LINT_LANGUAGE_CONSISTENCY')).toBe(true);
  });
});

describe('阶段 C：en prompt 术语段与视觉转录 locale', () => {
  it('extractAll（en profile）化学 prompt 注入 ASME 牌号/UNS 惯例', async () => {
    const contents = new Map<string, string>();
    const chat: ChatClient = async (messages, opts) => {
      const content = messages[1]?.content;
      contents.set(opts.task, typeof content === 'string' ? content : '');
      switch (opts.task) {
        case 'meta':
          return JSON.stringify({ standard_id: 'SA-213/SA-213M', standard_name: 'Seamless Ferritic and Austenitic Alloy-Steel Boiler Tubes', version: '2023', description: 'Covers seamless tubes.', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] });
        case 'slices_chemical':
          return JSON.stringify({ slices: [] });
        case 'slices_mechanical':
          return JSON.stringify({ slices: [] });
        case 'clauses':
          return JSON.stringify({ clauses: [] });
        case 'process_rules':
        case 'dynamic_formulas':
          return JSON.stringify({ rules: [] });
        case 'tolerance_tables':
          return JSON.stringify({ tables: [] });
        default:
          throw new Error(`未知任务类型: ${opts.task}`);
      }
    };
    const chemBlock: TextBlock = { blockType: 'chemistry_table', clauseRef: 'TABLE1', text: 'TABLE 1 Chemical Composition\nT2 K11547 0.10' };
    await extractAll([chemBlock], chat, undefined, undefined, EN_ASME_PROFILE);
    const prompt = contents.get('slices_chemical') ?? '';
    expect(prompt).toContain('ASME 无统一数字代号');
    expect(prompt).toContain('UNS 代号');
    expect(prompt).toContain('TP304');
  });

  it('视觉转录 locale=en：prompt 表格行约定切换英文表述', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'normscale-profile-vision-'));
    try {
      const pdfPath = path.join(tmpRoot, 'blank.pdf');
      fs.writeFileSync(pdfPath, '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 0 >>\nstream\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \ntrailer\n<< /Size 5 /Root 1 0 R >>\n%%EOF\n');
      const render: RenderPagesFn = async (_pdf, outDir) => {
        fs.mkdirSync(outDir, { recursive: true });
        const pngPath = path.join(outDir, 'page-1.png');
        fs.writeFileSync(pngPath, Buffer.from('fake'));
        return [{ pageNumber: 1, pngPath }];
      };
      let captured = '';
      const chat: ChatClient = async (messages) => {
        const content = messages[1]?.content;
        captured = typeof content === 'string' ? content : (content?.[0] as { text: string }).text;
        return 'page text';
      };
      await transcribePdfByVision({ pdfPath, cacheDir: path.join(tmpRoot, 'cache'), chat, renderPages: render, locale: 'en' });
      expect(captured).toContain('Expand tables row by row');
      expect(captured).toContain('TP304 S30400');
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe('阶段 C：管线 profile 解析（显式 > 嗅探；写入 meta 与报告）', () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'normscale-profile-pipe-'));
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function enChat(): ChatClient {
    return async (_messages, opts) => {
      switch (opts.task) {
        case 'meta':
          return JSON.stringify({ standard_id: 'SA-213/SA-213M', standard_name: 'Seamless Ferritic and Austenitic Alloy-Steel Boiler Tubes', version: '2023', description: 'This specification covers seamless tubes.', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] });
        case 'slices_chemical':
          return JSON.stringify({ slices: [{ spec_key: 'TP304', primary_grade: 'TP304', structure_type: 'austenitic', display_name: 'TP304 (S30400)', aliases: ['SUS304'], chemical_rules: [{ rule_id: 'CHEM_TP304_C', category: 'chemical', property_key: 'C', display_name: 'Carbon (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: 'TABLE1' }] }] });
        case 'slices_mechanical':
          return JSON.stringify({ slices: [{ spec_key: 'TP304', primary_grade: 'TP304', display_name: 'TP304 (S30400)', aliases: [], mechanical_rules: [{ rule_id: 'MECH_TP304_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: 'Tensile Strength (Rm)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 515, max: null, unit: 'MPa' }, source_clause: 'TABLE4' }] }] });
        case 'clauses':
          return JSON.stringify({ clauses: [] });
        case 'process_rules':
        case 'dynamic_formulas':
          return JSON.stringify({ rules: [] });
        case 'tolerance_tables':
          return JSON.stringify({ tables: [] });
        default:
          throw new Error(`未知任务类型: ${opts.task}`);
      }
    };
  }

  it('英文 rawText 嗅探自动判定 en-asme：meta/报告记录，英文描述过语言 lint', async () => {
    const outRoot = path.join(tmpRoot, 'out');
    fs.mkdirSync(outRoot, { recursive: true });
    const fixtureText = [
      '1. Scope',
      '1.1 This specification covers seamless ferritic and austenitic steel tubes designated Grades TP304.',
      '281TABLE 1 Chemical Composition Limits',
      'TP304 S30400 0.08 2.00 0.045 0.030 1.00 18.0–20.0 8.0–11.0',
      '290TABLE 4 Tensile and Hardness Requirements',
      'TP304 S30400 75 [515] 30 [205] 35 ... ...',
    ].join('\n');
    const result = await ingestStandard({
      rawText: fixtureText,
      chatClient: enChat(),
      outRoot,
      cacheRoot: path.join(tmpRoot, 'cache'),
      declaredFamilies: ['chemical', 'mechanical'],
    });
    expect(result.status).toBe('OK');
    const meta = JSON.parse(fs.readFileSync(path.join(result.stagingDir!, 'meta.json'), 'utf8'));
    expect(meta.standard_profile).toBe('en-asme');
    const report = fs.readFileSync(path.join(result.stagingDir!, 'review-report.md'), 'utf8');
    expect(report).toContain('标准档（profile）: en-asme');
  }, 60000);

  it('显式 --profile zh-cn 优先于嗅探：CJK lint 开启（GB 前缀标准号门内）', async () => {
    const outRoot = path.join(tmpRoot, 'out-zh');
    fs.mkdirSync(outRoot, { recursive: true });
    const zhChat: ChatClient = async (_messages, opts) => {
      if (opts.task === 'meta') {
        // GB 前缀标准号 + 英文名称/描述：zh 档 requireCjk 开启时语言 lint 必触发
        return JSON.stringify({ standard_id: 'GB/T 99999-2024', standard_name: 'Seamless Ferritic and Austenitic Alloy-Steel Boiler Tubes', version: '2024', description: 'This specification covers seamless tubes.', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] });
      }
      return enChat()(_messages, opts);
    };
    const result = await ingestStandard({
      rawText: '1 范围\n本文件规定了无缝钢管的技术要求。\n表1 化学成分\nTP304 S30400 0.08 2.00',
      chatClient: zhChat,
      profile: 'zh-cn',
      outRoot,
      cacheRoot: path.join(tmpRoot, 'cache-zh'),
      declaredFamilies: ['chemical', 'mechanical'],
    });
    expect(result.status).toBe('MANUAL_REVIEW');
    expect(result.issues.some((i) => i.code === 'LINT_LANGUAGE_CONSISTENCY')).toBe(true);
    expect(result.drafts?.meta.standard_profile).toBe('zh-cn');
  }, 60000);
});
