import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { globalDocumentPreprocessorService } from '@/services/document-preprocessor.service.ts';
import { globalParseCacheStore } from '@/repository/parse-cache-store.ts';
import { OpenAiCompatibleExtractor } from '@/extractor/openai-compatible-extractor.ts';
import { logger } from '@/logger/index.ts';

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const contentType = request.headers.get('content-type') || '';
    logger.debug('EXTRACTOR', `[API /api/documents/preprocess] 收到预处理上传请求, Content-Type: ${contentType}`);

    let fileBuffer: Buffer | null = null;
    let filename = '质保书.pdf';
    let clientExtractedText: string | undefined;
    let clientPageImages: string[] = [];
    let clientTextTokens: any[] | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const fileEntry = formData.get('file');

      const textEntry = formData.get('extractedText');
      if (textEntry && typeof textEntry === 'string') {
        clientExtractedText = textEntry;
      }

      const tokensEntry = formData.get('textTokens');
      if (tokensEntry && typeof tokensEntry === 'string') {
        try {
          clientTextTokens = JSON.parse(tokensEntry);
        } catch {
          clientTextTokens = undefined;
        }
      }

      const imagesEntry = formData.get('pageImages');
      if (imagesEntry && typeof imagesEntry === 'string') {
        try {
          clientPageImages = JSON.parse(imagesEntry);
        } catch {
          clientPageImages = [];
        }
      }

      if (fileEntry && typeof fileEntry === 'object' && 'arrayBuffer' in fileEntry) {
        const file = fileEntry as File;
        filename = file.name;
        const arrayBuf = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuf);
      }
    } else if (contentType.includes('application/json')) {
      const json = await request.json();
      filename = json.filename || '质保书.pdf';
      clientExtractedText = json.extractedText;
      clientTextTokens = json.textTokens;
      clientPageImages = Array.isArray(json.pageImages) ? json.pageImages : [];
      if (json.fileBase64) {
        fileBuffer = Buffer.from(json.fileBase64, 'base64');
      }
    }

    if (!fileBuffer) {
      logger.warn('EXTRACTOR', `[API /api/documents/preprocess] 上传内容解析为空，拒绝请求`);
      return NextResponse.json(
        { success: false, error: '未提供有效的文件内容' },
        { status: 400 }
      );
    }

    const fileSizeKb = (fileBuffer.length / 1024).toFixed(1);
    logger.debug(
      'EXTRACTOR',
      `[API /api/documents/preprocess] 文件解包完成: [${filename}] (${fileSizeKb} KB) | 切图数: ${clientPageImages.length} | 矢量文本: ${clientExtractedText ? `${clientExtractedText.length} 字符` : '无'} | 坐标Tokens: ${clientTextTokens?.length || 0} 个`
    );

    // 1. 严格格式准入校验（仅支持 PDF 与 PNG / JPEG / JPG / BMP）
    const validation = globalDocumentPreprocessorService.validateFormat(filename);
    if (!validation.valid) {
      logger.warn('EXTRACTOR', `[API /api/documents/preprocess] 拒绝非法格式文件: ${filename}`);
      return NextResponse.json(
        { success: false, error: validation.errorMessage || '文件格式不支持' },
        { status: 400 }
      );
    }
    logger.debug('EXTRACTOR', `[API /api/documents/preprocess] 格式准入校验通过: [${filename}] (${validation.isPdf ? 'PDF 文档' : '图片格式'})`);

    // 2. 计算文件 MD5 指纹
    const md5Start = Date.now();
    const md5 = crypto.createHash('md5').update(fileBuffer).digest('hex');
    logger.debug('EXTRACTOR', `[API /api/documents/preprocess] MD5 指纹计算完成: ${md5} (计算耗时: ${Date.now() - md5Start}ms)`);

    // 3. 原件即时落盘至 .cache/uploads/{md5}.{ext} (L3 原件缓存)
    const originalFilePath = globalDocumentPreprocessorService.saveUploadedOriginal(
      md5,
      filename,
      fileBuffer
    );
    logger.debug('EXTRACTOR', `[API /api/documents/preprocess] L3 原件落盘就绪: ${originalFilePath}`);

    // 4. 预处理产物（切图与 text.txt、tokens.json）即时落盘至 .cache/preprocessed/{md5}/ (L2 预处理缓存)
    // 若为单张图片且未传 pageImages，则以原图作为第一页切图
    const pagesToSave = clientPageImages.length > 0
      ? clientPageImages
      : validation.isImage
        ? [fileBuffer]
        : [];

    const sizeStr = `${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB`;
    const preAssets = globalDocumentPreprocessorService.savePreprocessedAssets(
      md5,
      pagesToSave,
      clientExtractedText,
      clientTextTokens,
      { filename, fileSize: sizeStr }
    );
    logger.debug(
      'EXTRACTOR',
      `[API /api/documents/preprocess] L2 预处理产物落盘就绪: 目录=${preAssets.dir}, 切图=${preAssets.pageCount} 张, 矢量文本=${preAssets.isTextBased ? '有' : '无'}`
    );

    // 5. 校验当前版本是否存在历史解析结果 (L1 解析缓存)
    const extractor = new OpenAiCompatibleExtractor();
    const currentVersion = extractor.getParserConfigVersion();
    const cachedParse = globalParseCacheStore.getValid(md5, currentVersion);
    const cacheLevel: 'L1' | 'L2' = cachedParse ? 'L1' : 'L2';

    if (cachedParse) {
      logger.debug(
        'EXTRACTOR',
        `[API /api/documents/preprocess] 检索到历史解析缓存: MD5=${md5}, 等级=L1, 模型=${cachedParse.model}`
      );
    }

    const totalDuration = Date.now() - startTime;
    logger.info(
      'EXTRACTOR',
      `[API /api/documents/preprocess] 文件即时预处理完成 [${filename}] -> MD5: ${md5}, 切图: ${preAssets.pageCount} 张, 缓存等级: ${cacheLevel}, 总耗时: ${totalDuration}ms`
    );

    return NextResponse.json({
      success: true,
      md5,
      filename,
      pageCount: preAssets.pageCount,
      isTextBased: preAssets.isTextBased,
      hasCachedParse: cacheLevel === 'L1',
      cacheLevel,
      parserConfigVersion: currentVersion,
      originalFilePath,
      preprocessedDir: preAssets.dir,
    });
  } catch (err: any) {
    logger.error('EXTRACTOR', `[API /api/documents/preprocess] 异常: ${err.stack || err.message}`);
    return NextResponse.json(
      { success: false, error: `预处理失败: ${err.message}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/documents/preprocess?md5=...&page=...
 * 提取并直接输出指定文档切图的真实 PNG 图片流
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const md5 = searchParams.get('md5');
    const pageStr = searchParams.get('page') || '1';
    const pageNum = parseInt(pageStr, 10) || 1;

    if (!md5) {
      return NextResponse.json({ success: false, error: '缺少 md5 参数' }, { status: 400 });
    }

    const preprocessedDir = path.join(process.cwd(), '.cache', 'preprocessed', md5);
    const pageFile = path.join(preprocessedDir, `page-${pageNum}.png`);

    if (fs.existsSync(pageFile)) {
      const imgBuffer = fs.readFileSync(pageFile);
      return new Response(imgBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    return NextResponse.json({ success: false, error: '未找到对应切图' }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

