import { IRuleStore } from '../../repository/rule-store.interface';
import { FileRuleStore } from '../../repository/file-rule-store';
import { QualityAuditState } from '../state.interface';
import { getSafeCollector } from '../trace-helper';
import { logger } from '../../logger';

/**
 * ============================================================================
 * 节点 3: 标准规则与规格切片检索节点 (Retrieve Standard Node)
 * ============================================================================
 */
export function createRetrieveStandardNode(ruleStore?: IRuleStore) {
  const store = ruleStore || new FileRuleStore();

  return async function retrieveStandardNode(state: QualityAuditState): Promise<Partial<QualityAuditState>> {
    const { normalizedCert, options } = state;
    const collector = getSafeCollector(state);

    if (!normalizedCert) {
      return {
        error: 'Retrieve Standard Node Failed: Missing normalizedCert',
        workflowStatus: 'failed',
      };
    }

    const standardId = options?.forcedStandardId || normalizedCert.header.declared_standard;
    const gradeKey = normalizedCert.header.declared_grade;

    logger.info('WORKFLOW', `[Node 3: Retrieve Standard] 正在检索标准 [${standardId}] 与规格切片 [${gradeKey}]...`);
    collector.addTrace('WORKFLOW', 'info', `[节点 3] 检索标准库: 标准 [${standardId}] 切片 [${gradeKey}]`);

    try {
      const standardRuleSet = await store.getCompleteStandard(standardId);
      if (!standardRuleSet) {
        const msg = `标准规则库中未收录标准 [${standardId}]`;
        logger.error('WORKFLOW', `[Node 3: Retrieve Standard] ${msg}`);
        collector.addTrace('WORKFLOW', 'error', `[节点 3] ${msg}`);
        return {
          error: msg,
          traces: collector.getTraces(),
          workflowStatus: 'failed',
        };
      }

      const matchedSlice = await store.resolveRuleSlice(standardId, gradeKey);
      if (!matchedSlice) {
        const msg = `标准 [${standardId}] 中未检索到规格切片 [${gradeKey}]`;
        logger.warn('WORKFLOW', `[Node 3: Retrieve Standard] ${msg}`);
        collector.addTrace('WORKFLOW', 'warn', `[节点 3] ${msg}`);
      } else {
        logger.info(
          'WORKFLOW',
          `[Node 3: Retrieve Standard] 成功装载规格切片 [${matchedSlice.spec_key}] (包含 ${matchedSlice.evaluation_rules.length} 项检验规则)`
        );
      }

      return {
        standardRuleSet,
        matchedSlice,
        traces: collector.getTraces(),
        workflowStatus: 'evaluating',
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('WORKFLOW', `[Node 3: Retrieve Standard] 检索标准发生异常`, err);
      collector.addTrace('WORKFLOW', 'error', `[节点 3] 检索标准失败: ${errMsg}`);
      return {
        error: `Retrieve Standard Node Failed: ${errMsg}`,
        traces: collector.getTraces(),
        workflowStatus: 'failed',
      };
    }
  };
}
