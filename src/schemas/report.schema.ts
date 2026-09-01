import { z } from 'zod';
import { RequirementLevelSchema, RuleCategorySchema } from './standard.schema';
import { TestRecordSchema } from './certificate.schema';

/* ==========================================================================
   一、单项核验判定状态枚举 (Audit Status Enumeration)
   - 校验单条检验规则在比对核验后的技术裁决状态（合格、超标、漏检、豁免等）
   ========================================================================== */

// 校验质检核验单项判定的全生命周期状态
export const AuditStatusSchema = z.enum([
  'PASS',     // 合格 (实测值在标准公差/技术要求范围内)
  'FAIL',     // 不合格 (数值超标/低于下限，或定性试验出现裂纹等不符合项)
  'MISSING',  // 漏检 (标准为 MANDATORY 强制项但质保书中完全未报送实测数据)
  'EXEMPT',   // 豁免 (标准条款明确规定该牌号或特定交货条件下免做)
  'SKIPPED',  // 跳过/不适用 (因前置尺寸/工艺条件未激活而跳过判定，例如：壁厚小于 1.7mm 时免测硬度)
  'EXTRA',    // 额外报送 (质保书中已报送但标准未作强制规定的检测项目)
  'WARNING',  // 警示 (例如：协议选做项未提供，或实测值极度接近临界公差边界)
]);
export type AuditStatus = z.infer<typeof AuditStatusSchema>;


/* ==========================================================================
   二、单项规则评定结果明细 (Individual Rule Evaluation Result)
   - 校验单项指标的实测值、标准限值、修约计算、超标偏差分析及人机可读日志
   ========================================================================== */

// 校验单条评定规则的比对结果明细矩阵（包含数值修约计算、动态公式边界及公差偏离分析）
export const RuleEvaluationItemResultSchema = z.object({
  rule_id: z.string(),                                      // 规则唯一标识（例如："GB_T_13296_2023_S30408_CHEM_C"）
  category: RuleCategorySchema,                             // 指标大类（例如：化学成分 chemical、力学性能 mechanical 等）
  property_key: z.string(),                                 // 属性标识（例如："C"、"tensile_strength"、"hardness"）
  display_name: z.string(),                                 // 界面展示中文名称（例如："碳含量 (C)"、"抗拉强度 (Rm)"）
  status: AuditStatusSchema,                                // 单项判定裁决状态（PASS / FAIL / MISSING 等）
  requirement_level: RequirementLevelSchema,                // 标准要求等级（强制 MANDATORY、条件触发 CONDITIONAL 等）
  standard_requirement_text: z.string(),                    // 标准要求文本化描述（例如："<= 0.08%" 或 ">= 520 MPa"）
  actual_value_text: z.string(),                            // 质保书实测提取文本描述（例如："0.042%" 或 "565 MPa"）
  measured_value_raw: z.string().optional(),                // 原始实测单据提取文本（例如："0.042%"、"合格"）
  measured_value_num: z.number().nullable().optional(),     // 解析提取出的原始浮点数值（例如：0.042）
  rounded_value: z.number().nullable().optional(),          // 依据 GB/T 8170 规则修约后的标准对比数值
  rounding_decimals: z.number().optional(),                 // 修约保留小数位数精度（例如：2 表示保留两位小数）
  standard_min: z.number().nullable().optional(),           // 标准规范要求的理论下限数值
  standard_max: z.number().nullable().optional(),           // 标准规范要求的理论上限数值
  deviation: z.number().nullable().optional(),              // 偏差绝对值（例如超标：实测值 - 上限值，或欠达标：下限值 - 实测值）
  deviation_percentage: z.number().nullable().optional(),   // 偏差相对百分比（例如：+7.5%）
  formula_expression: z.string().optional(),                // 动态公式原文（例如："4 * (ctx.chemical.C + ctx.chemical.N)"）
  formula_calculated_bound: z.number().nullable().optional(),// 经 AST 动态公式计算出的实际边界数值
  message: z.string(),                                      // 判定详情与面向人类的可读说明日志（例如："实测值 0.086% 超过标准上限 0.080%，超标 +0.006%"）
});
export type RuleEvaluationItemResult = z.infer<typeof RuleEvaluationItemResultSchema>;


/* ==========================================================================
   三、全单核验汇总与决策统计 (Audit Summary & Gatekeeper Logic)
   - 校验整份质保书的全局裁决结论（一票否决制）与各项状态的数量分布统计
   ========================================================================== */

// 校验质保书合规性核验的全局汇总结论与决策统计指标
export const AuditSummarySchema = z.object({
  overall_status: z.enum(['PASS', 'FAIL', 'MANUAL_REVIEW']), // 全局判定结论（PASS 全合格、FAIL 一票否决不合格、MANUAL_REVIEW 需人工介入复核）
  total_rules_evaluated: z.number(),                         // 参与评估的标准规则总数
  pass_count: z.number(),                                    // 检验合格项数量
  fail_count: z.number(),                                    // 检验不合格/超标项数量
  missing_count: z.number(),                                 // 强制要求但未检测的漏检项数量
  exempt_count: z.number(),                                  // 符合标准免检条款的豁免项数量
  skipped_count: z.number(),                                 // 因尺寸/前置条件未满足而跳过的项数量
  warning_count: z.number(),                                 // 临界警告或协议未注明的警示项数量
  has_critical_fail: z.boolean(),                            // 是否触发一票否决的致命超标或强制项漏检
});
export type AuditSummary = z.infer<typeof AuditSummarySchema>;


/* ==========================================================================
   四、审验过程轨迹与性能度量模型 (Audit Traces & Performance Profiling)
   - 校验随单输出的自然语言决策全过程与微秒级子阶段性能耗时统计
   ========================================================================== */

// 校验单条审计过程轨迹记录
export const AuditTraceItemSchema = z.object({
  timestamp: z.string(),
  stage: z.string(),
  level: z.string(),
  message: z.string(),
  duration_ms: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type AuditTraceItem = z.infer<typeof AuditTraceItemSchema>;

// 校验核验执行耗时与各子阶段性能度量指标
export const PerformanceMetricsSchema = z.object({
  total_duration_ms: z.number(),
  phase_durations: z.record(z.number()),
});
export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;


/* ==========================================================================
   五、完整合规性核验报告根模型 (Root Compliance Audit Report)
   - 校验最终输出给前端展示、质检归档或 ERP/MES 系统消费的完整质检裁决报告
   ========================================================================== */

// 校验整份质保书核验结果的顶层根模型（涵盖匹配标准、时间戳、汇总决策、全量项明细矩阵、漏检清单及审计轨迹）
export const AuditReportSchema = z.object({
  certificate_no: z.string(),                                // 被核验的质保书单号（例如："MTC-2024-05882"）
  declared_standard: z.string(),                             // 质保书声明执行的标准代号（例如："GB/T 13296-2023"）
  declared_grade: z.string(),                                // 质保书声明的材料牌号（例如："S30408"）
  matched_standard_id: z.string(),                           // 规则引擎命中的标准库标识 ID（例如："GB_T_13296_2023"）
  matched_grade: z.string(),                                 // 规则引擎命中的材料牌号规则（例如："S30408"）
  audit_timestamp: z.string(),                               // 核验执行完成的时间戳（ISO-8601 格式，例如："2026-08-22T06:51:50Z"）
  summary: AuditSummarySchema,                               // 全局汇总与决策统计对象
  item_results: z.array(RuleEvaluationItemResultSchema),     // 全量检验规则项比对明细矩阵列表
  missing_mandatory_items: z.array(z.string()),              // 强制要求但未报送的漏检项属性清单（例如：["ultrasonic_test"]）
  unmatched_certificate_records: z.array(TestRecordSchema).optional(), // 质保书中已报送但标准库中未定义比对规则的额外记录项
  audit_traces: z.array(AuditTraceItemSchema).optional(),     // 业务审验过程自然语言轨迹流（供前端看板抽屉可视化渲染）
  performance_metrics: PerformanceMetricsSchema.optional(), // 全流程微秒级耗时与各子阶段性能度量

  // 扩展展示与上下文元数据 (用于单据打印、处置单及各模态框)
  supplier_name: z.string().optional(),
  supplier: z.string().optional(),
  heat_number: z.string().optional(),
  heatNo: z.string().optional(),
  lot_number: z.string().optional(),
  batch_number: z.string().optional(),
  standard_name: z.string().optional(),
  dimensions: z.string().optional(),
  delivery_state: z.string().optional(),
  inspector: z.string().optional(),
  supervisor: z.string().optional(),
});
export type AuditReport = z.infer<typeof AuditReportSchema>;