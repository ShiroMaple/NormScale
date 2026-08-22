/**
 * ============================================================================
 * NormScale 质保书提取抽象与适配层 (Certificate Extractor Layer)
 * ============================================================================
 * 
 * 本目录负责将各类上游异构提取源（外部 DocEx REST API、多模态大模型 Vision 直连
 * 以及本地离线 Mock 样本）统一抽象为标准接口。
 * 
 * 核心模块清单：
 * 1. extractor.interface.ts:
 *    - ICertificateExtractor 契约接口与 RawCertificatePayload 原始数据载荷。
 * 
 * 2. mock-extractor.ts:
 *    - 本地离线 Mock 提取器，提供真实工业质保书（含各种异构单位与牌号别名）确定性样本。
 * 
 * 3. docex-http-extractor.ts:
 *    - 面向独立 DocEx 抽取微服务的 HTTP REST API 客户端适配器。
 * 
 * 4. direct-llm-extractor.ts:
 *    - 面向通用多模态大模型的直连 Vision 抽取适配器。
 * ============================================================================
 */

export * from './extractor.interface';
export * from './mock-extractor';
export * from './docex-http-extractor';
export * from './direct-llm-extractor';
