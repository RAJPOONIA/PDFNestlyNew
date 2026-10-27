'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  Download,
  Type,
  Highlighter,
  Square,
  MessageSquare,
  Stamp,
  PenTool,
  Image as ImageIcon,
  ShieldAlert,
  MousePointer,
  Trash2,
  FileText,
  ChevronLeft,
  ChevronRight,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RotateCw,
} from 'lucide-react';
import {
  EditorAnnotationItem,
  PageThumbnailInfo,
  renderPdfThumbnails,
  renderSinglePageDataUrl,
  applyEditorAnnotationsToPdf,
} from '@/lib/pdf-engine-client';
import { generateSamplePdfBytes } from '@/lib/sample-pdf';
import { formatFileSize, validateFileHeader, toPdfBlob } from '@/lib/pdf-utils';
import { SignatureBuilder } from './SignatureBuilder';
import { PdfNestlyMark } from './Logo';

type EditorToolMode =
  | 'select'
  | 'text'
  | 'highlight'
  | 'rectangle'
  | 'comment'
  | 'stamp'
  | 'watermark'
  | 'signature'
  | 'redact'
  | 'image';

interface PdfEditorWorkspaceProps {
  initialPdfBytes?: Uint8Array | null;
  initialFileName?: string;
  defaultTool?: EditorToolMode;
}

export function PdfEditorWorkspace({
  initialPdfBytes = null,
  initialFileName = 'agreement-sample.pdf',
  defaultTool = 'text',
}: PdfEditorWorkspaceProps) {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(initialPdfBytes);
  const [fileName, setFileName] = useState<string>(initialFileName);
  const [thumbnails, setThumbnails] = useState<PageThumbnailInfo[]>([]);
  const [activePage, setActivePage] = useState<number>(1);
  const [pageRenderUrl, setPageRenderUrl] = useState<string>('');
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [activeTool, setActiveTool] = useState<EditorToolMode>(defaultTool);

  // Undo / Redo state for annotations
  const [history, setHistory] = useState<EditorAnnotationItem[][]>([[]]);
  const [historyIdx, setHistoryIdx] = useState<number>(0);
  const [exportedIdx, setExportedIdx] = useState<number>(0);
  const annotations = history[historyIdx] || [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dxPct: number; dyPct: number }>({
    dxPct: 0,
    dyPct: 0,
  });
  const [extraRotations, setExtraRotations] = useState<Record<number, number>>({});
  const [deletedPages, setDeletedPages] = useState<number[]>([]);
  const [exportedResult, setExportedResult] = useState<{
    url: string;
    fileName: string;
    byteLength: number;
  } | null>(null);
  const [pendingSignatureUrl, setPendingSignatureUrl] = useState<string>('');
  const [pendingImageUrl, setPendingImageUrl] = useState<string>('');
  const [stampPreset, setStampPreset] = useState<string>('APPROVED');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const hasPageEdits =
    Object.values(extraRotations).some((deg) => deg > 0) || deletedPages.length > 0;
  const hasUnsavedChanges =
    (historyIdx !== exportedIdx && annotations.length > 0) || hasPageEdits;

  // Warn before closing tab if unsaved annotations exist
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const pushAnnotationsState = useCallback(
    (nextList: EditorAnnotationItem[]) => {
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIdx + 1);
        return [...sliced, nextList];
      });
      setHistoryIdx((prev) => prev + 1);
    },
    [historyIdx]
  );

  const handleUndo = useCallback(() => {
    if (historyIdx > 0) {
      setHistoryIdx((prev) => prev - 1);
      setSelectedId(null);
    }
  }, [historyIdx]);

  const handleRedo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      setHistoryIdx((prev) => prev + 1);
      setSelectedId(null);
    }
  }, [historyIdx, history.length]);

  // Keyboard shortcuts for Undo/Redo and Delete
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        pushAnnotationsState(annotations.filter((a) => a.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, selectedId, annotations, pushAnnotationsState]);

  // Load thumbnails when pdfBytes changes
  useEffect(() => {
    if (!pdfBytes) return;
    let cancelled = false;

    (async () => {
      try {
        const thumbs = await renderPdfThumbnails(pdfBytes, 0.35);
        if (cancelled) return;
        setThumbnails(thumbs);
        setActivePage(1);
        setErrorMessage('');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to render PDF thumbnails.'
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfBytes]);

  // Render active page at high resolution
  useEffect(() => {
    if (!pdfBytes) return;
    let cancelled = false;
    renderSinglePageDataUrl(pdfBytes, activePage, 1.6, 'image/png')
      .then((res) => {
        if (!cancelled) {
          setPageRenderUrl(res.dataUrl);
        }
      })
      .catch(() => {
        // Handled by thumbnail error state
      });
    return () => {
      cancelled = true;
    };
  }, [pdfBytes, activePage]);

  const handleLoadSample = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const sample = await generateSamplePdfBytes('primary');
      setPdfBytes(sample);
      setFileName('PDFNestly-Sample-Agreement.pdf');
      setHistory([[]]);
      setHistoryIdx(0);
      setExtraRotations({});
      setDeletedPages([]);
      if (exportedResult?.url) URL.revokeObjectURL(exportedResult.url);
      setExportedResult(null);
      setStatusMessage('Loaded 4-page sample PDF document into Editor Workspace.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load sample.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage('');
    setStatusMessage('');

    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const check = validateFileHeader(bytes, 'pdf');
      if (!check.valid) {
        setErrorMessage(check.error || 'Invalid PDF file.');
        return;
      }
      setPdfBytes(bytes);
      setFileName(file.name);
      setHistory([[]]);
      setHistoryIdx(0);
      setExtraRotations({});
      setDeletedPages([]);
      if (exportedResult?.url) URL.revokeObjectURL(exportedResult.url);
      setExportedResult(null);
      setStatusMessage(`Loaded "${file.name}" (${formatFileSize(bytes.byteLength)}).`);
    } finally {
      e.target.value = '';
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'select') {
      setSelectedId(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const xPercent = Math.max(
      2,
      Math.min(85, Math.round(((e.clientX - rect.left) / rect.width) * 100))
    );
    const yPercent = Math.max(
      2,
      Math.min(90, Math.round(((e.clientY - rect.top) / rect.height) * 100))
    );

    const newId = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let newItem: EditorAnnotationItem;

    if (activeTool === 'text') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'text',
        xPercent,
        yPercent,
        widthPercent: 28,
        heightPercent: 5,
        text: 'Editable Text Overlay',
        colorHex: '#0f172a',
        fontSize: 13,
        opacity: 1,
      };
    } else if (activeTool === 'highlight') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'highlight',
        xPercent,
        yPercent,
        widthPercent: 32,
        heightPercent: 3.5,
        colorHex: '#facc15',
        opacity: 0.4,
      };
    } else if (activeTool === 'rectangle') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'rectangle',
        xPercent,
        yPercent,
        widthPercent: 25,
        heightPercent: 10,
        colorHex: '#1d4ed8',
        opacity: 1,
      };
    } else if (activeTool === 'comment') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'comment',
        xPercent,
        yPercent,
        widthPercent: 28,
        heightPercent: 6,
        text: 'Review Note: Verify clause',
        colorHex: '#1e293b',
        fontSize: 10,
        opacity: 0.95,
      };
    } else if (activeTool === 'stamp') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'stamp',
        xPercent,
        yPercent,
        widthPercent: 22,
        heightPercent: 5.5,
        text: stampPreset,
        colorHex: stampPreset === 'VOID' || stampPreset === 'CONFIDENTIAL' ? '#dc2626' : '#15803d',
        opacity: 0.9,
      };
    } else if (activeTool === 'watermark') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'watermark',
        xPercent: 18,
        yPercent: 42,
        widthPercent: 65,
        heightPercent: 12,
        text: 'CONFIDENTIAL — PDFNESTLY',
        colorHex: '#64748b',
        fontSize: 42,
        opacity: 0.22,
      };
    } else if (activeTool === 'redact') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'redact',
        xPercent,
        yPercent,
        widthPercent: 30,
        heightPercent: 4,
        colorHex: '#000000',
        opacity: 1,
      };
    } else if (activeTool === 'signature') {
      if (!pendingSignatureUrl) {
        setStatusMessage('Please create or confirm your signature in the right panel first, then click the page.');
        return;
      }
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'signature',
        xPercent,
        yPercent,
        widthPercent: 26,
        heightPercent: 9,
        imageDataUrl: pendingSignatureUrl,
        opacity: 1,
      };
    } else {
      // image
      if (!pendingImageUrl) {
        setStatusMessage('Please upload an image in the right panel first, then click the page.');
        return;
      }
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'image',
        xPercent,
        yPercent,
        widthPercent: 25,
        heightPercent: 16,
        imageDataUrl: pendingImageUrl,
        opacity: 1,
      };
    }

    pushAnnotationsState([...annotations, newItem]);
    setSelectedId(newId);
    setActiveTool('select');
    setStatusMessage(`Placed ${newItem.type} on Page ${activePage}. Drag on canvas or use the right panel to customize.`);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseXPct = ((e.clientX - rect.left) / rect.width) * 100;
    const mouseYPct = ((e.clientY - rect.top) / rect.height) * 100;
    const newX = Math.max(0, Math.min(92, Math.round(mouseXPct - dragOffset.dxPct)));
    const newY = Math.max(0, Math.min(94, Math.round(mouseYPct - dragOffset.dyPct)));

    setHistory((prev) => {
      const current = prev[historyIdx] || [];
      const updated = current.map((item) =>
        item.id === draggingId ? { ...item, xPercent: newX, yPercent: newY } : item
      );
      const copy = [...prev];
      copy[historyIdx] = updated;
      return copy;
    });
  };

  const handleCanvasMouseUp = () => {
    if (draggingId) {
      setDraggingId(null);
    }
  };

  const selectedAnnotation = annotations.find((a) => a.id === selectedId) || null;

  const updateSelectedAnnotation = (patch: Partial<EditorAnnotationItem>) => {
    if (!selectedId) return;
    const updated = annotations.map((item) =>
      item.id === selectedId ? { ...item, ...patch } : item
    );
    pushAnnotationsState(updated);
  };

  const handleExportPdf = async () => {
    if (!pdfBytes) return;
    setIsExporting(true);
    setErrorMessage('');
    try {
      const modifiedBytes = await applyEditorAnnotationsToPdf(pdfBytes, annotations, {
        extraRotations,
        deletedPages,
      });
      const blob = toPdfBlob(modifiedBytes);
      if (exportedResult?.url) {
        URL.revokeObjectURL(exportedResult.url);
      }
      const url = URL.createObjectURL(blob);
      const outName = fileName.replace(/\.pdf$/i, '') + '-edited.pdf';
      setExportedResult({
        url,
        fileName: outName,
        byteLength: modifiedBytes.byteLength,
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setExportedIdx(historyIdx);
      setStatusMessage(
        `Exported "${outName}" (${formatFileSize(modifiedBytes.byteLength)}) with ${annotations.length} annotation(s).`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to export edited PDF.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const visibleThumbnails = thumbnails.filter(
    (t) => !deletedPages.includes(t.pageNumber)
  );
  const pageAnnotations = annotations.filter((a) => a.pageNumber === activePage);

  return (
    <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl overflow-hidden shadow-xs">
      {/* Top Studio Header Bar */}
      <div className="px-4 py-2.5 bg-[#09090B] border-b border-[#3F3F46] text-[#D4D4D8] text-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <PdfNestlyMark size={18} />
          <span className="font-semibold text-[#FAFAFA]">PDFNestly Studio:</span>
          <span className="text-[#D4D4D8]">Vector Overlay, Annotation & Signature Canvas</span>
          <span className="hidden sm:inline text-[#3F3F46]">·</span>
          <span className="hidden md:inline text-[#D4D4D8]">
            Need to edit existing PDF text lines or fill AcroForm fields?
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/edit-pdf-text"
            className="text-[#EF4444] hover:text-white underline underline-offset-2 font-medium whitespace-nowrap transition-colors"
          >
            Switch to Existing Text Line Editor →
          </Link>
          <span className="text-[#3F3F46]">|</span>
          <Link
            href="/fill-pdf-forms"
            className="text-[#EF4444] hover:text-white underline underline-offset-2 font-medium whitespace-nowrap transition-colors"
          >
            Switch to AcroForm Inspector →
          </Link>
        </div>
      </div>

      {/* Main Editor Toolbar */}
      <div className="px-4 py-3 bg-[#F5F7FA] dark:bg-[#27272A] border-b border-[#E4E4E7] dark:border-[#3F3F46] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTool('select')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'select'
                ? 'bg-[#B91C1C] text-white shadow-xs'
                : 'bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#E4E4E7]/60 dark:hover:bg-[#09090B]'
            }`}
          >
            <MousePointer className="w-3.5 h-3.5" />
            Select
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('text')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'text'
                ? 'bg-[#B91C1C] text-white shadow-xs'
                : 'bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#E4E4E7]/60 dark:hover:bg-[#09090B]'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            Add Text
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('signature')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'signature'
                ? 'bg-[#B91C1C] text-white shadow-xs'
                : 'bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#E4E4E7]/60 dark:hover:bg-[#09090B]'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            Signature
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('highlight')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'highlight'
                ? 'bg-[#B91C1C] text-white shadow-xs'
                : 'bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#E4E4E7]/60 dark:hover:bg-[#09090B]'
            }`}
          >
            <Highlighter className="w-3.5 h-3.5" />
            Highlight
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('rectangle')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'rectangle'
                ? 'bg-[#B91C1C] text-white shadow-xs'
                : 'bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#E4E4E7]/60 dark:hover:bg-[#09090B]'
            }`}
          >
            <Square className="w-3.5 h-3.5" />
            Shape
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('comment')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'comment'
                ? 'bg-[#B91C1C] text-white shadow-xs'
                : 'bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#E4E4E7]/60 dark:hover:bg-[#09090B]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Comment
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('stamp')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'stamp'
                ? 'bg-[#B91C1C] text-white shadow-xs'
                : 'bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#E4E4E7]/60 dark:hover:bg-[#09090B]'
            }`}
          >
            <Stamp className="w-3.5 h-3.5" />
            Stamp
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('watermark')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'watermark'
                ? 'bg-[#B91C1C] text-white shadow-xs'
                : 'bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#E4E4E7]/60 dark:hover:bg-[#09090B]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Watermark
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('image')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'image'
                ? 'bg-[#B91C1C] text-white shadow-xs'
                : 'bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#E4E4E7]/60 dark:hover:bg-[#09090B]'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            Image
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('redact')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTool === 'redact'
                ? 'bg-[#D64545] text-white shadow-xs'
                : 'bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#E4E4E7]/60 dark:hover:bg-[#09090B]'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Blackout Box
          </button>
        </div>

        {/* Zoom, Undo/Redo & Export Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg px-1.5 py-1">
            <button
              type="button"
              onClick={() => setZoomPercent((z) => Math.max(50, z - 15))}
              aria-label="Zoom Out"
              className="p-1 text-[#71717A] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA]"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono tabular-nums text-[#18181B] dark:text-[#FAFAFA] px-1.5">
              {zoomPercent}%
            </span>
            <button
              type="button"
              onClick={() => setZoomPercent((z) => Math.min(200, z + 15))}
              aria-label="Zoom In"
              className="p-1 text-[#71717A] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA]"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomPercent(100)}
              aria-label="Fit to Width"
              title="Fit to Width (100%)"
              className="px-1.5 py-0.5 text-[11px] font-medium text-[#71717A] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA] border-l border-[#E4E4E7] dark:border-[#3F3F46]"
            >
              Fit Width
            </button>
            <button
              type="button"
              onClick={() => setZoomPercent(75)}
              aria-label="Fit to Page"
              title="Fit to Page (75%)"
              className="px-1.5 py-0.5 text-[11px] font-medium text-[#71717A] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA] border-l border-[#E4E4E7] dark:border-[#3F3F46]"
            >
              Fit Page
            </button>
          </div>

          <div className="flex items-center gap-1 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg px-1.5 py-1">
            <button
              type="button"
              onClick={handleUndo}
              disabled={historyIdx === 0}
              aria-label="Undo"
              className="p-1 text-[#71717A] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA] disabled:opacity-40"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyIdx >= history.length - 1}
              aria-label="Redo"
              className="p-1 text-[#71717A] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA] disabled:opacity-40"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!pdfBytes || isExporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting ? 'Exporting...' : 'Export & Download PDF'}
          </button>
        </div>
      </div>

      {/* Status / Error Bar */}
      {(statusMessage || errorMessage || hasUnsavedChanges || exportedResult) && (
        <div className="px-4 py-2 bg-[#F5F7FA] dark:bg-[#09090B] border-b border-[#E4E4E7] dark:border-[#3F3F46] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            {errorMessage ? (
              <span className="inline-flex items-center gap-1.5 text-[#D64545] font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                {errorMessage}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[#18181B] dark:text-[#FAFAFA]">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#16865B]" />
                {statusMessage || 'Editor ready. Click on the page canvas to place selected element.'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {exportedResult && (
              <a
                href={exportedResult.url}
                download={exportedResult.fileName}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-white bg-[#16865B] hover:bg-[#126E4A] rounded-md transition-colors"
              >
                <Download className="w-3 h-3" />
                Download {exportedResult.fileName} ({formatFileSize(exportedResult.byteLength)})
              </a>
            )}
            <div className="text-[#71717A] dark:text-[#D4D4D8] font-mono tabular-nums">
              {hasUnsavedChanges
                ? `${annotations.length} unsaved edit(s) in workspace`
                : annotations.length > 0
                ? `All ${annotations.length} edit(s) exported`
                : '0 pending edits'}
            </div>
          </div>
        </div>
      )}

      {!pdfBytes ? (
        /* Empty Upload / Sample State */
        <div className="p-12 text-center space-y-5 bg-[#F5F7FA]/60 dark:bg-[#09090B]/60">
          <div className="max-w-md mx-auto space-y-3">
            <h2 className="text-lg font-bold text-[#18181B] dark:text-[#FAFAFA]">
              Load a PDF Document into the Editor Workspace
            </h2>
            <p className="text-sm text-[#71717A] dark:text-[#D4D4D8]">
              Upload any PDF from your device or load our 4-page interactive
              sample contract to test annotations, signatures, watermarks, and
              stamps immediately.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <label
              htmlFor="editor-pdf-upload"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg cursor-pointer transition-colors shadow-xs"
            >
              <Upload className="w-4 h-4" />
              Upload PDF File
              <input
                id="editor-pdf-upload"
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileUpload}
                className="sr-only"
              />
            </label>
            <button
              type="button"
              onClick={handleLoadSample}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#18181B] dark:text-[#FAFAFA] bg-white dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#F5F7FA] dark:hover:bg-[#18181B] rounded-lg transition-colors"
            >
              <Sparkles className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444]" />
              {isLoading ? 'Generating Sample...' : 'Load 4-Page Sample PDF'}
            </button>
          </div>
        </div>
      ) : (
        /* 3-Column Editor Workspace: Thumbnails | Interactive Canvas | Inspector */
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
          {/* Left Panel: Page Thumbnails */}
          <div className="lg:col-span-2 border-b lg:border-b-0 lg:border-r border-[#E4E4E7] dark:border-[#3F3F46] bg-[#F5F7FA] dark:bg-[#18181B] p-3 space-y-3 max-h-[680px] overflow-y-auto">
            <div className="flex items-center justify-between text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]">
              <span>Pages ({visibleThumbnails.length})</span>
              <label
                htmlFor="replace-editor-pdf"
                className="text-[#B91C1C] dark:text-[#EF4444] hover:underline cursor-pointer font-medium"
              >
                Replace
                <input
                  id="replace-editor-pdf"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>
            </div>

            <div className="flex lg:flex-col gap-2.5 overflow-x-auto lg:overflow-x-visible pb-2">
              {visibleThumbnails.map((thumb) => {
                const isCurrent = thumb.pageNumber === activePage;
                const countOnPage = annotations.filter(
                  (a) => a.pageNumber === thumb.pageNumber
                ).length;
                const extraDeg = extraRotations[thumb.pageNumber] || 0;
                return (
                  <div
                    key={thumb.pageNumber}
                    className={`group relative shrink-0 w-28 lg:w-full p-2 rounded-lg border text-left transition-all ${
                      isCurrent
                        ? 'border-[#B91C1C] bg-[#B91C1C]/8 dark:bg-[#B91C1C]/15 ring-1 ring-[#B91C1C]'
                        : 'border-[#E4E4E7] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] hover:border-[#B91C1C]/50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActivePage(thumb.pageNumber)}
                      className="w-full text-left"
                    >
                      <div className="aspect-[1/1.3] bg-[#F5F7FA] dark:bg-[#09090B] rounded overflow-hidden border border-[#E4E4E7] dark:border-[#3F3F46] mb-1.5">
                        <img
                          src={thumb.dataUrl}
                          alt={`Page ${thumb.pageNumber} thumbnail`}
                          referrerPolicy="no-referrer"
                          style={{
                            transform: extraDeg ? `rotate(${extraDeg}deg)` : undefined,
                          }}
                          className="w-full h-full object-contain transition-transform"
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-medium text-[#18181B] dark:text-[#FAFAFA] tabular-nums">
                        <span>
                          Page {thumb.pageNumber}
                          {extraDeg ? ` (+${extraDeg}°)` : ''}
                        </span>
                        {countOnPage > 0 && (
                          <span className="text-[#B91C1C] dark:text-[#EF4444] font-semibold">
                            {countOnPage} edit{countOnPage > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </button>
                    <div className="mt-1.5 pt-1.5 border-t border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setExtraRotations((prev) => ({
                            ...prev,
                            [thumb.pageNumber]: ((prev[thumb.pageNumber] || 0) + 90) % 360,
                          }))
                        }
                        aria-label={`Rotate Page ${thumb.pageNumber}`}
                        title="Rotate Page +90°"
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-[#71717A] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA] hover:bg-[#F5F7FA] dark:hover:bg-[#09090B] rounded"
                      >
                        <RotateCw className="w-3 h-3" />
                        Rotate
                      </button>
                      {visibleThumbnails.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextDeleted = [...deletedPages, thumb.pageNumber];
                            setDeletedPages(nextDeleted);
                            if (activePage === thumb.pageNumber) {
                              const remaining = visibleThumbnails.filter(
                                (t) => t.pageNumber !== thumb.pageNumber
                              );
                              if (remaining.length > 0) {
                                setActivePage(remaining[0].pageNumber);
                              }
                            }
                          }}
                          aria-label={`Delete Page ${thumb.pageNumber}`}
                          title="Delete Page"
                          className="p-0.5 text-[#D64545] hover:bg-[#D64545]/10 rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center Panel: Interactive Document Canvas */}
          <div className="lg:col-span-7 bg-[#E4E4E7]/75 dark:bg-[#09090B] p-4 sm:p-6 flex flex-col items-center justify-between overflow-auto max-h-[680px]">
            <div className="w-full flex items-center justify-between mb-3 text-xs text-[#71717A] dark:text-[#D4D4D8]">
              <span className="font-medium text-[#18181B] dark:text-[#FAFAFA] truncate max-w-xs">
                {fileName}
              </span>
              <div className="flex items-center gap-2 tabular-nums">
                <button
                  type="button"
                  onClick={() => {
                    const curIdx = visibleThumbnails.findIndex(
                      (t) => t.pageNumber === activePage
                    );
                    if (curIdx > 0) {
                      setActivePage(visibleThumbnails[curIdx - 1].pageNumber);
                    }
                  }}
                  disabled={
                    visibleThumbnails.findIndex((t) => t.pageNumber === activePage) <= 0
                  }
                  aria-label="Previous Page"
                  className="p-1 bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded hover:bg-[#F5F7FA] dark:hover:bg-[#18181B] disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[#18181B] dark:text-[#FAFAFA]">
                  Page {activePage} ({visibleThumbnails.length} active)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const curIdx = visibleThumbnails.findIndex(
                      (t) => t.pageNumber === activePage
                    );
                    if (curIdx >= 0 && curIdx < visibleThumbnails.length - 1) {
                      setActivePage(visibleThumbnails[curIdx + 1].pageNumber);
                    }
                  }}
                  disabled={
                    visibleThumbnails.findIndex((t) => t.pageNumber === activePage) >=
                    visibleThumbnails.length - 1
                  }
                  aria-label="Next Page"
                  className="p-1 bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded hover:bg-[#F5F7FA] dark:hover:bg-[#18181B] disabled:opacity-40"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Interactive Page Surface */}
            <div
              data-testid="pdf-editor-canvas-surface"
              onClick={handleCanvasClick}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              style={{
                width: `${Math.round(540 * (zoomPercent / 100))}px`,
                transform: extraRotations[activePage]
                  ? `rotate(${extraRotations[activePage]}deg)`
                  : undefined,
              }}
              className={`relative bg-white shadow-lg border border-[#E4E4E7] dark:border-[#3F3F46] select-none transition-all ${
                activeTool !== 'select' ? 'cursor-crosshair' : 'cursor-default'
              }`}
            >
              {pageRenderUrl ? (
                <img
                  src={pageRenderUrl}
                  alt={`PDF Page ${activePage}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-auto block pointer-events-none"
                />
              ) : (
                <div className="aspect-[1/1.294] w-full flex items-center justify-center text-xs text-[#71717A]">
                  Rendering PDF Page {activePage}...
                </div>
              )}

              {/* Placed Annotations Overlay Layer */}
              {pageAnnotations.map((ann) => {
                const isSelected = ann.id === selectedId;
                return (
                  <div
                    key={ann.id}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelectedId(ann.id);
                      const parentRect =
                        e.currentTarget.parentElement?.getBoundingClientRect();
                      if (parentRect) {
                        const mouseXPct =
                          ((e.clientX - parentRect.left) / parentRect.width) * 100;
                        const mouseYPct =
                          ((e.clientY - parentRect.top) / parentRect.height) * 100;
                        setDraggingId(ann.id);
                        setDragOffset({
                          dxPct: mouseXPct - ann.xPercent,
                          dyPct: mouseYPct - ann.yPercent,
                        });
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(ann.id);
                    }}
                    style={{
                      left: `${ann.xPercent}%`,
                      top: `${ann.yPercent}%`,
                      width: `${ann.widthPercent}%`,
                      height: `${ann.heightPercent}%`,
                      opacity: ann.opacity ?? 1,
                    }}
                    className={`absolute flex items-center justify-start p-1 cursor-move transition-shadow ${
                      isSelected
                        ? 'ring-2 ring-[#B91C1C] bg-[#B91C1C]/15 z-20'
                        : 'hover:ring-1 hover:ring-[#B91C1C] z-10'
                    }`}
                  >
                    {ann.type === 'text' && (
                      <span
                        style={{
                          color: ann.colorHex || '#0f172a',
                          fontSize: `${ann.fontSize || 13}px`,
                        }}
                        className="font-sans font-medium leading-tight break-words"
                      >
                        {ann.text}
                      </span>
                    )}

                    {ann.type === 'highlight' && (
                      <div
                        style={{ backgroundColor: ann.colorHex || '#facc15' }}
                        className="w-full h-full opacity-50 rounded-xs"
                      />
                    )}

                    {ann.type === 'rectangle' && (
                      <div
                        style={{ borderColor: ann.colorHex || '#1d4ed8' }}
                        className="w-full h-full border-2"
                      />
                    )}

                    {ann.type === 'redact' && (
                      <div className="w-full h-full bg-black flex items-center justify-center text-[10px] font-mono text-white">
                        REDACTED
                      </div>
                    )}

                    {ann.type === 'comment' && (
                      <div className="w-full h-full bg-amber-100 border border-amber-400 px-2 py-1 text-[11px] text-slate-900 rounded shadow-xs overflow-hidden">
                        {ann.text}
                      </div>
                    )}

                    {ann.type === 'stamp' && (
                      <div
                        style={{
                          borderColor: ann.colorHex || '#15803d',
                          color: ann.colorHex || '#15803d',
                        }}
                        className="w-full h-full border-2 rounded px-2 flex items-center justify-center font-bold tracking-wider text-xs uppercase"
                      >
                        {ann.text}
                      </div>
                    )}

                    {ann.type === 'watermark' && (
                      <div
                        style={{
                          color: ann.colorHex || '#64748b',
                          transform: 'rotate(-25deg)',
                        }}
                        className="w-full h-full flex items-center justify-center font-bold text-xl tracking-widest uppercase pointer-events-none"
                      >
                        {ann.text}
                      </div>
                    )}

                    {(ann.type === 'signature' || ann.type === 'image') &&
                      ann.imageDataUrl && (
                        <img
                          src={ann.imageDataUrl}
                          alt={ann.type}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain pointer-events-none"
                        />
                      )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Contextual Tool Settings & Selected Element Inspector */}
          <div className="lg:col-span-3 border-t lg:border-t-0 lg:border-l border-[#E4E4E7] dark:border-[#3F3F46] bg-white dark:bg-[#18181B] p-4 space-y-5 max-h-[680px] overflow-y-auto">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#71717A] dark:text-[#D4D4D8] mb-2">
                Inspector & Tool Controls
              </h3>
              <p className="text-xs text-[#71717A] dark:text-[#D4D4D8]">
                Active Tool:{' '}
                <strong className="text-[#18181B] dark:text-[#FAFAFA] capitalize">
                  {activeTool}
                </strong>
                .{' '}
                {activeTool === 'select'
                  ? 'Click any element on the page to edit its properties, or select a tool above to place a new item.'
                  : 'Click anywhere on the PDF page canvas to place this item.'}
              </p>
            </div>

            {activeTool === 'signature' && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                  1. Prepare Your Signature
                </h4>
                <SignatureBuilder
                  onSignatureCreated={(url) => {
                    setPendingSignatureUrl(url);
                    setStatusMessage(
                      'Signature ready! Now click anywhere on the PDF page to place your signature.'
                    );
                  }}
                />
                {pendingSignatureUrl && (
                  <div className="p-2 bg-[#16865B]/10 border border-[#16865B]/30 rounded-lg text-xs text-[#16865B] dark:text-[#34D399]">
                    Signature active — click on the PDF page to place it.
                  </div>
                )}
              </div>
            )}

            {activeTool === 'stamp' && (
              <div className="space-y-2">
                <label
                  htmlFor="stamp-preset-select"
                  className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
                >
                  Stamp Label
                </label>
                <select
                  id="stamp-preset-select"
                  value={stampPreset}
                  onChange={(e) => setStampPreset(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                >
                  <option value="APPROVED">APPROVED</option>
                  <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                  <option value="DRAFT">DRAFT</option>
                  <option value="FINAL">FINAL</option>
                  <option value="REVIEWED">REVIEWED</option>
                  <option value="VOID">VOID</option>
                </select>
              </div>
            )}

            {activeTool === 'image' && (
              <div className="space-y-2">
                <label
                  htmlFor="editor-place-image"
                  className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
                >
                  Select Image to Embed (PNG/JPG)
                </label>
                <input
                  id="editor-place-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        setPendingImageUrl(reader.result);
                        setStatusMessage(
                          'Image loaded! Click on the PDF page canvas to place it.'
                        );
                      }
                    };
                    reader.readAsDataURL(f);
                  }}
                  className="w-full text-xs text-[#71717A] dark:text-[#D4D4D8]"
                />
              </div>
            )}

            {/* Selected Annotation Properties */}
            {selectedAnnotation ? (
              <div className="border-t border-[#E4E4E7] dark:border-[#3F3F46] pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#18181B] dark:text-[#FAFAFA] capitalize">
                    Selected: {selectedAnnotation.type}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      pushAnnotationsState(
                        annotations.filter((a) => a.id !== selectedAnnotation.id)
                      );
                      setSelectedId(null);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#D64545] hover:bg-[#D64545]/10 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>

                {(selectedAnnotation.type === 'text' ||
                  selectedAnnotation.type === 'comment' ||
                  selectedAnnotation.type === 'stamp' ||
                  selectedAnnotation.type === 'watermark') && (
                  <div>
                    <label
                      htmlFor="selected-ann-text"
                      className="block text-xs font-medium text-[#18181B] dark:text-[#FAFAFA] mb-1"
                    >
                      Text Content
                    </label>
                    <input
                      id="selected-ann-text"
                      type="text"
                      value={selectedAnnotation.text || ''}
                      onChange={(e) =>
                        updateSelectedAnnotation({ text: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                    />
                  </div>
                )}

                {selectedAnnotation.type === 'text' && (
                  <div>
                    <label
                      htmlFor="selected-ann-fontsize"
                      className="block text-xs font-medium text-[#18181B] dark:text-[#FAFAFA] mb-1"
                    >
                      Font Size ({selectedAnnotation.fontSize || 13} pt)
                    </label>
                    <input
                      id="selected-ann-fontsize"
                      type="range"
                      min={8}
                      max={36}
                      value={selectedAnnotation.fontSize || 13}
                      onChange={(e) =>
                        updateSelectedAnnotation({
                          fontSize: Number(e.target.value),
                        })
                      }
                      className="w-full accent-[#B91C1C]"
                    />
                  </div>
                )}

                {selectedAnnotation.colorHex && (
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="selected-ann-color"
                      className="text-xs font-medium text-[#18181B] dark:text-[#FAFAFA]"
                    >
                      Color
                    </label>
                    <input
                      id="selected-ann-color"
                      type="color"
                      value={selectedAnnotation.colorHex}
                      onChange={(e) =>
                        updateSelectedAnnotation({ colorHex: e.target.value })
                      }
                      className="w-8 h-6 rounded border border-[#E4E4E7] dark:border-[#3F3F46] cursor-pointer bg-white"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="selected-ann-x"
                      className="block text-[11px] text-[#71717A] dark:text-[#D4D4D8]"
                    >
                      Horizontal X ({selectedAnnotation.xPercent}%)
                    </label>
                    <input
                      id="selected-ann-x"
                      type="range"
                      min={0}
                      max={90}
                      value={selectedAnnotation.xPercent}
                      onChange={(e) =>
                        updateSelectedAnnotation({
                          xPercent: Number(e.target.value),
                        })
                      }
                      className="w-full accent-[#B91C1C]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="selected-ann-y"
                      className="block text-[11px] text-[#71717A] dark:text-[#D4D4D8]"
                    >
                      Vertical Y ({selectedAnnotation.yPercent}%)
                    </label>
                    <input
                      id="selected-ann-y"
                      type="range"
                      min={0}
                      max={92}
                      value={selectedAnnotation.yPercent}
                      onChange={(e) =>
                        updateSelectedAnnotation({
                          yPercent: Number(e.target.value),
                        })
                      }
                      className="w-full accent-[#B91C1C]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="selected-ann-w"
                      className="block text-[11px] text-[#71717A] dark:text-[#D4D4D8]"
                    >
                      Width ({selectedAnnotation.widthPercent}%)
                    </label>
                    <input
                      id="selected-ann-w"
                      type="range"
                      min={5}
                      max={95}
                      value={selectedAnnotation.widthPercent}
                      onChange={(e) =>
                        updateSelectedAnnotation({
                          widthPercent: Number(e.target.value),
                        })
                      }
                      className="w-full accent-[#B91C1C]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="selected-ann-h"
                      className="block text-[11px] text-[#71717A] dark:text-[#D4D4D8]"
                    >
                      Height ({selectedAnnotation.heightPercent}%)
                    </label>
                    <input
                      id="selected-ann-h"
                      type="range"
                      min={2}
                      max={80}
                      value={selectedAnnotation.heightPercent}
                      onChange={(e) =>
                        updateSelectedAnnotation({
                          heightPercent: Number(e.target.value),
                        })
                      }
                      className="w-full accent-[#B91C1C]"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="border-t border-[#E4E4E7] dark:border-[#3F3F46] pt-4 text-xs text-[#71717A] dark:text-[#D4D4D8] space-y-2">
                <p className="font-medium text-[#18181B] dark:text-[#FAFAFA]">
                  Placed Items on Page {activePage} ({pageAnnotations.length})
                </p>
                {pageAnnotations.length === 0 ? (
                  <p>No annotations placed on this page yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {pageAnnotations.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          className="w-full text-left px-2 py-1 rounded hover:bg-[#F5F7FA] dark:hover:bg-[#27272A] flex items-center justify-between"
                        >
                          <span className="capitalize font-medium text-[#18181B] dark:text-[#FAFAFA]">
                            {item.type}
                          </span>
                          <span className="text-[#71717A] dark:text-[#D4D4D8] truncate max-w-[120px]">
                            {item.text || `${item.xPercent}%, ${item.yPercent}%`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
