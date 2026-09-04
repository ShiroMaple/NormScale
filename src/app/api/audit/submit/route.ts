import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverWorkflowEngine } from '@/lib/server-engine.ts';
import { PropertyKeyNormalizer } from '@/normalizer/property-key-normalizer.ts';

const SubmitAuditRequestSchema = z.object({
  /** 预设样本 ID (如 's30408_messy_sample', 's31603_kgf_sample') */
  sampleId: z.string().optional(),
  /** 自定义结构化原始质保书松散载荷 */
  rawPayload: z.record(z.any()).optional(),
  /** 工作台批次规格试样对象 (BatchSpecimen) */
  batchSpecimen: z.record(z.any()).optional(),
  /** 多份执行标准代号列表 (如 ['GB/T 13296-2023', 'NB/T 47019.5-2021']) */
  standardIds: z.array(z.string()).optional(),
  /** 材料牌号路由键 (如 'S32168') */
  gradeKey: z.string().optional(),
  /** 运行期核验配置选项 */
  options: z
    .object({
      minConfidenceThreshold: z.number().min(0).max(1).optional(),
      forcedStandardId: z.string().optional(),
      forcedStandardIds: z.array(z.string()).optional(),
      forcedGradeKey: z.string().optional(),
      skipSemanticReview: z.boolean().optional(),
      contextId: z.string().optional(),
    })
    .optional(),
});

function batchSpecimenToCertificateExtract(batch: any, standardIds?: string[], gradeKey?: string) {
  const std = (standardIds && standardIds.length > 0)
    ? standardIds.join('、')
    : (batch.overrideStandard || batch.standard || 'GB/T 13296-2023');
  const grade = gradeKey || batch.overrideGrade || batch.grade || '06Cr18Ni11Ti (S32168)';

  // chemical: 支持提取 "<0.01", "≤0.005", "0.018" 等不等式数值以供动态公式保守计算
  const chemicalRecords = Array.isArray(batch.chemical)
    ? batch.chemical.map((c: any) => {
      const rawStr = String(c.value ?? '').trim();
      const numMatch = rawStr.match(/([0-9]+(?:\.[0-9]+)?)/);
      const parsedNum = numMatch && numMatch[1] ? parseFloat(numMatch[1]) : undefined;
      return {
        category: 'chemical' as const,
        property_key: c.element,
        measured_value_raw: rawStr,
        measured_value_num: parsedNum,
        unit: '%',
      };
    })
    : [];

  // mechanical
  const mechanicalRecords: any[] = [];
  if (batch.mechanical) {
    if (batch.mechanical.tensile_rm) {
      mechanicalRecords.push({
        category: 'mechanical' as const,
        property_key: 'tensile_strength',
        display_name: '抗拉强度 Rm',
        measured_value_raw: String(batch.mechanical.tensile_rm),
        measured_value_num: !isNaN(parseFloat(batch.mechanical.tensile_rm)) ? parseFloat(batch.mechanical.tensile_rm) : undefined,
        unit: 'MPa',
      });
    }
    if (batch.mechanical.yield_rp02) {
      mechanicalRecords.push({
        category: 'mechanical' as const,
        property_key: 'yield_strength_rp02',
        display_name: '规定塑性延伸强度 Rp0.2',
        measured_value_raw: String(batch.mechanical.yield_rp02),
        measured_value_num: !isNaN(parseFloat(batch.mechanical.yield_rp02)) ? parseFloat(batch.mechanical.yield_rp02) : undefined,
        unit: 'MPa',
      });
    }
    if (batch.mechanical.elongation_a) {
      mechanicalRecords.push({
        category: 'mechanical' as const,
        property_key: 'elongation_A',
        display_name: '断后伸长率 A',
        measured_value_raw: String(batch.mechanical.elongation_a),
        measured_value_num: !isNaN(parseFloat(batch.mechanical.elongation_a)) ? parseFloat(batch.mechanical.elongation_a) : undefined,
        unit: '%',
      });
    }
    if (batch.mechanical.hardness) {
      const rawHardness = String(batch.mechanical.hardness);
      let subProp: string | undefined;
      let unit = '';
      if (/HV/i.test(rawHardness) || /维氏/.test(rawHardness)) {
        subProp = 'HV';
        unit = 'HV';
      } else if (/HRB/i.test(rawHardness) || /洛氏/.test(rawHardness)) {
        subProp = 'HRB';
        unit = 'HRB';
      } else if (/HBW|HBS/i.test(rawHardness) || /布氏/.test(rawHardness)) {
        subProp = 'HBW';
        unit = 'HBW';
      }

      const nums = rawHardness.match(/\d+(\.\d+)?/g);
      let numVal: number | undefined;
      if (nums && nums.length > 0) {
        const sum = nums.reduce((acc, n) => acc + parseFloat(n), 0);
        numVal = Math.round((sum / nums.length) * 10) / 10;
      }

      mechanicalRecords.push({
        category: 'mechanical' as const,
        property_key: 'hardness',
        display_name: '硬度试验 (Hardness)',
        sub_property: subProp,
        measured_value_raw: rawHardness,
        measured_value_num: numVal,
        unit: unit || undefined,
      });
    }
  }

  // process & others
  const processRecords: any[] = [];
  if (batch.process) {
    if (batch.process.flattening) {
      processRecords.push({
        category: 'process' as const,
        property_key: 'flattening_test',
        display_name: '压扁试验',
        measured_value_raw: String(batch.process.flattening),
        qualitative_result: String(batch.process.flattening),
      });
    }
    if (batch.process.flaring) {
      processRecords.push({
        category: 'process' as const,
        property_key: 'flaring_test',
        display_name: '扩口试验',
        measured_value_raw: String(batch.process.flaring),
        qualitative_result: String(batch.process.flaring),
      });
    }
    if (batch.process.intergranularCorrosion) {
      processRecords.push({
        category: 'corrosion' as const,
        property_key: 'intergranular_corrosion',
        display_name: '晶间腐蚀试验',
        measured_value_raw: String(batch.process.intergranularCorrosion),
        qualitative_result: String(batch.process.intergranularCorrosion),
      });
    }
    if (batch.process.grainSize) {
      processRecords.push({
        category: 'metallographic' as const,
        property_key: 'grain_size',
        display_name: '晶粒度',
        measured_value_raw: String(batch.process.grainSize),
        measured_value_num: !isNaN(parseFloat(batch.process.grainSize)) ? parseFloat(batch.process.grainSize) : undefined,
        unit: '级',
      });
    }
    if (batch.process.ndt_et || (batch.process.ndt && String(batch.process.ndt).includes('涡流'))) {
      const rawVal = batch.process.ndt_et ?? batch.process.ndt;
      const etRaw = rawVal === true ? '合格 OK' : String(rawVal);
      const etMatch = etRaw.match(/E[1-4]H?/i);
      processRecords.push({
        category: 'ndt' as const,
        property_key: 'eddy_current_test',
        display_name: '涡流检测',
        measured_value_raw: etRaw,
        measured_level_claimed: etMatch ? etMatch[0].toUpperCase() : undefined,
        qualitative_result: etRaw,
      });
    }
    if (batch.process.ndt_ut || (batch.process.ndt && String(batch.process.ndt).includes('超声'))) {
      const rawVal = batch.process.ndt_ut ?? batch.process.ndt;
      const utRaw = rawVal === true ? '合格 OK' : String(rawVal);
      const utMatch = utRaw.match(/U[1-4]/i);
      processRecords.push({
        category: 'ndt' as const,
        property_key: 'ultrasonic_test',
        display_name: '超声检测',
        measured_value_raw: utRaw,
        measured_level_claimed: utMatch ? utMatch[0].toUpperCase() : undefined,
        qualitative_result: utRaw,
      });
    }

    const hasEddy = Boolean(batch.process.ndt_et || (batch.process.ndt && String(batch.process.ndt).includes('涡流')));
    const hasHydro = Boolean(batch.process.pressureTest || batch.process.hydrostatic || (batch.process.ndt && String(batch.process.ndt).includes('水压')));
    if (hasEddy || hasHydro) {
      const hydroRaw = batch.process.pressureTest || batch.process.hydrostatic;
      const eddyRaw = batch.process.ndt_et || (batch.process.ndt && String(batch.process.ndt).includes('涡流') ? batch.process.ndt : undefined);
      const ptRaw = hydroRaw ? String(hydroRaw) : (eddyRaw ? String(eddyRaw) : '合格 OK');
      processRecords.push({
        category: 'ndt' as const,
        property_key: 'pressure_tightness',
        display_name: '承压/致密性检验 (水压或涡流)',
        measured_value_raw: ptRaw,
        qualitative_result: ptRaw,
      });
    }

    const surfaceVal = batch.process?.surfaceQuality || batch.surfaceQuality;
    if (surfaceVal) {
      processRecords.push({
        category: 'surface' as const,
        property_key: 'surface_quality',
        display_name: '表面质量与粗糙度',
        measured_value_raw: String(surfaceVal),
        qualitative_result: String(surfaceVal),
      });
    }
  }

  // dimensions 解析：支持 dimensions 字符串如 "OD 15.0mm × WT 0.8mm"、"Φ25×2.0"、"25*2.5" 或对象
  let outerDiameter: number | undefined = undefined;
  let wallThickness: number | undefined = undefined;
  if (batch.dimensions) {
    if (typeof batch.dimensions === 'string') {
      const dimStr = batch.dimensions.trim();
      const labeledMatch = dimStr.match(/(?:OD|外径|Φ|φ)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:mm)?\s*[×*xX/]\s*(?:WT|壁厚)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:mm)?/i);
      if (labeledMatch) {
        outerDiameter = parseFloat(labeledMatch[1]);
        wallThickness = parseFloat(labeledMatch[2]);
      } else {
        const odOnly = dimStr.match(/(?:OD|外径)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)/i);
        const wtOnly = dimStr.match(/(?:WT|壁厚)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)/i);
        if (odOnly) outerDiameter = parseFloat(odOnly[1]);
        if (wtOnly) wallThickness = parseFloat(wtOnly[1]);
      }
    } else if (typeof batch.dimensions === 'object') {
      if (batch.dimensions.outer_diameter_mm !== undefined && batch.dimensions.outer_diameter_mm !== null) {
        const parsed = Number(batch.dimensions.outer_diameter_mm);
        if (!isNaN(parsed)) outerDiameter = parsed;
      }
      if (batch.dimensions.wall_thickness_mm !== undefined && batch.dimensions.wall_thickness_mm !== null) {
        const parsed = Number(batch.dimensions.wall_thickness_mm);
        if (!isNaN(parsed)) wallThickness = parsed;
      }
    }
  } else if (batch.outer_diameter_mm || batch.wall_thickness_mm) {
    if (batch.outer_diameter_mm) outerDiameter = Number(batch.outer_diameter_mm);
    if (batch.wall_thickness_mm) wallThickness = Number(batch.wall_thickness_mm);
  }

  // additional tests: 统一通过 PropertyKeyNormalizer 进行属性键名与分类规范化，彻底消除长尾项键名脱节
  const additionalRecords = Array.isArray(batch.additionalTests)
    ? batch.additionalTests.map((t: any) => {
      const norm = PropertyKeyNormalizer.normalize(t.key || t.name, t.category);
      return {
        category: (norm.is_known ? norm.category : (t.category || 'process')) as any,
        property_key: norm.property_key,
        display_name: norm.display_name || t.name || norm.property_key,
        measured_value_raw: t.result || String(t.value_num ?? ''),
        measured_value_num: typeof t.value_num === 'number' ? t.value_num : undefined,
        unit: t.unit,
        qualitative_result: t.result || t.conclusion,
      };
    })
    : [];

  return {
    header: {
      certificate_no: batch.certificateNo || 'MTC-SAMPLE',
      declared_standard: std,
      declared_grade: grade,
      material_product_name: batch.productName,
      heat_number: batch.heatNo,
      heat_treatment_lot_number: batch.packNo,
      batch_lot_number: batch.batchNo,
      supplier_name: batch.supplier,
      construction_number: batch.constructionNo,
      dimensions: (outerDiameter !== undefined || wallThickness !== undefined) ? {
        outer_diameter_mm: outerDiameter,
        wall_thickness_mm: wallThickness,
      } : undefined,
    },
    test_records: [
      ...chemicalRecords,
      ...mechanicalRecords,
      ...processRecords,
      ...additionalRecords,
    ],
  };
}

/**
 * ============================================================================
 * POST /api/audit/submit: 提交质保证书核验任务
 * ============================================================================
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parseResult = SubmitAuditRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: '请求参数校验失败',
          details: parseResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { sampleId, rawPayload, batchSpecimen, standardIds, gradeKey, options } = parseResult.data;

    let inputData: any;
    let effectiveOptions = options || {};

    if (batchSpecimen) {
      inputData = batchSpecimenToCertificateExtract(batchSpecimen, standardIds, gradeKey);
      effectiveOptions = {
        ...effectiveOptions,
        forcedStandardIds: standardIds || effectiveOptions.forcedStandardIds,
        forcedGradeKey: gradeKey || effectiveOptions.forcedGradeKey,
      };
    } else if (sampleId) {
      inputData = sampleId;
    } else if (rawPayload) {
      inputData = JSON.stringify(rawPayload);
    } else {
      return NextResponse.json(
        { success: false, error: '请求必须提供 batchSpecimen、rawPayload 结构化数据或 sampleId' },
        { status: 400 }
      );
    }

    const result = await serverWorkflowEngine.submitAudit(inputData, effectiveOptions);

    return NextResponse.json({
      success: result.status !== 'failed',
      taskId: result.taskId,
      status: result.status,
      finalReport: result.finalReport,
      hitlContext: result.hitlContext,
      error: result.error,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `任务提交执行异常: ${message}` },
      { status: 500 }
    );
  }
}
