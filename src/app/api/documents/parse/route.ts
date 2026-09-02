import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { globalParseCacheStore, CachedParseResult } from '@/repository/parse-cache-store.ts';
import { OpenAiCompatibleExtractor, MissingApiKeyError, ModelApiExecutionError } from '@/extractor/openai-compatible-extractor.ts';
import { globalDocumentPreprocessorService } from '@/services/document-preprocessor.service.ts';
import { matchFieldBBoxesFromTokens } from '@/utils/bbox-matcher.ts';
import { logger } from '@/logger/index.ts';

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const contentType = request.headers.get('content-type') || '';
    let fileBuffer: Buffer | null = null;
    let filename = '质保书.pdf';
    let fileSize = '1.0 MB';
    let sampleId: string | null = null;
    let explicitMd5: string | null = null;
    let forceReparse = false;
    let clientExtractedText: string | undefined;
    let clientPageImages: string[] | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const fileEntry = formData.get('file');
      const forceVal = formData.get('forceReparse');
      forceReparse = forceVal === 'true' || forceVal === '1';

      const md5Entry = formData.get('md5');
      if (md5Entry && typeof md5Entry === 'string') {
        explicitMd5 = md5Entry;
      }

      const fnEntry = formData.get('filename');
      if (fnEntry && typeof fnEntry === 'string') {
        filename = fnEntry;
      }

      const textEntry = formData.get('extractedText');
      if (textEntry && typeof textEntry === 'string') {
        clientExtractedText = textEntry;
      }

      const imagesEntry = formData.get('pageImages');
      if (imagesEntry && typeof imagesEntry === 'string') {
        try {
          clientPageImages = JSON.parse(imagesEntry);
        } catch {
          // ignore
        }
      }

      if (fileEntry && typeof fileEntry === 'object' && 'arrayBuffer' in fileEntry) {
        const file = fileEntry as File;
        filename = file.name;
        const arrayBuf = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuf);
        fileSize = `${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB`;
      } else {
        const sampleIdEntry = formData.get('sampleId');
        if (sampleIdEntry && typeof sampleIdEntry === 'string') {
          sampleId = sampleIdEntry;
        }
      }
    } else if (contentType.includes('application/json')) {
      const json = await request.json();
      sampleId = json.sampleId || null;
      filename = json.filename || '质保书.pdf';
      explicitMd5 = json.md5 || null;
      forceReparse = Boolean(json.forceReparse);
      clientExtractedText = json.extractedText;
      clientPageImages = json.pageImages;
      if (json.fileBase64) {
        fileBuffer = Buffer.from(json.fileBase64, 'base64');
        fileSize = `${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB`;
      }
    }

    // 1. 严格文件格式准入校验（仅支持 PDF 与 PNG / JPEG / JPG / BMP）
    const formatValidation = globalDocumentPreprocessorService.validateFormat(filename);
    if (!formatValidation.valid) {
      logger.warn('EXTRACTOR', `[API /api/documents/parse] 拒绝非法格式文件: ${filename}`);
      return NextResponse.json(
        {
          success: false,
          error: formatValidation.errorMessage || '文件格式不支持',
          code: 'INVALID_FILE_FORMAT',
        },
        { status: 400 }
      );
    }

    // 2. 真实 MD5 指纹计算（严格要求：通过真实二进制流计算或显式传递真实 md5，严禁任何伪哈希）
    let md5 = explicitMd5 || '';
    if (!md5) {
      if (fileBuffer) {
        md5 = crypto.createHash('md5').update(fileBuffer).digest('hex');
      } else if (sampleId) {
        // 尝试从 doc_{md5} 或缓存仓库中精确定位已有实体 MD5
        if (globalParseCacheStore.has(sampleId)) {
          md5 = sampleId;
        } else {
          const matchedItem = globalParseCacheStore.get(sampleId);
          if (matchedItem) {
            md5 = matchedItem.md5;
          }
        }
      }
    }

    if (!md5) {
      logger.warn('EXTRACTOR', `[API /api/documents/parse] 请求未携带有效二进制文件流或 md5 参数 (${filename})`);
      return NextResponse.json(
        {
          success: false,
          error: '解析请求无效：必须提供真实文档二进制文件流或有效的 md5 指纹',
          code: 'MISSING_FILE_OR_MD5',
        },
        { status: 400 }
      );
    }

    // 3. 原件持久化至 .cache/uploads/{md5}.{ext} (若传入了二进制)
    let originalFilePath: string | undefined;
    if (fileBuffer) {
      try {
        originalFilePath = globalDocumentPreprocessorService.saveUploadedOriginal(md5, filename, fileBuffer);
      } catch (uploadErr) {
        logger.warn('EXTRACTOR', `[API /api/documents/parse] 保存原件至 uploads 失败: ${uploadErr}`);
      }
    }

    // 4. 预处理产物（切图与文本及 Token 坐标）持久化或读取
    let preprocessedAssets = globalDocumentPreprocessorService.getPreprocessed(md5);
    if (!preprocessedAssets && clientPageImages && clientPageImages.length > 0) {
      preprocessedAssets = globalDocumentPreprocessorService.savePreprocessedAssets(
        md5,
        clientPageImages,
        clientExtractedText
      );
    }

    const extractor = new OpenAiCompatibleExtractor();
    const currentConfigVersion = extractor.getParserConfigVersion();

    // 5. 两级缓存检索（校验配置项版本：Prompt / certificate.schema.ts 结构版本）
    if (!forceReparse) {
      const validParseResult = globalParseCacheStore.getValid(md5, currentConfigVersion);
      if (validParseResult) {
        let bboxes = validParseResult.bboxes || [];
        // 若历史缓存中无 bboxes，但本地存在矢量文本层 Token，即时自动补全并回写持久化缓存
        if (bboxes.length === 0 && preprocessedAssets?.tokens && preprocessedAssets.tokens.length > 0) {
          bboxes = matchFieldBBoxesFromTokens(validParseResult.sessionDocument, preprocessedAssets.tokens);
          validParseResult.bboxes = bboxes;
          globalParseCacheStore.set(md5, validParseResult);
          logger.info(
            'EXTRACTOR',
            `[API /api/documents/parse] 历史解析缓存回补生成并持久化了 ${bboxes.length} 个精确 BBox`
          );
        }

        logger.info(
          'EXTRACTOR',
          `[API /api/documents/parse] 命中有效解析缓存 [${filename}] (版本: ${validParseResult.parserConfigVersion || '1.0.0'}, MD5: ${md5}, BBox: ${bboxes.length} 个)`
        );
        return NextResponse.json({
          success: true,
          cached: true,
          md5,
          result: {
            ...validParseResult,
            bboxes,
            tokenStats: {
              ...validParseResult.tokenStats,
              isFromCache: true,
              durationSeconds: 0.05,
            },
          },
        });
      }
    }

    // 6. 未命中有效解析缓存（或强制重新解析/配置版本失效）：检查 API Key 门禁
    const resolvedApiKey = extractor.getResolvedApiKey();
    if (!resolvedApiKey) {
      return NextResponse.json(
        {
          success: false,
          error: '未配置有效的大模型 API Key，且当前文档未命中缓存，无法执行解析。请联系管理员在系统管理中配置 API 凭证。',
          code: 'MISSING_API_KEY',
          md5,
          filename,
        },
        { status: 400 }
      );
    }

    // 7. 组装预处理文本层与切图多模态双模态 Prompt
    const extractedTextToUse = clientExtractedText || preprocessedAssets?.text;
    const pageImagesToUse = (clientPageImages && clientPageImages.length > 0)
      ? clientPageImages
      : preprocessedAssets?.images?.map(imgFile => {
          if (preprocessedAssets) {
            const fullPath = path.join(preprocessedAssets.dir, imgFile);
            try {
              const imgBuf = fs.readFileSync(fullPath);
              return imgBuf.toString('base64');
            } catch {
              return '';
            }
          }
          return '';
        }).filter(Boolean) || [];

    logger.info(
      'EXTRACTOR',
      `[API /api/documents/parse] 发起双模态大模型抽取: ${filename} (配置版本: ${currentConfigVersion}, 文本层长度: ${extractedTextToUse?.length || 0}, 切图数: ${pageImagesToUse.length})`
    );

    const inputContent = fileBuffer || filename;

    // 统一由大模型在抽取结构化数据的同时输出 BBox 视觉坐标（结合 Schema 反射的严格白名单闭集约束）
    const rawResult = await extractor.extract(inputContent, {
      filename,
      extractedText: extractedTextToUse,
      pageImages: pageImagesToUse,
      includeBbox: true,
    });
    const durationSeconds = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));

    // 8. 组装标准 SessionDocument 实体
    const docId = `doc_${md5.slice(0, 8)}`;
    const sessionDoc = extractor.formatToSessionDocument(
      docId,
      filename,
      fileSize,
      rawResult,
      clientPageImages || preprocessedAssets?.images
    );

    let bboxes = (rawResult as any).bboxes || [];
    // 兜底策略：若大模型因网络截断未输出 bboxes，且本地存在矢量文本层 Token 坐标，自动执行文本锚点匹配补全
    if (bboxes.length === 0 && preprocessedAssets?.tokens && preprocessedAssets.tokens.length > 0) {
      bboxes = matchFieldBBoxesFromTokens(sessionDoc, preprocessedAssets.tokens);
      logger.info(
        'EXTRACTOR',
        `[API /api/documents/parse] 大模型未返回 BBox，触发本地 PDF 矢量文本层 Token 兜底生成了 ${bboxes.length} 个 BBox`
      );
    } else {
      logger.info(
        'EXTRACTOR',
        `[API /api/documents/parse] 成功采纳大模型直接解析生成的 ${bboxes.length} 个视觉 BBox 标注框`
      );
    }

    // 9. 建立自包含完整元数据索引并写入本地缓存
    const cacheItem: CachedParseResult = {
      md5,
      filename,
      fileSize,
      parserConfigVersion: currentConfigVersion,
      originalFilePath,
      preprocessedDir: preprocessedAssets?.dir,
      extractedTextPath: preprocessedAssets?.textPath,
      isTextBased: preprocessedAssets?.isTextBased ?? Boolean(extractedTextToUse && extractedTextToUse.length > 20),
      pageCount: preprocessedAssets?.pageCount ?? sessionDoc.pageCount,
      pageImages: preprocessedAssets?.images,
      model: (extractor as any).activeConfig?.model || 'kimi-k2.7-code',
      provider: (extractor as any).activeConfig?.provider || 'Moonshot',
      parsedAt: new Date().toISOString(),
      tokenStats: {
        inputTokens: (rawResult as any).tokens?.input || 0,
        outputTokens: (rawResult as any).tokens?.output || 0,
        durationSeconds,
        isFromCache: false,
      },
      rawStreamingJson: (rawResult as any).rawText || JSON.stringify(sessionDoc, null, 2),
      sessionDocument: sessionDoc,
      bboxes,
    };

    globalParseCacheStore.set(md5, cacheItem);

    return NextResponse.json({
      success: true,
      cached: false,
      md5,
      result: cacheItem,
    });
  } catch (err: any) {
    const errorMsg = err.message || '文档解析服务发生未知异常';
    logger.error('EXTRACTOR', `[API /api/documents/parse] 异常: ${err.stack || err.message}`);

    if (err instanceof MissingApiKeyError) {
      return NextResponse.json(
        {
          success: false,
          error: err.message,
          code: 'MISSING_API_KEY',
        },
        { status: 400 }
      );
    }

    if (err instanceof ModelApiExecutionError) {
      return NextResponse.json(
        {
          success: false,
          error: `大模型接口调用失败: ${err.message}`,
          code: 'MODEL_API_ERROR',
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: `解析中断: ${errorMsg}`,
        code: 'PARSE_FAILED',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/documents/parse: 按 sampleId 或 md5 检索并返回已缓存的解析结果
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetKey =
      searchParams.get('md5') ||
      searchParams.get('sampleId') ||
      searchParams.get('docId') ||
      searchParams.get('id');

    if (!targetKey) {
      return NextResponse.json(
        { success: false, error: '缺少必需的 md5 或 sampleId 参数' },
        { status: 400 }
      );
    }

    const extractor = new OpenAiCompatibleExtractor();
    const currentVersion = extractor.getParserConfigVersion();
    let validParseResult =
      globalParseCacheStore.getValid(targetKey, currentVersion) ||
      globalParseCacheStore.get(targetKey);

    // 容错按 docId 扫描
    if (!validParseResult) {
      const cacheDir = path.join(process.cwd(), '.cache', 'parses');
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            try {
              const raw = fs.readFileSync(path.join(cacheDir, file), 'utf-8');
              const data = JSON.parse(raw) as CachedParseResult;
              if (data.md5 === targetKey || data.sessionDocument?.docId === targetKey) {
                validParseResult = data;
                break;
              }
            } catch {
              // ignore
            }
          }
        }
      }
    }

    if (!validParseResult) {
      return NextResponse.json(
        { success: false, error: '未找到匹配的有效解析缓存' },
        { status: 404 }
      );
    }

    const preprocessedAssets = globalDocumentPreprocessorService.getPreprocessed(validParseResult.md5);
    let bboxes = validParseResult.bboxes || [];
    if (bboxes.length === 0 && preprocessedAssets?.tokens && preprocessedAssets.tokens.length > 0) {
      bboxes = matchFieldBBoxesFromTokens(validParseResult.sessionDocument, preprocessedAssets.tokens);
      validParseResult.bboxes = bboxes;
      globalParseCacheStore.set(validParseResult.md5, validParseResult);
    }

    return NextResponse.json({
      success: true,
      cached: true,
      md5: validParseResult.md5,
      result: {
        ...validParseResult,
        bboxes,
        tokenStats: {
          ...validParseResult.tokenStats,
          isFromCache: true,
          durationSeconds: 0.05,
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

