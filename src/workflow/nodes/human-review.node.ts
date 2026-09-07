import { interrupt } from '@langchain/langgraph';
import { QualityAuditState, HitlInterruptContext, HumanCorrectionInput } from '../state.interface.ts';
import { PropertyKeyNormalizer } from '../../normalizer/property-key-normalizer.ts';
import { getSafeCollector } from '../trace-helper.ts';
import { logger } from '../../logger/index.ts';

/**
 * ============================================================================
 * 节点 6: 人机协同 (HITL) 挂起与干预节点 (Human Review Node)
 * ============================================================================
 */
export function createHumanReviewNode() {
  return async function humanReviewNode(state: QualityAuditState): Promise<Partial<QualityAuditState>> {
    const { hitlContext, humanCorrection } = state;
    const collector = getSafeCollector(state);

    logger.warn(
      'WORKFLOW',
      `[Node 6: Human Review] 触发人机协同中断挂起: 原因 [${hitlContext?.reason || 'MANUAL'}] -> ${hitlContext?.prompt_message || '等待人工审核'}`
    );
    collector.addTrace(
      'WORKFLOW',
      'warn',
      `[人机协同挂起] ${hitlContext?.prompt_message || '触发人工审核断点'}`
    );

    let userResponse: HumanCorrectionInput | undefined = humanCorrection;
    if (!userResponse) {
      userResponse = interrupt<HitlInterruptContext, HumanCorrectionInput>(
        hitlContext || {
          reason: 'MANUAL_REQUEST',
          prompt_message: '质保证书数据需人工核实确认',
        }
      );
    }

    const correctedDetails = userResponse?.corrected_grade
      ? `修正牌号 [${userResponse.corrected_grade}]`
      : (userResponse?.corrected_property_keys ? `修正属性 [${Object.keys(userResponse.corrected_property_keys).join(', ')}]` : '未修改');

    logger.info(
      'WORKFLOW',
      `[Node 6: Human Review] 接收到质检员人工修正恢复提交 (${correctedDetails})`
    );
    if (userResponse) {
      collector.addTrace(
        'WORKFLOW',
        'info',
        `[人工审核恢复] 质检员提交修正: ${correctedDetails}`
      );

      // 知识经验闭环反哺: 质检员确认的别名映射自动异步沉淀至本地规则库，下次直通 Tier 1 Fast-Path
      if (userResponse.corrected_property_keys) {
        for (const [rawKey, targetKey] of Object.entries(userResponse.corrected_property_keys)) {
          if (rawKey && targetKey) {
            PropertyKeyNormalizer.registerLearnedAlias(rawKey, targetKey, undefined, undefined, true);
            logger.info('WORKFLOW', `[知识沉淀] 质检员确认别名 [${rawKey} -> ${targetKey}] 已沉淀至规则库`);
            collector.addTrace('WORKFLOW', 'info', `[知识沉淀] 别名 [${rawKey} -> ${targetKey}] 已沉淀至规则库`);
          }
        }
      }
    }

    return {
      humanCorrection: userResponse,
      traces: collector.getTraces(),
      workflowStatus: 'normalizing',
    };
  };
}
