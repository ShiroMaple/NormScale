import { CertificateNormalizer } from '../../normalizer/certificate-normalizer.ts';
import { PropertyKeyNormalizer } from '../../normalizer/property-key-normalizer.ts';
import { IRuleStore } from '../../repository/rule-store.interface.ts';
import { QualityAuditState, HitlInterruptContext, PropertyResolutionCandidate } from '../state.interface.ts';
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
        if (humanCorrection.corrected_property_keys && payloadToClean.test_records) {
          for (const rec of payloadToClean.test_records) {
            const rawKey = rec.raw_property_name;
            if (rawKey && humanCorrection.corrected_property_keys[rawKey]) {
              const newKey = humanCorrection.corrected_property_keys[rawKey];
              rec.raw_property_name = newKey;
              logger.info('WORKFLOW', `[Node 2: Normalize] 应用人工修正属性 [${rawKey}] -> [${newKey}]`);
              collector.addTrace('WORKFLOW', 'info', `[人工修正属性] ${rawKey} -> ${newKey}`);
            }
          }
        }
      }

      let certificate: any;
      let audit_log: any;

      // 若 rawPayload 本身已是结构化完整的 CertificateExtract (已含 property_key)，直接直通校验
      const rec0 = payloadToClean?.test_records?.[0] as any;
      if (
        payloadToClean &&
        payloadToClean.header?.declared_grade &&
        Array.isArray(payloadToClean.test_records) &&
        payloadToClean.test_records.length > 0 &&
        rec0?.property_key
      ) {
        certificate = payloadToClean;
        audit_log = {
          timestamp: new Date().toISOString(),
          grade_normalization: { is_matched: true, primary_grade: certificate.header.declared_grade, confidence: 1.0 },
          unit_conversions: [],
          warnings: [],
          overall_confidence: 1.0,
          duration_ms: 0,
        };
      } else {
        const normRes = await normalizer.normalize(payloadToClean, { collector });
        certificate = normRes.certificate;
        audit_log = normRes.audit_log;
      }

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

      // 扫描未命中已知标准规则、标记为沙箱或大类为 other 的长尾属性
      const unresolved: PropertyResolutionCandidate[] = [];
      if (certificate && Array.isArray(certificate.test_records) && !humanCorrection?.corrected_property_keys) {
        for (const rec of certificate.test_records) {
          const rawName = rec.raw_property_name || rec.property_key;
          const norm = PropertyKeyNormalizer.normalize(rawName, rec.category, {
            measuredRaw: rec.measured_value_raw ?? rec.measured_value_num,
            unit: rec.unit,
          });

          // 如果不属于已知标准项，或属于沙箱非标项，或大类为 other
          if (!norm.is_known || norm.is_sandbox || rec.category === 'other') {
            unresolved.push({
              raw_name: rawName,
              raw_value: rec.measured_value_raw ?? rec.measured_value_num,
              raw_category: rec.category,
              unit: rec.unit,
              source_tier: 'tier1',
              resolved_key: norm.property_key,
              resolved_category: norm.category,
              confidence: 0.5,
              reasoning: 'Tier 1 确定性规则未完全收录该长尾项，转入 Tier 2 语义裁决',
              is_standard_rule: false,
            });
          }
        }
      }

      return {
        normalizedCert: certificate,
        normalizationAudit: audit_log,
        hitlContext,
        unresolvedProperties: unresolved.length > 0 ? unresolved : undefined,
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
