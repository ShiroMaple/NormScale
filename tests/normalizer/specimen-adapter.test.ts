import { describe, it, expect } from 'vitest';
import {
  annotateAdditionalTests,
  batchSpecimenToCertificateExtract,
} from '@/normalizer/specimen-adapter.ts';

describe('SpecimenAdapter & annotateAdditionalTests (打标降级治理测试)', () => {
  const sampleMechanical = {
    tensile_rm: '675、669 MPa',
    yield_rp02: '334、343 MPa',
    elongation_a: '48.0、48.0 %',
    hardness: '143 HV1',
  };

  const sampleProcess = {
    flattening: '合格 OK',
    flaring: '合格 OK',
    grainSize: '7.0 级',
    intergranularCorrosion: '合格 OK',
    ndt_et: '合格 OK',
    ndt_ut: '合格 OK',
  };

  it('规则 1：复合打包串形态判定打标 is_composite，条目保留不删除', () => {
    const compositeItem = {
      key: 'test_composite_1',
      name: '室温拉伸试验',
      category: 'mechanical',
      result: 'Rp0.2=334、343 MPa；Rm=675、669 MPa；A=48.0、48.0 %',
    };

    const legitimateItem = {
      key: 'proc_hydraulic',
      name: '水压试验',
      category: 'process',
      result: '20MPa 稳压合格',
    };

    const annotated = annotateAdditionalTests([compositeItem, legitimateItem], {
      mechanical: sampleMechanical,
      process: sampleProcess,
    });

    expect(annotated).toHaveLength(2);

    const composite = annotated.find((t: any) => t.key === 'test_composite_1');
    expect(composite.is_composite).toBe(true);
    expect(composite.duplicate_reason).toBe('复合打包串：含多个指标赋值，已排除出数值比对');
    expect(composite.is_suspected_duplicate).toBeUndefined();

    const legit = annotated.find((t: any) => t.key === 'proc_hydraulic');
    expect(legit.is_composite).toBeUndefined();
    expect(legit.is_suspected_duplicate).toBeUndefined();

    // 入参对象不被原地修改
    expect((compositeItem as any).is_composite).toBeUndefined();
  });

  it('规则 2：已有核心槽位同源查重打标 is_suspected_duplicate，条目保留不删除', () => {
    const duplicateYield = {
      key: 'test_dup_yield',
      name: '屈服强度 Rp0.2',
      category: 'mechanical',
      result: '334 MPa',
    };

    const duplicateFlattening = {
      key: 'test_dup_flat',
      name: '压扁试验',
      category: 'process',
      result: '合格',
    };

    const distinctItem = {
      key: 'geo_surface_quality',
      name: '表面质量',
      category: 'process',
      result: '表面光滑无裂纹',
    };

    const annotated = annotateAdditionalTests([duplicateYield, duplicateFlattening, distinctItem], {
      mechanical: sampleMechanical,
      process: sampleProcess,
    });

    expect(annotated).toHaveLength(3);

    const yieldDup = annotated.find((t: any) => t.key === 'test_dup_yield');
    expect(yieldDup.is_suspected_duplicate).toBe(true);
    expect(yieldDup.duplicate_of).toBe('yield_strength_rp02');
    expect(yieldDup.duplicate_reason).toContain('yield_strength_rp02');

    const flatDup = annotated.find((t: any) => t.key === 'test_dup_flat');
    expect(flatDup.is_suspected_duplicate).toBe(true);
    expect(flatDup.duplicate_of).toBe('flattening_test');

    const distinct = annotated.find((t: any) => t.key === 'geo_surface_quality');
    expect(distinct.is_suspected_duplicate).toBeUndefined();
    expect(distinct.is_composite).toBeUndefined();
  });

  it('原防线 3 语义变更：单值泛名表头条目是合法数据，保留且不打标', () => {
    const headerItem1 = {
      key: 'test_header_1',
      name: '室温拉伸试验',
      category: 'mechanical',
      result: '合格',
    };

    const headerItem2 = {
      key: 'test_header_2',
      name: '力学性能试验',
      category: 'mechanical',
      result: '合格',
    };

    const ptItem = {
      key: 'ndt_pt',
      name: '渗透检测',
      category: 'ndt',
      result: '无缺陷',
    };

    const annotated = annotateAdditionalTests([headerItem1, headerItem2, ptItem], {
      mechanical: sampleMechanical,
      process: sampleProcess,
    });

    expect(annotated).toHaveLength(3);
    for (const t of annotated) {
      expect(t.is_composite).toBeUndefined();
      expect(t.is_suspected_duplicate).toBeUndefined();
    }
  });

  it('无 mechanical 核心结构时，不误标未拆分的独立长尾条目', () => {
    const standaloneItem = {
      key: 'test_single',
      name: '硬度试验 (HV1)',
      category: 'mechanical',
      result: '143 HV1',
    };

    const annotated = annotateAdditionalTests([standaloneItem], {
      mechanical: null,
      process: null,
    });

    expect(annotated).toHaveLength(1);
    expect(annotated[0].key).toBe('test_single');
    expect(annotated[0].is_composite).toBeUndefined();
    expect(annotated[0].is_suspected_duplicate).toBeUndefined();
  });

  it('batchSpecimenToCertificateExtract 全链路转换保证 Rp0.2 纯净且不被覆写', () => {
    const batchSpecimen = {
      batchNo: 'Z26022C-E1',
      grade: '06Cr18Ni11Ti',
      standard: 'GB/T 13296-2023',
      mechanical: sampleMechanical,
      process: sampleProcess,
      additionalTests: [
        {
          key: 'test_composite_bad',
          name: '室温拉伸试验',
          category: 'mechanical',
          result: 'Rp0.2=334、343 MPa；Rm=675、669 MPa；A=48.0、48.0 %',
        },
        {
          key: 'geo_surface_quality',
          name: '表面质量',
          category: 'process',
          result: '合格 OK',
        },
      ],
    };

    const extract = batchSpecimenToCertificateExtract(batchSpecimen);

    const yieldRecords = extract.test_records.filter(
      (r: any) => r.property_key === 'yield_strength_rp02'
    );

    // 只能有 1 条屈服强度记录，且数值必须是 334，绝不能是 0.2
    expect(yieldRecords).toHaveLength(1);
    expect(yieldRecords[0].measured_value_num).toBe(334);
    expect(yieldRecords[0].measured_value_raw).toBe('334、343 MPa');

    // 复合的 "室温拉伸试验" 不再被过滤删除，但其 record 强制无数值、仅保留原文
    const compositeRecords = extract.test_records.filter(
      (r: any) => r.display_name === '室温拉伸试验' || String(r.measured_value_raw).includes('Rp0.2=334')
    );
    expect(compositeRecords).toHaveLength(1);
    expect(compositeRecords[0].measured_value_num).toBeUndefined();
    expect(compositeRecords[0].measured_value_raw).toBe('Rp0.2=334、343 MPa；Rm=675、669 MPa；A=48.0、48.0 %');

    // 合法的独立项目保留
    const surfaceRecords = extract.test_records.filter(
      (r: any) => r.property_key === 'surface_quality'
    );
    expect(surfaceRecords).toHaveLength(1);
  });

  it('复合条目即使携带 value_num，全链路 record 也强制无 measured_value_num 但保留 raw', () => {
    const batchSpecimen = {
      batchNo: 'Z26022C-E2',
      grade: '06Cr18Ni11Ti',
      standard: 'GB/T 13296-2023',
      mechanical: sampleMechanical,
      process: sampleProcess,
      additionalTests: [
        {
          key: 'test_composite_num',
          name: '拉伸试验',
          category: 'mechanical',
          result: 'Rp0.2=334 MPa；Rm=675 MPa',
          value_num: 334,
        },
      ],
    };

    const extract = batchSpecimenToCertificateExtract(batchSpecimen);

    const compositeRecords = extract.test_records.filter(
      (r: any) => String(r.measured_value_raw).includes('Rp0.2=334')
    );
    expect(compositeRecords).toHaveLength(1);
    // is_composite 强制降级：即使 value_num 存在也不标量化
    expect(compositeRecords[0].measured_value_num).toBeUndefined();
    expect(compositeRecords[0].measured_value_raw).toBe('Rp0.2=334 MPa；Rm=675 MPa');
    expect(compositeRecords[0].qualitative_result).toBeTruthy();
  });

  it('全链路 provenance 字段：核心记录 core，长尾附加记录 additional', () => {
    const batchSpecimen = {
      batchNo: 'Z26022C-E3',
      grade: '06Cr18Ni11Ti',
      standard: 'GB/T 13296-2023',
      chemical: [{ element: 'C', value: '0.018' }],
      mechanical: sampleMechanical,
      process: sampleProcess,
      additionalTests: [
        {
          key: 'ndt_pt',
          name: '渗透检测',
          category: 'ndt',
          result: '无缺陷',
        },
      ],
    };

    const extract = batchSpecimenToCertificateExtract(batchSpecimen);

    const chemicalRecord = extract.test_records.find((r: any) => r.category === 'chemical');
    expect(chemicalRecord.provenance).toBe('core');
    expect(chemicalRecord.measured_value_num).toBe(0.018);

    const coreRecords = extract.test_records.filter((r: any) => r.provenance === 'core');
    const additionalRecords = extract.test_records.filter((r: any) => r.provenance === 'additional');

    expect(coreRecords.length).toBeGreaterThan(0);
    expect(additionalRecords).toHaveLength(1);
    expect(additionalRecords[0].raw_property_name).toBe('渗透检测');
    expect(additionalRecords[0].provenance).toBe('additional');
    // 每条 record 都必须带来源标记
    expect(extract.test_records.every((r: any) => r.provenance === 'core' || r.provenance === 'additional')).toBe(true);
  });
});
