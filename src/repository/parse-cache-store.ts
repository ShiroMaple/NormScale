import fs from 'fs';
import path from 'path';
import { SessionDocument } from '@/types/session.ts';
import { FieldBBox } from '@/types/bbox.ts';
import { logger } from '@/logger/index.ts';
import { globalDocumentPreprocessorService } from '@/services/document-preprocessor.service.ts';

export interface CachedParseResult {
  md5: string;
  filename: string;
  fileSize: string;
  parserConfigVersion?: string;   // 抽取该结果时所依赖的 certificate.schema.ts 与 Prompt 配置项版本
  originalFilePath?: string;      // 原件在 .cache/uploads/ 的路径
  preprocessedDir?: string;       // 预处理产物在 .cache/preprocessed/{md5}/ 的路径
  extractedTextPath?: string;     // 文本层 .cache/preprocessed/{md5}/text.txt 路径
  isTextBased?: boolean;          // 是否提取到了矢量文本层
  pageCount?: number;             // 页数
  pageImages?: string[];          // 分页切图文件名列表 ['page-1.png', 'page-2.png']
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
 * 本地文件 MD5 抽取结果持久化缓存与元数据索引仓储 (ParseCacheStore)
 * 存储位置: .cache/parses/<md5>.json
 * 具备配置项版本 (parserConfigVersion) 校验与三级目录级联删除能力
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
        logger.error('REPOSITORY', `[ParseCacheStore] 创建缓存目录失败: ${err}`);
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
      logger.warn('REPOSITORY', `[ParseCacheStore] 读取缓存异常 (${md5}): ${err}`);
      return null;
    }
  }

  /**
   * 校验配置项版本并获取有效缓存 (版本不一致判定失效)
   */
  public getValid(md5: string, currentVersion?: string): CachedParseResult | null {
    const cached = this.get(md5);
    if (!cached) return null;

    if (currentVersion && cached.parserConfigVersion && cached.parserConfigVersion !== currentVersion) {
      logger.info(
        'REPOSITORY',
        `[ParseCacheStore] 缓存配置项版本过期 [${cached.filename}] (缓存版本: ${cached.parserConfigVersion}, 系统当前版本: ${currentVersion})，触发重新抽取`
      );
      return null;
    }

    return cached;
  }

  public set(md5: string, data: CachedParseResult): void {
    if (!md5 || !data) return;
    this.ensureDirExists();
    try {
      // 严格基于文件内容 MD5 哈希作为物理唯一索引，严禁按文件名覆盖或删除不同内容文件
      const filePath = this.getFilePath(md5);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      logger.info('REPOSITORY', `[ParseCacheStore] 成功持久化解析缓存索引 [${md5}]: ${data.filename} (版本: ${data.parserConfigVersion || '1.0.0'})`);
    } catch (err) {
      logger.error('REPOSITORY', `[ParseCacheStore] 写入缓存异常 (${md5}): ${err}`);
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

  /**
   * 级联删除：根据索引关系级联清理原件 (uploads)、预处理产物 (preprocessed) 与解析 JSON (parses)
   * 绝对不影响历史检验台账
   */
  public deleteCascade(md5: string): void {
    if (!md5) return;
    logger.info('REPOSITORY', `[ParseCacheStore] 开始执行文档级联删除 [${md5}]`);

    // 1. 清理原件与 preprocessed 切图/文本目录
    globalDocumentPreprocessorService.deletePreprocessedAndUploads(md5);

    // 2. 清理 parses JSON 索引文件
    this.delete(md5);
    logger.info('REPOSITORY', `[ParseCacheStore] 级联删除完成 [${md5}]`);
  }
}

export const globalParseCacheStore = new ParseCacheStore();
