import { CertificateNormalizer } from '../../normalizer/certificate-normalizer.ts';
import { IRuleStore } from '../../repository/rule-store.interface.ts';
import { QualityAuditState, HitlInterruptContext } from '../state.interface.ts';
import { getSafeCollector } from '../trace-helper.ts';
import { logger } from '../../logger/index.ts';

/**
 * ============================================================================
 * 节点 2: 质保书确定性归一化清洗节点 (Normalize Node)
 * ============================================================================
 */
export function createNormalizeNode(ruleStore?: IRuleStore) {
  const normalizer = new CertificateNormalizer(ruleStore);

  return async function normalizeNode(state: QualityAuditState): Promise<Partial<QualityAuditState>> {
    const { rawPayload, humanCorrection, options } = state;
    const collector = getSafeCollector(state);

    if (!rawPayload) {
      return {
        error: 'Normalize Node Failed: Missing rawPayload',
        workflowStatus: 'failed',
      };
    }

    logger.info('WORKFLOW', `[Node 2: Normalize] 启动确定性归一化清洗与牌号消歧...`);
    collector.addTrace('WORKFLOW', 'info', `[节点 2] 启动确定性清洗与消歧流水线`);

    try {
      let payloadToClean = rawPayload;
      if (humanCorrection) {
        payloadToClean = JSON.parse(JSON.stringify(rawPayload));
        if (humanCorrection.corrected_grade && payloadToClean.header) {
          logger.info('WORKFLOW', `[Node 2: Normalize] 应用质检员人工修正牌号: [${humanCorrection.corrected_grade}]`);
          collector.addTrace('WORKFLOW', 'info', `[人工介入生效] 覆盖声明牌号为: [${humanCorrection.corrected_grade}]`);
          payloadToClean.header.declared_grade = humanCorrection.corrected_grade;
        }
        if (humanCorrection.corrected_test_records && payloadToClean.test_records) {
          for (const rec of payloadToClean.test_records) {
            if (rec.raw_property_name && humanCorrection.corrected_test_records[rec.raw_property_name] !== undefined) {
              rec.raw_value = humanCorrection.corrected_test_records[rec.raw_property_name];
              logger.info('WORKFLOW', `[Node 2: Normalize] 应用人工修正字段 [${rec.raw_property_name}] = ${String(rec.raw_value)}`);
            }
          }
        }
      }

      const { certificate, audit_log } = await normalizer.normalize(payloadToClean, { collector });

      logger.info(
        'WORKFLOW',
        `[Node 2: Normalize] 清洗完成，主牌号 [${certificate.header.declared_grade}]，共 ${certificate.test_records.length} 项标准化指标`
      );

      let hitlContext: HitlInterruptContext | undefined;
      const minConf = options?.minConfidenceThreshold ?? 0.8;
      const isGradeMatched = audit_log.grade_normalization.is_matched;

      if (!isGradeMatched && !humanCorrection?.corrected_grade) {
        hitlContext = {
          reason: 'UNKNOWN_GRADE',
          prompt_message: `材料牌号 [${payloadToClean.header?.declared_grade || '未知'}] 未在标准库中收录，请质检员人工确认或指定国家标准牌号`,
          pending_fields: ['declared_grade'],
          suggestions: { default: '06Cr19Ni10' },
        };
      } else if (payloadToClean.overall_confidence !== undefined && payloadToClean.overall_confidence < minConf && !humanCorrection) {
        hitlContext = {
          reason: 'LOW_CONFIDENCE',
          prompt_message: `质保书数据抽取置信度为 ${(payloadToClean.overall_confidence * 100).toFixed(1)}% (低于安全阈值 ${(minConf * 100).toFixed(0)}%)，请人工核验`,
        };
      }

      return {
        normalizedCert: certificate,
        normalizationAudit: audit_log,
        hitlContext,
        traces: collector.getTraces(),
        workflowStatus: hitlContext ? 'awaiting_human_review' : 'retrieving_standard',
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('WORKFLOW', `[Node 2: Normalize] 归一化清洗发生异常`, err);
      collector.addTrace('WORKFLOW', 'error', `[节点 2] 归一化清洗失败: ${errMsg}`);
      return {
        error: `Normalize Node Failed: ${errMsg}`,
        traces: collector.getTraces(),
        workflowStatus: 'failed',
      };
    }
  };
}
