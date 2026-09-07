import { StateGraph, MemorySaver, START, END } from '@langchain/langgraph';
import { QualityAuditStateAnnotation, QualityAuditState } from './state.interface.ts';
import { createExtractNode } from './nodes/extract.node.ts';
import { createNormalizeNode } from './nodes/normalize.node.ts';
import { createLlmPropertyResolverNode } from './nodes/llm-property-resolver.node.ts';
import { createRetrieveStandardNode } from './nodes/retrieve-standard.node.ts';
import { createDeterministicEvalNode } from './nodes/deterministic-eval.node.ts';
import { createSemanticReviewNode } from './nodes/semantic-review.node.ts';
import { createHumanReviewNode } from './nodes/human-review.node.ts';
import { createDecisionAggregatorNode } from './nodes/decision-aggregator.node.ts';
import { ICertificateExtractor } from '../extractor/extractor.interface.ts';
import { IRuleStore } from '../repository/rule-store.interface.ts';
import { ClauseStore } from '../repository/clause-store.ts';
import { logger } from '../logger/index.ts';

export interface AuditGraphDependencies {
  extractor?: ICertificateExtractor;
  ruleStore?: IRuleStore;
  clauseStore?: ClauseStore;
  checkpointer?: MemorySaver;
}

/**
 * ============================================================================
 * NormScale 质量证明书核验 LangGraph 状态图构建器 (Audit StateGraph Builder)
 * ============================================================================
 * 
 * 编排全流程状态机拓扑：
 * START -> extract -> normalize -> [条件分支: 有长尾项?] -> llm_property_resolver
 *                               -> [条件分支: 触发HITL?] -> human_review (挂起)
 *                               -> retrieve_standard -> deterministic_eval
 *                               -> semantic_review -> decision_aggregator -> END
 * ============================================================================
 */
export function buildAuditStateGraph(deps?: AuditGraphDependencies) {
  const checkpointer = deps?.checkpointer || new MemorySaver();

  const workflow = new StateGraph(QualityAuditStateAnnotation)
    // 注册全部工作流节点
    .addNode('extract', createExtractNode(deps?.extractor))
    .addNode('normalize', createNormalizeNode(deps?.ruleStore))
    .addNode('llm_property_resolver', createLlmPropertyResolverNode(deps?.ruleStore))
    .addNode('retrieve_standard', createRetrieveStandardNode(deps?.ruleStore))
    .addNode('deterministic_eval', createDeterministicEvalNode())
    .addNode('semantic_review', createSemanticReviewNode(deps?.clauseStore))
    .addNode('human_review', createHumanReviewNode())
    .addNode('decision_aggregator', createDecisionAggregatorNode())

    // 拓扑连线 (Edges)
    .addEdge(START, 'extract')
    .addEdge('extract', 'normalize')

    // 归一化后的条件路由: 牌号未知等阻断性异常优先进入人机协同，正常流转至标准检索
    .addConditionalEdges('normalize', (state: QualityAuditState) => {
      if (state.error) {
        logger.error('WORKFLOW', `工作流在 normalize 节点终止: ${state.error}`);
        return END;
      }

      // 若在 normalize 节点中判定牌号未知等重大阻断异常，路由至 human_review
      if (state.hitlContext && !state.humanCorrection) {
        logger.warn('WORKFLOW', `[条件路由] 检测到 normalize 阻断上下文 (${state.hitlContext.reason})，路由至 human_review 节点`);
        return 'human_review';
      }

      return 'retrieve_standard';
    })

    .addConditionalEdges('retrieve_standard', (state: QualityAuditState) => {
      return state.error ? END : 'deterministic_eval';
    })

    // Tier 1 确定性核验完成后的条件路由: 若有长尾待决项流向 Tier 2 LLM 消歧，否则直通语义复核
    .addConditionalEdges('deterministic_eval', (state: QualityAuditState) => {
      if (state.error) {
        return END;
      }

      // 若存在未识别的长尾属性且尚未人工修正，路由至 Tier 2 LLM 语义消歧
      if (state.unresolvedProperties && state.unresolvedProperties.length > 0 && !state.humanCorrection) {
        logger.info('WORKFLOW', `[条件路由] Tier 1 完成，检测到 ${state.unresolvedProperties.length} 项长尾待决指标，路由至 llm_property_resolver 节点`);
        return 'llm_property_resolver';
      }

      return 'semantic_review';
    })

    // LLM 语义消歧节点后的条件路由
    .addConditionalEdges('llm_property_resolver', (state: QualityAuditState) => {
      if (state.error) {
        return END;
      }

      // 若在消歧过程中判定存在重大歧义且需要人工介入
      if (state.hitlContext && !state.humanCorrection) {
        logger.warn('WORKFLOW', `[条件路由] LLM 语义消歧检测到歧义上下文，路由至 human_review 节点`);
        return 'human_review';
      }

      // 若有成功消歧升级的指标，回流至 deterministic_eval 重新执行增量核验
      if (state.resolvedProperties && state.resolvedProperties.length > 0) {
        logger.info('WORKFLOW', `[条件路由] LLM 消歧成功，回流至 deterministic_eval 节点补充核验`);
        return 'deterministic_eval';
      }

      return 'semantic_review';
    })

    // 人机协同节点恢复后，重回 normalize 节点重新应用清洗规则
    .addEdge('human_review', 'normalize')

    .addEdge('semantic_review', 'decision_aggregator')
    .addEdge('decision_aggregator', END);

  return workflow.compile({
    checkpointer,
  });
}

/** 默认预编译的状态图实例 (供 LangGraph CLI / Studio 本地可视化调试服务加载) */
export const auditGraph = buildAuditStateGraph();
export default auditGraph;
