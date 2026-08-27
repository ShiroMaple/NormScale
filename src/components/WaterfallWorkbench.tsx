'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AuditReport } from '@/schemas/report.schema.ts';
import { PresetSampleDto, StandardOverviewDto } from '@/lib/api-client.ts';
import {
  InspectionSession,
  SessionDocument,
  BatchSpecimen,
  DEFAULT_INSPECTION_SESSION,
  generateSessionId,
} from '@/types/session.ts';
import { BatchContextBar } from './BatchContextBar.tsx';
import { getZPJEBBoxes, FieldBBox } from '@/types/bbox.ts';

interface WaterfallWorkbenchProps {
  standardsData?: {
    total_standards: number;
    total_slices: number;
    standards: StandardOverviewDto[];
  };
  samples: PresetSampleDto[];
  selectedSampleId: string;
  onSelectSample: (sampleId: string) => void;
  isAuditing: boolean;
  currentReport?: AuditReport;
  onOpenHitlDrawer: () => void;
  onTriggerAudit: () => void;
  loadedSession?: InspectionSession | null;
  initialStep?: number;
}

/**
 * ============================================================================
 * NormScale 工业质检工作台 (1:1 像素级还原 Stitch 设计系统)
 * 采用受控垂直平滑滑动容器，禁止全局滚轮脱焦，支持两层树状作业会话 (Session)
 * ============================================================================
 */
export const WaterfallWorkbench: React.FC<WaterfallWorkbenchProps> = ({
  samples,
  selectedSampleId,
  onSelectSample,
  isAuditing,
  onOpenHitlDrawer,
  onTriggerAudit,
  loadedSession,
  initialStep = 0,
}) => {
  // 当前激活的步骤索引：0 (Step 1), 1 (Step 2), 2 (Step 3), 3 (Step 4)
  const [currentStep, setCurrentStep] = useState<number>(initialStep);
  const [zoomLevel, setZoomLevel] = useState<number>(125);
  const [selectedExportFormat, setSelectedExportFormat] = useState<string>('PDF');
  const [activeTabCategory, setActiveTabCategory] = useState<string>('all');

  // 当前作业会话 (Session) 与当前 Focus 的文档 ID 及炉批号 (默认首位选中真实《质保书.pdf》及其第 1 批次)
  const [session, setSession] = useState<InspectionSession>(loadedSession || DEFAULT_INSPECTION_SESSION);
  const [selectedDocId, setSelectedDocId] = useState<string>(
    session.documents[0]?.docId || 'doc_zpje_01'
  );
  const [selectedBatchNo, setSelectedBatchNo] = useState<string>(
    session.documents[0]?.batches[0]?.batchNo || 'Z26022C-DB7'
  );

  // 源文档 OCR 视觉 BBox 与右侧解析字段双向联动状态
  const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(null);
  // 停顿满 1 秒后激活 200% 原位放大的字段 ID 与防晕倒计时器
  const [magnifiedFieldId, setMagnifiedFieldId] = useState<string | null>(null);
  const magnifyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [currentDocPage, setCurrentDocPage] = useState<number>(1);
  const pdfScrollContainerRef = useRef<HTMLDivElement>(null);
  const rightScrollContainerRef = useRef<HTMLDivElement>(null);

  // 组件卸载时安全清理定时器
  useEffect(() => {
    return () => {
      if (magnifyTimerRef.current) {
        clearTimeout(magnifyTimerRef.current);
      }
    };
  }, []);

  // 批次号双向同步更新处理器 (同步更新 Session 和当前选中的批次号，使上方选择器联动变更)
  const handleUpdateBatchNo = (newBatchNo: string) => {
    setSession(prevSession => {
      const updatedDocuments = prevSession.documents.map(doc => {
        if (doc.docId === selectedDocId) {
          return {
            ...doc,
            batches: doc.batches.map(b => {
              if (b.batchNo === selectedBatchNo) {
                return { ...b, batchNo: newBatchNo };
              }
              return b;
            }),
          };
        }
        return doc;
      });
      return {
        ...prevSession,
        documents: updatedDocuments,
      };
    });
    setSelectedBatchNo(newBatchNo);
  };

  // 当外部加载历史 Session 时，自动同步更新
  useEffect(() => {
    if (loadedSession) {
      setSession(loadedSession);
      const firstDoc = loadedSession.documents[0];
      if (firstDoc) {
        setSelectedDocId(firstDoc.docId);
        const firstBatch = firstDoc.batches[0];
        if (firstBatch) {
          setSelectedBatchNo(firstBatch.batchNo);
        }
      }
      setCurrentStep(1); // 自动进入 Step 2 进行核对
    }
  }, [loadedSession]);

  // 待处理文档接口定义
  interface QueuedDocItem {
    id: string;
    filename: string;
    status: '就绪' | '上传中' | '解析中';
    size: string;
    date: string;
  }

  interface CachedDocItem {
    id: string;
    filename: string;
    date: string;
    size: string;
  }

  // 待处理文档队列状态（同 DocEx 契约设计：以物理文档为单位）
  const [queuedDocs, setQueuedDocs] = useState<QueuedDocItem[]>(() => {
    return samples.map(sample => ({
      id: sample.id,
      filename: sample.id === 's30408_messy_sample'
        ? 'Baosteel_S30408_BoilerTube_MTC.pdf'
        : sample.id === '316l_kgf_sample'
          ? 'Tisco_06Cr19Ni10_PressurePlate_MTC.pdf'
          : 'Wisco_Q345R_Custom_Specimen.pdf',
      status: '就绪',
      size: sample.id === 's30408_messy_sample' ? '1.2 MB' : sample.id === '316l_kgf_sample' ? '3.4 MB' : '800 KB',
      date: '2026/8/26',
    }));
  });

  // 历史已缓存文档列表状态
  const [cachedDocs, setCachedDocs] = useState<CachedDocItem[]>([
    { id: 's30408_messy_sample', filename: 'Baosteel_S30408_BoilerTube_MTC.pdf', date: '2026/8/26', size: '1.2 MB' },
    { id: '316l_kgf_sample', filename: 'Tisco_06Cr19Ni10_PressurePlate_MTC.pdf', date: '2026/8/26', size: '3.4 MB' },
    { id: 'unknown_grade_hitl_sample', filename: 'Wisco_Q345R_Custom_Specimen.pdf', date: '2026/8/26', size: '800 KB' },
  ]);

  // 处理队列卡片右上角按钮点击：未上传完成的取消上传，已上传完成的移出队列并保留至历史缓存
  const handleRemoveOrCancelDoc = (doc: QueuedDocItem, e: React.MouseEvent) => {
    e.stopPropagation();

    // 移出待处理队列
    setQueuedDocs(prev => prev.filter(item => item.id !== doc.id));

    // 若文档已上传完成（就绪态），确保其保留在历史已缓存文档列表中
    if (doc.status === '就绪') {
      setCachedDocs(prev => {
        if (prev.some(c => c.id === doc.id)) return prev;
        return [...prev, { id: doc.id, filename: doc.filename, date: doc.date, size: doc.size }];
      });
    }

    // 若被移除的正是当前选中的样本，自动切换至队列中下一个有效文档
    if (selectedSampleId === doc.id) {
      const remaining = queuedDocs.filter(item => item.id !== doc.id);
      const nextDoc = remaining[0];
      if (nextDoc) {
        onSelectSample(nextDoc.id);
      }
    }
  };

  // 从历史缓存恢复至待处理队列并选中
  const handleRestoreFromCache = (item: CachedDocItem) => {
    setQueuedDocs(prev => {
      if (prev.some(d => d.id === item.id)) return prev;
      return [...prev, { id: item.id, filename: item.filename, status: '就绪', size: item.size, date: item.date }];
    });
    onSelectSample(item.id);
    onTriggerAudit();
  };

  // 从 Step 1 触发新建 Session 并前往 Step 2
  const handleStartNewSessionAndAdvance = () => {
    const newSessionId = generateSessionId();
    const newSession: InspectionSession = {
      ...DEFAULT_INSPECTION_SESSION,
      sessionId: newSessionId,
      createdAt: new Date().toLocaleString(),
      title: '现场实时录入批次 · 承压装备材料合规检验',
    };
    setSession(newSession);
    const firstDoc = newSession.documents[0];
    if (firstDoc) {
      setSelectedDocId(firstDoc.docId);
      const firstBatch = firstDoc.batches[0];
      if (firstBatch) {
        setSelectedBatchNo(firstBatch.batchNo);
      }
    }
    onTriggerAudit();
    setCurrentStep(1);
  };

  // 获得当前选中的物理 Document 和 Batch
  const currentDoc: SessionDocument =
    session.documents.find(d => d.docId === selectedDocId) ||
    session.documents[0] ||
    DEFAULT_INSPECTION_SESSION.documents[0]!;

  const currentBatch: BatchSpecimen =
    currentDoc.batches.find(b => b.batchNo === selectedBatchNo) ||
    currentDoc.batches[0] ||
    DEFAULT_INSPECTION_SESSION.documents[0]!.batches[0]!;

  const isPass = currentBatch.verdict === 'PASS';
  const isHitl = currentBatch.verdict === 'MANUAL_REVIEW';

  // 计算当前文档/批次的 OCR BBox 字典
  const bboxes: FieldBBox[] = currentDoc.docId === 'doc_zpje_01'
    ? getZPJEBBoxes(currentBatch.batchNo)
    : [];

  // 1. 悬浮右侧字段：仅滚动左侧 PDF 视窗，绝不触发外部整页或右侧视窗滚动
  const scrollToLeftBBox = (fieldId: string | null) => {
    // 立即清空上一个防晕倒计时
    if (magnifyTimerRef.current) {
      clearTimeout(magnifyTimerRef.current);
      magnifyTimerRef.current = null;
    }

    setHighlightedFieldId(fieldId);

    // 若解除高亮，立即恢复 100% 比例
    if (!fieldId) {
      setMagnifiedFieldId(null);
      return;
    }

    // 启动 1000ms 防晕倒计时：在同一字段停留满 1 秒后才激活 200% 放大
    magnifyTimerRef.current = setTimeout(() => {
      setMagnifiedFieldId(fieldId);
    }, 1000);

    if (!currentDoc.samplePages || currentDoc.samplePages.length === 0) return;

    const box = bboxes.find(b => b.id === fieldId);
    if (!box) return;

    setCurrentDocPage(box.page);
    const container = pdfScrollContainerRef.current;
    if (!container) return;

    const boxElem = document.getElementById(`bbox-${box.id}`);
    const pageElem = document.getElementById(`pdf-page-${box.page}`);
    const targetElem = boxElem || pageElem;
    if (targetElem) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetElem.getBoundingClientRect();
      const targetTopInContainer = targetRect.top - containerRect.top + container.scrollTop;
      const targetScrollTop = targetTopInContainer - (container.clientHeight / 2) + (targetRect.height / 2);
      container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
    }
  };

  // 别名保留以兼容现有调用
  const handleFieldHover = scrollToLeftBBox;

  // 2. 悬浮左侧 BBox：仅滚动右侧解析数据视窗，绝不触发外部整页或左侧视窗滚动
  const scrollToRightField = (fieldId: string) => {
    // 立即清空上一个防晕倒计时
    if (magnifyTimerRef.current) {
      clearTimeout(magnifyTimerRef.current);
      magnifyTimerRef.current = null;
    }

    setHighlightedFieldId(fieldId);

    // 左侧直接 hover BBox 停留满 1000ms 同样激活 200% 聚焦放大
    magnifyTimerRef.current = setTimeout(() => {
      setMagnifiedFieldId(fieldId);
    }, 1000);

    const container = rightScrollContainerRef.current;
    if (!container) return;

    let targetElem = document.getElementById(`right-field-${fieldId}`);
    if (!targetElem && fieldId.startsWith('method_')) {
      const baseId = fieldId.replace('method_', '');
      if (baseId === 'tensile') targetElem = document.getElementById('right-field-mech_tensile');
      else if (baseId === 'hardness') targetElem = document.getElementById('right-field-mech_hardness');
      else if (baseId === 'grain') targetElem = document.getElementById('right-field-metallo_grain');
      else targetElem = document.getElementById(`right-field-${baseId}`);
    }

    if (targetElem) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetElem.getBoundingClientRect();

      // 判断该元素是否已经处于右侧视窗可视区域内（上下各留 40px 缓冲），若已可见则不重复跳动
      const isVisible = (
        targetRect.top >= containerRect.top + 40 &&
        targetRect.bottom <= containerRect.bottom - 40
      );

      if (!isVisible) {
        const targetTopInContainer = targetRect.top - containerRect.top + container.scrollTop;
        const targetScrollTop = targetTopInContainer - (container.clientHeight / 2) + (targetRect.height / 2);
        container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
      }
    }
  };

  // 3. 左侧视窗工具栏翻页控制器：仅滚动左侧 PDF 视窗
  const goToPage = (page: number) => {
    const target = Math.max(1, Math.min(currentDoc.pageCount, page));
    setCurrentDocPage(target);
    const container = pdfScrollContainerRef.current;
    if (!container) return;
    const pageElem = document.getElementById(`pdf-page-${target}`);
    if (pageElem) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = pageElem.getBoundingClientRect();
      const targetTop = targetRect.top - containerRect.top + container.scrollTop;
      container.scrollTo({ top: Math.max(0, targetTop - 10), behavior: 'smooth' });
    }
  };

  const goToStep = (stepIdx: number) => {
    if (stepIdx >= 0 && stepIdx <= 3) {
      setCurrentStep(stepIdx);
    }
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden select-none">

      {/* 4 步受控平滑滑动主容器 (Vertical Step Slider) */}
      <div className="flex-1 w-full overflow-hidden relative">
        <div
          className="w-full h-full flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]"
          style={{ transform: `translateY(-${currentStep * 100}%)` }}
        >

          {/* ========================================================================= */}
          {/* 步骤 1: 批量质保证书录入 (优化版：DocEx 风格物理文档队列与极简上传区) */}
          {/* ========================================================================= */}
          <section className="w-full h-full shrink-0 overflow-y-auto custom-scrollbar p-6 space-y-6">
            <div className="max-w-[1440px] mx-auto w-full space-y-5">

              {/* 页面标题 */}
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-2xl">
                  upload
                </span>
                <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface dark:text-surface-bright tracking-tight">
                  步骤 1: 上传或选择待解析文档
                </h1>
              </div>

              {/* 左右分栏：左侧大拖拽区 + 右侧待处理文档队列 (DocEx 风格) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                {/* 左侧：文档上传区（大虚线框，可拖拽或点击选取多个文档） */}
                <div
                  onClick={onTriggerAudit}
                  className="lg:col-span-6 xl:col-span-7 bg-surface-container-lowest dark:bg-surface-dark border-2 border-dashed border-outline-variant/60 dark:border-border-dark hover:border-primary dark:hover:border-primary-fixed-dim rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all min-h-[300px] shadow-xs group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant group-hover:text-primary group-hover:bg-primary/10 flex items-center justify-center transition-all mb-4">
                    <span className="material-symbols-outlined text-3xl">
                      cloud_upload
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-on-surface dark:text-surface-bright mb-1.5">
                    拖拽文件到此处，或点击卡片选取，支持同时上传多个文档
                  </h3>
                  <p className="text-xs text-on-surface-variant dark:text-outline-variant">
                    支持 PDF / Word (.docx) / 图片 (.jpg, .jpeg, .png) 格式，单个文件最高支持 50MB
                  </p>
                </div>

                {/* 右侧：待处理文档队列（DocEx 风格：显示文档图标与传输/就绪状态，右上角 hover 按钮） */}
                <div className="lg:col-span-6 xl:col-span-5 bg-surface-container-lowest/60 dark:bg-surface-dark/60 border border-outline-variant/60 dark:border-border-dark rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xs font-bold text-on-surface dark:text-surface-bright">
                        待处理文档队列 ({queuedDocs.length})
                      </h2>
                    </div>

                    {/* 文档卡片网格 */}
                    {queuedDocs.length === 0 ? (
                      <div className="h-36 flex flex-col items-center justify-center text-center p-4 border border-dashed border-outline-variant/50 dark:border-border-dark rounded-xl text-on-surface-variant dark:text-outline-variant text-xs">
                        <span className="material-symbols-outlined text-2xl mb-1 text-on-surface-variant/60">inbox</span>
                        <span>待处理队列为空，请从左侧上传或从下方缓存选择</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                        {queuedDocs.map(doc => {
                          const isSelected = selectedSampleId === doc.id;
                          const isUploading = doc.status === '上传中';
                          return (
                            <div
                              key={doc.id}
                              onClick={() => onSelectSample(doc.id)}
                              className={`relative group p-3 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-between text-center h-36 ${isSelected
                                ? 'border-primary dark:border-primary-fixed-dim ring-2 ring-primary/20 bg-surface-container-lowest dark:bg-surface-dark shadow-xs'
                                : 'border-outline-variant/60 dark:border-border-dark hover:border-outline bg-surface-container-lowest dark:bg-surface-dark'
                                }`}
                            >
                              {/* 右上角 Hover 出现的关闭/取消按钮 */}
                              <button
                                type="button"
                                title={isUploading ? '取消上传' : '移出待处理队列'}
                                onClick={(e) => handleRemoveOrCancelDoc(doc, e)}
                                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-on-surface-variant hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 opacity-0 group-hover:opacity-100 transition-all z-10"
                              >
                                <span className="material-symbols-outlined text-[14px]">close</span>
                              </button>

                              <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
                                <span className="material-symbols-outlined text-2xl fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                                  picture_as_pdf
                                </span>
                              </div>

                              <span className="font-mono text-xs font-bold text-on-surface dark:text-surface-bright line-clamp-2 max-w-[130px] break-all leading-tight my-1">
                                {doc.filename}
                              </span>

                              <span className={`text-[11px] font-bold ${doc.status === '解析中'
                                ? 'text-primary dark:text-primary-fixed-dim animate-pulse'
                                : isUploading
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-status-pass-text'
                                }`}>
                                {isAuditing && selectedSampleId === doc.id ? '解析中' : doc.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 历史已缓存文档栏 */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-on-surface-variant text-base">
                      description
                    </span>
                    <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright flex items-center gap-2">
                      <span>历史已缓存文档</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-surface-container-high dark:bg-surface-dark-high text-[11px] font-mono text-on-surface-variant font-medium">
                        {cachedDocs.length}
                      </span>
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant font-normal">
                        (点击卡片一键复用，无需重复解析)
                      </span>
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={onTriggerAudit}
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
                      key={idx}
                      onClick={() => handleRestoreFromCache(item)}
                      className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-3 shadow-xs flex items-center gap-3 cursor-pointer hover:border-primary transition-all"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-xl fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                          picture_as_pdf
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs font-bold text-on-surface dark:text-surface-bright block truncate">
                          {item.filename}
                        </span>
                        <span className="text-[10px] text-on-surface-variant dark:text-outline-variant block mt-0.5">
                          {item.date} • {item.size}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>


          {/* ========================================================================= */}
          {/* 步骤 2: 质检工作台 - 核对解析数据 (挂载统一标题与批次选择条) */}
          {/* ========================================================================= */}
          <section className="w-full h-full shrink-0 overflow-hidden p-6 flex flex-col">
            <div className="max-w-[1440px] mx-auto w-full h-full flex flex-col space-y-4 min-h-0">

              {/* 顶部统一标题与两层树状批次选择条 (固定在顶部，不随内容滚动) */}
              <div className="shrink-0 relative z-30">
                <BatchContextBar
                  stepTitle="步骤 2: 核对解析数据"
                  session={session}
                  selectedDocId={selectedDocId}
                  selectedBatchNo={selectedBatchNo}
                  onSelectDoc={setSelectedDocId}
                  onSelectBatch={(docId, batchNo) => {
                    setSelectedDocId(docId);
                    setSelectedBatchNo(batchNo);
                  }}
                  mode="extraction"
                  rightExtraAction={
                    isHitl ? (
                      <button
                        type="button"
                        onClick={onOpenHitlDrawer}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-hitl-bg text-status-hitl-text text-xs font-bold border border-purple-300 dark:border-purple-800 shadow-xs hover:opacity-90 transition-all"
                      >
                        <span className="material-symbols-outlined text-base">emergency_home</span>
                        <span>打开 HITL 人工介入复核抽屉</span>
                      </button>
                    ) : undefined
                  }
                />
              </div>

              {/* 45% / 55% 左右分栏：充满剩余高度，左右各自独立纵向滚动 */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">

                {/* 左侧 45%：源文档视图与自适应交互式 OCR BBox 高亮图层 (自带独立滚动条) */}
                <div className="lg:col-span-5 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl flex flex-col overflow-hidden shadow-sheet h-full">
                  {/* PDF 阅读器顶部工具栏 */}
                  <div className="px-3.5 py-2 bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/40 dark:border-border-dark flex items-center justify-between text-xs text-on-surface-variant font-mono shrink-0">
                    <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                      <span className="material-symbols-outlined text-base text-red-500">picture_as_pdf</span>
                      <span className="font-bold truncate text-on-surface dark:text-surface-bright">{currentDoc.filename}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setZoomLevel(prev => Math.max(75, prev - 15))}
                          className="p-1 hover:bg-surface-container-high dark:hover:bg-surface-dark-high rounded"
                          title="缩小"
                        >
                          -
                        </button>
                        <span className="px-1 font-bold">{zoomLevel}%</span>
                        <button
                          type="button"
                          onClick={() => setZoomLevel(prev => Math.min(175, prev + 15))}
                          className="p-1 hover:bg-surface-container-high dark:hover:bg-surface-dark-high rounded"
                          title="放大"
                        >
                          +
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
                        <span>{currentDocPage} / {currentDoc.pageCount}</span>
                        <button
                          type="button"
                          onClick={() => goToPage(currentDocPage + 1)}
                          disabled={currentDocPage >= currentDoc.pageCount}
                          className="p-1 hover:bg-surface-container-high dark:hover:bg-surface-dark-high rounded disabled:opacity-40"
                          title="下一页"
                        >
                          &gt;
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 源文档视窗：支持真实多页高清切图纵向连续平铺 或 拟真纸张排版回退 */}
                  {currentDoc.samplePages && currentDoc.samplePages.length > 0 ? (
                    <div
                      ref={pdfScrollContainerRef}
                      className="flex-1 p-4 overflow-y-auto overflow-x-auto custom-scrollbar bg-surface-container/40 dark:bg-surface-dark-low flex flex-col items-center gap-5 scroll-smooth"
                    >
                      {currentDoc.samplePages.map((pageSrc, pageIdx) => {
                        const pageNum = pageIdx + 1;
                        const pageBBoxes = bboxes.filter(b => b.page === pageNum);

                        // 检查当前页是否包含正处于 1 秒悬浮放大状态的 BBox
                        const activeMagnifiedBox = magnifiedFieldId
                          ? pageBBoxes.find(b => b.id === magnifiedFieldId)
                          : null;
                        const isPageMagnified = !!activeMagnifiedBox;

                        const originX = activeMagnifiedBox ? activeMagnifiedBox.x + activeMagnifiedBox.w / 2 : 50;
                        const originY = activeMagnifiedBox ? activeMagnifiedBox.y + activeMagnifiedBox.h / 2 : 50;

                        return (
                          <div
                            key={pageNum}
                            id={`pdf-page-${pageNum}`}
                            className={`relative bg-white dark:bg-zinc-900 rounded-sm border border-outline-variant/40 shrink-0 ${
                              isPageMagnified ? 'z-30 shadow-2xl ring-2 ring-primary/60' : 'shadow-md'
                            }`}
                            style={{
                              width: `${460 * (zoomLevel / 100)}px`,
                              maxWidth: '100%',
                              aspectRatio: '1 / 1.414',
                              transform: isPageMagnified ? 'scale(2)' : 'scale(1)',
                              transformOrigin: `${originX}% ${originY}%`,
                              transition: 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 250ms ease-out',
                            }}
                          >
                            {/* 顶部高亮与放大提示徽章 (常驻于页面左上角空白边距，绝不遮挡任何表格与正文) */}
                            {(isPageMagnified || pageBBoxes.some(b => b.id === highlightedFieldId)) && (
                              <div className="absolute top-2 left-2 px-2.5 py-1 bg-primary/95 text-on-primary font-mono text-[11px] font-bold rounded backdrop-blur-xs z-30 pointer-events-none shadow-md flex items-center gap-1.5 animate-fade-in max-w-[65%] truncate">
                                <span className="material-symbols-outlined text-xs shrink-0">
                                  {isPageMagnified ? 'zoom_in' : 'filter_center_focus'}
                                </span>
                                <span className="truncate">
                                  {isPageMagnified ? '聚焦放大 200%' : '已定位'}: {pageBBoxes.find(b => b.id === highlightedFieldId)?.label}
                                </span>
                              </div>
                            )}

                            {/* 页码徽章 */}
                            <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/65 text-white font-mono text-[10px] rounded backdrop-blur-xs z-10 pointer-events-none shadow-xs">
                              第 {pageNum} / {currentDoc.samplePages!.length} 页
                            </div>

                            {/* 真实高清切图底图 */}
                            <img
                              src={pageSrc}
                              alt={`第 ${pageNum} 页`}
                              className="w-full h-full object-contain select-none pointer-events-none"
                              loading="eager"
                            />

                            {/* 动态自适应百分比 BBox 标注框层 (单实线、高透光、零遮挡) */}
                            {pageBBoxes.map((box) => {
                              const isHighlighted = highlightedFieldId === box.id;
                              return (
                                <div
                                  key={box.id}
                                  id={`bbox-${box.id}`}
                                  onMouseEnter={() => scrollToRightField(box.id)}
                                  onMouseLeave={() => handleFieldHover(null)}
                                  className={`absolute rounded-xs transition-all duration-150 cursor-pointer ${isHighlighted
                                    ? 'border-2 border-primary bg-primary/10 z-20 shadow-xs'
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
                        );
                      })}
                    </div>
                  ) : (
                    /* 回退：拟真白底纸张视窗 */
                    <div className="flex-1 p-6 overflow-auto custom-scrollbar bg-surface-container/40 dark:bg-surface-dark-low flex justify-center">
                      <div
                        className="paper-texture border border-outline-variant/40 rounded shadow-md p-8 relative transition-transform duration-200"
                        style={{
                          width: '460px',
                          minHeight: '620px',
                          transform: `scale(${zoomLevel / 100})`,
                          transformOrigin: 'top center',
                        }}
                      >
                        <h3 className="font-bold text-center text-sm font-mono tracking-widest uppercase border-b pb-2 mb-4 text-on-surface">
                          MATERIAL TEST CERTIFICATE
                        </h3>
                        <div className="space-y-3 text-[11px] font-mono text-on-surface">
                          <div className="flex justify-between border-b pb-1">
                            <span>Supplier: {currentBatch.supplier}</span>
                            <span>Date: 2026-08-26</span>
                          </div>
                          <div className="flex justify-between border-b pb-1">
                            <span>Standard: {currentBatch.standard}</span>
                            <span>Heat No: {currentBatch.heatNo}</span>
                          </div>
                          <div className="ocr-box ocr-box-yellow left-6 top-24 w-80 h-10 flex items-center px-2 cursor-pointer">
                            <span className="text-[10px] font-bold text-yellow-900 bg-yellow-200/80 px-1 rounded">
                              Grade: {currentBatch.grade}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 右侧 55%：结构化提取核对卡片 (自带独立滚动条) */}
                <div className="lg:col-span-7 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl shadow-xs flex flex-col overflow-hidden h-full">
                  <div
                    ref={rightScrollContainerRef}
                    className="flex-1 p-5 overflow-y-auto custom-scrollbar space-y-4 scroll-smooth"
                  >

                    {/* 基础元数据 4行3列统一网格卡片 (第1行：标题、批次号控件、置信度徽标) */}
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
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant font-mono font-bold">批次号:</span>
                          </div>
                          <input
                            type="text"
                            value={currentBatch.batchNo}
                            onChange={(e) => handleUpdateBatchNo(e.target.value)}
                            className="text-xs font-mono font-bold text-primary dark:text-primary-fixed-dim bg-transparent focus:outline-none flex-1 text-left px-1 border-b border-dashed border-primary/40 focus:border-primary min-w-0"
                            title="修改当前批次号，将自动同步至上方选择器"
                          />
                        </div>

                        <div className="flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full bg-status-pass-bg text-status-pass-text text-xs font-mono font-bold border border-emerald-300 dark:border-emerald-800 shadow-2xs h-8">
                          <span className="material-symbols-outlined text-sm">verified</span>
                          <span>当前批次 OCR 置信度: {currentBatch.ocrConfidence}%</span>
                        </div>

                        {/* 第 2 行：质保书编号 | 施工号 | 供货厂家 */}
                        <div
                          id="right-field-meta_certificateNo"
                          onMouseEnter={() => handleFieldHover('meta_certificateNo')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className="transition-all cursor-pointer"
                        >
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">质保书编号 (Certificate No)</span>
                          <input
                            type="text"
                            defaultValue={currentBatch.certificateNo || currentBatch.reportNo.replace('QA', 'MTC')}
                            className={`w-full text-xs font-mono font-bold mt-1 rounded border px-2.5 py-1 transition-all ${highlightedFieldId === 'meta_certificateNo'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                              }`}
                          />
                        </div>

                        <div
                          id="right-field-meta_constructionNo"
                          onMouseEnter={() => handleFieldHover('meta_constructionNo')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className="transition-all cursor-pointer"
                        >
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">施工号 (Construction No)</span>
                          <input
                            type="text"
                            defaultValue={currentBatch.constructionNo || '26XXX-0888'}
                            className={`w-full text-xs font-mono font-bold mt-1 rounded border px-2.5 py-1 transition-all ${highlightedFieldId === 'meta_constructionNo'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-primary dark:text-primary-fixed-dim'
                              }`}
                          />
                        </div>

                        <div
                          id="right-field-meta_supplier"
                          onMouseEnter={() => handleFieldHover('meta_supplier')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className="transition-all cursor-pointer"
                        >
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">供货厂家 (Supplier)</span>
                          <input
                            type="text"
                            defaultValue={currentBatch.supplier}
                            className={`w-full text-xs font-mono font-bold mt-1 rounded border px-2.5 py-1 truncate transition-all ${highlightedFieldId === 'meta_supplier'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                              }`}
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
                          <input
                            type="text"
                            defaultValue={currentBatch.productName || '换热管 (Heat exchange tubes)'}
                            className={`w-full text-xs font-mono mt-1 rounded border px-2.5 py-1 truncate transition-all ${highlightedFieldId === 'meta_productName'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                              }`}
                          />
                        </div>

                        <div
                          id="right-field-meta_grade"
                          onMouseEnter={() => handleFieldHover('meta_grade')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className="transition-all cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-on-surface-variant dark:text-outline-variant">材料牌号 (Material Grade)</span>
                            <span className="px-1.5 py-0.2 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-[10px] font-bold rounded shrink-0">
                              匹配度 {currentBatch.gradeMatchConfidence}%
                            </span>
                          </div>
                          <input
                            type="text"
                            defaultValue={currentBatch.grade}
                            className={`w-full text-xs font-mono font-bold mt-1 rounded border px-2.5 py-1 transition-all ${highlightedFieldId === 'meta_grade'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                              }`}
                          />
                        </div>

                        <div
                          id="right-field-meta_standard"
                          onMouseEnter={() => handleFieldHover('meta_standard')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className="transition-all cursor-pointer"
                        >
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">声称执行标准 (Declared Standard)</span>
                          <input
                            type="text"
                            defaultValue={currentBatch.standard}
                            className={`w-full text-xs font-mono mt-1 rounded border px-2.5 py-1 font-bold transition-all ${highlightedFieldId === 'meta_standard'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-primary dark:text-primary-fixed-dim'
                              }`}
                          />
                        </div>

                        {/* 第 4 行：双炉号追溯 (冶炼炉号 / 热处理装炉号) | 交货几何规格 | 热处理状态 */}
                        <div className="transition-all">
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block truncate">
                            冶炼炉号/热处理炉号(Heat/Pack No.)
                          </span>
                          <div className="grid grid-cols-2 gap-1.5 mt-1">
                            {/* 1. 冶炼炉号 (Heat No.) */}
                            <input
                              id="right-field-meta_heatNo"
                              type="text"
                              defaultValue={currentBatch.heatNo}
                              onMouseEnter={() => handleFieldHover('meta_heatNo')}
                              onMouseLeave={() => handleFieldHover(null)}
                              title="原材料冶炼炉号 (Heat No.)"
                              className={`w-full text-xs font-mono font-bold rounded border px-2.5 py-1 transition-all cursor-pointer truncate ${highlightedFieldId === 'meta_heatNo'
                                ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                                : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                                }`}
                            />

                            {/* 2. 热处理炉号 (Pack No.) */}
                            <input
                              id="right-field-meta_packNo"
                              type="text"
                              defaultValue={currentBatch.packNo || 'Z26022C'}
                              onMouseEnter={() => handleFieldHover('meta_packNo')}
                              onMouseLeave={() => handleFieldHover(null)}
                              title="钢管热处理炉号 (Pack No.)"
                              className={`w-full text-xs font-mono font-bold rounded border px-2.5 py-1 transition-all cursor-pointer truncate ${highlightedFieldId === 'meta_packNo'
                                ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                                : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                                }`}
                            />
                          </div>
                        </div>

                        <div
                          id="right-field-meta_dimensions"
                          onMouseEnter={() => handleFieldHover('meta_dimensions')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className="transition-all cursor-pointer"
                        >
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">交货几何规格 (Dimensions)</span>
                          <input
                            type="text"
                            defaultValue={currentBatch.dimensions}
                            className={`w-full text-xs font-mono mt-1 rounded border px-2.5 py-1 transition-all ${highlightedFieldId === 'meta_dimensions'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                              }`}
                          />
                        </div>

                        <div
                          id="right-field-meta_deliveryState"
                          onMouseEnter={() => handleFieldHover('meta_deliveryState')}
                          onMouseLeave={() => handleFieldHover(null)}
                          className="transition-all cursor-pointer"
                        >
                          <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">热处理状态 (Delivery State)</span>
                          <input
                            type="text"
                            defaultValue={currentBatch.deliveryState || '光亮固溶 (Bright Solution Annealed)'}
                            className={`w-full text-xs font-mono mt-1 rounded border px-2.5 py-1 transition-all ${highlightedFieldId === 'meta_deliveryState'
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
                              : 'border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-on-surface dark:text-surface-bright'
                              }`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* 结构化实测数据区域：动态根据 standard.schema.ts 类别计算页签 (无数据自动隐藏) */}
                    {(() => {
                      // 1. 结构化构建当前批次的全部提取项 (赋予精准 fieldId 与真实 BBox 坐标联动)
                      const allExtractItems = [
                        // 化学成分 (原件未打印独立检测方法标准，客观呈现为 '-'，无依据 BBox)
                        ...currentBatch.chemical.map(c => ({
                          fieldId: `chem_${c.element}`,
                          methodFieldId: undefined,
                          category: 'chemical',
                          categoryLabel: '化学成分',
                          categoryColor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                          name: `${c.element} (元素含量)`,
                          value: `${c.value} wt%`,
                          method: '-',
                          confidence: c.confidence,
                          status: c.status,
                          note: c.note,
                        })),
                        // 力学性能 (拉伸依据 Page 2 表头 GB/T 228.1-2021，硬度依据表头 GB/T 4340.1-2024)
                        {
                          fieldId: 'mech_tensile',
                          methodFieldId: 'method_tensile',
                          category: 'mechanical',
                          categoryLabel: '力学性能',
                          categoryColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                          name: '抗拉强度 Rm',
                          value: currentBatch.mechanical.tensile_rm,
                          method: 'GB/T 228.1-2021',
                          confidence: '98%',
                          status: 'ok' as const,
                        },
                        {
                          fieldId: 'mech_yield',
                          methodFieldId: 'method_tensile',
                          category: 'mechanical',
                          categoryLabel: '力学性能',
                          categoryColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                          name: '规定塑性延伸强度 Rp0.2',
                          value: currentBatch.mechanical.yield_rp02,
                          method: 'GB/T 228.1-2021',
                          confidence: '97%',
                          status: 'ok' as const,
                        },
                        {
                          fieldId: 'mech_elongation',
                          methodFieldId: 'method_tensile',
                          category: 'mechanical',
                          categoryLabel: '力学性能',
                          categoryColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                          name: '断后伸长率 A',
                          value: currentBatch.mechanical.elongation_a,
                          method: 'GB/T 228.1-2021',
                          confidence: '99%',
                          status: 'ok' as const,
                        },
                        ...(currentBatch.mechanical.hardness ? [{
                          fieldId: 'mech_hardness',
                          methodFieldId: 'method_hardness',
                          category: 'mechanical',
                          categoryLabel: '力学性能',
                          categoryColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                          name: '硬度 (Hardness)',
                          value: currentBatch.mechanical.hardness,
                          method: 'GB/T 4340.1-2024',
                          confidence: '96%',
                          status: 'ok' as const,
                        }] : []),
                        // 工艺性能 (依据 Page 1 下表第二列标准)
                        {
                          fieldId: 'proc_flattening',
                          methodFieldId: 'method_proc_flattening',
                          category: 'process',
                          categoryLabel: '工艺性能',
                          categoryColor: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
                          name: '压扁试验 (Flattening)',
                          value: currentBatch.process.flattening === 'PASS' ? '合格 (无裂纹/无分层)' : '未检出',
                          method: 'GB/T 246-2017',
                          confidence: currentBatch.process.flattening === 'PASS' ? '98%' : '50%',
                          status: (currentBatch.process.flattening === 'PASS' ? 'ok' : 'warn') as 'ok' | 'warn',
                          note: currentBatch.process.flattening === 'PASS' ? undefined : '缺失压扁试验报告',
                        },
                        ...(currentBatch.process.flaring ? [{
                          fieldId: 'proc_flaring',
                          methodFieldId: 'method_proc_flaring',
                          category: 'process',
                          categoryLabel: '工艺性能',
                          categoryColor: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
                          name: '扩口试验 (Flaring)',
                          value: '合格 (顶心锥度 60°, 扩口率 ≥20%)',
                          method: 'GB/T 242-2007',
                          confidence: '99%',
                          status: 'ok' as const,
                        }] : []),
                        // 金相组织 (依据 Page 2 表头 GB/T 6394-2017)
                        ...(currentBatch.process.grainSize ? [{
                          fieldId: 'metallo_grain',
                          methodFieldId: 'method_grain',
                          category: 'metallographic',
                          categoryLabel: '金相组织',
                          categoryColor: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                          name: '晶粒度评级 (Grain Size)',
                          value: currentBatch.process.grainSize,
                          method: 'GB/T 6394-2017',
                          confidence: '98%',
                          status: 'ok' as const,
                        }] : []),
                        // 耐腐蚀试验
                        {
                          fieldId: 'corrosion_intergranular',
                          methodFieldId: 'method_corrosion_intergranular',
                          category: 'corrosion',
                          categoryLabel: '耐腐蚀试验',
                          categoryColor: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800',
                          name: '晶间腐蚀试验 (Intergranular Corrosion)',
                          value: currentBatch.process.intergranularCorrosion === 'PASS' ? '合格 (硫酸-硫酸铜法弯曲无裂纹)' : '未检出',
                          method: 'GB/T 4334-2020 方法 E',
                          confidence: currentBatch.process.intergranularCorrosion === 'PASS' ? '98%' : '50%',
                          status: (currentBatch.process.intergranularCorrosion === 'PASS' ? 'ok' : 'warn') as 'ok' | 'warn',
                          note: currentBatch.process.intergranularCorrosion === 'PASS' ? undefined : '缺失晶间腐蚀试验报告',
                        },
                        // 无损检测
                        {
                          fieldId: 'ndt_et',
                          methodFieldId: 'method_ndt_et',
                          category: 'ndt',
                          categoryLabel: '无损检测',
                          categoryColor: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
                          name: '涡流探伤检验 (Eddy Current Test)',
                          value: currentBatch.process.ndt,
                          method: 'GB/T 7735-2016',
                          confidence: currentBatch.process.ndt.includes('合格') ? '98%' : '50%',
                          status: (currentBatch.process.ndt.includes('合格') ? 'ok' : 'warn') as 'ok' | 'warn',
                          note: currentBatch.process.ndt.includes('合格') ? undefined : '未检出探伤结果',
                        },
                        // 几何尺寸与表面质量 (当存在真实多页切图时自动丰富)
                        ...(currentDoc.docId === 'doc_zpje_01' ? [
                          {
                            fieldId: 'geo_dimensions',
                            methodFieldId: 'method_geo_dimensions',
                            category: 'geometric',
                            categoryLabel: '几何尺寸',
                            categoryColor: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-800',
                            name: '尺寸公差检验 (Dimensions Inspection)',
                            value: '合格 (外径偏差 ±0.10mm, 壁厚偏差 ±10%)',
                            method: 'GB/T 13296-2023',
                            confidence: '99%',
                            status: 'ok' as const,
                          },
                          {
                            fieldId: 'surface_quality',
                            methodFieldId: 'method_surface_quality',
                            category: 'surface',
                            categoryLabel: '表面质量',
                            categoryColor: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                            name: '表面质量检验 (Surface Quality)',
                            value: '合格 (内外表面光洁，无裂纹、折叠与重皮)',
                            method: 'GB/T 13296-2023',
                            confidence: '99%',
                            status: 'ok' as const,
                          },
                        ] : []),
                      ];

                      // 2. 动态计算当前批次包含的分类列表 (仅保留有数据的分类)
                      const categoriesInBatch = [
                        { key: 'all', label: '解析数据总览', count: allExtractItems.length },
                        { key: 'chemical', label: '化学成分', count: allExtractItems.filter(i => i.category === 'chemical').length },
                        { key: 'mechanical', label: '力学性能', count: allExtractItems.filter(i => i.category === 'mechanical').length },
                        { key: 'process', label: '工艺性能', count: allExtractItems.filter(i => i.category === 'process').length },
                        { key: 'metallographic', label: '金相组织', count: allExtractItems.filter(i => i.category === 'metallographic').length },
                        { key: 'corrosion', label: '耐腐蚀试验', count: allExtractItems.filter(i => i.category === 'corrosion').length },
                        { key: 'ndt', label: '无损检测', count: allExtractItems.filter(i => i.category === 'ndt').length },
                        { key: 'geometric', label: '几何尺寸', count: allExtractItems.filter(i => i.category === 'geometric').length },
                        { key: 'surface', label: '表面质量', count: allExtractItems.filter(i => i.category === 'surface').length },
                        { key: 'other', label: '其他综合', count: allExtractItems.filter(i => i.category === 'other').length },
                      ].filter(c => c.key === 'all' || c.count > 0);

                      const displayedItems = activeTabCategory === 'all'
                        ? allExtractItems
                        : allExtractItems.filter(i => i.category === activeTabCategory);

                      return (
                        <div className="space-y-2.5">
                          {/* 动态页签导航条 (无数据类别自动隐藏，无冗余图标与多余文案) */}
                          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar border-b border-outline-variant/40 dark:border-border-dark pb-1.5">
                            {categoriesInBatch.map(cat => {
                              const isActive = activeTabCategory === cat.key;
                              return (
                                <button
                                  key={cat.key}
                                  type="button"
                                  onClick={() => setActiveTabCategory(cat.key)}
                                  className={`text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${isActive
                                    ? 'bg-primary text-on-primary font-bold shadow-xs'
                                    : 'bg-surface-container-low dark:bg-surface-dark-low hover:bg-surface-container-high dark:hover:bg-surface-dark-high text-on-surface dark:text-surface-bright font-medium'
                                    }`}
                                >
                                  <span>{cat.label}</span>
                                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${isActive
                                    ? 'bg-white/20 text-white'
                                    : 'bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant dark:text-outline-variant'
                                    }`}>
                                    {cat.count}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* 1. 全部实测项总览 (平铺综合表格视图，结果与依据独立双向高亮联动) */}
                          {activeTabCategory === 'all' && (
                            <div className="border border-outline-variant/40 dark:border-border-dark rounded-xl overflow-hidden shadow-2xs">
                              <table className="w-full text-left text-xs font-mono">
                                <thead className="bg-surface-container-low dark:bg-surface-dark-low text-[11px] text-on-surface-variant dark:text-outline-variant border-b dark:border-border-dark">
                                  <tr>
                                    <th className="px-3.5 py-2.5 w-24 min-w-[90px] whitespace-nowrap">类别</th>
                                    <th className="px-3.5 py-2.5 w-44 min-w-[130px]">检验项目</th>
                                    <th className="px-3.5 py-2.5 min-w-[180px]">提取测得值 / 试验结果</th>
                                    <th className="px-3.5 py-2.5 min-w-[190px]">试验依据方法 / 标准</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-outline-variant/20 dark:divide-border-dark/60">
                                  {displayedItems.map((row, idx) => {
                                    const isValueHighlighted = highlightedFieldId === row.fieldId;
                                    const isMethodHighlighted = Boolean(row.methodFieldId && highlightedFieldId === row.methodFieldId);
                                    const isRowActive = isValueHighlighted || isMethodHighlighted;

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
                                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap inline-block ${row.categoryColor}`}>
                                            {row.categoryLabel}
                                          </span>
                                        </td>
                                        <td className="px-3.5 py-2 font-bold text-on-surface dark:text-surface-bright">{row.name}</td>
                                        
                                        {/* 1. 提取测得值 / 试验结果（独立 BBox 联动，无图标与边框） */}
                                        <td className="px-3.5 py-2.5">
                                          <span
                                            onMouseEnter={() => handleFieldHover(row.fieldId)}
                                            onMouseLeave={() => handleFieldHover(null)}
                                            className={`inline-block transition-colors cursor-pointer ${isValueHighlighted
                                              ? 'text-primary dark:text-primary-fixed-dim font-black underline underline-offset-2 decoration-2'
                                              : 'text-primary dark:text-primary-fixed-dim font-bold hover:underline hover:underline-offset-2'
                                              }`}
                                            title="悬浮查看源文档中该项的实测数据位置"
                                          >
                                            {row.value}
                                          </span>
                                        </td>

                                        {/* 2. 试验依据方法 / 标准（独立 BBox 联动，无图标与边框） */}
                                        <td className="px-3.5 py-2.5 text-[11px]">
                                          {row.method && row.method !== '-' && row.methodFieldId ? (
                                            <span
                                              id={`right-field-${row.methodFieldId}`}
                                              onMouseEnter={() => handleFieldHover(row.methodFieldId!)}
                                              onMouseLeave={() => handleFieldHover(null)}
                                              className={`inline-block transition-colors cursor-pointer ${isMethodHighlighted
                                                ? 'text-primary dark:text-primary-fixed-dim font-bold underline underline-offset-2 decoration-2'
                                                : 'text-on-surface-variant dark:text-outline-variant hover:text-primary hover:underline hover:underline-offset-2'
                                                }`}
                                              title="悬浮查看源文档中该项依据的标准/方法条款位置"
                                            >
                                              {row.method}
                                            </span>
                                          ) : (
                                            <span className="text-outline-variant dark:text-outline-dark">
                                              {row.method || '-'}
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* 2. 化学成分独立专业视图 */}
                          {activeTabCategory === 'chemical' && (
                            <div className="border border-outline-variant/40 dark:border-border-dark rounded-xl overflow-hidden shadow-2xs">
                              <table className="w-full text-left text-xs font-mono">
                                <thead className="bg-surface-container-low dark:bg-surface-dark-low text-[11px] text-on-surface-variant dark:text-outline-variant border-b dark:border-border-dark">
                                  <tr>
                                    <th className="px-3.5 py-2.5">化学元素 (Element)</th>
                                    <th className="px-3.5 py-2.5">提取测得值 (wt%)</th>
                                    <th className="px-3.5 py-2.5">检验依据方法</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-outline-variant/20 dark:divide-border-dark/60">
                                  {currentBatch.chemical.map((row, idx) => {
                                    const fieldId = `chem_${row.element}`;
                                    const isHighlighted = highlightedFieldId === fieldId;
                                    return (
                                      <tr
                                        key={idx}
                                        id={`right-field-${fieldId}`}
                                        onMouseEnter={() => handleFieldHover(fieldId)}
                                        onMouseLeave={() => handleFieldHover(null)}
                                        className={`transition-colors cursor-pointer ${isHighlighted
                                          ? 'bg-primary/15 dark:bg-primary/25 ring-1 ring-primary/50'
                                          : 'hover:bg-surface-container-low/50 dark:hover:bg-surface-dark-low/50'
                                          }`}
                                      >
                                        <td className="px-3.5 py-2 font-bold text-on-surface dark:text-surface-bright">{row.element}</td>
                                        <td className="px-3.5 py-2 font-bold text-primary dark:text-primary-fixed-dim">{row.value} wt%</td>
                                        <td className="px-3.5 py-2 text-outline-variant dark:text-outline-dark text-[11px]">- (未声明独立方法)</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* 3. 力学性能独立专业视图 */}
                          {activeTabCategory === 'mechanical' && (
                            <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-3 text-xs font-mono">
                              <div className="space-y-1.5">
                                <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                                  拉伸与硬度力学性能实测 (Mechanical Tensile & Hardness)
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                  <div
                                    id="right-field-mech_tensile"
                                    onMouseEnter={() => handleFieldHover('mech_tensile')}
                                    onMouseLeave={() => handleFieldHover(null)}
                                    className={`p-2.5 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'mech_tensile'
                                      ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                      : 'border-outline-variant/30 hover:border-primary/50'
                                      }`}
                                  >
                                    <span className="text-on-surface-variant dark:text-outline-variant">抗拉强度 Rm:</span>
                                    <strong className="text-primary dark:text-primary-fixed-dim">{currentBatch.mechanical.tensile_rm}</strong>
                                  </div>
                                  <div
                                    id="right-field-mech_yield"
                                    onMouseEnter={() => handleFieldHover('mech_yield')}
                                    onMouseLeave={() => handleFieldHover(null)}
                                    className={`p-2.5 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'mech_yield'
                                      ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                      : 'border-outline-variant/30 hover:border-primary/50'
                                      }`}
                                  >
                                    <span className="text-on-surface-variant dark:text-outline-variant">规定塑性延伸强度 Rp0.2:</span>
                                    <strong className="text-primary dark:text-primary-fixed-dim">{currentBatch.mechanical.yield_rp02}</strong>
                                  </div>
                                  <div
                                    id="right-field-mech_elongation"
                                    onMouseEnter={() => handleFieldHover('mech_elongation')}
                                    onMouseLeave={() => handleFieldHover(null)}
                                    className={`p-2.5 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'mech_elongation'
                                      ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                      : 'border-outline-variant/30 hover:border-primary/50'
                                      }`}
                                  >
                                    <span className="text-on-surface-variant dark:text-outline-variant">断后伸长率 A (%):</span>
                                    <strong className="text-primary dark:text-primary-fixed-dim">{currentBatch.mechanical.elongation_a}</strong>
                                  </div>
                                  <div
                                    id="right-field-mech_hardness"
                                    onMouseEnter={() => handleFieldHover('mech_hardness')}
                                    onMouseLeave={() => handleFieldHover(null)}
                                    className={`p-2.5 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'mech_hardness'
                                      ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                      : 'border-outline-variant/30 hover:border-primary/50'
                                      }`}
                                  >
                                    <span className="text-on-surface-variant dark:text-outline-variant">硬度 (Hardness):</span>
                                    <strong className="text-on-surface dark:text-surface-bright">{currentBatch.mechanical.hardness || '免检 (壁厚<1.7mm)'}</strong>
                                  </div>
                                </div>
                              </div>

                              {currentBatch.mechanical.astFormulaNote && (
                                <div className="p-2.5 rounded-lg bg-status-hitl-bg border border-purple-200 dark:border-purple-900 text-status-hitl-text text-[11px] flex items-center gap-2">
                                  <span className="material-symbols-outlined text-base">auto_awesome</span>
                                  <span>{currentBatch.mechanical.astFormulaNote}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* 4. 工艺性能独立专业视图 */}
                          {activeTabCategory === 'process' && (
                            <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-2 text-xs font-mono">
                              <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                                工艺成型试验条款实测 (Process Flattening & Bending)
                              </span>
                              <div
                                id="right-field-proc_flattening"
                                onMouseEnter={() => handleFieldHover('proc_flattening')}
                                onMouseLeave={() => handleFieldHover(null)}
                                className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'proc_flattening'
                                  ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                  : 'border-outline-variant/30 hover:border-primary/50'
                                  }`}
                              >
                                <div>
                                  <strong className="text-on-surface dark:text-surface-bright block">压扁试验 (Flattening Test)</strong>
                                  <span className="text-[11px] text-on-surface-variant">依据方法：GB/T 246 金属管压扁试验方法</span>
                                </div>
                                <strong className={currentBatch.process.flattening === 'PASS' ? 'text-status-pass-text font-bold text-sm' : 'text-status-fail-text font-bold text-sm'}>
                                  {currentBatch.process.flattening === 'PASS' ? '合格 (无裂纹/无分层)' : '未检出'}
                                </strong>
                              </div>
                              {currentBatch.process.flaring && (
                                <div
                                  id="right-field-proc_flaring"
                                  onMouseEnter={() => handleFieldHover('proc_flaring')}
                                  onMouseLeave={() => handleFieldHover(null)}
                                  className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'proc_flaring'
                                    ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                    : 'border-outline-variant/30 hover:border-primary/50'
                                    }`}
                                >
                                  <div>
                                    <strong className="text-on-surface dark:text-surface-bright block">扩口试验 (Flaring Test)</strong>
                                    <span className="text-[11px] text-on-surface-variant">依据方法：GB/T 242 金属管扩口试验方法 (顶心锥度 60°)</span>
                                  </div>
                                  <strong className="text-status-pass-text font-bold text-sm">合格 (扩口率 ≥20%)</strong>
                                </div>
                              )}
                            </div>
                          )}

                          {/* 5. 金相组织独立专业视图 */}
                          {activeTabCategory === 'metallographic' && (
                            <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-2 text-xs font-mono">
                              <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                                金相组织与晶粒度实测 (Metallographic & Grain Size)
                              </span>
                              <div
                                id="right-field-metallo_grain"
                                onMouseEnter={() => handleFieldHover('metallo_grain')}
                                onMouseLeave={() => handleFieldHover(null)}
                                className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'metallo_grain'
                                  ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                  : 'border-outline-variant/30 hover:border-primary/50'
                                  }`}
                              >
                                <div>
                                  <strong className="text-on-surface dark:text-surface-bright block">晶粒度评级 (Grain Size)</strong>
                                  <span className="text-[11px] text-on-surface-variant">依据标准：GB/T 6394 金属平均晶粒度测定方法 (比较法)</span>
                                </div>
                                <strong className="text-primary dark:text-primary-fixed-dim font-bold text-sm">
                                  {currentBatch.process.grainSize || '7.0 级'}
                                </strong>
                              </div>
                            </div>
                          )}

                          {/* 6. 耐腐蚀试验独立专业视图 */}
                          {activeTabCategory === 'corrosion' && (
                            <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-2 text-xs font-mono">
                              <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                                不锈钢耐腐蚀试验实测 (Corrosion Resistance)
                              </span>
                              <div
                                id="right-field-corrosion_intergranular"
                                onMouseEnter={() => handleFieldHover('corrosion_intergranular')}
                                onMouseLeave={() => handleFieldHover(null)}
                                className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'corrosion_intergranular'
                                  ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                  : 'border-outline-variant/30 hover:border-primary/50'
                                  }`}
                              >
                                <div>
                                  <strong className="text-on-surface dark:text-surface-bright block">晶间腐蚀试验 (Intergranular Corrosion)</strong>
                                  <span className="text-[11px] text-on-surface-variant">依据方法：GB/T 4334 Method E (硫酸-硫酸铜腐蚀试验)</span>
                                </div>
                                <strong className={currentBatch.process.intergranularCorrosion === 'PASS' ? 'text-status-pass-text font-bold text-sm' : 'text-status-fail-text font-bold text-sm'}>
                                  {currentBatch.process.intergranularCorrosion === 'PASS' ? '合格 (Method E 弯曲无裂纹)' : '未检出'}
                                </strong>
                              </div>
                            </div>
                          )}

                          {/* 7. 无损检测独立专业视图 */}
                          {activeTabCategory === 'ndt' && (
                            <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-2 text-xs font-mono">
                              <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                                承压管道无损探伤检验 (Non-Destructive Testing)
                              </span>
                              <div
                                id="right-field-ndt_et"
                                onMouseEnter={() => handleFieldHover('ndt_et')}
                                onMouseLeave={() => handleFieldHover(null)}
                                className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'ndt_et'
                                  ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                  : 'border-outline-variant/30 hover:border-primary/50'
                                  }`}
                              >
                                <div>
                                  <strong className="text-on-surface dark:text-surface-bright block">无损探伤 / 水压替代 (NDT / Hydrostatic Alternative)</strong>
                                  <span className="text-[11px] text-on-surface-variant">依据方法：GB/T 7735 (涡流 E3H) / GB/T 5777 (超声 U2)</span>
                                </div>
                                <strong className="text-primary dark:text-primary-fixed-dim font-bold text-sm">
                                  {currentBatch.process.ndt}
                                </strong>
                              </div>
                            </div>
                          )}

                          {/* 8. 几何尺寸独立专业视图 */}
                          {activeTabCategory === 'geometric' && (
                            <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-2 text-xs font-mono">
                              <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                                几何公差与尺寸检验 (Geometric Tolerances)
                              </span>
                              <div
                                id="right-field-geo_dimensions"
                                onMouseEnter={() => handleFieldHover('geo_dimensions')}
                                onMouseLeave={() => handleFieldHover(null)}
                                className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'geo_dimensions'
                                  ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                  : 'border-outline-variant/30 hover:border-primary/50'
                                  }`}
                              >
                                <div>
                                  <strong className="text-on-surface dark:text-surface-bright block">外径与壁厚公差实测 (OD & WT)</strong>
                                  <span className="text-[11px] text-on-surface-variant">依据标准：GB/T 13296-2023 第 5.2 条款 (精密级)</span>
                                </div>
                                <strong className="text-status-pass-text font-bold text-sm">合格 OK</strong>
                              </div>
                            </div>
                          )}

                          {/* 9. 表面质量独立专业视图 */}
                          {activeTabCategory === 'surface' && (
                            <div className="p-3.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-xl space-y-2 text-xs font-mono">
                              <span className="text-[11px] font-bold text-on-surface dark:text-surface-bright block uppercase tracking-wider">
                                表面宏观与微观质量检验 (Surface Quality)
                              </span>
                              <div
                                id="right-field-surface_quality"
                                onMouseEnter={() => handleFieldHover('surface_quality')}
                                onMouseLeave={() => handleFieldHover(null)}
                                className={`p-3 bg-surface-container-lowest dark:bg-surface-dark border rounded-lg flex justify-between items-center cursor-pointer transition-all ${highlightedFieldId === 'surface_quality'
                                  ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                                  : 'border-outline-variant/30 hover:border-primary/50'
                                  }`}
                              >
                                <div>
                                  <strong className="text-on-surface dark:text-surface-bright block">内外部表面缺陷目视与内窥镜检验</strong>
                                  <span className="text-[11px] text-on-surface-variant">无裂纹、折叠、轧折、离层和结疤</span>
                                </div>
                                <strong className="text-status-pass-text font-bold text-sm">合格 OK</strong>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </section>


          {/* ========================================================================= */}
          {/* 步骤 3: 质检工作台 - 比对标准 (挂载统一标题与批次选择条) */}
          {/* ========================================================================= */}
          <section className="w-full h-full shrink-0 overflow-y-auto custom-scrollbar p-6 space-y-4">
            <div className="max-w-[1440px] mx-auto w-full space-y-4">

              {/* 顶部统一标题与两层树状批次选择条 */}
              <div className="relative z-30">
                <BatchContextBar
                  stepTitle="步骤 3: 比对执行标准"
                  session={session}
                  selectedDocId={selectedDocId}
                  selectedBatchNo={selectedBatchNo}
                  onSelectDoc={setSelectedDocId}
                  onSelectBatch={(docId, batchNo) => {
                    setSelectedDocId(docId);
                    setSelectedBatchNo(batchNo);
                  }}
                  mode="compliance"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                {/* 左侧 40%：质保书解析数据快照 (瓦片数字网格) */}
                <div className="lg:col-span-5 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-5 shadow-xs space-y-4">
                  <h2 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                    当前批次解析数据快照
                  </h2>

                  <div className="grid grid-cols-2 gap-3 text-xs border-b border-outline-variant/40 dark:border-border-dark pb-3">
                    <div>
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">供货商</span>
                      <strong className="font-mono text-on-surface dark:text-surface-bright block truncate">
                        {currentBatch.supplier}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">牌号</span>
                      <strong className="font-mono text-primary dark:text-primary-fixed-dim block">
                        {currentBatch.grade}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">炉号</span>
                      <span className="font-mono text-on-surface dark:text-surface-bright">{currentBatch.heatNo}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">批次试样</span>
                      <span className="font-mono text-on-surface dark:text-surface-bright">{currentBatch.batchNo}</span>
                    </div>
                  </div>

                  {/* 化学成分实测值瓦片 */}
                  <div>
                    <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-2 font-medium">化学成分实测值 (%)</span>
                    <div className="grid grid-cols-4 gap-2 font-mono">
                      {currentBatch.chemical.slice(0, 8).map(tile => (
                        <div key={tile.element} className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2 text-center">
                          <span className="text-[10px] text-on-surface-variant dark:text-outline-variant block">{tile.element}</span>
                          <strong className="text-xs text-on-surface dark:text-surface-bright block">{tile.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 力学性能实测值瓦片 */}
                  <div>
                    <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-2 font-medium">力学性能实测值</span>
                    <div className="grid grid-cols-2 gap-2 font-mono">
                      <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2.5">
                        <span className="text-[10px] text-on-surface-variant dark:text-outline-variant block">Rm</span>
                        <strong className="text-xs text-primary dark:text-primary-fixed-dim block truncate">{currentBatch.mechanical.tensile_rm}</strong>
                      </div>
                      <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2.5">
                        <span className="text-[10px] text-on-surface-variant dark:text-outline-variant block">Rp0.2</span>
                        <strong className="text-xs text-primary dark:text-primary-fixed-dim block truncate">{currentBatch.mechanical.yield_rp02}</strong>
                      </div>
                      <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2.5">
                        <span className="text-[10px] text-on-surface-variant dark:text-outline-variant block">A (%)</span>
                        <strong className="text-xs text-on-surface dark:text-surface-bright block">{currentBatch.mechanical.elongation_a}</strong>
                      </div>
                      <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2.5">
                        <span className="text-[10px] text-on-surface-variant dark:text-outline-variant block">Hardness</span>
                        <strong className="text-xs text-on-surface dark:text-surface-bright block">{currentBatch.mechanical.hardness || '免做'}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 右侧 60%：规则切片绑定、综合判定横幅与模块 A/B/C 比对表 */}
                <div className="lg:col-span-7 space-y-4">

                  {/* 锁定规则切片与前置条件 */}
                  <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-4 shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-lg">lock</span>
                      <span className="font-mono text-xs font-bold text-on-surface dark:text-surface-bright">
                        锁定规则切片：{currentBatch.standard} / {currentBatch.grade}
                      </span>
                    </div>
                    <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mt-1">
                      (当前试样规格: {currentBatch.dimensions})
                    </span>
                  </div>

                  {/* 大尺寸判定看板 */}
                  <div className={`rounded-xl p-4 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs ${isPass
                    ? 'bg-status-pass-bg border-emerald-300 dark:border-emerald-900 text-status-pass-text'
                    : 'bg-status-fail-bg border-red-300 dark:border-red-900 text-status-fail-text'
                    }`}>
                    <div>
                      <h3 className="text-lg font-bold font-headline">
                        {isPass ? '综合判定: PASS 全项合格' : '综合判定: FAIL 一票否决不合格'}
                      </h3>
                      <p className="text-xs opacity-90 font-sans mt-0.5">
                        ({currentBatch.verdictSummary})
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => goToStep(3)}
                        className="px-3 py-1.5 rounded-lg border border-current bg-surface-container-lowest dark:bg-surface-dark text-xs font-bold"
                      >
                        拒收
                      </button>
                      <button
                        type="button"
                        onClick={onOpenHitlDrawer}
                        className="px-3 py-1.5 rounded-lg border border-current bg-surface-container-lowest dark:bg-surface-dark text-xs font-bold"
                      >
                        特批放行
                      </button>
                      <button
                        type="button"
                        onClick={() => goToStep(3)}
                        className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs"
                      >
                        审批结果
                      </button>
                    </div>
                  </div>

                  {/* 模块 A: 化学成分比对表 */}
                  <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-4 shadow-xs space-y-2">
                    <h4 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                      模块 A: 化学成分比对表
                    </h4>
                    <div className="border border-outline-variant/40 dark:border-border-dark rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-surface-container-low dark:bg-surface-dark-low text-[11px] text-on-surface-variant dark:text-outline-variant border-b dark:border-border-dark">
                          <tr>
                            <th className="px-3 py-2">指标</th>
                            <th className="px-3 py-2">实测值</th>
                            <th className="px-3 py-2">标准范围 [Min, Max]</th>
                            <th className="px-3 py-2">偏差量</th>
                            <th className="px-3 py-2">状态</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/20 dark:divide-border-dark/60">
                          {currentBatch.chemical.slice(0, 4).map((row, idx) => (
                            <tr key={idx} className="hover:bg-surface-container-low/40 dark:hover:bg-surface-dark-low/40">
                              <td className="px-3 py-1.5 font-bold text-on-surface dark:text-surface-bright">{row.element}</td>
                              <td className="px-3 py-1.5 text-primary dark:text-primary-fixed-dim font-bold">{row.value}</td>
                              <td className="px-3 py-1.5 text-on-surface-variant dark:text-outline-variant">[标准要求内]</td>
                              <td className="px-3 py-1.5 text-on-surface-variant dark:text-outline-variant">0.00</td>
                              <td className="px-3 py-1.5">
                                <span className="px-2 py-0.5 rounded bg-status-pass-bg text-status-pass-text text-[10px] font-bold">
                                  ✓ PASS
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 模块 B & 模块 C 双栏 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 模块 B */}
                    <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-4 shadow-xs space-y-2">
                      <h4 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                        模块 B: 力学性能
                      </h4>
                      <div className="space-y-1.5 text-xs font-mono">
                        <div className="flex justify-between items-center border-b border-outline-variant/30 dark:border-border-dark pb-1 text-on-surface dark:text-surface-bright">
                          <span>Rm:</span>
                          <strong className="text-status-pass-text flex items-center gap-1">
                            {currentBatch.mechanical.tensile_rm} <span className="material-symbols-outlined text-sm">check_circle</span>
                          </strong>
                        </div>
                        <div className="flex justify-between items-center border-b border-outline-variant/30 dark:border-border-dark pb-1 text-on-surface dark:text-surface-bright">
                          <span>Rp0.2:</span>
                          <strong className="text-status-pass-text flex items-center gap-1">
                            {currentBatch.mechanical.yield_rp02} <span className="material-symbols-outlined text-sm">check_circle</span>
                          </strong>
                        </div>
                      </div>

                      {/* 紫色 AST 公式提示框 */}
                      {currentBatch.mechanical.astFormulaNote && (
                        <div className="p-2.5 rounded-lg bg-status-hitl-bg border border-purple-200 dark:border-purple-900 text-status-hitl-text text-[11px] flex items-center gap-2">
                          <span className="material-symbols-outlined text-base">auto_awesome</span>
                          <span>{currentBatch.mechanical.astFormulaNote}</span>
                        </div>
                      )}
                    </div>

                    {/* 模块 C */}
                    <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-4 shadow-xs space-y-2">
                      <h4 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                        模块 C: 定性条款
                      </h4>
                      <div className="space-y-2 text-xs">
                        <div className="p-2.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-lg flex justify-between items-center">
                          <span className="font-medium text-on-surface dark:text-surface-bright">压扁试验 (Flattening)</span>
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${currentBatch.process.flattening === 'PASS'
                            ? 'bg-status-pass-bg text-status-pass-text'
                            : 'bg-status-fail-bg text-status-fail-text'
                            }`}>
                            {currentBatch.process.flattening === 'PASS' ? 'PASS' : 'FAIL (未检)'}
                          </span>
                        </div>
                        <div className="p-2.5 bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-lg flex justify-between items-center">
                          <span className="font-medium text-on-surface dark:text-surface-bright">晶间腐蚀 (Method E)</span>
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${currentBatch.process.intergranularCorrosion === 'PASS'
                            ? 'bg-status-pass-bg text-status-pass-text'
                            : 'bg-status-fail-bg text-status-fail-text'
                            }`}>
                            {currentBatch.process.intergranularCorrosion === 'PASS' ? 'PASS' : 'FAIL (未检)'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>


          {/* ========================================================================= */}
          {/* 步骤 4: 归档与报告导出 / 拒收处置 (挂载统一标题与批次选择条) */}
          {/* ========================================================================= */}
          <section className="w-full h-full shrink-0 overflow-y-auto custom-scrollbar p-6 space-y-4">
            <div className="max-w-[1440px] mx-auto w-full space-y-4">

              {/* 顶部统一标题与两层树状批次选择条 */}
              <div className="relative z-30">
                <BatchContextBar
                  stepTitle="步骤 4: 报告归档与导出"
                  session={session}
                  selectedDocId={selectedDocId}
                  selectedBatchNo={selectedBatchNo}
                  onSelectDoc={setSelectedDocId}
                  onSelectBatch={(docId, batchNo) => {
                    setSelectedDocId(docId);
                    setSelectedBatchNo(batchNo);
                  }}
                  mode="compliance"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                {/* 左侧 40%：A4 拟真打印预览纸张 (带 PASS / REJECT 对角线水印章) */}
                <div className="lg:col-span-5 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-5 shadow-sheet flex flex-col items-center">
                  <div className="flex justify-between items-center w-full mb-3 pb-2 border-b border-outline-variant/40 dark:border-border-dark">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-xl">description</span>
                      <h3 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                        {isPass ? '智能报告预览' : '不合格拒收说明报告预览'}
                      </h3>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant cursor-pointer">zoom_in</span>
                  </div>

                  {/* A4 尺寸拟真白底纸张 */}
                  <div className="paper-texture border border-outline-variant/40 rounded p-6 relative w-full max-w-[380px] min-h-[480px] shadow-sm flex flex-col justify-between overflow-hidden">

                    {/* 斜向水印大章 */}
                    <div
                      className={`absolute inset-0 flex items-center justify-center pointer-events-none select-none -rotate-25 font-bold text-7xl uppercase opacity-15 ${isPass ? 'text-status-pass-text' : 'text-status-fail-text'
                        }`}
                    >
                      {isPass ? 'PASS' : 'REJECT'}
                    </div>

                    <div className="space-y-4 relative z-10">
                      <div className="text-center border-b pb-3 border-outline-variant/30">
                        <h4 className="text-base font-bold font-headline text-on-surface">
                          {isPass ? '材料合规性核验报告' : '物资不合格拒收处置报告'}
                        </h4>
                        <span className="font-mono text-[10px] text-on-surface-variant tracking-wider">
                          REPORT NO: {currentBatch.reportNo}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono border-b pb-3 border-outline-variant/30 text-on-surface">
                        <div>
                          <span className="text-on-surface-variant block">生成时间:</span>
                          <strong>2026-08-26 15:30</strong>
                        </div>
                        <div>
                          <span className="text-on-surface-variant block">检验员:</span>
                          <strong>{currentBatch.inspector}</strong>
                        </div>
                        <div>
                          <span className="text-on-surface-variant block">标准依据:</span>
                          <strong>{currentBatch.standard}</strong>
                        </div>
                        <div>
                          <span className="text-on-surface-variant block">结论:</span>
                          <strong className={isPass ? 'text-status-pass-text' : 'text-status-fail-text'}>
                            {isPass ? '合格 PASS' : '拒收 REJECT'}
                          </strong>
                        </div>
                      </div>

                      <div className="bg-surface-container-low/60 dark:bg-surface-dark-low/60 rounded p-3 text-[11px] font-mono space-y-1">
                        <span className="font-bold block text-on-surface">关键数据汇总:</span>
                        <div className="flex justify-between text-on-surface">
                          <span className="text-on-surface-variant">炉号:</span>
                          <span>{currentBatch.heatNo}</span>
                        </div>
                        <div className="flex justify-between text-on-surface">
                          <span className="text-on-surface-variant">批次:</span>
                          <span>{currentBatch.batchNo}</span>
                        </div>
                        <div className="flex justify-between text-on-surface">
                          <span className="text-on-surface-variant">牌号:</span>
                          <span className="text-primary font-bold">{currentBatch.grade}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-outline-variant/30 flex justify-between items-end text-[10px] font-mono text-on-surface-variant relative z-10">
                      <span className="truncate max-w-[180px]">指纹: {currentBatch.sha256Hash.slice(0, 16)}...</span>
                      <div className="text-right shrink-0">
                        <span>电子签名: </span>
                        <strong className="italic text-primary font-serif">Signature (QA)</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 右侧 60%：导出格式选择、存证摘要与归档网络路径 */}
                <div className="lg:col-span-7 space-y-4">

                  {/* 导出格式 2x2 大卡片网格 */}
                  <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-5 shadow-xs space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-xl">file_download</span>
                      <h3 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                        导出格式选择
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {[
                        { id: 'PDF', title: 'PDF (盖章版)', desc: '包含电子签名与红色质量专用章，适合最终交付与存档。', icon: 'picture_as_pdf', color: 'text-red-500' },
                        { id: 'EXCEL', title: 'Excel (明细版)', desc: '包含所有化学成分与力学实测原始数据对照表。', icon: 'table_view', color: 'text-emerald-600' },
                        { id: 'JSON', title: 'JSON (系统级接口)', desc: '结构化数据，供下游 ERP/MES 系统自动化集成调用。', icon: 'data_object', color: 'text-amber-500' },
                        { id: 'CA', title: 'CA (区块链存证)', desc: '生成带唯一指纹 hash 的数字存证包，防篡改。', icon: 'verified_user', color: 'text-purple-600' },
                      ].map(fmt => {
                        const isSelected = selectedExportFormat === fmt.id;
                        return (
                          <div
                            key={fmt.id}
                            onClick={() => setSelectedExportFormat(fmt.id)}
                            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${isSelected
                              ? 'border-primary dark:border-primary-fixed-dim bg-primary/5 dark:bg-primary-fixed-dim/10 shadow-xs'
                              : 'border-outline-variant/60 dark:border-border-dark hover:border-outline bg-surface-container-lowest dark:bg-surface-dark'
                              }`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className={`material-symbols-outlined text-2xl ${fmt.color}`}>
                                {fmt.icon}
                              </span>
                              {isSelected && (
                                <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-lg fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                                  check_circle
                                </span>
                              )}
                            </div>
                            <div>
                              <strong className="text-xs font-bold block text-on-surface dark:text-surface-bright">{fmt.title}</strong>
                              <p className="text-[11px] text-on-surface-variant dark:text-outline-variant mt-1 leading-snug">{fmt.desc}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 存证与审计摘要 */}
                  <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-5 shadow-xs space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-xl">shield</span>
                      <h3 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                        存证与审计摘要
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                      <div>
                        <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-1">存证哈希值 (SHA-256)</span>
                        <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2 text-on-surface dark:text-surface-bright truncate">
                          {currentBatch.sha256Hash}
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-1">操作员 ID</span>
                        <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2 text-on-surface dark:text-surface-bright">
                          {currentBatch.inspector}
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-1">核验总耗时</span>
                        <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2 text-on-surface dark:text-surface-bright">
                          1.2s (OCR + 规则引擎)
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-1">规则库版本</span>
                        <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded p-2 text-on-surface dark:text-surface-bright">
                          DB_v2023.10.15_Release
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 归档位置 */}
                  <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-4 shadow-xs flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-2xl">cloud_done</span>
                      <div>
                        <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block">主服务器归档路径</span>
                        <span className="font-mono text-xs text-on-surface dark:text-surface-bright font-bold">
                          //nas-qcdp-01/archives/2026/08/26/{session.sessionId}/{currentBatch.batchNo}/
                        </span>
                      </div>
                    </div>
                    <button type="button" className="text-primary dark:text-primary-fixed-dim text-xs font-bold hover:underline">
                      修改路径
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 底部常驻导航条 (Fixed Stepper Bar - 宽度定宽 1440px 居中) */}
      {/* ========================================================================= */}
      <footer className="h-16 shrink-0 bg-surface-container-lowest dark:bg-bg-industrial-slate border-t border-outline-variant/60 dark:border-border-dark flex justify-center items-center z-30 shadow-sheet select-none">
        <div className="w-[1440px] max-w-full px-6 flex justify-between items-center">

          {/* 4 步骤连线指示器 */}
          <div className="flex items-center gap-2 sm:gap-4">
            {[
              { id: 0, title: '上传文档', icon: 'upload_file' },
              { id: 1, title: '核对数据', icon: 'fact_check' },
              { id: 2, title: '比对标准', icon: 'compare_arrows' },
              { id: 3, title: '归档/导出', icon: 'archive' },
            ].map((step, idx) => {
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              return (
                <React.Fragment key={step.id}>
                  {idx > 0 && (
                    <div className={`w-6 sm:w-10 h-[2px] transition-colors ${isCompleted ? 'bg-primary dark:bg-primary-fixed-dim' : 'bg-outline-variant/60 dark:bg-border-dark'
                      }`} />
                  )}

                  <button
                    type="button"
                    onClick={() => goToStep(step.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${isActive
                      ? 'bg-primary dark:bg-primary-container text-on-primary font-bold shadow-xs'
                      : isCompleted
                        ? 'text-status-pass-text bg-status-pass-bg dark:bg-emerald-950/40 dark:text-emerald-300 font-medium'
                        : 'text-on-surface-variant dark:text-outline-variant hover:text-on-surface dark:hover:text-surface-bright'
                      }`}
                  >
                    <span className="material-symbols-outlined text-base">
                      {isCompleted ? 'check_circle' : step.icon}
                    </span>
                    <span className="text-xs">{step.title}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {/* 右侧动作流转按钮（Step 1 收窄为单一主按钮，触发新建 Session） */}
          <div className="flex items-center gap-3">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={() => goToStep(currentStep - 1)}
                className="px-4 py-2 rounded-lg border border-outline-variant dark:border-border-dark text-xs font-medium text-on-surface dark:text-surface-bright hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors"
              >
                返回上一步
              </button>
            )}

            {currentStep === 0 && (
              <button
                type="button"
                onClick={handleStartNewSessionAndAdvance}
                className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>下一步：解析文档并核对数据</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            )}

            {currentStep === 1 && (
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>核对完成，开始比对</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            )}

            {currentStep === 2 && (
              <button
                type="button"
                onClick={() => goToStep(3)}
                className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>{isPass ? '比对通过，生成质检报告' : '生成拒收说明'}</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            )}

            {currentStep === 3 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    window.print();
                  }}
                  className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <span>确认导出</span>
                  <span className="material-symbols-outlined text-base">file_download</span>
                </button>
                <button
                  type="button"
                  onClick={() => goToStep(0)}
                  className="px-4 py-2 rounded-lg border border-outline-variant dark:border-border-dark text-xs font-bold text-on-surface dark:text-surface-bright hover:bg-surface-container-low dark:hover:bg-surface-dark-low transition-colors"
                >
                  开启新任务
                </button>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
