/**
 * ============================================================================
 * 实测数值解析工具 (Measured Value Numeric Parser)
 * ============================================================================
 *
 * 从质保书实测文本中提取首个有效数值，治理原则：打标降级、禁止静默删数据。
 * - 复合打包串守卫：含多个指标赋值的整段文本绝不标量化；
 * - 标识符内嵌数字守卫：排除 Rp0.2、HV1、No.2 等指标标识符内的伪数字。
 * ============================================================================
 */

/**
 * 赋值段计数：[:：=] 之后紧跟可选空白与数值的段数
 */
export function countAssignmentSegments(raw: string): number {
  const matches = raw.match(/[:：=]\s*[-+]?\d/g);
  return matches ? matches.length : 0;
}

/**
 * 复合打包串判定（与 parseMeasuredNum 的复合守卫同规则，供打标逻辑复用）
 */
export function isCompositePackagedText(raw: string): boolean {
  return countAssignmentSegments(raw) >= 2;
}

/**
 * 解析实测文本中的首个有效数值。
 *
 * @returns 首个非内嵌于标识符的数字；空串/非串/复合打包串/无数字时返回 undefined
 */
export function parseMeasuredNum(raw: unknown): number | undefined {
  if (typeof raw !== 'string') return undefined;
  const str = raw.trim();
  if (!str) return undefined;

  // 复合形态守卫：绝不把含 ≥2 段指标赋值的打包串标量化
  if (isCompositePackagedText(str)) return undefined;

  // 负向后行排除标识符内嵌数字（Rp0.2、HV1、No.2 等）
  const match = str.match(/(?<![A-Za-z0-9.])[-+]?[0-9]+(?:\.[0-9]+)?/);
  if (!match) return undefined;

  const num = parseFloat(match[0]);
  return Number.isNaN(num) ? undefined : num;
}

/**
 * 提取硬度实测文本中的全部有效试样值（供多值平均）。
 *
 * 先剥离硬度标尺代号（HV 及其载荷如 HV1/HV0.2、HRB/HRC/HRA、HBW/HBS/HB、维氏/布氏/洛氏），
 * 再用标识符内嵌数字守卫提取剩余数值，杜绝标尺代号中的数字（如 HV1 的 1）混入平均。
 * `HRB90` 这类标尺与数值连写的形态保留数值部分。
 */
export function parseHardnessValues(raw: unknown): number[] {
  if (typeof raw !== 'string') return [];
  const str = raw.trim();
  if (!str) return [];

  const stripped = str
    .replace(/HV\s*\d+(?:\.\d+)?/gi, ' ')
    .replace(/HR[ABCF]?(?=[\s0-9]|$)/gi, ' ')
    .replace(/HB[WS]?(?=[\s0-9]|$)/gi, ' ')
    .replace(/维氏|布氏|洛氏/g, ' ');

  const matches = stripped.match(/(?<![A-Za-z0-9.])[-+]?[0-9]+(?:\.[0-9]+)?/g);
  if (!matches) return [];
  return matches.map((m) => parseFloat(m)).filter((n) => !Number.isNaN(n));
}
