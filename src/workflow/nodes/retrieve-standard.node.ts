import { IRuleStore } from '../../repository/rule-store.interface.ts';
import { FileRuleStore } from '../../repository/file-rule-store.ts';
import { QualityAuditState } from '../state.interface.ts';
import { getSafeCollector } from '../trace-helper.ts';
import { logger } from '../../logger/index.ts';
import { normalizeStandardId } from '../../lib/utils.ts';

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
    } else if (normalizedCert.header.declared_standard && normalizedCert.header.declared_standard !== 'UNKNOWN') {
      standardIds = normalizedCert.header.declared_standard.split(/[、,，;；\n]+/).map(s => s.trim()).filter(s => s && s !== 'UNKNOWN');
    }

    // 后端防御性去重：基于 normalizeStandardId 去除重复或等价变体，防止同标准被重复加载合成
    const seenNorm = new Set<string>();
    const deduplicatedStandardIds: string[] = [];
    for (const sid of standardIds) {
      const norm = normalizeStandardId(sid);
      if (!seenNorm.has(norm)) {
        seenNorm.add(norm);
        deduplicatedStandardIds.push(sid);
      }
    }
    standardIds = deduplicatedStandardIds;

    if (standardIds.length === 0) {
      const errorMsg = '质保证书未声明执行标准，且未在核验选项中指定执行标准';
      logger.error('WORKFLOW', `[Node 3: Retrieve Standard] ${errorMsg}`);
      collector.addTrace('WORKFLOW', 'error', `[节点 3] ${errorMsg}`);
      return {
        error: `Retrieve Standard Node Failed: ${errorMsg}`,
        traces: collector.getTraces(),
        workflowStatus: 'failed',
      };
    }

    // 确定切片路由牌号：优先采用归一化消歧后的主牌号 (如 022Cr17Ni12Mo2)，防止前端透传未清洗的括号附注导致路由落空
    const primaryGrade = (normalizedCert.header.declared_grade && normalizedCert.header.declared_grade !== 'UNKNOWN')
      ? normalizedCert.header.declared_grade
      : (options?.forcedGradeKey || 'UNKNOWN');

    logger.info('WORKFLOW', `[Node 3: Retrieve Standard] 正在检索标准 [${standardIds.join('、')}] 与规格切片 [${primaryGrade}]...`);
    collector.addTrace('WORKFLOW', 'info', `[节点 3] 检索标准库: 标准 [${standardIds.join('、')}] 切片 [${primaryGrade}]`);

    try {
      const primaryStandardId = standardIds[0]!;
      const standardRuleSet = await store.getCompleteStandard(primaryStandardId);

      // 无论单标或多标，统一调用 resolveCompositeSlice 获得带追溯元数据的合成切片
      let compositeSlice = await store.resolveCompositeSlice(standardIds, primaryGrade);

      // 若以 primaryGrade 未命中且 options?.forcedGradeKey 存在且不同，尝试二次检索
      if (!compositeSlice && options?.forcedGradeKey && options.forcedGradeKey !== primaryGrade) {
        compositeSlice = await store.resolveCompositeSlice(standardIds, options.forcedGradeKey);
      }

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

      // 严格质量红线：若参与标准中未能完整装配切片，杜绝隐式回退丢标，显式阻断
      if (!compositeSlice) {
        const targetGradeStr = options?.forcedGradeKey || primaryGrade;
        const msg = `标准 [${standardIds.join('、')}] 中未能完整检索到牌号规格切片 [${targetGradeStr}]，请检查标准代号或在上方指定等效标准与牌号`;
        logger.error('WORKFLOW', `[Node 3: Retrieve Standard] ${msg}`);
        collector.addTrace('WORKFLOW', 'error', `[节点 3] ${msg}`);
        return {
          error: `Retrieve Standard Node Failed: ${msg}`,
          traces: collector.getTraces(),
          workflowStatus: 'failed',
        };
      }

      logger.info(
        'WORKFLOW',
        `[Node 3: Retrieve Standard] 成功装载规格切片 [${compositeSlice.spec_key}] (包含 ${compositeSlice.evaluation_rules.length} 项检验规则)`
      );

      return {
        standardRuleSet,
        matchedSlice: compositeSlice,
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
