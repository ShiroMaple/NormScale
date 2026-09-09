import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GET, POST } from '@/app/api/admin/learned-aliases/route';
import { PropertyKeyNormalizer } from '@/normalizer/property-key-normalizer';
import fs from 'fs';
import path from 'path';

describe('Admin Learned Aliases Whitebox API (/api/admin/learned-aliases)', () => {
  const tempTestPath = path.resolve(process.cwd(), 'tests/test_learned_whitebox_temp.json');

  beforeEach(() => {
    PropertyKeyNormalizer.initLearnedAliases(tempTestPath);
    PropertyKeyNormalizer.clearLearnedAliases();
  });

  afterEach(() => {
    if (fs.existsSync(tempTestPath)) {
      fs.unlinkSync(tempTestPath);
    }
  });

  it('GET 返回正确的空状态与已学习列表', async () => {
    // 预置一条自学习别名
    const entry = PropertyKeyNormalizer.registerLearnedAlias(
      '表面光洁度测试',
      'surface_roughness',
      'surface',
      '表面粗糙度'
    );

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.total).toBe(1);
    expect(json.data.active_count).toBe(1);
    expect(json.data.revoked_count).toBe(0);
    expect(json.data.aliases[0].raw_alias).toBe('表面光洁度测试');
    expect(json.data.aliases[0].id).toBe(entry.id);
  });

  it('POST 支持撤销 (revoke) 与恢复 (restore) 操作，并影响 normalize 判定', async () => {
    const entry = PropertyKeyNormalizer.registerLearnedAlias(
      '特殊冲击吸收能KV2',
      'impact_energy_charpy_v',
      'mechanical',
      '夏比V型冲击吸收能量'
    );

    // 此时 normalize 应能命中
    const hitBefore = PropertyKeyNormalizer.normalize('特殊冲击吸收能KV2');
    expect(hitBefore.is_learned).toBe(true);
    expect(hitBefore.property_key).toBe('impact_energy_charpy_v');

    // 发起撤销请求
    const reqRevoke = new Request('http://localhost/api/admin/learned-aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke', id: entry.id }),
    });
    const resRevoke = await POST(reqRevoke);
    const jsonRevoke = await resRevoke.json();

    expect(resRevoke.status).toBe(200);
    expect(jsonRevoke.success).toBe(true);

    // 验证撤销后，normalize 不再作为已学习项生效 (返回常规规则或沙箱)
    const hitAfterRevoke = PropertyKeyNormalizer.normalize('特殊冲击吸收能KV2');
    expect(hitAfterRevoke.is_learned).toBeUndefined();

    // 发起恢复请求
    const reqRestore = new Request('http://localhost/api/admin/learned-aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', id: entry.id }),
    });
    const resRestore = await POST(reqRestore);
    const jsonRestore = await resRestore.json();

    expect(resRestore.status).toBe(200);
    expect(jsonRestore.success).toBe(true);

    // 验证恢复后，normalize 重新作为已学习项生效
    const hitAfterRestore = PropertyKeyNormalizer.normalize('特殊冲击吸收能KV2');
    expect(hitAfterRestore.is_learned).toBe(true);
  });

  it('POST 支持物理删除 (delete) 操作', async () => {
    const entry = PropertyKeyNormalizer.registerLearnedAlias(
      '误判废弃项',
      'c',
      'chemical'
    );

    const reqDelete = new Request('http://localhost/api/admin/learned-aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: entry.id }),
    });
    const resDelete = await POST(reqDelete);
    const jsonDelete = await resDelete.json();

    expect(resDelete.status).toBe(200);
    expect(jsonDelete.success).toBe(true);
    expect(jsonDelete.data.aliases.length).toBe(0);
  });
});
