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
  property_key: z.string().describe('指标唯一键名 (如 C, Si, Mn, P, S, Cr, Ni, Mo, Ti, Rm, Rp0.2, A, hardness, flattening, flaring, intergranularCorrosion, grainSize, eddy_current)'),
  sub_property: z.string().optional().describe('子属性标尺/分项标号 (如 HRB, HBW, HV1, Rp0.2)'),
  sample_type: z.string().optional().describe('取样分析类型 (如 melt_analysis 熔炼分析, product_analysis 成品分析)'),
  sample_direction: z.string().optional().describe('试样截取方向 (如 longitudinal 纵向, transverse 横向)'),
  test_temperature_c: z.number().optional().describe('试验环境温度 (摄氏度 ℃，如 20, 350, -40)'),
  measured_value_num: z.number().nullable().optional().describe('结构化提取出的实测连续数值 (如 0.018, 621, 57.5)'),
  measured_value_raw: z.string().optional().describe('原始单据提取文本 (如 0.018%, 621 MPa, 合格, 139.3 HV1)'),
  unit: z.string().optional().describe('测得值单位 (如 %, MPa, J, HV, mm)'),
  test_method_standard: z.string().optional().describe('单项检验依据的方法标准 (如 GB/T 228.1, GB/T 4334, GB/T 7735)'),
  qualitative_result: z.string().optional().describe('定性试验结论 (如 PASS, FAIL, QUALIFIED, 合格, 无裂纹)'),
  measured_level_claimed: z.string().optional().describe('质保书声称的技术等级 (如 U2 超声二级, E3H 涡流等级, 7.0级 晶粒度)'),
  conclusion_text: z.string().optional().describe('检验结论或报告补充说明文本'),
});
export type TestRecord = z.infer<typeof TestRecordSchema>;


/* ==========================================================================
   四、质保书提取数据根模型 (Root Certificate Extract Model)
   - 校验经过 OCR / 结构化解析后输出的完整质保书数据对象（表头元数据 + 检验项列表）
   ========================================================================== */

// 校验整份质保书结构化解析结果的顶层根模型（供下游合规性核验引擎 ComplianceEngine 直接读取输入）
export const CertificateExtractSchema = z.object({
  $schema: z.string().optional(),
  header: CertificateHeaderSchema,
  test_records: z.array(TestRecordSchema),
});
export type CertificateExtract = z.infer<typeof CertificateExtractSchema>;