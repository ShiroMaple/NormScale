'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  HitlInterruptContext,
  HumanCorrectionInput,
} from '@/workflow/state.interface.ts';
import { StandardOverviewDto } from '@/lib/api-client.ts';
import { buildGradePool, searchFuzzyGrades, FuzzyGradeItem } from '@/utils/grade-fuzzy-matcher.ts';

export interface CandidateRuleItem {
  key: string;
  name: string;
  category?: string;
  rule_type?: string;
  requirement_text?: string;
  unit?: string;
}

interface HitlDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  hitlContext?: HitlInterruptContext;
  taskId: string;
  selectedStandardIds?: string[];
  availableStandards?: StandardOverviewDto[];
  candidateRules?: CandidateRuleItem[];
  onSubmitResume: (correction: HumanCorrectionInput) => Promise<void>;
  isSubmitting: boolean;
}

/**
 * ============================================================================
 * 人机协同干预抽屉组件 (HITL Review Drawer - 520px 工业风设计)
 * 严格遵循无 font-mono 滥用与无 10px 微型字号规范
 * ============================================================================
 */
export const HitlDrawer: React.FC<HitlDrawerProps> = ({
  isOpen,
  onClose,
  hitlContext,
  taskId,
  selectedStandardIds,
  availableStandards,
  candidateRules,
  onSubmitResume,
  isSubmitting,
}) => {
  const candidateList = hitlContext?.candidate_grades || [];

  // 场景 1: 牌号消歧状态 (默认选中服务端动态推荐的首项，若无推荐则聚焦 CUSTOM)
  const [selectedGrade, setSelectedGrade] = useState<string>(() => {
    if (candidateList.length > 0) {
      const rec = candidateList.find(c => c.recommended) || candidateList[0];
      return rec ? rec.id : 'CUSTOM';
    }
    return 'CUSTOM';
  });
  const [customGrade, setCustomGrade] = useState<string>('');
  const [selectedCustomGradeTarget, setSelectedCustomGradeTarget] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);

  const dropdownContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 动态提取当前选定标准（或全局退化）的候选钢级池
  const gradePool = useMemo(() => {
    return buildGradePool(availableStandards, selectedStandardIds);
  }, [availableStandards, selectedStandardIds]);

  // 模糊匹配实时检索结果
  const fuzzyResults = useMemo(() => {
    if (!customGrade || !isDropdownOpen) return [];
    return searchFuzzyGrades(customGrade, gradePool, 8);
  }, [customGrade, gradePool, isDropdownOpen]);

  // 当 hitlContext 动态更新时同步选中态
  useEffect(() => {
    if (candidateList.length > 0) {
      const rec = candidateList.find(c => c.recommended) || candidateList[0];
      if (rec) {
        setSelectedGrade(rec.id);
      }
    } else {
      setSelectedGrade('CUSTOM');
    }
  }, [hitlContext?.candidate_grades]);

  // 场景 2: 替代条款确认状态
  const [acceptAlternative, setAcceptAlternative] = useState<boolean>(true);

  // 场景 3: 多标准冲突主标尺选择状态
  const [selectedArbitratedStandard, setSelectedArbitratedStandard] = useState<string>('GB/T 13296-2023');

  // 场景 4: 定性语义裁定状态
  const [qualitativeVerdict, setQualitativeVerdict] = useState<'PASS' | 'FAIL'>('PASS');

  // 场景 5: 特种属性语义歧义裁定状态
  const [propertyResolutionMode, setPropertyResolutionMode] = useState<'PROTOCOL_PASS' | 'MAP_STANDARD' | 'REJECT'>('PROTOCOL_PASS');

  // 动态提取当前适用的标准指标条款候选池 (优先使用外部传入 candidateRules，其次使用 hitlContext.candidate_rules)
  const activeCandidateRules = useMemo<CandidateRuleItem[]>(() => {
    if (candidateRules && candidateRules.length > 0) {
      return candidateRules;
    }
    if (hitlContext?.candidate_rules && hitlContext.candidate_rules.length > 0) {
      return hitlContext.candidate_rules;
    }
    // 降级通用标准指标
    return [
      { key: 'tensile_rm', name: '抗拉强度 Rm', category: 'mechanical', unit: 'MPa', requirement_text: '≥ 520 MPa' },
      { key: 'yield_strength_rp02', name: '规定塑性延伸强度 Rp0.2', category: 'mechanical', unit: 'MPa', requirement_text: '≥ 205 MPa' },
      { key: 'elongation_A', name: '断后伸长率 A', category: 'mechanical', unit: '%', requirement_text: '≥ 40 %' },
      { key: 'hardness', name: '硬度试验 (HRB/HBW)', category: 'mechanical', requirement_text: '硬度指标合格' },
      { key: 'impact_akv', name: '夏比 V 型缺口冲击功 (KV2)', category: 'mechanical', unit: 'J', requirement_text: '≥ 47 J' },
      { key: 'flattening_test', name: '压扁试验', category: 'process', requirement_text: '压至两平板间距H合格，无裂纹' },
      { key: 'flaring_test', name: '扩口试验', category: 'process', requirement_text: '扩口率 ≥ 18% 无裂口' },
      { key: 'grain_size', name: '晶粒度评级', category: 'metallographic', unit: '级', requirement_text: '评级 ≥ 7 级' },
      { key: 'intergranular_corrosion', name: '晶间腐蚀试验', category: 'corrosion', requirement_text: '按标准检验无晶间腐蚀倾向' },
      { key: 'ultrasonic_test', name: '超声检测 (UT)', category: 'ndt', requirement_text: '验收等级 U2 级' },
      { key: 'eddy_current_test', name: '涡流检测 (ET)', category: 'ndt', requirement_text: '验收等级 E2H 级' },
      { key: 'pressure_tightness', name: '致密性/水压试验', category: 'ndt', requirement_text: '逐根水压或替代涡流合格' },
      { key: 'surface_quality', name: '表面外观质量', category: 'surface', requirement_text: '内外表面光洁平整，无裂纹与重皮' },
      { key: 'surface_roughness', name: '表面粗糙度 (Ra)', category: 'surface', unit: 'μm', requirement_text: '≤ 0.8 μm' },
    ];
  }, [candidateRules, hitlContext?.candidate_rules]);

  // 按标准专业分类对候选规则进行结构化分组
  const groupedRules = useMemo(() => {
    const groups: Record<string, { label: string; rules: CandidateRuleItem[] }> = {
      chemical: { label: '化学成分 (Chemical)', rules: [] },
      mechanical: { label: '力学性能 (Mechanical)', rules: [] },
      process: { label: '工艺成型 (Process)', rules: [] },
      metallographic: { label: '金相组织 (Metallographic)', rules: [] },
      corrosion: { label: '耐腐蚀性能 (Corrosion)', rules: [] },
      ndt: { label: '无损探伤 (NDT)', rules: [] },
      surface: { label: '表面与尺寸 (Surface & Dimensions)', rules: [] },
      additional: { label: '其它标准条款 (Additional)', rules: [] },
    };

    for (const rule of activeCandidateRules) {
      const cat = rule.category && rule.category in groups ? rule.category : 'additional';
      groups[cat]!.rules.push(rule);
    }

    return Object.entries(groups).filter(([, g]) => g.rules.length > 0);
  }, [activeCandidateRules]);

  const [selectedTargetPropertyKey, setSelectedTargetPropertyKey] = useState<string>(() => {
    if (activeCandidateRules.length > 0) {
      return activeCandidateRules[0]!.key;
    }
    return 'tensile_rm';
  });

  const ambiguousPropName =
    hitlContext?.property_ambiguity_details?.raw_name ||
    (hitlContext?.pending_fields && hitlContext.pending_fields[0]) ||
    '特种非标抗剪切断裂韧度 K1C';
  const ambiguousPropVal =
    hitlContext?.property_ambiguity_details?.raw_value !== undefined
      ? String(hitlContext.property_ambiguity_details.raw_value)
      : '42.5 MPa·m½';
  const ambiguousPropCategory =
    hitlContext?.property_ambiguity_details?.raw_category || 'mechanical';
  const ambiguousReasoning =
    hitlContext?.property_ambiguity_details?.reasoning ||
    hitlContext?.prompt_message ||
    '大模型意图消歧置信度不足（< 0.60），当前执行标准中无同名指标规则';

  // 当 candidateRules 更新或 hitlContext 建议变更时，智能对齐初始选中项
  useEffect(() => {
    const suggestionKey = (hitlContext?.suggestions?.[ambiguousPropName] as string | undefined) ||
      hitlContext?.property_ambiguity_details?.resolved_key;
    if (suggestionKey && activeCandidateRules.some(r => r.key === suggestionKey)) {
      setSelectedTargetPropertyKey(suggestionKey);
    } else if (activeCandidateRules.length > 0 && !activeCandidateRules.some(r => r.key === selectedTargetPropertyKey)) {
      setSelectedTargetPropertyKey(activeCandidateRules[0]!.key);
    }
  }, [activeCandidateRules, hitlContext?.suggestions, hitlContext?.property_ambiguity_details, ambiguousPropName]);

  // 质检说明与依据文本
  const [justification, setJustification] = useState<string>('');

  const currentReason = hitlContext?.reason || 'UNKNOWN_GRADE';

  // 动态根据当前挂起场景初始化默认处理说明
  useEffect(() => {
    if (currentReason === 'ALTERNATIVE_CLAUSE') {
      setJustification(
        acceptAlternative
          ? '依据采购合同及订货补充技术协议，确认质保书所附检测结果符合替代要求，准予采纳替代条款。'
          : '依据工程特定技术协议要求，不予采纳替代方案，作缺项否决。'
      );
    } else if (currentReason === 'MULTI_STANDARD_CONFLICT') {
      setJustification(
        `经与设计院及材料订货规范核对，指定以 ${selectedArbitratedStandard} 作为本项指标的主裁定标尺。`
      );
    } else if (currentReason === 'QUALITATIVE_AMBIGUITY') {
      setJustification(
        qualitativeVerdict === 'PASS'
          ? '经显微复核与定性文字比对，显微形貌微量偏聚属于正常固溶组织，未见连续网状裂纹，判定符合标准规范。'
          : '定性文字描述存在微观晶间腐蚀隐患，要求第三方权威检测机构复验或作不合格退货处置。'
      );
    } else if (currentReason === 'PROPERTY_AMBIGUITY') {
      if (propertyResolutionMode === 'PROTOCOL_PASS') {
        setJustification(
          '依据供需双方订货技术协议及工程补充技术条件，该特种非标检验项目系协议增补验证条款，实测数据齐全，质检员核准予以特批放行。'
        );
      } else if (propertyResolutionMode === 'MAP_STANDARD') {
        const targetRule = activeCandidateRules.find(r => r.key === selectedTargetPropertyKey);
        const targetDesc = targetRule
          ? `【${targetRule.name}】(${targetRule.key}${targetRule.requirement_text ? `，要求: ${targetRule.requirement_text}` : ''})`
          : `[${selectedTargetPropertyKey}]`;
        setJustification(
          `经质检工程师工程分析与规程复核：认定质保书原始项目【${ambiguousPropName}】在工程性能与检验目的上等效于现行标准指标 ${targetDesc}，准予按标准限值实施核验。`
        );
      } else {
        setJustification(
          '该特种非标指标缺乏规范准入依据且未经订货技术协议书面认可，不予采纳，作缺项否决退货处置。'
        );
      }
    } else {
      setJustification(
        '根据质保书化学成分及供货合同技术协议，人工确认该材料牌号。'
      );
    }
  }, [currentReason, acceptAlternative, selectedArbitratedStandard, qualitativeVerdict, propertyResolutionMode, selectedTargetPropertyKey, activeCandidateRules, ambiguousPropName]);

  // 点击外部收起模糊匹配下拉浮层
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        setHighlightIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 选中模糊匹配候选条目
  const handleSelectFuzzyItem = useCallback((item: FuzzyGradeItem) => {
    // 输入框回填标准全称显示（例如 022Cr17Ni12Mo2 (S31603)）
    setCustomGrade(item.display_name);
    // 底层记录规范主牌号，确保路由切片无歧义
    setSelectedCustomGradeTarget(item.primary_grade || item.spec_key);
    setIsDropdownOpen(false);
    setHighlightIndex(-1);
  }, []);

  // 输入框文本变化
  const handleCustomGradeInputChange = (val: string) => {
    setCustomGrade(val);
    setSelectedCustomGradeTarget(val.trim());
    setIsDropdownOpen(true);
    setHighlightIndex(-1);
  };

  // 输入框键盘快捷操作
  const handleCustomGradeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen || fuzzyResults.length === 0) {
      if (e.key === 'ArrowDown') {
        setIsDropdownOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev + 1 >= fuzzyResults.length ? 0 : prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev <= 0 ? fuzzyResults.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      if (highlightIndex >= 0 && highlightIndex < fuzzyResults.length) {
        e.preventDefault();
        handleSelectFuzzyItem(fuzzyResults[highlightIndex]!);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      setHighlightIndex(-1);
    }
  };

  // 一键清空输入框
  const handleClearCustomGrade = () => {
    setCustomGrade('');
    setSelectedCustomGradeTarget('');
    setIsDropdownOpen(false);
    setHighlightIndex(-1);
    inputRef.current?.focus();
  };

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const payload: HumanCorrectionInput = {
      inspector_id: 'QC-Engineer (质检工程师)',
      waiver_notes: justification,
    };

    if (currentReason === 'UNKNOWN_GRADE' || currentReason === 'LOW_CONFIDENCE') {
      const targetGrade = selectedGrade === 'CUSTOM'
        ? (selectedCustomGradeTarget || customGrade)
        : selectedGrade;
      payload.corrected_grade = targetGrade;
    } else if (currentReason === 'ALTERNATIVE_CLAUSE') {
      payload.accepted_alternative_clause = acceptAlternative;
    } else if (currentReason === 'MULTI_STANDARD_CONFLICT') {
      payload.arbitrated_standard_id = selectedArbitratedStandard;
    } else if (currentReason === 'QUALITATIVE_AMBIGUITY') {
      payload.qualitative_verdict = qualitativeVerdict;
    } else if (currentReason === 'PROPERTY_AMBIGUITY') {
      if (propertyResolutionMode === 'PROTOCOL_PASS') {
        payload.corrected_property_keys = {
          [ambiguousPropName]: 'special_protocol_item',
        };
      } else if (propertyResolutionMode === 'MAP_STANDARD') {
        payload.corrected_property_keys = {
          [ambiguousPropName]: selectedTargetPropertyKey,
        };
      } else {
        payload.corrected_property_keys = {
          [ambiguousPropName]: 'unrecognized_rejected_item',
        };
      }
    } else {
      const targetGrade = selectedGrade === 'CUSTOM'
        ? (selectedCustomGradeTarget || customGrade)
        : selectedGrade;
      payload.corrected_grade = targetGrade;
    }

    await onSubmitResume(payload);
  };

  const getHeaderScenarioBadge = () => {
    switch (currentReason) {
      case 'ALTERNATIVE_CLAUSE':
        return { label: '替代条款合规确权', icon: 'swap_horiz' };
      case 'MULTI_STANDARD_CONFLICT':
        return { label: '多标准互斥仲裁', icon: 'balance' };
      case 'QUALITATIVE_AMBIGUITY':
        return { label: '定性条款语义争议', icon: 'psychology' };
      case 'PROPERTY_AMBIGUITY':
        return { label: '特种属性语义歧义裁定', icon: 'tune' };
      default:
        return { label: '材料牌号消歧与确认', icon: 'fingerprint' };
    }
  };

  const headerBadge = getHeaderScenarioBadge();

  return (
    <div className="fixed inset-0 z-50 flex justify-end select-none">
      {/* 遮罩背景 */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
      />

      {/* 520px 抽屉主体 (方案 A) */}
      <div className="relative w-full max-w-[520px] h-full bg-surface-container-lowest dark:bg-surface-dark border-l border-outline-variant/60 dark:border-border-dark shadow-2xl flex flex-col z-10 text-on-surface dark:text-surface-bright overflow-hidden">

        {/* 1. 顶部标头 */}
        <div className="p-5 border-b border-outline-variant/40 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 flex items-center justify-center border border-amber-300 dark:border-amber-700 shadow-xs">
                <span className="material-symbols-outlined text-2xl">{headerBadge.icon}</span>
              </div>
              <div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 text-[12px] font-bold">
                  质检任务已挂起 · 需人机协同裁定
                </span>
                <h2 className="text-sm font-bold mt-1 text-on-surface dark:text-surface-bright">
                  任务编号: #{taskId || 'TK-20260828-01'}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>

          <div className="text-xs text-on-surface-variant dark:text-outline-variant flex items-center gap-1.5">
            <span>协同类型：{headerBadge.label}</span>
          </div>
        </div>

        {/* 2. 抽屉滚动内容区 */}
        <div className="flex-1 p-5 overflow-y-auto custom-scrollbar space-y-5 text-xs">

          {/* 挂起事实与原因说明看板 */}
          <div className="rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 p-4 space-y-2 shadow-xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200 text-xs">
              <span className="material-symbols-outlined text-base text-amber-600 dark:text-amber-400">info</span>
              <span>挂起原因</span>
            </div>
            <div className="text-sm font-bold text-amber-950 dark:text-amber-100 leading-snug font-sans">
              {hitlContext?.prompt_message || '系统存在无法自主推断的规则前提阻断'}
            </div>
            <p className="text-[12px] text-amber-800/80 dark:text-amber-300/80 leading-relaxed font-sans pt-1 border-t border-amber-200/60 dark:border-amber-800/40">
              根据检验安全规则，系统无法自动出具确定性计算结果，需人工指定裁定参数后恢复流转。
            </p>
          </div>

          {/* 场景 1：材料牌号语义消歧 */}
          {(currentReason === 'UNKNOWN_GRADE' || currentReason === 'LOW_CONFIDENCE') && (
            <div className="space-y-3">
              <label className="font-bold text-on-surface dark:text-surface-bright block text-xs">
                选择推荐候选国家标准钢级 (Recommended Candidates)
              </label>

              <div className="space-y-2">
                {candidateList.length > 0 ? (
                  candidateList.map(cand => (
                    <label
                      key={cand.id}
                      className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${selectedGrade === cand.id
                        ? 'border-primary dark:border-primary-fixed-dim bg-primary/5 dark:bg-primary-fixed-dim/10 shadow-xs'
                        : 'border-outline-variant/60 dark:border-border-dark hover:border-outline bg-surface-container-lowest dark:bg-surface-dark'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="candidateGrade"
                          value={cand.id}
                          checked={selectedGrade === cand.id}
                          onChange={() => setSelectedGrade(cand.id)}
                          className="text-primary focus:ring-primary h-4 w-4"
                        />
                        <div>
                          <span className="font-bold text-on-surface dark:text-surface-bright block text-xs">
                            {cand.code}
                          </span>
                          <span className="text-[12px] text-on-surface-variant dark:text-outline-variant">
                            {cand.standard}
                          </span>
                        </div>
                      </div>
                      <span className={`text-[12px] font-bold px-2 py-0.5 rounded ${cand.recommended
                        ? 'bg-status-pass-bg text-status-pass-text'
                        : 'bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant'
                        }`}>
                        {cand.match}
                      </span>
                    </label>
                  ))
                ) : (
                  <div className="p-3.5 rounded-xl border border-dashed border-outline-variant/80 dark:border-border-dark text-center">
                    <p className="text-xs text-on-surface-variant dark:text-outline-variant">
                      当前标准规则库未检索到高匹配候选，请使用下方手动输入指定国家标准牌号
                    </p>
                  </div>
                )}

                {/* 手动指定其他标准钢级 (支持多维模糊匹配与键盘操作) */}
                <div
                  ref={dropdownContainerRef}
                  className={`p-3.5 rounded-xl border transition-all ${selectedGrade === 'CUSTOM'
                    ? 'border-primary dark:border-primary-fixed-dim bg-primary/5'
                    : 'border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark'
                    }`}
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="candidateGrade"
                      value="CUSTOM"
                      checked={selectedGrade === 'CUSTOM'}
                      onChange={() => {
                        setSelectedGrade('CUSTOM');
                        setTimeout(() => inputRef.current?.focus(), 50);
                      }}
                      className="text-primary focus:ring-primary h-4 w-4 mt-0.5"
                    />
                    <div className="flex-1">
                      <span className="font-medium text-on-surface dark:text-surface-bright block text-xs">
                        手动输入其他标准钢级代号
                      </span>
                    </div>
                  </label>

                  {selectedGrade === 'CUSTOM' && (
                    <div className="relative mt-2 pl-7">
                      <div className="relative flex items-center">
                        <input
                          ref={inputRef}
                          type="text"
                          value={customGrade}
                          onChange={e => handleCustomGradeInputChange(e.target.value)}
                          onFocus={() => {
                            if (customGrade.trim()) setIsDropdownOpen(true);
                          }}
                          onKeyDown={handleCustomGradeKeyDown}
                          placeholder="输入统一代号、化学牌号或别名 (如 316L, S31603)"
                          className="w-full text-xs border border-outline-variant dark:border-border-dark rounded-lg bg-surface-container-lowest dark:bg-surface-dark pl-3 pr-8 py-2 text-on-surface dark:text-surface-bright focus:border-primary focus:outline-none transition-colors"
                        />
                        {customGrade && (
                          <button
                            type="button"
                            onClick={handleClearCustomGrade}
                            className="absolute right-2 text-on-surface-variant hover:text-on-surface p-1 rounded-full text-xs cursor-pointer"
                            title="清空输入"
                          >
                            <span className="material-symbols-outlined text-sm block">close</span>
                          </button>
                        )}
                      </div>

                      {/* 模糊匹配下拉联想浮层 */}
                      {isDropdownOpen && fuzzyResults.length > 0 && (
                        <div className="absolute left-7 right-0 top-full mt-1.5 z-50 rounded-xl border border-outline-variant/80 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark shadow-xl overflow-hidden max-h-56 overflow-y-auto custom-scrollbar">
                          <div className="py-1 divide-y divide-outline-variant/20 dark:divide-border-dark/60">
                            {fuzzyResults.map((item, index) => {
                              const isHighlighted = index === highlightIndex;
                              return (
                                <div
                                  key={`${item.standard_id}::${item.primary_grade}::${item.unified_code || ''}`}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSelectFuzzyItem(item);
                                  }}
                                  onMouseEnter={() => setHighlightIndex(index)}
                                  className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                                    isHighlighted
                                      ? 'bg-primary/10 dark:bg-primary/20 text-primary'
                                      : 'hover:bg-surface-container dark:hover:bg-surface-dark-high text-on-surface dark:text-surface-bright'
                                  }`}
                                >
                                  <div className="flex-1 pr-2">
                                    <div className="font-bold text-xs flex items-center gap-1.5">
                                      <span>{item.display_name}</span>
                                      {item.matchedAlias && (
                                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-300 dark:border-amber-700/60">
                                          命中别名: {item.matchedAlias}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-[11px] font-sans px-1.5 py-0.5 rounded bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant shrink-0">
                                    {item.standard_id}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="px-3 py-1.5 bg-surface-container/60 dark:bg-surface-dark-low text-[11px] text-on-surface-variant flex items-center justify-between border-t border-outline-variant/30">
                            <span>按 ↑ ↓ 方向键选择，Enter 回车确认</span>
                            <span>匹配到 {fuzzyResults.length} 项</span>
                          </div>
                        </div>
                      )}

                      {/* 选定标准未命中候选时的轻量提示 */}
                      {isDropdownOpen && customGrade.trim() && fuzzyResults.length === 0 && (
                        <div className="absolute left-7 right-0 top-full mt-1.5 z-50 rounded-xl border border-outline-variant/80 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark shadow-xl p-3 text-center">
                          <p className="text-xs text-on-surface-variant dark:text-outline-variant">
                            当前选定标准库未检索到匹配钢级，将按您输入的自定义代号提交
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 场景 2：标准替代条款确权 (如涡流替代水压) */}
          {currentReason === 'ALTERNATIVE_CLAUSE' && (
            <div className="space-y-3">
              <label className="font-bold text-on-surface dark:text-surface-bright block text-xs">
                检验项目等效替代认定与合同履约裁定
              </label>

              {/* 替代依据信息卡 */}
              <div className="p-3.5 rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-on-surface-variant">标准依据条款:</span>
                  <span className="font-bold text-on-surface">
                    {hitlContext?.alternative_details?.standard_id
                      ? `${hitlContext.alternative_details.standard_id} ${hitlContext.alternative_details.clause_no || ''}`
                      : '标准等效替代条款'}
                  </span>
                </div>
                <div className="text-[12px] text-on-surface-variant leading-relaxed">
                  标准原文：“{hitlContext?.alternative_details?.clause_title || '标准允许经供需双方协商由供方出具符合要求的检验报告作为等效替代依据'}”。
                </div>
                <div className="border-t border-outline-variant/30 pt-2 flex items-center justify-between text-xs">
                  <span className="text-on-surface-variant">质保书出具事实:</span>
                  <span className="font-bold text-primary">
                    {hitlContext?.alternative_details?.raw_evidence || '质保书已出具相关检验合格报告'}
                  </span>
                </div>
              </div>

              {/* 质检员确认二选一 */}
              <div className="space-y-2 pt-1">
                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${acceptAlternative
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-xs'
                    : 'border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark'
                    }`}
                >
                  <input
                    type="radio"
                    name="altChoice"
                    checked={acceptAlternative}
                    onChange={() => setAcceptAlternative(true)}
                    className="text-emerald-600 focus:ring-emerald-500 h-4 w-4 mt-0.5"
                  />
                  <div>
                    <span className="font-bold text-on-surface dark:text-surface-bright block text-xs">
                      认可替代（采纳替代检验方案）
                    </span>
                    <span className="text-[12px] text-on-surface-variant dark:text-outline-variant leading-relaxed block mt-0.5">
                      确认订货技术协议允许以该项检验替代常规试验，对应指标判定为合规通过 (PASS)。
                    </span>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${!acceptAlternative
                    ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20 shadow-xs'
                    : 'border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark'
                    }`}
                >
                  <input
                    type="radio"
                    name="altChoice"
                    checked={!acceptAlternative}
                    onChange={() => setAcceptAlternative(false)}
                    className="text-red-600 focus:ring-red-500 h-4 w-4 mt-0.5"
                  />
                  <div>
                    <span className="font-bold text-on-surface dark:text-surface-bright block text-xs">
                      不予认可（按缺项否决处理）
                    </span>
                    <span className="text-[12px] text-on-surface-variant dark:text-outline-variant leading-relaxed block mt-0.5">
                      订货协议未明确授权或工程场景要求特定实测，不予采纳替代，作缺项否决 (FAIL)。
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* 场景 3：多标准冲突主标尺选择 */}
          {currentReason === 'MULTI_STANDARD_CONFLICT' && (
            <div className="space-y-3">
              <label className="font-bold text-on-surface dark:text-surface-bright block text-xs">
                选择争议检验项的主仲裁标尺
              </label>

              <div className="space-y-2">
                {[
                  { id: 'GB/T 13296-2023', title: 'GB/T 13296-2023 (锅炉热交换器用不锈钢无缝钢管)', desc: '通用国家标准，执行常规工艺与公差准入' },
                  { id: 'NB/T 47019.5-2021', title: 'NB/T 47019.5-2021 (承压设备用管订货技术条件)', desc: '能源行业标准，针对承压特种设备强化要求' },
                ].map(std => (
                  <label
                    key={std.id}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${selectedArbitratedStandard === std.id
                      ? 'border-primary bg-primary/5 shadow-xs'
                      : 'border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark'
                      }`}
                  >
                    <input
                      type="radio"
                      name="arbitratedStandard"
                      value={std.id}
                      checked={selectedArbitratedStandard === std.id}
                      onChange={() => setSelectedArbitratedStandard(std.id)}
                      className="text-primary focus:ring-primary h-4 w-4 mt-0.5"
                    />
                    <div>
                      <span className="font-bold text-on-surface dark:text-surface-bright block text-xs">
                        {std.title}
                      </span>
                      <span className="text-[12px] text-on-surface-variant dark:text-outline-variant block mt-0.5">
                        {std.desc}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 场景 4：定性语义条款争议裁定 */}
          {currentReason === 'QUALITATIVE_AMBIGUITY' && (
            <div className="space-y-3">
              <label className="font-bold text-on-surface dark:text-surface-bright block text-xs">
                定性描述条款专业复核与合规仲裁
              </label>

              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low">
                <div>
                  <span className="text-[12px] font-bold text-on-surface-variant block mb-1">质保书原始描述</span>
                  <div className="text-xs text-on-surface bg-surface-container-lowest dark:bg-surface-dark p-2.5 rounded-lg border border-outline-variant/40 leading-relaxed">
                    晶间腐蚀试验合格，经敏化处理后硫酸-硫酸铜法弯曲检验，显微镜下见轻微滑移线无深层开裂。
                  </div>
                </div>
                <div>
                  <span className="text-[12px] font-bold text-on-surface-variant block mb-1">执行标准规范要求</span>
                  <div className="text-xs text-on-surface bg-surface-container-lowest dark:bg-surface-dark p-2.5 rounded-lg border border-outline-variant/40 leading-relaxed">
                    GB/T 4334-2020 检验方法 E：试样经弯曲后，弯曲表面不得有晶间腐蚀裂纹。
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${qualitativeVerdict === 'PASS'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 font-bold shadow-xs'
                  : 'border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface'
                  }`}>
                  <input
                    type="radio"
                    name="qualitativeChoice"
                    checked={qualitativeVerdict === 'PASS'}
                    onChange={() => setQualitativeVerdict('PASS')}
                    className="text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <span>裁定符合标准要求 (PASS)</span>
                </label>

                <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${qualitativeVerdict === 'FAIL'
                  ? 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200 font-bold shadow-xs'
                  : 'border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface'
                  }`}>
                  <input
                    type="radio"
                    name="qualitativeChoice"
                    checked={qualitativeVerdict === 'FAIL'}
                    onChange={() => setQualitativeVerdict('FAIL')}
                    className="text-red-600 focus:ring-red-500 h-4 w-4"
                  />
                  <span>存在缺陷/要求复验 (FAIL)</span>
                </label>
              </div>
            </div>
          )}

          {/* 场景 5：特种属性语义歧义裁定 */}
          {currentReason === 'PROPERTY_AMBIGUITY' && (
            <div className="space-y-3">
              <label className="font-bold text-on-surface dark:text-surface-bright block text-xs">
                特种非标检验项目合规处置决策
              </label>

              {/* 实测未决项目详情看板 */}
              <div className="p-3.5 rounded-xl border border-outline-variant/60 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-on-surface-variant">质保书原始项目:</span>
                  <span className="font-bold text-on-surface">{ambiguousPropName}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-on-surface-variant">报告测量实测值:</span>
                  <span className="font-bold text-primary font-mono text-[13px]">{ambiguousPropVal}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-on-surface-variant">所属检验分类:</span>
                  <span className="text-on-surface font-medium">
                    {ambiguousPropCategory === 'mechanical' ? '力学性能 (mechanical)' : ambiguousPropCategory}
                  </span>
                </div>
                <div className="border-t border-outline-variant/30 pt-2 text-[12px] text-on-surface-variant leading-relaxed">
                  <span className="font-bold text-amber-700 dark:text-amber-400">AI 意图诊断: </span>
                  {ambiguousReasoning}
                </div>
              </div>

              {/* 3 种处置决策单选卡片 */}
              <div className="space-y-2 pt-1">
                {/* 选项 1: 协议特约放行 */}
                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${propertyResolutionMode === 'PROTOCOL_PASS'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-xs'
                    : 'border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark'
                    }`}
                >
                  <input
                    type="radio"
                    name="propertyResolutionChoice"
                    checked={propertyResolutionMode === 'PROTOCOL_PASS'}
                    onChange={() => setPropertyResolutionMode('PROTOCOL_PASS')}
                    className="text-emerald-600 focus:ring-emerald-500 h-4 w-4 mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-on-surface dark:text-surface-bright block text-xs">
                        认可为供需协议特约合格项 (放行 PASS)
                      </span>
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                        推荐
                      </span>
                    </div>
                    <span className="text-[12px] text-on-surface-variant dark:text-outline-variant leading-relaxed block mt-0.5">
                      确认该指标系订货技术协议增补验证项目，实测数据完整合规，纳入合格放行依据。
                    </span>
                  </div>
                </label>

                {/* 选项 2: 映射至现行标准条款 */}
                <div
                  className={`p-3.5 rounded-xl border transition-all ${propertyResolutionMode === 'MAP_STANDARD'
                    ? 'border-primary bg-primary/5 shadow-xs'
                    : 'border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark'
                    }`}
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="propertyResolutionChoice"
                      checked={propertyResolutionMode === 'MAP_STANDARD'}
                      onChange={() => setPropertyResolutionMode('MAP_STANDARD')}
                      className="text-primary focus:ring-primary h-4 w-4 mt-0.5"
                    />
                    <div className="flex-1">
                      <span className="font-bold text-on-surface dark:text-surface-bright block text-xs">
                        映射对齐至现行标准指标
                      </span>
                      <span className="text-[12px] text-on-surface-variant dark:text-outline-variant leading-relaxed block mt-0.5">
                        认定该特种非标指标在工程性能上等效于现行标准已有条款，按标准限值实施核验。
                      </span>
                    </div>
                  </label>

                  {propertyResolutionMode === 'MAP_STANDARD' && (
                    <div className="mt-2.5 pl-7">
                      <label className="text-[11px] text-on-surface-variant block mb-1 font-medium">
                        选择现行标准对应指标条款:
                      </label>
                      <select
                        value={selectedTargetPropertyKey}
                        onChange={e => setSelectedTargetPropertyKey(e.target.value)}
                        className="w-full text-xs border border-outline-variant dark:border-border-dark rounded-lg bg-surface-container-lowest dark:bg-surface-dark px-3 py-2 text-on-surface dark:text-surface-bright focus:border-primary focus:outline-none"
                      >
                        {groupedRules.map(([catKey, group]) => (
                          <optgroup
                            key={catKey}
                            label={group.label}
                            className="font-bold text-on-surface bg-surface-container-low dark:bg-surface-dark-low"
                          >
                            {group.rules.map(rule => (
                              <option
                                key={rule.key}
                                value={rule.key}
                                className="font-normal text-on-surface dark:text-surface-bright"
                              >
                                {rule.name} ({rule.key}){rule.requirement_text ? ` — ${rule.requirement_text}` : (rule.unit ? ` [${rule.unit}]` : '')}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* 选项 3: 不予认可 / 判定无效 */}
                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${propertyResolutionMode === 'REJECT'
                    ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20 shadow-xs'
                    : 'border-outline-variant/60 dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark'
                    }`}
                >
                  <input
                    type="radio"
                    name="propertyResolutionChoice"
                    checked={propertyResolutionMode === 'REJECT'}
                    onChange={() => setPropertyResolutionMode('REJECT')}
                    className="text-red-600 focus:ring-red-500 h-4 w-4 mt-0.5"
                  />
                  <div className="flex-1">
                    <span className="font-bold text-on-surface dark:text-surface-bright block text-xs">
                      不予认可 / 判定无效 (缺项否决 FAIL)
                    </span>
                    <span className="text-[12px] text-on-surface-variant dark:text-outline-variant leading-relaxed block mt-0.5">
                      该非标指标缺乏权威规范依据且未经技术协议认可，不予采纳，作缺项否决处理。
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* 3. 质检工程师处理说明与依据 (所有场景共用) */}
          <div className="space-y-1.5 pt-2">
            <label htmlFor="hitl-justification" className="font-bold text-on-surface dark:text-surface-bright block text-xs">
              质检裁定依据与审批说明 (必填)
            </label>
            <textarea
              id="hitl-justification"
              value={justification}
              onChange={e => setJustification(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark px-3 py-2.5 text-xs text-on-surface dark:text-surface-bright focus:border-primary focus:outline-none leading-relaxed"
            />
          </div>

        </div>

        {/* 5. 抽屉底部动作栏 */}
        <div className="p-4 border-t border-outline-variant/40 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2.5 border border-outline-variant dark:border-border-dark rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-lowest transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">schedule</span>
            <span>挂起暂不处理</span>
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-base ${isSubmitting ? 'animate-spin' : ''}`}>
              {isSubmitting ? 'autorenew' : 'check_circle'}
            </span>
            <span>{isSubmitting ? '正在计算恢复中...' : '确认并恢复流转'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
