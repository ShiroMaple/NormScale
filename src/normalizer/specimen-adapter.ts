import { PropertyKeyNormalizer } from './property-key-normalizer.ts';
import { QualitativeNormalizer } from './qualitative-normalizer.ts';

/**
 * ============================================================================
 * 工作台批次试样转换适配器 (Specimen Adapter)
 * ============================================================================
 * 
 * 将前端工作台传入的 BatchSpecimen 结构转换为质检核验引擎消费的 CertificateExtract 结构。
 * 支持探伤代号（UT/ET/U1-U4/E1-E4H）精准解构、水压试验多来源提取与隔离。
 * ============================================================================
 */
export function batchSpecimenToCertificateExtract(batch: any, standardIds?: string[], gradeKey?: string) {
  const std = (standardIds && standardIds.length > 0)
    ? standardIds.join('、')
    : (batch.overrideStandard || batch.standard || 'GB/T 13296-2023');
  const grade = gradeKey || batch.overrideGrade || batch.grade || '06Cr18Ni11Ti (S32168)';

  // chemical: 支持 Array [{ element: 'C', value: '0.018' }] 或 Object { C: 0.018, ... }，以及 "<0.01", "≤0.005", "0.018" 等数值
  const chemicalRecords: any[] = [];
  if (Array.isArray(batch.chemical)) {
    for (const c of batch.chemical) {
      const rawStr = String(c.value ?? '').trim();
      const numMatch = rawStr.match(/([0-9]+(?:\.[0-9]+)?)/);
      const parsedNum = numMatch && numMatch[1] ? parseFloat(numMatch[1]) : undefined;
      chemicalRecords.push({
        category: 'chemical' as const,
        property_key: c.element,
        measured_value_raw: rawStr,
        measured_value_num: parsedNum,
        unit: '%',
      });
    }
  } else if (batch.chemical && typeof batch.chemical === 'object') {
    for (const [el, val] of Object.entries(batch.chemical)) {
      const rawStr = String(val ?? '').trim();
      const numMatch = rawStr.match(/([0-9]+(?:\.[0-9]+)?)/);
      const parsedNum = numMatch && numMatch[1] ? parseFloat(numMatch[1]) : undefined;
      chemicalRecords.push({
        category: 'chemical' as const,
        property_key: el,
        measured_value_raw: rawStr,
        measured_value_num: parsedNum,
        unit: '%',
      });
    }
  }

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
    const rawYield =
      batch.mechanical.yield_rp02 ??
      batch.mechanical.yield_reh ??
      batch.mechanical.yield_rel ??
      batch.mechanical.yield_strength ??
      batch.mechanical.yield ??
      batch.mechanical.reh ??
      batch.mechanical.rp02 ??
      batch.mechanical['屈服强度'] ??
      batch.mechanical['屈服点'];
    if (rawYield !== undefined && rawYield !== null && String(rawYield).trim() !== '') {
      const rawYieldStr = String(rawYield).trim();
      const numMatch = rawYieldStr.match(/([0-9]+(?:\.[0-9]+)?)/);
      const parsedNum = (numMatch && typeof numMatch[1] === 'string') ? parseFloat(numMatch[1]) : undefined;
      const mechObj = batch.mechanical as Record<string, any>;
      mechanicalRecords.push({
        category: 'mechanical' as const,
        property_key: 'yield_strength_rp02',
        display_name: '规定塑性延伸强度 Rp0.2',
        raw_property_name: mechObj.yield_reh ? 'ReH' : (mechObj.yield_rp02 ? 'Rp0.2' : '屈服强度'),
        measured_value_raw: rawYieldStr,
        measured_value_num: parsedNum,
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

    // 保全未知/长尾力学项目，防止在漏斗前置截断
    const processedMechKeys = new Set([
      'tensile_rm', 'yield_rp02', 'yield_reh', 'yield_rel', 'yield_strength', 'yield',
      'reh', 'rp02', 'elongation_a', 'hardness', 'impact_akv', 'ast_formula_note',
      '屈服强度', '屈服点'
    ]);
    for (const [key, val] of Object.entries(batch.mechanical)) {
      if (!processedMechKeys.has(key) && val !== undefined && val !== null && String(val).trim() !== '') {
        const valStr = String(val).trim();
        const numMatch = valStr.match(/([0-9]+(?:\.[0-9]+)?)/);
        const parsedNum = (numMatch && typeof numMatch[1] === 'string') ? parseFloat(numMatch[1]) : undefined;
        const norm = PropertyKeyNormalizer.normalize(key, 'mechanical', { measuredRaw: valStr });
        mechanicalRecords.push({
          category: 'mechanical' as const,
          property_key: norm.property_key,
          display_name: norm.is_known ? norm.display_name : key,
          raw_property_name: key,
          measured_value_raw: valStr,
          measured_value_num: parsedNum,
          qualitative_result: valStr,
        });
      }
    }
  }

  // 预先扫描 additionalTests 中是否有水压/液压/承压致密性项目
  const additionalList: any[] = Array.isArray(batch.additionalTests) ? batch.additionalTests : [];
  const hydroAdditionalItem = additionalList.find((t: any) => {
    const k = String(t.key || '').toLowerCase();
    const n = String(t.name || '').toLowerCase();
    return (
      k.includes('hydraulic') ||
      k.includes('hydrostatic') ||
      k.includes('pressure') ||
      n.includes('水压') ||
      n.includes('液压') ||
      n.includes('气压') ||
      n.includes('致密性')
    );
  });

  // process & others (依托 PropertyKeyNormalizer 与 QualitativeNormalizer 全量解构)
  const processRecords: any[] = [];
  const processedKeys = new Set<string>();

  // 聚合待处理的工艺与外观候选条目
  const candidateEntries: Array<[string, unknown]> = [];
  if (batch.process && typeof batch.process === 'object') {
    for (const [k, v] of Object.entries(batch.process)) {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        candidateEntries.push([k, v]);
      }
    }
  }
  // 检查挂载在 batch 顶层的外观质量字段
  for (const rootKey of ['surfaceQuality', 'surface_quality', 'surface']) {
    const v = batch[rootKey];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      candidateEntries.push([rootKey, v]);
    }
  }

  // 探伤与水压致密性特征预判
  const ndtStr = String(batch.process?.ndt || '');
  const hasEddy = Boolean(
    batch.process?.ndt_et ||
    ndtStr.includes('涡流') ||
    /(?:^|[^A-Za-z0-9])(E[1-4]H?|ET)(?:[^A-Za-z0-9]|$)/i.test(ndtStr) ||
    /\bE[1-4]H?\b/i.test(ndtStr)
  );
  const hasUt = Boolean(
    batch.process?.ndt_ut ||
    ndtStr.includes('超声') ||
    /(?:^|[^A-Za-z0-9])(U[1-4]|UT)(?:[^A-Za-z0-9]|$)/i.test(ndtStr) ||
    /\bU[1-4]\b/i.test(ndtStr)
  );
  const hasHydro = Boolean(
    batch.process?.pressureTest ||
    batch.process?.hydrostatic ||
    ndtStr.includes('水压') ||
    ndtStr.includes('液压') ||
    hydroAdditionalItem
  );

  // 遍历所有候选键值对进行确定性归一化
  for (const [rawKey, rawVal] of candidateEntries) {
    if (rawKey === 'ndt') continue;
    const valStr = String(rawVal).trim();
    if (!valStr) continue;

    const norm = PropertyKeyNormalizer.normalize(rawKey, 'process', { measuredRaw: valStr });
    if (processedKeys.has(norm.property_key)) continue;

    const qual = QualitativeNormalizer.normalize(valStr);

    if (norm.property_key === 'grain_size') {
      const numMatch = valStr.match(/[-+]?[0-9]+(?:\.[0-9]+)?/);
      processRecords.push({
        category: 'metallographic' as const,
        property_key: 'grain_size',
        display_name: norm.display_name,
        raw_property_name: rawKey,
        measured_value_raw: valStr,
        measured_value_num: numMatch ? parseFloat(numMatch[0]) : undefined,
        unit: '级',
        qualitative_result: qual.qualitative_result,
      });
      processedKeys.add(norm.property_key);
    } else if (norm.property_key === 'eddy_current_test') {
      const etRaw = rawVal === true ? '合格 OK' : valStr;
      const etMatch = etRaw.match(/E[1-4]H?/i) || etRaw.match(/\bET\b/i);
      processRecords.push({
        category: 'ndt' as const,
        property_key: 'eddy_current_test',
        display_name: norm.display_name,
        raw_property_name: rawKey,
        measured_value_raw: etRaw,
        measured_level_claimed: etMatch ? etMatch[0].toUpperCase() : qual.claimed_level,
        qualitative_result: qual.qualitative_result,
      });
      processedKeys.add(norm.property_key);
    } else if (norm.property_key === 'ultrasonic_test') {
      const utRaw = rawVal === true ? '合格 OK' : valStr;
      const utMatch = utRaw.match(/U[1-4]/i) || utRaw.match(/\bUT\b/i);
      processRecords.push({
        category: 'ndt' as const,
        property_key: 'ultrasonic_test',
        display_name: norm.display_name,
        raw_property_name: rawKey,
        measured_value_raw: utRaw,
        measured_level_claimed: utMatch ? utMatch[0].toUpperCase() : qual.claimed_level,
        qualitative_result: qual.qualitative_result,
      });
      processedKeys.add(norm.property_key);
    } else if (norm.property_key === 'pressure_tightness' || norm.property_key === 'hydraulic_test') {
      // 统一交由后置致密性试验块组合判定
    } else {
      processRecords.push({
        category: norm.category,
        property_key: norm.property_key,
        display_name: norm.display_name,
        raw_property_name: rawKey,
        measured_value_raw: valStr,
        qualitative_result: qual.qualitative_result,
        measured_level_claimed: qual.claimed_level,
      });
      processedKeys.add(norm.property_key);
    }
  }

  // 若 ndt 中明确包含涡流但此前未生成 eddy_current_test 记录
  if (hasEddy && !processedKeys.has('eddy_current_test')) {
    const rawVal = batch.process?.ndt_et ?? batch.process?.ndt;
    const etRaw = rawVal === true ? '合格 OK' : String(rawVal || '合格 OK');
    const etMatch = etRaw.match(/E[1-4]H?/i) || etRaw.match(/\bET\b/i);
    processRecords.push({
      category: 'ndt' as const,
      property_key: 'eddy_current_test',
      display_name: '涡流检测',
      measured_value_raw: etRaw,
      measured_level_claimed: etMatch ? etMatch[0].toUpperCase() : undefined,
      qualitative_result: etRaw,
    });
    processedKeys.add('eddy_current_test');
  }

  // 若 ndt 中明确包含超声但此前未生成 ultrasonic_test 记录
  if (hasUt && !processedKeys.has('ultrasonic_test')) {
    const rawVal = batch.process?.ndt_ut ?? batch.process?.ndt;
    const utRaw = rawVal === true ? '合格 OK' : String(rawVal || '合格 OK');
    const utMatch = utRaw.match(/U[1-4]/i) || utRaw.match(/\bUT\b/i);
    processRecords.push({
      category: 'ndt' as const,
      property_key: 'ultrasonic_test',
      display_name: '超声检测',
      measured_value_raw: utRaw,
      measured_level_claimed: utMatch ? utMatch[0].toUpperCase() : undefined,
      qualitative_result: utRaw,
    });
    processedKeys.add('ultrasonic_test');
  }

  // 致密性与水压试验组合判定
  if ((hasEddy || hasHydro) && !processedKeys.has('pressure_tightness')) {
    const hydroRaw =
      batch.process?.pressureTest ||
      batch.process?.hydrostatic ||
      (hydroAdditionalItem ? (hydroAdditionalItem.result || String(hydroAdditionalItem.value_num ?? '')) : undefined);
    const eddyRaw =
      batch.process?.ndt_et ||
      (ndtStr.includes('涡流') ? batch.process?.ndt : undefined);
    const ptRaw = hydroRaw ? String(hydroRaw) : (eddyRaw ? String(eddyRaw) : '合格 OK');
    processRecords.push({
      category: 'ndt' as const,
      property_key: 'pressure_tightness',
      display_name: '致密性/水压试验组 (Pressure Tightness)',
      measured_value_raw: ptRaw,
      qualitative_result: ptRaw,
    });
    processedKeys.add('pressure_tightness');
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

  // additional tests: 排除已被提取为致密性/水压核心检验项的项目，其余项统一规范化
  const additionalRecords = additionalList
    .filter((t: any) => t !== hydroAdditionalItem)
    .map((t: any) => {
      const rawVal = t.result ?? t.value_num;
      const rawStr = String(rawVal ?? '').trim();
      const numMatch = rawStr.match(/[-+]?[0-9]+(?:\.[0-9]+)?/);
      const parsedNum = typeof t.value_num === 'number' && !isNaN(t.value_num)
        ? t.value_num
        : (numMatch ? parseFloat(numMatch[0]) : undefined);

      const rawPropertyName = t.name || t.key || '';
      const norm = PropertyKeyNormalizer.normalize(
        rawPropertyName,
        t.category,
        { measuredRaw: rawVal, unit: t.unit }
      );

      const qual = QualitativeNormalizer.normalize(rawVal || t.conclusion);

      return {
        category: (norm.is_known ? norm.category : (t.category || 'process')) as any,
        property_key: norm.property_key,
        display_name: norm.is_known ? norm.display_name : (t.name || norm.display_name || norm.property_key),
        raw_property_name: rawPropertyName,
        measured_value_raw: t.result || String(t.value_num ?? ''),
        measured_value_num: parsedNum,
        unit: t.unit,
        qualitative_result: qual.qualitative_result,
        measured_level_claimed: qual.claimed_level,
      };
    });

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
