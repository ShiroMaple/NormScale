/**
 * 执行标准解析与规范化工具（前后端通用纯函数）
 */

/**
 * 智能解析、拆分与轻量规范化执行标准
 * 例如将 "NB/T47019.5-2021、GB/T13296-2023"
 * 拆分并规范化为 ["NB/T 47019.5-2021", "GB/T 13296-2023"]
 */
export function parseStandards(raw?: string | null): string[] {
  if (!raw || typeof raw !== 'string') return [];
  const parts = raw.split(/[、,;，；\n]+/).map(s => s.trim()).filter(Boolean);
  const result: string[] = [];

  for (const part of parts) {
    // 规范化标准前缀与代号数字之间的空格，如 NB/T47019.5-2021 -> NB/T 47019.5-2021
    const normalized = part.replace(/^([A-Za-z]+(?:\/[A-Za-z]+)?)\s*([A-Za-z]?[0-9].*)$/, '$1 $2').trim();
    if (normalized && !result.includes(normalized)) {
      result.push(normalized);
    }
  }

  return result;
}
