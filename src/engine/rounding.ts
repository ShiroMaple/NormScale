import BigNumber from 'bignumber.js';

/**
 * GB/T 8170-2008 数值修约规则 (Rules of rounding off for numerical values)
 * 
 * 核心法则 (四舍六入五考虑):
 * 1. 拟舍弃数字的最左一位数字小于 5 时，则舍去 (四舍)。
 * 2. 拟舍弃数字的最左一位数字大于 5 时，则进一 (六入)。
 * 3. 拟舍弃数字的最左一位数字等于 5，且 5 之后有并非全部为 0 的数字时，则进一。
 * 4. 拟舍弃数字的最左一位数字等于 5，而 5 后面无数字或全部为 0 时:
 *    - 若 5 前面的一位数字为奇数，则进一 (凑成偶数);
 *    - 若 5 前面的一位数字为偶数 (包括 0)，则舍去 (保持偶数)。
 * 5. 负数修约: 先将负数绝对值按上述规则修约，然后加上负号。
 */

export function roundGbt8170(value: number | string | BigNumber, decimals: number): number {
  if (decimals < 0) {
    throw new Error(`Rounding decimals must be non-negative, got ${decimals}`);
  }

  const bn = new BigNumber(value);
  if (bn.isNaN() || !bn.isFinite()) {
    throw new Error(`Invalid number for rounding: ${value}`);
  }

  if (bn.isZero()) {
    return 0;
  }

  // 区分正负号
  const isNegative = bn.isNegative();
  const absBn = bn.abs();

  // 转为纯数字字符串 (避免科学计数法)
  const str = absBn.toFixed();
  const [intPart = '0', fracPart = ''] = str.split('.');

  // 如果没有小数位或者小数位数本身就不超过要求保留的位数，无需修约
  if (fracPart.length <= decimals) {
    const result = isNegative ? -Number(str) : Number(str);
    return result;
  }

  // 拼接整数和小数成连续数字串，找到分割点
  // 例如 12.3456，保留 2 位小数:
  // intPart = "12", fracPart = "3456", decimals = 2
  // 保留的有效串: "1234", 拟舍弃串: "56"
  const digitsBeforeFrac = intPart.length;
  const keepLength = digitsBeforeFrac + decimals;
  const fullDigits = intPart + fracPart;

  const keptDigits = fullDigits.slice(0, keepLength);
  const discardedDigits = fullDigits.slice(keepLength);

  const firstDiscarded = parseInt(discardedDigits[0] ?? '0', 10);
  const remainingDiscarded = discardedDigits.slice(1);
  const hasNonZeroAfterFive = remainingDiscarded.split('').some(c => c !== '0');

  const lastKeptDigit = parseInt(keptDigits[keptDigits.length - 1] ?? '0', 10);

  let shouldRoundUp = false;

  if (firstDiscarded < 5) {
    // 1. 拟舍弃最左位 < 5: 舍去
    shouldRoundUp = false;
  } else if (firstDiscarded > 5) {
    // 2. 拟舍弃最左位 > 5: 进一
    shouldRoundUp = true;
  } else {
    // 3. 拟舍弃最左位 == 5
    if (hasNonZeroAfterFive) {
      // 5 之后有非零数字 -> 进一
      shouldRoundUp = true;
    } else {
      // 5 之后无数字或全为 0 -> 奇进偶舍 (五前为奇则进，为偶则舍)
      shouldRoundUp = (lastKeptDigit % 2 !== 0);
    }
  }

  // 重构数值并按单位增量加 1
  const step = new BigNumber(10).pow(-decimals);
  let roundedBn = new BigNumber(
    (decimals === 0 ? keptDigits : keptDigits.slice(0, digitsBeforeFrac) + '.' + keptDigits.slice(digitsBeforeFrac))
  );

  if (shouldRoundUp) {
    roundedBn = roundedBn.plus(step);
  }

  const finalStr = roundedBn.toFixed(decimals);
  const numResult = Number(finalStr);
  return isNegative ? -numResult : numResult;
}

/**
 * 比较数值与极限值 (支持 GB/T 8170 修约值比较法)
 */
export function compareWithLimit(
  actualValue: number,
  standardLimit: number,
  operator: '<=' | '<' | '>=' | '>',
  roundingDecimals?: number
): { isPass: boolean; roundedValue: number; deviation: number } {
  const rounded = (roundingDecimals !== undefined && roundingDecimals !== null)
    ? roundGbt8170(actualValue, roundingDecimals)
    : actualValue;

  const actualBn = new BigNumber(rounded);
  const limitBn = new BigNumber(standardLimit);

  let isPass = false;
  switch (operator) {
    case '<=':
      isPass = actualBn.isLessThanOrEqualTo(limitBn);
      break;
    case '<':
      isPass = actualBn.isLessThan(limitBn);
      break;
    case '>=':
      isPass = actualBn.isGreaterThanOrEqualTo(limitBn);
      break;
    case '>':
      isPass = actualBn.isGreaterThan(limitBn);
      break;
  }

  // deviation: 正数表示超标或偏离方向
  let deviation = 0;
  if (operator === '<=' || operator === '<') {
    // 上限要求: 实际值 - 上限 (大于 0 即超标)
    deviation = actualBn.minus(limitBn).toNumber();
  } else {
    // 下限要求: 下限 - 实际值 (大于 0 即不达标)
    deviation = limitBn.minus(actualBn).toNumber();
  }

  return {
    isPass,
    roundedValue: rounded,
    deviation,
  };
}
