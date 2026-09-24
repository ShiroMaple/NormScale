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
   */
  group: z
    .object({
      id: z.string().min(1),
      op: z.enum(['OR', 'AND']),
    })
    .optional(),

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