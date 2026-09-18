import { describe, it, expect } from 'vitest';
import { updateBatchExtractValue } from '@/components/workbench/utils/batch-field-updater.ts';
import { BatchSpecimen } from '@/types/session.ts';

describe('updateBatchExtractValue 单元测试', () => {
  const baseBatch: BatchSpecimen = {
    batchNo: 'BATCH-001',
    subBatchIndex: 1,
    grade: '022Cr17Ni12Mo2',
    standard: 'GB/T 13296-2023',
    heatNo: 'HEAT-01',
    supplier: '特钢厂',
    dimensions: '25x2',
    verdict: 'PASS',
    verdictSummary: '合格',
    ocrConfidence: 95,
    gradeMatchConfidence: 95,
    reportNo: 'R1',
    sha256Hash: 'hash-001',
    inspector: 'QA-01',
    chemical: [
      { element: 'C', value: '0.02', confidence: '90%', status: 'ok' },
      { element: 'Cr', value: '17.0', confidence: '90%', status: 'ok' },
    ],
    mechanical: {
      tensile_rm: '500',
      yield_rp02: '200',
      elongation_a: '35',
      hardness: '150',
      impact_kv2_1: '',
      impact_kv2_2: '',
      impact_kv2_3: '',
      impact_kv2_avg: '',
    },
    process: {
      flattening: '',
      flaring: '',
      grainSize: '',
      intergranularCorrosion: '',
      ndt_et: '',
      ndt_ut: '',
    },
    additionalTests: [
      { key: 'custom_test', name: '附加检验', category: 'ndt', result: '原始值' },
    ],
    humanVerdict: null,
  };

  it('更新化学成分字段：清除 wt% 并更新值与置信度', () => {
    const updated = updateBatchExtractValue(baseBatch, 'chem_Cr', '17.5 wt%');
    const cr = updated.chemical.find(c => c.element === 'Cr');
    expect(cr).toBeDefined();
    expect(cr?.value).toBe('17.5');
    expect(cr?.confidence).toBe('100%');
  });

  it('更新力学性能字段：tensile_rm, yield_rp02 等', () => {
    const updated = updateBatchExtractValue(baseBatch, 'mech_tensile', '550');
    expect(updated.mechanical.tensile_rm).toBe('550');
  });

  it('更新工艺性能字段：flattening, flaring, ndt_et', () => {
    const updated = updateBatchExtractValue(baseBatch, 'proc_flattening', 'PASS');
    expect(updated.process.flattening).toBe('PASS');
  });

  it('更新元数据字段：meta_grade, meta_standard', () => {
    const updated = updateBatchExtractValue(baseBatch, 'meta_grade', '06Cr19Ni10');
    expect(updated.grade).toBe('06Cr19Ni10');
  });

  it('更新长尾扩展项与尺寸表面质量', () => {
    const updated = updateBatchExtractValue(baseBatch, 'custom_test', '合格通过');
    expect(updated.additionalTests?.find(t => t.key === 'custom_test')?.result).toBe('合格通过');
  });
});
