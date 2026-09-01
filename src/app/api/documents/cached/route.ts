import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { CachedParseResult, globalParseCacheStore } from '@/repository/parse-cache-store.ts';

export interface CachedDocSummary {
  md5: string;
  docId: string;
  filename: string;
  fileSize: string;
  parsedAt: string;
  model: string;
  provider: string;
  batchCount: number;
}

/**
 * GET /api/documents/cached: 扫描并返回服务端 .cache/parses/ 目录下真实已解析的文档摘要列表
 */
export async function GET() {
  try {
    const cacheDir = path.join(process.cwd(), '.cache', 'parses');
    if (!fs.existsSync(cacheDir)) {
      return NextResponse.json({
        success: true,
        documents: [],
      });
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
            documents.push({
              md5: data.md5,
              docId: data.sessionDocument?.docId || `doc_${data.md5.slice(0, 8)}`,
              filename: data.filename || file.replace('.json', ''),
              fileSize: data.fileSize || '1.0 MB',
              parsedAt: data.parsedAt || new Date().toISOString(),
              model: data.model || 'kimi-k2.7-code',
              provider: data.provider || 'Moonshot',
              batchCount: data.sessionDocument?.batches?.length || 1,
            });
          }
        } catch (err) {
          console.warn(`[API /api/documents/cached] 解析文件 ${file} 异常:`, err);
        }
      }
    }

    // 按解析时间倒序排列
    documents.sort((a, b) => new Date(b.parsedAt).getTime() - new Date(a.parsedAt).getTime());

    // 按文件名聚合去重，同名文件仅保留最新一次解析记录，并清理多余文件
    const uniqueDocsMap = new Map<string, CachedDocSummary>();
    const deduplicatedDocuments: CachedDocSummary[] = [];

    for (const doc of documents) {
      if (!uniqueDocsMap.has(doc.filename)) {
        uniqueDocsMap.set(doc.filename, doc);
        deduplicatedDocuments.push(doc);
      } else {
        // 多余的同名旧缓存文件，自动清理磁盘以防膨胀
        globalParseCacheStore.delete(doc.md5);
      }
    }

    return NextResponse.json({
      success: true,
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
 * DELETE /api/documents/cached: 删除指定 md5 的本地缓存文件
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

    const deleted = globalParseCacheStore.delete(md5);
    if (!deleted) {
      // 容错扫描：匹配包含该 md5 或 docId 的缓存文件并删除
      const cacheDir = path.join(process.cwd(), '.cache', 'parses');
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(cacheDir, file);
            try {
              const raw = fs.readFileSync(filePath, 'utf-8');
              const data = JSON.parse(raw) as CachedParseResult;
              if (data.md5 === md5 || data.sessionDocument?.docId === md5) {
                fs.unlinkSync(filePath);
                return NextResponse.json({ success: true, md5 });
              }
            } catch {
              // ignore
            }
          }
        }
      }
      return NextResponse.json(
        { success: false, error: '未找到指定 MD5 的缓存文件' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, md5 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `删除缓存失败: ${err.message}` },
      { status: 500 }
    );
  }
}
