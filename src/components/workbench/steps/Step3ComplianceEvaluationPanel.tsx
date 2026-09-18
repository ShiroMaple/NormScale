'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  InspectionSession,
  SessionDocument,
  BatchSpecimen,
} from '@/types/session.ts';
import { BatchContextBar } from '../../BatchContextBar.tsx';
import {
  resolveFinalDisposition,
  getDispositionBadgeMeta,
  SystemVerdict,
  HumanVerdict,
} from '@/engine/dual-track-verdict.ts';
import { normalizeStandardId, areStandardCollectionsEquivalent } from '@/lib/utils.ts';
import {
  StandardCatalogItem,
  BatchPresentationState,
  TotalCombinedMetrics,
  formatHitlReasonBadge,
} from '../types.ts';
import { HitlInterruptContext, PropertyResolutionCandidate } from '@/workflow/state.interface.ts';

export interface Step3ComplianceEvaluationPanelProps {
  session: InspectionSession;
  selectedDocId: string;
  selectedBatchNo: string;
  onSelectDoc: (docId: string) => void;
  onSelectBatch: (docId: string, batchNo: string) => void;
  currentDoc?: SessionDocument;
  currentBatch?: BatchSpecimen;
  activeGrade?: string;
  activeStandard?: string;
  isGradeOverridden?: boolean;
  isStandardOverridden?: boolean;
  isOverridden?: boolean;
  isEvaluatingBatch: boolean;
  onEvaluateBatch: (batch?: BatchSpecimen, forcedStdIds?: string[]) => void;
  onResetGrade: () => void;
  dynamicStandardsCatalog: StandardCatalogItem[];
  selectedStandardIds: string[];
  onToggleStandard: (stdId: string) => void;
  batchPresentationMap: Record<string, BatchPresentationState>;
  onInlineAdoptHitl: (batchNo: string, ctx?: HitlInterruptContext) => void;
  onTriggerHitl: () => void;
  onSetHumanVerdict: (humanDecision: 'PASS' | 'REJECT' | null) => void;
  onGoToStep: (stepIdx: number) => void;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  parsingTasks?: Record<string, any>;
  totalCombinedMetrics: TotalCombinedMetrics;
  isCapturing?: boolean;
}

interface ComplianceMatrixRow {
  id: string;
  category: 'chemical' | 'mechanical' | 'process' | 'metallographic' | 'corrosion' | 'ndt' | 'dimensions' | 'additional';
  categoryLabel: string;
  categoryColor: string;
  name: string;
  measuredValue: string;
  standardRequirement: string;
  deviation: string;
  isDeviationWarning?: boolean;
  status: 'PASS' | 'FAIL' | 'HITL' | 'INFO';
  statusLabel: string;
  detailTag?: { label: string; color: string };
  ruleBasis: string;
  note?: string;
  isScissorsDifference?: boolean;
  strictStandardId?: string;
  scissorsAttribution?: string;
  multiStandardEvaluations?: Array<{
    standard_id: string;
    standard_short: string;
    requirement_text: string;
    status: string;
    is_governing?: boolean;
    message?: string;
  }>;
}

/**
 * 步骤 3: 质检工作台 - 比对执行标准与全景比对矩阵面板
 */
export const Step3ComplianceEvaluationPanel: React.FC<Step3ComplianceEvaluationPanelProps> = ({
  session,
  selectedDocId,
  selectedBatchNo,
  onSelectDoc,
  onSelectBatch,
  currentDoc: propDoc,
  currentBatch: propBatch,
  activeGrade: propActiveGrade,
  activeStandard: propActiveStandard,
  isGradeOverridden: propIsGradeOverridden,
  isStandardOverridden: propIsStandardOverridden,
  isOverridden: propIsOverridden,
  isEvaluatingBatch,
  onEvaluateBatch,
  onResetGrade,
  dynamicStandardsCatalog,
  selectedStandardIds,
  onToggleStandard,
  batchPresentationMap,
  onInlineAdoptHitl,
  onTriggerHitl,
  onSetHumanVerdict,
  onGoToStep,
  scrollContainerRef,
  parsingTasks,
  totalCombinedMetrics,
  isCapturing = false,
}) => {
  // 步骤 3: 全景合规比对矩阵分类页签与标准多选/技术协议选择控件状态
  const [step3Category, setStep3Category] = useState<string>('all');
  const [isStandardSelectorOpen, setIsStandardSelectorOpen] = useState<boolean>(false);
  const [isAgreementSelectorOpen, setIsAgreementSelectorOpen] = useState<boolean>(false);
  const [standardSearchQuery, setStandardSearchQuery] = useState<string>('');
  const isReevaluatingCooldownRef = useRef<boolean>(false);

  // 获得当前选中的物理 Document 和 Batch
  const currentDoc: SessionDocument | undefined =
    propDoc || session.documents.find(d => d.docId === selectedDocId) || session.documents[0];

  const currentBatch: BatchSpecimen | undefined =
    propBatch || currentDoc?.batches.find(b => b.batchNo === selectedBatchNo) || currentDoc?.batches[0];

  const isGradeOverridden = propIsGradeOverridden !== undefined
    ? propIsGradeOverridden
    : Boolean(currentBatch?.overrideGrade && currentBatch.overrideGrade !== currentBatch.grade);

  const isStandardOverridden = propIsStandardOverridden !== undefined
    ? propIsStandardOverridden
    : Boolean(
      currentBatch?.overrideStandard &&
      !areStandardCollectionsEquivalent(currentBatch.overrideStandard, currentBatch.standard)
    );

  const isOverridden = propIsOverridden !== undefined ? propIsOverridden : (isGradeOverridden || isStandardOverridden);

  const activeGrade = propActiveGrade !== undefined
    ? propActiveGrade
    : (currentBatch ? (isGradeOverridden ? currentBatch.overrideGrade! : currentBatch.grade) : '');

  const activeStandard = propActiveStandard !== undefined
    ? propActiveStandard
    : (currentBatch ? (isStandardOverridden ? currentBatch.overrideStandard! : currentBatch.standard) : '');

  const computedIsPass = currentBatch?.verdict === 'PASS';
  let computedVerdictSummary = currentBatch?.verdictSummary || '';

  if (isOverridden && currentBatch) {
    computedVerdictSummary = currentBatch.verdictSummary || `人工指定为 ${activeGrade} (${activeStandard})，待核验规则重新判定`;
  }

  const currentDocTask = parsingTasks ? parsingTasks[selectedDocId] : undefined;
  const isDocParsing = Boolean(currentDoc && (currentDoc.ocrStatus === 'PENDING' || currentDocTask?.status === 'parsing'));
  const isHitl = Boolean(currentBatch && currentBatch.verdict === 'MANUAL_REVIEW' && !isDocParsing);

  // 构建全景比对矩阵数据项 (100% 来源于后端合规引擎 AuditReport 直出，杜绝硬编码伪造)
  const complianceMatrixItems = useMemo<ComplianceMatrixRow[]>(() => {
    if (!currentBatch || !currentBatch.auditReport || !Array.isArray(currentBatch.auditReport.item_results)) {
      return [];
    }

    const items: ComplianceMatrixRow[] = [];
    const categoryMeta: Record<string, { label: string; color: string }> = {
      chemical: { label: '化分', color: 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
      mechanical: { label: '力学', color: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
      process: { label: '工艺', color: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
      metallographic: { label: '金相', color: 'text-cyan-700 bg-cyan-50 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800' },
      corrosion: { label: '腐蚀', color: 'text-orange-700 bg-orange-50 dark:bg-orange-950/60 dark:text-orange-300 border-orange-200 dark:border-orange-800' },
      ndt: { label: '探伤', color: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' },
      dimensions: { label: '尺寸', color: 'text-teal-700 bg-teal-50 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800' },
      additional: { label: '附加', color: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700' },
    };

    currentBatch.auditReport.item_results.forEach((item, idx) => {
      const isPass = item.status === 'PASS';
      const isMissing = item.status === 'MISSING';
      const isSkipped = item.status === 'SKIPPED';
      const isExempt = item.status === 'EXEMPT';
      const isScissors = Boolean(item.is_scissors_difference);

      const defaultMeta = { label: '扩展', color: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700' };
      const catKey = item.category in categoryMeta ? item.category : 'additional';
      const meta = categoryMeta[catKey] ?? defaultMeta;

      let statusLabel = '✓ PASS';
      let rowStatus: 'PASS' | 'FAIL' | 'HITL' | 'INFO' = 'PASS';
      let detailTag: { label: string; color: string } | undefined = undefined;

      if (isScissors) {
        rowStatus = 'FAIL';
        statusLabel = '✗ FAIL';
        detailTag = {
          label: '剪刀差未达标',
          color: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700',
        };
      } else if (isMissing) {
        rowStatus = 'FAIL';
        statusLabel = '✗ FAIL';
        detailTag = {
          label: '缺项漏检',
          color: 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700',
        };
      } else if (!isPass && !isSkipped && !isExempt) {
        rowStatus = 'FAIL';
        statusLabel = '✗ FAIL';
      } else if (isSkipped) {
        rowStatus = 'INFO';
        statusLabel = '- N/A';
        detailTag = {
          label: '不适用',
          color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
        };
      } else if (isExempt) {
        rowStatus = 'PASS';
        statusLabel = '✓ PASS';
        detailTag = {
          label: '免检',
          color: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700',
        };
      }

      // 检查是否属于 Tier 2 消歧产出的指标或 HITL 人工对齐指标
      const currentBatchPres = batchPresentationMap[currentBatch.batchNo];
      const matchedResolved = currentBatchPres?.resolvedProperties?.find(
        rp => rp.resolved_key === item.property_key
      );
      const batchCorrection = (currentBatch as any).hitlCorrection || (currentBatch.auditReport as any)?.human_correction;
      const mappedRawEntry = batchCorrection?.corrected_property_keys
        ? Object.entries(batchCorrection.corrected_property_keys).find(([, targetKey]) => targetKey === item.property_key)
        : undefined;

      if (!detailTag && matchedResolved) {
        if (matchedResolved.is_degraded) {
          detailTag = {
            label: '本地规则降级',
            color: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700',
          };
        } else {
          detailTag = {
            label: 'AI对齐',
            color: 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700',
          };
        }
      } else if (!detailTag && mappedRawEntry) {
        detailTag = {
          label: 'HITL对齐',
          color: 'bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-700',
        };
      }

      const measuredDisplay = item.actual_value_text
        || (item.measured_value_num !== null && item.measured_value_num !== undefined ? String(item.measured_value_num) : (item.measured_value_raw || '--'));

      // 计算偏差量 / 吻合度
      let deviationText = '-';
      let isDeviationWarning = false;

      if (isSkipped) {
        deviationText = '-';
      } else if (item.status === 'FAIL') {
        isDeviationWarning = true;
        if (item.deviation !== null && item.deviation !== undefined && item.deviation !== 0) {
          let diffVal = item.deviation;
          if (item.standard_min !== null && item.standard_min !== undefined && item.rounded_value !== null && item.rounded_value !== undefined && item.rounded_value < item.standard_min) {
            diffVal = -Math.abs(diffVal);
          }
          const roundedDiff = Number(diffVal.toFixed(4));
          const sign = roundedDiff > 0 ? '+' : '';
          const unitStr = (item as any).unit || '';
          deviationText = `${sign}${roundedDiff}${unitStr}`;
        } else {
          deviationText = '未达标';
        }
      } else if (item.status === 'PASS' || isExempt) {
        if (item.rounded_value !== null && item.rounded_value !== undefined) {
          let criticalVal = item.rounded_value;
          if (item.measured_value_raw) {
            const nums = item.measured_value_raw.match(/-?\d+(\.\d+)?/g);
            if (nums && nums.length > 1) {
              const parsed = nums.map(n => parseFloat(n)).filter(n => !isNaN(n));
              if (parsed.length > 1) {
                if (item.standard_min !== null && (item.standard_max === null || item.standard_max === undefined)) {
                  criticalVal = Math.min(...parsed);
                } else if (item.standard_max !== null && (item.standard_min === null || item.standard_min === undefined)) {
                  criticalVal = Math.max(...parsed);
                } else if (item.standard_min !== null && item.standard_max !== null) {
                  criticalVal = parsed.reduce((closest, curr) => {
                    const distCurr = Math.min(Math.abs(curr - item.standard_min!), Math.abs(curr - item.standard_max!));
                    const distClosest = Math.min(Math.abs(closest - item.standard_min!), Math.abs(closest - item.standard_max!));
                    return distCurr < distClosest ? curr : closest;
                  }, parsed[0]!);
                }
              }
            }
          }

          let diff: number | null = null;
          const stdMin = item.standard_min ?? (item.formula_calculated_bound !== undefined ? item.formula_calculated_bound : null);
          const stdMax = item.standard_max ?? null;

          if (stdMin !== null && (stdMax === null || stdMax === undefined)) {
            diff = Number((criticalVal - stdMin).toFixed(4));
          } else if (stdMax !== null && (stdMin === null || stdMin === undefined)) {
            diff = Number((criticalVal - stdMax).toFixed(4));
          } else if (stdMin !== null && stdMax !== null) {
            const dMin = criticalVal - stdMin;
            const dMax = criticalVal - stdMax;
            diff = Math.abs(dMin) <= Math.abs(dMax) ? Number(dMin.toFixed(4)) : Number(dMax.toFixed(4));
          }

          if (diff !== null && !isNaN(diff)) {
            const sign = diff > 0 ? '+' : '';
            const unitStr = (item as any).unit || '';
            deviationText = `${sign}${diff}${unitStr}`;
          } else {
            deviationText = '达标';
          }
        } else {
          deviationText = '达标';
        }
      }

      let logicExplanation = item.message || (isPass ? '实测数据符合标准技术规范要求' : '实测数据未满足标准要求');
      if (matchedResolved) {
        if (matchedResolved.is_degraded) {
          logicExplanation = `[本地规则降级] 字段 [${matchedResolved.raw_name}] 经本地启发式规则对齐；\n${logicExplanation}`;
        } else {
          logicExplanation = `[${matchedResolved.model_name || '大模型'}] ${matchedResolved.reasoning}；\n${logicExplanation}`;
        }
      } else if (mappedRawEntry) {
        logicExplanation = `[原始字段【${mappedRawEntry[0]}】] ${currentBatch.humanVerdictSummary || batchCorrection?.waiver_notes || ''}；\n${logicExplanation}`;
      }

      items.push({
        id: item.rule_id || `rule_${item.property_key}_${idx}`,
        category: catKey as any,
        categoryLabel: meta.label,
        categoryColor: meta.color,
        name: item.display_name || item.property_key,
        measuredValue: measuredDisplay,
        standardRequirement: item.dual_standard_requirement_text || item.standard_requirement_text || '按标准技术要求',
        deviation: deviationText,
        isDeviationWarning,
        status: rowStatus,
        statusLabel,
        detailTag,
        ruleBasis: logicExplanation,
        isScissorsDifference: isScissors,
        strictStandardId: item.strict_standard_id,
        scissorsAttribution: item.scissors_attribution,
        multiStandardEvaluations: item.multi_standard_evaluations,
      });
    });

    // 处理未匹配记录项 (Unmatched Certificate Records) 及质检员 HITL 裁定项
    const addedKeys = new Set(items.map(i => i.name));
    const unmatchedRecords = currentBatch.auditReport.unmatched_certificate_records || [];
    const hitlCorrection =
      (currentBatch as any).hitlFieldCorrection ||
      (currentBatch as any).hitlCorrection ||
      (currentBatch.auditReport as any)?.human_correction ||
      (selectedBatchNo ? (batchPresentationMap[selectedBatchNo]?.hitlFieldCorrection || batchPresentationMap[selectedBatchNo]?.hitlCorrection) : undefined);

    const isSentinelKey = (str?: string | null): boolean => {
      if (!str) return true;
      const s = str.trim().toLowerCase();
      return s === 'special_protocol_item' || s === 'unrecognized_rejected_item';
    };

    for (const rec of unmatchedRecords) {
      let originalName: string | undefined = undefined;

      if (!isSentinelKey(rec.raw_property_name)) {
        originalName = rec.raw_property_name;
      }
      if (!originalName && !isSentinelKey(rec.display_name)) {
        originalName = rec.display_name;
      }
      if (!originalName && hitlCorrection?.corrected_property_keys) {
        const matchEntry = Object.entries(hitlCorrection.corrected_property_keys).find(
          ([k, v]) => v === rec.property_key || (rec.raw_property_name && k === rec.raw_property_name)
        );
        if (matchEntry && !isSentinelKey(matchEntry[0])) {
          originalName = matchEntry[0];
        }
      }
      if (!originalName && currentBatch?.additionalTests) {
        const matchedTest = currentBatch.additionalTests.find(t =>
          t && t.name && !isSentinelKey(t.name) &&
          (t.result === rec.measured_value_raw || String((t as any).value_num) === String(rec.measured_value_num))
        );
        if (matchedTest?.name) {
          originalName = matchedTest.name;
        }
      }

      const isProtocolApproved =
        rec.property_key === 'special_protocol_item' ||
        (rec as any).is_special_protocol ||
        Boolean(rec.raw_property_name && hitlCorrection?.corrected_property_keys?.[rec.raw_property_name] === 'special_protocol_item') ||
        Boolean(originalName && hitlCorrection?.corrected_property_keys?.[originalName] === 'special_protocol_item');

      const isRejected =
        rec.property_key === 'unrecognized_rejected_item' ||
        (rec as any).is_rejected ||
        Boolean(rec.raw_property_name && hitlCorrection?.corrected_property_keys?.[rec.raw_property_name] === 'unrecognized_rejected_item') ||
        Boolean(originalName && hitlCorrection?.corrected_property_keys?.[originalName] === 'unrecognized_rejected_item');

      let recName = originalName;
      if (!recName || isSentinelKey(recName)) {
        if (isProtocolApproved) {
          recName = '订货技术协议特约项目';
        } else if (isRejected) {
          recName = '未识别非标排除项';
        } else {
          recName = rec.raw_property_name || rec.display_name || '特约检验项目';
        }
      }

      if (!recName || addedKeys.has(recName)) continue;
      addedKeys.add(recName);

      const catKey = rec.category && rec.category in categoryMeta ? rec.category : 'additional';
      const defaultMeta = { label: '扩展', color: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700' };
      const meta = categoryMeta[catKey] ?? defaultMeta;
      const measuredDisplay = rec.measured_value_raw || (rec.measured_value_num !== null && rec.measured_value_num !== undefined ? String(rec.measured_value_num) : '--');

      if (isProtocolApproved) {
        items.push({
          id: `unmatched_protocol_${rec.property_key}_${items.length}`,
          category: catKey as any,
          categoryLabel: meta.label,
          categoryColor: meta.color,
          name: recName,
          measuredValue: measuredDisplay,
          standardRequirement: '订货技术协议特约增补条款 (协议放行)',
          deviation: '达标',
          status: 'PASS',
          statusLabel: '✓ PASS',
          detailTag: {
            label: '协议特约放行',
            color: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700',
          },
          ruleBasis: `[协议特约项: 质检工程师核准放行] ${hitlCorrection?.waiver_notes || (rec as any).waiver_notes || '经质检工程师裁定：确认该指标系订货技术协议增补验证项目，实测数据完整合规，纳入合格放行依据。'}`,
        });
      } else if (isRejected) {
        items.push({
          id: `unmatched_rejected_${rec.property_key}_${items.length}`,
          category: catKey as any,
          categoryLabel: meta.label,
          categoryColor: meta.color,
          name: recName,
          measuredValue: measuredDisplay,
          standardRequirement: '未经认可特种非标指标',
          deviation: '未达标',
          isDeviationWarning: true,
          status: 'FAIL',
          statusLabel: '✗ FAIL',
          detailTag: {
            label: '特种非标否决',
            color: 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700',
          },
          ruleBasis: `[质检裁定不予认可] ${hitlCorrection?.waiver_notes || (rec as any).waiver_notes || '该非标指标缺乏权威规范依据且未经技术协议认可，作缺项否决处理。'}`,
        });
      } else {
        items.push({
          id: `unmatched_extra_${rec.property_key}_${items.length}`,
          category: 'additional',
          categoryLabel: '扩展',
          categoryColor: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
          name: recName,
          measuredValue: measuredDisplay,
          standardRequirement: '现行标准未作强制要求',
          deviation: '-',
          status: 'INFO',
          statusLabel: '- N/A',
          detailTag: {
            label: '额外报送',
            color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
          },
          ruleBasis: '质保书额外报送项，标准库未定义比对规则，仅供存档参考',
        });
      }
    }

    // 检查 additionalTests 中经 HITL 裁定的条目
    if (Array.isArray(currentBatch.additionalTests)) {
      for (const addTest of currentBatch.additionalTests) {
        const testName = addTest.name || addTest.key;
        if (!testName || isSentinelKey(testName) || addedKeys.has(testName)) continue;

        const isProtocolApproved =
          hitlCorrection?.corrected_property_keys?.[addTest.key] === 'special_protocol_item' ||
          hitlCorrection?.corrected_property_keys?.[addTest.name] === 'special_protocol_item';

        const isRejected =
          hitlCorrection?.corrected_property_keys?.[addTest.key] === 'unrecognized_rejected_item' ||
          hitlCorrection?.corrected_property_keys?.[addTest.name] === 'unrecognized_rejected_item';

        if (isProtocolApproved || isRejected) {
          addedKeys.add(testName);
          const catKey = addTest.category && addTest.category in categoryMeta ? addTest.category : 'mechanical';
          const defaultMeta = { label: '扩展', color: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700' };
          const meta = categoryMeta[catKey] ?? defaultMeta;
          const measuredDisplay = addTest.result || (addTest.value_num !== undefined ? String(addTest.value_num) : '--');

          if (isProtocolApproved) {
            items.push({
              id: `hitl_protocol_${addTest.key}`,
              category: catKey as any,
              categoryLabel: meta.label,
              categoryColor: meta.color,
              name: testName,
              measuredValue: measuredDisplay,
              standardRequirement: '订货技术协议特约增补条款 (协议放行)',
              deviation: '达标',
              status: 'PASS',
              statusLabel: '✓ PASS',
              detailTag: {
                label: '协议特约放行',
                color: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700',
              },
              ruleBasis: `[协议特约项: 质检工程师核准放行] ${currentBatch.humanVerdictSummary || hitlCorrection?.waiver_notes || '确认该指标系订货技术协议增补验证项目，实测数据完整合规，纳入合格放行依据。'}`,
            });
          } else {
            items.push({
              id: `hitl_rejected_${addTest.key}`,
              category: catKey as any,
              categoryLabel: meta.label,
              categoryColor: meta.color,
              name: testName,
              measuredValue: measuredDisplay,
              standardRequirement: '未经认可特种非标指标',
              deviation: '未达标',
              isDeviationWarning: true,
              status: 'FAIL',
              statusLabel: '✗ FAIL',
              detailTag: {
                label: '特种非标否决',
                color: 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700',
              },
              ruleBasis: `[质检裁定不予认可] ${currentBatch.humanVerdictSummary || hitlCorrection?.waiver_notes || '该非标指标缺乏权威规范依据且未经技术协议认可，作缺项否决处理。'}`,
            });
          }
        }
      }
    }

    // 施工号与炉号追溯展示
    if (currentBatch.constructionNo && currentBatch.constructionNo !== '待提取' && currentBatch.constructionNo !== '') {
      items.push({
        id: 'custom_construction_no',
        category: 'additional',
        categoryLabel: '扩展',
        categoryColor: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
        name: '施工工程号 (Construction No.)',
        measuredValue: currentBatch.constructionNo,
        standardRequirement: '采购合同追溯标识',
        deviation: '-',
        status: 'INFO',
        statusLabel: '- N/A',
        detailTag: {
          label: '供参考',
          color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
        },
        ruleBasis: '按采购合同工程图纸核对追溯号',
      });
    }
    if (currentBatch.heatNo && currentBatch.heatNo !== '待提取' && currentBatch.heatNo !== '') {
      items.push({
        id: 'custom_heat_no',
        category: 'additional',
        categoryLabel: '扩展',
        categoryColor: 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
        name: '熔炼炉号 (Heat No.)',
        measuredValue: currentBatch.heatNo,
        standardRequirement: '炉批次追踪标识',
        deviation: '-',
        status: 'INFO',
        statusLabel: '- N/A',
        detailTag: {
          label: '供参考',
          color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
        },
        ruleBasis: '按原材料冶炼炉号与批次追溯系统核对',
      });
    }

    return items;
  }, [currentBatch, batchPresentationMap, selectedBatchNo]);

  const issueItems = useMemo(() => complianceMatrixItems.filter(i => i.status === 'FAIL' || i.status === 'HITL'), [complianceMatrixItems]);
  const missingCount = useMemo(() => complianceMatrixItems.filter(i => (i as any).detailTag?.label === '缺项漏检').length, [complianceMatrixItems]);
  const traceCount = useMemo(() => complianceMatrixItems.filter(i => i.id === 'custom_construction_no' || i.id === 'custom_heat_no').length, [complianceMatrixItems]);
  const alignedCount = complianceMatrixItems.length - missingCount - traceCount;

  const STEP3_TABS = useMemo(() => [
    {
      key: 'all',
      label: '全部比对项',
      count: complianceMatrixItems.length,
      tooltip: `全部比对项 (${complianceMatrixItems.length}) = 实测对齐 (${alignedCount}) + 标准缺漏检 (${missingCount}) + 工程追溯参考 (${traceCount})`,
    },
    { key: 'issues', label: '问题项', count: issueItems.length },
    { key: 'chemical', label: '化学成分', count: complianceMatrixItems.filter(i => i.category === 'chemical').length },
    { key: 'mechanical', label: '力学性能', count: complianceMatrixItems.filter(i => i.category === 'mechanical').length },
    { key: 'process', label: '工艺成型', count: complianceMatrixItems.filter(i => i.category === 'process').length },
    { key: 'metallographic', label: '金相组织', count: complianceMatrixItems.filter(i => i.category === 'metallographic').length },
    { key: 'corrosion', label: '耐腐蚀试验', count: complianceMatrixItems.filter(i => i.category === 'corrosion').length },
    { key: 'ndt', label: '无损探伤', count: complianceMatrixItems.filter(i => i.category === 'ndt').length },
    { key: 'dimensions', label: '尺寸与表面', count: complianceMatrixItems.filter(i => i.category === 'dimensions').length },
    { key: 'additional', label: '非标与扩展', count: complianceMatrixItems.filter(i => i.category === 'additional').length },
  ], [complianceMatrixItems, issueItems, alignedCount, missingCount, traceCount]);

  const displayedComplianceItems = useMemo(() => {
    if (step3Category === 'all') return complianceMatrixItems;
    if (step3Category === 'issues') return issueItems;
    return complianceMatrixItems.filter(item => item.category === step3Category);
  }, [step3Category, complianceMatrixItems, issueItems]);

  const currentBatchState = currentBatch ? batchPresentationMap[currentBatch.batchNo] : undefined;
  const isUnaudited = Boolean(currentBatch && currentBatch.verdict === 'UNAUDITED' && !currentBatch.auditReport);

  return (
    <section
      ref={scrollContainerRef as any}
      className="w-full h-full shrink-0 overflow-y-auto custom-scrollbar px-6 pb-6 pt-0"
    >
      <div id="step-3-workbench-panel" className="max-w-[1440px] mx-auto w-full space-y-4 pt-6">
        {/* 顶部统一标题与两层树状批次选择条 (固定在顶部，设置 z-40 确保下拉菜单浮于上方) */}
        <div className="relative z-40">
          <BatchContextBar
            stepTitle="步骤 3: 比对执行标准"
            session={session}
            selectedDocId={selectedDocId}
            selectedBatchNo={selectedBatchNo}
            onSelectDoc={onSelectDoc}
            onSelectBatch={onSelectBatch}
            mode="compliance"
            docParsingTasks={parsingTasks}
            sessionMetrics={totalCombinedMetrics}
          />
        </div>

        {/* 步骤 3 内容区：全景合规比对架构 */}
        {(!currentDoc || !currentBatch) ? (
          <div className="flex flex-col items-center justify-center text-center p-12 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl">rule</span>
            </div>
            <h3 className="text-sm font-bold text-on-surface dark:text-surface-bright mb-1.5">
              暂无待比对批次
            </h3>
            <p className="text-xs text-on-surface-variant dark:text-outline-variant max-w-sm mb-6">
              请先在步骤 1 上传真实质保证书并完成解析核对。
            </p>
            <button
              type="button"
              onClick={() => onGoToStep(0)}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              <span>前往步骤 1 上传文档</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 1. 顶部上下文与判定决策带 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* 左侧 50%：质保书信息 */}
              <div className="lg:col-span-6 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-4 shadow-xs flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-outline-variant/30 dark:border-border-dark pb-2.5">
                    <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-lg">info</span>
                    <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright">
                      质保书信息
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                    {(() => {
                      const renderExtractedValue = (val?: string) => {
                        if (!val || val.trim() === '') {
                          return <span className="text-xs text-outline-variant italic font-normal block select-none">--</span>;
                        }
                        return (
                          <strong className="text-xs font-bold text-primary dark:text-primary-fixed-dim block truncate" title={val}>
                            {val}
                          </strong>
                        );
                      };

                      return (
                        <>
                          <div>
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">产品名称 (Product Name)</span>
                            {renderExtractedValue(currentBatch.productName)}
                          </div>
                          <div>
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">质保书编号 (Certificate No)</span>
                            {renderExtractedValue(currentBatch.certificateNo)}
                          </div>
                          <div>
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">声明标准 (Declared Standard)</span>
                            {renderExtractedValue(currentBatch.standard)}
                          </div>
                          <div>
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">材料牌号</span>
                            {renderExtractedValue(currentBatch.grade)}
                          </div>
                          <div>
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">冶炼炉号 (Heat No.)</span>
                            {renderExtractedValue(currentBatch.heatNo)}
                          </div>
                          <div>
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">热处理装炉号 (Pack No.)</span>
                            {renderExtractedValue(currentBatch.packNo)}
                          </div>
                          <div>
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">交货规格</span>
                            {renderExtractedValue(currentBatch.dimensions)}
                          </div>
                          <div>
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">供货厂商</span>
                            {renderExtractedValue(currentBatch.supplier)}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* 右侧 50%：执行标准与牌号基准 + 综合判定看板 */}
              <div className="lg:col-span-6 flex flex-col gap-3">
                {/* 上部：当前执行标准与牌号基准 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-on-surface dark:text-surface-bright">
                        执行标准与技术协议
                      </h4>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-primary/10 text-primary border border-primary/20" title="当前用于执行合规判定的材料牌号基准">
                        核验牌号: {activeGrade || '未声明'}
                      </span>
                      {isStandardOverridden && isGradeOverridden && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                          标准与牌号已变更
                        </span>
                      )}
                      {isStandardOverridden && !isGradeOverridden && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                          标准已变更
                        </span>
                      )}
                      {!isStandardOverridden && isGradeOverridden && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                          牌号已指定
                        </span>
                      )}
                    </div>

                    {/* 右侧常驻操作按钮组 */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (isReevaluatingCooldownRef.current || isEvaluatingBatch) return;
                          isReevaluatingCooldownRef.current = true;
                          setTimeout(() => { isReevaluatingCooldownRef.current = false; }, 500);
                          onEvaluateBatch(currentBatch, selectedStandardIds);
                        }}
                        disabled={isEvaluatingBatch}
                        title="强制调用合规引擎对当前试样重新计算"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shadow-2xs border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary cursor-pointer disabled:opacity-50"
                      >
                        <span className={`material-symbols-outlined text-[13px] ${isEvaluatingBatch ? 'animate-spin' : ''}`}>
                          refresh
                        </span>
                        <span>{isEvaluatingBatch ? '核验中' : (isUnaudited ? '开始核验' : '重新核验')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={onResetGrade}
                        disabled={!isOverridden}
                        title={isOverridden ? '重置为质保书原件声明基准（清除人工指定的牌号与标准）' : '当前已是质保书原件声明基准'}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shadow-2xs ${isOverridden
                          ? 'border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 cursor-pointer'
                          : 'border border-outline-variant/30 dark:border-border-dark text-on-surface-variant/40 dark:text-outline-variant/40 cursor-not-allowed bg-transparent'
                          }`}
                      >
                        <span className="material-symbols-outlined text-[13px]">restart_alt</span>
                        <span>重置</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-3 shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-3 relative">
                    {/* 1. 执行标准 (多选可搜 Combobox) */}
                    <div className="relative">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-on-surface-variant dark:text-outline-variant font-medium flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px] text-primary">menu_book</span>
                          <span>执行标准</span>
                        </span>
                        <span className="text-[12px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                          已选 {selectedStandardIds.length} 部
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsStandardSelectorOpen(!isStandardSelectorOpen);
                          setIsAgreementSelectorOpen(false);
                        }}
                        className={`w-full text-left bg-surface-container-low dark:bg-surface-dark-low border rounded-lg px-3 py-2 transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs ${isStandardSelectorOpen
                          ? 'border-primary ring-2 ring-primary/20'
                          : 'border-outline-variant/60 dark:border-border-dark hover:border-primary/60'
                          }`}
                      >
                        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                          {selectedStandardIds.map(stdId => {
                            const catalogItem = dynamicStandardsCatalog.find(s =>
                              s.id === stdId ||
                              normalizeStandardId(s.id) === normalizeStandardId(stdId) ||
                              normalizeStandardId(s.shortCode) === normalizeStandardId(stdId)
                            );
                            return (
                              <span
                                key={stdId}
                                className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-surface-container-high dark:bg-surface-dark-high text-on-surface dark:text-surface-bright border border-outline-variant/40 dark:border-border-dark whitespace-nowrap shadow-2xs"
                                title={catalogItem ? catalogItem.name : stdId}
                              >
                                {catalogItem ? catalogItem.id : stdId}
                              </span>
                            );
                          })}
                        </div>
                        <span className={`material-symbols-outlined text-base transition-transform text-on-surface-variant shrink-0 ${isStandardSelectorOpen ? 'rotate-180 text-primary' : ''}`}>
                          expand_more
                        </span>
                      </button>

                      {isStandardSelectorOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setIsStandardSelectorOpen(false)}
                          />
                          <div className="absolute left-0 top-full mt-2 w-88 sm:w-96 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-2xl p-2.5 z-50 space-y-2">
                            <div className="relative">
                              <span className="material-symbols-outlined text-xs absolute left-2.5 top-2.5 text-on-surface-variant">
                                search
                              </span>
                              <input
                                type="text"
                                value={standardSearchQuery}
                                onChange={e => setStandardSearchQuery(e.target.value)}
                                placeholder="搜索标准代号或名称 (如 47019, 13296)..."
                                autoFocus
                                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-outline-variant/60 dark:border-border-dark bg-surface-container-low dark:bg-surface-dark-low text-on-surface dark:text-surface-bright focus:outline-none focus:border-primary"
                              />
                              {standardSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setStandardSearchQuery('')}
                                  className="absolute right-2 top-2 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                                >
                                  ✕
                                </button>
                              )}
                            </div>

                            <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1">
                              {dynamicStandardsCatalog
                                .filter(s => {
                                  if (!standardSearchQuery.trim()) return true;
                                  const q = standardSearchQuery.toLowerCase();
                                  return s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.shortCode.toLowerCase().includes(q);
                                })
                                .map(std => {
                                  const stdNorm = normalizeStandardId(std.id);
                                  const stdShortNorm = normalizeStandardId(std.shortCode);
                                  const isChecked = selectedStandardIds.some(sel => {
                                    const selNorm = normalizeStandardId(sel);
                                    return selNorm === stdNorm || selNorm === stdShortNorm || selNorm.includes(stdNorm) || stdNorm.includes(selNorm);
                                  });
                                  return (
                                    <div
                                      key={std.id}
                                      onClick={() => onToggleStandard(std.id)}
                                      className={`p-2 rounded-lg text-xs transition-colors flex items-start gap-2.5 cursor-pointer ${isChecked
                                        ? 'bg-primary/8 border border-primary/20'
                                        : 'hover:bg-surface-container-low dark:hover:bg-surface-dark-low border border-transparent'
                                        }`}
                                    >
                                      <span className={`material-symbols-outlined text-base mt-0.5 shrink-0 ${isChecked ? 'text-primary' : 'text-outline-variant'}`}>
                                        {isChecked ? 'check_box' : 'check_box_outline_blank'}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="font-bold text-on-surface dark:text-surface-bright truncate">
                                            {std.id}
                                          </span>
                                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-medium border shrink-0 ${std.badgeColor}`}>
                                            {std.category}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-on-surface-variant dark:text-outline-variant line-clamp-1 mt-0.5">
                                          {std.name}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                            <div className="text-[12px] text-on-surface-variant dark:text-outline-variant px-1 border-t border-outline-variant/30 pt-1.5 flex items-center justify-between">
                              <span>共收录 {dynamicStandardsCatalog.length} 部执行标准</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* 2. 应用技术协议 */}
                    <div className="relative">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-on-surface-variant dark:text-outline-variant font-medium flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px] text-primary">description</span>
                          <span>应用技术协议</span>
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant dark:text-outline-variant border border-outline-variant/30">
                          占位待完善
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsAgreementSelectorOpen(!isAgreementSelectorOpen);
                          setIsStandardSelectorOpen(false);
                        }}
                        className={`w-full text-left bg-surface-container-low dark:bg-surface-dark-low border border-dashed rounded-lg px-3 py-2 transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs ${isAgreementSelectorOpen
                          ? 'border-primary ring-2 ring-primary/20'
                          : 'border-outline-variant/60 dark:border-border-dark hover:border-primary/60'
                          }`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="material-symbols-outlined text-base text-outline-variant">assignment_late</span>
                          <span className="text-xs text-on-surface-variant dark:text-outline-variant truncate">
                            暂无技术协议
                          </span>
                        </div>
                        <span className={`material-symbols-outlined text-base transition-transform text-on-surface-variant shrink-0 ${isAgreementSelectorOpen ? 'rotate-180 text-primary' : ''}`}>
                          expand_more
                        </span>
                      </button>

                      {isAgreementSelectorOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setIsAgreementSelectorOpen(false)}
                          />
                          <div className="absolute right-0 top-full mt-2 w-88 sm:w-96 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-2xl p-3 z-50 space-y-2">
                            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2">
                              <span className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-sm text-primary">folder_open</span>
                                <span>定制技术协议 / 加严条款</span>
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                待完善
                              </span>
                            </div>
                            <div className="p-4 text-center text-xs text-on-surface-variant dark:text-outline-variant bg-surface-container-low/50 dark:bg-surface-dark-low/50 rounded-lg border border-dashed border-outline-variant/40">
                              <span className="material-symbols-outlined text-2xl text-outline-variant block mb-1">pending_actions</span>
                              <span>当前会话暂未挂接定制技术协议</span>
                              <p className="text-[11px] text-outline-variant mt-1">
                                选项留空不填充内容，留待后续完善技术协议加严调度体系
                              </p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* 下部：综合判定看板 */}
                {(() => {
                  const isBatchEvaluating = Boolean(isEvaluatingBatch || currentBatchState?.stage === 'tier1_evaluating');
                  const isResolving = currentBatchState?.stage === 'tier1_ready' && (currentBatchState?.pendingProperties?.length || 0) > 0;
                  const isBatchHitl = isHitl || currentBatchState?.stage === 'hitl_pending';
                  const hasScissors = complianceMatrixItems.some(i => i.isScissorsDifference);
                  const hasMatrixFail = complianceMatrixItems.some(i => i.status === 'FAIL');
                  const sysVerdict: SystemVerdict = (isBatchEvaluating || isUnaudited)
                    ? 'UNAUDITED'
                    : isBatchHitl
                      ? 'MANUAL_REVIEW'
                      : (!computedIsPass || hasScissors || hasMatrixFail)
                        ? 'FAIL'
                        : 'PASS';
                  const humanVerdict: HumanVerdict = currentBatch.humanVerdict;
                  const arbitration = resolveFinalDisposition(sysVerdict, humanVerdict, currentBatch.humanVerdictSummary);
                  const badgeMeta = getDispositionBadgeMeta(arbitration.disposition);

                  return (
                    <div className="rounded-xl border border-outline-variant/60 dark:border-border-dark shadow-xs flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden items-stretch">
                      {/* 1. 左侧约 55%：系统客观判定 */}
                      <div className={`md:col-span-7 min-w-0 p-3.5 flex flex-col justify-center space-y-1.5 ${isResolving
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200'
                        : sysVerdict === 'MANUAL_REVIEW'
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                          : sysVerdict === 'UNAUDITED'
                            ? 'bg-slate-100/90 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300'
                            : sysVerdict === 'FAIL'
                              ? 'bg-status-fail-bg text-status-fail-text'
                              : 'bg-status-pass-bg text-status-pass-text'
                        }`}>
                        <div className="flex items-center gap-2 flex-wrap justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`material-symbols-outlined text-xl font-bold shrink-0 ${isResolving
                              ? 'text-indigo-600 dark:text-indigo-400 animate-spin'
                              : sysVerdict === 'MANUAL_REVIEW'
                                ? 'text-amber-600 dark:text-amber-400'
                                : sysVerdict === 'UNAUDITED'
                                  ? 'text-slate-500 dark:text-slate-400'
                                  : ''
                              }`}>
                              {isResolving ? 'sync' : sysVerdict === 'MANUAL_REVIEW' ? 'pending_actions' : sysVerdict === 'UNAUDITED' ? 'pending' : sysVerdict === 'FAIL' ? 'cancel' : 'check_circle'}
                            </span>
                            <h3 className="text-sm sm:text-base font-bold font-headline whitespace-nowrap">
                              {isResolving
                                ? `系统判定: 核心指标就绪 · ${currentBatchState!.pendingProperties!.length}项条款对齐中`
                                : sysVerdict === 'MANUAL_REVIEW'
                                  ? 'HITL 系统判定: 待人工复核确认'
                                  : sysVerdict === 'UNAUDITED'
                                    ? '系统判定: 待核验'
                                    : sysVerdict === 'FAIL'
                                      ? '系统判定: FAIL 一票否决'
                                      : '系统判定: PASS 全项合规'}
                            </h3>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border whitespace-nowrap shadow-2xs ${isResolving
                            ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700'
                            : badgeMeta.badgeClass
                            }`}>
                            {isResolving ? '流转: 语义消歧中' : `流转: ${arbitration.statusLabel}`}
                          </span>
                        </div>
                        <p className="text-[12px] opacity-90 font-sans pl-7 line-clamp-2 leading-relaxed" title={hasScissors ? '包含加严剪刀差失效' : computedVerdictSummary}>
                          {isResolving
                            ? `已完成全部确定性化学、力学与常规工艺规则比对；正在进行长尾条款受限语义推断`
                            : sysVerdict === 'UNAUDITED'
                              ? '批次提取数据已就绪，尚未执行标准条款比对，请点击右上方「开始核验」发起合规判定'
                              : hasScissors
                                ? `【加严剪刀差】存在指标满足通用国标但未达承压订货加严标，按就高严苛原则判定不合格`
                                : hasMatrixFail
                                  ? `【一票否决】存在不合格指标或包含经质检工程师裁定不予认可的特种非标指标，系统坚决拦截放行`
                                  : (arbitration.auditExplanation || computedVerdictSummary)}
                        </p>
                      </div>

                      {/* 2. 右侧约 45%：人工复核判定 */}
                      <div className={`md:col-span-5 min-w-0 p-3 md:border-l flex items-center justify-between gap-3 ${isHitl
                        ? 'bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 md:border-amber-200/60 dark:md:border-amber-900/40'
                        : currentBatch.humanVerdict === 'REJECT'
                          ? 'bg-status-fail-bg text-status-fail-text md:border-red-200/60 dark:md:border-red-900/40'
                          : currentBatch.humanVerdict === 'PASS'
                            ? 'bg-status-pass-bg text-status-pass-text md:border-emerald-200/60 dark:md:border-emerald-900/40'
                            : 'bg-surface-container-low dark:bg-surface-dark-low text-on-surface dark:text-surface-bright md:border-outline-variant/50 dark:md:border-border-dark'
                        }`}>
                        <div className="flex flex-col justify-center gap-1 shrink-0">
                          <div className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
                            <span className="material-symbols-outlined text-[15px]">person_check</span>
                            <span>人工复核:</span>
                          </div>
                          <div>
                            {isHitl ? (
                              <span className="px-2 py-0.5 rounded text-[12px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 shadow-2xs whitespace-nowrap">
                                待介入
                              </span>
                            ) : currentBatch.humanVerdict === 'PASS' ? (
                              <span className="px-2 py-0.5 rounded text-[12px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 shadow-2xs whitespace-nowrap">
                                ✓ APPROVE
                              </span>
                            ) : currentBatch.humanVerdict === 'REJECT' ? (
                              <span className="px-2 py-0.5 rounded text-[12px] font-bold bg-red-100 text-red-800 dark:bg-red-950/90 dark:text-red-200 border border-red-300 dark:border-red-700 shadow-2xs whitespace-nowrap">
                                ✗ REJECT
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[12px] font-medium bg-surface-container-high/70 dark:bg-surface-dark-high/70 border border-outline-variant/30 dark:border-border-dark opacity-80 whitespace-nowrap">
                                未复核
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isHitl ? (
                            <button
                              type="button"
                              onClick={onTriggerHitl}
                              className="h-8 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-xs shadow-xs border border-amber-600/40 flex items-center justify-center gap-1.5 transition-all cursor-pointer ring-2 ring-amber-400/30 whitespace-nowrap"
                            >
                              <span className="material-symbols-outlined text-base">emergency_home</span>
                              <span>处理</span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onSetHumanVerdict(currentBatch?.humanVerdict === 'REJECT' ? null : 'REJECT')}
                                title={currentBatch?.humanVerdict === 'REJECT' ? '当前已标记拒收，再次点击可撤销' : '标记为人工拒收'}
                                className={`h-8 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap shadow-2xs ${currentBatch?.humanVerdict === 'REJECT'
                                  ? 'bg-red-600 hover:bg-red-700 text-white shadow-xs ring-2 ring-red-400/50'
                                  : 'border border-red-300 dark:border-red-800/60 text-red-700 dark:text-red-400 bg-surface-container-lowest dark:bg-surface-dark hover:bg-red-50 dark:hover:bg-red-950/40'
                                  }`}
                              >
                                <span>拒收</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onSetHumanVerdict(currentBatch?.humanVerdict === 'PASS' ? null : 'PASS')}
                                title={currentBatch?.humanVerdict === 'PASS' ? '当前已核准通过，再次点击可撤销' : '核准为人工通过'}
                                className={`h-8 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap shadow-2xs ${currentBatch?.humanVerdict === 'PASS'
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs ring-2 ring-emerald-400/50'
                                  : 'bg-primary hover:bg-primary-container text-on-primary shadow-xs'
                                  }`}
                              >
                                <span>审批通过</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* 2. 下部：全景合规比对矩阵 */}
            <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-5 shadow-xs space-y-4">
              {/* 顶部标题与分类 Filter 页签 */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-outline-variant/40 dark:border-border-dark pb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-xl">fact_check</span>
                  <div>
                    <h3 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                      全景合规比对矩阵
                    </h3>
                    <p className="text-[11px] text-on-surface-variant dark:text-outline-variant">
                      执行标准条款规范与质保书提取测量值同行左右相邻紧凑对照
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full custom-scrollbar">
                  {STEP3_TABS.map(tab => {
                    const isActive = step3Category === tab.key;
                    const isIssueTabWithProblems = tab.key === 'issues' && tab.count > 0;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setStep3Category(tab.key)}
                        title={tab.tooltip}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${isActive
                          ? (isIssueTabWithProblems
                            ? 'bg-red-600 text-white shadow-xs'
                            : 'bg-primary text-on-primary shadow-xs')
                          : (isIssueTabWithProblems
                            ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-900/40'
                            : 'bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant dark:text-outline-variant hover:bg-surface-container-high')
                          }`}
                      >
                        <span>{tab.label}</span>
                        {tab.key === 'all' && tab.tooltip && (
                          <span
                            className="material-symbols-outlined text-[12px] opacity-70 hover:opacity-100 transition-opacity -ml-0.5"
                            title={tab.tooltip}
                          >
                            info
                          </span>
                        )}
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isActive
                          ? 'bg-white/20 text-white'
                          : (isIssueTabWithProblems
                            ? 'bg-red-200/80 dark:bg-red-900/80 text-red-900 dark:text-red-100'
                            : 'bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant')
                          }`}>
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 全景比对大表 */}
              <div className="border border-outline-variant/40 dark:border-border-dark rounded-xl shadow-2xs relative">
                <table className="w-full text-left text-xs">
                  <thead className={`text-[11px] text-on-surface-variant dark:text-outline-variant ${isCapturing ? '' : 'sticky top-0 z-20'}`}>
                    <tr className="bg-surface-container-low dark:bg-surface-dark-low">
                      <th className={`px-3.5 py-2.5 w-20 min-w-[75px] whitespace-nowrap bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/60 dark:border-border-dark shadow-2xs first:rounded-tl-xl ${isCapturing ? '' : 'sticky top-0 z-20'}`}>类别</th>
                      <th className={`px-3.5 py-2.5 min-w-[150px] bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/60 dark:border-border-dark shadow-2xs ${isCapturing ? '' : 'sticky top-0 z-20'}`}>检验项目 / 指标</th>
                      <th className={`px-3.5 py-2.5 min-w-[170px] w-48 bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/60 dark:border-border-dark shadow-2xs ${isCapturing ? '' : 'sticky top-0 z-20'}`}>执行标准要求 / 条款规范</th>
                      <th className={`px-3.5 py-2.5 min-w-[160px] bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/60 dark:border-border-dark shadow-2xs ${isCapturing ? '' : 'sticky top-0 z-20'}`}>报告测量值 / 实际结果</th>
                      <th className={`px-3.5 py-2.5 w-28 min-w-[100px] bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/60 dark:border-border-dark shadow-2xs ${isCapturing ? '' : 'sticky top-0 z-20'}`}>偏差量 / 吻合度</th>
                      <th className={`px-3.5 py-2.5 w-24 whitespace-nowrap bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/60 dark:border-border-dark shadow-2xs ${isCapturing ? '' : 'sticky top-0 z-20'}`}>判定状态</th>
                      <th className={`px-3.5 py-2.5 min-w-[300px] bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/60 dark:border-border-dark shadow-2xs last:rounded-tr-xl ${isCapturing ? '' : 'sticky top-0 z-20'}`}>判定逻辑 / 审核说明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20 dark:divide-border-dark/60">
                    {isEvaluatingBatch && displayedComplianceItems.length === 0 ? (
                      Array.from({ length: 6 }).map((_, idx) => (
                        <tr key={`skeleton_${idx}`} className="animate-pulse">
                          <td className="px-3.5 py-3">
                            <div className="h-5 w-12 bg-surface-container-high dark:bg-surface-dark-high rounded" />
                          </td>
                          <td className="px-3.5 py-3">
                            <div className="h-4 w-28 bg-surface-container-high dark:bg-surface-dark-high rounded" />
                          </td>
                          <td className="px-3.5 py-3">
                            <div className="h-4 w-40 bg-surface-container-high dark:bg-surface-dark-high rounded" />
                          </td>
                          <td className="px-3.5 py-3">
                            <div className="h-4 w-20 bg-surface-container-high dark:bg-surface-dark-high rounded" />
                          </td>
                          <td className="px-3.5 py-3">
                            <div className="h-4 w-24 bg-surface-container-high dark:bg-surface-dark-high rounded" />
                          </td>
                          <td className="px-3.5 py-3">
                            <div className="h-5 w-16 bg-surface-container-high dark:bg-surface-dark-high rounded" />
                          </td>
                          <td className="px-3.5 py-3">
                            <div className="h-4 w-32 bg-surface-container-high dark:bg-surface-dark-high rounded" />
                          </td>
                        </tr>
                      ))
                    ) : displayedComplianceItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3.5 py-8 text-center text-on-surface-variant dark:text-outline-variant">
                          {isEvaluatingBatch ? (
                            <>
                              <span className="material-symbols-outlined text-2xl mb-1 block">rule</span>
                              <span>合规检验计算中...</span>
                            </>
                          ) : step3Category === 'issues' ? (
                            <div className="flex flex-col items-center justify-center space-y-1 py-3">
                              <span className="material-symbols-outlined text-3xl text-emerald-600 dark:text-emerald-400 mb-1 block">check_circle</span>
                              <p className="text-xs font-bold text-on-surface dark:text-surface-bright">
                                本批次所有指标均达标，未发现不合格或待复核问题项
                              </p>
                              <p className="text-[11px] text-on-surface-variant dark:text-outline-variant">
                                当前批次全部 {complianceMatrixItems.length} 项检验指标均满足执行标准规范要求
                              </p>
                            </div>
                          ) : isUnaudited ? (
                            <div className="flex flex-col items-center justify-center space-y-1.5 py-6 text-slate-500 dark:text-slate-400">
                              <span className="material-symbols-outlined text-3xl mb-1 block text-slate-400 dark:text-slate-500">pending</span>
                              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                当前批次尚未发起执行标准合规检验
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                请点击右上方「开始核验」按钮，系统将根据选定的执行标准条款自动进行规则比对与多标尺判定
                              </p>
                            </div>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-2xl mb-1 block">rule</span>
                              <span>暂无对应分类的核验数据</span>
                            </>
                          )}
                        </td>
                      </tr>
                    ) : (
                      displayedComplianceItems.map((row) => (
                        <tr
                          key={row.id}
                          className="hover:bg-surface-container-low/40 dark:hover:bg-surface-dark-low/40 transition-colors align-top"
                        >
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-[12px] font-bold border whitespace-nowrap inline-flex items-center justify-center leading-none ${row.categoryColor}`}>
                              {row.categoryLabel}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 font-bold text-on-surface dark:text-surface-bright">
                            {row.name}
                          </td>
                          <td className="px-3.5 py-2.5 text-on-surface dark:text-surface-bright font-medium">
                            {(() => {
                              const evals = row.multiStandardEvaluations;
                              if (!evals || evals.length === 0) {
                                const match = row.standardRequirement?.match(/^(.*?)\s*\[(.*?)\]$/);
                                if (match) {
                                  const [, reqText, stdTag] = match;
                                  return (
                                    <div className="flex flex-col items-start gap-1.5 py-0.5">
                                      <div className="font-bold text-[12px] text-on-surface dark:text-surface-bright flex items-center gap-1">
                                        <span>{reqText}</span>
                                      </div>
                                      <div className="flex flex-col items-start gap-1 w-full">
                                        <span
                                          className="px-1.5 py-0.5 rounded text-[10px] border whitespace-nowrap inline-flex items-center bg-surface-container-high/70 dark:bg-surface-dark-high/70 text-on-surface-variant dark:text-outline-variant border-outline-variant/30 dark:border-border-dark leading-tight"
                                          title={stdTag}
                                        >
                                          {stdTag}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="py-0.5 font-bold text-[12px] text-on-surface dark:text-surface-bright">
                                    {row.standardRequirement}
                                  </div>
                                );
                              }

                              const activeEvals = evals.filter((e) => !e.requirement_text.includes('无强制指标'));
                              const firstReq = activeEvals[0]?.requirement_text?.trim() || evals[0]!.requirement_text.trim();
                              const isAllIdentical = evals.length === 1 || (
                                activeEvals.length > 1 && activeEvals.every(
                                  (e) => e.requirement_text.trim() === firstReq
                                )
                              );

                              if (isAllIdentical) {
                                return (
                                  <div className="flex flex-col items-start gap-1.5 py-0.5">
                                    <div className="font-bold text-[12px] text-on-surface dark:text-surface-bright flex items-center gap-1">
                                      <span>{firstReq}</span>
                                    </div>
                                    <div className="flex flex-col items-start gap-1 w-full">
                                      {evals.map((ev) => (
                                        <span
                                          key={ev.standard_id}
                                          className="px-1.5 py-0.5 rounded text-[10px] border whitespace-nowrap inline-flex items-center bg-surface-container-high/70 dark:bg-surface-dark-high/70 text-on-surface-variant dark:text-outline-variant border-outline-variant/30 dark:border-border-dark leading-tight"
                                          title={`${ev.standard_id} (单标评定: ${ev.status})`}
                                        >
                                          {ev.standard_short}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }

                              const governingEval = evals.find((e) => e.is_governing) || evals[0]!;

                              return (
                                <div className="flex flex-col items-start gap-1.5 py-0.5">
                                  <div className="font-bold text-[12px] text-on-surface dark:text-surface-bright flex items-center gap-1">
                                    <span>{governingEval.requirement_text}</span>
                                  </div>
                                  <div className="flex flex-col items-start gap-1 w-full">
                                    {evals.map((ev) => (
                                      <span
                                        key={ev.standard_id}
                                        className={`px-1.5 py-0.5 rounded text-[10px] border whitespace-nowrap inline-flex items-center leading-tight ${ev.is_governing
                                          ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-semibold shadow-2xs'
                                          : 'bg-surface-container-high/60 dark:bg-surface-dark-high/60 text-on-surface-variant dark:text-outline-variant border-outline-variant/25 dark:border-border-dark'
                                          }`}
                                        title={`${ev.standard_id}: ${ev.requirement_text} (单标评定: ${ev.status})`}
                                      >
                                        <span>{ev.standard_short}: {ev.requirement_text}</span>
                                        {ev.is_governing && <span className="ml-1 text-amber-600 dark:text-amber-400 font-black text-[9px]">★</span>}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-3.5 py-2.5 font-bold text-primary dark:text-primary-fixed-dim">
                            {row.measuredValue}
                          </td>
                          <td className={`px-3.5 py-2.5 font-medium ${row.isDeviationWarning
                            ? 'text-status-fail-text font-bold'
                            : 'text-on-surface-variant dark:text-outline-variant'
                            }`}>
                            {row.deviation}
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <span className={`px-2.5 py-0.5 rounded text-[12px] font-bold inline-flex items-center justify-center leading-none ${row.status === 'PASS'
                              ? 'bg-status-pass-bg text-status-pass-text'
                              : row.status === 'FAIL'
                                ? 'bg-status-fail-bg text-status-fail-text font-black'
                                : row.status === 'HITL'
                                  ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 shadow-2xs'
                                  : 'bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant dark:text-outline-variant'
                              }`}>
                              {row.statusLabel}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 text-[11px] text-on-surface dark:text-surface-bright leading-relaxed">
                            <div className="flex items-start gap-1.5">
                              {row.detailTag && (
                                <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold tracking-tight shrink-0 select-none ${row.detailTag.color}`}>
                                  {row.detailTag.label}
                                </span>
                              )}
                              <span className="flex-1 whitespace-pre-line">{row.ruleBasis}</span>
                            </div>
                            {row.isScissorsDifference && row.scissorsAttribution && (
                              <div className="mt-2 p-2 rounded-md bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300/60 dark:border-amber-700/50 text-left">
                                <div className="flex items-start gap-1.5 text-[11px] text-amber-900 dark:text-amber-200">
                                  <div className="relative group/tooltip inline-flex items-center shrink-0 mt-0.5">
                                    <span
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-200/90 dark:bg-amber-900/90 text-amber-950 dark:text-amber-100 text-[10px] font-bold tracking-tight cursor-help shadow-2xs select-none hover:bg-amber-300 dark:hover:bg-amber-800 transition-colors"
                                    >
                                      <span
                                        className="material-symbols-outlined !text-[12px] text-amber-800 dark:text-amber-200 leading-none"
                                        style={{ fontSize: '12px' }}
                                      >
                                        info
                                      </span>
                                    </span>

                                    <div className="absolute left-0 top-full mt-1.5 hidden group-hover/tooltip:flex flex-col items-start w-72 sm:w-80 p-2.5 bg-inverse-surface text-inverse-on-surface text-[11px] rounded-lg shadow-xl z-50 pointer-events-none transition-all border border-outline-variant/30 leading-relaxed">
                                      <div className="font-bold flex items-center gap-1.5 text-amber-300 mb-1">
                                        <span className="material-symbols-outlined text-sm">info</span>
                                        <span>加严剪刀差 · 术语说明</span>
                                      </div>
                                      <p className="text-inverse-on-surface/90 text-[10.5px] leading-normal">
                                        加严剪刀差指物资实测指标已达到通用制造基础标准，但未能达到特种设备承压标准或采购技术协议提出的更严苛指标。系统遵循严苛就高原则裁定全单不合格，责任归属于订货加严条款。
                                      </p>
                                      <div className="absolute bottom-full left-4 border-4 border-transparent border-b-inverse-surface" />
                                    </div>
                                  </div>
                                  <span className="leading-snug">{row.scissorsAttribution}</span>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}

                    {/* 态 2：语义对齐中微光呼吸行 */}
                    {currentBatchState?.pendingProperties && currentBatchState.pendingProperties.length > 0 && currentBatchState.stage !== 'completed' && (
                      currentBatchState.pendingProperties.map((prop: PropertyResolutionCandidate, pIdx: number) => (
                        <tr
                          key={`resolving_prop_${pIdx}`}
                          className="bg-indigo-50/50 dark:bg-indigo-950/20 border-l-4 border-l-indigo-500 animate-pulse transition-all align-top"
                        >
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold border whitespace-nowrap inline-flex items-center justify-center text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">
                              长尾待决
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <div className="flex items-center gap-1.5 font-bold text-indigo-900 dark:text-indigo-200 text-xs">
                              <span className="material-symbols-outlined text-sm animate-spin text-indigo-600 dark:text-indigo-400">sync</span>
                              <span>{prop.raw_name}</span>
                            </div>
                            <div className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-0.5">
                              原始提取项目 · Tier 2 语义条款对齐中
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant dark:text-outline-variant">
                              <span className="inline-block w-24 h-3 rounded bg-indigo-200/60 dark:bg-indigo-800/40 animate-pulse" />
                              <span className="text-[11px]">匹配切片条款中...</span>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 font-bold text-xs text-on-surface dark:text-surface-bright">
                            {String(prop.raw_value ?? '')} {prop.unit || ''}
                          </td>
                          <td className="px-3.5 py-2.5 text-[11px] text-outline-variant">
                            --
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700 inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                              <span>对齐中</span>
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 text-xs text-indigo-800 dark:text-indigo-300">
                            <div className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm text-indigo-600">psychology</span>
                              <span>受限候选集语义推断中，置信度达标将自动合入合规报告</span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}

                    {/* 态 3：行内人机协同 (HITL) 待核实确认交互卡片 */}
                    {currentBatchState?.stage === 'hitl_pending' && currentBatchState.hitlContext && (
                      <tr className="bg-amber-50/70 dark:bg-amber-950/40 border-l-4 border-l-amber-500 transition-all">
                        <td colSpan={7} className="p-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 shadow-xs">
                            <div className="flex items-start gap-2.5">
                              <span className="material-symbols-outlined text-xl text-amber-600 dark:text-amber-400 mt-0.5 shrink-0">
                                handshake
                              </span>
                              <div>
                                <div className="text-xs font-bold text-amber-900 dark:text-amber-100 flex items-center gap-2">
                                  <span>人机协同 (HITL) 待核实确认</span>
                                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 font-sans font-medium">
                                    {formatHitlReasonBadge(currentBatchState.hitlContext.reason)}
                                  </span>
                                </div>
                                <p className="text-[12px] text-amber-800 dark:text-amber-200 mt-1 leading-relaxed">
                                  {currentBatchState.hitlContext.prompt_message}
                                </p>
                                {(() => {
                                  const ctx = currentBatchState.hitlContext;
                                  if (ctx.reason === 'UNKNOWN_GRADE') {
                                    const topCandidate = ctx.candidate_grades?.[0];
                                    const candidateCode = topCandidate?.code || (ctx.suggestions?.default ? String(ctx.suggestions.default) : undefined);
                                    if (!candidateCode) return null;
                                    const matchText = topCandidate?.match ? ` [${topCandidate.match}]` : '';
                                    return (
                                      <div className="mt-2 flex items-center gap-2 text-[11px] text-amber-800 dark:text-amber-300 font-sans">
                                        <span className="font-semibold">AI 候选推荐:</span>
                                        <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/80 border border-amber-300 dark:border-amber-700 font-sans font-bold">
                                          首选建议: {candidateCode}{matchText}
                                        </span>
                                      </div>
                                    );
                                  }

                                  if (ctx.suggestions && Object.keys(ctx.suggestions).length > 0) {
                                    return (
                                      <div className="mt-2 flex items-center gap-2 text-[11px] text-amber-800 dark:text-amber-300 font-sans">
                                        <span className="font-semibold">AI 候选推荐:</span>
                                        {Object.entries(ctx.suggestions).map(([raw, target]) => (
                                          <span key={raw} className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/80 border border-amber-300 dark:border-amber-700 font-sans font-bold">
                                            {raw === 'default' ? '默认建议' : raw} → {String(target)}
                                          </span>
                                        ))}
                                      </div>
                                    );
                                  }

                                  return null;
                                })()}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                              {((currentBatchState.hitlContext.candidate_grades && currentBatchState.hitlContext.candidate_grades.length > 0) ||
                                (currentBatchState.hitlContext.suggestions && Object.keys(currentBatchState.hitlContext.suggestions).length > 0)) && (
                                  <button
                                    type="button"
                                    onClick={() => onInlineAdoptHitl(currentBatch.batchNo, currentBatchState.hitlContext)}
                                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined text-sm">done_all</span>
                                    <span>采纳推荐项</span>
                                  </button>
                                )}
                              <button
                                type="button"
                                onClick={onTriggerHitl}
                                className="px-3 py-1.5 rounded-lg border border-amber-400 dark:border-amber-600 text-amber-900 dark:text-amber-200 bg-surface-container-lowest dark:bg-surface-dark hover:bg-amber-100/50 dark:hover:bg-amber-900/30 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-sm">tune</span>
                                <span>人工细化复核</span>
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
