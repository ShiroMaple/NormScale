import { ICertificateExtractor } from '../../extractor/extractor.interface.ts';
import { MockCertificateExtractor } from '../../extractor/mock-extractor.ts';
import { QualityAuditState } from '../state.interface.ts';
import { getSafeCollector } from '../trace-helper.ts';
import { logger } from '../../logger/index.ts';

/**
 * ============================================================================
 * 节点 1: 质保书数据抽取节点 (Extract Node)
 * ============================================================================
 */
export function createExtractNode(extractor?: ICertificateExtractor) {
  const activeExtractor = extractor || new MockCertificateExtractor();

  return async function extractNode(state: QualityAuditState): Promise<Partial<QualityAuditState>> {
    const { input } = state;
    const collector = getSafeCollector(state);

    logger.info('WORKFLOW', `[Node 1: Extract] 启动文档抽取，当前适配器: [${activeExtractor.providerName}]`);
    collector.addTrace('WORKFLOW', 'info', `[节点 1] 启动数据抽取 (适配器: ${activeExtractor.providerName})`);

    try {
      const rawPayload = await activeExtractor.extract(input, {
        timeoutMs: 45000,
        enableOcrConfidence: true,
      });

      logger.info('WORKFLOW', `[Node 1: Extract] 抽取完成，声明牌号 [${rawPayload.header?.declared_grade || '未标明'}]，共 ${rawPayload.test_records?.length || 0} 条检验项`);
      collector.addTrace('WORKFLOW', 'info', `[节点 1] 抽取完成: 声明牌号 [${rawPayload.header?.declared_grade || '未标明'}]，共 ${rawPayload.test_records?.length || 0} 项指标`);

      return {
        rawPayload,
        traces: collector.getTraces(),
        workflowStatus: 'normalizing',
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('WORKFLOW', `[Node 1: Extract] 抽取阶段发生异常`, err);
      collector.addTrace('WORKFLOW', 'error', `[节点 1] 抽取失败: ${errMsg}`);
      return {
        error: `Extract Node Failed: ${errMsg}`,
        traces: collector.getTraces(),
        workflowStatus: 'failed',
      };
    }
  };
}
