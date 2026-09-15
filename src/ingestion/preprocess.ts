import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { PreprocessOutput, PageText } from './types.ts';

/* ==========================================================================
   S0 标准 PDF 预处理 (Preprocess)
   - 输入 PDF 路径，计算 MD5 并缓存中间产物到 .cache/standard-ingest/{md5}/
   - 使用 pdfjs-dist legacy build 提取矢量文本层（全文 + 按页）
   - 严格门禁：无文本层（扫描件）显式抛错，绝不静默降级
   ========================================================================== */

// 全文文本长度下限：正常标准文本层至少数千字符，低于阈值视为扫描件
const MIN_TEXT_LAYER_CHARS = 200;

export class NoTextLayerError extends Error {
  constructor(pdfPath: string) {
    super(`PDF 未提取到有效文本层（疑似扫描件）: ${pdfPath}。离线管线拒绝降级处理，请先 OCR 后再入库。`);
    this.name = 'NoTextLayerError';
  }
}

/**
 * 提取 PDF 全文文本并按页归一化（依赖 text item 的 hasEOL 标志重建行）
 */
async function extractPdfText(pdfPath: string): Promise<PageText[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const buffer = fs.readFileSync(pdfPath);
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;

  const pages: PageText[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      let line = '';
      let pageText = '';
      for (const item of textContent.items) {
        if (!('str' in item)) continue; // 跳过 marked content 标记项
        line += item.str;
        if (item.hasEOL) {
          pageText += line + '\n';
          line = '';
        }
      }
      if (line.length > 0) {
        pageText += line + '\n';
      }
      pages.push({ pageNumber, text: pageText });
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages;
}

/**
 * S0 预处理主入口：命中缓存直接返回，否则提取文本并写入 text.txt / pages.json
 */
export async function preprocessPdf(pdfPath: string, cacheRoot?: string): Promise<PreprocessOutput> {
  const resolvedPdf = path.resolve(pdfPath);
  if (!fs.existsSync(resolvedPdf)) {
    throw new Error(`PDF 文件不存在: ${resolvedPdf}`);
  }

  const buffer = fs.readFileSync(resolvedPdf);
  const md5 = crypto.createHash('md5').update(buffer).digest('hex');
  const baseCache = cacheRoot || path.resolve(process.cwd(), '.cache/standard-ingest');
  const cacheDir = path.join(baseCache, md5);
  const textFile = path.join(cacheDir, 'text.txt');
  const pagesFile = path.join(cacheDir, 'pages.json');

  if (fs.existsSync(textFile) && fs.existsSync(pagesFile)) {
    const fullText = fs.readFileSync(textFile, 'utf8');
    const pages = JSON.parse(fs.readFileSync(pagesFile, 'utf8')) as PageText[];
    return { md5, cacheDir, fullText, pages };
  }

  const pages = await extractPdfText(resolvedPdf);
  const fullText = pages.map((p) => p.text).join('\n');

  if (fullText.replace(/\s+/g, '').length < MIN_TEXT_LAYER_CHARS) {
    throw new NoTextLayerError(resolvedPdf);
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(textFile, fullText, 'utf8');
  fs.writeFileSync(pagesFile, JSON.stringify(pages, null, 2), 'utf8');

  return { md5, cacheDir, fullText, pages };
}
