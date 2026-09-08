import { ICertificateExtractor } from '../../extractor/extractor.interface.ts';
import { QualityAuditState } from '../state.interface.ts';
import { getSafeCollector } from '../trace-helper.ts';
import { logger } from '../../logger/index.ts';

/**
 * ============================================================================
 * 节点 1: 质保书数据抽取节点 (Extract Node)
 * ============================================================================
 */
export function createExtractNode(extractor?: ICertificateExtractor) {
  const activeExtractor = extractor;

  return async function extractNode(state: QualityAuditState): Promise<Partial<QualityAuditState>> {
    const { input } = state;
    const collector = getSafeCollector(state);

    logger.info('WORKFLOW', `[Node 1: Extract] 启动文档抽取处理，当前抽取适配器: [${activeExtractor?.providerName || '未配置(仅支持结构化直通)'}]`);
    collector.addTrace('WORKFLOW', 'info', `[节点 1] 启动数据抽取 (适配器: ${activeExtractor?.providerName || '结构化直通'})`);

    // 若输入已为结构化对象或 JSON 字符串，直接短路直通，避免二次 Mock 抽取损耗
    if (typeof input === 'object' && input !== null && !(input instanceof Uint8Array) && !(input instanceof Buffer)) {
      const obj = input as any;
      if (obj.header || obj.test_records) {
        logger.info('WORKFLOW', `[Node 1: Extract] 输入已为结构化对象，短路直通归一化节点`);
        collector.addTrace('WORKFLOW', 'info', `[节点 1] 检测到结构化输入，直接直通`);
        return {
          rawPayload: obj,
          traces: collector.getTraces(),
          workflowStatus: 'normalizing',
        };
      }
    } else if (typeof input === 'string' && input.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(input);
        if (parsed && typeof parsed === 'object' && (parsed.header || parsed.test_records)) {
          logger.info('WORKFLOW', `[Node 1: Extract] 输入已为结构化 JSON 字符串，短路直通归一化节点`);
          collector.addTrace('WORKFLOW', 'info', `[节点 1] 解析结构化 JSON 成功，直接直通`);
          return {
            rawPayload: parsed,
            traces: collector.getTraces(),
            workflowStatus: 'normalizing',
          };
        }
      } catch {
        // 非有效 JSON，正常走 extractor
      }
    }

    if (!activeExtractor) {
      const errMsg = '工作流未配置质保书数据抽取器，且输入非结构化数据，拒绝执行伪造抽取';
      logger.error('WORKFLOW', `[Node 1: Extract] ${errMsg}`);
      collector.addTrace('WORKFLOW', 'error', `[节点 1] ${errMsg}`);
      return {
        error: `Extract Node Failed: ${errMsg}`,
        traces: collector.getTraces(),
        workflowStatus: 'failed',
      };
    }

    try {
      const extractorInput = (typeof input === 'object' && !(input instanceof Uint8Array) && !(input instanceof Buffer))
        ? JSON.stringify(input)
        : input;
      const rawPayload = await activeExtractor.extract(extractorInput as string | Buffer, {
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
