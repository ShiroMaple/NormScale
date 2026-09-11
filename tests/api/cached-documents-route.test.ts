import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { GET, DELETE } from '../../src/app/api/documents/cached/route.ts';
import { globalDocumentPreprocessorService } from '../../src/services/document-preprocessor.service.ts';
import { globalParseCacheStore } from '../../src/repository/parse-cache-store.ts';

describe('API: /api/documents/cached (三级缓存 L1/L2/L3 降级匹配与检索契约)', () => {
  const testMd5s: string[] = [];

  afterEach(() => {
    for (const md5 of testMd5s) {
      globalParseCacheStore.deleteCascade(md5);
    }
    testMd5s.length = 0;
  });

  it('GET 应该成功返回已缓存文档列表数组', async () => {
    const req = new Request('http://localhost:3000/api/documents/cached');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.documents)).toBe(true);
  });

  it('L2 降级匹配：仅有预处理切图资产而无 parses 文件的文档，应作为 L2 呈现并动态组装返回', async () => {
    const testL2Md5 = 'test_l2_md5_abc12345678901234567';
    testMd5s.push(testL2Md5);

    // 1. 仅落盘预处理资产 (L2)，绝不写 .cache/parses/
    const fakePage = 'data:image/png;base64,' + Buffer.from('Fake Page Image').toString('base64');
    globalDocumentPreprocessorService.savePreprocessedAssets(
      testL2Md5,
      [fakePage],
      '测试质保书文本内容',
      [],
      { filename: '纯预处理测试质保书.pdf', fileSize: '1.20 MB' }
    );

    // 验证 parses 目录下确实没有写任何文件
    const parseFilePath = path.join(process.cwd(), '.cache', 'parses', `${testL2Md5}.json`);
    expect(fs.existsSync(parseFilePath)).toBe(false);

    // 2. 扫描列表：应该成功包含该 L2 文档
    const listReq = new Request('http://localhost:3000/api/documents/cached');
    const listRes = await GET(listReq);
    const listData = await listRes.json();
    expect(listRes.status).toBe(200);
    const foundL2 = listData.documents.find((d: any) => d.md5 === testL2Md5);
    expect(foundL2).toBeDefined();
    expect(foundL2.cacheLevel).toBe('L2');
    expect(foundL2.filename).toBe('纯预处理测试质保书.pdf');
    expect(foundL2.model).toBe('未调用模型');

    // 3. 单文档详情检索：应动态组装 L2 返回，且仍不写磁盘 parses
    const detailReq = new Request(`http://localhost:3000/api/documents/cached?md5=${testL2Md5}`);
    const detailRes = await GET(detailReq);
    const detailData = await detailRes.json();
    expect(detailRes.status).toBe(200);
    expect(detailData.success).toBe(true);
    expect(detailData.result.cacheLevel).toBe('L2');
    expect(detailData.result.model).toBe('未调用模型');
    expect(detailData.result.sessionDocument?.pages?.length).toBe(1);
    expect(fs.existsSync(parseFilePath)).toBe(false); // 确保内存组装不落地草稿
  });

  it('L3 降级匹配：仅有上传原件的文档，应作为 L3 呈现', async () => {
    const testL3Md5 = 'test_l3_md5_def98765432101234567';
    testMd5s.push(testL3Md5);

    // 仅保存原件 (L3)
    globalDocumentPreprocessorService.saveUploadedOriginal(
      testL3Md5,
      '仅原件测试质保书.pdf',
      Buffer.from('%PDF-1.4 Mock Upload')
    );

    // 扫描列表：应包含 L3 文档
    const listReq = new Request('http://localhost:3000/api/documents/cached');
    const listRes = await GET(listReq);
    const listData = await listRes.json();
    const foundL3 = listData.documents.find((d: any) => d.md5 === testL3Md5);
    expect(foundL3).toBeDefined();
    expect(foundL3.cacheLevel).toBe('L3');
    expect(foundL3.hasPreprocessed).toBe(false);
  });

  it('DELETE 缺少 md5 参数应该返回 400', async () => {
    const req = new Request('http://localhost:3000/api/documents/cached', {
      method: 'DELETE',
    });
    const res = await DELETE(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('DELETE 不存在的 md5 应该返回 404', async () => {
    const req = new Request('http://localhost:3000/api/documents/cached?md5=non_existent_md5_999999', {
      method: 'DELETE',
    });
    const res = await DELETE(req);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it('DELETE 对纯 L2 文档能正常级联清理', async () => {
    const testDelMd5 = 'test_del_md5_xyz1234567890123456';
    const fakePage = 'data:image/png;base64,' + Buffer.from('Fake Page Image').toString('base64');
    globalDocumentPreprocessorService.savePreprocessedAssets(
      testDelMd5,
      [fakePage],
      '测试删除',
      [],
      { filename: '待删除.pdf' }
    );

    const delReq = new Request(`http://localhost:3000/api/documents/cached?md5=${testDelMd5}`, {
      method: 'DELETE',
    });
    const delRes = await DELETE(delReq);
    const delData = await delRes.json();
    expect(delRes.status).toBe(200);
    expect(delData.success).toBe(true);
    expect(globalDocumentPreprocessorService.getPreprocessed(testDelMd5)).toBeNull();
  });
});
