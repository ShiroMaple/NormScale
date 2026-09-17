import fs from 'node:fs';
import path from 'node:path';
import { ModelApiExecutionError } from './llm-extract.ts';
import type { ChatClient, ChatContentPart, ChatMessage } from './types.ts';

/* ==========================================================================
   S0-S1 视觉转录通道 (Vision Transcribe) —— v3
   - 适用：PDF 无文本层（扫描件）或文本层乱码（字体子集化无 ToUnicode）——
     此类文档走多模态视觉转录，逐页渲染 PNG 送双模态模型转录为纯文本后主文本续走 S1->S4
   - 渲染：pdfjs-dist + @napi-rs/canvas 逐页渲染（scale 2.0），缓存 .cache/standard-ingest/{md5}/pages/page-N.png；
     renderPages 可注入替换（测试零渲染依赖，import 失败时显式报错）
   - 转录：逐页调用 + 有限重试（最多 2 次，携带上次错误上下文），聊天客户端可注入；
     消息结构为 OpenAI 兼容多模态 content 数组（与质保书管线
     src/extractor/openai-compatible-extractor.ts 的双模态输入契约一致）
   - 缓存：转录全文落 vision-text.txt，重跑零重复调用；绝不静默吞错
   ========================================================================== */

export interface PageImage {
  pageNumber: number;
  pngPath: string;
}

export type RenderPagesFn = (pdfPath: string, outDir: string) => Promise<PageImage[]>;

const RENDER_SCALE = 2.0;
const MAX_RETRY = 2;
const VISION_TEXT_FILE = 'vision-text.txt';

export class CanvasRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanvasRenderError';
  }
}

/**
 * 默认渲染实现：pdfjs-dist 逐页渲染 PNG（scale 2.0）至 outDir。
 * @napi-rs/canvas 为懒加载：未安装时显式报错（pnpm add -D @napi-rs/canvas），
 * 绝不静默降级；Windows/Node 24 使用其预编译二进制。
 */
export const renderPdfPagesToPng: RenderPagesFn = async (pdfPath, outDir) => {
  let napiCanvas: typeof import('@napi-rs/canvas');
  try {
    napiCanvas = await import('@napi-rs/canvas');
  } catch {
    throw new CanvasRenderError('渲染 PDF 页面需要 @napi-rs/canvas 依赖（Node 侧 canvas 实现）。请先执行: pnpm add -D @napi-rs/canvas');
  }

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const buffer = fs.readFileSync(pdfPath);
  const loadingTask = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, verbosity: 0 });
  const doc = await loadingTask.promise;
  fs.mkdirSync(outDir, { recursive: true });

  const pages: PageImage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = napiCanvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      // pdfjs v6 RenderParameters 要求 canvas 与 canvasContext 同传；napi canvas 与 DOM canvas 结构兼容，走类型断言
      await page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        canvas: canvas as unknown as HTMLCanvasElement,
        viewport,
      }).promise;
      const pngPath = path.join(outDir, `page-${pageNumber}.png`);
      fs.writeFileSync(pngPath, canvas.toBuffer('image/png'));
      pages.push({ pageNumber, pngPath });
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages;
};

const TRANSCRIBE_SYSTEM_PROMPT = [
  '你是工业国家/行业标准文档视觉转录引擎，服务于质保书合规检验引擎的数据入库。',
  '只输出转录文本本身：禁止输出解释性文字、页眉页脚分析或代码围栏。',
  '所有内容必须与图中逐字一致：禁止换算、修约、补零、补全或推测；看不清的内容标注 [无法辨认]。',
].join('\n');

function transcribeUserPrompt(pageNumber: number, totalPages: number, locale: 'zh' | 'en'): string {
  const tableConvention = locale === 'en'
    ? '2. Expand tables row by row: one text line per row preserving column order (e.g., "Grade UNS Designation Carbon Manganese Phosphorus Sulfur ..."); grade rows keep the "TP304 S30400 0.08 2.00 ..." form, with wrapped continuation lines carried by newlines.'
    : '2. 表格按行展开：每行一条文本行并保持列值顺序（如"序号 牌号 统一数字代号 C Si Mn P S Ni Cr"），牌号行保持"1 06Cr19Ni10 S30408 0.08 1.00 …"形态，续行用换行承接。';
  const anchorConvention = locale === 'en'
    ? '3. Keep clause and table anchors (e.g., "9.3 Flattening Test", "TABLE 4 Tensile and Hardness Requirements"); do not add content not present in the image.'
    : '3. 保留章节号与表号锚点（如"6.5.1 压扁"、"表2 室温力学性能"），不得添加图中没有的内容。';
  return [
    locale === 'en' ? `【Task】Faithfully transcribe page ${pageNumber}/${totalPages} of the standard document image into plain text.` : `【任务】将第 ${pageNumber}/${totalPages} 页标准文档图像忠实转录为纯文本。`,
    '【硬性要求】',
    locale === 'en' ? '1. Transcribe verbatim: values, symbols, units, and grade designations must match the image exactly; no conversion or speculation.' : '1. 逐字忠实转录：数值、符号、单位、牌号代号必须与图中一致，严禁换算或推测。',
    tableConvention,
    anchorConvention,
    locale === 'en' ? '4. Mark illegible content as [无法辨认]; never guess or fabricate.' : '4. 看不清/无法辨认的内容标注 [无法辨认]，严禁猜测编造。',
    locale === 'en' ? '5. Ignore running headers/footers (book code/spec code/page number); transcribe only body text and tables.' : '5. 忽略页脚（标准编号/页码），仅输出本页正文与表格转录。',
    locale === 'en' ? '6. Write formulas in plain text/Unicode symbols (e.g., "W=pi/1000*rho*S*(D-S)"); LaTeX markup (\\frac, \\pi, etc.) is forbidden.' : '6. 公式用纯文本/Unicode 符号书写（如 "W=π/1000ρS(D-S)"），严禁使用 LaTeX 标记（\\frac、\\pi 等）。',
  ].join('\n');
}

/** 视觉转录重试：输出必须为含 CJK 或 ASCII 的非空文本（非 JSON 场景，不跑 parseJsonLoose） */
async function callVisionWithRetry(chat: ChatClient, parts: ChatContentPart[], pageLabel: string): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    const content: ChatContentPart[] =
      attempt === 0
        ? parts
        : [...parts, { type: 'text', text: `【上次转录未通过校验（第 ${attempt} 次重试）】\n错误：${lastError?.message}\n请重新忠实转录本页。` }];
    const messages: ChatMessage[] = [
      { role: 'system', content: TRANSCRIBE_SYSTEM_PROMPT },
      { role: 'user', content },
    ];
    try {
      const raw = await chat(messages, { task: 'vision_transcribe' });
      const text = raw.trim();
      if (text.length === 0) {
        throw new ModelApiExecutionError(`${pageLabel} 视觉转录返回为空`);
      }
      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw new ModelApiExecutionError(`${pageLabel} 视觉转录重试 ${MAX_RETRY} 次后仍失败：${lastError?.message ?? '未知错误'}`);
}

export interface VisionTranscribeOptions {
  pdfPath: string;
  cacheDir: string;
  chat: ChatClient;
  /** 渲染实现可注入替换（测试隔离 @napi-rs/canvas 真实渲染） */
  renderPages?: RenderPagesFn;
  /** 阶段 C：转录 prompt 术语段语言（en 档切换英文表格行约定；缺省 zh） */
  locale?: 'zh' | 'en';
  onProgress?: (message: string) => void;
}

export interface VisionTranscribeResult {
  fullText: string;
  pageCount: number;
  visionTextPath: string;
}

/**
 * 视觉转录主入口：渲染（带 PNG 缓存）-> 逐页多模态转录（vision-text.txt 缓存）-> 拼接全文。
 * 转录产物命中缓存时零渲染零调用；任何失败显式抛错，绝不静默降级。
 */
export async function transcribePdfByVision(options: VisionTranscribeOptions): Promise<VisionTranscribeResult> {
  const pagesDir = path.join(options.cacheDir, 'pages');
  const visionTextPath = path.join(options.cacheDir, VISION_TEXT_FILE);

  // 转录全文缓存命中：零渲染零调用（version.json 由上层版本门禁把守）
  if (fs.existsSync(visionTextPath)) {
    options.onProgress?.('视觉转录缓存命中（vision-text.txt），跳过渲染与模型调用');
    const cached = fs.readFileSync(visionTextPath, 'utf8');
    const cachedPageCount = fs.existsSync(pagesDir) ? fs.readdirSync(pagesDir).filter((f) => f.startsWith('page-') && f.endsWith('.png')).length : 0;
    return { fullText: cached, pageCount: cachedPageCount, visionTextPath };
  }

  // 渲染（PNG 按页缓存，重跑仅补缺失页）
  fs.mkdirSync(pagesDir, { recursive: true });
  const existing = fs.readdirSync(pagesDir).filter((f) => f.startsWith('page-') && f.endsWith('.png')).length;
  let pages: PageImage[];
  if (existing > 0) {
    options.onProgress?.(`页面图像缓存命中（${existing} 页），跳过重渲染`);
    pages = fs
      .readdirSync(pagesDir)
      .filter((f) => f.startsWith('page-') && f.endsWith('.png'))
      .sort((a, b) => Number(a.replace(/\D+/g, '')) - Number(b.replace(/\D+/g, '')))
      .map((f) => ({ pageNumber: Number(f.replace(/\D+/g, '')), pngPath: path.join(pagesDir, f) }));
  } else {
    options.onProgress?.('渲染 PDF 页面为 PNG（scale 2.0）...');
    const render = options.renderPages || renderPdfPagesToPng;
    pages = await render(path.resolve(options.pdfPath), pagesDir);
    if (pages.length === 0) {
      throw new ModelApiExecutionError('视觉转录通道：PDF 无页面可渲染');
    }
  }

  const pageTexts: string[] = [];
  for (const page of pages) {
    options.onProgress?.(`视觉转录第 ${page.pageNumber}/${pages.length} 页...`);
    const pngBase64 = fs.readFileSync(page.pngPath).toString('base64');
    const parts: ChatContentPart[] = [
      { type: 'text', text: transcribeUserPrompt(page.pageNumber, pages.length, options.locale ?? 'zh') },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${pngBase64}`, detail: 'high' } },
    ];
    pageTexts.push(await callVisionWithRetry(options.chat, parts, `第 ${page.pageNumber} 页`));
  }

  const fullText = pageTexts.map((t, i) => `【第 ${i + 1} 页】\n${t}`).join('\n\n');
  fs.writeFileSync(visionTextPath, fullText, 'utf8');
  options.onProgress?.(`视觉转录完成（${pages.length} 页），全文写入 ${visionTextPath}`);
  return { fullText, pageCount: pages.length, visionTextPath };
}
