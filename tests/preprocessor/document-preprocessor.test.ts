import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DocumentPreprocessorService } from '@/services/document-preprocessor.service.ts';
import { ParseCacheStore, CachedParseResult } from '@/repository/parse-cache-store.ts';

const TEST_CACHE_BASE = path.join(process.cwd(), '.cache', 'test_sandbox');
const TEST_UPLOADS = path.join(TEST_CACHE_BASE, 'uploads');
const TEST_PREPROCESSED = path.join(TEST_CACHE_BASE, 'preprocessed');
const TEST_PARSES = path.join(TEST_CACHE_BASE, 'parses');

describe('DocumentPreprocessorService & ParseCacheStore 架构闭环测试', () => {
  let preprocessor: DocumentPreprocessorService;
  let cacheStore: ParseCacheStore;

  beforeEach(() => {
    // 创建沙箱环境
    fs.mkdirSync(TEST_UPLOADS, { recursive: true });
    fs.mkdirSync(TEST_PREPROCESSED, { recursive: true });
    fs.mkdirSync(TEST_PARSES, { recursive: true });

    preprocessor = new DocumentPreprocessorService(TEST_UPLOADS, TEST_PREPROCESSED);
    cacheStore = new ParseCacheStore(TEST_PARSES);
  });

  afterEach(() => {
    // 清理沙箱环境
    if (fs.existsSync(TEST_CACHE_BASE)) {
      fs.rmSync(TEST_CACHE_BASE, { recursive: true, force: true });
    }
  });

  describe('1. 严格文件格式准入校验', () => {
    it('应准入合法格式：PDF 与常见图片 (PNG, JPG, JPEG, BMP)', () => {
      const validFiles = [
        '质保书.pdf',
        'inspection_report.PDF',
        'sample.png',
        'photo.jpg',
        'document.jpeg',
        'scan.bmp',
      ];

      for (const file of validFiles) {
        const res = preprocessor.validateFormat(file);
        expect(res.valid).toBe(true);
      }
    });

    it('应拒绝非法格式：Word、Excel、压缩包及可执行文件', () => {
      const invalidFiles = [
        'data.docx',
        'table.xlsx',
        'archive.zip',
        'script.sh',
        'malicious.exe',
        'sample.txt',
        '',
      ];

      for (const file of invalidFiles) {
        const res = preprocessor.validateFormat(file);
        expect(res.valid).toBe(false);
        expect(res.errorMessage).toBeDefined();
      }
    });
  });

  describe('2. 原件落盘与预处理产物持久化', () => {
    it('应将上传原件保存至 .cache/uploads/{md5}.{ext}', () => {
      const md5 = 'a1b2c3d4e5f67890';
      const filename = '镇海石化质保书.pdf';
      const buffer = Buffer.from('%PDF-1.4 Mock PDF Content');

      const savedPath = preprocessor.saveUploadedOriginal(md5, filename, buffer);
      expect(fs.existsSync(savedPath)).toBe(true);
      expect(savedPath).toContain(md5);
      expect(fs.readFileSync(savedPath).toString()).toBe('%PDF-1.4 Mock PDF Content');
    });

    it('应将各页 PNG 切图与提取的 text.txt 共同持久化至 .cache/preprocessed/{md5}/', () => {
      const md5 = 'b2c3d4e5f67890a1';
      const page1Buf = Buffer.from('Fake PNG Page 1');
      const page2Buf = Buffer.from('Fake PNG Page 2');
      const textContent = '镇海石化建安 06Cr18Ni11Ti 炉号 Z26022C 抗拉强度 621 MPa';

      const assets = preprocessor.savePreprocessedAssets(
        md5,
        [page1Buf, page2Buf],
        textContent
      );

      expect(assets.isTextBased).toBe(true);
      expect(assets.pageCount).toBe(2);
      expect(assets.images).toEqual(['page-1.png', 'page-2.png']);
      expect(fs.existsSync(path.join(assets.dir, 'page-1.png'))).toBe(true);
      expect(fs.existsSync(path.join(assets.dir, 'page-2.png'))).toBe(true);
      expect(fs.existsSync(path.join(assets.dir, 'text.txt'))).toBe(true);
      expect(fs.readFileSync(path.join(assets.dir, 'text.txt'), 'utf-8')).toBe(textContent);

      // 验证读取方法
      const retrieved = preprocessor.getPreprocessed(md5);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.isTextBased).toBe(true);
      expect(retrieved?.text).toBe(textContent);
      expect(retrieved?.images.length).toBe(2);
    });
  });

  describe('3. 配置项版本 (parserConfigVersion) 门禁与两级缓存失效', () => {
    it('版本一致时应成功复用解析结果 (第一级命中)', () => {
      const md5 = 'c3d4e5f67890a1b2';
      const mockResult: CachedParseResult = {
        md5,
        filename: '测试质保书.pdf',
        fileSize: '1.2 MB',
        parserConfigVersion: '1.0.0',
        model: 'kimi-k2.7-code',
        provider: 'Moonshot',
        parsedAt: new Date().toISOString(),
        tokenStats: { inputTokens: 1200, outputTokens: 300, durationSeconds: 2.1, isFromCache: false },
        rawStreamingJson: '{}',
        sessionDocument: {
          docId: `doc_${md5.slice(0, 8)}`,
          filename: '测试质保书.pdf',
          fileSize: '1.2 MB',
          uploadTime: '2026-09-01 12:00:00',
          ocrStatus: 'DONE',
          pageCount: 1,
          batches: [],
        },
        bboxes: [],
      };

      cacheStore.set(md5, mockResult);

      // 当前系统配置版本为 1.0.0 -> 命中
      const validHit = cacheStore.getValid(md5, '1.0.0');
      expect(validHit).not.toBeNull();
      expect(validHit?.parserConfigVersion).toBe('1.0.0');
    });

    it('配置项版本不一致时判定解析缓存失效，触发重新解析 (版本升级失效门禁)', () => {
      const md5 = 'd4e5f67890a1b2c3';
      const mockOldResult: CachedParseResult = {
        md5,
        filename: '旧版质保书.pdf',
        fileSize: '1.0 MB',
        parserConfigVersion: '1.0.0', // 旧版本
        model: 'kimi-k2.7-code',
        provider: 'Moonshot',
        parsedAt: new Date().toISOString(),
        tokenStats: { inputTokens: 1000, outputTokens: 250, durationSeconds: 1.8, isFromCache: false },
        rawStreamingJson: '{}',
        sessionDocument: {
          docId: `doc_${md5.slice(0, 8)}`,
          filename: '旧版质保书.pdf',
          fileSize: '1.0 MB',
          uploadTime: '2026-09-01 12:00:00',
          ocrStatus: 'DONE',
          pageCount: 1,
          batches: [],
        },
        bboxes: [],
      };

      cacheStore.set(md5, mockOldResult);

      // 管理员将系统配置升级为 1.1.0 (更新了 Schema / Prompt)
      const expiredHit = cacheStore.getValid(md5, '1.1.0');
      expect(expiredHit).toBeNull(); // 解析缓存已过期失效
    });
  });

  describe('4. 级联删除 (Cascade Deletion)', () => {
    it('删除文档时应级联清理原件、切图/文本目录与解析缓存，绝对隔离台账', () => {
      const md5 = 'e5f67890a1b2c3d4';
      const originalPath = preprocessor.saveUploadedOriginal(md5, '质保书.pdf', Buffer.from('Original'));
      const preAssets = preprocessor.savePreprocessedAssets(md5, [Buffer.from('P1')], 'Text');
      cacheStore.set(md5, {
        md5,
        filename: '质保书.pdf',
        fileSize: '1.0 MB',
        parserConfigVersion: '1.0.0',
        model: 'kimi-k2.7-code',
        provider: 'Moonshot',
        parsedAt: new Date().toISOString(),
        tokenStats: { inputTokens: 500, outputTokens: 100, durationSeconds: 0.8, isFromCache: false },
        rawStreamingJson: '{}',
        sessionDocument: {} as any,
        bboxes: [],
      });

      expect(fs.existsSync(originalPath)).toBe(true);
      expect(fs.existsSync(preAssets.dir)).toBe(true);
      expect(cacheStore.has(md5)).toBe(true);

      // 执行级联删除
      preprocessor.deletePreprocessedAndUploads(md5);
      cacheStore.delete(md5);

      expect(fs.existsSync(originalPath)).toBe(false);
      expect(fs.existsSync(preAssets.dir)).toBe(false);
      expect(cacheStore.has(md5)).toBe(false);
    });
  });
});
