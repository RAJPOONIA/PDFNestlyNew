'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Crop,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Sliders,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  PdfInspectionReport,
  renderSinglePageDataUrl,
} from '@/lib/pdf-engine-client';

export interface CropMarginsPt {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type CropScopeMode = 'all' | 'current' | 'range';

interface VisualCropWorkspaceProps {
  pdfBytes: Uint8Array;
  inspection: PdfInspectionReport;
  cropMargins: CropMarginsPt;
  onChangeMargins: (margins: CropMarginsPt) => void;
  scopeMode: CropScopeMode;
  onChangeScopeMode: (mode: CropScopeMode) => void;
  activePage: number;
  onChangeActivePage: (page: number) => void;
  customRange: string;
  onChangeCustomRange: (range: string) => void;
}

type DragHandle =
  | 'move'
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | null;

const PT_TO_MM = 0.352778;
const MIN_CROP_PT = 24;

export function VisualCropWorkspace({
  pdfBytes,
  inspection,
  cropMargins,
  onChangeMargins,
  scopeMode,
  onChangeScopeMode,
  activePage,
  onChangeActivePage,
  customRange,
  onChangeCustomRange,
}: VisualCropWorkspaceProps) {
  const [cropMode, setCropMode] = useState<'visual' | 'margins'>('visual');
  const [unit, setUnit] = useState<'pt' | 'mm'>('pt');
  const [previewAfter, setPreviewAfter] = useState<boolean>(false);
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [pageDataUrl, setPageDataUrl] = useState<string>('');
  const [pagePt, setPagePt] = useState<{ width: number; height: number }>({
    width: inspection.pages[activePage - 1]?.widthPt || 612,
    height: inspection.pages[activePage - 1]?.heightPt || 792,
  });
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string>('');
  const [renderRetryCount, setRenderRetryCount] = useState<number>(0);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    handle: DragHandle;
    startClientX: number;
    startClientY: number;
    startMargins: CropMarginsPt;
  } | null>(null);

  // Render the selected page at crisp resolution
  useEffect(() => {
    let cancelled = false;
    setIsRendering(true);
    setRenderError('');

    (async () => {
      try {
        const res = await renderSinglePageDataUrl(
          pdfBytes,
          activePage,
          1.6,
          0,
          'image/png',
          0.92
        );
        if (cancelled) return;
        if (!res.dataUrl || !res.dataUrl.startsWith('data:image/')) {
          throw new Error('Rendered page image was empty.');
        }
        setPageDataUrl(res.dataUrl);
        setPagePt({
          width: res.unscaledWidthPt || 612,
          height: res.unscaledHeightPt || 792,
        });
      } catch (err) {
        if (!cancelled) {
          setRenderError(
            err instanceof Error
              ? err.message
              : 'Failed to render PDF page for cropping.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfBytes, activePage, renderRetryCount]);

  // Fit page automatically when stage mounts or page dimensions change
  const handleFitPage = useCallback(() => {
    if (!stageRef.current) {
      setZoomScale(1.0);
      return;
    }
    const availW = Math.max(280, stageRef.current.clientWidth - 48);
    const availH = 520;
    const scaleW = availW / Math.max(1, pagePt.width);
    const scaleH = availH / Math.max(1, pagePt.height);
    const nextScale = Math.max(0.45, Math.min(1.6, Math.min(scaleW, scaleH)));
    setZoomScale(Math.round(nextScale * 100) / 100);
  }, [pagePt.width, pagePt.height]);

  useEffect(() => {
    handleFitPage();
  }, [handleFitPage]);

  // Clamp margins safely within page bounds
  const clampMargins = useCallback(
    (next: CropMarginsPt): CropMarginsPt => {
      const maxW = Math.max(MIN_CROP_PT, pagePt.width);
      const maxH = Math.max(MIN_CROP_PT, pagePt.height);

      let left = Math.max(0, Math.round(next.left));
      let right = Math.max(0, Math.round(next.right));
      let top = Math.max(0, Math.round(next.top));
      let bottom = Math.max(0, Math.round(next.bottom));

      if (left + right > maxW - MIN_CROP_PT) {
        const overflow = left + right - (maxW - MIN_CROP_PT);
        if (right >= overflow) right -= overflow;
        else left = Math.max(0, maxW - MIN_CROP_PT - right);
      }

      if (top + bottom > maxH - MIN_CROP_PT) {
        const overflow = top + bottom - (maxH - MIN_CROP_PT);
        if (bottom >= overflow) bottom -= overflow;
        else top = Math.max(0, maxH - MIN_CROP_PT - bottom);
      }

      return { top, right, bottom, left };
    },
    [pagePt.width, pagePt.height]
  );

  // Pointer dragging for crop box & 8 handles
  const startDrag = (
    e: React.PointerEvent<HTMLElement>,
    handle: DragHandle
  ) => {
    if (previewAfter) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startMargins: { ...cropMargins },
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (!drag || !pageContainerRef.current) return;

    const rect = pageContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dxPt = ((e.clientX - drag.startClientX) / rect.width) * pagePt.width;
    const dyPt = ((e.clientY - drag.startClientY) / rect.height) * pagePt.height;

    const { startMargins, handle } = drag;
    const next = { ...startMargins };

    if (handle === 'move') {
      const boxW =
        pagePt.width - startMargins.left - startMargins.right;
      const boxH =
        pagePt.height - startMargins.top - startMargins.bottom;
      const newLeft = Math.max(
        0,
        Math.min(pagePt.width - boxW, startMargins.left + dxPt)
      );
      const newTop = Math.max(
        0,
        Math.min(pagePt.height - boxH, startMargins.top + dyPt)
      );
      next.left = Math.round(newLeft);
      next.right = Math.max(0, Math.round(pagePt.width - boxW - newLeft));
      next.top = Math.round(newTop);
      next.bottom = Math.max(0, Math.round(pagePt.height - boxH - newTop));
      onChangeMargins(next);
      return;
    }

    if (handle?.includes('w')) {
      next.left = Math.max(
        0,
        Math.min(
          pagePt.width - startMargins.right - MIN_CROP_PT,
          startMargins.left + dxPt
        )
      );
    }
    if (handle?.includes('e')) {
      next.right = Math.max(
        0,
        Math.min(
          pagePt.width - startMargins.left - MIN_CROP_PT,
          startMargins.right - dxPt
        )
      );
    }
    if (handle?.includes('n')) {
      next.top = Math.max(
        0,
        Math.min(
          pagePt.height - startMargins.bottom - MIN_CROP_PT,
          startMargins.top + dyPt
        )
      );
    }
    if (handle?.includes('s')) {
      next.bottom = Math.max(
        0,
        Math.min(
          pagePt.height - startMargins.top - MIN_CROP_PT,
          startMargins.bottom - dyPt
        )
      );
    }

    onChangeMargins(clampMargins(next));
  };

  const endDrag = () => {
    dragStateRef.current = null;
  };

  const formatVal = (pt: number) =>
    unit === 'mm' ? Math.round(pt * PT_TO_MM * 10) / 10 : Math.round(pt);

  const parseInputToPt = (val: number) =>
    unit === 'mm' ? Math.round(val / PT_TO_MM) : Math.round(val);

  const croppedWidthPt = Math.max(
    MIN_CROP_PT,
    Math.round(pagePt.width - cropMargins.left - cropMargins.right)
  );
  const croppedHeightPt = Math.max(
    MIN_CROP_PT,
    Math.round(pagePt.height - cropMargins.top - cropMargins.bottom)
  );

  const displayW = Math.round(pagePt.width * zoomScale);
  const displayH = Math.round(pagePt.height * zoomScale);

  const leftPct = (cropMargins.left / Math.max(1, pagePt.width)) * 100;
  const rightPct = (cropMargins.right / Math.max(1, pagePt.width)) * 100;
  const topPct = (cropMargins.top / Math.max(1, pagePt.height)) * 100;
  const bottomPct = (cropMargins.bottom / Math.max(1, pagePt.height)) * 100;
  const widthPct = Math.max(5, 100 - leftPct - rightPct);
  const heightPct = Math.max(5, 100 - topPct - bottomPct);

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Mode Switcher, Page Navigation, Zoom & Preview Toggle */}
      <div className="p-3 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl flex flex-wrap items-center justify-between gap-3">
        {/* Mode Switcher */}
        <div className="inline-flex items-center p-1 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg">
          <button
            type="button"
            onClick={() => setCropMode('visual')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              cropMode === 'visual'
                ? 'bg-[#B91C1C] text-white'
                : 'text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA]'
            }`}
          >
            <Crop className="w-3.5 h-3.5" />
            <span>Visual Crop</span>
          </button>
          <button
            type="button"
            onClick={() => setCropMode('margins')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              cropMode === 'margins'
                ? 'bg-[#B91C1C] text-white'
                : 'text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Precise Margins</span>
          </button>
        </div>

        {/* Page Navigation */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={activePage <= 1}
            onClick={() => onChangeActivePage(Math.max(1, activePage - 1))}
            aria-label="Previous Page"
            className="p-1.5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg text-[#18181B] dark:text-[#FAFAFA] disabled:opacity-40 hover:bg-[#F4F4F5] dark:hover:bg-[#09090B]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2.5 text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] tabular-nums whitespace-nowrap">
            Page {activePage} of {inspection.pageCount}
          </span>
          <button
            type="button"
            disabled={activePage >= inspection.pageCount}
            onClick={() =>
              onChangeActivePage(Math.min(inspection.pageCount, activePage + 1))
            }
            aria-label="Next Page"
            className="p-1.5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg text-[#18181B] dark:text-[#FAFAFA] disabled:opacity-40 hover:bg-[#F4F4F5] dark:hover:bg-[#09090B]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom & Before/After Preview Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() =>
                setZoomScale((z) => Math.max(0.4, Math.round((z - 0.15) * 100) / 100))
              }
              title="Zoom Out"
              aria-label="Zoom Out"
              className="p-1.5 text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA]"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-xs font-mono font-semibold text-[#18181B] dark:text-[#FAFAFA] tabular-nums">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              type="button"
              onClick={() =>
                setZoomScale((z) => Math.min(2.0, Math.round((z + 0.15) * 100) / 100))
              }
              title="Zoom In"
              aria-label="Zoom In"
              className="p-1.5 text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA]"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFitPage}
              title="Fit Page"
              className="px-2 py-1 text-[11px] font-semibold text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA] border-l border-[#E4E4E7] dark:border-[#3F3F46] inline-flex items-center gap-1 whitespace-nowrap"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Fit Page</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPreviewAfter((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              previewAfter
                ? 'bg-[#16865B] text-white border-[#16865B]'
                : 'bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border-[#E4E4E7] dark:border-[#3F3F46] hover:border-[#B91C1C]'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{previewAfter ? 'Showing Cropped Result' : 'Preview Cropped Page'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPreviewAfter(false);
              onChangeMargins({ top: 0, right: 0, bottom: 0, left: 0 });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#52525B] dark:text-[#D4D4D8] bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] hover:text-[#18181B] dark:hover:text-[#FAFAFA] rounded-lg whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Crop</span>
          </button>
        </div>
      </div>

      {/* Main Split Workspace: Visual Canvas + Synchronized Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left/Center Visual Page Canvas (8 columns on lg) */}
        <div
          ref={stageRef}
          className="lg:col-span-8 bg-[#F4F4F5] dark:bg-[#09090B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl p-6 min-h-[540px] flex flex-col items-center justify-center overflow-auto relative select-none"
        >
          {isRendering && (
            <div className="absolute inset-0 z-20 bg-white/75 dark:bg-[#09090B]/75 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]">
              <RefreshCw className="w-5 h-5 animate-spin text-[#B91C1C]" />
              <span>Rendering Page {activePage}...</span>
            </div>
          )}

          {renderError ? (
            <div className="p-6 bg-white dark:bg-[#18181B] border border-[#D64545]/40 rounded-xl max-w-md text-center space-y-3">
              <AlertCircle className="w-6 h-6 text-[#D64545] mx-auto" />
              <div className="text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                {renderError}
              </div>
              <button
                type="button"
                onClick={() => setRenderRetryCount((c) => c + 1)}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#B91C1C] rounded-lg"
              >
                Retry Rendering
              </button>
            </div>
          ) : pageDataUrl ? (
            previewAfter ? (
              /* After-Crop Clipped Preview */
              <div className="space-y-2 flex flex-col items-center">
                <div
                  style={{
                    width: Math.max(
                      60,
                      Math.round((widthPct / 100) * displayW)
                    ),
                    height: Math.max(
                      60,
                      Math.round((heightPct / 100) * displayH)
                    ),
                  }}
                  className="relative overflow-hidden bg-white shadow-md border-2 border-[#16865B] rounded"
                >
                  <img
                    src={pageDataUrl}
                    alt={`Cropped preview of page ${activePage}`}
                    referrerPolicy="no-referrer"
                    draggable={false}
                    style={{
                      width: displayW,
                      height: displayH,
                      maxWidth: 'none',
                      transform: `translate(-${Math.round(
                        (leftPct / 100) * displayW
                      )}px, -${Math.round((topPct / 100) * displayH)}px)`,
                    }}
                    className="block select-none pointer-events-none"
                  />
                </div>
                <span className="text-[11px] font-mono text-[#16865B] dark:text-[#34D399] font-semibold tabular-nums">
                  Cropped Output Size: {croppedWidthPt} × {croppedHeightPt} pt (
                  {Math.round(croppedWidthPt * PT_TO_MM)} ×{' '}
                  {Math.round(croppedHeightPt * PT_TO_MM)} mm)
                </span>
              </div>
            ) : (
              /* Interactive Crop Box Canvas */
              <div
                ref={pageContainerRef}
                style={{ width: displayW, height: displayH }}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="relative bg-white shadow-md border border-[#D4D4D8] dark:border-[#3F3F46] shrink-0"
              >
                <img
                  src={pageDataUrl}
                  alt={`Page ${activePage}`}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  className="w-full h-full object-contain block pointer-events-none select-none"
                />

                {/* Darkened Outside Scrims (Top, Bottom, Left, Right) */}
                <div
                  style={{ height: `${topPct}%` }}
                  className="absolute top-0 left-0 right-0 bg-black/45 pointer-events-none"
                />
                <div
                  style={{ height: `${bottomPct}%` }}
                  className="absolute bottom-0 left-0 right-0 bg-black/45 pointer-events-none"
                />
                <div
                  style={{
                    top: `${topPct}%`,
                    bottom: `${bottomPct}%`,
                    width: `${leftPct}%`,
                  }}
                  className="absolute left-0 bg-black/45 pointer-events-none"
                />
                <div
                  style={{
                    top: `${topPct}%`,
                    bottom: `${bottomPct}%`,
                    width: `${rightPct}%`,
                  }}
                  className="absolute right-0 bg-black/45 pointer-events-none"
                />

                {/* Active Draggable Crop Box */}
                <div
                  role="region"
                  aria-label="Interactive crop selection box"
                  style={{
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                  }}
                  onPointerDown={(e) => startDrag(e, 'move')}
                  className="absolute border-2 border-[#B91C1C] shadow-[0_0_0_1px_rgba(255,255,255,0.85)] cursor-move touch-none"
                >
                  {/* Rule of Thirds Grid Lines */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                    <div className="border-r border-b border-white/45" />
                    <div className="border-r border-b border-white/45" />
                    <div className="border-b border-white/45" />
                    <div className="border-r border-b border-white/45" />
                    <div className="border-r border-b border-white/45" />
                    <div className="border-b border-white/45" />
                    <div className="border-r border-white/45" />
                    <div className="border-r border-white/45" />
                    <div />
                  </div>

                  {/* Live Dimensions Pill inside Crop Box */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-[#18181B]/85 text-white text-[11px] font-mono rounded pointer-events-none tabular-nums whitespace-nowrap">
                    {unit === 'mm'
                      ? `${Math.round(croppedWidthPt * PT_TO_MM)} × ${Math.round(
                          croppedHeightPt * PT_TO_MM
                        )} mm`
                      : `${croppedWidthPt} × ${croppedHeightPt} pt`}
                  </div>

                  {/* 4 Corner Handles */}
                  <div
                    onPointerDown={(e) => startDrag(e, 'nw')}
                    className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-[#B91C1C] rounded-xs cursor-nwse-resize"
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, 'ne')}
                    className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-[#B91C1C] rounded-xs cursor-nesw-resize"
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, 'sw')}
                    className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-[#B91C1C] rounded-xs cursor-nesw-resize"
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, 'se')}
                    className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-[#B91C1C] rounded-xs cursor-nwse-resize"
                  />

                  {/* 4 Edge Handles */}
                  <div
                    onPointerDown={(e) => startDrag(e, 'n')}
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-8 h-3 bg-white border-2 border-[#B91C1C] rounded-xs cursor-ns-resize"
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, 's')}
                    className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-8 h-3 bg-white border-2 border-[#B91C1C] rounded-xs cursor-ns-resize"
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, 'w')}
                    className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-8 bg-white border-2 border-[#B91C1C] rounded-xs cursor-ew-resize"
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, 'e')}
                    className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-8 bg-white border-2 border-[#B91C1C] rounded-xs cursor-ew-resize"
                  />
                </div>
              </div>
            )
          ) : null}
        </div>

        {/* Right Controls Column (4 columns on lg): Margins, Presets & Page Scope */}
        <div className="lg:col-span-4 space-y-4">
          {/* Synchronized Margins Card */}
          <div className="p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#18181B] dark:text-[#FAFAFA]">
                Crop Margins ({unit})
              </h3>
              <div className="inline-flex items-center p-0.5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-md text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setUnit('pt')}
                  className={`px-2 py-0.5 rounded ${
                    unit === 'pt'
                      ? 'bg-[#B91C1C] text-white'
                      : 'text-[#52525B] dark:text-[#D4D4D8]'
                  }`}
                >
                  pt
                </button>
                <button
                  type="button"
                  onClick={() => setUnit('mm')}
                  className={`px-2 py-0.5 rounded ${
                    unit === 'mm'
                      ? 'bg-[#B91C1C] text-white'
                      : 'text-[#52525B] dark:text-[#D4D4D8]'
                  }`}
                >
                  mm
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <div key={side}>
                  <label
                    htmlFor={`crop-${side}`}
                    className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] capitalize mb-1"
                  >
                    {side} ({unit})
                  </label>
                  <input
                    id={`crop-${side}`}
                    type="number"
                    min={0}
                    step={unit === 'mm' ? 1 : 2}
                    value={formatVal(cropMargins[side])}
                    onChange={(e) => {
                      const ptVal = parseInputToPt(Number(e.target.value) || 0);
                      onChangeMargins(
                        clampMargins({
                          ...cropMargins,
                          [side]: ptVal,
                        })
                      );
                    }}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg tabular-nums font-mono"
                  />
                </div>
              ))}
            </div>

            {/* Quick Margin Presets */}
            <div className="space-y-1.5 pt-2 border-t border-[#E4E4E7] dark:border-[#3F3F46]">
              <div className="text-[11px] font-semibold text-[#52525B] dark:text-[#D4D4D8]">
                Quick Margin Presets
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'Full Page (0 pt)', val: 0 },
                  { label: 'Trim 0.25" (18 pt)', val: 18 },
                  { label: 'Standard 0.5" (36 pt)', val: 36 },
                  { label: 'Wide 1.0" (72 pt)', val: 72 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      onChangeMargins(
                        clampMargins({
                          top: preset.val,
                          right: preset.val,
                          bottom: preset.val,
                          left: preset.val,
                        })
                      )
                    }
                    className="px-2.5 py-1.5 text-[11px] font-medium bg-white dark:bg-[#18181B] hover:border-[#B91C1C] border border-[#E4E4E7] dark:border-[#3F3F46] text-[#18181B] dark:text-[#FAFAFA] rounded-lg transition-colors text-left truncate"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Page Scope Card */}
          <div className="p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#18181B] dark:text-[#FAFAFA]">
              Apply Crop To
            </h3>
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 text-[#18181B] dark:text-[#FAFAFA] cursor-pointer">
                <input
                  type="radio"
                  name="crop-scope"
                  checked={scopeMode === 'all'}
                  onChange={() => onChangeScopeMode('all')}
                  className="accent-[#B91C1C]"
                />
                <span>All Pages (1 to {inspection.pageCount})</span>
              </label>
              <label className="flex items-center gap-2 text-[#18181B] dark:text-[#FAFAFA] cursor-pointer">
                <input
                  type="radio"
                  name="crop-scope"
                  checked={scopeMode === 'current'}
                  onChange={() => onChangeScopeMode('current')}
                  className="accent-[#B91C1C]"
                />
                <span>Current Page Only (Page {activePage})</span>
              </label>
              <label className="flex items-center gap-2 text-[#18181B] dark:text-[#FAFAFA] cursor-pointer">
                <input
                  type="radio"
                  name="crop-scope"
                  checked={scopeMode === 'range'}
                  onChange={() => onChangeScopeMode('range')}
                  className="accent-[#B91C1C]"
                />
                <span>Custom Page Range</span>
              </label>
            </div>

            {scopeMode === 'range' && (
              <div>
                <input
                  type="text"
                  value={customRange}
                  onChange={(e) => onChangeCustomRange(e.target.value)}
                  placeholder="e.g. 1-2, 4"
                  aria-label="Custom crop page range"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg font-mono"
                />
              </div>
            )}

            <div className="pt-2 border-t border-[#E4E4E7] dark:border-[#3F3F46] text-[11px] text-[#52525B] dark:text-[#D4D4D8] space-y-1 tabular-nums">
              <div className="flex justify-between">
                <span>Original Page:</span>
                <span className="font-mono text-[#18181B] dark:text-[#FAFAFA]">
                  {pagePt.width} × {pagePt.height} pt
                </span>
              </div>
              <div className="flex justify-between">
                <span>New Crop Area:</span>
                <span className="font-mono font-semibold text-[#B91C1C] dark:text-[#EF4444]">
                  {croppedWidthPt} × {croppedHeightPt} pt
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
