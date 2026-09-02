/**
 * ============================================================================
 * 客户端 PDF 逐页高保真栅格化与文本层提取器 (PDFRenderer)
 * 1. 将用户上传的真实 PDF 文件逐页渲染为 2.0x Retina PNG 高清图 (pages)
 * 2. 提取 PDF 矢量文本层并分离为结构化字符串 (text)
 * 3. 判定 PDF 是否包含文本层 (isTextBased)，为大模型双模态输入提供依据
 * ============================================================================
 */

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

let pdfjsLoadingPromise: Promise<any> | null = null;

/**
 * 动态异步加载 PDF.js 运行时
 */
export async function loadPdfJs(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if (window.pdfjsLib) return window.pdfjsLib;

  if (!pdfjsLoadingPromise) {
    pdfjsLoadingPromise = new Promise((resolve) => {
      // 检查页面是否已存在 script 标签
      const existing = document.querySelector('script[src*="pdf.min.js"]');
      if (existing) {
        existing.addEventListener('load', () => {
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            resolve(window.pdfjsLib);
          }
        });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.async = true;

      const timeoutId = setTimeout(() => {
        resolve(null);
      }, 4000);

      script.onload = () => {
        clearTimeout(timeoutId);
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        } else {
          resolve(null);
        }
      };
      script.onerror = () => {
        clearTimeout(timeoutId);
        resolve(null);
      };
      document.head.appendChild(script);
    });
  }

  return pdfjsLoadingPromise;
}

export interface TextTokenItem {
  str: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfPreprocessResult {
  pages: string[];
  text?: string;
  textTokens?: TextTokenItem[];
  isTextBased: boolean;
  pageCount: number;
}

/**
 * 将真实上传的 PDF 文件逐页渲染为高清 PNG DataURL 列表并分离文本层与 Token 坐标
 */
export async function renderPdfAndExtractText(file: File | Blob): Promise<PdfPreprocessResult> {
  try {
    const pdfjs = await loadPdfJs();
    if (!pdfjs) return { pages: [], isTextBased: false, pageCount: 0 };

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const pageImageUrls: string[] = [];
    const extractedPageTexts: string[] = [];
    const allTokens: TextTokenItem[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      // scale: 2.0 保证工业高清视网膜显示及 150% 聚光灯放大时不模糊
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
        const dataUrl = canvas.toDataURL('image/png');
        pageImageUrls.push(dataUrl);
      }

      // 提取本页矢量文本层及物理 Token 坐标
      try {
        const textContent = await page.getTextContent();
        if (textContent && Array.isArray(textContent.items)) {
          const pageRawText = textContent.items
            .map((item: any) => {
              if (typeof item.str === 'string' && item.str.trim().length > 0 && Array.isArray(item.transform)) {
                try {
                  const tx = pdfjs.Util ? pdfjs.Util.transform(viewport.transform, item.transform) : item.transform;
                  const itemH = (item.height || 10) * (viewport.scale || 1.0);
                  const itemW = (item.width || item.str.length * 8) * (viewport.scale || 1.0);
                  const x_pct = (tx[4] / viewport.width) * 100;
                  const y_pct = ((tx[5] - itemH) / viewport.height) * 100;
                  const w_pct = (itemW / viewport.width) * 100;
                  const h_pct = ((itemH * 1.3) / viewport.height) * 100;

                  allTokens.push({
                    str: item.str.trim(),
                    page: pageNum,
                    x: Math.max(0, Math.min(100, x_pct)),
                    y: Math.max(0, Math.min(100, y_pct)),
                    w: Math.max(0.5, Math.min(100, w_pct)),
                    h: Math.max(0.5, Math.min(100, h_pct)),
                  });
                } catch {
                  // ignore
                }
                return item.str;
              }
              return typeof item.str === 'string' ? item.str : '';
            })
            .filter((str: string) => str.trim().length > 0)
            .join(' ');

          if (pageRawText.trim().length > 0) {
            extractedPageTexts.push(`[Page ${pageNum}]\n${pageRawText.trim()}`);
          }
        }
      } catch (textErr) {
        console.warn(`[PDFRenderer] 提取第 ${pageNum} 页文本层异常:`, textErr);
      }
    }

    const combinedText = extractedPageTexts.join('\n\n').trim();
    const isTextBased = combinedText.length > 20;

    return {
      pages: pageImageUrls,
      text: combinedText || undefined,
      textTokens: allTokens.length > 0 ? allTokens : undefined,
      isTextBased,
      pageCount: pageImageUrls.length || numPages,
    };
  } catch (err) {
    console.warn('[PDFRenderer] 客户端 PDF 栅格化与文本抽取失败:', err);
    return { pages: [], isTextBased: false, pageCount: 0 };
  }
}

/**
 * 兼容旧接口：将真实上传的 PDF 文件逐页渲染为高清 PNG DataURL 列表
 */
export async function renderPdfToImageUrls(file: File | Blob): Promise<string[]> {
  const res = await renderPdfAndExtractText(file);
  return res.pages;
}
