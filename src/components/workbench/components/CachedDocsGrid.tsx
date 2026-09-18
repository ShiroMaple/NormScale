'use client';

import React from 'react';
import { CachedDocItem } from '../types.ts';

export interface CachedDocsGridProps {
  cachedDocs: CachedDocItem[];
  onRestoreFromCache: (item: CachedDocItem) => void;
  onDeleteCachedDoc: (item: CachedDocItem, e: React.MouseEvent) => void;
  onRefreshCachedDocs: () => void;
}

/**
 * 历史已缓存文档网格组件
 * 展示已在本地服务端解析或预处理的质保书文档快照，支持一键恢复装载与删除
 */
export const CachedDocsGrid: React.FC<CachedDocsGridProps> = ({
  cachedDocs,
  onRestoreFromCache,
  onDeleteCachedDoc,
  onRefreshCachedDocs,
}) => {
  return (
    <div className="space-y-3 pt-2">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-on-surface-variant text-base">
            description
          </span>
          <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center gap-2">
            <span>历史已缓存文档</span>
            <span className="px-1.5 py-0.2 rounded-full bg-surface-container-high dark:bg-surface-dark-high text-[11px] text-on-surface-variant font-medium">
              {cachedDocs.length}
            </span>
          </h3>
        </div>
        <button
          type="button"
          onClick={onRefreshCachedDocs}
          className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary dark:hover:text-primary-fixed-dim transition-colors"
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
          <span>刷新</span>
        </button>
      </div>

      {/* 水平缓存文档卡片列表 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {cachedDocs.map((item, idx) => (
          <div
            key={item.id || item.md5 || idx}
            onClick={() => onRestoreFromCache(item)}
            className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-3 shadow-xs flex items-center gap-3 cursor-pointer hover:border-primary transition-all group relative"
          >
            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                picture_as_pdf
              </span>
            </div>
            <div className="min-w-0 flex-1 pr-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-bold text-on-surface dark:text-surface-bright block truncate" title={item.filename}>
                  {item.filename}
                </span>
                {item.cacheLevel === 'L2' ? (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 shrink-0">
                    L2 预处理
                  </span>
                ) : (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0">
                    L1 已解析
                  </span>
                )}
              </div>
              <span className="text-[10px] text-on-surface-variant dark:text-outline-variant block mt-0.5">
                {item.date} • {item.size}
              </span>
            </div>
            <button
              type="button"
              title="删除该条缓存"
              onClick={(e) => onDeleteCachedDoc(item, e)}
              className="w-7 h-7 rounded-lg text-on-surface-variant hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center transition-colors shrink-0 opacity-80 hover:opacity-100"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
