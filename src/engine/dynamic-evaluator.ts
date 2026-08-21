import { EvaluationRule, DynamicExpressionCriteria } from '../schemas/standard.schema';
import { TestRecord } from '../schemas/certificate.schema';
import { RuleEvaluationItemResult, AuditStatus } from '../schemas/report.schema';
import { EvaluationContext } from './numeric-evaluator';
import { roundGbt8170 } from './rounding';
import BigNumber from 'bignumber.js';

/**
 * 纯 TypeScript 安全数学表达式求值器 (Safe AST / Recursive Descent Parser)
 * 仅支持算术运算 (+ - * / () min max sqrt) 与安全上下文变量解析，杜绝 eval/new Function
 */
export class SafeMathEvaluator {
  private pos = 0;
  private expr = '';
  private ctx: EvaluationContext;

  constructor(expr: string, ctx: EvaluationContext) {
    this.expr = expr.replace(/\s+/g, '');
    this.pos = 0;
    this.ctx = ctx;
  }

  public evaluate(): number {
    this.pos = 0;
    const result = this.parseExpression();
    if (this.pos < this.expr.length) {
      throw new Error(`Unexpected character '${this.expr[this.pos]}' at position ${this.pos} in '${this.expr}'`);
    }
    return result;
  }

  private parseExpression(): number {
    let result = this.parseTerm();
    while (this.pos < this.expr.length) {
      const char = this.expr[this.pos];
      if (char === '+') {
        this.pos++;
        result += this.parseTerm();
      } else if (char === '-') {
        this.pos++;
        result -= this.parseTerm();
      } else {
        break;
      }
    }
    return result;
  }

  private parseTerm(): number {
    let result = this.parseFactor();
    while (this.pos < this.expr.length) {
      const char = this.expr[this.pos];
      if (char === '*') {
        this.pos++;
        result *= this.parseFactor();
      } else if (char === '/') {
        this.pos++;
        const divisor = this.parseFactor();
        if (divisor === 0) {
          throw new Error('Division by zero in formula');
        }
        result /= divisor;
      } else {
        break;
      }
    }
    return result;
  }

  private parseFactor(): number {
    if (this.pos >= this.expr.length) {
      throw new Error('Unexpected end of expression');
    }

    const char = this.expr[this.pos];
    if (char === undefined) {
      throw new Error('Unexpected end of expression');
    }

    // 处理正负号
    if (char === '+') {
      this.pos++;
      return this.parseFactor();
    }
    if (char === '-') {
      this.pos++;
      return -this.parseFactor();
    }

    // 括号
    if (char === '(') {
      this.pos++;
      const val = this.parseExpression();
      if (this.pos >= this.expr.length || this.expr[this.pos] !== ')') {
        throw new Error("Missing closing parenthesis ')'");
      }
      this.pos++;
      return val;
    }

    // 数字
    if (this.isDigit(char) || char === '.') {
      return this.parseNumber();
    }

    // 标识符 (变量名或内置函数)
    if (this.isAlpha(char) || char === '_') {
      return this.parseIdentifier();
    }

    throw new Error(`Invalid token at position ${this.pos}: '${char}'`);
  }

  private parseNumber(): number {
    const start = this.pos;
    let hasDot = false;
    while (this.pos < this.expr.length) {
      const c = this.expr[this.pos]!;
      if (this.isDigit(c)) {
        this.pos++;
      } else if (c === '.' && !hasDot) {
        hasDot = true;
        this.pos++;
      } else {
        break;
      }
    }
    const numStr = this.expr.slice(start, this.pos);
    const num = Number(numStr);
    if (isNaN(num)) {
      throw new Error(`Invalid numeric literal '${numStr}'`);
    }
    return num;
  }

  private parseIdentifier(): number {
    const start = this.pos;
    while (this.pos < this.expr.length) {
      const c = this.expr[this.pos]!;
      if (this.isAlpha(c) || this.isDigit(c) || c === '_' || c === '.') {
        this.pos++;
      } else {
        break;
      }
    }
    const id = this.expr.slice(start, this.pos);

    // 函数支持 (如 min, max, sqrt)
    if (this.pos < this.expr.length && this.expr[this.pos] === '(') {
      this.pos++; // skip '('
      const args: number[] = [];
      if (this.expr[this.pos] !== ')') {
        args.push(this.parseExpression());
        while (this.pos < this.expr.length && this.expr[this.pos] === ',') {
          this.pos++;
          args.push(this.parseExpression());
        }
      }
      if (this.pos >= this.expr.length || this.expr[this.pos] !== ')') {
        throw new Error(`Missing ')' for function '${id}'`);
      }
      this.pos++; // skip ')'

      if (id === 'min') return Math.min(...args);
      if (id === 'max') return Math.max(...args);
      if (id === 'sqrt') {
        const arg = args[0] ?? 0;
        if (arg < 0) throw new Error('sqrt of negative number');
        return Math.sqrt(arg);
      }
      throw new Error(`Unsupported function '${id}'`);
    }

    // 变量解析
    return this.resolveVariable(id);
  }

  private resolveVariable(varName: string): number {
    // 快捷变量映射 (换热管尺寸常用代号: S 为壁厚，D 为外径，L 为长度)
    if (varName === 'S') {
      const s = this.ctx.header.dimensions?.wall_thickness_mm ?? this.ctx.dimensions['wall_thickness_mm'];
      if (s === undefined) throw new Error(`Missing required dimension 'S' (wall_thickness_mm) for formula evaluation`);
      return s;
    }
    if (varName === 'D') {
      const d = this.ctx.header.dimensions?.outer_diameter_mm ?? this.ctx.dimensions['outer_diameter_mm'];
      if (d === undefined) throw new Error(`Missing required dimension 'D' (outer_diameter_mm) for formula evaluation`);
      return d;
    }
    if (varName === 'L') {
      const l = this.ctx.header.dimensions?.length_mm ?? this.ctx.dimensions['length_mm'];
      if (l === undefined) throw new Error(`Missing required dimension 'L' (length_mm) for formula evaluation`);
      return l;
    }

    // ctx.chemical.X
    if (varName.startsWith('ctx.chemical.')) {
      const elem = varName.replace('ctx.chemical.', '');
      const val = this.ctx.chemical[elem];
      if (val === undefined || isNaN(val)) {
        throw new Error(`Chemical element '${elem}' required in formula '${this.expr}' is not available in certificate`);
      }
      return val;
    }

    // ctx.mechanical.X
    if (varName.startsWith('ctx.mechanical.')) {
      const key = varName.replace('ctx.mechanical.', '');
      const val = this.ctx.mechanical[key];
      if (val === undefined || isNaN(val)) {
        throw new Error(`Mechanical property '${key}' required in formula '${this.expr}' is not available in certificate`);
      }
      return val;
    }

    // ctx.dimensions.X
    if (varName.startsWith('ctx.dimensions.')) {
      const key = varName.replace('ctx.dimensions.', '');
      const val = (this.ctx.header.dimensions as Record<string, number | undefined>)?.[key] ?? this.ctx.dimensions[key];
      if (val === undefined || isNaN(val)) {
        throw new Error(`Dimension '${key}' required in formula is not available in certificate`);
      }
      return val;
    }

    throw new Error(`Unknown variable '${varName}' in formula`);
  }

  private isDigit(c: string | undefined): boolean {
    if (!c) return false;
    return c >= '0' && c <= '9';
  }

  private isAlpha(c: string | undefined): boolean {
    if (!c) return false;
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
  }
}

/**
 * 动态跨字段公式评估器
 */
export function evaluateDynamicExpression(
  rule: EvaluationRule,
  record: TestRecord | undefined,
  context: EvaluationContext
): RuleEvaluationItemResult {
  const criteria = rule.criteria as DynamicExpressionCriteria;
  const displayName = rule.display_name;
  const propKey = rule.property_key;

  // 1. 检查实测记录是否存在
  if (!record || record.measured_value_num === undefined || record.measured_value_num === null) {
    const isMandatory = rule.requirement_level === 'MANDATORY';
    return {
      rule_id: rule.rule_id,
      category: rule.category,
      property_key: propKey,
      display_name: displayName,
      status: isMandatory ? 'MISSING' : 'SKIPPED',
      requirement_level: rule.requirement_level,
      standard_requirement_text: criteria.note || '动态公式要求',
      actual_value_text: record?.measured_value_raw || '未报送',
      measured_value_raw: record?.measured_value_raw,
      measured_value_num: null,
      message: `动态公式检验项【${displayName}】未报送实测值`,
    };
  }

  const rawNum = record.measured_value_num;
  const roundingDecimals = criteria.rounding_decimals ?? 3;
  const roundedVal = roundGbt8170(rawNum, roundingDecimals);

  let calculatedMin: number | null = criteria.min ?? null;
  let calculatedMax: number | null = criteria.max ?? null;
  let formulaUsed = '';

  try {
    if (criteria.formula_min) {
      formulaUsed = criteria.formula_min;
      const evaluator = new SafeMathEvaluator(criteria.formula_min, context);
      calculatedMin = evaluator.evaluate();
      calculatedMin = roundGbt8170(calculatedMin, roundingDecimals);
    }
    if (criteria.formula_max) {
      formulaUsed = criteria.formula_max;
      const evaluator = new SafeMathEvaluator(criteria.formula_max, context);
      calculatedMax = evaluator.evaluate();
      calculatedMax = roundGbt8170(calculatedMax, roundingDecimals);
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      rule_id: rule.rule_id,
      category: rule.category,
      property_key: propKey,
      display_name: displayName,
      status: 'FAIL',
      requirement_level: rule.requirement_level,
      standard_requirement_text: criteria.note || formulaUsed,
      actual_value_text: `${record.measured_value_raw || rawNum}`,
      measured_value_raw: record.measured_value_raw,
      measured_value_num: rawNum,
      rounded_value: roundedVal,
      formula_expression: formulaUsed,
      message: `动态公式计算失败: ${errMsg}`,
    };
  }

  // 比较实测修约值与动态计算出的边界
  const valBn = new BigNumber(roundedVal);
  let isPass = true;
  let deviation: number | null = null;
  let message = `合格: 实测值 ${roundedVal}${criteria.unit || ''} 满足动态公式要求 [${calculatedMin ?? '-inf'}, ${calculatedMax ?? '+inf'}]`;

  if (calculatedMin !== null) {
    const minBn = new BigNumber(calculatedMin);
    if (valBn.isLessThan(minBn)) {
      isPass = false;
      deviation = minBn.minus(valBn).toNumber();
      message = `不合格: 实测值 ${roundedVal}${criteria.unit || ''} 低于动态公式计算下限 ${calculatedMin}${criteria.unit || ''} (计算公式: ${criteria.formula_min}, 差值 -${deviation})`;
    }
  }

  if (isPass && calculatedMax !== null) {
    const maxBn = new BigNumber(calculatedMax);
    if (valBn.isGreaterThan(maxBn)) {
      isPass = false;
      deviation = valBn.minus(maxBn).toNumber();
      message = `不合格: 实测值 ${roundedVal}${criteria.unit || ''} 超出动态公式计算上限 ${calculatedMax}${criteria.unit || ''} (计算公式: ${criteria.formula_max}, 超标 +${deviation})`;
    }
  }

  const status: AuditStatus = isPass ? 'PASS' : 'FAIL';

  return {
    rule_id: rule.rule_id,
    category: rule.category,
    property_key: propKey,
    display_name: displayName,
    status,
    requirement_level: rule.requirement_level,
    standard_requirement_text: criteria.note || `${calculatedMin ?? ''} ~ ${calculatedMax ?? ''} ${criteria.unit || ''}`.trim(),
    actual_value_text: `${record.measured_value_raw || rawNum} (修约: ${roundedVal}${criteria.unit || ''})`,
    measured_value_raw: record.measured_value_raw,
    measured_value_num: rawNum,
    rounded_value: roundedVal,
    rounding_decimals: roundingDecimals,
    standard_min: calculatedMin,
    standard_max: calculatedMax,
    deviation,
    formula_expression: formulaUsed,
    formula_calculated_bound: calculatedMin ?? calculatedMax,
    message,
  };
}
