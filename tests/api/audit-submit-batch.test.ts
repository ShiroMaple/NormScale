import { describe, it, expect } from 'vitest';
import { POST as submitAudit } from '@/app/api/audit/submit/route.ts';

describe('POST /api/audit/submit 批次对象与多标准直通核验测试', () => {
  it('直接传入 batchSpecimen 与单标准：全合格核验成功并返回 AuditReport', async () => {
    const mockBatch = {
      batchNo: 'B-TEST-001',
      certificateNo: 'MTC-2026-001',
      productName: '不锈钢无缝钢管',
      grade: '06Cr18Ni11Ti (S32168)',
      standard: 'GB/T 13296-2023',
      supplier: '江苏武进不锈钢',
      dimensions: 'Φ25×2.0mm',
      chemical: [
        { element: 'C', value: '0.045' },
        { element: 'Si', value: '0.50' },
        { element: 'Mn', value: '1.20' },
        { element: 'P', value: '0.025' },
        { element: 'S', value: '0.008' },
        { element: 'Ni', value: '10.5' },
        { element: 'Cr', value: '18.2' },
        { element: 'Ti', value: '0.42' },
        { element: 'N', value: '0.020' },
      ],
      mechanical: {
        tensile_rm: '560',
        yield_rp02: '230',
        elongation_a: '45.0',
        hardness: '85 HRB',
      },
      process: {
        flattening: 'PASS',
        flaring: 'PASS',
        intergranularCorrosion: 'PASS',
        ndt_et: true,
        ndt_ut: true,
        pressureTest: 'PASS',
      },
    };

    const req = new Request('http://localhost:3000/api/audit/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchSpecimen: mockBatch,
        standardIds: ['GB/T 13296-2023'],
        gradeKey: 'S32168',
      }),
    });

    const res = await submitAudit(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.finalReport).toBeDefined();
    expect(json.finalReport.summary.overall_status).toBe('PASS');
    expect(json.finalReport.item_results.length).toBeGreaterThanOrEqual(8);

    // 验证化学成分被真实规则判定
    const cResult = json.finalReport.item_results.find((r: any) => r.property_key === 'C');
    expect(cResult).toBeDefined();
    expect(cResult.status).toBe('PASS');
  });

  it('直接传入 batchSpecimen 与多标准 [GB + NB]：正确识别剪刀差并返回多标追溯元数据', async () => {
    const mockBatch = {
      batchNo: 'B-TEST-SCISSORS',
      grade: 'S32168',
      chemical: [
        { element: 'C', value: '0.045' },
        { element: 'P', value: '0.025' },
        { element: 'S', value: '0.008' },
      ],
      mechanical: {
        tensile_rm: '560',
        yield_rp02: '230',
        elongation_a: '38.0', // 满足国标 35%，不满足订货标 40%
      },
    };

    const req = new Request('http://localhost:3000/api/audit/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchSpecimen: mockBatch,
        standardIds: ['GB/T 13296-2023', 'NB/T 47019.5-2021'],
        gradeKey: 'S32168',
      }),
    });

    const res = await submitAudit(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.finalReport).toBeDefined();

    const elongResult = json.finalReport.item_results.find((r: any) => r.property_key === 'elongation_A');
    expect(elongResult).toBeDefined();
    expect(elongResult.status).toBe('FAIL');
    expect(elongResult.is_scissors_difference).toBe(true);
    expect(elongResult.strict_standard_id).toBe('NB/T 47019.5-2021');
    expect(elongResult.multi_standard_evaluations?.length).toBe(2);
  });

  it('测试质保书1 (Z26022C-DB7) 真实载荷核验：Ti不等式公式通过、工艺及表面质量全过、晶粒度精准触发结构性剪刀差', async () => {
    const realBatch = {
      batchNo: 'Z26022C-DB7',
      certificateNo: '20260704203',
      grade: 'S32168 (06Cr18Ni11Ti)',
      standard: 'NB/T 47019.5-2021、GB/T 13296-2023',
      dimensions: 'OD 15.0mm × WT 0.8mm',
      chemical: [
        { element: 'C', value: '0.018' },
        { element: 'Si', value: '0.44' },
        { element: 'Mn', value: '1.16' },
        { element: 'P', value: '0.035' },
        { element: 'S', value: '0.005' },
        { element: 'Cr', value: '17.41' },
        { element: 'Ni', value: '9.08' },
        { element: 'Ti', value: '0.14' },
        { element: 'N', value: '<0.01' },
      ],
      mechanical: {
        tensile_rm: '621、620 MPa',
        yield_rp02: '268、267 MPa',
        elongation_a: '57.5、61.5 %',
        hardness: '143、145、137、132、140、139 HV1',
      },
      process: {
        flattening: '合格 OK',
        flaring: '合格 OK',
        intergranularCorrosion: '合格 OK（5.0%形变）',
        grainSize: '6.5 级',
        ndt_et: '合格 OK',
        ndt_ut: '合格 OK',
        ndt: '合格 OK / 合格 OK',
      },
      additionalTests: [
        {
          key: 'geo_surface_quality',
          name: '表面质量',
          category: 'geometric',
          standard: 'GB/T13296-2023',
          result: '合格 OK',
          conclusion: 'PASS',
        },
      ],
    };

    const req = new Request('http://localhost:3000/api/audit/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchSpecimen: realBatch,
        standardIds: ['NB/T 47019.5-2021', 'GB/T 13296-2023'],
        gradeKey: 'S32168',
      }),
    });

    const res = await submitAudit(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    const items = json.finalReport.item_results;

    // 1. 钛含量公式成功求值，且判定为 PASS
    const tiItem = items.find((r: any) => r.property_key === 'Ti');
    expect(tiItem).toBeDefined();
    expect(tiItem.status).toBe('PASS');

    // 2. 压扁试验判定为 PASS
    const flatItem = items.find((r: any) => r.property_key === 'flattening_test');
    expect(flatItem).toBeDefined();
    expect(flatItem.status).toBe('PASS');

    // 3. 扩口试验判定为 PASS
    const flareItem = items.find((r: any) => r.property_key === 'flaring_test');
    expect(flareItem).toBeDefined();
    expect(flareItem.status).toBe('PASS');

    // 4. 晶间腐蚀判定为 PASS
    const igcItem = items.find((r: any) => r.property_key === 'intergranular_corrosion');
    expect(igcItem).toBeDefined();
    expect(igcItem.status).toBe('PASS');

    // 5. 表面质量成功匹配且判定为 PASS (无漏检)
    const surfItem = items.find((r: any) => r.property_key === 'surface_quality');
    expect(surfItem).toBeDefined();
    expect(surfItem.status).toBe('PASS');

    // 6. 晶粒度评级 (6.5 级 < 7 级) 触发结构性加严剪刀差
    const grainItem = items.find((r: any) => r.property_key === 'grain_size');
    expect(grainItem).toBeDefined();
    expect(grainItem.status).toBe('FAIL');
    expect(grainItem.is_scissors_difference).toBe(true);
    expect(grainItem.scissors_attribution).toContain('NB/T 47019.5');
    expect(grainItem.scissors_attribution).toContain('GB/T 13296');
    expect(grainItem.multi_standard_evaluations?.length).toBeGreaterThanOrEqual(2);

    // 7. 硬度试验：薄壁管 (WT 0.8mm < 1.7mm) 法定免检，但供方主动报送实测值 (139.3 HV1 <= 200 HV)，激活“报送即检”并判定为 PASS
    const hardnessItem = items.find((r: any) => r.property_key === 'hardness');
    expect(hardnessItem).toBeDefined();
    expect(hardnessItem.status).toBe('PASS');
    expect(hardnessItem.message).toContain('法定');
    expect(hardnessItem.message).toContain('主动报送');
  });

  it('测试质保书2场景：钛含量3位统一修约对齐与表面质量/表面粗糙度原子化解耦', async () => {
    const mtc2Batch = {
      batchNo: 'MTC2-BATCH-001',
      heatNo: 'H20240901',
      grade: '06Cr18Ni11Ti',
      dimensions: 'OD 15.0mm × WT 0.8mm',
      chemical: {
        C: 0.024,
        Si: 0.52,
        Mn: 1.15,
        P: 0.028,
        S: 0.002,
        Ni: 10.25,
        Cr: 18.20,
        Ti: 0.22, // 实测 0.22%
        N: 0.007,
      },
      mechanical: {
        rm: 585,
        rp02: 245,
        a: 48.0,
      },
      process: {
        surfaceQuality: '合格 OK', // 定性表面外观
        ndt_et: '合格 OK',
        ndt_ut: '合格 OK',
        flattening: '合格 OK',
        flaring: '合格 OK',
      },
      additionalTests: [
        {
          key: 'surface_roughness',
          name: '表面粗糙度',
          category: 'surface',
          value_num: 0.33, // 实测 0.33 μm
          unit: 'μm',
          conclusion: 'PASS',
        },
      ],
    };

    const req = new Request('http://localhost:3000/api/audit/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchSpecimen: mtc2Batch,
        standardIds: ['NB/T 47019.5-2021', 'GB/T 13296-2023'],
        gradeKey: 'S32168',
      }),
    });

    const res = await submitAudit(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    const items = json.finalReport.item_results;

    // 1. 钛含量公式：5*(C+N) = 5*(0.024+0.007) = 0.155%
    // NB 与 GB 均按 3 位修约，两部标准要求一致 (>= 0.155%)，实测 0.22% 均达标，且无虚假加严剪刀差
    const tiItem = items.find((r: any) => r.property_key === 'Ti');
    expect(tiItem).toBeDefined();
    expect(tiItem.status).toBe('PASS');
    expect(tiItem.is_scissors_difference).toBe(false);
    expect(tiItem.standard_requirement_text).toContain('0.155');

    // 2. 表面外观质量：定性合格，不会被粗糙度的 0.33 覆盖或导致文本不匹配
    const surfItem = items.find((r: any) => r.property_key === 'surface_quality');
    expect(surfItem).toBeDefined();
    expect(surfItem.status).toBe('PASS');
    expect(surfItem.actual_value_text).toContain('合格');

    // 3. 表面粗糙度：定量 0.33 μm <= 0.8 μm，判定为 PASS
    const roughItem = items.find((r: any) => r.property_key === 'surface_roughness');
    expect(roughItem).toBeDefined();
    expect(roughItem.status).toBe('PASS');
    expect(roughItem.actual_value_text).toContain('0.33');
  });
});
