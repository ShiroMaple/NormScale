import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { CachedParseResult } from '@/repository/parse-cache-store.ts';

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

    return NextResponse.json({
      success: true,
      documents,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `读取缓存列表失败: ${err.message}` },
      { status: 500 }
    );
  }
}
