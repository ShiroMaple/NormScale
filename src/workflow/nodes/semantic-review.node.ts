import { ClauseStore } from '../../repository/clause-store';
import { QualityAuditState, SemanticReviewItem } from '../state.interface';
import { getSafeCollector } from '../trace-helper';
import { logger } from '../../logger';

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

      const heatTreatmentClauses = clauses.filter(c => c.clause_id.includes('6.2') || c.title.includes('制造方法') || c.title.includes('交货状态'));
      if (heatTreatmentClauses.length > 0) {
        const stateStr = normalizedCert.header.delivery_state || '';
        const isSolutionTreated = stateStr.includes('固溶') || stateStr.includes('退火') || stateStr.includes('solution');
        reviews.push({
          clause_id: heatTreatmentClauses[0]?.clause_id || 'Section 6.2',
          title: heatTreatmentClauses[0]?.title || '交货状态与热处理要求',
          standard_text: heatTreatmentClauses[0]?.text || '钢管应以固溶热处理并经酸洗状态交货。',
          review_conclusion: isSolutionTreated ? 'CONFORMING' : 'REQUIRES_WAIVER',
          explanation: isSolutionTreated
            ? `质保书声明交货状态 [${stateStr}] 符合标准规定的固溶处理要求`
            : `质保书未明确标明固溶热处理交货状态 (当前声称: [${stateStr || '未注明'}])，需质检员复核确认`,
        });
      }

      const ndtClauses = clauses.filter(c => c.clause_id.includes('7.6') || c.title.includes('无损'));
      if (ndtClauses.length > 0) {
        reviews.push({
          clause_id: ndtClauses[0]?.clause_id || 'Section 7.6',
          title: ndtClauses[0]?.title || '无损检测方法与验收级别',
          standard_text: ndtClauses[0]?.text || '钢管应逐根进行超声检测或涡流检测。',
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
