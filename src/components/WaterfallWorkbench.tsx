'use client';

import React, { useState } from 'react';
import { AuditReport } from '@/schemas/report.schema.ts';
import { PresetSampleDto, StandardOverviewDto } from '@/lib/api-client.ts';

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
}

/**
 * ============================================================================
 * NormScale 工业质检工作台 (1:1 像素级还原 Stitch 设计系统)
 * 采用受控垂直平滑滑动容器，禁止全局滚轮脱焦，通过底部 Stepper 与动作按钮切换
 * ============================================================================
 */
export const WaterfallWorkbench: React.FC<WaterfallWorkbenchProps> = ({
  samples,
  selectedSampleId,
  onSelectSample,
  isAuditing,
  currentReport,
  onOpenHitlDrawer,
  onTriggerAudit,
}) => {
  // 当前激活的步骤索引：0 (Step 1), 1 (Step 2), 2 (Step 3), 3 (Step 4)
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState<number>(125);
  const [selectedExportFormat, setSelectedExportFormat] = useState<string>('PDF');
  const [activeTabSub, setActiveTabSub] = useState<'chem' | 'mech'>('chem');
  const [historySearch, setHistorySearch] = useState<string>('');

  const isPass = currentReport ? currentReport.summary.overall_status === 'PASS' : true;
  const isHitl = currentReport ? currentReport.summary.overall_status === 'MANUAL_REVIEW' : selectedSampleId === 'unknown_grade_hitl_sample';

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
          {/* 步骤 1: 批量质保证书录入 (对应设计稿 _4/screen.png & _4/code.html) */}
          {/* ========================================================================= */}
          <section className="w-full h-full shrink-0 overflow-y-auto custom-scrollbar p-6 space-y-5">
            {/* 页面标题与操作 */}
            <div className="flex justify-between items-start">
              <div>
                <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface dark:text-surface-bright tracking-tight">
                  批量质保证书录入
                </h1>
                <p className="text-body-md text-on-surface-variant dark:text-outline-variant mt-0.5">
                  上传材料质量证明书，进行自动化 OCR 数据提取与标准核验。
                </p>
              </div>
              <button
                type="button"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark text-xs font-medium text-on-surface-variant hover:text-primary dark:hover:text-primary-fixed-dim shadow-xs transition-colors"
              >
                <span className="material-symbols-outlined text-base">history</span>
                <span>查看近期批次</span>
              </button>
            </div>

            {/* 左右 5:5 核心操作卡片 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              
              {/* 左侧：文档上传区 */}
              <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-5 shadow-xs space-y-4 relative flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-xl">upload_file</span>
                      <h2 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                        文档上传区
                      </h2>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-primary text-on-primary font-mono text-[11px] font-bold">
                      Step 1
                    </span>
                  </div>

                  {/* 应用项目配置小面板 */}
                  <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/50 dark:border-border-dark rounded-lg p-3 space-y-2.5 mb-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-on-surface dark:text-surface-bright">
                      <input type="checkbox" defaultChecked className="rounded text-primary focus:ring-primary h-3.5 w-3.5" />
                      <span>应用项目配置</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-1">项目背景</span>
                        <select className="w-full text-xs rounded border border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark px-2 py-1.5 text-on-surface dark:text-surface-bright focus:outline-none">
                          <option>Area Optimization (26XXX-0888)</option>
                          <option>PetroChemical HeatEx Proj-02</option>
                        </select>
                      </div>
                      <div>
                        <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mb-1">材料分类</span>
                        <select className="w-full text-xs rounded border border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark px-2 py-1.5 text-on-surface dark:text-surface-bright focus:outline-none">
                          <option>不锈钢管材 (GB/T 13296)</option>
                          <option>特种承压合金管 (GB/T 14976)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* 虚线大尺寸拖拽上传区域 */}
                  <div className="border-2 border-dashed border-primary/30 dark:border-primary-fixed-dim/30 rounded-xl p-8 flex flex-col items-center justify-center text-center bg-primary/2 dark:bg-primary/5 hover:bg-primary/5 transition-colors cursor-pointer">
                    <div className="w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-xs mb-3">
                      <span className="material-symbols-outlined text-2xl">add_photo_alternate</span>
                    </div>
                    <h3 className="text-sm font-bold text-on-surface dark:text-surface-bright mb-1">
                      将文档拖拽至此处
                    </h3>
                    <p className="text-[11px] text-on-surface-variant dark:text-outline-variant mb-4">
                      支持 PDF, PNG, JPG, TIFF, DOCX (单文件最大 50MB)
                    </p>
                    <button
                      type="button"
                      onClick={onTriggerAudit}
                      className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-base">folder_open</span>
                      <span>浏览文件</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 右侧：待处理质保书队列 */}
              <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-xl">playlist_add_check</span>
                      <h2 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                        待处理质保书队列
                      </h2>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-surface-container-high dark:bg-surface-dark-high text-on-surface-variant font-mono text-[11px] font-bold">
                      {samples.length} Items
                    </span>
                  </div>

                  {/* 3 张预设待检样本卡片 */}
                  <div className="space-y-2.5">
                    {samples.map(sample => {
                      const isSelected = selectedSampleId === sample.id;
                      return (
                        <div
                          key={sample.id}
                          onClick={() => onSelectSample(sample.id)}
                          className={`p-3.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'border-primary dark:border-primary-fixed-dim bg-primary/5 dark:bg-primary-fixed-dim/10 shadow-xs'
                              : 'border-outline-variant/60 dark:border-border-dark hover:border-outline bg-surface-container-lowest dark:bg-surface-dark'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                              sample.id === '316l_kgf_sample' ? 'bg-status-fail-bg text-status-fail-text' :
                              sample.id === 'unknown_grade_hitl_sample' ? 'bg-status-hitl-bg text-status-hitl-text' :
                              'bg-status-pass-bg text-status-pass-text'
                            }`}>
                              <span className="material-symbols-outlined text-xl">
                                {sample.id === '316l_kgf_sample' ? 'report_problem' :
                                 sample.id === 'unknown_grade_hitl_sample' ? 'contact_support' : 'verified'}
                              </span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-xs text-on-surface dark:text-surface-bright">
                                  {sample.title}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                  sample.expected_outcome === 'FAIL' ? 'bg-status-fail-bg text-status-fail-text' :
                                  sample.expected_outcome === 'AWAITING_HUMAN_REVIEW' ? 'bg-status-hitl-bg text-status-hitl-text' :
                                  'bg-status-pass-bg text-status-pass-text'
                                }`}>
                                  {sample.expected_outcome === 'FAIL' ? '一票否决' :
                                   sample.expected_outcome === 'AWAITING_HUMAN_REVIEW' ? '人机协同' : '全项合格'}
                                </span>
                              </div>
                              <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mt-0.5 line-clamp-1">
                                {sample.description}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {isSelected && (
                              <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim text-lg fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                                check_circle
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 队列底部触发操作 */}
                <div className="pt-4 mt-4 border-t border-outline-variant/40 dark:border-border-dark flex items-center justify-between">
                  <span className="text-[11px] text-on-surface-variant dark:text-outline-variant">
                    当前选中待核验单据: <strong className="text-on-surface dark:text-surface-bright font-mono">{selectedSampleId}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onTriggerAudit();
                      goToStep(1);
                    }}
                    disabled={isAuditing}
                    className="px-4 py-2 bg-primary hover:bg-primary-container text-on-primary rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <span className={`material-symbols-outlined text-base ${isAuditing ? 'animate-spin' : ''}`}>
                      {isAuditing ? 'autorenew' : 'play_arrow'}
                    </span>
                    <span>{isAuditing ? '正在执行 OCR 与规则比对...' : '开始执行智能核验流转'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 历史缓存凭证栏 */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-lg">history_edu</span>
                  <h3 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                    历史缓存凭证
                  </h3>
                </div>
                <div className="relative w-64">
                  <span className="material-symbols-outlined text-on-surface-variant absolute left-2.5 top-2 text-base">search</span>
                  <input
                    type="text"
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    placeholder="搜索缓存凭证..."
                    className="w-full text-xs rounded-lg border border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark pl-8 pr-3 py-1.5 text-on-surface dark:text-surface-bright placeholder-on-surface-variant/60 focus:outline-none"
                  />
                </div>
              </div>

              {/* 三列 PDF 卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { name: 'Baosteel_S30408_Tube.pdf', time: '2 hrs ago', size: '1.2 MB', sample: 's30408_messy_sample' },
                  { name: 'Tisco_06Cr19Ni10_Plate.pdf', time: '5 hrs ago', size: '3.4 MB', sample: '316l_kgf_sample' },
                  { name: 'Wisco_Q345R_Vessel.pdf', time: '1 day ago', size: '800 KB', sample: 'unknown_grade_hitl_sample' },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      onSelectSample(item.sample);
                      onTriggerAudit();
                      goToStep(1);
                    }}
                    className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-3.5 shadow-xs flex items-center gap-3 cursor-pointer hover:border-primary transition-all"
                  >
                    <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-2xl fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                        picture_as_pdf
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-xs font-bold text-on-surface dark:text-surface-bright block truncate">
                        {item.name}
                      </span>
                      <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mt-0.5">
                        Uploaded {item.time} • {item.size}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>


          {/* ========================================================================= */}
          {/* 步骤 2: 质检工作台 - 解析结果核对 (对应设计稿 _3/screen.png & _3/code.html) */}
          {/* ========================================================================= */}
          <section className="w-full h-full shrink-0 overflow-y-auto custom-scrollbar p-6 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-outline-variant/40 dark:border-border-dark">
              <div className="flex items-center gap-3">
                <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface dark:text-surface-bright">
                  解析结果核对
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-status-pass-bg text-status-pass-text text-xs font-mono font-bold flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">verified</span>
                  <span>OCR 置信度: 96%</span>
                </span>
              </div>

              {isHitl && (
                <button
                  type="button"
                  onClick={onOpenHitlDrawer}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-hitl-bg text-status-hitl-text text-xs font-bold border border-purple-300 dark:border-purple-800 shadow-xs hover:opacity-90"
                >
                  <span className="material-symbols-outlined text-base">emergency_home</span>
                  <span>打开 HITL 人工介入复核抽屉</span>
                </button>
              )}
            </div>

            {/* 45% / 55% 左右分栏 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100%-4rem)]">
              
              {/* 左侧 45%：拟真 PDF 纸张视窗与交互式 OCR BBox */}
              <div className="lg:col-span-5 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl flex flex-col overflow-hidden shadow-sheet">
                {/* PDF 阅读器顶部工具栏 */}
                <div className="px-3.5 py-2 bg-surface-container-low dark:bg-surface-dark-low border-b border-outline-variant/40 dark:border-border-dark flex items-center justify-between text-xs text-on-surface-variant font-mono">
                  <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                    <span className="material-symbols-outlined text-base text-red-500">picture_as_pdf</span>
                    <span className="font-bold truncate text-on-surface dark:text-surface-bright">MTC-2026-09102.pdf</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setZoomLevel(prev => Math.max(75, prev - 15))}
                        className="p-1 hover:bg-surface-container-high rounded"
                      >
                        -
                      </button>
                      <span className="px-1 font-bold">{zoomLevel}%</span>
                      <button
                        type="button"
                        onClick={() => setZoomLevel(prev => Math.min(175, prev + 15))}
                        className="p-1 hover:bg-surface-container-high rounded"
                      >
                        +
                      </button>
                    </div>
                    <button type="button" className="p-1 hover:bg-surface-container-high rounded">
                      <span className="material-symbols-outlined text-sm">rotate_right</span>
                    </button>
                    <span>&lt; 1 / 3 &gt;</span>
                  </div>
                </div>

                {/* 拟真白底纸张视窗 */}
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
                    <h3 className="font-bold text-center text-sm font-mono tracking-widest uppercase border-b pb-2 mb-4">
                      MATERIAL TEST CERTIFICATE
                    </h3>

                    <div className="space-y-3 text-[11px] font-mono">
                      <div className="flex justify-between border-b pb-1">
                        <span>Supplier: 浙江某特种不锈钢管业有限公司</span>
                        <span>Date: 2026-08-23</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span>Standard: GB/T 13296-2023</span>
                        <span>Heat No: HT-2026-0881</span>
                      </div>

                      {/* OCR 标注框 1: 牌号与标准 */}
                      <div
                        className="ocr-box ocr-box-yellow left-6 top-24 w-80 h-10 flex items-center px-2 cursor-pointer"
                        title="OCR BBox #1: 牌号映射置信度 99%"
                      >
                        <span className="text-[10px] font-bold text-yellow-900 bg-yellow-200/80 px-1 rounded">
                          Grade: TP-316L (022Cr17Ni12Mo2)
                        </span>
                      </div>

                      {/* OCR 标注框 2: 化学成分矩阵 */}
                      <div
                        className="ocr-box ocr-box-blue left-6 top-40 w-96 h-32 p-2 cursor-pointer"
                        title="OCR BBox #2: 化学成分表 98% 置信度"
                      >
                        <div className="text-[10px] font-bold text-blue-900 bg-blue-100/90 px-1 inline-block rounded mb-1">
                          Chemical Matrix: C 0.025, Si 0.45, Ni 10.20, Mo 2.05...
                        </div>
                      </div>

                      {/* OCR 标注框 3: 力学与压扁 */}
                      <div
                        className="ocr-box ocr-box-yellow left-6 top-80 w-96 h-28 p-2 cursor-pointer"
                        title="OCR BBox #3: 物理单位换算 58.5 kgf/mm² -> 573.68 MPa"
                      >
                        <div className="text-[10px] font-bold text-yellow-900 bg-yellow-200/80 px-1 inline-block rounded mb-1">
                          Tensile Rm: 58.5 kgf/mm² (573.68 MPa)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 右侧 55%：结构化提取核对卡片 */}
              <div className="lg:col-span-7 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-5 shadow-xs flex flex-col justify-between overflow-y-auto custom-scrollbar">
                <div className="space-y-4">
                  
                  {/* 基础元数据双列卡片 */}
                  <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 dark:border-border-dark rounded-lg p-4 space-y-3">
                    <h3 className="text-xs font-bold text-on-surface dark:text-surface-bright uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base text-primary">info</span>
                      <span>基础元数据提取核对</span>
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[11px] text-on-surface-variant block">供货商名称 (Supplier)</span>
                        <input
                          type="text"
                          defaultValue="浙江某特种不锈钢管业有限公司"
                          className="w-full text-xs font-mono font-bold mt-1 rounded border border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark px-2.5 py-1 text-on-surface dark:text-surface-bright"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-on-surface-variant block">材料牌号 (Material Grade)</span>
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="text"
                            defaultValue="022Cr17Ni12Mo2 (S31603)"
                            className="flex-1 text-xs font-mono font-bold rounded border border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark px-2.5 py-1 text-on-surface dark:text-surface-bright"
                          />
                          <span className="px-2 py-1 bg-purple-50 text-purple-700 text-[10px] font-bold rounded shrink-0">
                            匹配度 98%
                          </span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-on-surface-variant block">炉号 (Heat No)</span>
                        <input
                          type="text"
                          defaultValue="HT-2026-0881"
                          className="w-full text-xs font-mono mt-1 rounded border border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark px-2.5 py-1"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-on-surface-variant block">批号 (Batch No)</span>
                        <input
                          type="text"
                          defaultValue="BN-20260823-01"
                          className="w-full text-xs font-mono mt-1 rounded border border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark px-2.5 py-1"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-on-surface-variant block">交货规格 (Dimensions)</span>
                        <input
                          type="text"
                          defaultValue="OD 25.0mm × WT 2.0mm × L 6000mm"
                          className="w-full text-xs font-mono mt-1 rounded border border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark px-2.5 py-1"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-on-surface-variant block">执行标准 (Standard)</span>
                        <input
                          type="text"
                          defaultValue="GB/T 13296-2023"
                          className="w-full text-xs font-mono mt-1 rounded border border-outline-variant dark:border-border-dark bg-surface-container-lowest dark:bg-surface-dark px-2.5 py-1 font-bold text-primary"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 化学与力学选项卡 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-b border-outline-variant/40 pb-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveTabSub('chem')}
                          className={`text-xs font-bold px-3 py-1 rounded-t-lg transition-all ${
                            activeTabSub === 'chem'
                              ? 'bg-primary/10 text-primary border-b-2 border-primary font-bold'
                              : 'text-on-surface-variant'
                          }`}
                        >
                          化学成分提取核对
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTabSub('mech')}
                          className={`text-xs font-bold px-3 py-1 rounded-t-lg transition-all ${
                            activeTabSub === 'mech'
                              ? 'bg-primary/10 text-primary border-b-2 border-primary font-bold'
                              : 'text-on-surface-variant'
                          }`}
                        >
                          力学与工艺条款核对
                        </button>
                      </div>
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-mono text-[10px] font-bold rounded">
                        Active Selection
                      </span>
                    </div>

                    {activeTabSub === 'chem' && (
                      <div className="border border-outline-variant/40 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-surface-container-low dark:bg-surface-dark-low text-[11px] text-on-surface-variant border-b">
                            <tr>
                              <th className="px-3 py-2">Element</th>
                              <th className="px-3 py-2">Extracted Value (%)</th>
                              <th className="px-3 py-2">OCR Confidence</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {[
                              { el: 'C', val: '0.025', conf: '99%', status: 'ok' },
                              { el: 'Si', val: '0.45', conf: '98%', status: 'ok' },
                              { el: 'Mn', val: '1.20', conf: '97%', status: 'ok' },
                              { el: 'P', val: '0.035', conf: '82%', status: 'warn', note: '需人工核实' },
                              { el: 'S', val: '0.008', conf: '96%', status: 'ok' },
                              { el: 'Ni', val: '10.20', conf: '99%', status: 'ok' },
                              { el: 'Cr', val: '16.80', conf: '98%', status: 'ok' },
                              { el: 'Mo', val: '2.05', conf: '97%', status: 'ok' },
                            ].map((row, idx) => (
                              <tr key={idx} className="hover:bg-surface-container-low/50">
                                <td className="px-3 py-1.5 font-bold">{row.el}</td>
                                <td className="px-3 py-1.5 font-bold text-primary">{row.val}</td>
                                <td className="px-3 py-1.5 flex items-center gap-1.5">
                                  <span>{row.conf}</span>
                                  {row.status === 'warn' && (
                                    <span className="px-1.5 py-0.2 bg-amber-50 text-amber-700 text-[10px] font-bold rounded flex items-center gap-0.5">
                                      <span className="material-symbols-outlined text-[12px]">warning</span>
                                      <span>{row.note}</span>
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {activeTabSub === 'mech' && (
                      <div className="p-3 bg-surface-container-low rounded-lg space-y-2 text-xs font-mono">
                        <div className="flex justify-between items-center border-b pb-1.5">
                          <span>Tensile Strength Rm:</span>
                          <strong className="text-primary">58.5 kgf/mm² (573.68 MPa) [99% 置信度]</strong>
                        </div>
                        <div className="flex justify-between items-center border-b pb-1.5">
                          <span>Yield Strength Rp0.2:</span>
                          <strong className="text-primary">24.5 kgf/mm² (240.26 MPa) [98% 置信度]</strong>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Elongation A:</span>
                          <strong className="text-primary">45.0 % [99% 置信度]</strong>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>


          {/* ========================================================================= */}
          {/* 步骤 3: 质检工作台 - 比对标准 (对应设计稿 _2/screen.png & _2/code.html) */}
          {/* ========================================================================= */}
          <section className="w-full h-full shrink-0 overflow-y-auto custom-scrollbar p-6 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              
              {/* 左侧 40%：质保书解析结果快照 (瓦片数字网格) */}
              <div className="lg:col-span-5 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-5 shadow-xs space-y-4">
                <h2 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                  质保书解析结果
                </h2>

                <div className="grid grid-cols-2 gap-3 text-xs border-b border-outline-variant/40 pb-3">
                  <div>
                    <span className="text-[11px] text-on-surface-variant block">供货商</span>
                    <strong className="font-mono text-on-surface dark:text-surface-bright block truncate">
                      Tisco Stainless Steel Co., Ltd.
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-on-surface-variant block">牌号</span>
                    <strong className="font-mono text-primary block">
                      022Cr17Ni12Mo2 / S31603
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-on-surface-variant block">炉号</span>
                    <span className="font-mono text-on-surface">HT-2026-0881</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-on-surface-variant block">批号</span>
                    <span className="font-mono text-on-surface">BN-20260823-01</span>
                  </div>
                </div>

                {/* 化学成分实测值瓦片 */}
                <div>
                  <span className="text-[11px] text-on-surface-variant block mb-2 font-medium">化学成分实测值 (%)</span>
                  <div className="grid grid-cols-4 gap-2 font-mono">
                    {[
                      { el: 'C', val: '0.025' },
                      { el: 'Si', val: '0.45' },
                      { el: 'Mn', val: '1.20' },
                      { el: 'P', val: '0.030' },
                      { el: 'S', val: '0.010' },
                      { el: 'Ni', val: '10.20' },
                      { el: 'Cr', val: '16.80' },
                      { el: 'Mo', val: '2.05' },
                    ].map(tile => (
                      <div key={tile.el} className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 rounded p-2 text-center">
                        <span className="text-[10px] text-on-surface-variant block">{tile.el}</span>
                        <strong className="text-xs text-on-surface dark:text-surface-bright block">{tile.val}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 力学性能实测值瓦片 */}
                <div>
                  <span className="text-[11px] text-on-surface-variant block mb-2 font-medium">力学性能实测值</span>
                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 rounded p-2.5">
                      <span className="text-[10px] text-on-surface-variant block">Rm (MPa)</span>
                      <strong className="text-sm text-primary block">573.68</strong>
                    </div>
                    <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 rounded p-2.5">
                      <span className="text-[10px] text-on-surface-variant block">Rp0.2 (MPa)</span>
                      <strong className="text-sm text-primary block">240.26</strong>
                    </div>
                    <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 rounded p-2.5">
                      <span className="text-[10px] text-on-surface-variant block">A (%)</span>
                      <strong className="text-sm text-on-surface dark:text-surface-bright block">45.0</strong>
                    </div>
                    <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 rounded p-2.5">
                      <span className="text-[10px] text-on-surface-variant block">Hardness (HRB)</span>
                      <strong className="text-sm text-on-surface dark:text-surface-bright block">85.0</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* 右侧 60%：规则切片绑定、综合判定横幅与模块 A/B/C 比对表 */}
              <div className="lg:col-span-7 space-y-4">
                
                {/* 锁定规则切片与前置条件 */}
                <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-4 shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg">lock</span>
                    <span className="font-mono text-xs font-bold text-on-surface dark:text-surface-bright">
                      锁定规则切片：GB/T 13296-2023 / S31603 (022Cr17Ni12Mo2)
                    </span>
                  </div>
                  <span className="text-[11px] text-on-surface-variant dark:text-outline-variant block mt-1">
                    (前置条件激活: 壁厚 2.0mm ≥ 1.7mm 触发硬度检验条款)
                  </span>
                </div>

                {/* 大尺寸判定看板 */}
                <div className={`rounded-xl p-4 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs ${
                  isPass
                    ? 'bg-status-pass-bg border-emerald-300 dark:border-emerald-900 text-status-pass-text'
                    : 'bg-status-fail-bg border-red-300 dark:border-red-900 text-status-fail-text'
                }`}>
                  <div>
                    <h3 className="text-lg font-bold font-headline">
                      {isPass ? '综合判定: PASS 全项合格' : '综合判定: FAIL 一票否决不合格'}
                    </h3>
                    <p className="text-xs opacity-90 font-sans mt-0.5">
                      {isPass
                        ? '(符合 GB/T 13296 锅炉及热交换器用不锈钢无缝钢管标准)'
                        : '(根据 GB/T 13296 第 6.4/6.5/6.6 条：存在 3 项出厂强制检验项目缺失)'}
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
                      className="px-4 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-bold shadow-xs hover:bg-primary-container"
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
                  <div className="border border-outline-variant/40 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-surface-container-low dark:bg-surface-dark-low text-[11px] text-on-surface-variant border-b">
                        <tr>
                          <th className="px-3 py-2">指标</th>
                          <th className="px-3 py-2">实测值</th>
                          <th className="px-3 py-2">标准范围 [Min, Max]</th>
                          <th className="px-3 py-2">偏差量</th>
                          <th className="px-3 py-2">状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/20">
                        {[
                          { name: 'C', meas: '0.025', range: '[-, 0.030]', diff: '-0.005', pass: true },
                          { name: 'Cr', meas: '16.80', range: '[16.00, 18.00]', diff: '+0.80', pass: true },
                          { name: 'Ni', meas: '10.20', range: '[10.00, 14.00]', diff: '+0.20', pass: true },
                          { name: 'Mo', meas: '2.05', range: '[2.00, 3.00]', diff: '+0.05', pass: true },
                        ].map((row, idx) => (
                          <tr key={idx} className="hover:bg-surface-container-low/40">
                            <td className="px-3 py-1.5 font-bold">{row.name}</td>
                            <td className="px-3 py-1.5 text-primary font-bold">{row.meas}</td>
                            <td className="px-3 py-1.5 text-on-surface-variant">{row.range}</td>
                            <td className="px-3 py-1.5 text-on-surface-variant">{row.diff}</td>
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
                      <div className="flex justify-between items-center border-b pb-1">
                        <span>Rm ≥ 485 MPa</span>
                        <strong className="text-status-pass-text flex items-center gap-1">
                          573.68 <span className="material-symbols-outlined text-sm">check_circle</span>
                        </strong>
                      </div>
                      <div className="flex justify-between items-center border-b pb-1">
                        <span>Rp0.2 ≥ 175 MPa</span>
                        <strong className="text-status-pass-text flex items-center gap-1">
                          240.26 <span className="material-symbols-outlined text-sm">check_circle</span>
                        </strong>
                      </div>
                    </div>

                    {/* 紫色 AST 公式提示框 */}
                    <div className="p-2.5 rounded-lg bg-status-hitl-bg border border-purple-200 dark:border-purple-900 text-status-hitl-text text-[11px] flex items-center gap-2">
                      <span className="material-symbols-outlined text-base">auto_awesome</span>
                      <span>已完成涡流探伤(E3H)合格 → 依据 6.5.2 条款免做水压</span>
                    </div>
                  </div>

                  {/* 模块 C */}
                  <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-4 shadow-xs space-y-2">
                    <h4 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                      模块 C: 定性条款
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div className="p-2 bg-surface-container-low rounded flex justify-between items-center">
                        <span className="font-medium">压扁试验 (Flattening)</span>
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          isPass ? 'bg-status-pass-bg text-status-pass-text' : 'bg-status-fail-bg text-status-fail-text'
                        }`}>
                          {isPass ? 'PASS' : 'FAIL (未检)'}
                        </span>
                      </div>
                      <div className="p-2 bg-surface-container-low rounded flex justify-between items-center">
                        <span className="font-medium">晶间腐蚀 (Method E)</span>
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          isPass ? 'bg-status-pass-bg text-status-pass-text' : 'bg-status-fail-bg text-status-fail-text'
                        }`}>
                          {isPass ? 'PASS' : 'FAIL (未检)'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>


          {/* ========================================================================= */}
          {/* 步骤 4: 归档与报告导出 / 拒收处置 (对应设计稿 _1/screen.png 与 _5/screen.png) */}
          {/* ========================================================================= */}
          <section className="w-full h-full shrink-0 overflow-y-auto custom-scrollbar p-6 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              
              {/* 左侧 40%：A4 拟真打印预览纸张 (带 PASS / REJECT 对角线水印章) */}
              <div className="lg:col-span-5 bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-5 shadow-sheet flex flex-col items-center">
                <div className="flex justify-between items-center w-full mb-3 pb-2 border-b border-outline-variant/40">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-xl">description</span>
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
                    className={`absolute inset-0 flex items-center justify-center pointer-events-none select-none -rotate-25 font-bold text-7xl uppercase opacity-15 ${
                      isPass ? 'text-status-pass-text' : 'text-status-fail-text'
                    }`}
                  >
                    {isPass ? 'PASS' : 'REJECT'}
                  </div>

                  <div className="space-y-4 relative z-10">
                    <div className="text-center border-b pb-3">
                      <h4 className="text-base font-bold font-headline text-on-surface">
                        {isPass ? '材料合规性核验报告' : '物资不合格拒收处置报告'}
                      </h4>
                      <span className="font-mono text-[10px] text-on-surface-variant tracking-wider">
                        REPORT NO: {isPass ? 'QA-20231027-04' : 'QA-REJECT-20260823-01'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono border-b pb-3">
                      <div>
                        <span className="text-on-surface-variant block">生成时间:</span>
                        <strong>2026-08-25 14:32</strong>
                      </div>
                      <div>
                        <span className="text-on-surface-variant block">检验员:</span>
                        <strong>OP-9921 (QA)</strong>
                      </div>
                      <div>
                        <span className="text-on-surface-variant block">标准依据:</span>
                        <strong>GB/T 13296-2023</strong>
                      </div>
                      <div>
                        <span className="text-on-surface-variant block">结论:</span>
                        <strong className={isPass ? 'text-status-pass-text' : 'text-status-fail-text'}>
                          {isPass ? '合格 PASS' : '拒收 REJECT'}
                        </strong>
                      </div>
                    </div>

                    <div className="bg-surface-container-low/60 rounded p-3 text-[11px] font-mono space-y-1">
                      <span className="font-bold block text-on-surface">关键数据汇总:</span>
                      <div className="flex justify-between">
                        <span className="text-on-surface-variant">炉号:</span>
                        <span>HT-2026-0881</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-on-surface-variant">批号:</span>
                        <span>BN-20260823-01</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-on-surface-variant">牌号:</span>
                        <span className="text-primary font-bold">022Cr17Ni12Mo2</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t flex justify-between items-end text-[10px] font-mono text-on-surface-variant relative z-10">
                    <span>系统指纹: a8f9c2...41d</span>
                    <div className="text-right">
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
                    <span className="material-symbols-outlined text-primary text-xl">file_download</span>
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
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
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
                    <span className="material-symbols-outlined text-primary text-xl">shield</span>
                    <h3 className="font-section-title text-section-title font-bold text-on-surface dark:text-surface-bright">
                      存证与审计摘要
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                    <div>
                      <span className="text-[11px] text-on-surface-variant block mb-1">存证哈希值 (SHA-256)</span>
                      <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 rounded p-2 text-on-surface truncate">
                        e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] text-on-surface-variant block mb-1">操作员 ID</span>
                      <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 rounded p-2 text-on-surface">
                        OP-9921 (QA Dept)
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] text-on-surface-variant block mb-1">核验总耗时</span>
                      <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 rounded p-2 text-on-surface">
                        1.2s (OCR + 规则引擎)
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] text-on-surface-variant block mb-1">规则库版本</span>
                      <div className="bg-surface-container-low dark:bg-surface-dark-low border border-outline-variant/40 rounded p-2 text-on-surface">
                        DB_v2023.10.15_Release
                      </div>
                    </div>
                  </div>
                </div>

                {/* 归档位置 */}
                <div className="bg-surface-container-lowest dark:bg-surface-dark border border-outline-variant/60 dark:border-border-dark rounded-xl p-4 shadow-xs flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-2xl">cloud_done</span>
                    <div>
                      <span className="text-[11px] text-on-surface-variant block">主服务器归档路径</span>
                      <span className="font-mono text-xs text-on-surface dark:text-surface-bright font-bold">
                        //nas-qcdp-01/archives/2026/08/25/QA-20260823-01/
                      </span>
                    </div>
                  </div>
                  <button type="button" className="text-primary text-xs font-bold hover:underline">
                    修改路径
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 底部常驻导航条 (Fixed Stepper Bar - 1:1 还原 Stitch 设计稿连线指示器与按钮) */}
      {/* ========================================================================= */}
      <footer className="h-16 shrink-0 bg-surface-container-lowest dark:bg-bg-industrial-slate border-t border-outline-variant/60 dark:border-border-dark px-6 flex justify-between items-center z-30 shadow-sheet select-none">
        
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
                  <div className={`w-6 sm:w-10 h-[2px] transition-colors ${
                    isCompleted ? 'bg-primary dark:bg-primary-fixed-dim' : 'bg-outline-variant/60 dark:bg-border-dark'
                  }`} />
                )}

                <button
                  type="button"
                  onClick={() => goToStep(step.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    isActive
                      ? 'bg-primary dark:bg-primary-container text-on-primary font-bold shadow-xs'
                      : isCompleted
                      ? 'text-status-pass-text bg-status-pass-bg font-medium'
                      : 'text-on-surface-variant hover:text-on-surface'
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

        {/* 右侧动作流转按钮 */}
        <div className="flex items-center gap-3">
          {currentStep > 0 && (
            <button
              type="button"
              onClick={() => goToStep(currentStep - 1)}
              className="px-4 py-2 rounded-lg border border-outline-variant dark:border-border-dark text-xs font-medium text-on-surface hover:bg-surface-container-low transition-colors"
            >
              返回上一步
            </button>
          )}

          {currentStep === 0 && (
            <button
              type="button"
              onClick={() => goToStep(1)}
              className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
            >
              <span>下一步：核对结果</span>
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
                className="px-4 py-2 rounded-lg border border-outline-variant dark:border-border-dark text-xs font-bold text-on-surface hover:bg-surface-container-low transition-colors"
              >
                开启新任务
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
};
