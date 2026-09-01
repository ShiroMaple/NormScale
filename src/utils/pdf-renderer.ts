/**
 * ============================================================================
 * 客户端 PDF 逐页高保真栅格化渲染器 (PDFRenderer)
 * 将用户上传的真实 PDF 文件在客户端无损转为页面高清底图 URL 列表 (pages)
 * 使得真实 PDF 能 100% 沿用标准的 <img> + 百分比 BBOX 标注图层与平滑聚光灯放大
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
      }, 3000);

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

/**
 * 将真实上传的 PDF 文件逐页渲染为高清 PNG DataURL 列表
 * @param file 上传的 PDF File 或 Blob
 * @returns 包含各页高清 DataURL 的字符串数组
 */
export async function renderPdfToImageUrls(file: File | Blob): Promise<string[]> {
  try {
    const pdfjs = await loadPdfJs();
    if (!pdfjs) return [];

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const pageImageUrls: string[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      // scale: 2.0 保证工业高清视网膜显示及 200% 聚光灯放大时不模糊
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) continue;

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

    return pageImageUrls;
  } catch (err) {
    console.warn('[PDFRenderer] 客户端 PDF 栅格化渲染失败，将使用通用回退:', err);
    return [];
  }
}
