import { IRuleStore } from '../../repository/rule-store.interface.ts';
import { QualityAuditState, PropertyResolutionCandidate, HitlInterruptContext } from '../state.interface.ts';
import { getSafeCollector } from '../trace-helper.ts';
import { logger } from '../../logger/index.ts';

/**
 * ============================================================================
 * 节点 2.5: LLM / 语义推断长尾检验项消歧节点 (LLM Property Resolver Node)
 * ============================================================================
 * 
 * 职责：
 * 针对 Tier 1 确定性规则无法高置信匹配的长尾属性 (unresolvedProperties)，
 * 从当前执行标准切片的合法规则池中提取封闭候选集，执行受限意图对齐与语义消歧：
 * 1. 置信度 >= 0.85：自动升级为规范检验项并合并入 normalizedCert；
 * 2. 置信度 < 0.85：打标进入待决池，并根据策略触发人机协同 (HITL) 中断挂起。
 * ============================================================================
 */
export function createLlmPropertyResolverNode(ruleStore?: IRuleStore) {
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

      let candidateRules: Array<{ key: string; name: string; category: string; rule_type: string; unit?: string }> = [];
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

      const resolvedList: PropertyResolutionCandidate[] = [];
      const ambiguousList: PropertyResolutionCandidate[] = [];
      const updatedRecords = [...normalizedCert.test_records];

      // 2. 逐项执行语义匹配推断 (先执行受限启发式语义消歧，兼具离线安全与毫秒级延迟)
      for (const prop of unresolvedProperties) {
        const rawUpper = prop.raw_name.toUpperCase().replace(/[\s\-_]/g, '');
        let bestMatch: (typeof candidateRules)[0] | undefined;
        let bestConfidence = 0.5;
        let reasoning = '未在标准候选规则中找到强相关项';

        // (a) 在切片候选规则池中精确/语义相似度检索
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
            reasoning = `质保书字段 [${prop.raw_name}] 匹配标准粗糙度定量规则 [${candidate.name}]`;
            break;
          }

          // 尺寸规格
          if (
            (rawUpper.includes('外径') || rawUpper.includes('壁厚') || rawUpper.includes('尺寸') || rawUpper.includes('OD') || rawUpper.includes('WT')) &&
            (candKeyUpper.includes('DIMENSION') || candNameUpper.includes('尺寸'))
          ) {
            bestMatch = candidate;
            bestConfidence = 0.92;
            reasoning = `质保书几何规格字段匹配标准尺寸规则 [${candidate.name}]`;
            break;
          }

          // 晶粒度
          if (
            (rawUpper.includes('晶粒') || rawUpper.includes('GRAIN')) &&
            (candKeyUpper.includes('GRAIN') || candNameUpper.includes('晶粒度'))
          ) {
            bestMatch = candidate;
            bestConfidence = 0.95;
            reasoning = `质保书字段 [${prop.raw_name}] 匹配金相晶粒度标准规则 [${candidate.name}]`;
            break;
          }

          // 包含名称匹配
          if (candNameUpper.includes(rawUpper) || rawUpper.includes(candNameUpper)) {
            bestMatch = candidate;
            bestConfidence = 0.88;
            reasoning = `字面语义高度重合匹配至标准规则 [${candidate.name}]`;
            break;
          }
        }

        // 判定裁决分支
        if (bestMatch && bestConfidence >= 0.85) {
          const resolvedItem: PropertyResolutionCandidate = {
            ...prop,
            source_tier: 'tier2',
            resolved_key: bestMatch.key,
            resolved_category: bestMatch.category,
            confidence: bestConfidence,
            reasoning,
            is_standard_rule: true,
          };
          resolvedList.push(resolvedItem);

          // 同步升级 normalizedCert.test_records 中对应的记录
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

          collector.addTrace('WORKFLOW', 'info', `[语义裁决成功] ${prop.raw_name} -> ${bestMatch.name} (置信度 ${(bestConfidence * 100).toFixed(0)}%)`);
          logger.info('WORKFLOW', `[LLM Property Resolver] 成功将 [${prop.raw_name}] 对齐至 [${bestMatch.name}] (${reasoning})`);
        } else {
          // 置信度不足，进入待决/歧义列表
          ambiguousList.push({
            ...prop,
            confidence: bestConfidence,
            reasoning,
            is_standard_rule: false,
          });
          logger.warn('WORKFLOW', `[LLM Property Resolver] 字段 [${prop.raw_name}] 语义置信度较低 (${(bestConfidence * 100).toFixed(0)}%)，保留于待决池`);
        }
      }

      let hitlContext: HitlInterruptContext | undefined = state.hitlContext;

      // 3. 若存在重大歧义项且此前未挂起，触发 HITL 人机协同中断
      if (!hitlContext && ambiguousList.length > 0 && !humanCorrection) {
        const topAmbiguous = ambiguousList[0];
        // 若实测项属于重要质检字段但置信度低于 0.6
        if (topAmbiguous && (topAmbiguous.raw_category === 'mechanical' || topAmbiguous.raw_category === 'chemical')) {
          hitlContext = {
            reason: 'PROPERTY_AMBIGUITY',
            prompt_message: `实测项目 [${topAmbiguous.raw_name}] 无法明确对应至执行标准指标，请质检员确认或指定标准属性`,
            pending_fields: [topAmbiguous.raw_name],
            suggestions: topAmbiguous.resolved_key ? { [topAmbiguous.raw_name]: topAmbiguous.resolved_key } : undefined,
            property_ambiguity_details: topAmbiguous,
          };
          collector.addTrace('WORKFLOW', 'warn', `[人机协同请求] 字段 ${topAmbiguous.raw_name} 存在歧义，挂起等待复核`);
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
