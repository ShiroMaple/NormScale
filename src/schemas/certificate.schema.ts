import { z } from 'zod';
import { RuleCategorySchema } from './standard.schema';

/* ==========================================================================
   一、基础维度与实物量纲定义 (Basic Dimensions & Quantities)
   - 校验质保书/检验报告中提取的产品几何规格参数与交货批次数量计量
   ========================================================================== */

// 校验产品的实际几何规格尺寸（包含外径、壁厚、长度等，并通过 passthrough 允许扩展非标尺寸维度）
export const DimensionsSchema = z.object({
  outer_diameter_mm: z.number().optional(), // 公称外径 D（毫米）
  wall_thickness_mm: z.number().optional(), // 壁厚 S（毫米）
  length_mm: z.number().optional(),         // 长度 L（毫米）
  width_mm: z.number().optional(),          // 宽度（板材/带材用，毫米）
  thickness_mm: z.number().optional(),      // 厚度（板材/带材用，毫米）
  inner_diameter_mm: z.number().optional(), // 内径（毫米）
}).passthrough(); // 允许额外尺寸维度输入
export type Dimensions = z.infer<typeof DimensionsSchema>;

// 校验交货批次的实物计量与交付规模（支数/件数、总重量、总长度）
export const QuantitySchema = z.object({
  pieces: z.number().optional(),        // 支数 / 件数（例如：120 支）
  weight_kg: z.number().optional(),     // 批次重量（千克，例如：5400 kg）
  length_meters: z.number().optional(), // 批次总长度（米，例如：720 m）
});
export type Quantity = z.infer<typeof QuantitySchema>;


/* ==========================================================================
   二、质保书表头与追溯元数据 (Certificate Header & Traceability)
   - 校验质保书/材质单抬头信息、合同供需双方、声称执行标准、牌号及生产追溯标识
   ========================================================================== */

// 校验质保书表头核心追溯与交付状态信息（涵盖编号、标准、牌号、炉批号、工艺等关键核验上下文）
export const CertificateHeaderSchema = z.object({
  certificate_no: z.string(),                               // 质保书编号 / 材质单号（例如："MTC-2024-05882"）
  supplier_name: z.string().optional(),                     // 生产供方/制造厂名称（例如："宝钢特钢有限公司"）
  customer_name: z.string().optional(),                     // 订货需方/买方名称（例如："哈尔滨锅炉厂有限责任公司"）
  issue_date: z.string().optional(),                        // 签发日期（格式：YYYY-MM-DD，例如："2024-03-15"）
  material_product_name: z.string().optional(),             // 产品品名（例如："锅炉、热交换器用不锈钢无缝钢管"）
  declared_standard: z.string(),                            // 质保书声称执行标准（例如："GB/T 13296-2023"）
  declared_grade: z.string(),                               // 质保书声称材料牌号（例如："06Cr19Ni10" 或 "S30408"）
  heat_number: z.string().optional(),                       // 冶炼炉号（Heat No.，例如："H240188"）
  batch_lot_number: z.string().optional(),                  // 检验批号 / 热处理批号（Batch / Lot No.，例如："L202403-01"）
  material_form: z.string().optional(),                     // 材料形态（例如："tube_seamless" 无缝管、"plate" 钢板、"bar" 棒材）
  manufacturing_process: z.string().optional(),             // 制造工艺（例如："cold_drawn" 冷拔、"hot_rolled" 热轧、"hot_extrusion" 热挤压）
  delivery_state: z.string().optional(),                    // 交货状态（例如："固溶酸洗"、"光亮退火"、"淬火+回火"）
  dimensions: DimensionsSchema.optional(),                  // 实测/声称几何规格尺寸
  quantity: QuantitySchema.optional(),                      // 交付批次数量与重量
});
export type CertificateHeader = z.infer<typeof CertificateHeaderSchema>;


/* ==========================================================================
   三、单项试验实测记录规范 (Individual Test Records)
   - 校验从质保书中提取的单条理化、力学、工艺、无损检测等具体实测数据项
   ========================================================================== */

// 校验单条具体检验项目的实测数据结构（涵盖指标键名、试样条件、解析数值、定性评级及结论说明）
export const TestRecordSchema = z.object({
  category: RuleCategorySchema,                             // 检验技术类别（例如：化学成分 chemical、力学性能 mechanical、无损检测 ndt 等）
  property_key: z.string(),                                 // 指标唯一键名（例如："C" 碳含量、"Rm" 抗拉强度、"hardness" 硬度、"ultrasonic_test" 超声检测）
  sub_property: z.string().optional(),                      // 子属性标尺/分项标号（例如："HRB" 洛氏硬度、"HBW" 布氏硬度、"Rp0.2" 规定塑性延伸强度）
  sample_type: z.string().optional(),                       // 取样分析类型（例如："melt_analysis" 熔炼分析、"product_analysis" 成品复验分析）
  sample_direction: z.string().optional(),                  // 试样截取方向（例如："longitudinal" 纵向取样、"transverse" 横向取样）
  test_temperature_c: z.number().optional(),                // 试验环境温度（摄氏度 ℃，例如：常温 20℃、高温拉伸 350℃、低温冲击 -40℃）
  measured_value_num: z.number().nullable().optional(),     // 结构化提取出的实测连续数值（例如：0.042、565、88.5）
  measured_value_raw: z.string().optional(),                // 原始单据提取文本（例如："0.042%"、"565 MPa"、"合格"、"88.5 HRB"）
  unit: z.string().optional(),                              // 测得值单位（例如："%"、"MPa"、"J"、"HRB"）
  test_method_standard: z.string().optional(),              // 单项检验依据的方法标准（例如："GB/T 228.1" 金属拉伸试验、"GB/T 4334" 不锈钢晶间腐蚀）
  qualitative_result: z.string().optional(),                // 定性试验结论（例如："PASS"、"FAIL"、"QUALIFIED"、"合格"、"无裂纹"）
  measured_level_claimed: z.string().optional(),            // 质保书声称的技术等级（例如："U2" 超声二级、"E3H" 涡流等级、"5级" 金相晶粒度）
  conclusion_text: z.string().optional(),                   // 检验结论或报告补充说明文本
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