import { QualityAuditState } from '../state.interface.ts';
import { getSafeCollector } from '../trace-helper.ts';
import { logger } from '../../logger/index.ts';

/**
 * ============================================================================
 * 节点 7: 全局决策聚合与报告组装节点 (Decision Aggregator Node)
 * ============================================================================
 */
export function createDecisionAggregatorNode() {
  return async function decisionAggregatorNode(state: QualityAuditState): Promise<Partial<QualityAuditState>> {
    const { finalReport } = state;
    const collector = getSafeCollector(state);

    if (!finalReport) {
      return {
        error: 'Decision Aggregator Failed: Missing finalReport',
        workflowStatus: 'failed',
      };
    }

    logger.info(
      'WORKFLOW',
      `[Node 7: Aggregator] 正在组装最终核验报告: 结论 [${finalReport.summary.overall_status}]，报告单号 [${finalReport.certificate_no}]`
    );

    collector.addTrace(
      'WORKFLOW',
      'info',
      `[工作流完成] 全流程执行完毕，最终结论: [${finalReport.summary.overall_status}]`
    );

    finalReport.audit_traces = collector.getTraces();
    finalReport.performance_metrics = collector.getPerformanceMetrics();

    logger.info(
      'WORKFLOW',
      `[Node 7: Aggregator] 报告生成完毕 (包含 ${finalReport.audit_traces?.length || 0} 条审计轨迹，总耗时 ${finalReport.performance_metrics?.total_duration_ms || 0}ms)`
    );

    return {
      finalReport,
      traces: finalReport.audit_traces,
      workflowStatus: 'completed',
    };
  };
}
