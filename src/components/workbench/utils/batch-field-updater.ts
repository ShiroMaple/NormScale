import { BatchSpecimen } from '@/types/session.ts';
import { FieldBBox } from '@/types/bbox.ts';
import { ConfidenceEvaluator } from '@/engine/confidence-evaluator.ts';

/**
 * 纯函数：根据 fieldId 更新批次对应理化指标或基础元数据，并重新结合 BBox 评估置信度
 */
export function updateBatchExtractValue(
  batch: BatchSpecimen,
  fieldId: string,
  newValue: string,
  bboxes?: FieldBBox[]
): BatchSpecimen {
  let updatedB: BatchSpecimen = { ...batch };

  // 1. 化学成分
  if (fieldId.startsWith('chem_')) {
    const elem = fieldId.replace('chem_', '');
    const cleanVal = newValue.replace(/\s*wt%?/i, '').trim();
    updatedB = {
      ...updatedB,
      chemical: (updatedB.chemical || []).map(c => {
        if (c.element.toLowerCase() === elem.toLowerCase()) {
          return { ...c, value: cleanVal, confidence: '100%', status: 'ok' as const, note: undefined };
        }
        return c;
      }),
    };
    return ConfidenceEvaluator.enrichBatchConfidences(updatedB, bboxes);
  }

  // 2. 力学性能
  if (fieldId === 'mech_tensile') {
    updatedB = { ...updatedB, mechanical: { ...updatedB.mechanical, tensile_rm: newValue } };
  } else if (fieldId === 'mech_yield') {
    updatedB = { ...updatedB, mechanical: { ...updatedB.mechanical, yield_rp02: newValue } };
  } else if (fieldId === 'mech_elongation') {
    updatedB = { ...updatedB, mechanical: { ...updatedB.mechanical, elongation_a: newValue } };
  } else if (fieldId === 'mech_hardness') {
    updatedB = { ...updatedB, mechanical: { ...updatedB.mechanical, hardness: newValue } };
  }

  // 3. 工艺性能
  else if (fieldId === 'proc_flattening') {
    updatedB = { ...updatedB, process: { ...updatedB.process, flattening: newValue } };
  } else if (fieldId === 'proc_flaring') {
    updatedB = { ...updatedB, process: { ...updatedB.process, flaring: newValue } };
  }

  // 4. 金相组织
  else if (fieldId === 'metallo_grain') {
    updatedB = { ...updatedB, process: { ...updatedB.process, grainSize: newValue } };
  }

  // 5. 耐腐蚀性能
  else if (fieldId === 'corrosion_intergranular') {
    updatedB = { ...updatedB, process: { ...updatedB.process, intergranularCorrosion: newValue } };
  }

  // 6. 无损探伤
  else if (fieldId === 'ndt_et') {
    updatedB = { ...updatedB, process: { ...updatedB.process, ndt_et: newValue, ndt: newValue } };
  } else if (fieldId === 'ndt_ut') {
    updatedB = { ...updatedB, process: { ...updatedB.process, ndt_ut: newValue } };
  } else if (fieldId === 'ndt_pressure' || fieldId === 'ndt') {
    updatedB = { ...updatedB, process: { ...updatedB.process, ndt: newValue } };
  }

  // 弹性长尾扩展检验项
  else if (updatedB.additionalTests && updatedB.additionalTests.some(t => t.key === fieldId)) {
    updatedB = {
      ...updatedB,
      additionalTests: updatedB.additionalTests.map(t => t.key === fieldId ? { ...t, result: newValue } : t),
    };
  }

  // 尺寸与表面质量判定项
  else if (fieldId === 'geo_dimensions') {
    const hasAddTest = updatedB.additionalTests?.some(t => t.key === 'geo_dimensions' || t.name?.includes('尺寸'));
    if (hasAddTest) {
      updatedB = {
        ...updatedB,
        additionalTests: updatedB.additionalTests?.map(t => (t.key === 'geo_dimensions' || t.name?.includes('尺寸')) ? { ...t, result: newValue } : t),
      };
    }
    updatedB = { ...updatedB, dimensions: newValue };
  } else if (fieldId === 'surface_quality' || fieldId === 'geo_surface_quality') {
    const hasAddTest = updatedB.additionalTests?.some(t => t.key === 'geo_surface_quality' || t.name?.includes('表面'));
    updatedB = {
      ...updatedB,
      surfaceQuality: newValue,
      additionalTests: hasAddTest
        ? updatedB.additionalTests?.map(t => (t.key === 'geo_surface_quality' || t.name?.includes('表面')) ? { ...t, result: newValue } : t)
        : updatedB.additionalTests,
    };
  }

  // 7. 基础元数据
  else if (fieldId === 'meta_grade') {
    updatedB = { ...updatedB, grade: newValue };
  } else if (fieldId === 'meta_standard') {
    updatedB = { ...updatedB, standard: newValue };
  } else if (fieldId === 'meta_heatNo') {
    updatedB = { ...updatedB, heatNo: newValue };
  } else if (fieldId === 'meta_packNo') {
    updatedB = { ...updatedB, packNo: newValue };
  } else if (fieldId === 'meta_dimensions') {
    updatedB = { ...updatedB, dimensions: newValue };
  } else if (fieldId === 'meta_deliveryState') {
    updatedB = { ...updatedB, deliveryState: newValue };
  } else if (fieldId === 'meta_certificateNo') {
    updatedB = { ...updatedB, certificateNo: newValue };
  } else if (fieldId === 'meta_constructionNo') {
    updatedB = { ...updatedB, constructionNo: newValue };
  } else if (fieldId === 'meta_supplier') {
    updatedB = { ...updatedB, supplier: newValue };
  } else if (fieldId === 'meta_productName') {
    updatedB = { ...updatedB, productName: newValue };
  }

  return ConfidenceEvaluator.enrichBatchConfidences(updatedB, bboxes);
}
