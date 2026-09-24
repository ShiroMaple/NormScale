import { RASERule, RuleGroup } from '../schemas/standard.schema';
import { RuleEvaluationItemResult } from '../schemas/report.schema';

export type SubRuleStatus = 'PASS' | 'FAIL' | 'SKIPPED' | 'MISSING';

export interface EvaluatedSubRule {
  rule_id: string;
  data_element_id: string;
  clause_ref: string;
  conformance_level: string;
  status: SubRuleStatus;
  actual_value?: unknown;
  threshold?: string;
  is_suppressed: boolean;
  message: string;
  /** 单次计算产物，防止外部二次调用 evaluateSingleRule 产生性能与状态损耗 */
  raw_item_result: RuleEvaluationItemResult;
}

export interface GroupEvaluationResult {
  group_id: string;
  semantic_code?: string;
  group_name?: string;
  op: 'OR' | 'AND';
  status: 'PASS' | 'PASS_WITH_WARNING' | 'FAIL';
  min_pass: number;
  pass_count: number;
  fail_count: number;
  missing_count: number;
  evaluated_rules: EvaluatedSubRule[];
  summary: string;
  is_blocking: boolean;
}

export class RuleGroupEvaluator {
  /**
   * 执行逻辑组评定
   * @param groupMeta 规则组元数据
   * @param rules 组内子规则
   * @param evaluatorDelegate 单条原子规则求值委托
   */
  public static evaluate(
    groupMeta: RuleGroup,
    rules: RASERule[],
    evaluatorDelegate: (rule: RASERule) => RuleEvaluationItemResult
  ): GroupEvaluationResult {
    const evaluated: EvaluatedSubRule[] = [];
    let passCount = 0;
    let failCount = 0;
    let missingCount = 0;

    // 1. 遍历子规则执行原子评定（整个生命周期仅求值 1 次）
    for (const rule of rules) {
      const res = evaluatorDelegate(rule);
      const status = (res.status as SubRuleStatus) || 'MISSING';

      if (status === 'PASS') passCount++;
      else if (status === 'FAIL') failCount++;
      else if (status === 'MISSING') missingCount++;

      const dataElementId = rule.selection?.data_element_id || (rule as any).property_key || rule.rule_id;
      const clauseRef = rule.clause_ref || '';
      const conformanceLevel = rule.conformance_level || (rule as any).requirement_level || 'MANDATORY';

      evaluated.push({
        rule_id: rule.rule_id,
        data_element_id: dataElementId,
        clause_ref: clauseRef,
        conformance_level: conformanceLevel,
        status,
        actual_value: res.actual_value_text !== '未报送' ? res.actual_value_text : undefined,
        threshold: res.standard_requirement_text,
        is_suppressed: false,
        message: res.message,
        raw_item_result: res,
      });
    }

    const minPass = groupMeta.min_pass ?? (groupMeta.op === 'OR' ? 1 : rules.length);

    // 2. OR 逻辑组判定分支
    if (groupMeta.op === 'OR') {
      const hasPassedMin = passCount >= minPass;

      if (hasPassedMin) {
        // 就地抑制：将组内所有缺失 (MISSING) 或跳过 (SKIPPED) 项打标抑制
        for (const sub of evaluated) {
          if (sub.status === 'MISSING' || sub.status === 'SKIPPED') {
            sub.is_suppressed = true;
          }
        }

        // 宽严相济：有通过项也有超标项时，判定为 PASS_WITH_WARNING
        if (failCount > 0) {
          const failedItems = evaluated.filter(r => r.status === 'FAIL');
          const passedItems = evaluated.filter(r => r.status === 'PASS');
          const summary = `规则组 [${groupMeta.name || groupMeta.id}] 依据 [${passedItems.map(p => `${p.data_element_id}: ${p.actual_value}`).join(', ')}] 满足要求；但检测到 [${failedItems.map(f => `${f.data_element_id}: ${f.actual_value} 超标`).join('; ')}]，记录审计警示备查。`;

          return {
            group_id: groupMeta.id,
            semantic_code: groupMeta.semantic_code,
            group_name: groupMeta.name,
            op: 'OR',
            status: 'PASS_WITH_WARNING',
            min_pass: minPass,
            pass_count: passCount,
            fail_count: failCount,
            missing_count: missingCount,
            evaluated_rules: evaluated,
            summary,
            is_blocking: false,
          };
        }

        // 全格放行
        const passedItems = evaluated.filter(r => r.status === 'PASS');
        const summary = `规则组 [${groupMeta.name || groupMeta.id}] 满足判定要求（实测合格项：${passedItems.map(p => `${p.data_element_id}: ${p.actual_value}`).join(', ')}），已豁免其余未报送替代项。`;

        return {
          group_id: groupMeta.id,
          semantic_code: groupMeta.semantic_code,
          group_name: groupMeta.name,
          op: 'OR',
          status: 'PASS',
          min_pass: minPass,
          pass_count: passCount,
          fail_count: failCount,
          missing_count: missingCount,
          evaluated_rules: evaluated,
          summary,
          is_blocking: false,
        };
      }

      // 未达标：合格数不足 minPass
      const isMandatory = rules.some(r => r.conformance_level === 'MANDATORY');
      const failedItems = evaluated.filter(r => r.status === 'FAIL');
      const missingItems = evaluated.filter(r => r.status === 'MISSING');

      let summary = `规则组 [${groupMeta.name || groupMeta.id}] 判定不合格（要求满足 ${minPass} 项，实测通过 ${passCount} 项）：`;
      if (failedItems.length > 0) {
        summary += ` 指标超标 [${failedItems.map(f => `${f.data_element_id}: ${f.actual_value}`).join('; ')}]；`;
      }
      if (missingItems.length > 0) {
        summary += ` 候选指标缺失 [${missingItems.map(m => m.data_element_id).join(', ')}] 未检。`;
      }

      return {
        group_id: groupMeta.id,
        semantic_code: groupMeta.semantic_code,
        group_name: groupMeta.name,
        op: 'OR',
        status: 'FAIL',
        min_pass: minPass,
        pass_count: passCount,
        fail_count: failCount,
        missing_count: missingCount,
        evaluated_rules: evaluated,
        summary: summary.trim(),
        is_blocking: isMandatory,
      };
    }

    // 3. AND 逻辑组判定分支
    const isAllPass = passCount === rules.length;
    const isAndFail = failCount > 0 || missingCount > 0;

    return {
      group_id: groupMeta.id,
      semantic_code: groupMeta.semantic_code,
      group_name: groupMeta.name,
      op: 'AND',
      status: isAllPass ? 'PASS' : 'FAIL',
      min_pass: rules.length,
      pass_count: passCount,
      fail_count: failCount,
      missing_count: missingCount,
      evaluated_rules: evaluated,
      summary: isAllPass
        ? `规则组 [${groupMeta.name || groupMeta.id}] 全部 ${rules.length} 项要求均检验合格`
        : `规则组 [${groupMeta.name || groupMeta.id}] 未满足全部要求：合格 ${passCount}/${rules.length}`,
      is_blocking: isAndFail,
    };
  }
}
