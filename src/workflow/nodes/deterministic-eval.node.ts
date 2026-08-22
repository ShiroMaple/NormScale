import { ComplianceEngine } from '../../engine/core.ts';
import { QualityAuditState } from '../state.interface.ts';
import { getSafeCollector } from '../trace-helper.ts';
import { logger } from '../../logger/index.ts';

/**
 * ============================================================================
 * 节点 4: 确定性规则核心核验节点 (Deterministic Evaluation Node)
 * ============================================================================
 */
export function createDeterministicEvalNode() {
  return async function deterministicEvalNode(state: QualityAuditState): Promise<Partial<QualityAuditState>> {
    const { standardRuleSet, normalizedCert } = state;
    const collector = getSafeCollector(state);

    if (!standardRuleSet || !normalizedCert) {
      return {
        error: 'Deterministic Eval Node Failed: Missing standardRuleSet or normalizedCert',
        workflowStatus: 'failed',
      };
    }

    logger.info('WORKFLOW', `[Node 4: Deterministic Eval] 启动确定性规则比对与合规裁决...`);
    collector.addTrace('WORKFLOW', 'info', `[节点 4] 启动核心规则比对引擎`);

    try {
      const report = ComplianceEngine.evaluate(standardRuleSet, normalizedCert, { collector });

      logger.info(
        'WORKFLOW',
        `[Node 4: Deterministic Eval] 规则比对完成，结论: [${report.summary.overall_status}] (评估 ${report.summary.total_rules_evaluated} 项，不合格 ${report.summary.fail_count} 项，漏检 ${report.summary.missing_count} 项)`
      );

      return {
        finalReport: report,
        itemResults: report.item_results,
        traces: collector.getTraces(),
        workflowStatus: 'reviewing_clauses',
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('WORKFLOW', `[Node 4: Deterministic Eval] 核心核验发生异常`, err);
      collector.addTrace('WORKFLOW', 'error', `[节点 4] 核验比对失败: ${errMsg}`);
      return {
        error: `Deterministic Eval Node Failed: ${errMsg}`,
        traces: collector.getTraces(),
        workflowStatus: 'failed',
      };
    }
  };
}
