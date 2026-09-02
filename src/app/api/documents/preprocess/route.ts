import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { globalDocumentPreprocessorService } from '@/services/document-preprocessor.service.ts';
import { globalParseCacheStore } from '@/repository/parse-cache-store.ts';
import { OpenAiCompatibleExtractor } from '@/extractor/openai-compatible-extractor.ts';
import { logger } from '@/logger/index.ts';

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
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
      return NextResponse.json(
        { success: false, error: '未提供有效的文件内容' },
        { status: 400 }
      );
    }

    // 1. 严格格式准入校验（仅支持 PDF 与 PNG / JPEG / JPG / BMP）
    const validation = globalDocumentPreprocessorService.validateFormat(filename);
    if (!validation.valid) {
      logger.warn('EXTRACTOR', `[API /api/documents/preprocess] 拒绝非法格式文件: ${filename}`);
      return NextResponse.json(
        { success: false, error: validation.errorMessage || '文件格式不支持' },
        { status: 400 }
      );
    }

    // 2. 计算文件 MD5 指纹
    const md5 = crypto.createHash('md5').update(fileBuffer).digest('hex');

    // 3. 原件即时落盘至 .cache/uploads/{md5}.{ext}
    const originalFilePath = globalDocumentPreprocessorService.saveUploadedOriginal(
      md5,
      filename,
      fileBuffer
    );

    // 4. 预处理产物（切图与 text.txt、tokens.json）即时落盘至 .cache/preprocessed/{md5}/
    // 若为单张图片且未传 pageImages，则以原图作为第一页切图
    const pagesToSave = clientPageImages.length > 0
      ? clientPageImages
      : validation.isImage
        ? [fileBuffer]
        : [];

    const preAssets = globalDocumentPreprocessorService.savePreprocessedAssets(
      md5,
      pagesToSave,
      clientExtractedText,
      clientTextTokens
    );

    // 5. 校验当前版本是否存在历史解析结果
    const extractor = new OpenAiCompatibleExtractor();
    const currentVersion = extractor.getParserConfigVersion();
    const cachedParse = globalParseCacheStore.getValid(md5, currentVersion);

    logger.info(
      'EXTRACTOR',
      `[API /api/documents/preprocess] 文件即时预处理落盘就绪 [${filename}] -> MD5: ${md5}, 切图: ${preAssets.pageCount} 张, 命中解析缓存: ${Boolean(cachedParse)}`
    );

    return NextResponse.json({
      success: true,
      md5,
      filename,
      pageCount: preAssets.pageCount,
      isTextBased: preAssets.isTextBased,
      hasCachedParse: Boolean(cachedParse),
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
