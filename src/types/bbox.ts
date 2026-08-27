/**
 * 字段与源文档视觉 OCR 标注框 (BBox) 映射规范
 * 坐标系采用百分比 (0 ~ 100)，以适配不同视窗宽度与缩放级别
 */

export interface FieldBBox {
  id: string;          // 关联字段唯一标识，如 "meta_certificateNo", "chem_C", "mech_tensile"
  page: number;        // 所在页码 (1-indexed, 如 1, 2, 3)
  x: number;           // 左上角 X 百分比 (0 ~ 100)
  y: number;           // 左上角 Y 百分比 (0 ~ 100)
  w: number;           // 宽度百分比
  h: number;           // 高度百分比
  label: string;       // 悬浮标签提示
  category?: 'meta' | 'chemical' | 'mechanical' | 'process' | 'corrosion' | 'ndt' | 'metallographic';
}

/**
 * 镇海石化建安《质保书.pdf》(ZPJE S32168) 全量 BBox 映射字典
 * 针对 3 个不同批次在 Page 2 / Page 3 的差异化行坐标提供精确映射
 */
export function getZPJEBBoxes(batchNo: string): FieldBBox[] {
  // Page 2 对应的拉伸试验与硬度/晶粒度行垂直偏移 (第一版成熟坐标基准)
  // Z26022C-DB7 -> index 0 (y: 22.8%)
  // Z26022C-DB8 -> index 1 (y: 24.8%)
  // Z26022C-E1  -> index 2 (y: 26.8%)
  let tensileRowY = 22.8;
  let hardnessRowY = 38.6;
  let inventoryRowY = 29.0;

  if (batchNo.includes('DB8')) {
    tensileRowY = 24.8;
    hardnessRowY = 40.6;
    inventoryRowY = 31.0;
  } else if (batchNo.includes('E1')) {
    tensileRowY = 26.8;
    hardnessRowY = 42.6;
    inventoryRowY = 33.0;
  }

  return [
    // ==========================================
    // Page 1: 头部基础元数据与公用试验
    // ==========================================
    {
      id: 'meta_certificateNo',
      page: 1,
      x: 74.0,
      y: 13.5,
      w: 16.0,
      h: 2.2,
      label: '质保书编号 No. 20260704203',
      category: 'meta',
    },
    {
      id: 'meta_customer',
      page: 1,
      x: 10.0,
      y: 16.5,
      w: 38.0,
      h: 3.5,
      label: '客户名称: 镇海石化建安工程股份有限公司物资供应部',
      category: 'meta',
    },
    {
      id: 'meta_productName',
      page: 1,
      x: 48.0,
      y: 16.5,
      w: 30.0,
      h: 3.5,
      label: '产品名称: 换热管',
      category: 'meta',
    },
    {
      id: 'meta_grade',
      page: 1,
      x: 10.0,
      y: 22.0,
      w: 12.0,
      h: 3.5,
      label: '材质 Material: S32168',
      category: 'meta',
    },
    {
      id: 'meta_deliveryState',
      page: 1,
      x: 22.0,
      y: 22.0,
      w: 13.0,
      h: 3.5,
      label: '交货状态 Condition: 光亮固溶',
      category: 'meta',
    },
    {
      id: 'meta_standard',
      page: 1,
      x: 35.0,
      y: 22.0,
      w: 38.0,
      h: 3.5,
      label: '执行标准 Standards: NB/T47019.5-2021、GB/T13296-2023',
      category: 'meta',
    },
    {
      id: 'meta_heatNo',
      page: 1,
      x: 28.0,
      y: 29.5,
      w: 12.0,
      h: 2.5,
      label: '原材料炉号 Heat No.: YX2602-2207',
      category: 'meta',
    },
    {
      id: 'meta_packNo',
      page: 1,
      x: 64.0,
      y: 29.5,
      w: 10.0,
      h: 2.5,
      label: '钢管热处理炉号 Pack No.: Z26022C',
      category: 'meta',
    },
    {
      id: 'meta_supplier',
      page: 1,
      x: 28.0,
      y: 91.5,
      w: 44.0,
      h: 2.5,
      label: '供货厂家: 镇海石化建安工程股份有限公司制管厂',
      category: 'meta',
    },

    // ==========================================
    // Page 1: 化学成分实测值 (Chemical Matrix)
    // ==========================================
    {
      id: 'chem_C',
      page: 1,
      x: 22.8,
      y: 39.5,
      w: 6.2,
      h: 2.4,
      label: 'C: 0.018 wt%',
      category: 'chemical',
    },
    {
      id: 'chem_Si',
      page: 1,
      x: 29.3,
      y: 39.5,
      w: 6.2,
      h: 2.4,
      label: 'Si: 0.44 wt%',
      category: 'chemical',
    },
    {
      id: 'chem_Mn',
      page: 1,
      x: 35.8,
      y: 39.5,
      w: 6.2,
      h: 2.4,
      label: 'Mn: 1.16 wt%',
      category: 'chemical',
    },
    {
      id: 'chem_P',
      page: 1,
      x: 42.3,
      y: 39.5,
      w: 6.2,
      h: 2.4,
      label: 'P: 0.035 wt%',
      category: 'chemical',
    },
    {
      id: 'chem_S',
      page: 1,
      x: 48.8,
      y: 39.5,
      w: 6.2,
      h: 2.4,
      label: 'S: 0.005 wt%',
      category: 'chemical',
    },
    {
      id: 'chem_Cr',
      page: 1,
      x: 55.3,
      y: 39.5,
      w: 6.2,
      h: 2.4,
      label: 'Cr: 17.41 wt%',
      category: 'chemical',
    },
    {
      id: 'chem_Ni',
      page: 1,
      x: 61.8,
      y: 39.5,
      w: 6.2,
      h: 2.4,
      label: 'Ni: 9.08 wt%',
      category: 'chemical',
    },
    {
      id: 'chem_Ti',
      page: 1,
      x: 68.3,
      y: 39.5,
      w: 6.2,
      h: 2.4,
      label: 'Ti: 0.14 wt%',
      category: 'chemical',
    },
    {
      id: 'chem_N',
      page: 1,
      x: 81.3,
      y: 39.5,
      w: 7.2,
      h: 2.4,
      label: 'N: <0.01 wt%',
      category: 'chemical',
    },

    // ==========================================
    // Page 1: 工艺、耐腐蚀与无损探伤条款 (Col 2 执行标准与 Col 3 试验结果拆分独立溯源)
    // ==========================================
    // 1. 扩口试验
    {
      id: 'method_proc_flaring',
      page: 1,
      x: 30.2,
      y: 47.8,
      w: 28.5,
      h: 2.4,
      label: '扩口试验标准: GB/T 242-2007',
      category: 'process',
    },
    {
      id: 'proc_flaring',
      page: 1,
      x: 60.0,
      y: 47.8,
      w: 28.5,
      h: 2.4,
      label: '扩口试验结果: 合格 OK',
      category: 'process',
    },
    // 2. 压扁试验
    {
      id: 'method_proc_flattening',
      page: 1,
      x: 30.2,
      y: 50.4,
      w: 28.5,
      h: 2.4,
      label: '压扁试验标准: GB/T 246-2017',
      category: 'process',
    },
    {
      id: 'proc_flattening',
      page: 1,
      x: 60.0,
      y: 50.4,
      w: 28.5,
      h: 2.4,
      label: '压扁试验结果: 合格 OK',
      category: 'process',
    },
    // 3. 涡流检测
    {
      id: 'method_ndt_et',
      page: 1,
      x: 30.2,
      y: 53.0,
      w: 28.5,
      h: 2.4,
      label: '涡流检测标准: GB/T 7735-2016',
      category: 'ndt',
    },
    {
      id: 'ndt_et',
      page: 1,
      x: 60.0,
      y: 53.0,
      w: 28.5,
      h: 2.4,
      label: '涡流检测结果: 合格 OK',
      category: 'ndt',
    },
    // 4. 超声波检测
    {
      id: 'method_ndt_ut',
      page: 1,
      x: 30.2,
      y: 55.6,
      w: 28.5,
      h: 2.4,
      label: '超声波检测标准: GB/T 5777-2019',
      category: 'ndt',
    },
    {
      id: 'ndt_ut',
      page: 1,
      x: 60.0,
      y: 55.6,
      w: 28.5,
      h: 2.4,
      label: '超声波检测结果: 合格 OK',
      category: 'ndt',
    },
    // 5. 晶间腐蚀试验
    {
      id: 'method_corrosion_intergranular',
      page: 1,
      x: 30.2,
      y: 58.2,
      w: 28.5,
      h: 3.0,
      label: '晶间腐蚀标准: GB/T 4334-2020 方法 E',
      category: 'corrosion',
    },
    {
      id: 'corrosion_intergranular',
      page: 1,
      x: 60.0,
      y: 58.2,
      w: 28.5,
      h: 3.0,
      label: '晶间腐蚀结果 (5.0%形变): 合格 OK',
      category: 'corrosion',
    },
    // 6. 尺寸检验
    {
      id: 'method_geo_dimensions',
      page: 1,
      x: 30.2,
      y: 61.4,
      w: 28.5,
      h: 2.4,
      label: '尺寸检验标准: GB/T 13296-2023',
      category: 'process',
    },
    {
      id: 'geo_dimensions',
      page: 1,
      x: 60.0,
      y: 61.4,
      w: 28.5,
      h: 2.4,
      label: '尺寸检验结果: 合格 OK',
      category: 'process',
    },
    // 7. 表面质量
    {
      id: 'method_surface_quality',
      page: 1,
      x: 30.2,
      y: 64.0,
      w: 28.5,
      h: 2.4,
      label: '表面质量标准: GB/T 13296-2023',
      category: 'process',
    },
    {
      id: 'surface_quality',
      page: 1,
      x: 60.0,
      y: 64.0,
      w: 28.5,
      h: 2.4,
      label: '表面质量结果: 合格 OK',
      category: 'process',
    },

    // ==========================================
    // Page 2: 室温拉伸、硬度与晶粒度实测与方法标准表头
    // ==========================================
    // 拉伸方法标准表头
    {
      id: 'method_tensile',
      page: 2,
      x: 28.0,
      y: 16.5,
      w: 42.0,
      h: 1.8,
      label: '拉伸试验执行标准: GB/T 228.1-2021',
      category: 'mechanical',
    },
    {
      id: 'meta_batchNo',
      page: 2,
      x: 10.5,
      y: tensileRowY,
      w: 17.5,
      h: 2.0,
      label: `钢管批号 Lot No.: ${batchNo}`,
      category: 'meta',
    },
    {
      id: 'mech_yield',
      page: 2,
      x: 28.0,
      y: tensileRowY,
      w: 20.0,
      h: 2.0,
      label: '屈服强度 Y.S. Rp0.2',
      category: 'mechanical',
    },
    {
      id: 'mech_tensile',
      page: 2,
      x: 48.0,
      y: tensileRowY,
      w: 20.0,
      h: 2.0,
      label: '抗拉强度 T.S. Rm',
      category: 'mechanical',
    },
    {
      id: 'mech_elongation',
      page: 2,
      x: 68.8,
      y: tensileRowY,
      w: 19.8,
      h: 2.0,
      label: '延伸率 EL. A%',
      category: 'mechanical',
    },
    // 硬度与晶粒度方法标准表头 (y: 32.2%)
    {
      id: 'method_hardness',
      page: 2,
      x: 30.0,
      y: 32.2,
      w: 29.5,
      h: 2.2,
      label: '硬度试验标准: GB/T 4340.1-2024',
      category: 'mechanical',
    },
    {
      id: 'method_grain',
      page: 2,
      x: 60.0,
      y: 32.2,
      w: 28.5,
      h: 2.2,
      label: '晶粒度测定标准: GB/T 6394-2017',
      category: 'metallographic',
    },
    // 硬度与晶粒度实测行
    {
      id: 'mech_hardness',
      page: 2,
      x: 30.0,
      y: hardnessRowY,
      w: 29.5,
      h: 2.0,
      label: '硬度 Hardness (HV1) 实测值',
      category: 'mechanical',
    },
    {
      id: 'metallo_grain',
      page: 2,
      x: 60.0,
      y: hardnessRowY,
      w: 28.5,
      h: 2.0,
      label: '晶粒度 Grain size 级实测值',
      category: 'metallographic',
    },

    // ==========================================
    // Page 3: 产品清单与施工号
    // ==========================================
    {
      id: 'meta_constructionNo',
      page: 3,
      x: 11.5,
      y: 19.5,
      w: 32.0,
      h: 2.2,
      label: '施工号: 26715-7053',
      category: 'meta',
    },
    {
      id: 'meta_dimensions',
      page: 3,
      x: 41.5,
      y: inventoryRowY,
      w: 16.0,
      h: 2.0,
      label: '交货规格: 15 × 0.8 mm',
      category: 'meta',
    },
    {
      id: 'meta_inventoryQuantity',
      page: 3,
      x: 57.5,
      y: inventoryRowY,
      w: 32.0,
      h: 2.0,
      label: '支数与重量清单',
      category: 'meta',
    },
  ];
}
