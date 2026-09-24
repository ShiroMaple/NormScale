import { RASERule, RuleGroup, RuleGroupSemanticCode } from '../schemas/standard.schema';

export interface StandardRuleGroupWrapper {
  standardId: string;
  category: 'technical_agreement' | 'industry_standard' | 'national_standard' | 'enterprise_standard';
  priority: number; // 1: Technical Agreement, 2: Industry, 3: Enterprise, 4: National
  groupMeta: RuleGroup;
  rules: RASERule[];
}

export interface ComposedGroupResult {
  groupMeta: RuleGroup;
  rules: RASERule[];
  governingStandardId: string;
  isPinnedByAgreement: boolean;
  arbitrationReason: string;
}

export class MultiStandardGroupComposer {
  /**
   * 跨多标准与技术协议进行规则组确定性合成
   * @param semanticCode 规范语义代号
   * @param groups 参与合成的各来源规则组列表
   */
  public static compose(
    semanticCode: RuleGroupSemanticCode,
    groups: StandardRuleGroupWrapper[]
  ): ComposedGroupResult {
    if (groups.length === 0) {
      throw new Error(`Cannot compose empty groups for semanticCode: ${semanticCode}`);
    }

    // 1. 严格按法理优先级排序 (技术协议 priority=1 最先)
    groups.sort((a, b) => a.priority - b.priority);

    const primaryGroup = groups[0]!;
    const taGroup = groups.find(g => g.category === 'technical_agreement');
    let isPinned = false;
    let arbitrationReason = `依据优先级最高的 [${primaryGroup.standardId}] 确立组逻辑基准`;

    const getElementId = (r: RASERule) => r.selection?.data_element_id || (r as any).property_key || r.rule_id;

    // 2. 检查技术协议是否执行了【严格排他原则 (Strict Pinning)】
    let activeDataElements: Set<string>;
    if (taGroup && groups.length > 1) {
      activeDataElements = new Set(taGroup.rules.map(getElementId));
      const baseStandards = groups.filter(g => g.category !== 'technical_agreement');

      const hasExcluded = baseStandards.some(bg =>
        bg.rules.some(r => !activeDataElements.has(getElementId(r)))
      );

      if (hasExcluded) {
        isPinned = true;
        arbitrationReason = `技术协议 [${taGroup.standardId}] 严格排他锁定检验方式，仅接受 [${Array.from(activeDataElements).join(', ')}]，下位标准替代项自动作废`;
      }
    } else {
      activeDataElements = new Set(groups.flatMap(g => g.rules.map(getElementId)));
    }

    // 3. 对同组内相同 data_element_id 的指标执行“严苛交集 (Strict Intersection)”加严
    const composedRules: RASERule[] = [];
    for (const elemId of activeDataElements) {
      const candidateRules = groups.flatMap(g => g.rules.filter(r => getElementId(r) === elemId));
      if (candidateRules.length === 0) continue;

      const topRule = candidateRules[0]!;
      let strictValue = topRule.requirement.value;

      if (typeof strictValue === 'number') {
        for (const cand of candidateRules) {
          const val = cand.requirement.value;
          if (typeof val === 'number') {
            if (topRule.requirement.operator === '<=' && val < strictValue) {
              strictValue = val;
            } else if (topRule.requirement.operator === '>=' && val > strictValue) {
              strictValue = val;
            }
          }
        }
      }

      composedRules.push({
        ...topRule,
        requirement: {
          ...topRule.requirement,
          value: strictValue,
        },
      });
    }

    // 4. 计算生效门槛：修复 Strictly Pinning 下的 min_pass 误算
    // 裁剪后通过门槛不能超过剩余候选数，且忠实保留原逻辑组门槛，不得误升为 AND
    const originalMinPass = primaryGroup.groupMeta.min_pass ?? 1;
    const effectiveMinPass = Math.min(originalMinPass, activeDataElements.size);

    const composedMeta: RuleGroup = {
      id: `${semanticCode}_COMPOSED`,
      semantic_code: semanticCode,
      op: primaryGroup.groupMeta.op,
      name: primaryGroup.groupMeta.name || semanticCode,
      min_pass: effectiveMinPass,
    };

    return {
      groupMeta: composedMeta,
      rules: composedRules,
      governingStandardId: primaryGroup.standardId,
      isPinnedByAgreement: isPinned,
      arbitrationReason,
    };
  }
}
