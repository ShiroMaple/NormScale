import { describe, it, expect } from 'vitest';
import { GET, POST } from '../../src/app/api/admin/config/route.ts';

describe('API: /api/admin/config', () => {
  it('GET 应该成功返回系统 config.json 数据', async () => {
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.config).toBeDefined();
    expect(data.config.llm.configs.length).toBeGreaterThan(0);
  });

  it('POST 传入非法格式配置应该返回 400 校验错误', async () => {
    const fakeReq = new Request('http://localhost:3000/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ llm: { timeoutMs: 100, maxRetries: 99, configs: [] } }),
    });

    const res = await POST(fakeReq);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('配置格式校验不通过');
  });
});
