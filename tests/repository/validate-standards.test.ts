import { describe, it, expect } from 'vitest';
import { validateAllStandards } from '@/tools/validate-standards';

describe('标准规则库全量强类型与完整性离线校验', () => {
  it('所有已录入标准与规格切片 100% 通过 Zod Schema 契约校验', () => {
    const res = validateAllStandards();

    expect(res.errors).toEqual([]);
    expect(res.success).toBe(true);
    expect(res.totalStandards).toBeGreaterThanOrEqual(1);
    expect(res.totalSlices).toBeGreaterThanOrEqual(31);
  });
});
