import fs from 'fs';
import path from 'path';
import { SessionDocument } from '@/types/session.ts';
import { FieldBBox } from '@/types/bbox.ts';

export interface CachedParseResult {
  md5: string;
  filename: string;
  fileSize: string;
  model: string;
  provider: string;
  parsedAt: string;
  tokenStats: {
    inputTokens: number;
    outputTokens: number;
    durationSeconds: number;
    isFromCache: boolean;
  };
  rawStreamingJson: string;
  sessionDocument: SessionDocument;
  bboxes: FieldBBox[];
}

/**
 * ============================================================================
 * 本地文件 MD5 抽取结果持久化缓存仓储 (ParseCacheStore)
 * 存储位置: .cache/parses/<md5>.json
 * ============================================================================
 */
export class ParseCacheStore {
  private cacheDir: string;

  constructor(customDir?: string) {
    this.cacheDir = customDir || path.join(process.cwd(), '.cache', 'parses');
    this.ensureDirExists();
  }

  private ensureDirExists() {
    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      } catch (err) {
        console.error('[ParseCacheStore] 创建缓存目录失败:', err);
      }
    }
  }

  private getFilePath(md5: string): string {
    const safeMd5 = md5.replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(this.cacheDir, `${safeMd5}.json`);
  }

  public has(md5: string): boolean {
    if (!md5) return false;
    return fs.existsSync(this.getFilePath(md5));
  }

  public get(md5: string): CachedParseResult | null {
    if (!this.has(md5)) return null;
    try {
      const filePath = this.getFilePath(md5);
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as CachedParseResult;
    } catch (err) {
      console.warn(`[ParseCacheStore] 读取缓存异常 (${md5}):`, err);
      return null;
    }
  }

  public set(md5: string, data: CachedParseResult): void {
    if (!md5 || !data) return;
    this.ensureDirExists();
    try {
      const filePath = this.getFilePath(md5);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error(`[ParseCacheStore] 写入缓存异常 (${md5}):`, err);
    }
  }

  public delete(md5: string): boolean {
    if (!this.has(md5)) return false;
    try {
      fs.unlinkSync(this.getFilePath(md5));
      return true;
    } catch {
      return false;
    }
  }
}

export const globalParseCacheStore = new ParseCacheStore();
