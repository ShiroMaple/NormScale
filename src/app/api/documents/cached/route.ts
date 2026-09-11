import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { CachedParseResult, globalParseCacheStore } from '@/repository/parse-cache-store.ts';
import { OpenAiCompatibleExtractor } from '@/extractor/openai-compatible-extractor.ts';
import { logger } from '@/logger/index.ts';

import { globalDocumentPreprocessorService } from '@/services/document-preprocessor.service.ts';
import { matchFieldBBoxesFromTokens } from '@/utils/bbox-matcher.ts';
import { ConfidenceEvaluator } from '@/engine/confidence-evaluator.ts';

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
  cacheLevel?: 'L1' | 'L2' | 'L3'; // 三级缓存层级：L1 解析缓存，L2 预处理就绪，L3 仅原件
}

/**
 * GET /api/documents/cached: 
 * 1. 若传递 ?md5=... 或 ?docId=...，返回该文档的完整 CachedParseResult
 * 2. 否则扫描并返回服务端 .cache/parses/ 目录下真实已解析的文档摘要列表与版本匹配状态
 */
export async function GET(request: Request) {
  try {
    const cacheDir = path.join(process.cwd(), '.cache', 'parses');
    const extractor = new OpenAiCompatibleExtractor();
    const currentVersion = extractor.getParserConfigVersion();

    const searchParams = request?.url ? new URL(request.url).searchParams : null;
    const md5Param = searchParams
      ? searchParams.get('md5') || searchParams.get('id') || searchParams.get('docId') || searchParams.get('sampleId')
      : null;

    // 若指定了 md5 / docId，按 L1 ➔ L2 ➔ L3 降级返回单个文档的完整 CachedParseResult
    if (md5Param) {
      // 1. 第一优先级 L1: 检索真实解析结果
      let cached = globalParseCacheStore.getValid(md5Param, currentVersion) || globalParseCacheStore.get(md5Param);

      // 容错按 docId 扫描 L1 parses
      if (!cached && fs.existsSync(cacheDir)) {
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

      const isGenuineL1 = Boolean(
        cached &&
        (cached.cacheLevel === 'L1' || !cached.cacheLevel) &&
        cached.model !== '未调用模型' &&
        cached.sessionDocument?.batches?.some(b => Boolean(b.grade || b.standard || (b.chemical && b.chemical.length > 0)))
      );

      if (cached && isGenuineL1) {
        // 自愈补全 bboxes 与 pages 切图 URL 列表
        const preprocessedAssets = globalDocumentPreprocessorService.getPreprocessed(cached.md5);
        let bboxes = cached.bboxes || [];
        if (bboxes.length === 0 && preprocessedAssets?.tokens && preprocessedAssets.tokens.length > 0) {
          bboxes = matchFieldBBoxesFromTokens(cached.sessionDocument, preprocessedAssets.tokens);
          cached.bboxes = bboxes;
          globalParseCacheStore.set(cached.md5, cached);
        }

        // 自动自愈校准批次真实 OCR 置信度与牌号匹配度
        if (cached.sessionDocument?.batches) {
          cached.sessionDocument.batches = cached.sessionDocument.batches.map(b =>
            ConfidenceEvaluator.enrichBatchConfidences(b, bboxes)
          );
          globalParseCacheStore.set(cached.md5, cached);
        }

        let pageUrls = cached.sessionDocument?.pages || [];
        if (pageUrls.length === 0 && preprocessedAssets?.images && preprocessedAssets.images.length > 0) {
          pageUrls = preprocessedAssets.images.map((_, idx) => `/api/documents/preprocess?md5=${cached!.md5}&page=${idx + 1}`);
          cached.sessionDocument = {
            ...cached.sessionDocument,
            pages: pageUrls,
            samplePages: pageUrls,
          };
        }

        return NextResponse.json({
          success: true,
          result: {
            ...cached,
            cacheLevel: 'L1',
            bboxes,
            sessionDocument: cached.sessionDocument,
          },
        });
      }

      // 2. 第二优先级 L2: 检索预处理切图与文本资产并动态在内存中组装
      const preAssets = globalDocumentPreprocessorService.getPreprocessed(md5Param);
      if (preAssets) {
        const pageUrls = preAssets.images && preAssets.images.length > 0
          ? preAssets.images.map((_, idx) => `/api/documents/preprocess?md5=${md5Param}&page=${idx + 1}`)
          : [];
        const filename = preAssets.metadata?.filename || `文档_${md5Param.slice(0, 8)}.pdf`;
        const fileSize = preAssets.metadata?.fileSize || '1.0 MB';
        const createdAt = preAssets.metadata?.createdAt || new Date().toISOString();

        const l2DynamicResult: CachedParseResult = {
          md5: md5Param,
          filename,
          fileSize,
          parsedAt: createdAt,
          model: '未调用模型',
          provider: 'local',
          parserConfigVersion: currentVersion,
          isTextBased: preAssets.isTextBased,
          pageCount: preAssets.pageCount,
          preprocessedDir: preAssets.dir,
          cacheLevel: 'L2',
          sessionDocument: {
            docId: `doc_${md5Param.slice(0, 8)}`,
            filename,
            fileSize,
            uploadTime: createdAt.replace('T', ' ').slice(0, 19),
            ocrStatus: 'PENDING',
            pageCount: preAssets.pageCount,
            pages: pageUrls,
            samplePages: pageUrls,
            extractedText: preAssets.text || '',
            isTextBased: preAssets.isTextBased,
            batches: [
              {
                batchNo: '',
                subBatchIndex: 1,
                grade: '',
                standard: '',
                supplier: '',
                dimensions: '',
                heatNo: '',
                packNo: '',
                productName: '',
                certificateNo: '',
                deliveryState: '',
                constructionNo: '',
                verdict: 'MANUAL_REVIEW',
                verdictSummary: '预处理已就绪，等待大模型解析提取...',
                ocrConfidence: 0,
                gradeMatchConfidence: 0,
                chemical: [],
                mechanical: { tensile_rm: '', yield_rp02: '', elongation_a: '' },
                process: { flattening: '', flaring: '', intergranularCorrosion: '', ndt: '' },
                reportNo: '',
                sha256Hash: '',
                inspector: '',
              },
            ],
          },
          tokenStats: {
            inputTokens: 0,
            outputTokens: 0,
            durationSeconds: 0,
            isFromCache: false,
          },
          rawStreamingJson: '',
          bboxes: [],
        };

        return NextResponse.json({
          success: true,
          result: l2DynamicResult,
        });
      }

      // 3. 第三优先级 L3: 检索仅上传原件
      const uploadsDir = path.join(process.cwd(), '.cache', 'uploads');
      if (fs.existsSync(uploadsDir)) {
        const uploadFiles = fs.readdirSync(uploadsDir);
        const match = uploadFiles.find(f => f.startsWith(md5Param));
        if (match) {
          const stat = fs.statSync(path.join(uploadsDir, match));
          const l3DynamicResult: any = {
            md5: md5Param,
            filename: match,
            fileSize: `${(stat.size / (1024 * 1024)).toFixed(2)} MB`,
            parsedAt: stat.mtime.toISOString(),
            model: '未调用模型',
            provider: 'local',
            cacheLevel: 'L3',
            pageCount: 1,
            isTextBased: false,
            sessionDocument: {
              docId: `doc_${md5Param.slice(0, 8)}`,
              filename: match,
              fileSize: `${(stat.size / (1024 * 1024)).toFixed(2)} MB`,
              ocrStatus: 'PENDING',
              pageCount: 1,
              pages: [],
              samplePages: [],
              batches: [],
            },
            bboxes: [],
          };

          return NextResponse.json({
            success: true,
            result: l3DynamicResult,
          });
        }
      }

      return NextResponse.json(
        { success: false, error: '未找到指定文档的缓存' },
        { status: 404 }
      );
    }

    // 无参扫描模式：按 L1 ➔ L2 ➔ L3 顺序收集全部文档摘要
    const documents: CachedDocSummary[] = [];
    const seenMd5s = new Set<string>();

    // 1. 扫描 L1 (.cache/parses/*.json)
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(cacheDir, file);
            const raw = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw) as CachedParseResult;
            if (data && data.md5) {
              const hasParsedBatches = data.sessionDocument?.batches?.some(
                b => Boolean(b.grade || b.standard || (b.chemical && b.chemical.length > 0))
              );
              const isL1 = (data.cacheLevel === 'L1' || !data.cacheLevel) && data.model !== '未调用模型' && hasParsedBatches;
              if (isL1) {
                seenMd5s.add(data.md5);
                const cachedVersion = data.parserConfigVersion || '1.0.0';
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
                  isVersionMatched: cachedVersion === currentVersion,
                  isTextBased: data.isTextBased,
                  pageCount: data.pageCount || data.sessionDocument?.pageCount || 1,
                  hasPreprocessed: Boolean(data.preprocessedDir),
                  cacheLevel: 'L1',
                });
              }
            }
          } catch (err) {
            logger.warn('REPOSITORY', `[API /api/documents/cached] 解析文件 ${file} 异常: ${err}`);
          }
        }
      }
    }

    // 2. 扫描 L2 (.cache/preprocessed/)
    const preprocessedMd5s = globalDocumentPreprocessorService.listAllPreprocessedMd5s();
    for (const md5 of preprocessedMd5s) {
      if (seenMd5s.has(md5)) continue;
      const preAssets = globalDocumentPreprocessorService.getPreprocessed(md5);
      if (preAssets) {
        seenMd5s.add(md5);
        const filename = preAssets.metadata?.filename || `文档_${md5.slice(0, 8)}.pdf`;
        const fileSize = preAssets.metadata?.fileSize || '1.0 MB';
        const parsedAt = preAssets.metadata?.createdAt || new Date().toISOString();

        documents.push({
          md5,
          docId: `doc_${md5.slice(0, 8)}`,
          filename,
          fileSize,
          parsedAt,
          model: '未调用模型',
          provider: 'local',
          batchCount: 0,
          parserConfigVersion: currentVersion,
          isVersionMatched: true,
          isTextBased: preAssets.isTextBased,
          pageCount: preAssets.pageCount,
          hasPreprocessed: true,
          cacheLevel: 'L2',
        });
      }
    }

    // 3. 扫描 L3 (.cache/uploads/)
    const uploadedFiles = globalDocumentPreprocessorService.listAllUploadedFiles();
    for (const u of uploadedFiles) {
      if (seenMd5s.has(u.md5)) continue;
      seenMd5s.add(u.md5);
      documents.push({
        md5: u.md5,
        docId: `doc_${u.md5.slice(0, 8)}`,
        filename: u.filename,
        fileSize: u.fileSize,
        parsedAt: u.mtime.toISOString(),
        model: '未调用模型',
        provider: 'local',
        batchCount: 0,
        parserConfigVersion: currentVersion,
        isVersionMatched: true,
        isTextBased: false,
        pageCount: 1,
        hasPreprocessed: false,
        cacheLevel: 'L3',
      });
    }

    // 按时间倒序排列
    documents.sort((a, b) => new Date(b.parsedAt).getTime() - new Date(a.parsedAt).getTime());

    return NextResponse.json({
      success: true,
      currentVersion,
      documents,
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

    // 检查在任意一级缓存中是否存在 (L1 / L2 / L3)
    const existsAny = globalParseCacheStore.hasAny(md5);
    if (!existsAny) {
      return NextResponse.json(
        { success: false, error: '未找到指定 MD5 的缓存文件' },
        { status: 404 }
      );
    }

    // 执行级联删除：.cache/uploads, .cache/preprocessed/{md5}, .cache/parses/{md5}.json
    globalParseCacheStore.deleteCascade(md5);

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
