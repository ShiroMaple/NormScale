import { interrupt } from '@langchain/langgraph';
import { QualityAuditState, HitlInterruptContext, HumanCorrectionInput } from '../state.interface';
import { getSafeCollector } from '../trace-helper';
import { logger } from '../../logger';

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

    logger.info(
      'WORKFLOW',
      `[Node 6: Human Review] 接收到质检员人工修正恢复提交 (修正牌号: [${userResponse?.corrected_grade || '未修改'}])`
    );
    if (userResponse) {
      collector.addTrace(
        'WORKFLOW',
        'info',
        `[人工审核恢复] 质检员提交修正: 牌号 [${userResponse.corrected_grade || '保持原样'}]`
      );
    }

    return {
      humanCorrection: userResponse,
      traces: collector.getTraces(),
      workflowStatus: 'normalizing',
    };
  };
}
