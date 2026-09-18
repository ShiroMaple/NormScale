'use client';

import React, { useState, useRef, useMemo } from 'react';
import {
  InspectionSession,
  SessionDocument,
  BatchSpecimen,
} from '@/types/session.ts';
import { FieldBBox } from '@/types/bbox.ts';
import { DocumentParsingTask } from '@/types/parser.ts';
import { BatchContextBar } from '@/components/BatchContextBar.tsx';
import { EditableValueField } from '@/components/EditableValueField.tsx';
import { LlmStreamingTerminal } from '@/components/LlmStreamingTerminal.tsx';
import { getCertificateInspectionFieldDefinitions } from '@/schemas/certificate.schema.ts';
import { usePdfViewerLens } from '../hooks/usePdfViewerLens.ts';

export interface Step2DataVerificationPanelProps {
  // 会话与焦点
  session: InspectionSession;
  selectedDocId: string;
  selectedBatchNo: string;
  onSelectDoc: (docId: string) => void;
  onSelectBatch: (docId: string, batchNo: string) => void;
  currentDoc?: SessionDocument;
  currentBatch?: BatchSpecimen;

  // 流式解析工作池状态
  parsingTasks: Record<string, DocumentParsingTask>;
  totalCombinedMetrics: any;
  isStreamingTerminalExpanded: boolean;
  onToggleStreamingTerminal: () => void;
  onReparseDocument: () => void;

  // 坐标高亮字典
  bboxes: FieldBBox[];

  // 业务修改与状态流转回调
  onUpdateBatchNo: (newBatchNo: string) => void;
  onUpdateExtractValue: (fieldId: string, newValue: string) => void;
  onGoToStep: (stepIdx: number) => void;

  // 外部共享的右侧表单滚动容器 Ref (用于返回顶部按钮可用性感知)
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

interface ExtractRowItem {
  fieldId: string;
  methodFieldId?: string;
  category: string;
  categoryLabel: string;
  categoryColor: string;
  name: string;
  value: string;
  unit?: string;
  method: string;
  confidence: string;
  status: 'ok' | 'warn';
  note?: string;
}

/**
 * 健壮的置信度展示格式化：安全兼容数字（0.98 或 98）、字符串（'98%' 或 '98'）及缺失状态
 */
function formatConfidenceDisplay(val: unknown): string {
  if (val === undefined || val === null || val === '' || val === '--') return '--';
  const rawStr = String(val).replace('%', '').trim();
  const num = parseFloat(rawStr);
  if (isNaN(num)) return '--';
  if (num > 0 && num <= 1) {
    return `${Math.round(num * 100)}%`;
  }
  return `${Math.round(num)}%`;
}

/**
 * 健壮的置信度数值解析：安全提取 0~100 整数供预警阈值判断
 */
function parseConfidenceNumber(val: unknown): number | null {
  if (val === undefined || val === null || val === '' || val === '--') return null;
  const rawStr = String(val).replace('%', '').trim();
  const num = parseFloat(rawStr);
  if (isNaN(num)) return null;
  if (num > 0 && num <= 1) {
    return Math.round(num * 100);
  }
  return Math.round(num);
}

/**
 * 步骤 2: 质检工作台 - 数据核对与源文档对照面板
 * 包含：顶部批次选择条、LLM 流式终端、左侧 PDF 视窗（缩放/旋转/BBox/平移拖拽）与右侧 25 项理化核验大表
 */
export const Step2DataVerificationPanel: React.FC<Step2DataVerificationPanelProps> = ({
  session,
  selectedDocId,
  selectedBatchNo,
  onSelectDoc,
  onSelectBatch,
  currentDoc: rawDoc,
  currentBatch: rawBatch,
  parsingTasks,
  totalCombinedMetrics,
  isStreamingTerminalExpanded,
  onToggleStreamingTerminal,
  onReparseDocument,
  bboxes,
  onUpdateBatchNo,
  onUpdateExtractValue,
  onGoToStep,
  scrollContainerRef,
}) => {
  // 智能推导当前活动文档与批次实体（支持外部显式传入与基于 session 自治推导）
  const currentDoc = rawDoc || session.documents.find(d => d.docId === selectedDocId) || session.documents[0];
  const currentBatch = rawBatch || currentDoc?.batches.find(b => b.batchNo === selectedBatchNo) || currentDoc?.batches[0];

  // 右侧表单滚动容器 Ref（优先使用外部传入，其次使用内部 Ref）
  const internalRightScrollRef = useRef<HTMLDivElement>(null);
  const effectiveRightScrollRef = scrollContainerRef || internalRightScrollRef;

  // 调用 PDF 视窗交互 Hook
  const {
    zoomLevel,
    setZoomLevel,
    rotation,
    setRotation,
    pageOrientationOverride,
    setPageOrientationOverride,
    pageAspectRatios,
    setPageAspectRatios,
    pdfViewportWidth,
    currentDocPage,
    setCurrentDocPage,
    highlightedFieldId,
    magnifiedFieldId,
    isBboxFocusEnabled,
    handleToggleBboxFocus,
    handleResetMagnify,
    handleFieldHover,
    scrollToRightField,
    isMouseDownDragging,
    handlePdfMouseDown,
    pdfScrollContainerRef,
  } = usePdfViewerLens({
    selectedDocId,
    currentStep: 1,
    bboxes,
    rightScrollContainerRef: effectiveRightScrollRef,
  });

  // 分类页签与打标折叠状态
  const [activeTabCategory, setActiveTabCategory] = useState<string>('all');
  const [isDuplicateDetailsExpanded, setIsDuplicateDetailsExpanded] = useState<boolean>(false);

  // Schema 反射派生的检验项默认方法标准字典
  const fieldDefMap = useMemo(() => {
    const map: Record<string, { defaultMethod?: string }> = {};
    getCertificateInspectionFieldDefinitions().forEach(def => {
      map[def.key] = def;
      if (def.fieldId) map[def.fieldId] = def;
    });
    return map;
  }, []);

  const currentDocTask = parsingTasks[selectedDocId];

  // 翻页导航
  const goToPage = (page: number) => {
    if (!currentDoc || page < 1 || page > (currentDoc.pageCount || 1)) return;
    setCurrentDocPage(page);
    const targetPageElem = document.getElementById(`pdf-page-${page}`);
    if (targetPageElem && pdfScrollContainerRef.current) {
      const containerTop = pdfScrollContainerRef.current.getBoundingClientRect().top;
      const elemTop = targetPageElem.getBoundingClientRect().top;
      pdfScrollContainerRef.current.scrollTop += elemTop - containerTop - 16;
    }
  };

  // 动态方法标准解析器 (仅客观反映批次自身声明或标准关联的方法，绝不伪造国标兜底)
  const getTestMethod = (key: string, fieldId: string) => {
    if (!currentBatch) return '-';
    return (
      currentBatch.testMethods?.[key] ||
      currentBatch.testMethods?.[fieldId] ||
      fieldDefMap[key]?.defaultMethod ||
      fieldDefMap[fieldId]?.defaultMethod ||
      '-'
    );
  };

  return (
    <section className="w-full h-full shrink-0 overflow-hidden p-6 flex flex-col">
      <div className="max-w-[1440px] mx-auto w-full h-full flex flex-col space-y-4 min-h-0">
        {/* 顶部统一标题与两层树状批次选择条 */}
        <div className="shrink-0 relative z-40">
          <BatchContextBar
            stepTitle="步骤 2: 核对解析数据"
            session={session}
            selectedDocId={selectedDocId}
            selectedBatchNo={selectedBatchNo}
            onSelectDoc={onSelectDoc}
            onSelectBatch={onSelectBatch}
            mode="extraction"
            docParsingTasks={parsingTasks}
            sessionMetrics={totalCombinedMetrics}
            isStreamingTerminalExpanded={isStreamingTerminalExpanded}
            onToggleStreamingTerminal={onToggleStreamingTerminal}
            onReparseDocument={onReparseDocument}
          />
        </div>

        {/* 大模型实时解析流式终端 (可展开/自动折叠) */}
        {currentDocTask && (isStreamingTerminalExpanded || currentDocTask.status === 'parsing') && (
          <div className="shrink-0 animate-fade-in transition-all duration-300">
            <LlmStreamingTerminal
              task={currentDocTask}
              isExpanded={isStreamingTerminalExpanded}
              onToggleExpand={onToggleStreamingTerminal}
            />
          </div>
        )}

        {/* 45% / 55% 左右分栏：充满剩余高度 */}
        {!currentDoc || !currentBatch ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl">folder_open</span>
            </div>
            <h3 className="text-sm font-bold text-on-surface dark:text-surface-bright mb-1.5">
              暂无活动检验文档
            </h3>
            <p className="text-xs text-on-surface-variant dark:text-outline-variant max-w-sm mb-6">
              请先前往步骤 1 上传本地真实质量证明书（PDF / 图片）或从历史缓存中选取。
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 relative z-10">
            {/* 左侧 45%：源文档视图与自适应交互式 OCR BBox 高亮图层 */}
            <div className="lg:col-span-5 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl flex flex-col overflow-hidden shadow-sheet h-full">
              {/* PDF 阅读器顶部工具栏 */}
              <div className="h-11 min-h-[44px] max-h-[44px] px-3 bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/40 dark:border-border-dark flex items-center justify-between gap-2 text-xs text-on-surface-variant shrink-0 box-border">
                {/* 左侧：定位聚焦开关 / 活跃气泡徽章 */}
                <div className="flex items-center min-w-0 shrink-0">
                  {(() => {
                    const isPageMagnified = isBboxFocusEnabled && Boolean(magnifiedFieldId);
                    const activeFieldBox = (isBboxFocusEnabled && (magnifiedFieldId || highlightedFieldId))
                      ? bboxes.find(b => b.id === (magnifiedFieldId || highlightedFieldId))
                      : null;

                    if (isBboxFocusEnabled && (isPageMagnified || activeFieldBox)) {
                      return (
                        <div className="h-7 box-border flex items-center gap-1.5 px-2 bg-primary text-on-primary text-[11px] font-bold rounded-lg shadow-sm animate-fade-in truncate max-w-[180px] shrink-0">
                          <span className="material-symbols-outlined text-xs shrink-0">
                            {isPageMagnified ? 'zoom_in' : 'filter_center_focus'}
                          </span>
                          <span className="truncate">
                            {isPageMagnified ? '聚焦' : '已定位'}: {activeFieldBox?.label || '当前项'}
                          </span>
                          {isPageMagnified && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResetMagnify();
                              }}
                              className="ml-0.5 px-1 py-0.5 rounded bg-white/20 hover:bg-white/30 text-white text-[10px] font-normal transition-colors cursor-pointer shrink-0"
                              title="按 ESC 键亦可快速退出放大"
                            >
                              退出（ESC）
                            </button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <label
                        onClick={() => handleToggleBboxFocus(!isBboxFocusEnabled)}
                        className="h-7 box-border flex items-center gap-1.5 px-2 rounded-lg hover:bg-surface-container-high/60 dark:hover:bg-surface-dark-high transition-colors cursor-pointer select-none group shrink-0"
                        title="开启后，鼠标悬浮检验项时在 PDF 上精确定位高亮"
                      >
                        <span className="material-symbols-outlined text-sm text-primary">filter_center_focus</span>
                        <span className={`text-[11px] transition-colors ${isBboxFocusEnabled ? 'text-primary dark:text-primary-fixed-dim font-bold' : 'text-on-surface-variant/80 group-hover:text-on-surface dark:group-hover:text-surface-bright font-medium'}`}>
                          定位聚焦（实验功能）
                        </span>
                        <div
                          role="switch"
                          aria-checked={isBboxFocusEnabled}
                          className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${isBboxFocusEnabled ? 'bg-primary' : 'bg-outline-variant/60 dark:bg-zinc-700'}`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${isBboxFocusEnabled ? 'translate-x-3' : 'translate-x-0'}`}
                          />
                        </div>
                      </label>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setZoomLevel(prev => Math.max(50, prev - 25))}
                      disabled={zoomLevel <= 50}
                      className="w-6 h-6 flex items-center justify-center hover:bg-surface-container-high dark:hover:bg-surface-dark-high rounded transition-colors disabled:opacity-40 cursor-pointer text-sm font-bold text-on-surface dark:text-surface-bright"
                      title="缩小 (最小 50%)"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomLevel(150)}
                      className="px-1.5 py-0.5 rounded text-xs font-bold hover:bg-surface-container-high dark:hover:bg-surface-dark-high text-on-surface dark:text-surface-bright transition-colors cursor-pointer"
                      title="点击一键还原为 150%"
                    >
                      {zoomLevel}%
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomLevel(prev => Math.min(300, prev + 25))}
                      disabled={zoomLevel >= 300}
                      className="w-6 h-6 flex items-center justify-center hover:bg-surface-container-high dark:hover:bg-surface-dark-high rounded transition-colors disabled:opacity-40 cursor-pointer text-sm font-bold text-on-surface dark:text-surface-bright"
                      title="放大 (最大 300%)"
                    >
                      +
                    </button>
                  </div>

                  {/* 顺时针旋转 90° 控制按钮 */}
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setRotation(prev => (prev + 90) % 360)}
                      className={`h-6 px-1.5 flex items-center gap-1 hover:bg-surface-container-high dark:hover:bg-surface-dark-high rounded transition-colors cursor-pointer ${rotation > 0 ? 'text-primary dark:text-primary-fixed-dim bg-primary/10 font-bold' : 'text-on-surface-variant'}`}
                      title="顺时针旋转 90° (纠正扫描件方向)"
                    >
                      <span className="material-symbols-outlined text-sm">rotate_right</span>
                      {rotation > 0 && (
                        <span className="text-[10px] font-bold">{rotation}°</span>
                      )}
                    </button>
                  </div>

                  {/* 版式切换控制按钮 */}
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        setPageOrientationOverride(prev => {
                          if (prev === 'auto') return 'landscape';
                          if (prev === 'landscape') return 'portrait';
                          return 'auto';
                        });
                      }}
                      className={`h-6 px-1.5 flex items-center gap-1 hover:bg-surface-container-high dark:hover:bg-surface-dark-high rounded transition-colors cursor-pointer text-xs ${pageOrientationOverride !== 'auto'
                        ? 'text-primary dark:text-primary-fixed-dim bg-primary/10 font-bold'
                        : 'text-on-surface-variant'
                        }`}
                      title={`当前版式: ${pageOrientationOverride === 'auto' ? '自动感知' : pageOrientationOverride === 'landscape' ? '强制横版' : '强制竖版'} (点击切换)`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {pageOrientationOverride === 'landscape'
                          ? 'stay_current_landscape'
                          : pageOrientationOverride === 'portrait'
                            ? 'stay_current_portrait'
                            : 'crop_free'}
                      </span>
                      <span className="text-[10px] font-medium">
                        {pageOrientationOverride === 'auto' ? '自适应' : pageOrientationOverride === 'landscape' ? '横版' : '竖版'}
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => goToPage(currentDocPage - 1)}
                      disabled={currentDocPage <= 1}
                      className="p-1 hover:bg-surface-container-high dark:hover:bg-surface-dark-high rounded disabled:opacity-40"
                      title="上一页"
                    >
                      &lt;
                    </button>
                    <span>{currentDocPage} / {currentDoc.pageCount || 1}</span>
                    <button
                      type="button"
                      onClick={() => goToPage(currentDocPage + 1)}
                      disabled={currentDocPage >= (currentDoc.pageCount || 1)}
                      className="p-1 hover:bg-surface-container-high dark:hover:bg-surface-dark-high rounded disabled:opacity-40"
                      title="下一页"
                    >
                      &gt;
                    </button>
                  </div>
                </div>
              </div>

              {/* 源文档视窗 */}
              {(() => {
                const docPages = (currentDoc.pages && currentDoc.pages.length > 0)
                  ? currentDoc.pages
                  : (currentDoc.samplePages && currentDoc.samplePages.length > 0)
                    ? currentDoc.samplePages
                    : (currentDoc.md5
                      ? Array.from({ length: currentDoc.pageCount || 1 }, (_, i) => `/api/documents/preprocess?md5=${currentDoc.md5}&page=${i + 1}`)
                      : []);

                if (docPages.length > 0) {
                  return (
                    <div
                      ref={pdfScrollContainerRef}
                      onMouseDown={handlePdfMouseDown}
                      className={`flex-1 p-4 overflow-auto custom-scrollbar bg-surface-container/40 dark:bg-surface-dark-low ${isMouseDownDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
                    >
                      <div
                        className="w-full flex flex-col items-center gap-5 py-3 transition-[padding,min-width]"
                        style={{
                          minWidth: (magnifiedFieldId || zoomLevel > 100 || rotation > 0) ? `${Math.max(100, Math.round((zoomLevel / 100) * (magnifiedFieldId ? 160 : 100)))}%` : '100%',
                          padding: magnifiedFieldId ? '16px 32px' : '10px 0px',
                        }}
                      >
                        {docPages.map((pageSrc, pageIdx) => {
                          const pageNum = pageIdx + 1;
                          const pageBBoxes = bboxes.filter(b => b.page === pageNum);
                          const activeMagnifiedBox = (isBboxFocusEnabled && magnifiedFieldId)
                            ? pageBBoxes.find(b => b.id === magnifiedFieldId)
                            : null;
                          const isPageMagnified = isBboxFocusEnabled && Boolean(activeMagnifiedBox);
                          const originX = activeMagnifiedBox ? activeMagnifiedBox.x + activeMagnifiedBox.w / 2 : 50;
                          const originY = activeMagnifiedBox ? activeMagnifiedBox.y + activeMagnifiedBox.h / 2 : 50;
                          const MAGNIFY_SCALE = 1.5;

                          const detectedRatio = pageAspectRatios[pageNum];
                          let effectiveRatio: number;
                          if (pageOrientationOverride === 'landscape') {
                            effectiveRatio = detectedRatio && detectedRatio > 1.05 ? detectedRatio : 1.4142;
                          } else if (pageOrientationOverride === 'portrait') {
                            effectiveRatio = detectedRatio && detectedRatio < 0.95 ? detectedRatio : 0.7071;
                          } else {
                            effectiveRatio = detectedRatio || (rotation === 90 || rotation === 270 ? 1.4142 : 0.7071);
                          }

                          const isLandscape = effectiveRatio > 1.05;
                          const usableWidth = Math.max(280, pdfViewportWidth - 32);
                          const baseWidth = isLandscape ? usableWidth : Math.min(Math.round(usableWidth * 0.78), 480);
                          const rawPageWidth = Math.round(baseWidth * (zoomLevel / 100));
                          const rawPageHeight = Math.round(rawPageWidth / effectiveRatio);
                          const isRotated90or270 = rotation === 90 || rotation === 270;
                          const visualWidth = isRotated90or270 ? rawPageHeight : rawPageWidth;
                          const visualHeight = isRotated90or270 ? rawPageWidth : rawPageHeight;

                          const extraHeight = (MAGNIFY_SCALE - 1) * visualHeight;
                          const extraWidth = (MAGNIFY_SCALE - 1) * visualWidth;
                          const topMargin = isPageMagnified ? Math.round((originY / 100) * extraHeight) : 0;
                          const bottomMargin = isPageMagnified ? Math.round(((100 - originY) / 100) * extraHeight) : 0;
                          const leftMargin = isPageMagnified ? Math.round((originX / 100) * extraWidth) : 0;
                          const rightMargin = isPageMagnified ? Math.round(((100 - originX) / 100) * extraWidth) : 0;

                          return (
                            <div
                              key={pageNum}
                              className="relative flex items-center justify-center transition-[margin] duration-250 ease-out"
                              style={{
                                marginTop: isPageMagnified ? `${topMargin + 8}px` : '0px',
                                marginBottom: isPageMagnified ? `${bottomMargin + 8}px` : '0px',
                                marginLeft: isPageMagnified ? `${leftMargin + 8}px` : '0px',
                                marginRight: isPageMagnified ? `${rightMargin + 8}px` : '0px',
                              }}
                            >
                              <div
                                id={`pdf-page-${pageNum}`}
                                className={`relative bg-white dark:bg-zinc-900 rounded-sm border border-outline-variant/40 shrink-0 ${isPageMagnified ? 'z-30 shadow-2xl ring-2 ring-primary/60' : 'shadow-md'}`}
                                style={{
                                  width: `${visualWidth}px`,
                                  height: `${visualHeight}px`,
                                  position: 'relative',
                                  overflow: 'visible',
                                  transition: 'box-shadow 250ms ease-out, width 150ms ease-out, height 150ms ease-out',
                                }}
                              >
                                <div
                                  className="absolute"
                                  style={{
                                    width: `${rawPageWidth}px`,
                                    height: `${rawPageHeight}px`,
                                    left: '50%',
                                    top: '50%',
                                    transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${isPageMagnified ? MAGNIFY_SCALE : 1})`,
                                    transformOrigin: isPageMagnified && !isRotated90or270 ? `${originX}% ${originY}%` : 'center center',
                                    transition: 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)',
                                  }}
                                >
                                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/65 text-white text-[11px] rounded backdrop-blur-xs z-10 pointer-events-none shadow-xs">
                                    第 {pageNum} / {docPages.length} 页 {isLandscape ? '· 横版' : ''}
                                  </div>

                                  <img
                                    ref={(el) => {
                                      if (el && el.complete && el.naturalWidth && el.naturalHeight) {
                                        const ratio = Number((el.naturalWidth / el.naturalHeight).toFixed(4));
                                        if (pageAspectRatios[pageNum] !== ratio) {
                                          setPageAspectRatios(prev => (prev[pageNum] === ratio ? prev : { ...prev, [pageNum]: ratio }));
                                        }
                                      }
                                    }}
                                    src={pageSrc}
                                    alt={`第 ${pageNum} 页`}
                                    onLoad={(e) => {
                                      const img = e.currentTarget;
                                      if (img.naturalWidth && img.naturalHeight) {
                                        const ratio = Number((img.naturalWidth / img.naturalHeight).toFixed(4));
                                        setPageAspectRatios(prev => (prev[pageNum] === ratio ? prev : { ...prev, [pageNum]: ratio }));
                                      }
                                    }}
                                    className="w-full h-full object-fill block select-none pointer-events-none"
                                    loading="eager"
                                  />

                                  {isBboxFocusEnabled && pageBBoxes.map((box) => {
                                    const isHighlighted = highlightedFieldId === box.id;
                                    return (
                                      <div
                                        key={box.id}
                                        id={`bbox-${box.id}`}
                                        onMouseEnter={() => scrollToRightField(box.id)}
                                        onMouseLeave={() => handleFieldHover(null)}
                                        className={`absolute rounded-xs transition-all duration-150 cursor-pointer ${isHighlighted
                                          ? 'border-2 border-primary bg-primary/20 ring-2 ring-primary/40 z-30 shadow-xs'
                                          : 'hover:bg-primary/10 hover:border hover:border-primary/40 border border-dashed border-primary/20 z-10'
                                          }`}
                                        style={{
                                          left: `${box.x}%`,
                                          top: `${box.y}%`,
                                          width: `${box.w}%`,
                                          height: `${box.h}%`,
                                        }}
                                        title={box.label}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="flex-1 p-6 overflow-auto custom-scrollbar bg-surface-container/40 dark:bg-surface-dark-low flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-xl bg-surface-container-high dark:bg-surface-dark-high text-primary flex items-center justify-center mb-3 animate-pulse">
                      <span className="material-symbols-outlined text-2xl">picture_as_pdf</span>
                    </div>
                    <span className="text-xs font-bold text-on-surface dark:text-surface-bright">
                      {currentDoc.filename || '未载入文档'}
                    </span>
                    <span className="text-[11px] text-on-surface-variant dark:text-outline-variant mt-1">
                      等待模型解析结构化数据与坐标映射...
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* 右侧 55%：结构化提取核对卡片 */}
            <div className="lg:col-span-7 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-xs flex flex-col overflow-hidden h-full">
              <div
                ref={effectiveRightScrollRef as any}
                className="flex-1 p-5 overflow-y-auto custom-scrollbar space-y-4 scroll-smooth"
              >
                {/* 基础元数据 4行3列统一网格卡片 */}
                <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-lg p-3.5 sm:p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                    {/* 第 1 行：标题 | 批次号输入/修改控件 | 当前批次 OCR 置信度徽章 */}
                    <div className="flex items-center gap-1.5 h-8">
                      <span className="material-symbols-outlined text-base text-primary dark:text-primary-fixed-dim">info</span>
                      <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright uppercase tracking-wider">
                        基础元数据
                      </h3>
                    </div>

                    <div
                      id="right-field-meta_batchNo"
                      onMouseEnter={() => handleFieldHover('meta_batchNo')}
                      onMouseLeave={() => handleFieldHover(null)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-lowest dark:bg-surface-dark border shadow-2xs h-8 transition-all cursor-pointer ${highlightedFieldId === 'meta_batchNo'
                        ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                        : 'border-primary/40 dark:border-primary/50'
                        }`}
                    >
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="material-symbols-outlined text-sm text-primary dark:text-primary-fixed-dim">label</span>
                        <span className="text-[11px] text-on-surface-variant dark:text-outline-variant font-bold">批次号:</span>
                      </div>
                      <EditableValueField
                        value={currentBatch.batchNo}
                        onChange={onUpdateBatchNo}
                        title="修改当前批次号，将自动同步至上方选择器"
                        className="flex-1"
                      />
                    </div>

                    {(() => {
                      const hasOcrConfidence = typeof currentBatch.ocrConfidence === 'number' && currentBatch.ocrConfidence > 0;
                      return (
                        <div
                          className={`flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-2xs h-8 select-none transition-colors ${!hasOcrConfidence
                            ? 'bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant dark:text-outline-variant border-outline-variant/50'
                            : currentBatch.ocrConfidence >= 90
                              ? 'bg-status-pass-bg text-status-pass-text border-emerald-300 dark:border-emerald-800'
                              : currentBatch.ocrConfidence >= 75
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            }`}
                          title="当前批次综合数据抽取质量与定位覆盖率加权评估值"
                        >
                          <span className="material-symbols-outlined text-sm">
                            {!hasOcrConfidence ? 'help' : currentBatch.ocrConfidence >= 90 ? 'verified' : currentBatch.ocrConfidence >= 75 ? 'info' : 'warning'}
                          </span>
                          <span>当前批次 OCR 置信度: {hasOcrConfidence ? `${currentBatch.ocrConfidence}%` : '未评定'}</span>
                        </div>
                      );
                    })()}

                    {/* 第 2 行：质保书编号 | 冶炼炉号 | 热处理炉号 */}
                    <div
                      id="right-field-meta_certificateNo"
                      onMouseEnter={() => handleFieldHover('meta_certificateNo')}
                      onMouseLeave={() => handleFieldHover(null)}
                      className="transition-all cursor-pointer"
                    >
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">质保书编号 (Certificate No)</span>
                      <EditableValueField
                        value={currentBatch.certificateNo || ''}
                        onChange={(val) => onUpdateExtractValue('meta_certificateNo', val)}
                        isHighlighted={highlightedFieldId === 'meta_certificateNo'}
                        className="mt-1"
                      />
                    </div>

                    <div
                      id="right-field-meta_heatNo"
                      onMouseEnter={() => handleFieldHover('meta_heatNo')}
                      onMouseLeave={() => handleFieldHover(null)}
                      className="transition-all cursor-pointer"
                    >
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">冶炼炉号 (Heat No.)</span>
                      <EditableValueField
                        value={currentBatch.heatNo || ''}
                        onChange={(val) => onUpdateExtractValue('meta_heatNo', val)}
                        placeholder="--"
                        title="原材料冶炼炉号 (Heat No.)"
                        isHighlighted={highlightedFieldId === 'meta_heatNo'}
                        className="mt-1"
                      />
                    </div>

                    <div
                      id="right-field-meta_packNo"
                      onMouseEnter={() => handleFieldHover('meta_packNo')}
                      onMouseLeave={() => handleFieldHover(null)}
                      className="transition-all cursor-pointer"
                    >
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">热处理炉号 (Pack No.)</span>
                      <EditableValueField
                        value={currentBatch.packNo || ''}
                        onChange={(val) => onUpdateExtractValue('meta_packNo', val)}
                        placeholder="--"
                        title="钢管热处理炉号 (Pack No.)"
                        isHighlighted={highlightedFieldId === 'meta_packNo'}
                        className="mt-1"
                      />
                    </div>

                    {/* 第 3 行：产品品名 | 材料牌号 | 声称执行标准 */}
                    <div
                      id="right-field-meta_productName"
                      onMouseEnter={() => handleFieldHover('meta_productName')}
                      onMouseLeave={() => handleFieldHover(null)}
                      className="transition-all cursor-pointer"
                    >
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">产品品名 (Product Name)</span>
                      <EditableValueField
                        value={currentBatch.productName || ''}
                        onChange={(val) => onUpdateExtractValue('meta_productName', val)}
                        isHighlighted={highlightedFieldId === 'meta_productName'}
                        className="mt-1"
                      />
                    </div>

                    <div
                      id="right-field-meta_grade"
                      onMouseEnter={() => handleFieldHover('meta_grade')}
                      onMouseLeave={() => handleFieldHover(null)}
                      className="transition-all cursor-pointer"
                    >
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">材料牌号 (Material Grade)</span>
                      <EditableValueField
                        value={currentBatch.grade || ''}
                        onChange={(val) => onUpdateExtractValue('meta_grade', val)}
                        isHighlighted={highlightedFieldId === 'meta_grade'}
                        className="mt-1"
                      />
                    </div>

                    <div
                      id="right-field-meta_standard"
                      onMouseEnter={() => handleFieldHover('meta_standard')}
                      onMouseLeave={() => handleFieldHover(null)}
                      className="transition-all cursor-pointer"
                    >
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">声称执行标准 (Declared Standard)</span>
                      <EditableValueField
                        value={currentBatch.standard || ''}
                        onChange={(val) => onUpdateExtractValue('meta_standard', val)}
                        isHighlighted={highlightedFieldId === 'meta_standard'}
                        className="mt-1"
                      />
                    </div>

                    {/* 第 4 行：交货几何规格 | 热处理状态 | 供货厂家 */}
                    <div
                      id="right-field-meta_dimensions"
                      onMouseEnter={() => handleFieldHover('meta_dimensions')}
                      onMouseLeave={() => handleFieldHover(null)}
                      className="transition-all cursor-pointer"
                    >
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">交货几何规格 (Dimensions)</span>
                      <EditableValueField
                        value={currentBatch.dimensions || ''}
                        onChange={(val) => onUpdateExtractValue('meta_dimensions', val)}
                        placeholder="--"
                        isHighlighted={highlightedFieldId === 'meta_dimensions'}
                        className="mt-1"
                      />
                    </div>

                    <div
                      id="right-field-meta_deliveryState"
                      onMouseEnter={() => handleFieldHover('meta_deliveryState')}
                      onMouseLeave={() => handleFieldHover(null)}
                      className="transition-all cursor-pointer"
                    >
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">热处理状态 (Delivery State)</span>
                      <EditableValueField
                        value={currentBatch.deliveryState || ''}
                        onChange={(val) => onUpdateExtractValue('meta_deliveryState', val)}
                        placeholder="--"
                        isHighlighted={highlightedFieldId === 'meta_deliveryState'}
                        className="mt-1"
                      />
                    </div>

                    <div
                      id="right-field-meta_supplier"
                      onMouseEnter={() => handleFieldHover('meta_supplier')}
                      onMouseLeave={() => handleFieldHover(null)}
                      className="transition-all cursor-pointer"
                    >
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">供货厂家 (Supplier)</span>
                      <EditableValueField
                        value={currentBatch.supplier || ''}
                        onChange={(val) => onUpdateExtractValue('meta_supplier', val)}
                        placeholder="--"
                        isHighlighted={highlightedFieldId === 'meta_supplier'}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* 结构化提取数据区域 */}
                {(() => {
                  const hasOcrConfidence = typeof currentBatch.ocrConfidence === 'number' && currentBatch.ocrConfidence > 0;
                  const batchConfidenceStr = hasOcrConfidence ? `${currentBatch.ocrConfidence}%` : '--';

                  const allExtractItems: ExtractRowItem[] = [
                    ...(currentBatch.chemical || []).filter(c => c.value && c.value.trim() !== '').map(c => ({
                      fieldId: `chem_${c.element}`,
                      category: 'chemical',
                      categoryLabel: '化分',
                      categoryColor: 'text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                      name: `${c.element} (元素含量)`,
                      value: c.value,
                      unit: 'wt%',
                      method: '-',
                      confidence: formatConfidenceDisplay(c.confidence) !== '--' ? formatConfidenceDisplay(c.confidence) : batchConfidenceStr,
                      status: (c.status || 'ok') as 'ok' | 'warn',
                      note: c.note,
                    })),
                    ...(currentBatch.mechanical?.tensile_rm && currentBatch.mechanical.tensile_rm.trim() !== '' ? [{
                      fieldId: 'mech_tensile',
                      methodFieldId: 'method_tensile',
                      category: 'mechanical',
                      categoryLabel: '力学',
                      categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                      name: '抗拉强度 Rm',
                      value: currentBatch.mechanical.tensile_rm,
                      method: getTestMethod('tensile_rm', 'mech_tensile'),
                      confidence: batchConfidenceStr,
                      status: 'ok' as const,
                    }] : []),
                    ...(currentBatch.mechanical?.yield_rp02 && currentBatch.mechanical.yield_rp02.trim() !== '' ? [{
                      fieldId: 'mech_yield',
                      methodFieldId: 'method_tensile',
                      category: 'mechanical',
                      categoryLabel: '力学',
                      categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                      name: '规定塑性延伸强度 Rp0.2',
                      value: currentBatch.mechanical.yield_rp02,
                      method: getTestMethod('yield_rp02', 'mech_yield'),
                      confidence: batchConfidenceStr,
                      status: 'ok' as const,
                    }] : []),
                    ...(currentBatch.mechanical?.elongation_a && currentBatch.mechanical.elongation_a.trim() !== '' ? [{
                      fieldId: 'mech_elongation',
                      methodFieldId: 'method_tensile',
                      category: 'mechanical',
                      categoryLabel: '力学',
                      categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                      name: '断后伸长率 A',
                      value: currentBatch.mechanical.elongation_a,
                      method: getTestMethod('elongation_a', 'mech_elongation'),
                      confidence: batchConfidenceStr,
                      status: 'ok' as const,
                    }] : []),
                    ...(currentBatch.mechanical?.hardness && currentBatch.mechanical.hardness.trim() !== '' ? [{
                      fieldId: 'mech_hardness',
                      methodFieldId: 'method_hardness',
                      category: 'mechanical',
                      categoryLabel: '力学',
                      categoryColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                      name: '硬度 (Hardness)',
                      value: currentBatch.mechanical.hardness,
                      method: getTestMethod('hardness', 'mech_hardness'),
                      confidence: batchConfidenceStr,
                      status: 'ok' as const,
                    }] : []),
                    ...(currentBatch.process?.flattening && currentBatch.process.flattening.trim() !== '' ? [{
                      fieldId: 'proc_flattening',
                      methodFieldId: 'method_proc_flattening',
                      category: 'process',
                      categoryLabel: '工艺',
                      categoryColor: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                      name: '压扁试验 (Flattening)',
                      value: currentBatch.process.flattening === 'PASS' ? '合格' : currentBatch.process.flattening,
                      method: getTestMethod('flattening', 'proc_flattening'),
                      confidence: batchConfidenceStr,
                      status: (currentBatch.process.flattening.includes('不') || currentBatch.process.flattening.toUpperCase().includes('FAIL')) ? ('warn' as const) : ('ok' as const),
                    }] : []),
                    ...(currentBatch.process?.flaring && currentBatch.process.flaring.trim() !== '' ? [{
                      fieldId: 'proc_flaring',
                      methodFieldId: 'method_proc_flaring',
                      category: 'process',
                      categoryLabel: '工艺',
                      categoryColor: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                      name: '扩口试验 (Flaring)',
                      value: currentBatch.process.flaring === 'PASS' ? '合格' : currentBatch.process.flaring,
                      method: getTestMethod('flaring', 'proc_flaring'),
                      confidence: batchConfidenceStr,
                      status: (currentBatch.process.flaring.includes('不') || currentBatch.process.flaring.toUpperCase().includes('FAIL')) ? ('warn' as const) : ('ok' as const),
                    }] : []),
                    ...(currentBatch.process?.grainSize && currentBatch.process.grainSize.trim() !== '' ? [{
                      fieldId: 'metallo_grain',
                      methodFieldId: 'method_grain',
                      category: 'metallographic',
                      categoryLabel: '金相',
                      categoryColor: 'text-cyan-700 bg-cyan-50 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
                      name: '晶粒度评级 (Grain Size)',
                      value: currentBatch.process.grainSize,
                      method: getTestMethod('grain_size', 'metallo_grain'),
                      confidence: batchConfidenceStr,
                      status: 'ok' as const,
                    }] : []),
                    ...(currentBatch.process?.intergranularCorrosion && currentBatch.process.intergranularCorrosion.trim() !== '' ? [{
                      fieldId: 'corrosion_intergranular',
                      methodFieldId: 'method_corrosion_intergranular',
                      category: 'corrosion',
                      categoryLabel: '腐蚀',
                      categoryColor: 'text-orange-700 bg-orange-50 dark:bg-orange-950/60 dark:text-orange-300 border-orange-200 dark:border-orange-800',
                      name: '晶间腐蚀试验 (Intergranular Corrosion)',
                      value: currentBatch.process.intergranularCorrosion === 'PASS' ? '合格' : currentBatch.process.intergranularCorrosion,
                      method: getTestMethod('intergranular_corrosion', 'corrosion_intergranular'),
                      confidence: batchConfidenceStr,
                      status: (currentBatch.process.intergranularCorrosion.includes('不') || currentBatch.process.intergranularCorrosion.toUpperCase().includes('FAIL')) ? ('warn' as const) : ('ok' as const),
                    }] : []),
                    ...((currentBatch.process?.ndt_et || currentBatch.process?.ndt) && (currentBatch.process.ndt_et || currentBatch.process.ndt)!.trim() !== '' ? [{
                      fieldId: 'ndt_et',
                      methodFieldId: 'method_ndt_et',
                      category: 'ndt',
                      categoryLabel: '探伤',
                      categoryColor: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                      name: '涡流探伤检验 (Eddy Current Test)',
                      value: currentBatch.process.ndt_et || currentBatch.process.ndt || '',
                      method: getTestMethod('ndt_et', 'ndt_et'),
                      confidence: batchConfidenceStr,
                      status: ((currentBatch.process.ndt_et || currentBatch.process.ndt)!.includes('不') || (currentBatch.process.ndt_et || currentBatch.process.ndt)!.toUpperCase().includes('FAIL')) ? ('warn' as const) : ('ok' as const),
                      note: ((currentBatch.process.ndt_et || currentBatch.process.ndt)!.includes('不') || (currentBatch.process.ndt_et || currentBatch.process.ndt)!.toUpperCase().includes('FAIL')) ? '探伤不合格' : undefined,
                    }] : []),
                    ...(currentBatch.process?.ndt_ut && currentBatch.process.ndt_ut.trim() !== '' ? [{
                      fieldId: 'ndt_ut',
                      methodFieldId: 'method_ndt_ut',
                      category: 'ndt',
                      categoryLabel: '探伤',
                      categoryColor: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                      name: '超声波探伤检验 (Ultrasonic Test)',
                      value: currentBatch.process.ndt_ut,
                      method: getTestMethod('ndt_ut', 'ndt_ut'),
                      confidence: batchConfidenceStr,
                      status: (currentBatch.process.ndt_ut.includes('不') || currentBatch.process.ndt_ut.toUpperCase().includes('FAIL')) ? ('warn' as const) : ('ok' as const),
                      note: (currentBatch.process.ndt_ut.includes('不') || currentBatch.process.ndt_ut.toUpperCase().includes('FAIL')) ? '探伤不合格' : undefined,
                    }] : []),
                    ...(Array.isArray(currentBatch.additionalTests) ? currentBatch.additionalTests.map((t, idx) => {
                      const safeValue = t.result
                        ? String(t.result)
                        : (t.value_num !== null && t.value_num !== undefined ? `${t.value_num}${t.unit ? ` ${t.unit}` : ''}` : '--');
                      const isFail = t.conclusion === 'FAIL' || safeValue.includes('不') || safeValue.toUpperCase().includes('FAIL');
                      const tagged = t as typeof t & {
                        is_composite?: boolean;
                        is_suspected_duplicate?: boolean;
                        duplicate_reason?: string;
                      };
                      const isTagged = Boolean(tagged.is_suspected_duplicate || tagged.is_composite);
                      const s = `${t.key || ''} ${t.name || ''}`.toLowerCase();
                      let catKey: string = isTagged ? 'duplicate' : (t.category || 'process');
                      if (!isTagged) {
                        if (s.includes('尺寸') || s.includes('dimension') || s.includes('公差') || s.includes('壁厚') || s.includes('外径')) {
                          catKey = 'geometric';
                        } else if (s.includes('表面') || s.includes('surface') || s.includes('外观') || s.includes('瑕疵')) {
                          catKey = 'surface';
                        } else if (s.includes('探伤') || s.includes('涡流') || s.includes('超声') || s.includes('ndt') || s.includes('水压') || s.includes('气密')) {
                          catKey = 'ndt';
                        } else if (s.includes('腐蚀') || s.includes('corrosion') || s.includes('晶间')) {
                          catKey = 'corrosion';
                        } else if (s.includes('金相') || s.includes('晶粒') || s.includes('grain') || s.includes('夹杂')) {
                          catKey = 'metallographic';
                        } else if (s.includes('拉伸') || s.includes('屈服') || s.includes('延伸') || s.includes('硬度') || s.includes('冲击') || s.includes('mechanical')) {
                          catKey = 'mechanical';
                        } else if (s.includes('压扁') || s.includes('扩口') || s.includes('弯曲') || s.includes('卷边') || s.includes('process')) {
                          catKey = 'process';
                        }
                      }

                      const catLabelMap: Record<string, string> = {
                        geometric: '尺寸',
                        surface: '表面',
                        ndt: '探伤',
                        mechanical: '力学',
                        metallographic: '金相',
                        corrosion: '腐蚀',
                        process: '工艺',
                        other: '其他',
                        duplicate: '疑似重复',
                      };

                      const catColorMap: Record<string, string> = {
                        geometric: 'text-teal-700 bg-teal-50 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800',
                        surface: 'text-rose-700 bg-rose-50 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800',
                        ndt: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                        mechanical: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                        metallographic: 'text-cyan-700 bg-cyan-50 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
                        corrosion: 'text-orange-700 bg-orange-50 dark:bg-orange-950/60 dark:text-orange-300 border-orange-200 dark:border-orange-800',
                        process: 'text-purple-700 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                        duplicate: 'text-gray-600 bg-gray-50 dark:bg-gray-950/60 dark:text-gray-300 border-gray-200 dark:border-gray-800',
                      };

                      return {
                        fieldId: t.key || `add_test_${idx}`,
                        methodFieldId: `method_${t.key || idx}`,
                        category: catKey,
                        categoryLabel: catLabelMap[catKey] || '其它',
                        categoryColor: catColorMap[catKey] || 'text-gray-700 bg-gray-50 dark:bg-gray-950/60 dark:text-gray-300 border-gray-200 dark:border-gray-800',
                        name: t.name || (t.key || '附加检验项'),
                        value: safeValue,
                        method: t.standard || '依据设计技术要求',
                        confidence: formatConfidenceDisplay((t as any).confidence) !== '--' ? formatConfidenceDisplay((t as any).confidence) : batchConfidenceStr,
                        status: isTagged || isFail ? ('warn' as const) : ('ok' as const),
                        note: isTagged ? (tagged.duplicate_reason || '复合打包串，已排除出比对') : (isFail ? '检验不合格' : undefined),
                      };
                    }) : []),
                    ...(currentBatch.dimensions && currentBatch.dimensions.trim() !== '' ? [{
                      fieldId: 'meta_dimensions',
                      methodFieldId: 'method_meta_dimensions',
                      category: 'geometric',
                      categoryLabel: '尺寸',
                      categoryColor: 'text-teal-700 bg-teal-50 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800',
                      name: '几何尺寸规格 (Dimensions)',
                      value: currentBatch.dimensions,
                      method: currentBatch.standard || '按订货标准要求',
                      confidence: batchConfidenceStr,
                      status: 'ok' as const,
                    }] : []),
                  ];

                  const categoriesInBatch = [
                    { key: 'all', label: '质保书提取项', count: allExtractItems.length },
                    { key: 'chemical', label: '化学成分', count: allExtractItems.filter(i => i.category === 'chemical').length },
                    { key: 'mechanical', label: '力学性能', count: allExtractItems.filter(i => i.category === 'mechanical').length },
                    { key: 'process', label: '工艺性能', count: allExtractItems.filter(i => i.category === 'process').length },
                    { key: 'metallographic', label: '金相组织', count: allExtractItems.filter(i => i.category === 'metallographic').length },
                    { key: 'corrosion', label: '耐腐蚀试验', count: allExtractItems.filter(i => i.category === 'corrosion').length },
                    { key: 'ndt', label: '无损检测', count: allExtractItems.filter(i => i.category === 'ndt').length },
                    { key: 'geometric', label: '几何尺寸', count: allExtractItems.filter(i => i.category === 'geometric').length },
                    { key: 'surface', label: '表面质量', count: allExtractItems.filter(i => i.category === 'surface').length },
                    { key: 'other', label: '其他综合', count: allExtractItems.filter(i => i.category === 'other').length },
                    { key: 'duplicate', label: '疑似重复', count: allExtractItems.filter(i => i.category === 'duplicate').length },
                  ].filter(c => (c.key === 'all' && allExtractItems.length > 0) || c.count > 0);

                  const displayedItems = activeTabCategory === 'all'
                    ? allExtractItems
                    : allExtractItems.filter(i => i.category === activeTabCategory);

                  const visibleOverviewItems = displayedItems.filter(i => i.category !== 'duplicate');
                  const foldedDuplicateItems = displayedItems.filter(i => i.category === 'duplicate');

                  const renderOverviewRow = (row: ExtractRowItem, idx: number) => {
                    const isValueHighlighted = highlightedFieldId === row.fieldId;
                    const isMethodHighlighted = Boolean(row.methodFieldId && highlightedFieldId === row.methodFieldId);
                    const isRowActive = isValueHighlighted || isMethodHighlighted;
                    const numConfidence = parseConfidenceNumber(row.confidence);
                    const isNotEvaluated = numConfidence === null;
                    const isLowConfidence = row.status === 'warn' || (!isNotEvaluated && numConfidence < 85);

                    return (
                      <tr
                        key={idx}
                        id={`right-field-${row.fieldId}`}
                        className={`transition-colors ${isRowActive
                          ? 'bg-primary/10 dark:bg-primary/20'
                          : 'hover:bg-surface-container-low/40 dark:hover:bg-surface-dark-low/40'
                          }`}
                      >
                        <td className="px-3.5 py-2 whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${row.categoryColor}`}>
                            {row.categoryLabel}
                          </span>
                        </td>
                        <td className="px-3.5 py-2 font-medium text-on-surface dark:text-surface-bright">
                          <span
                            onMouseEnter={() => handleFieldHover(row.fieldId)}
                            onMouseLeave={() => handleFieldHover(null)}
                            className="cursor-pointer hover:text-primary transition-colors"
                          >
                            {row.name}
                          </span>
                        </td>
                        <td className="px-3.5 py-2 text-right">
                          <div className="flex justify-end">
                            <EditableValueField
                              value={row.value}
                              placeholder="--"
                              align="right"
                              onChange={(val) => onUpdateExtractValue(row.fieldId, val)}
                              onHover={() => handleFieldHover(row.fieldId)}
                              onLeave={() => handleFieldHover(null)}
                              isHighlighted={isValueHighlighted}
                              title="点击右侧编辑图标修改提取数据"
                              className="max-w-[200px]"
                            />
                          </div>
                        </td>
                        <td className="px-3.5 py-2 text-on-surface-variant dark:text-outline-variant text-[11px] whitespace-nowrap">
                          {row.unit || '-'}
                        </td>
                        <td className="px-3.5 py-2 text-on-surface-variant dark:text-outline-variant text-[11px]">
                          {row.method && row.method !== '-' ? (
                            <span
                              id={row.methodFieldId ? `right-field-${row.methodFieldId}` : undefined}
                              onMouseEnter={() => {
                                if (row.methodFieldId) handleFieldHover(row.methodFieldId);
                              }}
                              onMouseLeave={() => {
                                if (row.methodFieldId) handleFieldHover(null);
                              }}
                              className={`cursor-pointer transition-colors ${isMethodHighlighted
                                ? 'text-primary font-bold underline'
                                : 'hover:text-primary hover:underline'
                                }`}
                              title="悬浮定位源文档中该项依据的方法标准条款"
                            >
                              {row.method}
                            </span>
                          ) : (
                            <span>{row.method || '-'}</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[11px] font-bold ${isNotEvaluated
                              ? 'text-on-surface-variant dark:text-outline-variant'
                              : isLowConfidence
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-status-pass-text'
                              }`}>
                              {row.confidence}
                            </span>
                            {isLowConfidence && (
                              <div className="relative group/tip">
                                <span className="material-symbols-outlined text-[14px] text-amber-500 animate-pulse cursor-help">
                                  warning
                                </span>
                                <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover/tip:block z-50 w-52 p-2 bg-inverse-surface text-inverse-on-surface rounded-md shadow-xl text-[10px] pointer-events-none">
                                  <div className="font-bold flex items-center gap-1 text-amber-400">
                                    <span className="material-symbols-outlined text-xs">warning</span>
                                    <span>OCR 置信度预警 ({row.confidence})</span>
                                  </div>
                                  <p className="mt-1 text-[11px] text-inverse-on-surface/90 leading-snug">
                                    {row.note || '抽取置信度低于 85% 工业安全阈值，请比对左侧原件切图核验'}
                                  </p>
                                  <div className="absolute bottom-full right-2 border-4 border-transparent border-b-inverse-surface" />
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  };

                  return (
                    <div className="space-y-3">
                      {/* 分类页签栏 */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar border-b border-outline-variant/30 dark:border-border-dark">
                        {categoriesInBatch.map(cat => (
                          <button
                            key={cat.key}
                            type="button"
                            onClick={() => setActiveTabCategory(cat.key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${activeTabCategory === cat.key
                              ? 'bg-primary text-on-primary shadow-xs'
                              : 'text-on-surface-variant hover:text-on-surface dark:hover:text-surface-bright hover:bg-surface-container-high/40'
                              }`}
                          >
                            <span>{cat.label}</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTabCategory === cat.key
                              ? 'bg-white/20 text-white'
                              : 'bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant'
                              }`}>
                              {cat.count}
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* 1. 总览大表 */}
                      {activeTabCategory === 'all' && (
                        <div className="border border-outline-variant/40 dark:border-border-dark rounded-xl overflow-hidden bg-surface-container-lowest dark:bg-surface-dark">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant border-b border-outline-variant/30">
                                <th className="px-3.5 py-2 font-bold w-16">类别</th>
                                <th className="px-3.5 py-2 font-bold">检验项目</th>
                                <th className="px-3.5 py-2 font-bold text-right w-36">提取值</th>
                                <th className="px-3.5 py-2 font-bold w-16">单位</th>
                                <th className="px-3.5 py-2 font-bold">检测方法 / 依据</th>
                                <th className="px-3.5 py-2 font-bold w-20">置信度</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/20">
                              {visibleOverviewItems.map(renderOverviewRow)}
                              {foldedDuplicateItems.length > 0 && (
                                <>
                                  <tr>
                                    <td colSpan={6} className="p-2 bg-surface-container-low/50 dark:bg-surface-dark-low/50">
                                      <button
                                        type="button"
                                        onClick={() => setIsDuplicateDetailsExpanded(v => !v)}
                                        className="w-full py-1.5 px-3 rounded-lg border border-dashed border-outline-variant/60 flex items-center justify-between text-xs text-on-surface-variant hover:text-primary hover:border-primary transition-colors cursor-pointer"
                                      >
                                        <span className="flex items-center gap-1.5 font-bold">
                                          <span className="material-symbols-outlined text-sm text-amber-500">warning</span>
                                          <span>疑似重复 / 复合打包项 ({foldedDuplicateItems.length})</span>
                                        </span>
                                        <span className="material-symbols-outlined text-sm">
                                          {isDuplicateDetailsExpanded ? 'expand_less' : 'expand_more'}
                                        </span>
                                      </button>
                                    </td>
                                  </tr>
                                  {isDuplicateDetailsExpanded && foldedDuplicateItems.map(renderOverviewRow)}
                                </>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* 2. 化学成分独立明细 */}
                      {activeTabCategory === 'chemical' && (
                        <div className="border border-outline-variant/40 dark:border-border-dark rounded-xl overflow-hidden bg-surface-container-lowest dark:bg-surface-dark">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant border-b border-outline-variant/30">
                                <th className="px-3.5 py-2 font-bold">元素</th>
                                <th className="px-3.5 py-2 font-bold text-right">含量提取值 (wt%)</th>
                                <th className="px-3.5 py-2 font-bold">置信度</th>
                                <th className="px-3.5 py-2 font-bold">备注</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/20">
                              {displayedItems.map((item, idx) => (
                                <tr key={idx} className="hover:bg-surface-container-low/40 dark:hover:bg-surface-dark-low/40 transition-colors">
                                  <td className="px-3.5 py-2 font-bold text-on-surface dark:text-surface-bright">{item.name}</td>
                                  <td className="px-3.5 py-2 text-right">
                                    <div className="flex justify-end">
                                      <EditableValueField
                                        value={item.value}
                                        placeholder="--"
                                        align="right"
                                        onChange={(val) => onUpdateExtractValue(item.fieldId, val)}
                                        onHover={() => handleFieldHover(item.fieldId)}
                                        onLeave={() => handleFieldHover(null)}
                                        className="max-w-[180px]"
                                      />
                                    </div>
                                  </td>
                                  {(() => {
                                    const itemNumConf = parseConfidenceNumber(item.confidence);
                                    const isItemNotEvaluated = itemNumConf === null;
                                    const isItemLowConf = item.status === 'warn' || (!isItemNotEvaluated && itemNumConf < 85);
                                    return (
                                      <td className={`px-3.5 py-2 font-bold ${isItemNotEvaluated
                                        ? 'text-on-surface-variant dark:text-outline-variant'
                                        : isItemLowConf
                                          ? 'text-amber-600 dark:text-amber-400'
                                          : 'text-status-pass-text'
                                        }`}>
                                        {item.confidence}
                                      </td>
                                    );
                                  })()}
                                  <td className="px-3.5 py-2 text-outline-variant text-[11px]">{item.note || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* 3. 各专业分类统一声明式数据驱动视图 */}
                      {activeTabCategory !== 'all' && activeTabCategory !== 'chemical' && (
                        <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-2 text-xs">
                          <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                            {categoriesInBatch.find(c => c.key === activeTabCategory)?.label || '检验项目'}提取
                          </span>
                          <div className="space-y-2">
                            {activeTabCategory === 'duplicate' && (
                              <button
                                type="button"
                                onClick={() => setIsDuplicateDetailsExpanded(v => !v)}
                                className="w-full p-3 bg-surface-container-lowest dark:bg-surface-dark border border-dashed border-outline-variant/50 dark:border-border-dark rounded-lg flex items-center justify-between gap-3 text-on-surface-variant hover:border-primary/50 hover:text-primary transition-all cursor-pointer"
                              >
                                <span className="flex items-center gap-1.5 text-xs font-bold">
                                  <span className="material-symbols-outlined text-base">warning</span>
                                  <span>疑似重复项 ({displayedItems.length})，已排除出比对</span>
                                </span>
                                <span className="material-symbols-outlined text-base">
                                  {isDuplicateDetailsExpanded ? 'expand_less' : 'expand_more'}
                                </span>
                              </button>
                            )}
                            {(activeTabCategory !== 'duplicate' || isDuplicateDetailsExpanded) && displayedItems.map((item) => {
                              const isHighlighted = highlightedFieldId === item.fieldId;
                              const isMethodHighlighted = Boolean(item.methodFieldId && highlightedFieldId === item.methodFieldId);

                              return (
                                <div
                                  key={item.fieldId}
                                  id={`right-field-${item.fieldId}`}
                                  onMouseEnter={() => handleFieldHover(item.fieldId)}
                                  onMouseLeave={() => handleFieldHover(null)}
                                  className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center gap-3 cursor-pointer transition-all ${isHighlighted || isMethodHighlighted
                                    ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                    : 'border-outline-variant/30 hover:border-primary/50'
                                    }`}
                                >
                                  <div className="shrink-0">
                                    <strong className="text-on-surface dark:text-surface-bright block">{item.name}</strong>
                                    {item.method && item.method !== '-' && (
                                      <span
                                        id={item.methodFieldId ? `right-field-${item.methodFieldId}` : undefined}
                                        onMouseEnter={(e) => {
                                          if (item.methodFieldId) {
                                            e.stopPropagation();
                                            handleFieldHover(item.methodFieldId);
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          if (item.methodFieldId) {
                                            e.stopPropagation();
                                            handleFieldHover(null);
                                          }
                                        }}
                                        className={`text-[11px] block transition-colors cursor-pointer ${isMethodHighlighted
                                          ? 'text-primary font-bold underline'
                                          : 'text-on-surface-variant hover:text-primary hover:underline'
                                          }`}
                                        title="悬浮查看源文档中该项依据的标准/方法条款位置"
                                      >
                                        依据方法：{item.method}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex-1 flex justify-end max-w-[360px] sm:max-w-[480px]">
                                    <EditableValueField
                                      value={item.value}
                                      placeholder="--"
                                      align="right"
                                      onChange={(val) => onUpdateExtractValue(item.fieldId, val)}
                                      onHover={() => handleFieldHover(item.fieldId)}
                                      onLeave={() => handleFieldHover(null)}
                                      isHighlighted={isHighlighted}
                                      title="悬浮可联动查看原件切图，点击右侧编辑按钮修改"
                                      className="w-full"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {activeTabCategory === 'mechanical' && currentBatch.mechanical?.astFormulaNote && (
                            <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-[12px] flex items-center gap-2 mt-2">
                              <span className="material-symbols-outlined text-base text-amber-600 dark:text-amber-400">auto_awesome</span>
                              <span>{currentBatch.mechanical.astFormulaNote}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
