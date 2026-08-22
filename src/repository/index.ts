/**
 * ============================================================================
 * NormScale 规则存储与数据仓库层 (Rule Repository & Clause Store Layer)
 * ============================================================================
 * 
 * 本目录负责管理国家/行业执行标准规则库的持久化存储、内存索引与检索调度。
 * 遵循仓储模式（Repository Pattern）与依赖倒置原则（DIP），通过抽象接口
 * 彻底解耦上层核验引擎与底层物理存储介质。
 * 
 * 核心子模块职责说明：
 * 1. rule-store.interface.ts:
 *    - IRuleStore 仓储标准契约接口定义。
 *    - 声明了 resolveRuleSlice（规则切片定位）、getStandardMeta（标准元数据查询）、
 *      getCompleteStandard（标准规则全集组装）与 listAvailableStandards（已收录标准列表）方法。
 * 
 * 2. file-rule-store.ts:
 *    - 基于文件系统与内存倒排索引的高性能规则仓库实现。
 *    - 从 data/standards/ 目录按需加载规格切片，建立标准代号与材料主牌号、统一代号、
 *      国际等效别名（如 SUS304 -> S30408）的双向哈希路由，提供 O(1) 级别秒级检索（<0.1ms）。
 * 
 * 3. clause-store.ts:
 *    - 标准规范全文定性条款与工艺技术要求检索器。
 *    - 加载 clauses.json 并提供关键词全文检索与模糊过滤，为定性语义 RAG 提供知识库检索基础。
 * ============================================================================
 */

export * from './rule-store.interface';
export * from './file-rule-store';
export * from './clause-store';
