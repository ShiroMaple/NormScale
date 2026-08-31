import { describe, it, expect } from 'vitest';
import { GET } from '../../src/app/api/documents/cached/route.ts';

describe('API: /api/documents/cached', () => {
  it('GET 应该成功返回已缓存文档列表数组', async () => {
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.documents)).toBe(true);
  });
});
