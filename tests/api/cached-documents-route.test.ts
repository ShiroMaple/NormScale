import { describe, it, expect } from 'vitest';
import { GET, DELETE } from '../../src/app/api/documents/cached/route.ts';

describe('API: /api/documents/cached', () => {
  it('GET 应该成功返回已缓存文档列表数组', async () => {
    const req = new Request('http://localhost:3000/api/documents/cached');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.documents)).toBe(true);
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
});
