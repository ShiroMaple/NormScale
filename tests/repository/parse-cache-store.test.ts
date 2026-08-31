import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ParseCacheStore, CachedParseResult } from '../../src/repository/parse-cache-store.ts';

describe('ParseCacheStore', () => {
  const testCacheDir = path.join(process.cwd(), '.cache', 'test_parses');
  let store: ParseCacheStore;

  beforeEach(() => {
    store = new ParseCacheStore(testCacheDir);
  });

  afterEach(() => {
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  it('应该正确写入与读取 MD5 缓存数据', () => {
    const testMd5 = 'test_md5_hash_123456';
    const mockData: CachedParseResult = {
      md5: testMd5,
      filename: 'test.pdf',
      fileSize: '1.2 MB',
      model: 'kimi-k2.7-code',
      provider: 'Moonshot',
      parsedAt: new Date().toISOString(),
      tokenStats: {
        inputTokens: 2000,
        outputTokens: 500,
        durationSeconds: 1.5,
        isFromCache: false,
      },
      rawStreamingJson: '{"test": true}',
      sessionDocument: {
        docId: 'doc_1',
        filename: 'test.pdf',
        fileSize: '1.2 MB',
        uploadTime: '2026-08-31 16:00:00',
        ocrStatus: 'DONE',
        pageCount: 1,
        batches: [],
      },
      bboxes: [],
    };

    expect(store.has(testMd5)).toBe(false);
    store.set(testMd5, mockData);

    expect(store.has(testMd5)).toBe(true);
    const read = store.get(testMd5);
    expect(read).not.toBeNull();
    expect(read?.md5).toBe(testMd5);
    expect(read?.filename).toBe('test.pdf');
    expect(read?.tokenStats.inputTokens).toBe(2000);
  });

  it('应该正确删除指定的 MD5 缓存', () => {
    const testMd5 = 'test_delete_md5';
    store.set(testMd5, { md5: testMd5 } as any);
    expect(store.has(testMd5)).toBe(true);

    const deleted = store.delete(testMd5);
    expect(deleted).toBe(true);
    expect(store.has(testMd5)).toBe(false);
    expect(store.get(testMd5)).toBeNull();
  });
});
