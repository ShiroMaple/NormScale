import { EvaluationRule } from '../schemas/standard.schema';
import { EvaluationContext } from './numeric-evaluator';

/**
 * 评估规则的前置触发条件 (Trigger Condition)
 * 例如: "ctx.header.dimensions.wall_thickness_mm >= 1.7"
 */
export function isRuleTriggered(rule: EvaluationRule, context: EvaluationContext): boolean {
  if (!rule.trigger_condition) {
    return true; // 没有前置条件，默认激活
  }

  const cond = rule.trigger_condition.trim();

  // 支持简单的逻辑组合 (&&)
  const subConditions = cond.split('&&').map(s => s.trim());

  for (const sub of subConditions) {
    if (!evalSingleCondition(sub, context)) {
      return false;
    }
  }

  return true;
}

function evalSingleCondition(expr: string, context: EvaluationContext): boolean {
  // 正则匹配形如: ctx.header.dimensions.wall_thickness_mm >= 1.7
  const match = expr.match(/(ctx\.header\.dimensions\.\w+|ctx\.header\.\w+|S|D|L)\s*(<=|<|>=|>|==|!=)\s*([0-9.]+|'[^']+'|"[^"]+")/);
  if (!match) {
    return true; // 无法解析的条件默认激活
  }

  const left = match[1]!;
  const op = match[2]!;
  const right = match[3]!;

  let leftVal: number | string | undefined;

  if (left === 'S') {
    leftVal = context.header.dimensions?.wall_thickness_mm;
  } else if (left === 'D') {
    leftVal = context.header.dimensions?.outer_diameter_mm;
  } else if (left === 'L') {
    leftVal = context.header.dimensions?.length_mm;
  } else if (left.startsWith('ctx.header.dimensions.')) {
    const key = left.replace('ctx.header.dimensions.', '');
    const dims = context.header.dimensions as Record<string, number | undefined> | undefined;
    leftVal = dims?.[key];
  } else if (left.startsWith('ctx.header.')) {
    const key = left.replace('ctx.header.', '');
    const headerObj = context.header as Record<string, unknown>;
    const val = headerObj[key];
    if (typeof val === 'number' || typeof val === 'string') {
      leftVal = val;
    }
  }

  if (leftVal === undefined || leftVal === null) {
    return false; // 如果质保书缺少判断该条件所需的几何尺寸，条件视为不满足/未激活
  }

  const rightVal = right.startsWith("'") || right.startsWith('"')
    ? right.slice(1, -1)
    : Number(right);

  if (typeof leftVal === 'number' && typeof rightVal === 'number') {
    switch (op) {
      case '<=': return leftVal <= rightVal;
      case '<':  return leftVal < rightVal;
      case '>=': return leftVal >= rightVal;
      case '>':  return leftVal > rightVal;
      case '==': return leftVal === rightVal;
      case '!=': return leftVal !== rightVal;
    }
  }

  if (typeof leftVal === 'string' && typeof rightVal === 'string') {
    if (op === '==') return leftVal === rightVal;
    if (op === '!=') return leftVal !== rightVal;
  }

  return false;
}
