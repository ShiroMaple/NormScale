import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 通用 Tailwind CSS 类名合并辅助函数 (shadcn/ui 标准规范)
 * 组合 clsx 条件判断与 tailwind-merge 规则去重
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
