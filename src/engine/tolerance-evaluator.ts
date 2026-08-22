import { DimensionToleranceTable } from '../schemas/standard.schema';
import BigNumber from 'bignumber.js';

export interface ToleranceEvaluationParams {
  dimensionProperty: 'outer_diameter' | 'wall_thickness';
  nominalValue: number;
  measuredValue: number;
  process?: string;
  deliveryMode?: 'nominal_wall' | 'min_wall';
  outerDiameter?: number;
  table: DimensionToleranceTable;
}

export interface ToleranceCheckResult {
  isPass: boolean;
  minAllowed: number;
  maxAllowed: number;
  plusToleranceText: string;
  minusToleranceText: string;
  deviation: number;
  message: string;
}

/**
 * 根据标准公差阶梯表匹配适用的允许偏差规则并计算理论上下限
 */
export function evaluateDimensionTolerance(
  params: ToleranceEvaluationParams
): ToleranceCheckResult {
  const { dimensionProperty, nominalValue, measuredValue, process = 'cold_drawn', deliveryMode = 'min_wall', outerDiameter, table } = params;

  // 规范化制造工艺
  const normProcess = (process.includes('hot') || process.includes('extrusion'))
    ? (process.includes('extrusion') ? 'hot_extrusion' : 'hot_rolled')
    : 'cold_drawn';

  // 筛选候选规则
  const matchedRule = table.rules.find((r) => {
    if (r.dimension_property !== dimensionProperty) return false;
    if (r.delivery_mode !== deliveryMode) return false;
    if (r.process !== 'all' && r.process !== normProcess) return false;

    // 检查外径限制条件 (如 D <= 38mm)
    if (r.outer_diameter_limit !== undefined && outerDiameter !== undefined) {
      if (r.note?.includes('<=') && outerDiameter > r.outer_diameter_limit) return false;
      if (r.note?.includes('>') && outerDiameter <= r.outer_diameter_limit) return false;
    }

    // 检查尺寸区间 (range_min < nominalValue <= range_max)
    if (r.range_min !== undefined && nominalValue <= r.range_min) return false;
    if (r.range_max !== undefined && nominalValue > r.range_max) return false;

    return true;
  });

  if (!matchedRule) {
    // 默认宽容兜底 (若未精确命中阶梯)
    return {
      isPass: true,
      minAllowed: nominalValue * 0.9,
      maxAllowed: nominalValue * 1.1,
      plusToleranceText: '+10%',
      minusToleranceText: '-10%',
      deviation: 0,
      message: '未命中专属尺寸公差阶梯，采用通用标准范围',
    };
  }

  // 计算上限
  let plusVal = matchedRule.plus_tolerance_value;
  if (matchedRule.plus_tolerance_is_percent) {
    plusVal = (nominalValue * plusVal) / 100;
  }
  const maxAllowed = Number(new BigNumber(nominalValue).plus(plusVal).toFixed(4));

  // 计算下限
  let minusVal = matchedRule.minus_tolerance_value;
  if (matchedRule.minus_tolerance_is_percent) {
    minusVal = (nominalValue * minusVal) / 100;
  }
  // minusVal 本身带负号或为 0
  const minAllowed = Number(new BigNumber(nominalValue).plus(minusVal).toFixed(4));

  const valBn = new BigNumber(measuredValue);
  const minBn = new BigNumber(minAllowed);
  const maxBn = new BigNumber(maxAllowed);

  let isPass = true;
  let deviation = 0;
  let message = '尺寸在允许公差范围内';

  if (valBn.isLessThan(minBn)) {
    isPass = false;
    deviation = minBn.minus(valBn).toNumber();
    message = `尺寸实测值 ${measuredValue}mm 低于允许下限 ${minAllowed}mm (偏小 -${deviation}mm)`;
  } else if (valBn.isGreaterThan(maxBn)) {
    isPass = false;
    deviation = valBn.minus(maxBn).toNumber();
    message = `尺寸实测值 ${measuredValue}mm 超过允许上限 ${maxAllowed}mm (超差 +${deviation}mm)`;
  }

  const plusText = matchedRule.plus_tolerance_is_percent
    ? `+${matchedRule.plus_tolerance_value}%`
    : `+${matchedRule.plus_tolerance_value}mm`;
  const minusText = matchedRule.minus_tolerance_is_percent
    ? `${matchedRule.minus_tolerance_value}%`
    : `${matchedRule.minus_tolerance_value}mm`;

  return {
    isPass,
    minAllowed,
    maxAllowed,
    plusToleranceText: plusText,
    minusToleranceText: minusText,
    deviation,
    message,
  };
}
