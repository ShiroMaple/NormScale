import { StateGraph, MemorySaver, START, END } from '@langchain/langgraph';
import { QualityAuditStateAnnotation, QualityAuditState } from './state.interface';
import { createExtractNode } from './nodes/extract.node';
import { createNormalizeNode } from './nodes/normalize.node';
import { createRetrieveStandardNode } from './nodes/retrieve-standard.node';
import { createDeterministicEvalNode } from './nodes/deterministic-eval.node';
import { createSemanticReviewNode } from './nodes/semantic-review.node';
import { createHumanReviewNode } from './nodes/human-review.node';
import { createDecisionAggregatorNode } from './nodes/decision-aggregator.node';
import { ICertificateExtractor } from '../extractor/extractor.interface';
import { IRuleStore } from '../repository/rule-store.interface';
import { ClauseStore } from '../repository/clause-store';
import { logger } from '../logger';

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
 * START -> extract -> normalize -> [条件路由: hitlContext -> human_review (挂起)]
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
    .addNode('retrieve_standard', createRetrieveStandardNode(deps?.ruleStore))
    .addNode('deterministic_eval', createDeterministicEvalNode())
    .addNode('semantic_review', createSemanticReviewNode(deps?.clauseStore))
    .addNode('human_review', createHumanReviewNode())
    .addNode('decision_aggregator', createDecisionAggregatorNode())

    // 拓扑连线 (Edges)
    .addEdge(START, 'extract')
    .addEdge('extract', 'normalize')

    // 归一化后的条件路由 (Conditional Edge: 是否需要触发 HITL 人工干预)
    .addConditionalEdges('normalize', (state: QualityAuditState) => {
      if (state.error) {
        logger.error('WORKFLOW', `工作流在 normalize 节点终止: ${state.error}`);
        return END;
      }

      // 若在 normalize 节点中判定需要人工介入且尚未提交有效修正
      if (state.hitlContext && !state.humanCorrection) {
        logger.warn('WORKFLOW', `[条件路由] 检测到 HITL 挂起上下文，路由至 human_review 节点`);
        return 'human_review';
      }

      // 正常自动流转至标准检索
      return 'retrieve_standard';
    })

    // 人机协同节点恢复后，重回 normalize 节点重新应用清洗规则
    .addEdge('human_review', 'normalize')

    // 后续流水线直线拓扑
    .addConditionalEdges('retrieve_standard', (state: QualityAuditState) => {
      return state.error ? END : 'deterministic_eval';
    })
    .addConditionalEdges('deterministic_eval', (state: QualityAuditState) => {
      return state.error ? END : 'semantic_review';
    })
    .addEdge('semantic_review', 'decision_aggregator')
    .addEdge('decision_aggregator', END);

  return workflow.compile({
    checkpointer,
  });
}
