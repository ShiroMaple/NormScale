/**
 * ============================================================================
 * NormScale 质保书确定性归一化与消歧流水线 (Deterministic Normalization Pipeline)
 * ============================================================================
 * 
 * 本目录负责将各类上游抽取服务（DocEx / Vision LLM / OCR）输出的带噪声、异构单位
 * 与非标表达的原始质检数据，通过纯 TypeScript 确定性代码进行清洗、换算与消歧，
 * 最终输出 100% 符合 CertificateExtractSchema 强类型契约的标准化质检对象。
 * 
 * 核心子模块职责说明：
 * 1. unit-normalizer.ts:
 *    - 物理量工程单位换算器（基于 BigNumber 实现 kgf/mm² -> MPa, psi -> MPa, cm/m -> mm 等），
 *      支持自动剥离修饰前缀（如 '<0.01', '≥520'）。
 * 
 * 2. grade-normalizer.ts:
 *    - 材料牌号清洗与别名消歧器（联动 Phase 2 规则仓库别名字典，将 SUS304/TP304/0Cr18Ni9
 *      秒级消歧映射至标准统一代号 S30408/06Cr19Ni10）。
 * 
 * 3. property-key-normalizer.ts:
 *    - 检验项目名称与类别归一化映射器（将上百种中英文混写及缩写统一映射至标准 property_key）。
 * 
 * 4. qualitative-normalizer.ts:
 *    - 定性试验结论与探伤等级归一化器（将 '未见裂纹'/'OK'/'合格' 等映射为 PASS/FAIL/NOT_TESTED 枚举，
 *      并提取 E3H/U2 验收等级）。
 * 
 * 5. dimension-normalizer.ts:
 *    - 几何尺寸规格表达式解构器（精准解析 'Φ25.0×2.0×6000mm' 复合规格字符串）。
 * 
 * 6. certificate-normalizer.ts:
 *    - 归一化总控流水线 Orchestrator（串联上述所有清洗器，输出合规质检对象与转换审计日志）。
 * ============================================================================
 */

export * from './unit-normalizer';
export * from './grade-normalizer';
export * from './property-key-normalizer';
export * from './qualitative-normalizer';
export * from './dimension-normalizer';
export * from './certificate-normalizer';
