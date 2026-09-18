'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { FieldBBox } from '@/types/bbox.ts';

export interface UsePdfViewerLensOptions {
  selectedDocId?: string;
  currentStep?: number;
  bboxes?: FieldBBox[];
  rightScrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export type PageOrientationOverride = 'auto' | 'portrait' | 'landscape';

/**
 * 质检工作台步骤 2：PDF 视窗缩放、旋转、版式自适应与 BBox 坐标双向联动领域 Hook
 */
export function usePdfViewerLens({
  selectedDocId = '',
  currentStep = 1,
  bboxes = [],
  rightScrollContainerRef,
}: UsePdfViewerLensOptions = {}) {
  // 视窗变换状态（默认显示比例增加到 225%）
  const [zoomLevel, setZoomLevel] = useState<number>(225);
  const [rotation, setRotation] = useState<number>(0); // 顺时针旋转角度 (0, 90, 180, 270)
  const [pageOrientationOverride, setPageOrientationOverride] = useState<PageOrientationOverride>('auto');
  const [pageAspectRatios, setPageAspectRatios] = useState<Record<number, number>>({});
  const [pdfViewportWidth, setPdfViewportWidth] = useState<number>(560);
  const [currentDocPage, setCurrentDocPage] = useState<number>(1);

  // 视觉 BBox 联动与防晕放大状态
  const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(null);
  const [magnifiedFieldId, setMagnifiedFieldId] = useState<string | null>(null);
  const [isBboxFocusEnabled, setIsBboxFocusEnabled] = useState<boolean>(false);

  // Refs
  const pdfScrollContainerRef = useRef<HTMLDivElement>(null);
  const magnifyTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 视窗鼠标平移拖拽交互
  const isDraggingPdfRef = useRef<boolean>(false);
  const dragStartXRef = useRef<number>(0);
  const dragStartYRef = useRef<number>(0);
  const scrollStartXRef = useRef<number>(0);
  const scrollStartYRef = useRef<number>(0);
  const [isMouseDownDragging, setIsMouseDownDragging] = useState<boolean>(false);

  const handlePdfMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const container = pdfScrollContainerRef.current;
    if (!container) return;

    isDraggingPdfRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartYRef.current = e.clientY;
    scrollStartXRef.current = container.scrollLeft;
    scrollStartYRef.current = container.scrollTop;
    setIsMouseDownDragging(true);
  }, []);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingPdfRef.current) return;
      const container = pdfScrollContainerRef.current;
      if (!container) return;

      e.preventDefault();
      const deltaX = e.clientX - dragStartXRef.current;
      const deltaY = e.clientY - dragStartYRef.current;

      container.scrollLeft = scrollStartXRef.current - deltaX;
      container.scrollTop = scrollStartYRef.current - deltaY;
    };

    const handleGlobalMouseUp = () => {
      if (isDraggingPdfRef.current) {
        isDraggingPdfRef.current = false;
        setIsMouseDownDragging(false);
      }
    };

    if (isMouseDownDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove, { passive: false });
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isMouseDownDragging]);

  // 缩放操作
  const zoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(300, prev + 25));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(50, prev - 25));
  }, []);

  const resetZoom = useCallback((targetZoom = 225) => {
    setZoomLevel(targetZoom);
  }, []);

  // 旋转操作
  const rotateClockwise = useCallback(() => {
    setRotation(prev => ((prev + 90) % 360));
  }, []);

  // 聚焦放大重置
  const handleResetMagnify = useCallback(() => {
    if (magnifyTimerRef.current) {
      clearTimeout(magnifyTimerRef.current);
      magnifyTimerRef.current = null;
    }
    setMagnifiedFieldId(null);
  }, []);

  // 切换实验性定位聚焦功能开关
  const handleToggleBboxFocus = useCallback((enabled: boolean) => {
    setIsBboxFocusEnabled(enabled);
    if (!enabled) {
      if (magnifyTimerRef.current) {
        clearTimeout(magnifyTimerRef.current);
        magnifyTimerRef.current = null;
      }
      setHighlightedFieldId(null);
      setMagnifiedFieldId(null);
    }
  }, []);

  // 精确计算并在 PDF 滚动容器中按需居中目标 BBox
  const centerBBoxInContainer = useCallback((box: FieldBBox, force = false) => {
    const container = pdfScrollContainerRef.current;
    if (!container) return;

    const pageElem = document.getElementById(`pdf-page-${box.page}`) || document.getElementById('pdf-page-1');
    if (!pageElem) return;

    const containerRect = container.getBoundingClientRect();
    const pageRect = pageElem.getBoundingClientRect();

    const boxLeft = pageRect.left + (box.x / 100) * pageRect.width;
    const boxRight = pageRect.left + ((box.x + box.w) / 100) * pageRect.width;
    const boxTop = pageRect.top + (box.y / 100) * pageRect.height;
    const boxBottom = pageRect.top + ((box.y + box.h) / 100) * pageRect.height;

    const PADDING = 24;
    const isFullyVisible = (
      boxTop >= containerRect.top + PADDING &&
      boxBottom <= containerRect.bottom - PADDING &&
      boxLeft >= containerRect.left + PADDING &&
      boxRight <= containerRect.right - PADDING
    );

    if (isFullyVisible && !force) return;

    const boxCenterXInViewport = (boxLeft + boxRight) / 2;
    const boxCenterYInViewport = (boxTop + boxBottom) / 2;
    const containerCenterXInViewport = containerRect.left + (containerRect.width / 2);
    const containerCenterYInViewport = containerRect.top + (containerRect.height / 2);

    const targetScrollTop = container.scrollTop + (boxCenterYInViewport - containerCenterYInViewport);
    const targetScrollLeft = container.scrollLeft + (boxCenterXInViewport - containerCenterXInViewport);

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      left: Math.max(0, targetScrollLeft),
      behavior: 'smooth',
    });
  }, []);

  // 1. 悬浮/聚焦右侧字段：仅滚动居中与高亮目标 BBox，不再进行任何缩放形变
  const scrollToLeftBBox = useCallback((fieldId: string | null) => {
    if (!isBboxFocusEnabled) return;

    if (magnifyTimerRef.current) {
      clearTimeout(magnifyTimerRef.current);
      magnifyTimerRef.current = null;
    }

    setHighlightedFieldId(fieldId);
    if (!fieldId) return;

    const box = bboxes.find(b => b.id === fieldId);
    if (!box) return;

    setCurrentDocPage(box.page);
    centerBBoxInContainer(box, false);
  }, [bboxes, centerBBoxInContainer, isBboxFocusEnabled]);

  // 2. 悬浮左侧 BBox：仅滚动右侧解析数据视窗
  const scrollToRightField = useCallback((fieldId: string) => {
    if (!isBboxFocusEnabled) return;

    if (magnifyTimerRef.current) {
      clearTimeout(magnifyTimerRef.current);
      magnifyTimerRef.current = null;
    }

    setHighlightedFieldId(fieldId);
    const box = bboxes.find(b => b.id === fieldId);
    if (box) {
      setCurrentDocPage(box.page);
      centerBBoxInContainer(box, false);
    }

    magnifyTimerRef.current = setTimeout(() => {
      setMagnifiedFieldId(fieldId);
    }, 1000);

    const container = rightScrollContainerRef?.current;
    if (!container) return;

    const targetElem = document.getElementById(`field-${fieldId}`) || document.querySelector(`[data-field-id="${fieldId}"]`);
    if (targetElem) {
      const targetRect = targetElem.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const offsetTop = targetRect.top - containerRect.top + container.scrollTop - 40;
      container.scrollTo({ top: Math.max(0, offsetTop), behavior: 'smooth' });
    }
  }, [bboxes, centerBBoxInContainer, isBboxFocusEnabled, rightScrollContainerRef]);

  // 切换文档时自动重置旋转角度、版式覆盖与长宽比缓存
  useEffect(() => {
    setRotation(0);
    setPageOrientationOverride('auto');
    setPageAspectRatios({});
  }, [selectedDocId]);

  // 确保 PDF 视窗水平绝对居中且垂直顶端对齐
  const centerPdfViewport = useCallback(() => {
    const container = pdfScrollContainerRef.current;
    if (!container) return;
    if (container.scrollWidth > container.clientWidth) {
      container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
    }
    container.scrollTop = 0;
  }, []);

  // 首次载入或文档/缩放/旋转变化时，多阶段触发居中以兼容异步切图与 DOM 渲染
  useEffect(() => {
    centerPdfViewport();
    const t1 = setTimeout(centerPdfViewport, 50);
    const t2 = setTimeout(centerPdfViewport, 200);
    const t3 = setTimeout(centerPdfViewport, 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [centerPdfViewport, zoomLevel, rotation, currentDocPage, selectedDocId, currentStep]);

  // 监听 PDF 视窗物理容器宽度，自适应计算横向呼吸留白与整页完整预览
  useEffect(() => {
    const el = pdfScrollContainerRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 100) {
        setPdfViewportWidth(el.clientWidth);
      }
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    window.addEventListener('resize', updateWidth);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, [currentStep, selectedDocId]);

  // 监听 ESC 快捷键退出聚焦放大
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && magnifiedFieldId) {
        handleResetMagnify();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [magnifiedFieldId, handleResetMagnify]);

  // 组件卸载时安全清理定时器
  useEffect(() => {
    return () => {
      if (magnifyTimerRef.current) {
        clearTimeout(magnifyTimerRef.current);
      }
    };
  }, []);

  return {
    // 视窗状态与变换操作
    zoomLevel,
    setZoomLevel,
    zoomIn,
    zoomOut,
    resetZoom,
    rotation,
    setRotation,
    rotateClockwise,
    currentDocPage,
    setCurrentDocPage,
    pageOrientationOverride,
    setPageOrientationOverride,
    pageAspectRatios,
    setPageAspectRatios,
    pdfViewportWidth,
    setPdfViewportWidth,
    // BBox 坐标联动与防晕聚焦
    highlightedFieldId,
    setHighlightedFieldId,
    magnifiedFieldId,
    setMagnifiedFieldId,
    isBboxFocusEnabled,
    handleToggleBboxFocus,
    handleResetMagnify,
    centerBBoxInContainer,
    scrollToLeftBBox,
    handleFieldHover: scrollToLeftBBox,
    scrollToRightField,
    // 视窗鼠标拖拽交互
    isMouseDownDragging,
    handlePdfMouseDown,
    centerPdfViewport,
    // 滚动容器引用
    pdfScrollContainerRef,
  };
}
