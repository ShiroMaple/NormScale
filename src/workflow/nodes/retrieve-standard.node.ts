import { IRuleStore } from '../../repository/rule-store.interface.ts';
import { FileRuleStore } from '../../repository/file-rule-store.ts';
import { QualityAuditState } from '../state.interface.ts';
import { getSafeCollector } from '../trace-helper.ts';
import { logger } from '../../logger/index.ts';

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

    // 解析执行标准代号列表 (支持多标准强制指定或声明标准多选切分)
    let standardIds: string[] = [];
    if (options?.forcedStandardIds && options.forcedStandardIds.length > 0) {
      standardIds = options.forcedStandardIds;
    } else if (options?.forcedStandardId) {
      standardIds = options.forcedStandardId.split(/[、,，;；\n]+/).map(s => s.trim()).filter(Boolean);
    } else if (normalizedCert.header.declared_standard) {
      standardIds = normalizedCert.header.declared_standard.split(/[、,，;；\n]+/).map(s => s.trim()).filter(Boolean);
    }
    if (standardIds.length === 0) {
      standardIds = ['GB/T 13296-2023'];
    }

    const gradeKey = options?.forcedGradeKey || normalizedCert.header.declared_grade;

    logger.info('WORKFLOW', `[Node 3: Retrieve Standard] 正在检索标准 [${standardIds.join('、')}] 与规格切片 [${gradeKey}]...`);
    collector.addTrace('WORKFLOW', 'info', `[节点 3] 检索标准库: 标准 [${standardIds.join('、')}] 切片 [${gradeKey}]`);

    try {
      const primaryStandardId = standardIds[0]!;
      const standardRuleSet = await store.getCompleteStandard(primaryStandardId);

      // 无论单标或多标，统一调用 resolveCompositeSlice 获得带追溯元数据的合成切片
      const compositeSlice = await store.resolveCompositeSlice(standardIds, gradeKey);
      const matchedSlice = compositeSlice || (await store.resolveRuleSlice(primaryStandardId, gradeKey));

      if (!standardRuleSet && !compositeSlice) {
        const errorMsg = `未收录标准 [${standardIds.join('、')}]，请检查标准代号或在标准库中补充配置`;
        logger.error('WORKFLOW', `[Node 3: Retrieve Standard] ${errorMsg}`);
        collector.addTrace('WORKFLOW', 'error', `[节点 3] ${errorMsg}`);
        return {
          error: `Retrieve Standard Node Failed: ${errorMsg}`,
          traces: collector.getTraces(),
          workflowStatus: 'failed',
        };
      }

      if (!matchedSlice) {
        const msg = `标准 [${standardIds.join('、')}] 中未检索到规格切片 [${gradeKey}]`;
        logger.warn('WORKFLOW', `[Node 3: Retrieve Standard] ${msg}`);
        collector.addTrace('WORKFLOW', 'warn', `[节点 3] ${msg}`);
      } else {
        logger.info(
          'WORKFLOW',
          `[Node 3: Retrieve Standard] 成功装载${compositeSlice ? '多标准合成' : ''}规格切片 [${matchedSlice.spec_key}] (包含 ${matchedSlice.evaluation_rules.length} 项检验规则)`
        );
      }

      return {
        standardRuleSet,
        matchedSlice,
        compositeSlice,
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
