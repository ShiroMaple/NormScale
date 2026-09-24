import { RASERule, RuleGroup } from '../schemas/standard.schema';

/**
 * 规则归组预处理上下文
 */
export interface GroupedRulesContext {
  /** 无 group 的独立原子规则，保持原有单条求值流水线 */
  singleRules: RASERule[];
  /** 有 group 的规则集，按 group.id 聚合成组 */
  groupedRules: Map<string, {
    groupMeta: RuleGroup;
    rules: RASERule[];
  }>;
}

/**
 * 规则预处理与归组分发器
 */
export class RuleGrouper {
  /**
   * 将激活的原子规则流拆分为独立规则清单与聚合逻辑组
   * @param activeRules 当前 MTC 上下文激活的全部规则
   */
  public static partition(activeRules: RASERule[]): GroupedRulesContext {
    const singleRules: RASERule[] = [];
    const groupedRules = new Map<string, { groupMeta: RuleGroup; rules: RASERule[] }>();

    for (const rule of activeRules) {
      if (!rule.group || !rule.group.id) {
        singleRules.push(rule);
        continue;
      }

      const groupId = rule.group.id;
      const existing = groupedRules.get(groupId);

      if (!existing) {
        const meta: RuleGroup = {
          id: groupId,
          op: rule.group.op,
          semantic_code: rule.group.semantic_code,
          name: rule.group.name || groupId,
          min_pass: rule.group.min_pass ?? (rule.group.op === 'OR' ? 1 : undefined),
        };
        groupedRules.set(groupId, {
          groupMeta: meta,
          rules: [rule],
        });
      } else {
        // 若后续规则携带更详细的 name 或 semantic_code 则就地丰富
        if (rule.group.name && !existing.groupMeta.name) {
          existing.groupMeta.name = rule.group.name;
        }
        if (rule.group.semantic_code && !existing.groupMeta.semantic_code) {
          existing.groupMeta.semantic_code = rule.group.semantic_code;
        }
        existing.rules.push(rule);
      }
    }

    return { singleRules, groupedRules };
  }
}
