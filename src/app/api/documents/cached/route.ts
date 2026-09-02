import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { CachedParseResult, globalParseCacheStore } from '@/repository/parse-cache-store.ts';
import { OpenAiCompatibleExtractor } from '@/extractor/openai-compatible-extractor.ts';
import { logger } from '@/logger/index.ts';

import { globalDocumentPreprocessorService } from '@/services/document-preprocessor.service.ts';
import { matchFieldBBoxesFromTokens } from '@/utils/bbox-matcher.ts';

export interface CachedDocSummary {
  md5: string;
  docId: string;
  filename: string;
  fileSize: string;
  parsedAt: string;
  model: string;
  provider: string;
  batchCount: number;
  parserConfigVersion?: string;
  isVersionMatched?: boolean;
  isTextBased?: boolean;
  pageCount?: number;
  hasPreprocessed?: boolean;
}

/**
 * GET /api/documents/cached: 
 * 1. 若传递 ?md5=... 或 ?docId=...，返回该文档的完整 CachedParseResult
 * 2. 否则扫描并返回服务端 .cache/parses/ 目录下真实已解析的文档摘要列表与版本匹配状态
 */
export async function GET(request: Request) {
  try {
    const cacheDir = path.join(process.cwd(), '.cache', 'parses');
    if (!fs.existsSync(cacheDir)) {
      return NextResponse.json({
        success: true,
        documents: [],
      });
    }

    const extractor = new OpenAiCompatibleExtractor();
    const currentVersion = extractor.getParserConfigVersion();

    const searchParams = request?.url ? new URL(request.url).searchParams : null;
    const md5Param = searchParams
      ? searchParams.get('md5') || searchParams.get('id') || searchParams.get('docId') || searchParams.get('sampleId')
      : null;

    // 若指定了 md5 / docId，返回单个文档的完整 CachedParseResult
    if (md5Param) {
      let cached = globalParseCacheStore.getValid(md5Param, currentVersion) || globalParseCacheStore.get(md5Param);

      // 容错按 docId 扫描
      if (!cached) {
        const allFiles = fs.readdirSync(cacheDir);
        for (const file of allFiles) {
          if (file.endsWith('.json')) {
            try {
              const raw = fs.readFileSync(path.join(cacheDir, file), 'utf-8');
              const data = JSON.parse(raw) as CachedParseResult;
              if (data.sessionDocument?.docId === md5Param || data.md5 === md5Param) {
                cached = data;
                break;
              }
            } catch {
              // ignore
            }
          }
        }
      }

      if (cached) {
        // 自愈补全 bboxes
        const preprocessedAssets = globalDocumentPreprocessorService.getPreprocessed(cached.md5);
        let bboxes = cached.bboxes || [];
        if (bboxes.length === 0 && preprocessedAssets?.tokens && preprocessedAssets.tokens.length > 0) {
          bboxes = matchFieldBBoxesFromTokens(cached.sessionDocument, preprocessedAssets.tokens);
          cached.bboxes = bboxes;
          globalParseCacheStore.set(cached.md5, cached);
        }

        return NextResponse.json({
          success: true,
          result: {
            ...cached,
            bboxes,
          },
        });
      }

      return NextResponse.json(
        { success: false, error: '未找到指定文档的解析缓存' },
        { status: 404 }
      );
    }

    const files = fs.readdirSync(cacheDir);
    const documents: CachedDocSummary[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(cacheDir, file);
          const raw = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(raw) as CachedParseResult;
          if (data && data.md5) {
            const cachedVersion = data.parserConfigVersion || '1.0.0';
            const isVersionMatched = cachedVersion === currentVersion;
            documents.push({
              md5: data.md5,
              docId: data.sessionDocument?.docId || `doc_${data.md5.slice(0, 8)}`,
              filename: data.filename || file.replace('.json', ''),
              fileSize: data.fileSize || '1.0 MB',
              parsedAt: data.parsedAt || new Date().toISOString(),
              model: data.model || 'kimi-k2.7-code',
              provider: data.provider || 'Moonshot',
              batchCount: data.sessionDocument?.batches?.length || 1,
              parserConfigVersion: cachedVersion,
              isVersionMatched,
              isTextBased: data.isTextBased,
              pageCount: data.pageCount || data.sessionDocument?.pageCount || 1,
              hasPreprocessed: Boolean(data.preprocessedDir),
            });
          }
        } catch (err) {
          logger.warn('REPOSITORY', `[API /api/documents/cached] 解析文件 ${file} 异常: ${err}`);
        }
      }
    }

    // 按解析时间倒序排列
    documents.sort((a, b) => new Date(b.parsedAt).getTime() - new Date(a.parsedAt).getTime());

    // 基于物理 MD5 唯一去重，绝不按可变的文件名误删不同文档
    const uniqueDocsMap = new Map<string, CachedDocSummary>();
    const deduplicatedDocuments: CachedDocSummary[] = [];

    for (const doc of documents) {
      if (!uniqueDocsMap.has(doc.md5)) {
        uniqueDocsMap.set(doc.md5, doc);
        deduplicatedDocuments.push(doc);
      }
    }

    return NextResponse.json({
      success: true,
      currentVersion,
      documents: deduplicatedDocuments,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `读取缓存列表失败: ${err.message}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/documents/cached: 级联删除指定 md5 的原件、切图与解析缓存索引（不影响历史检验台账）
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let md5 = searchParams.get('md5') || searchParams.get('id');

    if (!md5 && request.headers.get('content-type')?.includes('application/json')) {
      const body = await request.json();
      md5 = body.md5 || body.id;
    }

    if (!md5) {
      return NextResponse.json(
        { success: false, error: '缺少必需的 md5 参数' },
        { status: 400 }
      );
    }

    // 检查是否存在对应缓存记录
    const existsInParse = globalParseCacheStore.has(md5);
    if (!existsInParse) {
      // 容错扫描：匹配包含该 md5 或 docId 的缓存文件并删除
      const cacheDir = path.join(process.cwd(), '.cache', 'parses');
      let found = false;
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(cacheDir, file);
            try {
              const raw = fs.readFileSync(filePath, 'utf-8');
              const data = JSON.parse(raw) as CachedParseResult;
              if (data.md5 === md5 || data.sessionDocument?.docId === md5) {
                globalParseCacheStore.deleteCascade(data.md5);
                found = true;
                break;
              }
            } catch {
              // ignore
            }
          }
        }
      }
      if (!found) {
        return NextResponse.json(
          { success: false, error: '未找到指定 MD5 的缓存文件' },
          { status: 404 }
        );
      }
    } else {
      // 执行级联删除：.cache/uploads, .cache/preprocessed/{md5}, .cache/parses/{md5}.json
      globalParseCacheStore.deleteCascade(md5);
    }

    logger.info('REPOSITORY', `[API /api/documents/cached] 成功级联删除文档缓存 [${md5}]`);
    return NextResponse.json({ success: true, md5 });
  } catch (err: any) {
    logger.error('REPOSITORY', `[API /api/documents/cached] 级联删除异常: ${err.message}`);
    return NextResponse.json(
      { success: false, error: `删除缓存失败: ${err.message}` },
      { status: 500 }
    );
  }
}
