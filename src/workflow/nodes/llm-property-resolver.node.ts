import { IRuleStore } from '../../repository/rule-store.interface.ts';
import { QualityAuditState, PropertyResolutionCandidate, HitlInterruptContext, WorkflowTokenUsage } from '../state.interface.ts';
import { getSafeCollector } from '../trace-helper.ts';
import { logger } from '../../logger/index.ts';
import { LlmPropertyResolverService, CandidateRuleItem } from '../services/llm-property-resolver.service.ts';

/**
 * ============================================================================
 * 节点 2.5: LLM / 语义推断长尾检验项消歧节点 (LLM Property Resolver Node)
 * ============================================================================
 * 
 * 职责：
 * 针对 Tier 1 确定性规则无法高置信匹配的长尾属性 (unresolvedProperties)，
 * 从当前执行标准切片的合法规则池中提取封闭候选集，执行受限意图对齐与语义消歧：
 * 1. 优先调用大模型 (OpenAI 兼容协议) 进行受限语义推理与置信度评分；
 * 2. 置信度 >= 0.85：自动升级为规范检验项并合并入 normalizedCert (回流 Tier 1 重算数值)；
 * 3. 置信度 < 0.85：打标进入待决池，并根据策略触发人机协同 (HITL) 中断挂起；
 * 4. 健壮防线：未配置 Key、网络超时或模型报错时，非静默降级至本地启发式规则，并在前端与 Trace 显著打标。
 * ============================================================================
 */
export function createLlmPropertyResolverNode(
  ruleStore?: IRuleStore,
  customService?: LlmPropertyResolverService
) {
  const resolverService = customService || new LlmPropertyResolverService();

  return async function llmPropertyResolverNode(state: QualityAuditState): Promise<Partial<QualityAuditState>> {
    const { unresolvedProperties, normalizedCert, options, humanCorrection } = state;
    const collector = getSafeCollector(state);

    if (!unresolvedProperties || unresolvedProperties.length === 0 || !normalizedCert) {
      return { workflowStatus: 'retrieving_standard' };
    }

    // 若已经经过人工修正恢复，跳过重复消歧
    if (humanCorrection?.corrected_property_keys) {
      return { workflowStatus: 'retrieving_standard' };
    }

    logger.info('WORKFLOW', `[Node 2.5: LLM Property Resolver] 启动长尾检验项语义裁决 (待消歧项: ${unresolvedProperties.length} 个)...`);
    collector.addTrace('WORKFLOW', 'info', `[节点 2.5] 启动长尾指标语义裁决，共 ${unresolvedProperties.length} 项`);

    try {
      // 1. 获取当前标准与牌号对应的候选规则集 (Constrained Candidate Pool)
      const declaredStd = options?.forcedStandardId || normalizedCert.header.declared_standard;
      const declaredGrade = options?.forcedGradeKey || normalizedCert.header.declared_grade;

      let candidateRules: CandidateRuleItem[] = [];
      if (ruleStore && declaredStd && declaredGrade) {
        try {
          const slice = await ruleStore.resolveRuleSlice(declaredStd, declaredGrade);
          if (slice && Array.isArray(slice.evaluation_rules)) {
            candidateRules = slice.evaluation_rules.map(r => ({
              key: r.property_key,
              name: r.display_name,
              category: r.category,
              rule_type: r.rule_type,
              unit: (r.criteria as Record<string, unknown>)?.['unit'] as string | undefined,
            }));
          }
        } catch (sliceErr) {
          logger.warn('WORKFLOW', `[LLM Property Resolver] 获取候选切片失败: ${String(sliceErr)}`);
        }
      }

      let resolvedList: PropertyResolutionCandidate[] = [];
      let ambiguousList: PropertyResolutionCandidate[] = [];
      const updatedRecords = [...normalizedCert.test_records];
      let stepTokenUsage: WorkflowTokenUsage | undefined;
      let usedLlm = false;

      // 2. 尝试调用真实大模型服务进行受限候选集意图裁决
      if (resolverService.hasValidApiKey()) {
        try {
          const llmRes = await resolverService.resolveProperties(
            unresolvedProperties,
            candidateRules,
            declaredStd,
            declaredGrade
          );

          if (llmRes.success && Array.isArray(llmRes.resolutions) && llmRes.resolutions.length > 0) {
            usedLlm = true;
            stepTokenUsage = llmRes.tokenUsage;
            const modelName = llmRes.modelName || resolverService.getModelName();

            for (const prop of unresolvedProperties) {
              const matchedRes = llmRes.resolutions.find(r => r.raw_name === prop.raw_name);
              const targetRule = matchedRes?.resolved_key
                ? candidateRules.find(c => c.key === matchedRes.resolved_key)
                : undefined;

              if (targetRule && matchedRes && matchedRes.confidence >= 0.85) {
                const resolvedItem: PropertyResolutionCandidate = {
                  ...prop,
                  source_tier: 'tier2',
                  resolved_key: targetRule.key,
                  resolved_category: targetRule.category,
                  confidence: matchedRes.confidence,
                  reasoning: matchedRes.reasoning || `通过大模型 (${modelName}) 意图对齐至标准规则 [${targetRule.name}]`,
                  is_standard_rule: true,
                  is_degraded: false,
                  model_name: modelName,
                };
                resolvedList.push(resolvedItem);

                // 同步升级 normalizedCert.test_records 中对应的记录
                const targetIndex = updatedRecords.findIndex(
                  r => r.property_key === prop.raw_name || r.property_key === prop.resolved_key
                );
                if (targetIndex >= 0 && updatedRecords[targetIndex]) {
                  updatedRecords[targetIndex] = {
                    ...updatedRecords[targetIndex]!,
                    property_key: targetRule.key,
                    category: targetRule.category as any,
                  };
                }

                collector.addTrace(
                  'WORKFLOW',
                  'info',
                  `[大模型消歧成功] ${prop.raw_name} -> ${targetRule.name} (置信度 ${(matchedRes.confidence * 100).toFixed(0)}%, 模型: ${modelName})`
                );
                logger.info('WORKFLOW', `[LLM Property Resolver] 大模型 (${modelName}) 成功将 [${prop.raw_name}] 对齐至 [${targetRule.name}]`);
              } else {
                ambiguousList.push({
                  ...prop,
                  confidence: matchedRes?.confidence ?? 0.5,
                  reasoning: matchedRes?.reasoning || '大模型评估当前标准无匹配规则或置信度不足',
                  is_standard_rule: false,
                  is_degraded: false,
                  model_name: modelName,
                });
                logger.warn('WORKFLOW', `[LLM Property Resolver] 字段 [${prop.raw_name}] 大模型置信度较低或未匹配，保留于待决池`);
              }
            }
          } else {
            logger.warn('WORKFLOW', `[LLM Property Resolver] 模型请求返回未成功: ${llmRes.error || '未知原因'}，准备平滑降级`);
          }
        } catch (llmErr: unknown) {
          logger.warn('WORKFLOW', `[LLM Property Resolver] 模型调用出现异常: ${String(llmErr)}，准备平滑降级`);
        }
      }

      // 3. 若大模型未启用、未配置 Key 或执行失败：非静默降级为本地启发式规则
      if (!usedLlm) {
        collector.addTrace(
          'WORKFLOW',
          'warn',
          `[Tier 2 降级告警] 未检测到有效大模型配置或调用失败，已自动非静默降级至本地启发式规则处理`
        );
        logger.warn('WORKFLOW', `[LLM Property Resolver] 非静默降级至本地启发式规则匹配 (Token 消耗为 0)`);

        resolvedList = [];
        ambiguousList = [];

        for (const prop of unresolvedProperties) {
          const rawUpper = prop.raw_name.toUpperCase().replace(/[\s\-_]/g, '');
          let bestMatch: (typeof candidateRules)[0] | undefined;
          let bestConfidence = 0.5;
          let reasoning = '本地启发式未在标准候选规则中找到强相关项';

          for (const candidate of candidateRules) {
            const candKeyUpper = candidate.key.toUpperCase();
            const candNameUpper = candidate.name.toUpperCase();

            // 粗糙度特异性 (含光洁度)
            if (
              (rawUpper.includes('粗糙') || rawUpper.includes('光洁') || rawUpper.includes('ROUGH') || rawUpper.includes('RA') || rawUpper.includes('RZ')) &&
              (candKeyUpper.includes('ROUGH') || candNameUpper.includes('粗糙度') || candNameUpper.includes('光洁度'))
            ) {
              bestMatch = candidate;
              bestConfidence = 0.95;
              reasoning = `[本地规则降级] 质保书字段 [${prop.raw_name}] 匹配标准粗糙度定量规则 [${candidate.name}]`;
              break;
            }

            // 尺寸规格
            if (
              (rawUpper.includes('外径') || rawUpper.includes('壁厚') || rawUpper.includes('尺寸') || rawUpper.includes('OD') || rawUpper.includes('WT')) &&
              (candKeyUpper.includes('DIMENSION') || candNameUpper.includes('尺寸'))
            ) {
              bestMatch = candidate;
              bestConfidence = 0.92;
              reasoning = `[本地规则降级] 质保书几何规格字段匹配标准尺寸规则 [${candidate.name}]`;
              break;
            }

            // 晶粒度
            if (
              (rawUpper.includes('晶粒') || rawUpper.includes('GRAIN')) &&
              (candKeyUpper.includes('GRAIN') || candNameUpper.includes('晶粒度'))
            ) {
              bestMatch = candidate;
              bestConfidence = 0.95;
              reasoning = `[本地规则降级] 质保书字段 [${prop.raw_name}] 匹配金相晶粒度标准规则 [${candidate.name}]`;
              break;
            }

            // 包含名称匹配
            if (candNameUpper.includes(rawUpper) || rawUpper.includes(candNameUpper)) {
              bestMatch = candidate;
              bestConfidence = 0.88;
              reasoning = `[本地规则降级] 字面语义高度重合匹配至标准规则 [${candidate.name}]`;
              break;
            }
          }

          if (bestMatch && bestConfidence >= 0.85) {
            const resolvedItem: PropertyResolutionCandidate = {
              ...prop,
              source_tier: 'tier2',
              resolved_key: bestMatch.key,
              resolved_category: bestMatch.category,
              confidence: bestConfidence,
              reasoning,
              is_standard_rule: true,
              is_degraded: true,
            };
            resolvedList.push(resolvedItem);

            const targetIndex = updatedRecords.findIndex(
              r => r.property_key === prop.raw_name || r.property_key === prop.resolved_key
            );
            if (targetIndex >= 0 && updatedRecords[targetIndex]) {
              updatedRecords[targetIndex] = {
                ...updatedRecords[targetIndex]!,
                property_key: bestMatch.key,
                category: bestMatch.category as any,
              };
            }

            collector.addTrace('WORKFLOW', 'info', `[本地启发式对齐成功] ${prop.raw_name} -> ${bestMatch.name} (降级生效)`);
          } else {
            ambiguousList.push({
              ...prop,
              confidence: bestConfidence,
              reasoning,
              is_standard_rule: false,
              is_degraded: true,
            });
          }
        }
      }

      let hitlContext: HitlInterruptContext | undefined = state.hitlContext;

      // 4. 若存在重大歧义项且此前未挂起，触发 HITL 人机协同中断
      if (!hitlContext && ambiguousList.length > 0 && !humanCorrection) {
        const criticalAmbiguous = ambiguousList.find(
          item => item.raw_category === 'mechanical' || item.raw_category === 'chemical'
        );

        if (criticalAmbiguous && criticalAmbiguous.confidence < 0.6) {
          hitlContext = {
            reason: 'PROPERTY_AMBIGUITY',
            prompt_message: `实测项目 [${criticalAmbiguous.raw_name}] 无法明确对应至执行标准指标，请质检员确认或指定标准属性`,
            pending_fields: [criticalAmbiguous.raw_name],
            suggestions: criticalAmbiguous.resolved_key ? { [criticalAmbiguous.raw_name]: criticalAmbiguous.resolved_key } : undefined,
            property_ambiguity_details: criticalAmbiguous,
          };
          collector.addTrace('WORKFLOW', 'warn', `[人机协同请求] 字段 ${criticalAmbiguous.raw_name} 存在歧义，挂起等待复核`);
        }
      }

      return {
        normalizedCert: {
          ...normalizedCert,
          test_records: updatedRecords,
        },
        resolvedProperties: resolvedList,
        unresolvedProperties: ambiguousList.length > 0 ? ambiguousList : undefined,
        hitlContext,
        tokenUsage: stepTokenUsage,
        traces: collector.getTraces(),
        workflowStatus: hitlContext ? 'awaiting_human_review' : 'retrieving_standard',
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('WORKFLOW', `[LLM Property Resolver] 执行异常失败`, err);
      collector.addTrace('WORKFLOW', 'warn', `[语义消歧异常] 非致命错误: ${errMsg}`);
      return {
        workflowStatus: 'retrieving_standard',
        traces: collector.getTraces(),
      };
    }
  };
}
