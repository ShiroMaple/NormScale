import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ParseCacheStore, CachedParseResult } from '../../src/repository/parse-cache-store.ts';
import { SCENARIO_FIXTURES_META } from '../fixtures/scenarios/index.ts';

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

  it('当磁盘未预先缓存专测场景时，应该通过种子数据自动补齐并持久化落盘', () => {
    // 使用 Case 2 典型场景的真实 MD5 (从权威元数据配置动态获取)
    const case2Meta = SCENARIO_FIXTURES_META.find(m => m.id === 'case2_tier1_to_tier2_pass');
    const case2Md5 = case2Meta?.md5 || '944f39572b5617186447ca32ff71635b';
    const diskPath = (store as any).getFilePath(case2Md5);

    // 初始状态下磁盘该文件绝对不存在
    expect(fs.existsSync(diskPath)).toBe(false);

    // has 应该识别出专测种子
    expect(store.has(case2Md5)).toBe(true);

    // get 应该返回权威预置结构并自动完成落盘
    const seeded = store.get(case2Md5);
    expect(seeded).not.toBeNull();
    expect(seeded?.filename).toBe('case2_tier1_to_tier2_pass.pdf');
    expect(seeded?.sessionDocument.batches[0]?.grade).toBe('06Cr18Ni11Ti');
    expect(seeded?.sessionDocument.batches[0]?.additionalTests).toHaveLength(1);
    expect(seeded?.sessionDocument.batches[0]?.surfaceQuality).toContain('合格');

    // 验证此时磁盘上已经成功落盘该 JSON 文件
    expect(fs.existsSync(diskPath)).toBe(true);
  });

  it('getValid 严禁将 L2 草稿或无有效批次数据的条目判定为有效解析缓存', () => {
    const testDraftMd5 = 'test_l2_draft_md5';
    const draftData: CachedParseResult = {
      md5: testDraftMd5,
      filename: 'draft.pdf',
      fileSize: '1.0 MB',
      model: '未调用模型',
      provider: 'local',
      parserConfigVersion: '1.1.0',
      cacheLevel: 'L2',
      parsedAt: new Date().toISOString(),
      tokenStats: { inputTokens: 0, outputTokens: 0, durationSeconds: 0, isFromCache: false },
      rawStreamingJson: '',
      sessionDocument: {
        docId: 'doc_draft',
        filename: 'draft.pdf',
        fileSize: '1.0 MB',
        uploadTime: '2026-09-11 12:00:00',
        ocrStatus: 'PENDING',
        pageCount: 1,
        batches: [
          {
            batchNo: '',
            grade: '',
            standard: '',
            chemical: [],
            verdict: 'MANUAL_REVIEW',
          } as any,
        ],
      },
      bboxes: [],
    };

    store.set(testDraftMd5, draftData);
    // get 可以拿到原始对象
    expect(store.get(testDraftMd5)).not.toBeNull();
    // 但 getValid 必须严密拦截，绝对不能返回有效解析缓存！
    expect(store.getValid(testDraftMd5, '1.1.0')).toBeNull();

    // 升级为真实 L1 解析数据后，getValid 应该放行
    const l1Data: CachedParseResult = {
      ...draftData,
      model: 'kimi-k2.7-code',
      cacheLevel: 'L1',
      sessionDocument: {
        ...draftData.sessionDocument,
        ocrStatus: 'DONE',
        batches: [
          {
            batchNo: 'B01',
            grade: '06Cr18Ni11Ti',
            standard: 'GB/T 13296-2023',
            chemical: [{ element: 'C', value: 0.04 }],
            verdict: 'PASS',
          } as any,
        ],
      },
    };
    store.set(testDraftMd5, l1Data);
    expect(store.getValid(testDraftMd5, '1.1.0')).not.toBeNull();
    expect(store.getValid(testDraftMd5, '1.1.0')?.model).toBe('kimi-k2.7-code');
  });
});
