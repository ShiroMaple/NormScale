/**
 * ============================================================================
 * NormScale 质量证明书合规检验引擎与智能比对系统 (Root Export Entry)
 * ============================================================================
 * 
 * 本文件是 NormScale 系统的核心顶层导出入口，对外提供完整的领域模型、
 * 规则仓库、抽取适配器、确定性归一化流水线与合规核验引擎 API。
 * 
 * 核心架构分层：
 * 1. schemas:
 *    - 核心强类型元模型契约（执行标准、质保书、审计报告）。
 * 2. repository:
 *    - 标准规则库存储仓库与全文条款检索（IRuleStore, FileRuleStore, ClauseStore）。
 * 3. extractor:
 *    - 质保书提取抽象与多后端适配层（ICertificateExtractor, Mock, DocEx HTTP Client）。
 * 4. normalizer:
 *    - 确定性归一化与消歧流水线（GradeNormalizer, UnitNormalizer, CertificateNormalizer）。
 * 5. logger:
 *    - 领域日志门面、自然语言输出、微秒级性能度量与审计轨迹收集器（ILogger, PerformanceProfiler, MemoryTraceCollector）。
 * 6. engine:
 *    - 确定性规则核验计算引擎（ComplianceEngine, GB/T 8170 修约, 动态公式, 几何公差）。
 * 7. workflow:
 *    - LangGraph 状态图与人机协同 (HITL) 编排引擎 (StateGraph, WorkflowEngine)。
 * ============================================================================
 */

export * from './schemas';
export * from './repository';
export * from './extractor';
export * from './normalizer';
export * from './logger';
export * from './engine';
export * from './workflow';
