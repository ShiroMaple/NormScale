'use client';

import React, { useRef, useState } from 'react';
import { PresetSampleDto } from '@/lib/api-client.ts';
import { QueuedDocItem, CachedDocItem } from '../types.ts';
import { CachedDocsGrid } from '../components/CachedDocsGrid.tsx';
import { ScenarioMatrixSection } from '../components/ScenarioMatrixSection.tsx';

export interface Step1DocumentQueuePanelProps {
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  // File Upload
  onSelectRealFiles: (files: FileList | File[]) => void;
  // Queued Docs
  queuedDocs: QueuedDocItem[];
  selectedDocId: string;
  selectedSampleId?: string;
  onSelectDoc: (docId: string) => void;
  onRemoveOrCancelDoc: (doc: QueuedDocItem, e: React.MouseEvent) => void;
  isAuditing?: boolean;
  // Tech Agreement
  uploadedAgreementFile: File | null;
  agreementUploadError: string | null;
  isAgreementDraggingOver: boolean;
  setIsAgreementDraggingOver: (dragging: boolean) => void;
  onSelectAgreementFile: (file: File) => void;
  onRemoveAgreementFile: () => void;
  // Cached Docs
  cachedDocs: CachedDocItem[];
  onRestoreFromCache: (item: CachedDocItem) => void;
  onDeleteCachedDoc: (item: CachedDocItem, e: React.MouseEvent) => void;
  onRefreshCachedDocs: () => void;
  // Scenario Samples
  scenarioSamples: PresetSampleDto[];
  loadingScenarios: Record<string, boolean>;
  onLoadScenarioFile: (scenario: PresetSampleDto) => void;
}

/**
 * 步骤 1: 批量质保证书录入面板 (DocEx 风格物理文档队列与极简上传区)
 * 包含：本地质保书拖拽上传区、待处理文档队列卡片、技术协议上传区、历史缓存列表与场景专测矩阵
 */
export const Step1DocumentQueuePanel: React.FC<Step1DocumentQueuePanelProps> = ({
  scrollContainerRef,
  onSelectRealFiles,
  queuedDocs,
  selectedDocId,
  selectedSampleId,
  onSelectDoc,
  onRemoveOrCancelDoc,
  isAuditing = false,
  uploadedAgreementFile,
  agreementUploadError,
  isAgreementDraggingOver,
  setIsAgreementDraggingOver,
  onSelectAgreementFile,
  onRemoveAgreementFile,
  cachedDocs,
  onRestoreFromCache,
  onDeleteCachedDoc,
  onRefreshCachedDocs,
  scenarioSamples,
  loadingScenarios,
  onLoadScenarioFile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const agreementFileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isScenariosExpanded, setIsScenariosExpanded] = useState(false);

  return (
    <section ref={scrollContainerRef as any} className="w-full h-full shrink-0 overflow-y-auto custom-scrollbar p-6 space-y-6">
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

        {/* 隐藏式真实文件选择输入框 */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={e => {
            if (e.target.files) {
              onSelectRealFiles(e.target.files);
              e.target.value = '';
            }
          }}
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.bmp"
          className="hidden"
        />

        {/* 三栏分栏：左侧质保书上传区 + 中间待处理文档队列 + 右侧技术协议上传 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* 1. 左侧：质保书上传区 */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={e => {
              e.preventDefault();
              setIsDraggingOver(false);
              if (e.dataTransfer.files) {
                onSelectRealFiles(e.dataTransfer.files);
              }
            }}
            className={`lg:col-span-4 xl:col-span-5 bg-surface-container-lowest dark:bg-surface-dark border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all min-h-[300px] shadow-xs group ${
              isDraggingOver
                ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                : 'border-outline-variant/60 dark:border-border-dark hover:border-primary dark:hover:border-primary-fixed-dim'
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-surface-container-low dark:bg-surface-dark-low text-on-surface-variant group-hover:text-primary group-hover:bg-primary/10 flex items-center justify-center transition-all mb-3">
              <span className="material-symbols-outlined text-2xl">cloud_upload</span>
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-on-surface dark:text-surface-bright mb-1">
              拖拽质保书到此处，或点击选取
            </h3>
            <p className="text-[11px] text-on-surface-variant dark:text-outline-variant leading-relaxed max-w-[260px]">
              自动秒级检索缓存与存证，支持多份 PDF 及扫描件
            </p>
          </div>

          {/* 2. 中间：待处理文档队列 */}
          <div className="lg:col-span-5 xl:col-span-4 bg-surface-container-lowest/60 dark:bg-surface-dark/60 border border-outline-variant/60 dark:border-border-dark rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[300px]">
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
                    const isSelected = selectedDocId === doc.id || selectedSampleId === doc.id;
                    const isUploading = doc.status === '上传中';
                    return (
                      <div
                        key={doc.id}
                        onClick={() => onSelectDoc(doc.id)}
                        className={`relative group p-3 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-between text-center h-36 ${
                          isSelected
                            ? 'border-primary dark:border-primary-fixed-dim ring-2 ring-primary/20 bg-surface-container-lowest dark:bg-surface-dark shadow-xs'
                            : 'border-outline-variant/60 dark:border-border-dark hover:border-outline bg-surface-container-lowest dark:bg-surface-dark'
                        }`}
                      >
                        {/* 右上角 Hover 出现的关闭/取消按钮 */}
                        <button
                          type="button"
                          title={isUploading ? '取消上传' : '移出待处理队列'}
                          onClick={e => onRemoveOrCancelDoc(doc, e)}
                          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-on-surface-variant hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 opacity-0 group-hover:opacity-100 transition-all z-10"
                        >
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>

                        <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-2xl fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                            picture_as_pdf
                          </span>
                        </div>

                        <span className="text-xs font-bold text-on-surface dark:text-surface-bright line-clamp-2 max-w-[130px] break-all leading-tight my-1">
                          {doc.filename}
                        </span>

                        <span
                          className={`text-[11px] font-bold ${
                            doc.status === '解析中'
                              ? 'text-primary dark:text-primary-fixed-dim animate-pulse'
                              : isUploading
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-status-pass-text'
                          }`}
                        >
                          {isAuditing && selectedSampleId === doc.id ? '解析中' : doc.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 3. 右侧：技术协议上传 */}
          <div className="lg:col-span-3 xl:col-span-3 bg-surface-container-lowest/60 dark:bg-surface-dark/60 border border-outline-variant/60 dark:border-border-dark rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[300px]">
            <input
              type="file"
              ref={agreementFileInputRef}
              onChange={e => {
                if (e.target.files && e.target.files[0]) {
                  onSelectAgreementFile(e.target.files[0]);
                  e.target.value = '';
                }
              }}
              accept=".pdf,application/pdf"
              className="hidden"
            />

            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-purple-600 dark:text-purple-400 text-base">
                    contract
                  </span>
                  <h2 className="text-xs font-bold text-on-surface dark:text-surface-bright">
                    技术协议上传
                  </h2>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-200 border border-purple-300 dark:border-purple-700 shadow-2xs">
                  待实施
                </span>
              </div>

              {!uploadedAgreementFile ? (
                <div
                  onClick={() => agreementFileInputRef.current?.click()}
                  onDragOver={e => {
                    e.preventDefault();
                    setIsAgreementDraggingOver(true);
                  }}
                  onDragLeave={() => setIsAgreementDraggingOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setIsAgreementDraggingOver(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      onSelectAgreementFile(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all min-h-[170px] group ${
                    isAgreementDraggingOver
                      ? 'border-purple-500 ring-2 ring-purple-400/30 bg-purple-50/20'
                      : 'border-outline-variant/60 dark:border-border-dark hover:border-purple-500 bg-surface-container-lowest dark:bg-surface-dark'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/60 flex items-center justify-center transition-all mb-2">
                    <span className="material-symbols-outlined text-2xl">description</span>
                  </div>
                  <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright mb-1">
                    选择或拖拽订货技术协议
                  </h3>
                  <p className="text-[11px] text-on-surface-variant dark:text-outline-variant leading-relaxed">
                    限定单份 PDF 文档，用于定义买方专属加严指标
                  </p>
                  {agreementUploadError && (
                    <div className="mt-2 text-[11px] text-red-600 dark:text-red-400 font-semibold">
                      {agreementUploadError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/20 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-xl fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                          picture_as_pdf
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-on-surface dark:text-surface-bright truncate max-w-[150px]" title={uploadedAgreementFile.name}>
                          {uploadedAgreementFile.name}
                        </h4>
                        <span className="text-[10px] text-on-surface-variant dark:text-outline-variant">
                          {(uploadedAgreementFile.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onRemoveAgreementFile}
                      title="移除该协议"
                      className="w-5 h-5 rounded-full flex items-center justify-center text-on-surface-variant hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors shrink-0"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>

                  <div className="p-2 rounded-lg bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/40 dark:border-border-dark space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-purple-700 dark:text-purple-300 font-bold">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      <span>功能待实施 · 暂未接入后端</span>
                    </div>
                    <p className="text-[10px] text-on-surface-variant dark:text-outline-variant leading-relaxed">
                      协议已暂存于当前会话。比对引擎已就绪，后端解析端点演进中。
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="text-[10px] text-on-surface-variant dark:text-outline-variant pt-2 border-t border-outline-variant/30 dark:border-border-dark flex items-center justify-between mt-3">
              <span>限 1 份</span>
              <span>限定 PDF</span>
            </div>
          </div>
        </div>

        {/* 1. 历史已缓存文档栏 */}
        <CachedDocsGrid
          cachedDocs={cachedDocs}
          onRestoreFromCache={onRestoreFromCache}
          onDeleteCachedDoc={onDeleteCachedDoc}
          onRefreshCachedDocs={onRefreshCachedDocs}
        />

        {/* 2. 分层核验场景专测矩阵 */}
        <ScenarioMatrixSection
          scenarioSamples={scenarioSamples}
          isExpanded={isScenariosExpanded}
          onToggleExpand={() => setIsScenariosExpanded(prev => !prev)}
          loadingScenarios={loadingScenarios}
          onLoadScenarioFile={onLoadScenarioFile}
        />
      </div>
    </section>
  );
};
