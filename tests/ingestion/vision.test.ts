import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { transcribePdfByVision } from '@/ingestion/vision-transcribe';
import type { RenderPagesFn } from '@/ingestion/vision-transcribe';
import { ingestStandard } from '@/ingestion/ingest-pipeline';
import type { ChatClient, ChatContentPart, ChatMessage } from '@/ingestion/types';

/* 多模态视觉转录通道测试（v3）：分流逻辑、消息结构、逐页拼接、缓存命中、全链路集成。
   严禁真实 LLM 调用与真实渲染依赖（renderPages 可注入，单测不触碰 @napi-rs/canvas）。 */

/** 手工构造无文本层 PDF（空白页）：pdfjs 可解析、文本层 0 字符 -> 触发 NoTextLayerError 分流 */
function writeBlankPdf(filePath: string): void {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\nendstream',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  fs.writeFileSync(filePath, pdf, 'latin1');
}

/** 注入式渲染：写假 PNG（内容仅作 base64 载体），返回页列表 */
const fakeRender = (pageCount: number): RenderPagesFn => async (_pdfPath, outDir) => {
  fs.mkdirSync(outDir, { recursive: true });
  const pages: Array<{ pageNumber: number; pngPath: string }> = [];
  for (let i = 1; i <= pageCount; i++) {
    const pngPath = path.join(outDir, `page-${i}.png`);
    fs.writeFileSync(pngPath, Buffer.from(`fake-png-page-${i}`));
    pages.push({ pageNumber: i, pngPath });
  }
  return pages;
};

function userParts(messages: ChatMessage[]): ChatContentPart[] {
  const content = messages[1]?.content;
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return content ?? [];
}

// 视觉转录输出的小型标准文本（进 S1 的 fixture）
const VISION_TRANSCRIPTION_TEXT = `
GB/T 77777-2024
前 言
本文件按照 GB/T 1.1—2020 的规定起草。
1 范围
本文件规定了锅炉、热交换器用不锈钢无缝钢管的技术要求。
本文件适用于锅炉、热交换器用不锈钢无缝钢管。
7 技术要求
7.1 钢的牌号和化学成分
表2 钢的牌号和化学成分
组织 类型 序号 牌号 统一数字代号 C Si Mn P S Ni Cr
奥氏体型
1 06Cr19Ni10 S30408 0.08 1.00 2.00 0.035 0.015 8.00~11.00 18.00~20.00
7.4 力学性能
表3 室温力学性能
组织类型 序号 牌号 统一数字代号 抗拉强度Rm/MPa 规定塑性延伸强度Rp0.2/MPa 断后伸长率A/%
1 06Cr19Ni10 S30408 520 205 35
7.5 液压试验
7.5.1 钢管应逐根进行液压试验，最大试验压力不超过 20 MPa，稳压时间不少于 10s。
`.trim();

describe('视觉转录通道：transcribePdfByVision（注入渲染 + mock chat，零网络零 canvas）', () => {
  let tmpRoot: string;
  let pdfPath: string;
  let cacheDir: string;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'normscale-vision-'));
    pdfPath = path.join(tmpRoot, 'blank.pdf');
    writeBlankPdf(pdfPath);
    cacheDir = path.join(tmpRoot, 'cache');
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('逐页多模态调用：image_url data URL 结构、逐页拼接、vision-text.txt 落缓存', async () => {
    const calls: ChatMessage[][] = [];
    const chat: ChatClient = async (messages, opts) => {
      expect(opts.task).toBe('vision_transcribe');
      calls.push(messages);
      return `第 ${calls.length} 页转录文本`;
    };
    const render = fakeRender(2);
    const result = await transcribePdfByVision({ pdfPath, cacheDir, chat, renderPages: render });

    expect(result.pageCount).toBe(2);
    expect(calls.length).toBe(2);
    // 消息结构：system + user(content=[text part, image_url part])，与质保书管线双模态契约一致
    for (const [i, messages] of calls.entries()) {
      expect(messages[0]!.role).toBe('system');
      const parts = userParts(messages);
      expect(parts.length).toBe(2);
      expect(parts[0]).toMatchObject({ type: 'text' });
      expect(String((parts[0] as { text: string }).text)).toContain(`第 ${i + 1}/2 页`);
      expect(parts[1]!.type).toBe('image_url');
      const image = (parts[1] as { image_url: { url: string; detail?: string } }).image_url;
      expect(image.url.startsWith('data:image/png;base64,')).toBe(true);
      expect(image.detail).toBe('high');
      // base64 载体为渲染产物内容
      expect(Buffer.from(image.url.replace('data:image/png;base64,', ''), 'base64').toString()).toBe(`fake-png-page-${i + 1}`);
    }
    // 逐页拼接（【第 N 页】锚点）
    expect(result.fullText).toContain('【第 1 页】');
    expect(result.fullText).toContain('【第 2 页】');
    expect(result.fullText).toContain('第 1 页转录文本');
    // 转录全文落缓存
    expect(fs.existsSync(result.visionTextPath)).toBe(true);
  });

  it('缓存命中：vision-text.txt 存在时零渲染零调用', async () => {
    let chatCalls = 0;
    let renderCalls = 0;
    const chat: ChatClient = async () => {
      chatCalls += 1;
      return '不应被调用';
    };
    const render: RenderPagesFn = async () => {
      renderCalls += 1;
      return [];
    };
    const result = await transcribePdfByVision({ pdfPath, cacheDir, chat, renderPages: render });
    expect(chatCalls).toBe(0);
    expect(renderCalls).toBe(0);
    expect(result.fullText).toContain('【第 1 页】');
  });

  it('有限重试：空转录输出触发重试后成功；持续为空显式抛错', async () => {
    const cacheDirRetry = path.join(tmpRoot, 'cache-retry');
    let attempts = 0;
    const chatRetry: ChatClient = async () => {
      attempts += 1;
      return attempts === 1 ? '   ' : '重试后成功';
    };
    const result = await transcribePdfByVision({ pdfPath, cacheDir: cacheDirRetry, chat: chatRetry, renderPages: fakeRender(1) });
    expect(attempts).toBe(2);
    expect(result.fullText).toContain('重试后成功');

    const cacheDirFail = path.join(tmpRoot, 'cache-fail');
    let failAttempts = 0;
    const chatFail: ChatClient = async () => {
      failAttempts += 1;
      return '';
    };
    await expect(
      transcribePdfByVision({ pdfPath, cacheDir: cacheDirFail, chat: chatFail, renderPages: fakeRender(1) }),
    ).rejects.toThrow(/重试 2 次后仍失败/);
    expect(failAttempts).toBe(3); // 首次 + 2 次重试
  });
});

describe('视觉转录通道：管线分流与全链路集成（mock，零网络）', () => {
  let tmpRoot: string;
  let pdfPath: string;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'normscale-vision-pipe-'));
    pdfPath = path.join(tmpRoot, 'blank.pdf');
    writeBlankPdf(pdfPath);
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  /** S2 任务 mock（文本通道，覆盖 v2 全部任务） */
  function createTextChat(): ChatClient {
    return async (_messages, opts) => {
      switch (opts.task) {
        case 'meta':
          return JSON.stringify({ standard_id: 'GB/T 77777-2024', standard_name: '视觉转录试验标准', version: '2024', description: '本文件规定了锅炉、热交换器用不锈钢无缝钢管的技术要求。本文件适用于锅炉、热交换器用不锈钢无缝钢管。', status: 'CURRENT', material_category: 'ferrous_pipe', applies_to_forms: ['tube_seamless'] });
        case 'slices_chemical':
          return JSON.stringify({ slices: [{ spec_key: 'S30408', primary_grade: '06Cr19Ni10', structure_type: 'austenitic', display_name: '06Cr19Ni10 (S30408)', aliases: [], chemical_rules: [{ rule_id: 'CHEM_S30408_C', category: 'chemical', property_key: 'C', display_name: 'C含量 (C)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: null, max: 0.08, unit: '%', rounding_decimals: 3 }, source_clause: '表2' }] }] });
        case 'slices_mechanical':
          return JSON.stringify({ slices: [{ spec_key: 'S30408', primary_grade: '06Cr19Ni10', display_name: '06Cr19Ni10 (S30408)', aliases: [], mechanical_rules: [{ rule_id: 'MECH_S30408_RM', category: 'mechanical', property_key: 'tensile_strength', display_name: '抗拉强度 (Rm)', rule_type: 'numeric_range', requirement_level: 'MANDATORY', criteria: { min: 520, max: null, unit: 'MPa' }, source_clause: '表3' }] }] });
        case 'clauses':
          return JSON.stringify({ clauses: [{ clause_id: '7.5.1', title: '液压试验', text: '钢管应逐根进行液压试验。' }] });
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

  it('无文本层 PDF：默认转视觉通道走通全链路，text_source=vision，报告显著标注，重跑零视觉调用', async () => {
    const outRoot = path.join(tmpRoot, 'out');
    const cacheRoot = path.join(tmpRoot, 'cache');
    fs.mkdirSync(outRoot, { recursive: true });

    let visionCalls = 0;
    const visionChat: ChatClient = async (messages, opts) => {
      visionCalls += 1;
      expect(opts.task).toBe('vision_transcribe');
      const parts = userParts(messages);
      expect(parts.some((p) => p.type === 'image_url')).toBe(true);
      return VISION_TRANSCRIPTION_TEXT;
    };

    const result = await ingestStandard({
      pdfPath,
      chatClient: createTextChat(),
      visionChatClient: visionChat,
      renderPages: fakeRender(1),
      outRoot,
      cacheRoot,
      // 聚焦文本层通道行为，收窄声明族
      declaredFamilies: ['chemical', 'mechanical'],
    });

    expect(result.status).toBe('OK');
    expect(visionCalls).toBe(1);

    // meta.text_source 显式标记 + 报告显著标注
    const meta = JSON.parse(fs.readFileSync(path.join(result.stagingDir!, 'meta.json'), 'utf8'));
    expect(meta.text_source).toBe('vision');
    const report = fs.readFileSync(path.join(result.stagingDir!, 'review-report.md'), 'utf8');
    expect(report).toContain('多模态视觉转录');
    expect(report).toContain('人工抽检权重应提高');
    // 转录文本进了 S1：切片/条款源自转录文本（表2 化学块识别出 1 个牌号行）
    const sliceFiles = fs.readdirSync(path.join(result.stagingDir!, 'slices')).filter((f) => f.endsWith('.json'));
    expect(sliceFiles).toEqual(['S30408_06Cr19Ni10.json']);
    const clauses = JSON.parse(fs.readFileSync(path.join(result.stagingDir!, 'clauses.json'), 'utf8'));
    expect(clauses.length).toBe(1);

    // 重跑（同 cacheRoot）：vision-text.txt 缓存命中，零视觉调用
    const rerun = await ingestStandard({
      pdfPath,
      chatClient: createTextChat(),
      visionChatClient: visionChat,
      renderPages: fakeRender(1),
      outRoot,
      cacheRoot,
      declaredFamilies: ['chemical', 'mechanical'],
    });
    expect(rerun.status).toBe('OK');
    expect(visionCalls).toBe(1);
  }, 60000);

  it('无文本层 PDF + --no-vision：显式报错退回（NoTextLayerError），不触发视觉调用', async () => {
    const outRoot = path.join(tmpRoot, 'novision-out');
    fs.mkdirSync(outRoot, { recursive: true });
    let visionCalls = 0;
    const visionChat: ChatClient = async () => {
      visionCalls += 1;
      return VISION_TRANSCRIPTION_TEXT;
    };
    await expect(
      ingestStandard({
        pdfPath,
        chatClient: createTextChat(),
        visionChatClient: visionChat,
        noVision: true,
        renderPages: fakeRender(1),
        outRoot,
        cacheRoot: path.join(tmpRoot, 'novision-cache'),
        declaredFamilies: ['chemical', 'mechanical'],
      }),
    ).rejects.toThrow(/未提取到有效文本层/);
    expect(visionCalls).toBe(0);
  }, 60000);

  it('rawText 注入模式无 PDF 可供渲染：乱码仍显式抛 GarbledTextLayerError（视觉不可用）', async () => {
    const garbledText = ', #-./,. ,/"),0($1 .2,3 ,2.. /2.. .2.-3 .2.,3 02..!,.2.. ,42..!,12.. $ $ $ $';
    await expect(
      ingestStandard({
        rawText: garbledText,
        chatClient: createTextChat(),
        outRoot: path.join(tmpRoot, 'raw-garble-out'),
        cacheRoot: path.join(tmpRoot, 'raw-garble-cache'),
      }),
    ).rejects.toThrow(/乱码/);
  }, 60000);
});
