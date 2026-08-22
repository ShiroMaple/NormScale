/**
 * ============================================================================
 * NormScale 元模型契约层 (Meta-Schema Contracts Layer)
 * ============================================================================
 * 
 * 本目录定义了 NormScale 系统的核心数据契约（Data Contracts），采用 Zod 强类型
 * 校验库进行建模，保证系统在运行时具有 100% 确定性的输入/输出类型安全。
 * 
 * 核心包含三大领域模型：
 * 1. standard.schema.ts:
 *    - 国家/行业执行标准元模型（Standard Meta-Schema）。
 *    - 包含通用规格切片（Specification Slice）、理化力学判定规则、跨元素动态公式、
 *      硬度多选一、替代检验组（涡流替代水压）与几何尺寸公差阶梯表。
 * 
 * 2. certificate.schema.ts:
 *    - 工业产品质量证明书元模型（Certificate Meta-Schema）。
 *    - 包含质保书抬头（证书号、供应商、执行标准、牌号、炉批号、几何尺寸）与
 *      扁平化的检验项目实测记录集（test_records）。
 * 
 * 3. report.schema.ts:
 *    - 最终出具的合规检验报告元模型（Audit Report Schema）。
 *    - 包含全局决策状态（PASS/FAIL/WARNING/BLOCKED）、严重等级、
 *      单项判定详情矩阵（含实测值、标准要求、修约过程、超差偏移量）与关键缺失项告警。
 * ============================================================================
 */

export * from './standard.schema';
export * from './certificate.schema';
export * from './report.schema';
