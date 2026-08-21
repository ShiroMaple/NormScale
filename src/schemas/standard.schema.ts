import { z } from 'zod';

/* ==========================================================================
   一、基础枚举与通用维度定义 (Basic Enums & Dimensions)
   - 校验规则的执行等级、检验类别分类以及触发判定的前置维度条件
   ========================================================================== */

// 校验规则的执行要求级别（如：必须做、条件满足时做、供需协议选做、豁免免做）
export const RequirementLevelSchema = z.enum([
  'MANDATORY',       // 强制项 (必须检验且达标)
  'CONDITIONAL',     // 条件触发项 (满足前置尺寸/工艺条件时强制)
  'OPTIONAL_AGREED', // 协议/选做项 (供需协商，并在合同中注明)
  'EXEMPT',          // 免做项 (标准明确豁免)
]);
export type RequirementLevel = z.infer<typeof RequirementLevelSchema>;

// 校验检验项目的技术类别（用于质检项归类、报告分组与指标归纳）
export const RuleCategorySchema = z.enum([
  'chemical',        // 化学成分 (C, Si, Mn, P, S, Ni, Cr 等元素含量)
  'mechanical',      // 力学性能 (抗拉强度、屈服强度、断后伸长率、冲击吸收能量、硬度等)
  'process',         // 工艺性能 (压扁试验、扩口试验、弯曲试验、卷边试验等)
  'metallographic',  // 金相组织与晶粒度 (奥氏体晶粒度、铁素体含量、夹杂物等)
  'corrosion',       // 耐腐蚀试验 (晶间腐蚀、点腐蚀、应力腐蚀等)
  'ndt',             // 无损检测 (超声波探伤、涡流探伤、水压试验、射线探伤等)
  'geometric',       // 几何尺寸与公差 (外径、壁厚、长度、弯曲度、不圆度等)
  'surface',         // 表面质量与交货状态 (酸洗钝化、光亮退火、表面缺陷深度限制等)
  'other',           // 其他综合要求 (包装标志、质量证明书要求等)
]);
export type RuleCategory = z.infer<typeof RuleCategorySchema>;

// 校验单项尺寸判断条件（用于规则触发的前置几何判定，如：外径 > 50mm）
export const DimensionConditionSchema = z.object({
  field: z.string(), // 例如："dimensions.wall_thickness_mm"（壁厚）或 "dimensions.outer_diameter_mm"（外径）
  operator: z.enum(['<=', '<', '>=', '>', '==', '!=']),
  value: z.union([z.number(), z.string()]),
});
export type DimensionCondition = z.infer<typeof DimensionConditionSchema>;

// 校验标准的适用范围与边界（校验材料形态、制造工艺、交货状态与尺寸限制）
export const ApplicabilityScopeSchema = z.object({
  material_form: z.array(z.string()).optional(),            // 例如：["tube_seamless"] (无缝管)
  manufacturing_process: z.array(z.string()).optional(),    // 例如：["cold_drawn", "hot_rolled", "hot_extrusion"] (冷拔、热轧、热挤压)
  delivery_state: z.array(z.string()).optional(),           // 例如：["solution_annealed", "pickled"] (固溶退火、酸洗)
  dimension_conditions: z.array(DimensionConditionSchema).optional(),
});
export type ApplicabilityScope = z.infer<typeof ApplicabilityScopeSchema>;

// 校验指标修正/浮动补偿规则（根据特定制造工艺或交货状态动态微调上下限指标）
export const ConditionAdjustmentSchema = z.object({
  when: z.string(),                   // JS 条件表达式，例如："ctx.header.manufacturing_process == 'hot_extrusion'"（当工艺为热挤压时）
  min_offset: z.number().optional(),  // 下限指标修正偏移量，例如：-20 (抗拉强度要求降低 20MPa)
  max_offset: z.number().optional(),
  note: z.string().optional(),
});
export type ConditionAdjustment = z.infer<typeof ConditionAdjustmentSchema>;


/* ==========================================================================
   二、多模式检验准则规范 (Specific Inspection Criteria)
   - 校验不同类型检测项目（数值、公式、定性、复合试验）的具体判定参数
   ========================================================================== */

// 1. 校验定量数值区间规则（用于化学成分含量上限/下限、常规力学强度数值范围及数据修约）
export const NumericRangeCriteriaSchema = z.object({
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  unit: z.string().optional(),
  rounding_decimals: z.number().int().min(0).max(8).optional(), // 修约保留小数位数 (符合 GB/T 8170 规则)
  min_inclusive: z.boolean().default(true),                     // 默认包含下限 (>= min)
  max_inclusive: z.boolean().default(true),                     // 默认包含上限 (<= max)
  condition_adjustments: z.array(ConditionAdjustmentSchema).optional(),
});
export type NumericRangeCriteria = z.infer<typeof NumericRangeCriteriaSchema>;

// 2. 校验跨字段动态公式规则（用于钛/铌等稳定化元素按碳氮含量动态计算要求限值的场景）
export const DynamicExpressionCriteriaSchema = z.object({
  formula_min: z.string().optional(), // 例如："4 * (ctx.chemical.C + ctx.chemical.N)"（根据碳、氮元素含量动态计算钛元素下限）
  formula_max: z.string().optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  unit: z.string().optional(),
  rounding_decimals: z.number().int().min(0).max(8).optional(),
  note: z.string().optional(),
});
export type DynamicExpressionCriteria = z.infer<typeof DynamicExpressionCriteriaSchema>;

// 3. 校验公式计算与定性复合规则（用于压扁试验等：先依尺寸公式算出压扁间距 H，再判定肉眼有无裂缝）
export const DynamicFormulaPassCriteriaSchema = z.object({
  formula_distance_H: z.string().optional(), // 例如："(1 + 0.09) * S / (0.09 + S / D)"（压扁间距 H 计算公式，S为壁厚，D为外径）
  expected_visual_result: z.string().default('NO_CRACKS'),
  test_standard: z.string().optional(),
});
export type DynamicFormulaPassCriteria = z.infer<typeof DynamicFormulaPassCriteriaSchema>;

// 4. 校验参数与定性复合规则（用于扩口/弯曲试验等：在满足特定顶心角度或扩口率参数下判定表面有无裂纹）
export const QualitativeAndNumericCriteriaSchema = z.object({
  cone_angle_deg: z.number().optional(),
  flaring_rate_min_percent: z.number().optional(),
  expected_visual_result: z.string().default('NO_CRACKS'),
  test_standard: z.string().optional(),
});
export type QualitativeAndNumericCriteria = z.infer<typeof QualitativeAndNumericCriteriaSchema>;

// 5. 校验多选一试验选项与组规则（用于硬度试验等：支持 HRB / HBW / HV 等不同检测方法任选其一达标）
export const OrChoiceOptionSchema = z.object({
  sub_key: z.string(), // 例如："HRB"（洛氏硬度）、"HBW"（布氏硬度）、"HV"（维氏硬度）
  rule_type: z.literal('numeric_range'),
  criteria: NumericRangeCriteriaSchema,
});
export type OrChoiceOption = z.infer<typeof OrChoiceOptionSchema>;

export const OrChoiceGroupCriteriaSchema = z.object({
  options: z.array(OrChoiceOptionSchema).min(1),
});
export type OrChoiceGroupCriteria = z.infer<typeof OrChoiceGroupCriteriaSchema>;

// 6. 校验替代检验组规则（用于相互等效或替代的检测项目，如涡流探伤代替液压试验、超声代替射线）
export const AlternativeCandidateSchema = z.object({
  candidate_key: z.string(),
  display_name: stringOrOptional(),
  required_level: stringOrOptional(),
  test_standard: stringOrOptional(),
  calc_pressure_formula: stringOrOptional(),
  max_pressure_cap: z.number().optional(),
  min_holding_time_s: z.number().optional(),
  criteria_description: stringOrOptional(),
});
export type AlternativeCandidate = z.infer<typeof AlternativeCandidateSchema>;

function stringOrOptional() {
  return z.string().optional();
}

export const AlternativeGroupCriteriaSchema = z.object({
  group_logic: z.enum(['AT_LEAST_ONE_PASS', 'ALL_PASS']).default('AT_LEAST_ONE_PASS'),
  candidates: z.array(AlternativeCandidateSchema).min(1),
});
export type AlternativeGroupCriteria = z.infer<typeof AlternativeGroupCriteriaSchema>;

// 7. 校验定性评级/方法枚举规则（用于无损探伤验收等级 U2/E3H、金相级别判定、晶间腐蚀合格结论等）
export const QualitativeEnumCriteriaSchema = z.object({
  required_level: stringOrOptional(),  // 例如："U2"（超声验收等级）、"E3H"（涡流验收等级）
  test_standard: stringOrOptional(),   // 例如："GB/T 5777-2019"（无损检测国家标准）
  method: stringOrOptional(),          // 例如："Method_E"（晶间腐蚀试验方法E法）
  expected: stringOrOptional(),        // 例如："NO_CORROSION_TREND"（无晶间腐蚀倾向）
  min_level: stringOrOptional(),
});
export type QualitativeEnumCriteria = z.infer<typeof QualitativeEnumCriteriaSchema>;

// 8. 校验免做/豁免说明规则（用于标准中明确规定的免检条款及豁免原因说明）
export const ExemptionCriteriaSchema = z.object({
  reason: z.string(),
});
export type ExemptionCriteria = z.infer<typeof ExemptionCriteriaSchema>;


/* ==========================================================================
   三、顶层标准与牌号规则集整合 (Top-level Grade & Standard Ruleset)
   - 校验通用判定规则项、材料牌号元数据、尺寸公差表及完整标准文件结构
   ========================================================================== */

// 校验单条通用的评定规则结构（包含规则标识、类别、属性名、判定类型、触发条件及具体参数）
export const EvaluationRuleSchema = z.object({
  rule_id: z.string(),
  category: RuleCategorySchema,
  property_key: z.string(),
  display_name: z.string(),
  description: z.string().optional(),       // 规则业务与标准条款说明描述（例如："依据 GB/T 13296-2023 表3，熔炼分析碳含量指标"）
  rule_type: z.enum([
    'numeric_range',
    'dynamic_expression',
    'dynamic_formula_pass',
    'qualitative_and_numeric',
    'or_choice_group',
    'alternative_group',
    'qualitative_enum',
    'qualitative_pass',
    'enum_acceptance',
    'exemption',
  ]),
  requirement_level: RequirementLevelSchema.default('MANDATORY'),
  trigger_condition: z.string().optional(), // JS 条件表达式，例如："ctx.header.dimensions.wall_thickness_mm >= 1.7"（当壁厚大于等于1.7mm时触发）
  criteria: z.record(z.any()),              // 具体规则参数 (可由各 CriteriaSchema 校验)
});
export type EvaluationRule = z.infer<typeof EvaluationRuleSchema>;

// 校验材料牌号元数据（主牌号、统一数字代号、金相组织分类及历史/外标对照别名）
export const GradeInfoSchema = z.object({
  primary_grade: z.string(),               // 例如："06Cr19Ni10"（主牌号）
  unified_code: z.string().optional(),     // 例如："S30408"（统一数字代号）
  structure_type: z.string().optional(),   // 例如："austenitic"（奥氏体型）
  aliases: z.array(z.string()).default([]), // 例如：["SUS304", "TP304", "0Cr18Ni9"]（历史牌号或别名）
  standard_code: z.string().optional(),
});
export type GradeInfo = z.infer<typeof GradeInfoSchema>;

// 校验单个牌号的完整判定规则集合（绑定牌号信息、适用范围与所有评定规则项）
export const GradeRuleSchema = z.object({
  grade_info: GradeInfoSchema,
  description: z.string().optional(),      // 牌号综述说明
  applicability_scope: ApplicabilityScopeSchema.optional(),
  evaluation_rules: z.array(EvaluationRuleSchema),
});
export type GradeRule = z.infer<typeof GradeRuleSchema>;

// 校验标准文档的元信息（标准号、标准名称、发布年份、标准生效状态与适用材料类别）
export const StandardMetaSchema = z.object({
  standard_id: z.string(),                  // 例如："GB/T 13296-2023"（标准代号及年份）
  standard_name: z.string(),                // 例如："锅炉、热交换器用不锈钢无缝钢管"
  version: z.string().optional(),           // 例如："2023"（标准版本号）
  description: z.string().optional(),       // 标准概述与适用范围说明
  status: z.enum(['CURRENT', 'SUPERSEDED', 'WITHDRAWN']).default('CURRENT'),
  material_category: z.string().optional(), // 例如："ferrous_pipe"（黑色金属管材）
  applies_to_forms: z.array(z.string()).default([]),
});
export type StandardMeta = z.infer<typeof StandardMetaSchema>;

// 校验整个标准规则库文件（最顶层的完整 JSON 结构，包含标准元信息、全局尺寸公差表、各牌号规则列表）
export const StandardRuleSetSchema = z.object({
  $schema: z.string().optional(),
  standard_meta: StandardMetaSchema,
  global_dimension_tolerance_tables: z.record(z.any()).optional(),
  grade_rules: z.array(GradeRuleSchema),
});
export type StandardRuleSet = z.infer<typeof StandardRuleSetSchema>;