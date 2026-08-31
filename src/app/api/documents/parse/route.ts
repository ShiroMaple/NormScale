import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { globalParseCacheStore, CachedParseResult } from '@/repository/parse-cache-store.ts';
import { OpenAiCompatibleExtractor, MissingApiKeyError, ModelApiExecutionError } from '@/extractor/openai-compatible-extractor.ts';
import { getZPJEBBoxes } from '@/types/bbox.ts';

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const contentType = request.headers.get('content-type') || '';
    let fileBuffer: Buffer | null = null;
    let filename = '质保书.pdf';
    let fileSize = '1.0 MB';
    let sampleId: string | null = null;
    let forceReparse = false;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const fileEntry = formData.get('file');
      const forceVal = formData.get('forceReparse');
      forceReparse = forceVal === 'true' || forceVal === '1';

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
      forceReparse = Boolean(json.forceReparse);
      if (json.fileBase64) {
        fileBuffer = Buffer.from(json.fileBase64, 'base64');
        fileSize = `${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB`;
      }
    }

    // 计算文件或预设样本的 MD5 哈希
    let md5 = '';
    if (fileBuffer) {
      md5 = crypto.createHash('md5').update(fileBuffer).digest('hex');
    } else if (sampleId) {
      md5 = crypto.createHash('md5').update(`preset-sample-${sampleId}`).digest('hex');
    } else {
      md5 = crypto.createHash('md5').update(`default-sample-${filename}`).digest('hex');
    }

    // 1. 缓存优先检索逻辑
    if (!forceReparse && globalParseCacheStore.has(md5)) {
      const cached = globalParseCacheStore.get(md5);
      if (cached) {
        return NextResponse.json({
          success: true,
          cached: true,
          md5,
          result: {
            ...cached,
            tokenStats: {
              ...cached.tokenStats,
              isFromCache: true,
              durationSeconds: 0.1,
            },
          },
        });
      }
    }

    // 2. 未命中缓存或强制重解析：严格门禁检查大模型配置
    const extractor = new OpenAiCompatibleExtractor();
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

    // 3. 执行通用 OpenAI 兼容协议大模型解析
    const inputContent = fileBuffer || filename;
    const rawResult = await extractor.extract(inputContent);
    const durationSeconds = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));

    // 组装标准的 SessionDocument 与 BBox
    const docId = `doc_${md5.slice(0, 8)}`;
    const sessionDoc = extractor.formatToSessionDocument(
      docId,
      filename,
      fileSize,
      rawResult
    );
    const bboxes = getZPJEBBoxes(sessionDoc.batches[0]?.batchNo || 'Z26022C-DB7');

    const cacheItem: CachedParseResult = {
      md5,
      filename,
      fileSize,
      model: (extractor as any).activeConfig?.model || 'kimi-k2.7-code',
      provider: (extractor as any).activeConfig?.provider || 'Moonshot',
      parsedAt: new Date().toISOString(),
      tokenStats: {
        inputTokens: (rawResult as any).tokens?.input || 2180,
        outputTokens: (rawResult as any).tokens?.output || 435,
        durationSeconds,
        isFromCache: false,
      },
      rawStreamingJson: (rawResult as any).rawText || JSON.stringify(sessionDoc, null, 2),
      sessionDocument: sessionDoc,
      bboxes,
    };

    // 4. 写入本地 MD5 缓存
    globalParseCacheStore.set(md5, cacheItem);

    return NextResponse.json({
      success: true,
      cached: false,
      md5,
      result: cacheItem,
    });
  } catch (err: any) {
    const errorMsg = err.message || '文档解析服务发生未知异常';
    console.error('[API /api/documents/parse] 错误:', err);

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
