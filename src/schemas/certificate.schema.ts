import { z } from 'zod';
import { RuleCategorySchema } from './standard.schema';

/* ==========================================================================
   一、基础维度与实物量纲定义 (Basic Dimensions & Quantities)
   - 校验质保书/检验报告中提取的产品几何规格参数与交货批次数量计量
   ========================================================================== */

// 校验产品的实际几何规格尺寸（包含外径、壁厚、长度等，并通过 passthrough 允许扩展非标尺寸维度）
export const DimensionsSchema = z.object({
  outer_diameter_mm: z.number().optional().describe('公称外径 D（毫米，如 15.0）'),
  wall_thickness_mm: z.number().optional().describe('壁厚 S（毫米，如 0.8）'),
  length_mm: z.number().optional().describe('长度 L（毫米，如 6000）'),
  width_mm: z.number().optional().describe('宽度（板材/带材用，毫米）'),
  thickness_mm: z.number().optional().describe('厚度（板材/带材用，毫米）'),
  inner_diameter_mm: z.number().optional().describe('内径（毫米）'),
}).passthrough(); // 允许额外尺寸维度输入
export type Dimensions = z.infer<typeof DimensionsSchema>;

// 校验交货批次的实物计量与交付规模（支数/件数、总重量、总长度）
export const QuantitySchema = z.object({
  pieces: z.number().optional().describe('支数 / 件数（例如：120 支）'),
  weight_kg: z.number().optional().describe('批次重量（千克，例如：5400 kg）'),
  length_meters: z.number().optional().describe('批次总长度（米，例如：720 m）'),
});
export type Quantity = z.infer<typeof QuantitySchema>;


/* ==========================================================================
   二、质保书表头与追溯元数据 (Certificate Header & Traceability)
   - 校验质保书/材质单抬头信息、合同供需双方、声称执行标准、牌号及生产追溯标识
   ========================================================================== */

// 校验质保书表头核心追溯与交付状态信息（涵盖编号、标准、牌号、炉批号、工艺等关键核验上下文）
export const CertificateHeaderSchema = z.object({
  certificate_no: z.string().describe('质保书编号 / 材质单号 (如 20260102304, MTC-2024-05882)'),
  construction_number: z.string().optional().describe('施工号 / 工程项目编号 (如 26XXX-0888, PJ-2026-H01)'),
  supplier_name: z.string().optional().describe('生产供方 / 制造厂名称 (如 江苏武进不锈钢股份有限公司, 宝钢特钢)'),
  customer_name: z.string().optional().describe('订货需方 / 买方名称 (如 哈尔滨锅炉厂有限责任公司)'),
  issue_date: z.string().optional().describe('签发日期 (格式：YYYY-MM-DD，如 2024-03-15)'),
  material_product_name: z.string().optional().describe('产品品名 (如 锅炉、热交换器用不锈钢无缝钢管)'),
  declared_standard: z.string().describe('质保书声称执行标准 (如 GB/T 13296-2023, NB/T 47019.5-2021)'),
  declared_grade: z.string().describe('质保书声称材料牌号 (如 S32168, 06Cr18Ni11Ti, 022Cr17Ni12Mo2)'),
  heat_number: z.string().optional().describe('原材料冶炼炉号 Heat No. / Melt No. (如 YX2602-2207)'),
  heat_treatment_lot_number: z.string().optional().describe('钢管热处理炉号 / 装炉号 Pack No. (如 Z26022C)'),
  batch_lot_number: z.string().optional().describe('检验批号 / 试样编号 Batch No. (如 Z26022C-DB7)'),
  material_form: z.string().optional().describe('材料形态 (如 tube_seamless 无缝管, plate 钢板, bar 棒材)'),
  manufacturing_process: z.string().optional().describe('制造工艺 (如 cold_drawn 冷拔, hot_rolled 热轧, hot_extrusion 热挤压)'),
  delivery_state: z.string().optional().describe('交货状态 / 热处理状态 (如 固溶退火, 固溶酸洗, 光亮退火)'),
  dimensions: DimensionsSchema.optional().describe('实测/声称几何规格尺寸 (如 OD 15.0mm × WT 0.8mm × L 6000mm)'),
  quantity: QuantitySchema.optional().describe('交付批次数量与重量'),

  // 【通用结构化长尾扩展元数据池：一劳永逸兜底合同号、母卷号、TS特种设备许可证号、包装捆号等不在预设中的长尾元数据】
  additional_identifiers: z.array(z.object({
    key: z.string().describe('规范化英文标识（如 contract_no, bundle_no, ts_license_no）'),
    label: z.string().describe('质保书原始打印字面（如 订货合同号, 包装捆号, 制造许可证号）'),
    value: z.string().describe('提取值文本'),
    ocr_confidence: z.number().optional().describe('视觉识别置信度'),
  })).optional().describe('长尾附加标识池'),
}).passthrough();
export type CertificateHeader = z.infer<typeof CertificateHeaderSchema>;


/* ==========================================================================
   三、单项试验实测记录规范 (Individual Test Records)
   - 校验从质保书中提取的单条理化、力学、工艺、无损检测等具体实测数据项
   ========================================================================== */

// 校验单条具体检验项目的实测数据结构（涵盖指标键名、试样条件、解析数值、定性评级及结论说明）
export const TestRecordSchema = z.object({
  category: RuleCategorySchema.describe('检验技术类别 (chemical, mechanical, process, metallographic, corrosion, ndt, geometry)'),
  property_key: z.string().describe('指标唯一键名 (如 C, Si, Mn, P, S, Cr, Ni, Mo, Ti, Rm, Rp0.2, A, hardness, flattening, flaring, intergranularCorrosion, grainSize, ndt_et, ndt_ut)'),
  sub_property: z.string().optional().describe('子属性标尺/分项标号 (如 HRB, HBW, HV1, Rp0.2)'),
  sample_type: z.string().optional().describe('取样分析类型 (如 melt_analysis 熔炼分析, product_analysis 成品分析)'),
  sample_direction: z.string().optional().describe('试样截取方向 (如 longitudinal 纵向, transverse 横向)'),
  test_temperature_c: z.number().optional().describe('试验环境温度 (摄氏度 ℃，如 20, 350, -40)'),
  measured_value_num: z.number().nullable().optional().describe('结构化提取出的实测连续数值 (如 0.018, 621, 57.5)'),
  measured_value_raw: z.string().optional().describe('原始单据提取文本 (如 0.018%, 621 MPa, 合格, 139.3 HV1)'),
  unit: z.string().optional().describe('测得值单位 (如 %, MPa, J, HV, mm)'),
  test_method_standard: z.string().optional().describe('单项检验依据的方法标准 (如 GB/T 228.1, GB/T 4334, GB/T 7735, GB/T 5777)'),
  qualitative_result: z.string().optional().describe('定性试验结论 (如 PASS, FAIL, QUALIFIED, 合格, 无裂纹)'),
  measured_level_claimed: z.string().optional().describe('质保书声称的技术等级 (如 U2 超声二级, E3H 涡流等级, 7.0级 晶粒度)'),
  conclusion_text: z.string().optional().describe('检验结论或报告补充说明文本'),
});
export type TestRecord = z.infer<typeof TestRecordSchema>;


/* ==========================================================================
   四、试样级理化、工艺、解耦探伤与弹性扩展检验模型 (Batch Inspection Model)
   ========================================================================== */

// 弹性长尾扩展检验项通用模型（支持水压、渗透、磁粉、弯曲等任意未预设的检验项目）
export const AdditionalTestItemSchema = z.object({
  key: z.string().describe('指标唯一规范标识 (推荐遵循规范：ndt_pt, ndt_mt, proc_hydraulic, proc_bending, mech_impact, mech_high_temp_tensile)'),
  name: z.string().describe('检验项目字面名称 (如 渗透检测, 磁粉检测, 水压试验, 弯曲试验, 夏比冲击)'),
  category: RuleCategorySchema.describe('检验技术类别 (chemical, mechanical, process, metallographic, corrosion, ndt, geometry)'),
  standard: z.string().optional().describe('依据方法标准 (如 GB/T 12604.3, GB/T 232, GB/T 229, GB/T 241)'),
  result: z.string().describe('实测结果文本 (如 合格, 180°完好无裂纹, 45J, 20MPa保压10s合格)'),
  value_num: z.number().nullable().optional().describe('数值型连续实测值（若有）'),
  unit: z.string().optional().describe('测得值单位（若有）'),
  conclusion: z.string().optional().describe('定性结论 (如 PASS, FAIL, QUALIFIED)'),
});
export type AdditionalTestItem = z.infer<typeof AdditionalTestItemSchema>;

// 工艺、金相与解耦无损探伤项
export const BatchProcessSchema = z.object({
  flattening: z.string().optional().describe('压扁试验实测结果 (如 合格, 压至两壁间距符合规范)'),
  flaring: z.string().optional().describe('扩口试验实测结果 (如 合格, 顶心锥度符合规范无裂纹)'),
  intergranular_corrosion: z.string().optional().describe('晶间腐蚀试验结果 (如 合格（5.0%形变，方法E）)'),
  grain_size: z.string().optional().describe('晶粒度级别 (如 6.5 级, 7.0 级)'),
  ndt_et: z.string().optional().describe('涡流检测实测结果 (Eddy Current Testing，如 合格 OK)'),
  ndt_ut: z.string().optional().describe('超声波检测实测结果 (Ultrasonic Testing，如 合格 OK)'),
  ndt: z.string().optional().describe('综合探伤结论 (兼容历史单据单字段)'),
  surface_quality: z.string().optional().describe('表面质量外观检查结果 (如 表面光洁、无重皮划痕)'),
}).passthrough();
export type BatchProcess = z.infer<typeof BatchProcessSchema>;

// 力学性能检验项
export const BatchMechanicalSchema = z.object({
  tensile_rm: z.string().optional().describe('抗拉强度 Rm 实测值 (如 621、620 MPa)'),
  yield_rp02: z.string().optional().describe('规定塑性延伸强度 Rp0.2 实测值 (如 268、267 MPa)'),
  elongation_a: z.string().optional().describe('断后伸长率 A 实测值 (如 57.5、61.5 %)'),
  hardness: z.string().optional().describe('硬度实测值 (如 139.3 HV1)'),
  impact_akv: z.string().optional().describe('夏比冲击吸收能量 (J)'),
  ast_formula_note: z.string().optional().describe('AST 公式免检/替代说明 (如 涡流探伤与超声探伤双合格免做水压)'),
}).passthrough();
export type BatchMechanical = z.infer<typeof BatchMechanicalSchema>;

// 试样级结构化提取根模型
export const BatchInspectionSchema = z.object({
  batch_no: z.string().describe('试样批号/炉批号 (如 Z26022C-DB7)'),
  chemical: z.array(z.object({
    element: z.string().describe('化学元素符号 (如 C, Si, Mn, P, S, Cr, Ni, Ti, N, Mo)'),
    value: z.string().describe('实测含量文本 (如 0.018, <0.01)'),
    confidence: z.string().optional().describe('识别置信度 (如 99%)'),
  })).describe('化学成分检验列表'),
  mechanical: BatchMechanicalSchema.describe('力学性能检验项'),
  process: BatchProcessSchema.describe('工艺、金相与解耦无损检验项'),
  dimensions: z.string().optional().describe('规格尺寸实测 (如 OD 15.0mm × WT 0.8mm × L 6000mm)'),
  additional_tests: z.array(AdditionalTestItemSchema).optional().default([]).describe('弹性长尾检验项数组'),
}).passthrough();
export type BatchInspection = z.infer<typeof BatchInspectionSchema>;


/* ==========================================================================
   五、质保书提取数据根模型 (Root Certificate Extract Model)
   ========================================================================== */

// 校验整份质保书结构化解析结果的顶层根模型（供下游合规性核验引擎 ComplianceEngine 直接读取输入）
export const CertificateExtractSchema = z.object({
  $schema: z.string().optional(),
  header: CertificateHeaderSchema,
  test_records: z.array(TestRecordSchema),
  batches: z.array(BatchInspectionSchema).optional(),
});
export type CertificateExtract = z.infer<typeof CertificateExtractSchema>;


/* ==========================================================================
   六、Schema 驱动的运行时元数据反射与内存缓存引擎 (Reflection Engine)
   ========================================================================== */

export interface InspectionFieldDefinition {
  key: string;
  fieldId: string;
  methodFieldId?: string;
  label: string;
  category: 'chemical' | 'mechanical' | 'process' | 'metallographic' | 'corrosion' | 'ndt' | 'geometry';
  categoryLabel: string;
  categoryColor?: string;
  defaultMethod?: string;
}

// 常用长尾项推荐规范（用于约束大模型输出，杜绝 key 碎片化）
export const RECOMMENDED_ADDITIONAL_TEST_CONVENTIONS = [
  { key: 'proc_hydraulic', name: '水压试验', category: 'process', standard: 'GB/T 241' },
  { key: 'ndt_pt', name: '渗透检测', category: 'ndt', standard: 'GB/T 12604.3' },
  { key: 'ndt_mt', name: '磁粉检测', category: 'ndt', standard: 'JB/T 4730.4' },
  { key: 'proc_bending', name: '弯曲试验', category: 'process', standard: 'GB/T 232' },
  { key: 'mech_impact', name: '夏比冲击试验', category: 'mechanical', standard: 'GB/T 229' },
  { key: 'mech_high_temp_tensile', name: '高温拉伸试验', category: 'mechanical', standard: 'GB/T 228.2' },
] as const;

export const META_FIELD_ID_MAP: Record<string, string> = {
  certificate_no: 'meta_certificateNo',
  declared_standard: 'meta_standard',
  declared_grade: 'meta_grade',
  supplier_name: 'meta_supplier',
  construction_number: 'meta_constructionNo',
  material_product_name: 'meta_productName',
  heat_number: 'meta_heatNo',
  heat_treatment_lot_number: 'meta_packNo',
  batch_lot_number: 'meta_batchNo',
  delivery_state: 'meta_deliveryState',
  dimensions: 'meta_dimensions',
};

export const STANDARD_CHEMICAL_ELEMENTS = [
  'C', 'Si', 'Mn', 'P', 'S', 'Ni', 'Cr', 'Mo', 'Ti', 'Cu', 'V', 'N', 'Al', 'Nb', 'W', 'B', 'Fe'
];

// 内存缓存单例变量 (In-Memory Memoization Cache)
let _cachedFieldDefinitions: InspectionFieldDefinition[] | null = null;
let _cachedBBoxWhitelist: string[] | null = null;
let _cachedStructureTemplate: string | null = null;

/**
 * 运行时反射获取所有结构化检验项定义（带内存缓存）
 */
export function getCertificateInspectionFieldDefinitions(): InspectionFieldDefinition[] {
  if (_cachedFieldDefinitions) {
    return _cachedFieldDefinitions;
  }

  const defs: InspectionFieldDefinition[] = [
    // 力学性能项
    {
      key: 'tensile_rm',
      fieldId: 'mech_tensile',
      methodFieldId: 'method_tensile',
      label: '抗拉强度 Rm (Tensile Strength)',
      category: 'mechanical',
      categoryLabel: '力学',
      categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      defaultMethod: 'GB/T 228.1-2021',
    },
    {
      key: 'yield_rp02',
      fieldId: 'mech_yield',
      methodFieldId: 'method_tensile',
      label: '规定塑性延伸强度 Rp0.2 (Yield Strength)',
      category: 'mechanical',
      categoryLabel: '力学',
      categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      defaultMethod: 'GB/T 228.1-2021',
    },
    {
      key: 'elongation_a',
      fieldId: 'mech_elongation',
      methodFieldId: 'method_tensile',
      label: '断后伸长率 A (Elongation)',
      category: 'mechanical',
      categoryLabel: '力学',
      categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      defaultMethod: 'GB/T 228.1-2021',
    },
    {
      key: 'hardness',
      fieldId: 'mech_hardness',
      methodFieldId: 'method_hardness',
      label: '硬度检验 (Hardness HV/HBW)',
      category: 'mechanical',
      categoryLabel: '力学',
      categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      defaultMethod: 'GB/T 4340.1-2024',
    },
    // 工艺与金相项
    {
      key: 'flattening',
      fieldId: 'proc_flattening',
      methodFieldId: 'method_proc_flattening',
      label: '压扁试验 (Flattening Test)',
      category: 'process',
      categoryLabel: '工艺',
      categoryColor: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
      defaultMethod: 'GB/T 246-2017',
    },
    {
      key: 'flaring',
      fieldId: 'proc_flaring',
      methodFieldId: 'method_proc_flaring',
      label: '扩口试验 (Flaring Test)',
      category: 'process',
      categoryLabel: '工艺',
      categoryColor: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
      defaultMethod: 'GB/T 242-2007',
    },
    {
      key: 'grain_size',
      fieldId: 'metallo_grain',
      methodFieldId: 'method_grain',
      label: '晶粒度评级 (Grain Size)',
      category: 'metallographic',
      categoryLabel: '金相',
      categoryColor: 'text-cyan-700 bg-cyan-50 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
      defaultMethod: 'GB/T 6394-2017',
    },
    {
      key: 'intergranular_corrosion',
      fieldId: 'corrosion_intergranular',
      methodFieldId: 'method_corrosion_intergranular',
      label: '晶间腐蚀试验 (Intergranular Corrosion)',
      category: 'corrosion',
      categoryLabel: '腐蚀',
      categoryColor: 'text-amber-700 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      defaultMethod: 'GB/T 4334-2020',
    },
    // 无损探伤 (解耦为 ET 与 UT)
    {
      key: 'ndt_et',
      fieldId: 'ndt_et',
      methodFieldId: 'method_ndt_et',
      label: '涡流探伤检验 (Eddy Current Test)',
      category: 'ndt',
      categoryLabel: '探伤',
      categoryColor: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
      defaultMethod: 'GB/T 7735-2016',
    },
    {
      key: 'ndt_ut',
      fieldId: 'ndt_ut',
      methodFieldId: 'method_ndt_ut',
      label: '超声波探伤检验 (Ultrasonic Test)',
      category: 'ndt',
      categoryLabel: '探伤',
      categoryColor: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
      defaultMethod: 'GB/T 5777-2019',
    },
    // 表面质量与几何尺寸
    {
      key: 'surface_quality',
      fieldId: 'geo_surface_quality',
      methodFieldId: 'method_surface_quality',
      label: '表面质量 (Surface Quality)',
      category: 'process',
      categoryLabel: '表面',
      categoryColor: 'text-teal-700 bg-teal-50 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800',
      defaultMethod: 'GB/T 13296-2023',
    },
    {
      key: 'dimensions',
      fieldId: 'geo_dimensions',
      methodFieldId: 'method_geo_dimensions',
      label: '几何尺寸规格 (Dimensions)',
      category: 'geometry',
      categoryLabel: '尺寸',
      categoryColor: 'text-teal-700 bg-teal-50 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800',
      defaultMethod: 'GB/T 13296-2023',
    },
  ];

  _cachedFieldDefinitions = defs;
  return defs;
}

/**
 * 运行时从 Schema 动态反射聚合出所有合法的 BBox 字段 ID 白名单闭集（带内存缓存）
 */
export function getValidBBoxIdWhitelist(): string[] {
  if (_cachedBBoxWhitelist) {
    return _cachedBBoxWhitelist;
  }

  const whitelist = new Set<string>();

  // 1. 从 CertificateHeaderSchema 反射元数据 ID
  const headerKeys = Object.keys(CertificateHeaderSchema.shape);
  for (const key of headerKeys) {
    if (META_FIELD_ID_MAP[key]) {
      whitelist.add(META_FIELD_ID_MAP[key]);
    }
  }

  // 2. 添加化学成分元素 ID
  for (const elem of STANDARD_CHEMICAL_ELEMENTS) {
    whitelist.add(`chem_${elem}`);
  }

  // 3. 从检验项反射定义添加理化、工艺与探伤 ID 及依据方法 ID
  const defs = getCertificateInspectionFieldDefinitions();
  for (const def of defs) {
    if (def.fieldId) whitelist.add(def.fieldId);
    if (def.methodFieldId) whitelist.add(def.methodFieldId);
  }

  // 4. 注入长尾常用扩展 BBox ID
  whitelist.add('ndt_pt');
  whitelist.add('method_ndt_pt');
  whitelist.add('ndt_mt');
  whitelist.add('method_ndt_mt');
  whitelist.add('proc_hydraulic');
  whitelist.add('method_proc_hydraulic');
  whitelist.add('proc_bending');
  whitelist.add('method_proc_bending');
  whitelist.add('meta_inventoryQuantity');

  _cachedBBoxWhitelist = Array.from(whitelist);
  return _cachedBBoxWhitelist;
}

/**
 * 基于 Schema 原生反射构建紧凑且带注释的结构化抽取 JSON 模板（带内存缓存与长尾规范指引）
 */
export function buildDynamicSchemaStructureTemplate(): string {
  if (_cachedStructureTemplate) {
    return _cachedStructureTemplate;
  }

  const template = `{
  "header": {
    "certificateNo": "质保书编号 / 材质单号",
    "productName": "产品品名 (如 锅炉、热交换器用不锈钢无缝钢管)",
    "declaredStandard": "执行标准 (如 GB/T 13296-2023, NB/T 47019.5-2021)",
    "declaredGrade": "材料牌号 (如 S32168, 06Cr18Ni11Ti, 022Cr17Ni12Mo2)",
    "supplierName": "供货/制造厂家名称",
    "constructionNo": "施工号/项目号",
    "heatNo": "冶炼炉号 (Heat No.)",
    "packNo": "热处理装炉号 (Pack No.)",
    "deliveryState": "交货状态 (如 固溶退火, 光亮退火)",
    "dimensions": "规格尺寸 (如 OD 15.0mm × WT 0.8mm × L 6000mm)"
  },
  "batches": [
    {
      "batchNo": "试样批号/炉批号 (如 Z26022C-DB7)",
      "chemical": [
        { "element": "C", "value": "0.018", "confidence": "99%" },
        { "element": "Si", "value": "0.44", "confidence": "98%" },
        { "element": "Mn", "value": "1.16", "confidence": "99%" },
        { "element": "P", "value": "0.035", "confidence": "97%" },
        { "element": "S", "value": "0.005", "confidence": "98%" },
        { "element": "Cr", "value": "17.41", "confidence": "99%" },
        { "element": "Ni", "value": "9.08", "confidence": "98%" },
        { "element": "Ti", "value": "0.14", "confidence": "95%" }
      ],
      "mechanical": {
        "tensile_rm": "抗拉强度实测值 (如 621 MPa)",
        "yield_rp02": "规定塑性延伸强度 Rp0.2 实测值 (如 268 MPa)",
        "elongation_a": "断后伸长率实测值 (如 57.5 %)",
        "hardness": "硬度实测值 (如 139.3 HV1)"
      },
      "process": {
        "flattening": "压扁试验结果 (如 合格)",
        "flaring": "扩口试验结果 (如 合格)",
        "intergranularCorrosion": "晶间腐蚀试验结果 (如 合格（5.0%形变，方法E）)",
        "grainSize": "晶粒度 (如 7.0 级)",
        "ndt_et": "涡流检测实测结果 (若有，必须独立提取至此，如 合格 OK)",
        "ndt_ut": "超声波检测实测结果 (若有，必须独立提取至此，如 合格 OK)"
      },
      "dimensions": "规格尺寸 (如 OD 15.0mm × WT 0.8mm × L 6000mm)",
      "additional_tests": [
        {
          "key": "推荐规范标识: proc_hydraulic (水压), ndt_pt (渗透), ndt_mt (磁粉), proc_bending (弯曲), mech_impact (冲击)",
          "name": "试验项目中文全称 (如 渗透检测, 水压试验)",
          "category": "类别: ndt / process / mechanical / metallographic / corrosion",
          "standard": "依据的方法标准 (如 GB/T 12604.3, GB/T 241)",
          "result": "实测检验结论 (如 合格, 20MPa稳压合格)"
        }
      ]
    }
  ]
}`.trim();

  _cachedStructureTemplate = template;
  return template;
}