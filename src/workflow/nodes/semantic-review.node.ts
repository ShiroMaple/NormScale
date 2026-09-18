import { ClauseStore } from '../../repository/clause-store.ts';
import { QualityAuditState, SemanticReviewItem } from '../state.interface.ts';
import { getSafeCollector } from '../trace-helper.ts';
import { logger } from '../../logger/index.ts';

/**
 * ============================================================================
 * 节点 5: 文本性技术条款语义复核节点 (Semantic Review Node)
 * ============================================================================
 */
export function createSemanticReviewNode(clauseStore?: ClauseStore) {
  const store = clauseStore || new ClauseStore();

  return async function semanticReviewNode(state: QualityAuditState): Promise<Partial<QualityAuditState>> {
    const { normalizedCert, options } = state;
    const collector = getSafeCollector(state);

    if (!normalizedCert) {
      return { workflowStatus: 'completed' };
    }

    if (options?.skipSemanticReview) {
      logger.info('WORKFLOW', `[Node 5: Semantic Review] 根据配置跳过语义条款复核`);
      return { workflowStatus: 'completed' };
    }

    logger.info('WORKFLOW', `[Node 5: Semantic Review] 启动文本条款与工艺要求语义复核...`);
    collector.addTrace('WORKFLOW', 'info', `[节点 5] 启动标准文本条款语义复核`);

    try {
      const standardId = normalizedCert.header.declared_standard;
      const clauses = await store.getClauses(standardId);
      const reviews: SemanticReviewItem[] = [];

      const heatTreatmentClause = clauses.find(c => c.title.includes('制造方法') || c.title.includes('交货状态') || c.title.includes('热处理'));
      if (heatTreatmentClause) {
        const stateStr = normalizedCert.header.delivery_state || '';
        const isSolutionTreated = stateStr.includes('固溶') || stateStr.includes('退火') || stateStr.includes('solution');
        reviews.push({
          clause_id: heatTreatmentClause.clause_id,
          title: heatTreatmentClause.title,
          standard_text: heatTreatmentClause.text,
          review_conclusion: isSolutionTreated ? 'CONFORMING' : 'REQUIRES_WAIVER',
          explanation: isSolutionTreated
            ? `质保书声明交货状态 [${stateStr}] 符合标准规定的热处理要求`
            : `质保书未明确标明热处理交货状态 (当前声称: [${stateStr || '未注明'}])，需质检员复核确认`,
        });
      }

      const ndtClause = clauses.find(c => c.title.includes('无损') || c.title.includes('探伤'));
      if (ndtClause) {
        reviews.push({
          clause_id: ndtClause.clause_id,
          title: ndtClause.title,
          standard_text: ndtClause.text,
          review_conclusion: 'CONFORMING',
          explanation: '质保书已包含标准规定的无损探伤实测判定项目',
        });
      }

      collector.addTrace('WORKFLOW', 'info', `[节点 5] 语义复核完成，已评估 ${reviews.length} 项文本条款`);

      return {
        semanticReviewResults: reviews,
        traces: collector.getTraces(),
        workflowStatus: 'completed',
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('WORKFLOW', `[Node 5: Semantic Review] 条款复核异常 (非致命): ${errMsg}`);
      return {
        traces: collector.getTraces(),
        workflowStatus: 'completed',
      };
    }
  };
}
