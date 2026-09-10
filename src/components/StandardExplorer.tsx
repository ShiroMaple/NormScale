'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  apiClient,
  StandardOverviewDto,
  StandardDetailDto,
  SpecificationSlice,
  StandardClause,
} from '@/lib/api-client.ts';
import { EvaluationRule } from '@/schemas/standard.schema.ts';
import { MechanicalIcon, ProcessNdtIcon } from '@/components/icons';

interface StandardExplorerProps {
  initialStandardId?: string;
}

/**
 * 结构类型中英对照映射
 */
const STRUCTURE_TYPE_MAP: Record<string, { label: string; color: string }> = {
  austenitic: { label: '奥氏体型', color: 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  duplex: { label: '双相型', color: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
  austenitic_ferritic: { label: '双相型', color: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
  ferritic: { label: '铁素体型', color: 'text-amber-700 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  martensitic: { label: '马氏体型', color: 'text-rose-700 bg-rose-50 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800' },
  ferritic_martensitic: { label: '铁素体/马氏体', color: 'text-orange-700 bg-orange-50 dark:bg-orange-950/60 dark:text-orange-300 border-orange-200 dark:border-orange-800' },
};

/**
 * 格式化数值类规则指标文本
 */
function formatNumericRange(rule: EvaluationRule): string {
  const c = rule.criteria as Record<string, any>;
  const min = c.min ?? null;
  const max = c.max ?? null;
  const unit = c.unit || '';

  if (min !== null && max !== null) {
    return `${min} ~ ${max} ${unit}`.trim();
  }
  if (min !== null) {
    return `≥ ${min} ${unit}`.trim();
  }
  if (max !== null) {
    return `≤ ${max} ${unit}`.trim();
  }
  return c.note || '见规范要求';
}

/**
 * 格式化修约要求描述
 */
function formatRoundingDecimals(rule: EvaluationRule): string {
  const c = rule.criteria as Record<string, any>;
  if (typeof c.rounding_decimals === 'number') {
    return `修约至 ${c.rounding_decimals} 位小数`;
  }
  return '按 GB/T 8170 修约';
}

/**
 * ============================================================================
 * 国家/行业标准规则知识库与规格切片浏览器 (Standard Explorer)
 * 100% 动态数据驱动：联动后端 IRuleStore 与 /api/standards/[standardId]
 * ============================================================================
 */
export const StandardExplorer: React.FC<StandardExplorerProps> = ({ initialStandardId }) => {
  // 1. 标准库大盘与当前选中的标准
  const [standardsList, setStandardsList] = useState<StandardOverviewDto[]>([]);
  const [selectedStandardId, setSelectedStandardId] = useState<string>(initialStandardId || '');
  const [standardDetail, setStandardDetail] = useState<StandardDetailDto | null>(null);

  // 2. 切片列表过滤与当前切片
  const [selectedSliceKey, setSelectedSliceKey] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStructureType, setSelectedStructureType] = useState<string>('all');

  // 3. Tab 选项卡状态
  const [activeTab, setActiveTab] = useState<'chemical' | 'mechanical' | 'process_ndt' | 'formula_misc' | 'clauses'>('chemical');

  // 4. 加载与错误状态
  const [isLoadingStandards, setIsLoadingStandards] = useState<boolean>(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 初始化：获取标准清单
  useEffect(() => {
    async function loadStandards() {
      setIsLoadingStandards(true);
      try {
        const data = await apiClient.getStandards();
        // 防御性去重，保证下拉列表项唯一
        const seenIds = new Set<string>();
        const uniqueStandards = (data.standards || []).filter(s => {
          if (seenIds.has(s.standard_id)) return false;
          seenIds.add(s.standard_id);
          return true;
        });
        setStandardsList(uniqueStandards);
        if (uniqueStandards.length > 0) {
          const defaultStdId = initialStandardId && uniqueStandards.some(s => s.standard_id === initialStandardId)
            ? initialStandardId
            : uniqueStandards[0]!.standard_id;
          setSelectedStandardId(defaultStdId);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(`获取标准列表失败: ${msg}`);
      } finally {
        setIsLoadingStandards(false);
      }
    }
    loadStandards();
  }, [initialStandardId]);

  // 响应标准切换：加载该标准的完整规格切片与条文
  useEffect(() => {
    if (!selectedStandardId) return;

    let isMounted = true;
    async function loadDetail() {
      setIsLoadingDetail(true);
      setErrorMessage(null);
      try {
        const detail = await apiClient.getStandardDetail(selectedStandardId);
        if (!isMounted) return;
        setStandardDetail(detail);

        // 默认选中该标准的第一个切片
        if (detail.slices && detail.slices.length > 0) {
          setSelectedSliceKey(prev => {
            const exists = detail.slices.some(s => s.spec_key === prev);
            return exists ? prev : detail.slices[0]!.spec_key;
          });
        } else {
          setSelectedSliceKey('');
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(`加载标准明细失败: ${msg}`);
      } finally {
        if (isMounted) setIsLoadingDetail(false);
      }
    }

    loadDetail();
    return () => {
      isMounted = false;
    };
  }, [selectedStandardId]);

  // 当前激活选中的切片对象
  const currentSlice: SpecificationSlice | null = useMemo(() => {
    if (!standardDetail || !standardDetail.slices || standardDetail.slices.length === 0) {
      return null;
    }
    return standardDetail.slices.find(s => s.spec_key === selectedSliceKey) || standardDetail.slices[0] || null;
  }, [standardDetail, selectedSliceKey]);

  // 动态提取当前标准涵盖的组织结构类型分类及其数量
  const structureTypes = useMemo(() => {
    if (!standardDetail?.slices) return [];
    const counts = new Map<string, number>();

    for (const slice of standardDetail.slices) {
      const typeKey = slice.structure_type || 'other';
      counts.set(typeKey, (counts.get(typeKey) || 0) + 1);
    }

    const result: Array<{ id: string; label: string; count: number }> = [
      { id: 'all', label: '全部钢级', count: standardDetail.slices.length },
    ];

    for (const [key, count] of counts.entries()) {
      const meta = STRUCTURE_TYPE_MAP[key] || { label: key };
      result.push({
        id: key,
        label: meta.label,
        count,
      });
    }

    return result;
  }, [standardDetail]);

  // 过滤切片清单 (搜索 + 组织类型过滤)
  const filteredSlices: SpecificationSlice[] = useMemo(() => {
    if (!standardDetail?.slices) return [];
    const q = searchQuery.trim().toLowerCase();

    return standardDetail.slices.filter(slice => {
      const matchesType =
        selectedStructureType === 'all' ||
        slice.structure_type === selectedStructureType ||
        (selectedStructureType === 'duplex' && slice.structure_type === 'austenitic_ferritic');

      if (!matchesType) return false;
      if (!q) return true;

      const codeMatch = slice.spec_key.toLowerCase().includes(q);
      const gradeMatch = slice.primary_grade?.toLowerCase().includes(q) || false;
      const unifMatch = slice.unified_code?.toLowerCase().includes(q) || false;
      const nameMatch = slice.display_name?.toLowerCase().includes(q) || false;
      const aliasMatch = Array.isArray(slice.aliases) && slice.aliases.some(a => a.toLowerCase().includes(q));

      return codeMatch || gradeMatch || unifMatch || nameMatch || aliasMatch;
    });
  }, [standardDetail, searchQuery, selectedStructureType]);

  // 当前切片按类别拆解规则
  const { chemicalRules, mechanicalRules, processNdtRules, formulaMiscRules, clausesList } = useMemo(() => {
    if (!currentSlice) {
      return {
        chemicalRules: [],
        mechanicalRules: [],
        processNdtRules: [],
        formulaMiscRules: [],
        clausesList: standardDetail?.clauses || [],
      };
    }

    const chem: EvaluationRule[] = [];
    const mech: EvaluationRule[] = [];
    const procNdt: EvaluationRule[] = [];
    const formulaMisc: EvaluationRule[] = [];

    for (const rule of currentSlice.evaluation_rules) {
      if (rule.category === 'chemical') {
        if (rule.rule_type === 'dynamic_expression') {
          formulaMisc.push(rule);
        } else {
          chem.push(rule);
        }
      } else if (rule.category === 'mechanical') {
        mech.push(rule);
      } else if (
        rule.category === 'process' ||
        rule.category === 'ndt' ||
        rule.category === 'corrosion'
      ) {
        procNdt.push(rule);
      } else {
        formulaMisc.push(rule);
      }
    }

    return {
      chemicalRules: chem,
      mechanicalRules: mech,
      processNdtRules: procNdt,
      formulaMiscRules: formulaMisc,
      clausesList: standardDetail?.clauses || [],
    };
  }, [currentSlice, standardDetail]);

  // 动态 Tab 定义（附带规则数量计数，无规则项自适应隐藏）
  const tabDefinitions = useMemo(() => {
    const tabs: Array<{
      id: typeof activeTab;
      label: string;
      count: number;
      icon?: string;
      customIcon?: React.ReactNode;
    }> = [
      { id: 'chemical', label: '化学成分限值', count: chemicalRules.length, icon: 'science' },
      { id: 'mechanical', label: '力学与硬度指标', count: mechanicalRules.length, customIcon: <MechanicalIcon className="w-3.5 h-3.5" /> },
      { id: 'process_ndt', label: '工艺与探伤试验', count: processNdtRules.length, customIcon: <ProcessNdtIcon className="w-3.5 h-3.5" /> },
    ];

    if (formulaMiscRules.length > 0) {
      tabs.push({
        id: 'formula_misc',
        label: '动态公式与长尾',
        count: formulaMiscRules.length,
        icon: 'functions',
      });
    }

    if (clausesList.length > 0) {
      tabs.push({
        id: 'clauses',
        label: '标准文本条款',
        count: clausesList.length,
        icon: 'article',
      });
    }

    return tabs;
  }, [chemicalRules.length, mechanicalRules.length, processNdtRules.length, formulaMiscRules.length, clausesList.length]);

  // 确保当前 activeTab 合法
  useEffect(() => {
    const isCurrentValid = tabDefinitions.some(t => t.id === activeTab);
    if (!isCurrentValid && tabDefinitions.length > 0) {
      setActiveTab(tabDefinitions[0]!.id);
    }
  }, [tabDefinitions, activeTab]);

  return (
    <div className="space-y-5 h-[calc(100vh-4rem-2rem)] overflow-y-auto custom-scrollbar p-6 select-none">
      {/* 顶部工具栏：标准选择器 (Select/Combobox) + 搜索框 + 组织类型分类 */}
      <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

          {/* 1. 核心标准切换下拉选择器 */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-on-primary shadow-xs shrink-0">
              <span className="material-symbols-outlined text-xl">menu_book</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <label htmlFor="standard-select" className="text-xs font-bold text-on-surface-variant dark:text-outline-variant whitespace-nowrap">
                执行标准:
              </label>
              <select
                id="standard-select"
                value={selectedStandardId}
                onChange={(e) => setSelectedStandardId(e.target.value)}
                disabled={isLoadingStandards}
                className="rounded-lg border border-outline-variant/80 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low px-3 py-1.5 text-xs font-bold text-primary dark:text-primary-fixed-dim focus:outline-none focus:border-primary font-yahei cursor-pointer shadow-2xs min-w-[280px] sm:min-w-[360px]"
                style={{ fontFamily: '"Microsoft YaHei", "微软雅黑", sans-serif' }}
              >
                {standardsList.map((std) => (
                  <option
                    key={std.standard_id}
                    value={std.standard_id}
                    className="font-yahei"
                    style={{ fontFamily: '"Microsoft YaHei", "微软雅黑", sans-serif' }}
                  >
                    {std.standard_id} · {std.standard_name} ({std.slice_count} 钢级)
                  </option>
                ))}
              </select>
            </div>

            <span className="text-[11px] font-bold text-status-pass-text bg-status-pass-bg px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800 inline-flex items-center gap-1 shadow-2xs">
              <span className="material-symbols-outlined text-xs">verified</span>
              <span>现行有效 · 动态切片驱动</span>
            </span>
          </div>

          {/* 2. 切片关键字搜索框 */}
          <div className="relative flex-1 max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-2 text-on-surface-variant text-base">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索钢级牌号、数字代号或别名 (如 S30408, 304, TP304)..."
              className="w-full rounded-lg border border-outline-variant dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low pl-9 pr-8 py-1.5 text-xs text-on-surface dark:text-surface-bright placeholder-on-surface-variant/60 focus:border-primary focus:outline-none font-mono"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>
        </div>

        {/* 3. 动态组织结构类型过滤按钮 */}
        {structureTypes.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-outline-variant/30 dark:border-border-dark">
            <span className="text-xs text-on-surface-variant mr-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-base">filter_list</span>
              <span>组织类型:</span>
            </span>
            {structureTypes.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedStructureType(cat.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all flex items-center gap-1.5 ${selectedStructureType === cat.id
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant hover:bg-surface-container-high'
                  }`}
              >
                <span>{cat.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${selectedStructureType === cat.id
                  ? 'bg-white/20 text-white'
                  : 'bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant'
                  }`}>
                  {cat.count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-status-fail-bg text-status-fail-text border border-red-300 dark:border-red-800 text-xs font-medium flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">error</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 主体分栏：左侧 35% 切片目录列表，右侧 65% 切片技术规范详情 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        {/* 左侧：切片目录列表 */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-4 shadow-xs">

            {/* 标准摘要标头 */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-outline-variant/40 dark:border-border-dark">
              <div>
                <span className="text-xs font-bold font-mono text-primary dark:text-primary-fixed-dim block">
                  {standardDetail?.standard_meta.standard_id || selectedStandardId}
                </span>
                <span className="text-xs text-on-surface dark:text-surface-bright font-medium line-clamp-1" title={standardDetail?.standard_meta.standard_name}>
                  {standardDetail?.standard_meta.standard_name || '标准规则库加载中...'}
                </span>
              </div>
              <span className="text-[11px] font-bold text-on-surface-variant dark:text-outline-variant bg-surface-container-low dark:bg-surface-dark-low px-2 py-0.5 rounded border border-outline-variant/40">
                {filteredSlices.length} / {standardDetail?.slices.length || 0} 项
              </span>
            </div>

            {/* 切片列表加载态骨架屏 */}
            {isLoadingDetail ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="h-16 rounded-xl bg-surface-container-low dark:bg-surface-dark-low animate-pulse" />
                ))}
              </div>
            ) : filteredSlices.length === 0 ? (
              <div className="py-12 text-center text-on-surface-variant dark:text-outline-variant">
                <span className="material-symbols-outlined text-3xl mb-1 block">search_off</span>
                <p className="text-xs font-semibold">未检索到匹配的钢级切片</p>
                <p className="text-[11px] opacity-75 mt-0.5">请尝试调整搜索词或组织类型筛选</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[580px] overflow-y-auto custom-scrollbar pr-1">
                {filteredSlices.map(slice => {
                  const isSelected = currentSlice?.spec_key === slice.spec_key;
                  const typeMeta = STRUCTURE_TYPE_MAP[slice.structure_type || ''] || { label: slice.structure_type || '材料切片', color: 'text-slate-700 bg-slate-100 border-slate-300' };

                  return (
                    <button
                      key={slice.spec_key}
                      type="button"
                      onClick={() => setSelectedSliceKey(slice.spec_key)}
                      className={`w-full text-left rounded-xl p-3 transition-all flex items-center justify-between border cursor-pointer ${isSelected
                        ? 'border-primary dark:border-primary-fixed-dim bg-primary/5 dark:bg-primary-fixed-dim/10 shadow-xs ring-1 ring-primary/20'
                        : 'border-outline-variant/60 dark:border-border-dark hover:border-outline bg-surface-container-lowest dark:bg-surface-dark'
                        }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-xs text-on-surface dark:text-surface-bright">
                            {slice.unified_code || slice.spec_key}
                          </span>
                          <span className="text-xs text-on-surface-variant">|</span>
                          <span className="font-mono text-xs text-primary dark:text-primary-fixed-dim font-bold truncate">
                            {slice.primary_grade || slice.spec_key}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${typeMeta.color}`}>
                            {typeMeta.label}
                          </span>
                          <span className="text-[10px] text-on-surface-variant dark:text-outline-variant font-medium">
                            {slice.evaluation_rules?.length || 0} 项判定规则
                          </span>
                        </div>
                      </div>
                      <span className={`material-symbols-outlined text-base shrink-0 ${isSelected ? 'text-primary dark:text-primary-fixed-dim' : 'text-on-surface-variant/60'}`}>
                        chevron_right
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：当前切片详细技术规范卡片 */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark p-6 space-y-5 shadow-xs">

            {isLoadingDetail || !currentSlice ? (
              <div className="space-y-4 py-8">
                <div className="h-8 w-48 bg-surface-container-low dark:bg-surface-dark-low rounded animate-pulse" />
                <div className="h-4 w-96 bg-surface-container-low dark:bg-surface-dark-low rounded animate-pulse" />
                <div className="h-64 bg-surface-container-low dark:bg-surface-dark-low rounded-xl animate-pulse" />
              </div>
            ) : (
              <>
                {/* 切片主信息概览标头 */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-outline-variant/40 dark:border-border-dark">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-xl font-bold font-mono text-on-surface dark:text-surface-bright tracking-tight">
                        {currentSlice.primary_grade || currentSlice.display_name}
                      </h2>
                      <span className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-bold text-primary dark:text-primary-fixed-dim">
                        统一数字代号: {currentSlice.unified_code || currentSlice.spec_key}
                      </span>
                      {currentSlice.structure_type && (
                        <span className={`rounded px-2 py-0.5 text-xs font-semibold border ${STRUCTURE_TYPE_MAP[currentSlice.structure_type]?.color || 'text-slate-700 bg-slate-100'}`}>
                          {STRUCTURE_TYPE_MAP[currentSlice.structure_type]?.label || currentSlice.structure_type}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant dark:text-outline-variant mt-1 leading-relaxed">
                      {currentSlice.description || `执行标准 ${standardDetail?.standard_meta.standard_id} 规范化钢级规格切片`}
                    </p>
                  </div>

                  {/* 跨国与历史别名字典 */}
                  {Array.isArray(currentSlice.aliases) && currentSlice.aliases.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0 max-w-xs justify-end">
                      <span className="text-[10px] text-on-surface-variant mr-0.5">常用别名:</span>
                      {currentSlice.aliases.map((alias, idx) => (
                        <span
                          key={idx}
                          className="rounded border border-outline-variant/60 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low px-1.5 py-0.5 text-[10px] font-mono text-on-surface-variant dark:text-outline-variant font-medium"
                        >
                          {alias}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 自适应核心 Tab 导航 */}
                <div className="flex items-center gap-1.5 border-b border-outline-variant/40 dark:border-border-dark pb-2 overflow-x-auto custom-scrollbar">
                  {tabDefinitions.map(tab => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${isActive
                          ? 'bg-primary text-on-primary shadow-xs'
                          : 'text-on-surface-variant dark:text-outline-variant hover:bg-surface-container-low dark:hover:bg-surface-dark-low'
                          }`}
                      >
                        {tab.customIcon ? (
                          <span className="flex items-center justify-center shrink-0">
                            {tab.customIcon}
                          </span>
                        ) : (
                          <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                        )}
                        <span>{tab.label}</span>
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant'
                          }`}>
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Tab 1：化学成分限值表 */}
                {activeTab === 'chemical' && (
                  <div className="rounded-xl border border-outline-variant/40 dark:border-border-dark overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant dark:text-outline-variant border-b border-outline-variant/60 dark:border-border-dark uppercase text-[11px]">
                        <tr>
                          <th className="px-4 py-2.5 font-sans">元素名称</th>
                          <th className="px-4 py-2.5">化学符号</th>
                          <th className="px-4 py-2.5">国家/行业标准质量分数限值 (wt%)</th>
                          <th className="px-4 py-2.5 font-sans">GB/T 8170 进舍修约规则</th>
                          <th className="px-4 py-2.5 font-sans">强制级别</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/20 dark:divide-border-dark/60">
                        {chemicalRules.map((rule) => {
                          const limitStr = formatNumericRange(rule);
                          const roundingStr = formatRoundingDecimals(rule);
                          return (
                            <tr key={rule.rule_id} className="hover:bg-surface-container-low/40 dark:hover:bg-surface-dark-low/40 transition-colors">
                              <td className="px-4 py-2.5 font-sans font-medium text-on-surface dark:text-surface-bright">
                                {rule.display_name.replace(/\s*\(.*?\)\s*/g, '')}
                              </td>
                              <td className="px-4 py-2.5 text-primary dark:text-primary-fixed-dim font-bold font-mono">
                                {rule.property_key}
                              </td>
                              <td className="px-4 py-2.5 font-bold text-on-surface dark:text-surface-bright">
                                {limitStr}
                              </td>
                              <td className="px-4 py-2.5 text-on-surface-variant dark:text-outline-variant font-sans">
                                {roundingStr}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${rule.requirement_level === 'MANDATORY'
                                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300'
                                  }`}>
                                  {rule.requirement_level === 'MANDATORY' ? '必检' : rule.requirement_level}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Tab 2：力学与硬度指标 */}
                {activeTab === 'mechanical' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {mechanicalRules.map((rule) => {
                      const isOrChoice = rule.rule_type === 'or_choice_group';
                      const orOptions = isOrChoice ? (rule.criteria as any)?.options || [] : [];

                      return (
                        <div
                          key={rule.rule_id}
                          className="rounded-xl border border-outline-variant/40 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-on-surface-variant dark:text-outline-variant font-sans">
                              {rule.display_name}
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${rule.requirement_level === 'MANDATORY'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200'
                              }`}>
                              {rule.requirement_level === 'MANDATORY' ? '强制考核' : '条件考核'}
                            </span>
                          </div>

                          {isOrChoice ? (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[11px] text-on-surface-variant block font-sans">多标尺任选其一合格：</span>
                              <div className="flex flex-wrap gap-1.5">
                                {orOptions.map((opt: any) => (
                                  <span
                                    key={opt.sub_key}
                                    className="px-2 py-1 rounded bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 font-mono text-xs font-bold text-primary dark:text-primary-fixed-dim"
                                  >
                                    {opt.sub_key} ≤ {opt.criteria?.max}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="pt-1">
                              <span className="text-xl font-bold font-mono text-primary dark:text-primary-fixed-dim">
                                {formatNumericRange(rule)}
                              </span>
                            </div>
                          )}

                          {rule.trigger_condition && (
                            <p className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/40 p-1.5 rounded border border-amber-200/60 leading-tight">
                              前置触发: {rule.trigger_condition}
                            </p>
                          )}

                          {rule.description && (
                            <p className="text-[11px] text-on-surface-variant dark:text-outline-variant font-sans line-clamp-2 leading-relaxed" title={rule.description}>
                              {rule.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Tab 3：工艺与无损探伤条款 */}
                {activeTab === 'process_ndt' && (
                  <div className="space-y-3">
                    {processNdtRules.map((rule) => {
                      const isAlternative = rule.rule_type === 'alternative_group';
                      const isDynamicPass = rule.rule_type === 'dynamic_formula_pass';
                      const isQualNumeric = rule.rule_type === 'qualitative_and_numeric';
                      const isCorrosion = rule.category === 'corrosion' || rule.property_key === 'intergranular_corrosion';

                      return (
                        <div
                          key={rule.rule_id}
                          className="rounded-xl border border-outline-variant/40 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-xs text-primary dark:text-primary-fixed-dim font-sans flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-base">
                                {isCorrosion ? 'biotech' : isAlternative ? 'alt_route' : 'check_circle'}
                              </span>
                              <span>{rule.display_name}</span>
                            </h4>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-outline-variant/40 bg-surface-container-lowest dark:bg-surface-dark text-on-surface-variant">
                              {rule.category === 'corrosion' ? '耐腐蚀' : rule.category === 'ndt' ? '无损探伤' : '工艺性能'}
                            </span>
                          </div>

                          <div className="p-3 rounded-lg bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/30 text-xs text-on-surface dark:text-surface-bright leading-relaxed">
                            {isDynamicPass ? (
                              <div>
                                <span className="font-mono font-bold text-primary block mb-1">公式：平板间距 H = (1 + e)s / (e + s/D)</span>
                                <span>按指定标准形变系数 e 压至平板间距 H，受压试样表面不得产生裂缝或裂口。</span>
                              </div>
                            ) : isQualNumeric ? (
                              <div>
                                <span className="font-mono font-bold text-primary block mb-1">
                                  顶芯锥度 60°，管端扩口率 ≥ {(rule.criteria as any)?.flaring_rate_min_percent || 10}%
                                </span>
                                <span>扩口后试样无肉眼可见裂纹或断口裂口即判定合格。</span>
                              </div>
                            ) : isAlternative ? (
                              <div>
                                <span className="font-bold text-primary block mb-1">承压致密性与无损替代机制：</span>
                                <span>逐根水压试验（P=2SR/D，稳压不少于 10s 不渗漏）或执行同等/更高级别涡流/超声探伤替代检验。</span>
                              </div>
                            ) : (
                              <span>{rule.description || formatNumericRange(rule)}</span>
                            )}
                          </div>

                          {rule.description && !isDynamicPass && !isQualNumeric && !isAlternative && (
                            <p className="text-[11px] text-on-surface-variant dark:text-outline-variant leading-relaxed">
                              {rule.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Tab 4：长尾与动态判定公式 */}
                {activeTab === 'formula_misc' && (
                  <div className="space-y-4">
                    {formulaMiscRules.map((rule) => {
                      const isDynamicExp = rule.rule_type === 'dynamic_expression';
                      const crit = rule.criteria as Record<string, any>;

                      return (
                        <div
                          key={rule.rule_id}
                          className="rounded-xl border border-outline-variant/40 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low p-5 space-y-3 shadow-2xs"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-on-primary shadow-xs">
                              <span className="material-symbols-outlined text-2xl">calculate</span>
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-on-surface dark:text-surface-bright font-sans">
                                {rule.display_name}
                              </h3>
                              <p className="text-xs text-on-surface-variant dark:text-outline-variant">
                                {isDynamicExp ? '基于多字段 AST 抽象语法树编译的动态公式求解器' : '长尾金相、表面或尺寸综合评定规则'}
                              </p>
                            </div>
                          </div>

                          {isDynamicExp && (
                            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 font-mono text-xs text-primary font-bold">
                              <code>
                                {crit.formula_min ? `下限: ${crit.formula_min}` : ''}
                                {crit.max ? ` 且 上限 ≤ ${crit.max}%` : ''}
                              </code>
                            </div>
                          )}

                          <p className="text-xs text-on-surface-variant dark:text-outline-variant leading-relaxed font-sans">
                            {rule.description || crit.note || '依据现行标准规范执行动态求解评定。'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Tab 5：标准文本条款库 */}
                {activeTab === 'clauses' && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary dark:text-primary-fixed-dim font-medium flex items-center gap-2">
                      <span className="material-symbols-outlined text-base">info</span>
                      <span>标准正文条文库：涵盖当前执行标准中关于制造方式、交货状态与检验批次的核心规范。</span>
                    </div>

                    <div className="divide-y divide-outline-variant/30 dark:divide-border-dark/60 rounded-xl border border-outline-variant/40 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low overflow-hidden">
                      {clausesList.map((clause: StandardClause) => (
                        <div key={clause.clause_id} className="p-4 hover:bg-surface-container-high/30 transition-colors">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-bold text-xs text-primary dark:text-primary-fixed-dim">
                              第 {clause.clause_id} 条
                            </span>
                            <span className="text-xs font-bold text-on-surface dark:text-surface-bright">
                              {clause.title}
                            </span>
                          </div>
                          <p className="text-xs text-on-surface-variant dark:text-outline-variant leading-relaxed font-sans pl-1">
                            {clause.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
