import { describe, it, expect } from 'vitest';
import { GET as getStandardDetail } from '@/app/api/standards/[standardId]/route.ts';

describe('GET /api/standards/[standardId] 标准明细路由集成测试', () => {
  it('应当成功获取 GB/T 13296-2023 的完整切片与文本条款', async () => {
    const context = {
      params: Promise.resolve({
        standardId: encodeURIComponent('GB/T 13296-2023'),
      }),
    };
    const req = new Request('http://localhost:3000/api/standards/GB%2FT%2013296-2023');
    const res = await getStandardDetail(req, context);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.standard_meta.standard_id).toBe('GB/T 13296-2023');
    expect(json.data.slices.length).toBe(31);
    expect(json.data.slices.some((s: any) => s.spec_key === 'S30408')).toBe(true);
    expect(json.data.clauses).toBeDefined();
    expect(json.data.clauses.length).toBeGreaterThan(0);
  });

  it('应当成功获取 NB/T 47019.5-2021 的完整切片明细', async () => {
    const context = {
      params: Promise.resolve({
        standardId: 'NB_T_47019_5_2021',
      }),
    };
    const req = new Request('http://localhost:3000/api/standards/NB_T_47019_5_2021');
    const res = await getStandardDetail(req, context);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.standard_meta.standard_id).toBe('NB/T 47019.5-2021');
    expect(json.data.slices.length).toBe(5);
    expect(json.data.slices.some((s: any) => s.spec_key === 'S32168')).toBe(true);
  });

  it('当标准不存在时应当返回 404', async () => {
    const context = {
      params: Promise.resolve({
        standardId: 'NON_EXISTENT_STD_99999',
      }),
    };
    const req = new Request('http://localhost:3000/api/standards/NON_EXISTENT_STD_99999');
    const res = await getStandardDetail(req, context);
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('未收录标准');
  });

  it('当 standardId 参数为空时应当返回 400', async () => {
    const context = {
      params: Promise.resolve({
        standardId: '   ',
      }),
    };
    const req = new Request('http://localhost:3000/api/standards/%20');
    const res = await getStandardDetail(req, context);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
  });
});
