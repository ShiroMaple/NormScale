import { z } from 'zod';

/**
 * ============================================================================
 * 基于 Zod 的标准库原子规则流 Schema (standard.schema.ts)
 * 作用：同时提供 S3 质量门禁运行时校验与静态 TS 类型推导
 * ============================================================================
 */

/** 1. 枚举与基础校验器 */
export const OperatorSchema = z.enum([
  '==',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  'between',
  'in',
  'contains',
]);

export const PropertyCategorySchema = z.enum([
  'chemical',     // 化学成分
  'mechanical',   // 力学性能
  'dimensional',  // 尺寸与公差
  'test',         // 工艺/无损/腐蚀试验
  'process',      // 冶炼/热处理
]);

export const TargetEntitySchema = z.enum([
  'product',
  'specimen',
  'heat_analysis',
]);

export const ConformanceLevelSchema = z.enum([
  'MANDATORY',
  'RECOMMENDED',
  'OPTIONAL',
]);

export const SeverityLevelSchema = z.enum([
  'ERROR',
  'WARNING',
  'INFO',
]);

/**
 * 规则组规范语义代号（CanonicalGroup Alignment 单源定义）：
 * 跨标准/跨来源规则组的机器可对齐标识，引擎按 code O(1) 对齐组合判定语义。
 * 采用“已知枚举 + 开放大写下划线字符串”联合体设计，兼顾静态类型提示与未来动态扩展容错。
 */
export const KnownGroupSemanticCodeSchema = z.enum([
  'HARDNESS_CHOICE',        // 硬度标尺任选其一（HRB/HBW/HV/HRC 同组互斥选一）
  'TIGHTNESS_ALTERNATIVE',  // 致密性/无损替代检验组（液压/涡流/超声等互为替代）
  'IMPACT_SPECIMEN_GROUP',  // 冲击试验试样组 (如多试样或不同取向)
  'CORROSION_ALTERNATIVE',  // 晶间腐蚀试验方法替代组 (Method A/B/C/E)
  'CUSTOM_TECHNICAL_GROUP', // 技术协议专有自定义组
]);

export const RuleGroupSemanticCodeSchema = z.union([
  KnownGroupSemanticCodeSchema,
  z.string().regex(/^[A-Z0-9_]{3,64}$/, '语义代号必须为 3~64 位的全大写字母、数字及下划线组合'),
]);
export type KnownGroupSemanticCode = z.infer<typeof KnownGroupSemanticCodeSchema>;
export type RuleGroupSemanticCode = z.infer<typeof RuleGroupSemanticCodeSchema>;

/** 规则逻辑组元数据 Schema */
export const RuleGroupSchema = z.object({
  id: z.string().min(1, 'group.id 不能为空'),
  op: z.enum(['OR', 'AND']),
  semantic_code: RuleGroupSemanticCodeSchema.optional(),
  name: z.string().optional().describe('规则组人类可读名称，如 "奥氏体硬度检验三选一"'),
  min_pass: z.number().int().positive().optional().default(1).describe('最少通过规则数（OR 组默认为 1）'),
});
export type RuleGroup = z.infer<typeof RuleGroupSchema>;

/** 2. 逻辑断言与上下文条件 (A & E) */
export const ConditionSchema = z.object({
  field: z.string().describe('上下文字段路径，如 product.wall_thickness, grade'),
  operator: OperatorSchema,
  value: z.union([
    z.number(),
    z.string(),
    z.boolean(),
    z.array(z.union([z.number(), z.string()])),
  ]),
  unit: z.string().optional(),
  description: z.string().optional(),
});

/** 3. RASE 原子规则 Schema */
export const RASERuleSchema = z.object({
  rule_id: z.string().min(1, 'rule_id 不能为空').describe('规则唯一ID'),
  clause_ref: z.string().min(1, 'clause_ref 不能为空').describe('标准条款出处'),
  conformance_level: ConformanceLevelSchema,
  severity: SeverityLevelSchema,

  /** S - Selection */
  selection: z.object({
    category: PropertyCategorySchema,
    data_element_id: z.string().min(1, 'data_element_id 不能为空').describe('统一主数据元 ID'),
    target_entity: TargetEntitySchema,
  }),

  /** A - Applicability */
  applicability: z.array(ConditionSchema).describe('生效前提条件'),

  /** E - Exceptions */
  exceptions: z.array(ConditionSchema).optional().describe('例外/排除条件'),

  /**
   * 规则分组（可选）：同 group.id 的规则按 op 组合判定——
   * OR=任选其一达标（如硬度 HRB/HBW/HV 三选一、涡流/水压替代检验组），AND=全部满足。
   * 无 group 的规则独立判定。引擎对同组规则不得逐条误判缺失。
   * semantic_code 为规范语义代号闭集（RuleGroupSemanticCodeSchema），
   * 跨标准/技术协议叠加时引擎按 code O(1) 对齐组语义。
   */
  group: RuleGroupSchema.optional(),

  /** R - Requirement */
  requirement: z.object({
    operator: OperatorSchema,
    value: z
      .union([
        z.number(),
        z.string(),
        z.tuple([z.number(), z.number()]),
        z.boolean(),
      ])
      .optional(),
    unit: z.string().optional(),
    formula: z.string().optional().describe('多变量推导公式，如 5 * (chem.element.C + chem.element.N)'),
    description: z.string().optional(),
  }),
});

/** 4. 根文档 Schema */
export const StandardDocumentSchema = z.object({
  meta: z.object({
    standard_code: z.string().min(1, 'standard_code 不能为空'),
    title: z.string().min(1, 'title 不能为空'),
    publication_year: z.string().min(1),
    status: z.enum(['ACTIVE', 'WITHDRAWN']),
  }),

  /** 术语归一化映射字典 */
  dictionary_mapping: z.record(z.string(), z.string()),

  /** 原子规则数组 */
  rules: z.array(RASERuleSchema),

  /** 动态倒排索引 */
  indices: z.object({
    grade_index: z.record(z.string(), z.array(z.string())),
  }),
});

/**
 * ============================================================================
 * 静态类型导出 (由 Zod 自动推导，无需手动重复维护 TypeScript Interface)
 * ============================================================================
 */
export type Operator = z.infer<typeof OperatorSchema>;
export type PropertyCategory = z.infer<typeof PropertyCategorySchema>;
export type TargetEntity = z.infer<typeof TargetEntitySchema>;
export type ConformanceLevel = z.infer<typeof ConformanceLevelSchema>;
export type SeverityLevel = z.infer<typeof SeverityLevelSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type RASERule = z.infer<typeof RASERuleSchema>;
export type StandardDocument = z.infer<typeof StandardDocumentSchema>;

/**
 * ============================================================================
 * 向后兼容历史切片与规则集模型 (SpecificationSlice & StandardRuleSet Compatibility)
 * 允许工作流及存量评估器在迁移期安全平滑过渡
 * ============================================================================
 */
export const RequirementLevelSchema = z.enum([
  'MANDATORY',
  'CONDITIONAL',
  'OPTIONAL_AGREED',
  'EXEMPT',
]);
export type RequirementLevel = z.infer<typeof RequirementLevelSchema>;

export const RuleCategorySchema = z.enum([
  'chemical',
  'mechanical',
  'process',
  'metallographic',
  'corrosion',
  'ndt',
  'geometric',
  'dimensional',
  'surface',
  'test',
  'other',
]);
export type RuleCategory = z.infer<typeof RuleCategorySchema>;

export const DimensionConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(['<=', '<', '>=', '>', '==', '!=']),
  value: z.union([z.number(), z.string()]),
});
export type DimensionCondition = z.infer<typeof DimensionConditionSchema>;

export const ApplicabilityScopeSchema = z.object({
  material_form: z.array(z.string()).optional(),
  manufacturing_process: z.array(z.string()).optional(),
  delivery_state: z.array(z.string()).optional(),
  dimension_conditions: z.array(DimensionConditionSchema).optional(),
});
export type ApplicabilityScope = z.infer<typeof ApplicabilityScopeSchema>;

export const ConditionAdjustmentSchema = z.object({
  when: z.string(),
  min_offset: z.number().optional(),
  max_offset: z.number().optional(),
  note: z.string().optional(),
});
export type ConditionAdjustment = z.infer<typeof ConditionAdjustmentSchema>;

export const NumericRangeCriteriaSchema = z.object({
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  unit: z.string().optional(),
  rounding_decimals: z.number().int().min(0).max(8).optional(),
  min_inclusive: z.boolean().default(true),
  max_inclusive: z.boolean().default(true),
  condition_adjustments: z.array(ConditionAdjustmentSchema).optional(),
});
export type NumericRangeCriteria = z.infer<typeof NumericRangeCriteriaSchema>;

export const DynamicExpressionCriteriaSchema = z.object({
  formula_min: z.string().optional(),
  formula_max: z.string().optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  unit: z.string().optional(),
  rounding_decimals: z.number().int().min(0).max(8).optional(),
  note: z.string().optional(),
});
export type DynamicExpressionCriteria = z.infer<typeof DynamicExpressionCriteriaSchema>;

export const DynamicFormulaPassCriteriaSchema = z.object({
  formula_distance_H: z.string().optional(),
  expected_visual_result: z.string().default('NO_CRACKS'),
  test_standard: z.string().optional(),
});
export type DynamicFormulaPassCriteria = z.infer<typeof DynamicFormulaPassCriteriaSchema>;

export const QualitativeAndNumericCriteriaSchema = z.object({
  cone_angle_deg: z.number().optional(),
  flaring_rate_min_percent: z.number().optional(),
  expected_visual_result: z.string().default('NO_CRACKS'),
  test_standard: z.string().optional(),
});
export type QualitativeAndNumericCriteria = z.infer<typeof QualitativeAndNumericCriteriaSchema>;

export const OrChoiceOptionSchema = z.object({
  sub_key: z.string(),
  rule_type: z.literal('numeric_range'),
  criteria: NumericRangeCriteriaSchema,
});
export type OrChoiceOption = z.infer<typeof OrChoiceOptionSchema>;

export const OrChoiceGroupCriteriaSchema = z.object({
  options: z.array(OrChoiceOptionSchema).min(1),
});
export type OrChoiceGroupCriteria = z.infer<typeof OrChoiceGroupCriteriaSchema>;

export const AlternativeCandidateSchema = z.object({
  candidate_key: z.string(),
  display_name: z.string().optional(),
  required_level: z.string().optional(),
  test_standard: z.string().optional(),
  calc_pressure_formula: z.string().optional(),
  max_pressure_cap: z.number().optional(),
  min_holding_time_s: z.number().optional(),
  criteria_description: z.string().optional(),
});
export type AlternativeCandidate = z.infer<typeof AlternativeCandidateSchema>;

export const AlternativeGroupCriteriaSchema = z.object({
  group_logic: z.enum(['AT_LEAST_ONE_PASS', 'ALL_PASS']).default('AT_LEAST_ONE_PASS'),
  candidates: z.array(AlternativeCandidateSchema).min(1),
});
export type AlternativeGroupCriteria = z.infer<typeof AlternativeGroupCriteriaSchema>;

export const QualitativeEnumCriteriaSchema = z.object({
  required_level: z.string().optional(),
  test_standard: z.string().optional(),
  method: z.string().optional(),
  expected: z.string().optional(),
  min_level: z.string().optional(),
});
export type QualitativeEnumCriteria = z.infer<typeof QualitativeEnumCriteriaSchema>;

export const ExemptionCriteriaSchema = z.object({
  reason: z.string(),
});
export type ExemptionCriteria = z.infer<typeof ExemptionCriteriaSchema>;

export const EvaluationRuleSchema = z.object({
  rule_id: z.string(),
  category: RuleCategorySchema,
  property_key: z.string(),
  display_name: z.string(),
  description: z.string().optional(),
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
  trigger_condition: z.string().optional(),
  criteria: z.record(z.any()),
});
export type EvaluationRule = z.infer<typeof EvaluationRuleSchema>;

export const SpecTypeSchema = z.enum([
  'grade',
  'property_class',
  'pressure_class',
  'material_group',
  'standard_type',
]);
export type SpecType = z.infer<typeof SpecTypeSchema>;

export const SpecificationSliceSchema = z.object({
  spec_key: z.string(),
  spec_type: SpecTypeSchema.default('grade'),
  display_name: z.string(),
  primary_grade: z.string().optional(),
  unified_code: z.string().optional(),
  standard_code: z.string().optional(),
  structure_type: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  description: z.string().optional(),
  applicability_scope: ApplicabilityScopeSchema.optional(),
  evaluation_rules: z.array(EvaluationRuleSchema),
});
export type SpecificationSlice = z.infer<typeof SpecificationSliceSchema>;

export const ToleranceStepRuleSchema = z.object({
  dimension_property: z.enum(['outer_diameter', 'wall_thickness']),
  process: z.enum(['cold_drawn', 'hot_rolled', 'hot_extrusion', 'all']).default('all'),
  delivery_mode: z.enum(['nominal_wall', 'min_wall']).default('min_wall'),
  range_min: z.number().optional(),
  range_max: z.number().optional(),
  outer_diameter_limit: z.number().optional(),
  plus_tolerance_value: z.number(),
  plus_tolerance_is_percent: z.boolean().default(false),
  minus_tolerance_value: z.number(),
  minus_tolerance_is_percent: z.boolean().default(false),
  note: z.string().optional(),
});
export type ToleranceStepRule = z.infer<typeof ToleranceStepRuleSchema>;

export const DimensionToleranceTableSchema = z.object({
  table_id: z.string(),
  table_name: z.string(),
  rules: z.array(ToleranceStepRuleSchema),
});
export type DimensionToleranceTable = z.infer<typeof DimensionToleranceTableSchema>;

export const GradeInfoSchema = z.object({
  primary_grade: z.string(),
  unified_code: z.string().optional(),
  structure_type: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  standard_code: z.string().optional(),
});
export type GradeInfo = z.infer<typeof GradeInfoSchema>;

export const GradeRuleSchema = z.object({
  grade_info: GradeInfoSchema,
  description: z.string().optional(),
  applicability_scope: ApplicabilityScopeSchema.optional(),
  evaluation_rules: z.array(EvaluationRuleSchema),
});
export type GradeRule = z.infer<typeof GradeRuleSchema>;

export const StandardMetaSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    return {
      ...val,
      standard_id: val.standard_id || val.standard_code,
      standard_name: val.standard_name || val.title,
      status: val.status === 'ACTIVE' ? 'CURRENT' : val.status,
    };
  }
  return val;
}, z.object({
  standard_id: z.string(),
  standard_name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['CURRENT', 'SUPERSEDED', 'WITHDRAWN', 'ACTIVE']).transform(s => s === 'ACTIVE' ? 'CURRENT' : s).default('CURRENT'),
  material_category: z.string().optional(),
  applies_to_forms: z.array(z.string()).default([]),
  tolerance_tables: z.array(DimensionToleranceTableSchema).optional(),
}));
export type StandardMeta = z.infer<typeof StandardMetaSchema>;

export const StandardClauseSchema = z.object({
  clause_id: z.string(),
  title: z.string(),
  text: z.string(),
});
export type StandardClause = z.infer<typeof StandardClauseSchema>;

export const StandardRuleSetSchema = z.object({
  '$schema': z.string().optional(),
  standard_meta: StandardMetaSchema,
  global_dimension_tolerance_tables: z.record(z.any()).optional(),
  grade_rules: z.array(GradeRuleSchema).default([]),
  slices: z.array(SpecificationSliceSchema).default([]),
  clauses: z.array(StandardClauseSchema).optional(),
});
export type StandardRuleSet = z.infer<typeof StandardRuleSetSchema>;