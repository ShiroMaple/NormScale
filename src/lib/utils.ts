import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 通用 Tailwind CSS 类名合并辅助函数 (shadcn/ui 标准规范)
 * 组合 clsx 条件判断与 tailwind-merge 规则去重
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * 标准代号归一化指纹提取函数
 * (例如 'GB/T 13296-2023' -> 'GBT132962023', 'NB/T47019.5-2021' -> 'NBT47019.52021')
 * 消除空格、连字符、斜杠与大小写差异，提取可比对的纯净指纹
 */
export function normalizeStandardId(id: string): string {
  if (!id) return '';
  return id.toUpperCase().replace(/[\s\-_/\\]/g, '');
}

/**
 * 判断两个标准代号集合（支持字符串、数组或混合形式）是否指纹等价
 * 忽略项的排列顺序、内部空格、大小写与分隔符差异
 */
export function areStandardCollectionsEquivalent(
  collectionA: string[] | string | undefined,
  collectionB: string[] | string | undefined
): boolean {
  const extractFingerprints = (input: string[] | string | undefined): string[] => {
    if (!input) return [];
    const rawItems = Array.isArray(input) ? input : input.split(/[、,，;；\n]+/);
    const set = new Set<string>();
    for (const item of rawItems) {
      const fp = normalizeStandardId(item);
      if (fp) set.add(fp);
    }
    return Array.from(set);
  };

  const fpsA = extractFingerprints(collectionA);
  const fpsB = extractFingerprints(collectionB);

  if (fpsA.length !== fpsB.length) return false;
  return fpsA.every(a => fpsB.includes(a)) && fpsB.every(b => fpsA.includes(b));
}
