'use client';

import React from 'react';
import { StandardOverviewDto } from '@/lib/api-client.ts';

interface HeaderProps {
  standardsData?: {
    total_standards: number;
    total_slices: number;
    standards: StandardOverviewDto[];
  };
  isAuditing?: boolean;
  activeTab?: 'workbench' | 'standards' | 'ledger' | 'admin';
  onTabChange?: (tab: 'workbench' | 'standards' | 'ledger' | 'admin') => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onRefresh?: () => void;
}

/**
 * ============================================================================
 * 全局导航栏组件 (TopNavBar - 1:1 像素级还原 Stitch 工业设计规范)
 * ============================================================================
 */
export const Header: React.FC<HeaderProps> = ({
  activeTab = 'workbench',
  onTabChange,
  theme = 'light',
  onToggleTheme,
}) => {
  return (
    <header className="bg-surface-container-lowest dark:bg-bg-industrial-slate font-body-md text-body-md border-b border-outline-variant/60 dark:border-border-dark flex justify-between items-center w-full px-6 h-16 shrink-0 z-30 select-none shadow-xs">
      {/* 左侧 Logo 与四个全局视图导航 Tab */}
      <div className="flex items-center gap-8 h-full">
        {/* 系统标题 Logo */}
        <div
          onClick={() => onTabChange && onTabChange('workbench')}
          className="font-headline-lg text-headline-lg font-bold text-primary dark:text-primary-fixed-dim tracking-tight flex items-center gap-2.5 cursor-pointer"
        >
          {/* 准衡 Logo SVG */}
          <svg
            viewBox="0 0 100 100"
            className="shrink-0"
            style={{ width: 32, height: 32 }}
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="0" y="0" width="100" height="100" rx="8" fill="#0F4C81" />
            <text
              x="50"
              y="73"
              fontSize="62"
              fontWeight="900"
              fill="#FFFFFF"
              textAnchor="middle"
              fontFamily="STKaiti, KaiTi, serif"
            >
              准
            </text>
          </svg>

          <div className="flex flex-col leading-none">
            <span className="text-xl font-bold tracking-tight">准衡</span>
            <span className="text-[10px] font-medium tracking-[0.2em] text-on-surface-variant dark:text-secondary-fixed-dim opacity-70">
              NORMSCALE
            </span>
          </div>
          <span className="text-on-surface-variant dark:text-secondary-fixed-dim font-normal text-xl ml-2 hidden md:inline opacity-80 border-l border-outline-variant dark:border-border-dark pl-3">
            工业质保证书合规检验
          </span>
        </div>

        {/* 顶部主导航 Tab */}
        <nav className="hidden md:flex gap-6 items-center h-full pt-1">
          {[
            { id: 'workbench', label: '工作台' },
            { id: 'ledger', label: '历史检验台账' },
            { id: 'standards', label: '标准库' },
            { id: 'admin', label: '系统管理' },
          ].map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange && onTabChange(item.id as typeof activeTab)}
                className={`h-full flex items-center text-lg transition-colors relative font-medium ${isActive
                  ? 'text-primary dark:text-primary-fixed-dim font-bold border-b-2 border-primary dark:border-primary-fixed-dim'
                  : 'text-on-surface-variant dark:text-outline-variant hover:text-primary dark:hover:text-primary-fixed-dim'
                  }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 右侧动作区：主题切换、通知铃铛、默认用户 ZPJE 头像 */}
      <div className="flex items-center gap-4">
        {/* 明暗风格切换按钮 */}
        <button
          type="button"
          onClick={onToggleTheme}
          title="切换明暗主题风格"
          className="text-on-surface-variant dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim p-1.5 rounded-lg hover:bg-surface-container-low dark:hover:bg-surface-dark transition-colors flex items-center justify-center"
        >
          <span className="material-symbols-outlined text-xl">
            {theme === 'dark' ? 'light_mode' : 'dark_mode'}
          </span>
        </button>

        {/* 通知铃铛 */}
        <button
          type="button"
          title="系统通知"
          className="text-on-surface-variant dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim p-1.5 rounded-lg hover:bg-surface-container-low dark:hover:bg-surface-dark transition-colors relative flex items-center justify-center"
        >
          <span className="material-symbols-outlined text-xl">notifications</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-error ring-2 ring-surface-container-lowest" />
        </button>

        {/* 分割线 */}
        <div className="h-6 w-[1px] bg-outline-variant/60 dark:bg-border-dark mx-1" />

        {/* 质检员认证头像与职务 */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold leading-none text-on-surface dark:text-surface-bright">默认用户</div>
            <div className="text-[10px] text-on-surface-variant dark:text-secondary-fixed-dim leading-tight mt-1 flex items-center justify-end gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-status-pass-text" />
              <span>当前在线</span>
            </div>
          </div>
          <div className="h-8 w-8 rounded-full bg-primary dark:bg-primary-container text-on-primary flex items-center justify-center font-bold text-xs shadow-xs tracking-wider">
            ZPJE
          </div>
        </div>
      </div>
    </header>
  );
};
