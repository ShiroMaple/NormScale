/**
 * ============================================================================
 * NormScale 确定性规则核验计算引擎 (Deterministic Compliance Engine Layer)
 * ============================================================================
 * 
 * 本目录是 NormScale 的核心计算中枢。为了彻底根除 LLM 在数值判断中的“幻觉”
 * （例如无法识别 0.005% 的微小超标、或无法正确执行工业修约规则），本目录
 * 采用纯 TypeScript 高精度代码实现所有理化指标、几何公差与逻辑组的精确计算。
 * 
 * 核心子模块职责说明：
 * 1. rounding.ts:
 *    - 国家标准 GB/T 8170-2008《数值修约规则与极限数值的表示和判定》算法实现。
 *    - 严格遵循“四舍六入五考虑，五后非零则进一，五后皆零视奇偶（奇进偶不进）”，
 *      基于 BigNumber 消除 JavaScript 原生 IEEE 754 浮点运算精度丢失。
 * 
 * 2. numeric-evaluator.ts:
 *    - 定量数值区间比较器。根据修约位数修约后，核验实测值是否处于 [min, max] 范围内，
 *      支持开闭区间判定与超差偏移量（deviation）精确计算。
 * 
 * 3. dynamic-evaluator.ts:
 *    - 跨字段动态公式安全求值器。例如钛稳定化不锈钢要求 Ti >= 4 * (C + N) 或
 *      压扁间距公式 H = (1+e)*S / (e + S/D)，通过 AST 词法语法解析安全执行，杜绝 eval() 注入风险。
 * 
 * 4. logic-evaluator.ts:
 *    - 复合逻辑组评定器。支持硬度三选一（HRB / HBW / HV 满足任一即合格）与
 *      无损探伤替代检验组（例如涡流探伤合规可等效替代水压试验）。
 * 
 * 5. missing-scanner.ts:
 *    - 强制项漏检扫描器。核查标准中要求为 MANDATORY 或条件触发激活的检验项是否
 *      在质保书中被如实报送，若缺失则标记为 MISSING 并阻断放行。
 * 
 * 6. tolerance-evaluator.ts:
 *    - 几何尺寸与公差评估器。依据冷拔/热轧工艺及交货方式（最小壁厚/公称壁厚），
 *      动态匹配国家标准公差阶梯表，计算允许外径与壁厚极值。
 * 
 * 7. core.ts:
 *    - ComplianceEngine 核心调度器。按标准规格切片协调上述所有子求值器，
 *      执行端到端合规性判定，并输出审计报告。
 * ============================================================================
 */

export * from './rounding';
export * from './numeric-evaluator';
export * from './dynamic-evaluator';
export * from './logic-evaluator';
export * from './missing-scanner';
export * from './tolerance-evaluator';
export * from './core';
