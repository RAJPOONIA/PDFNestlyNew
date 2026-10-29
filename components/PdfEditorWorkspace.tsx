'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Circle,
  Minus,
  ArrowUpRight,
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
  PlusCircle,
  Copy,
  Layers,
  Lock,
  Unlock,
  Sliders,
  MoreVertical,
  Maximize2,
  FileDown,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  EditorAnnotationItem,
  PageThumbnailInfo,
  renderPdfThumbnails,
  renderSinglePageDataUrl,
  applyEditorAnnotationsToPdf,
  extractPdfTextAndLines,
} from '@/lib/pdf-engine-client';
import { generateSamplePdfBytes } from '@/lib/sample-pdf';
import { formatFileSize, validateFileHeader, toPdfBlob } from '@/lib/pdf-utils';
import { loadCurrentDocument, storeCurrentDocument, clearCurrentDocument } from '@/lib/document-store';
import { SignatureBuilder } from './SignatureBuilder';
import { PdfNestlyMark } from './Logo';
import { trackPdfActivity, createClientJobId } from '@/lib/activity-client';

export type EditorToolMode =
  | 'select'
  | 'existing-text'
  | 'text'
  | 'highlight'
  | 'shape'
  | 'comment'
  | 'stamp'
  | 'watermark'
  | 'signature'
  | 'redact'
  | 'image';

export type ShapeType = 'rectangle' | 'rounded-rect' | 'ellipse' | 'line' | 'arrow';

interface DetectedTextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  pageNumber: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

interface PdfEditorWorkspaceProps {
  initialPdfBytes?: Uint8Array | null;
  initialFileName?: string;
  defaultTool?: EditorToolMode;
}

export function PdfEditorWorkspace({
  initialPdfBytes = null,
  initialFileName = 'document.pdf',
  defaultTool = 'select',
}: PdfEditorWorkspaceProps) {
  // Document state
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(initialPdfBytes);
  const [fileName, setFileName] = useState<string>(initialFileName);
  const [thumbnails, setThumbnails] = useState<PageThumbnailInfo[]>([]);
  const [activePage, setActivePage] = useState<number>(1);
  const [pageRenderUrl, setPageRenderUrl] = useState<string>('');
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }>({ width: 595, height: 842 });
  const [detectedLines, setDetectedLines] = useState<DetectedTextLine[]>([]);

  // UI state
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [fitMode, setFitMode] = useState<'page' | 'width' | 'custom'>('page');
  const [activeTool, setActiveTool] = useState<EditorToolMode>(defaultTool);
  const [activeShapeType, setActiveShapeType] = useState<ShapeType>('rectangle');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(true);
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);
  const [showSignaturePad, setShowSignaturePad] = useState<boolean>(false);

  // History state for annotations
  const [history, setHistory] = useState<EditorAnnotationItem[][]>([[]]);
  const [historyIdx, setHistoryIdx] = useState<number>(0);
  const [exportedIdx, setExportedIdx] = useState<number>(0);
  const annotations = history[historyIdx] || [];

  // Selection & drag state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTextLine, setSelectedTextLine] = useState<DetectedTextLine | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dxPct: number; dyPct: number }>({ dxPct: 0, dyPct: 0 });

  // Document page mutations
  const [extraRotations, setExtraRotations] = useState<Record<number, number>>({});
  const [deletedPages, setDeletedPages] = useState<number[]>([]);

  // Confirmation Modal state for Delete / Close
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<{
    isOpen: boolean;
    pageNum: number;
    isOnlyPage: boolean;
  } | null>(null);

  // Image & signature staging
  const [pendingImageUrl, setPendingImageUrl] = useState<string>('');
  const [pendingImageSize, setPendingImageSize] = useState<{ width: number; height: number }>({ width: 200, height: 100 });
  const [stampPreset, setStampPreset] = useState<string>('APPROVED');

  // Status & loading
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportedResult, setExportedResult] = useState<{ url: string; fileName: string; byteLength: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mainContainerRef = useRef<HTMLElement>(null);
  const hasInitialFittedRef = useRef<boolean>(false);

  // Check unsaved changes
  const hasPageEdits = Object.values(extraRotations).some((deg) => deg > 0) || deletedPages.length > 0;
  const hasUnsavedChanges = (historyIdx !== exportedIdx && annotations.length > 0) || hasPageEdits;

  // 1. Initial Load: Auto-restore from IndexedDB if not passed via props
  useEffect(() => {
    const editorSlug = defaultTool === 'signature' ? 'sign-pdf' : 'edit-pdf';
    const editorTitle = defaultTool === 'signature' ? 'Sign PDF' : 'Edit PDF';
    trackPdfActivity({
      eventType: 'tool_opened',
      toolSlug: editorSlug,
      toolName: editorTitle,
      status: 'info',
      dedupeKey: `tool_open_${editorSlug}`,
    }).catch(() => {});

    let mounted = true;
    if (!pdfBytes) {
      setIsLoading(true);
      loadCurrentDocument()
        .then((doc) => {
          if (!mounted) return;
          if (doc && doc.bytes && doc.bytes.length > 0) {
            setPdfBytes(doc.bytes);
            setFileName(doc.name);
            setStatusMessage(`Loaded "${doc.name}" from document store.`);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (mounted) setIsLoading(false);
        });
    }
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Warn before unload if unsaved changes exist
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

  // 3. Keyboard shortcuts: Undo (Ctrl+Z), Redo (Ctrl+Y / Ctrl+Shift+Z), Delete (Backspace / Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in input or textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        handleRedo();
        e.preventDefault();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          handleDeleteSelected();
          e.preventDefault();
        }
      } else if (e.key === 'Escape') {
        setSelectedId(null);
        setSelectedTextLine(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIdx, history, selectedId]);

  // 4. Render thumbnails and extract text whenever pdfBytes changes
  useEffect(() => {
    if (!pdfBytes) return;
    let isCancelled = false;
    setIsLoading(true);

    renderPdfThumbnails(pdfBytes, 0.25)
      .then((thumbs) => {
        if (isCancelled) return;
        setThumbnails(thumbs);
        if (thumbs.length > 0 && !thumbs.some((t) => t.pageNumber === activePage)) {
          setActivePage(thumbs[0].pageNumber);
        }
      })
      .catch((err) => {
        if (!isCancelled) setErrorMessage('Failed to generate page thumbnails: ' + (err as Error).message);
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });

    // Extract text lines for existing-text editing mode
    extractPdfTextAndLines(pdfBytes)
      .then((report) => {
        if (isCancelled) return;
        // Map detected lines to percentage coordinates relative to page dimensions
        const mapped: DetectedTextLine[] = report.lines.map((line) => {
          // Standard A4 default fallback: width 595.28, height 841.89
          const pWidth = 595.28;
          const pHeight = 841.89;
          const xPct = Math.max(0, Math.min(100, (line.x / pWidth) * 100));
          const yPct = Math.max(0, Math.min(100, ((pHeight - line.y - line.height) / pHeight) * 100));
          const wPct = Math.max(2, Math.min(100, (line.width / pWidth) * 100));
          const hPct = Math.max(1.5, Math.min(50, (line.height / pHeight) * 100));
          return {
            ...line,
            xPercent: xPct,
            yPercent: yPct,
            widthPercent: wPct,
            heightPercent: hPct,
          };
        });
        setDetectedLines(mapped);
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [pdfBytes]);

  // 5. Calculate Fit Scale for viewport
  const calculateFitZoom = useCallback(
    (mode: 'page' | 'width' = 'page') => {
      if (!mainContainerRef.current || pageDimensions.width <= 0 || pageDimensions.height <= 0) {
        return;
      }
      const container = mainContainerRef.current;
      // Subtract margins/padding around canvas (48px horizontal, 48px vertical)
      const availW = Math.max(260, container.clientWidth - 48);
      const availH = Math.max(260, container.clientHeight - 48);

      const scaleW = availW / pageDimensions.width;
      const scaleH = availH / pageDimensions.height;

      let targetZoom: number;
      if (mode === 'width') {
        targetZoom = Math.round(Math.max(30, Math.min(200, scaleW * 100)));
      } else {
        // Fit Page: use smaller of width and height scale so the entire sheet fits in view
        const fitScale = Math.min(scaleW, scaleH);
        targetZoom = Math.round(Math.max(30, Math.min(150, fitScale * 100)));
      }

      setZoomPercent(targetZoom);
      setFitMode(mode);
    },
    [pageDimensions.width, pageDimensions.height]
  );

  // 6. Render active page preview whenever page, zoom, or extra rotations change
  const renderCurrentPage = useCallback(() => {
    if (!pdfBytes) return () => {};
    let active = true;
    setIsRenderingPage(true);
    setRenderError('');

    const baseScale = Math.max(0.6, Math.min(2.5, (zoomPercent / 100) * 1.5));
    const extraRot = extraRotations[activePage] || 0;

    renderSinglePageDataUrl(pdfBytes, activePage, baseScale, extraRot)
      .then((res) => {
        if (!active) return;
        setPageRenderUrl(res.dataUrl);
        if (res.unscaledWidthPt && res.unscaledHeightPt) {
          setPageDimensions({ width: res.unscaledWidthPt, height: res.unscaledHeightPt });
        }
        setIsRenderingPage(false);
      })
      .catch((err) => {
        if (!active) return;
        setRenderError('Failed to render page: ' + (err as Error).message);
        setIsRenderingPage(false);
      });

    return () => {
      active = false;
    };
  }, [pdfBytes, activePage, zoomPercent, extraRotations]);

  useEffect(() => {
    const cancel = renderCurrentPage();
    return () => {
      if (cancel) cancel();
    };
  }, [renderCurrentPage]);

  // Initial Auto-Fit when page dimensions are first discovered
  useEffect(() => {
    if (pdfBytes && !hasInitialFittedRef.current && pageDimensions.width > 0) {
      const timer = setTimeout(() => {
        calculateFitZoom('page');
        hasInitialFittedRef.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [pdfBytes, pageDimensions.width, pageDimensions.height, calculateFitZoom]);

  // Re-fit on sidebar collapse or window resize if in fit mode
  useEffect(() => {
    if (fitMode === 'page' || fitMode === 'width') {
      const timer = setTimeout(() => {
        calculateFitZoom(fitMode);
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [isSidebarOpen, isInspectorOpen, fitMode, calculateFitZoom]);

  useEffect(() => {
    const handleResize = () => {
      if (fitMode === 'page' || fitMode === 'width') {
        calculateFitZoom(fitMode);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitMode, calculateFitZoom]);

  // History operations
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

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    const next = annotations.filter((a) => a.id !== selectedId);
    pushAnnotationsState(next);
    setSelectedId(null);
    setStatusMessage('Deleted selected object.');
  };

  const handleDuplicateSelected = () => {
    if (!selectedId) return;
    const target = annotations.find((a) => a.id === selectedId);
    if (!target) return;
    const copyItem: EditorAnnotationItem = {
      ...target,
      id: `copy_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      xPercent: Math.min(85, target.xPercent + 3),
      yPercent: Math.min(85, target.yPercent + 3),
    };
    pushAnnotationsState([...annotations, copyItem]);
    setSelectedId(copyItem.id);
    setStatusMessage('Duplicated object.');
  };

  // Document Replace Handler
  const handleReplaceDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const v = validateFileHeader(new Uint8Array(await file.slice(0, 32).arrayBuffer()), 'pdf');
    if (!v.valid) {
      setErrorMessage(v.error || 'Please select a valid PDF file.');
      return;
    }

    try {
      setIsLoading(true);
      const doc = await storeCurrentDocument(file, 'editor-replace');
      setPdfBytes(doc.bytes);
      setFileName(doc.name);
      setHistory([[]]);
      setHistoryIdx(0);
      setExportedIdx(0);
      setExtraRotations({});
      setDeletedPages([]);
      setSelectedId(null);
      setSelectedTextLine(null);
      setActivePage(1);
      hasInitialFittedRef.current = false;
      setStatusMessage(`Replaced document with "${file.name}".`);
    } catch {
      setErrorMessage('Failed to replace document.');
    } finally {
      setIsLoading(false);
      e.target.value = '';
    }
  };

  // Load Sample Document Handler
  const handleLoadSample = async () => {
    try {
      setIsLoading(true);
      const sample = await generateSamplePdfBytes('primary');
      const doc = await storeCurrentDocument({ name: 'PDFNestly-Sample-Contract.pdf', bytes: sample }, 'sample');
      setPdfBytes(doc.bytes);
      setFileName(doc.name);
      setHistory([[]]);
      setHistoryIdx(0);
      setExportedIdx(0);
      setExtraRotations({});
      setDeletedPages([]);
      setSelectedId(null);
      setSelectedTextLine(null);
      setActivePage(1);
      hasInitialFittedRef.current = false;
      setStatusMessage('Loaded 4-page interactive sample contract.');
    } catch (err) {
      setErrorMessage('Failed to generate sample: ' + (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // Image upload handling for Image Insertion tool
  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (max 25MB)
    if (file.size > 25 * 1024 * 1024) {
      setErrorMessage(`Image is too large (${formatFileSize(file.size)}). Maximum supported image size is 25MB.`);
      e.target.value = '';
      return;
    }

    if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/i) && !file.name.match(/\.(png|jpe?g|webp)$/i)) {
      setErrorMessage('Please select a PNG (transparent supported), JPEG, or WebP image.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setErrorMessage('Failed to read image file.');
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => setErrorMessage('Invalid image binary or corrupted image file.');
      img.onload = () => {
        // Draw to offscreen canvas and convert to PNG data URL
        // Guarantees clean alpha transparency, correct pixel bounds, and flawless pdf-lib embedPng support
        const offscreen = document.createElement('canvas');
        offscreen.width = Math.max(1, img.naturalWidth);
        offscreen.height = Math.max(1, img.naturalHeight);
        const ctx = offscreen.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const normalizedPng = offscreen.toDataURL('image/png');
          setPendingImageUrl(normalizedPng);
          setPendingImageSize({ width: img.naturalWidth, height: img.naturalHeight });
          setStatusMessage(`Image "${file.name}" ready (${img.naturalWidth}×${img.naturalHeight}px). Click anywhere on the PDF page or use "Place at Center".`);
          setActiveTool('image');
          setIsInspectorOpen(true);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Quick place image at center of active page
  const handlePlaceImageAtCenter = () => {
    if (!pendingImageUrl || !pdfBytes) return;
    const aspect = pendingImageSize.width / Math.max(1, pendingImageSize.height);
    const widthPct = 30;
    const pageAspect = pageDimensions.width / Math.max(1, pageDimensions.height);
    const heightPct = Math.min(50, Math.max(5, (widthPct / aspect) * pageAspect));

    const newId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newItem: EditorAnnotationItem = {
      id: newId,
      pageNumber: activePage,
      type: 'image',
      xPercent: Math.round(50 - widthPct / 2),
      yPercent: Math.round(40 - heightPct / 2),
      widthPercent: Math.round(widthPct),
      heightPercent: Math.round(heightPct),
      imageDataUrl: pendingImageUrl,
      aspectRatioLocked: true,
      opacity: 1,
    };
    pushAnnotationsState([...annotations, newItem]);
    setSelectedId(newId);
    setActiveTool('select');
    setStatusMessage('Image placed at center of page. Drag to move or use corners to resize.');
  };

  // Canvas Click Handler: Places active tool object onto the active page
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If clicking an existing annotation, handled by annotation click
    if (activeTool === 'select') return;
    if (!pdfBytes) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const xPercent = Math.max(0, Math.min(90, Math.round((clickX / rect.width) * 100)));
    const yPercent = Math.max(0, Math.min(90, Math.round((clickY / rect.height) * 100)));

    const newId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let newItem: EditorAnnotationItem;

    if (activeTool === 'text') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'text',
        xPercent,
        yPercent,
        widthPercent: 24,
        heightPercent: 4.5,
        text: 'Enter text here',
        colorHex: '#18181B',
        fontSize: 14,
        fontFamily: 'Helvetica',
        opacity: 1,
      };
    } else if (activeTool === 'highlight') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'highlight',
        xPercent,
        yPercent,
        widthPercent: 25,
        heightPercent: 3,
        colorHex: '#FBBF24',
        opacity: 0.35,
      };
    } else if (activeTool === 'shape') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'shape',
        shapeType: activeShapeType,
        xPercent,
        yPercent,
        widthPercent: activeShapeType === 'line' || activeShapeType === 'arrow' ? 20 : 20,
        heightPercent: activeShapeType === 'line' || activeShapeType === 'arrow' ? 4 : 14,
        strokeColorHex: '#B91C1C',
        fillColorHex: 'transparent',
        strokeWidth: 2,
        opacity: 1,
      };
    } else if (activeTool === 'comment') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'comment',
        xPercent,
        yPercent,
        widthPercent: 22,
        heightPercent: 6,
        text: 'Document note...',
        colorHex: '#92400E',
        fontSize: 11,
        opacity: 0.95,
      };
    } else if (activeTool === 'stamp') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'stamp',
        xPercent,
        yPercent,
        widthPercent: 18,
        heightPercent: 5.5,
        text: stampPreset,
        colorHex: stampPreset === 'REJECTED' || stampPreset === 'VOID' ? '#DC2626' : '#059669',
        fontSize: 13,
        opacity: 0.9,
      };
    } else if (activeTool === 'watermark') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'watermark',
        xPercent: 15,
        yPercent: 40,
        widthPercent: 70,
        heightPercent: 20,
        text: 'CONFIDENTIAL',
        colorHex: '#B91C1C',
        fontSize: 48,
        opacity: 0.22,
      };
    } else if (activeTool === 'redact') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'redact',
        xPercent,
        yPercent,
        widthPercent: 25,
        heightPercent: 4,
        colorHex: '#000000',
        opacity: 1,
      };
    } else if (activeTool === 'image') {
      if (!pendingImageUrl) {
        imageInputRef.current?.click();
        return;
      }
      const imgAspect = pendingImageSize.width / Math.max(1, pendingImageSize.height);
      const widthPct = 30;
      const pageAspect = pageDimensions.width / Math.max(1, pageDimensions.height);
      const heightPct = Math.min(60, Math.max(4, (widthPct / imgAspect) * pageAspect));
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'image',
        xPercent: Math.min(70, xPercent),
        yPercent: Math.min(70, yPercent),
        widthPercent: Math.round(widthPct),
        heightPercent: Math.round(heightPct),
        imageDataUrl: pendingImageUrl,
        aspectRatioLocked: true,
        opacity: 1,
      };
    } else {
      return;
    }

    pushAnnotationsState([...annotations, newItem]);
    setSelectedId(newId);
    setActiveTool('select');
    setStatusMessage(`Placed ${newItem.type} on Page ${activePage}. Use handles to resize or the inspector to edit.`);
  };

  // Canvas Mouse Dragging & Resizing
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingId && !resizingId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseXPct = ((e.clientX - rect.left) / rect.width) * 100;
    const mouseYPct = ((e.clientY - rect.top) / rect.height) * 100;

    if (draggingId) {
      const newX = Math.max(0, Math.min(96, Math.round(mouseXPct - dragOffset.dxPct)));
      const newY = Math.max(0, Math.min(96, Math.round(mouseYPct - dragOffset.dyPct)));

      setHistory((prev) => {
        const current = prev[historyIdx] || [];
        const updated = current.map((item) =>
          item.id === draggingId ? { ...item, xPercent: newX, yPercent: newY } : item
        );
        const copy = [...prev];
        copy[historyIdx] = updated;
        return copy;
      });
    } else if (resizingId && resizeHandle) {
      setHistory((prev) => {
        const current = prev[historyIdx] || [];
        const updated = current.map((item) => {
          if (item.id !== resizingId) return item;
          let newW = item.widthPercent;
          let newH = item.heightPercent;
          let newX = item.xPercent;
          let newY = item.yPercent;

          if (resizeHandle.includes('e')) {
            newW = Math.max(3, Math.min(100 - item.xPercent, mouseXPct - item.xPercent));
          }
          if (resizeHandle.includes('s')) {
            newH = Math.max(2, Math.min(100 - item.yPercent, mouseYPct - item.yPercent));
          }
          if (resizeHandle.includes('w')) {
            const rightEdge = item.xPercent + item.widthPercent;
            newX = Math.max(0, Math.min(rightEdge - 3, mouseXPct));
            newW = rightEdge - newX;
          }
          if (resizeHandle.includes('n')) {
            const bottomEdge = item.yPercent + item.heightPercent;
            newY = Math.max(0, Math.min(bottomEdge - 2, mouseYPct));
            newH = bottomEdge - newY;
          }

          return {
            ...item,
            xPercent: Math.round(newX),
            yPercent: Math.round(newY),
            widthPercent: Math.round(newW),
            heightPercent: Math.round(newH),
          };
        });
        const copy = [...prev];
        copy[historyIdx] = updated;
        return copy;
      });
    }
  };

  const handleCanvasMouseUp = () => {
    setDraggingId(null);
    setResizingId(null);
    setResizeHandle(null);
  };

  const selectedAnnotation = annotations.find((a) => a.id === selectedId) || null;

  const updateSelectedAnnotation = (patch: Partial<EditorAnnotationItem>) => {
    if (!selectedId) return;
    const updated = annotations.map((item) =>
      item.id === selectedId ? { ...item, ...patch } : item
    );
    pushAnnotationsState(updated);
  };

  // Existing Text Line Selection & Replacement Workflow
  const handleSelectTextLine = (line: DetectedTextLine) => {
    setSelectedTextLine(line);
    setSelectedId(null);
    setIsInspectorOpen(true);
    setStatusMessage(`Selected text line: "${line.text}". Enter replacement in the right inspector.`);
  };

  const handleApplyExistingTextReplacement = (replacementText: string, textColor: string, fontSize: number) => {
    if (!selectedTextLine) return;

    const newId = `edit_text_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const editItem: EditorAnnotationItem = {
      id: newId,
      pageNumber: selectedTextLine.pageNumber,
      type: 'text',
      isExistingTextEdit: true,
      originalText: selectedTextLine.text,
      xPercent: selectedTextLine.xPercent,
      yPercent: selectedTextLine.yPercent,
      widthPercent: selectedTextLine.widthPercent,
      heightPercent: selectedTextLine.heightPercent,
      text: replacementText,
      fontSize: fontSize || selectedTextLine.fontSize,
      colorHex: textColor || '#18181B',
      backgroundColorHex: '#FFFFFF',
      opacity: 1,
    };

    pushAnnotationsState([...annotations, editItem]);
    setSelectedId(newId);
    setSelectedTextLine(null);
    setStatusMessage('In-place text edit applied.');
  };

  const handleDeleteExistingTextLine = () => {
    if (!selectedTextLine) return;

    // Erase text by creating an empty replacement box
    handleApplyExistingTextReplacement('', '#FFFFFF', selectedTextLine.fontSize);
    setStatusMessage('Text line removed.');
  };

  // Export / Download PDF Action
  const handleExportPdf = async () => {
    if (!pdfBytes) return;
    setIsExporting(true);
    setErrorMessage('');
    setStatusMessage('Compiling vector layers and generating PDF...');

    const editorSlug = defaultTool === 'signature' ? 'sign-pdf' : 'edit-pdf';
    const editorTitle = defaultTool === 'signature' ? 'Sign PDF' : 'Edit PDF';
    const jobId = createClientJobId(editorSlug);
    const startTime = performance.now();

    trackPdfActivity({
      eventType: 'pdf_processing_started',
      toolSlug: editorSlug,
      toolName: editorTitle,
      status: 'started',
      fileSizeBytes: pdfBytes.byteLength,
      jobId,
    }).catch(() => {});

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

      const durationMs = Math.round(performance.now() - startTime);
      trackPdfActivity({
        eventType: 'pdf_processing_completed',
        toolSlug: editorSlug,
        toolName: editorTitle,
        status: 'succeeded',
        fileSizeBytes: pdfBytes.byteLength,
        outputSizeBytes: modifiedBytes.byteLength,
        durationMs,
        jobId,
      }).catch(() => {});

      // Trigger immediate browser download
      const a = document.createElement('a');
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      trackPdfActivity({
        eventType: 'pdf_download_completed',
        toolSlug: editorSlug,
        toolName: editorTitle,
        status: 'succeeded',
        fileSizeBytes: modifiedBytes.byteLength,
        outputSizeBytes: modifiedBytes.byteLength,
        jobId,
      }).catch(() => {});

      setExportedIdx(historyIdx);
      setStatusMessage(`Downloaded "${outName}" (${formatFileSize(modifiedBytes.byteLength)}).`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to export edited PDF.';
      setErrorMessage(errMsg);
      trackPdfActivity({
        eventType: 'pdf_processing_failed',
        toolSlug: editorSlug,
        toolName: editorTitle,
        status: 'failed',
        fileSizeBytes: pdfBytes.byteLength,
        durationMs: Math.round(performance.now() - startTime),
        errorCategory: errMsg,
        jobId,
      }).catch(() => {});
    } finally {
      setIsExporting(false);
    }
  };

  // Page Operations
  const handleRotatePage = (pageNum: number) => {
    setExtraRotations((prev) => ({
      ...prev,
      [pageNum]: ((prev[pageNum] || 0) + 90) % 360,
    }));
    setStatusMessage(`Rotated Page ${pageNum} by 90°.`);
  };

  const handleDeletePage = (pageNum: number) => {
    const remainingCount = thumbnails.length - deletedPages.length;
    const isOnly = remainingCount <= 1;
    setConfirmDeleteModal({
      isOpen: true,
      pageNum,
      isOnlyPage: isOnly,
    });
  };

  const handleConfirmDeletePage = () => {
    if (!confirmDeleteModal) return;
    const { pageNum } = confirmDeleteModal;
    setDeletedPages((prev) => [...prev, pageNum]);
    // Switch active page to next remaining page
    const remaining = thumbnails.filter(
      (t) => t.pageNumber !== pageNum && !deletedPages.includes(t.pageNumber)
    );
    if (remaining.length > 0) {
      setActivePage(remaining[0].pageNumber);
    }
    setConfirmDeleteModal(null);
    setStatusMessage(`Deleted Page ${pageNum}.`);
  };

  const handleCloseAndRemoveDocument = async () => {
    try {
      setIsLoading(true);
      await clearCurrentDocument();
      setPdfBytes(null);
      setFileName('');
      setThumbnails([]);
      setHistory([[]]);
      setHistoryIdx(0);
      setExportedIdx(0);
      setExtraRotations({});
      setDeletedPages([]);
      setSelectedId(null);
      setSelectedTextLine(null);
      setPageRenderUrl('');
      setConfirmDeleteModal(null);
      hasInitialFittedRef.current = false;
      setStatusMessage('Document closed.');
    } catch {
      setErrorMessage('Failed to clear document.');
    } finally {
      setIsLoading(false);
    }
  };

  const visibleThumbnails = thumbnails.filter((t) => !deletedPages.includes(t.pageNumber));
  const pageAnnotations = annotations.filter((a) => a.pageNumber === activePage);
  const activePageDetectedLines = detectedLines.filter((l) => l.pageNumber === activePage);

  // EMPTY STATE: If no PDF is loaded
  if (!pdfBytes) {
    return (
      <div className="w-full min-h-[calc(100vh-8rem)] flex items-center justify-center p-6 bg-[#FAFAFA] dark:bg-[#09090B]">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleReplaceDocument}
        />
        <div className="max-w-xl w-full p-8 rounded-2xl bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] shadow-sm text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FEF2F2] dark:bg-[#B91C1C]/15 flex items-center justify-center text-[#B91C1C] dark:text-[#EF4444]">
            <FileText className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
              Load a PDF into PDFNestly Studio
            </h2>
            <p className="text-sm text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
              Upload your document to access full-page editing, text annotations, in-place text modification, shapes, transparent images, and signatures.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] text-white font-semibold text-sm transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Upload PDF Document</span>
            </button>
            <button
              type="button"
              onClick={handleLoadSample}
              className="w-full sm:w-auto px-6 py-3 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-zinc-50 dark:hover:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] font-medium text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Load 4-Page Sample Contract</span>
            </button>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 text-xs text-[#B91C1C] dark:text-[#EF4444] pt-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Preparing document workspace...</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] flex flex-col bg-[#F4F4F5] dark:bg-[#09090B] text-[#18181B] dark:text-[#FAFAFA]">
      {/* Hidden file input for Replace PDF */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleReplaceDocument}
      />

      {/* Hidden file input for Image tool */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleImageFileSelect}
      />

      {/* ZONE A: Compact Top Application Bar */}
      <header className="h-14 bg-white dark:bg-[#18181B] border-b border-[#E4E4E7] dark:border-[#3F3F46] px-4 flex items-center justify-between gap-4 shrink-0 z-30">
        {/* Left: Studio Branding & File Info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <PdfNestlyMark size={22} />
            <span className="font-bold text-sm tracking-tight hidden md:inline">
              PDFNestly <span className="text-[#B91C1C] dark:text-[#EF4444]">Studio</span>
            </span>
          </div>

          <div className="h-4 w-px bg-[#E4E4E7] dark:bg-[#3F3F46] hidden sm:block shrink-0" />

          <div className="min-w-0 flex items-center gap-2">
            <span
              className="text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] truncate max-w-[140px] sm:max-w-[220px] md:max-w-[320px]"
              title={fileName}
            >
              {fileName}
            </span>
            <span className="text-[11px] font-mono text-[#71717A] dark:text-[#A1A1AA] shrink-0">
              ({visibleThumbnails.length} pgs)
            </span>
          </div>

          {/* Unsaved Changes Indicator */}
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-medium text-[#71717A] dark:text-[#A1A1AA] shrink-0">
            {hasUnsavedChanges ? (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Unsaved edits ({annotations.length})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                All changes saved
              </span>
            )}
          </div>
        </div>

        {/* Center: History & Zoom Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyIdx === 0}
            className="p-1.5 rounded-lg text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-100 dark:hover:bg-[#27272A] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={historyIdx >= history.length - 1}
            className="p-1.5 rounded-lg text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-100 dark:hover:bg-[#27272A] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-[#E4E4E7] dark:bg-[#3F3F46] mx-1 hidden sm:block" />

          {/* Zoom & Page Fit Controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setZoomPercent((z) => Math.max(30, z - 10));
                setFitMode('custom');
              }}
              className="p-1.5 rounded-lg text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-100 dark:hover:bg-[#27272A] transition-colors"
              title="Zoom Out (-10%)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono font-medium text-[#18181B] dark:text-[#FAFAFA] min-w-11 text-center">
              {zoomPercent}%
            </span>
            <button
              type="button"
              onClick={() => {
                setZoomPercent((z) => Math.min(250, z + 10));
                setFitMode('custom');
              }}
              className="p-1.5 rounded-lg text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-100 dark:hover:bg-[#27272A] transition-colors"
              title="Zoom In (+10%)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            {/* Fit Page Action */}
            <button
              type="button"
              onClick={() => calculateFitZoom('page')}
              className={`px-2 py-1 text-xs font-medium rounded-lg border flex items-center gap-1 transition-colors ${
                fitMode === 'page'
                  ? 'border-[#B91C1C] text-[#B91C1C] dark:text-[#EF4444] bg-red-50 dark:bg-red-950/20'
                  : 'border-[#E4E4E7] dark:border-[#3F3F46] text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-100 dark:hover:bg-[#27272A]'
              }`}
              title="Fit entire page in visible window without scrolling"
            >
              <Maximize2 className="w-3 h-3" />
              <span className="hidden sm:inline">Fit Page</span>
            </button>

            {/* Fit Width Action */}
            <button
              type="button"
              onClick={() => calculateFitZoom('width')}
              className={`px-2 py-1 text-xs font-medium rounded-lg border flex items-center gap-1 transition-colors ${
                fitMode === 'width'
                  ? 'border-[#B91C1C] text-[#B91C1C] dark:text-[#EF4444] bg-red-50 dark:bg-red-950/20'
                  : 'border-[#E4E4E7] dark:border-[#3F3F46] text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-100 dark:hover:bg-[#27272A]'
              }`}
              title="Fit page width to workspace"
            >
              <Sliders className="w-3 h-3" />
              <span className="hidden sm:inline">Fit Width</span>
            </button>
          </div>
        </div>

        {/* Right: Actions & Download Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-zinc-100 dark:hover:bg-[#27272A] text-[#52525B] dark:text-[#D4D4D8] transition-colors hidden sm:inline-flex items-center gap-1.5"
            title="Replace document"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Replace PDF</span>
          </button>

          {/* More Options Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreMenu((prev) => !prev)}
              className="p-1.5 rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-zinc-100 dark:hover:bg-[#27272A] text-[#52525B] dark:text-[#D4D4D8] transition-colors"
              title="More Document Options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMoreMenu && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] shadow-xl p-1.5 text-xs z-50">
                <Link
                  href="/fill-pdf-forms"
                  onClick={() => setShowMoreMenu(false)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-[#27272A] flex items-center gap-2 text-[#18181B] dark:text-[#FAFAFA]"
                >
                  <Sliders className="w-3.5 h-3.5 text-[#B91C1C] dark:text-[#EF4444]" />
                  <span>Interactive AcroForm Inspector</span>
                </Link>
                <Link
                  href="/edit-pdf-text"
                  onClick={() => setShowMoreMenu(false)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-[#27272A] flex items-center gap-2 text-[#18181B] dark:text-[#FAFAFA]"
                >
                  <FileText className="w-3.5 h-3.5 text-[#B91C1C] dark:text-[#EF4444]" />
                  <span>Text Line Replacement Studio</span>
                </Link>
                <Link
                  href="/compress-pdf"
                  onClick={() => setShowMoreMenu(false)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-[#27272A] flex items-center gap-2 text-[#18181B] dark:text-[#FAFAFA]"
                >
                  <FileDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Compress Document Size</span>
                </Link>
                <div className="my-1 border-t border-[#E4E4E7] dark:border-[#3F3F46]" />
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-[#27272A] flex items-center gap-2 text-[#18181B] dark:text-[#FAFAFA]"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Upload & Replace PDF</span>
                </button>
              </div>
            )}
          </div>

          {/* Primary Action: Download PDF */}
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting}
            className="px-4 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#7F1D1D] active:bg-[#7F1D1D] text-white font-semibold text-xs transition-colors shadow-xs flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isExporting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>{isExporting ? 'Exporting...' : 'Download PDF'}</span>
          </button>
        </div>
      </header>

      {/* ZONE B: Dedicated Editing Toolbar */}
      <div className="bg-[#FAFAFA] dark:bg-[#18181B] border-b border-[#E4E4E7] dark:border-[#3F3F46] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 z-20 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Tool: Select */}
          <button
            type="button"
            onClick={() => {
              setActiveTool('select');
              setStatusMessage('Select mode: Click any annotation on the canvas to move or resize.');
            }}
            className={`h-9 sm:h-10 px-3.5 py-2 rounded-xl text-xs sm:text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer ${
              activeTool === 'select'
                ? 'bg-[#B91C1C] text-white shadow-xs font-semibold'
                : 'text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-200 dark:hover:bg-[#27272A]'
            }`}
            title="Select & Move Objects"
          >
            <MousePointer className="w-4 h-4" />
            <span>Select</span>
          </button>

          {/* Tool: Edit Existing Text */}
          <button
            type="button"
            onClick={() => {
              setActiveTool('existing-text');
              setStatusMessage('Edit Existing Text: Detected text lines are highlighted. Click any text line to edit in-place.');
            }}
            className={`h-9 sm:h-10 px-3.5 py-2 rounded-xl text-xs sm:text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer ${
              activeTool === 'existing-text'
                ? 'bg-[#B91C1C] text-white shadow-xs font-semibold'
                : 'text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-200 dark:hover:bg-[#27272A]'
            }`}
            title="Select and edit original PDF text lines"
          >
            <FileText className="w-4 h-4" />
            <span>Edit Existing Text</span>
          </button>

          <div className="h-6 w-px bg-[#E4E4E7] dark:bg-[#3F3F46] mx-1 hidden md:block" />

          {/* Tool: Add Text */}
          <button
            type="button"
            onClick={() => {
              setActiveTool('text');
              setStatusMessage('Add Text: Click anywhere on the PDF page to drop new text.');
            }}
            className={`h-9 sm:h-10 px-3.5 py-2 rounded-xl text-xs sm:text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer ${
              activeTool === 'text'
                ? 'bg-[#B91C1C] text-white shadow-xs font-semibold'
                : 'text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-200 dark:hover:bg-[#27272A]'
            }`}
            title="Add new text overlay"
          >
            <Type className="w-4 h-4" />
            <span>Add Text</span>
          </button>

          {/* Tool: Highlight */}
          <button
            type="button"
            onClick={() => {
              setActiveTool('highlight');
              setStatusMessage('Highlight: Click on the canvas to place a translucent highlight.');
            }}
            className={`h-9 sm:h-10 px-3.5 py-2 rounded-xl text-xs sm:text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer ${
              activeTool === 'highlight'
                ? 'bg-[#B91C1C] text-white shadow-xs font-semibold'
                : 'text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-200 dark:hover:bg-[#27272A]'
            }`}
            title="Highlight Text or Areas"
          >
            <Highlighter className="w-4 h-4" />
            <span>Highlight</span>
          </button>

          {/* Tool: Shapes Group */}
          <div className="h-9 sm:h-10 p-1 bg-zinc-200/70 dark:bg-[#27272A] rounded-xl flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                setActiveTool('shape');
                setActiveShapeType('rectangle');
                setStatusMessage('Shape: Rectangle. Click on page to place.');
              }}
              className={`h-7 sm:h-8 w-7 sm:w-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                activeTool === 'shape' && activeShapeType === 'rectangle'
                  ? 'bg-[#B91C1C] text-white shadow-2xs'
                  : 'text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-white'
              }`}
              title="Rectangle Shape"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTool('shape');
                setActiveShapeType('ellipse');
                setStatusMessage('Shape: Ellipse / Circle. Click on page to place.');
              }}
              className={`h-7 sm:h-8 w-7 sm:w-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                activeTool === 'shape' && activeShapeType === 'ellipse'
                  ? 'bg-[#B91C1C] text-white shadow-2xs'
                  : 'text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-white'
              }`}
              title="Ellipse / Circle Shape"
            >
              <Circle className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTool('shape');
                setActiveShapeType('line');
                setStatusMessage('Shape: Straight Line. Click on page to place.');
              }}
              className={`h-7 sm:h-8 w-7 sm:w-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                activeTool === 'shape' && activeShapeType === 'line'
                  ? 'bg-[#B91C1C] text-white shadow-2xs'
                  : 'text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-white'
              }`}
              title="Straight Line"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTool('shape');
                setActiveShapeType('arrow');
                setStatusMessage('Shape: Arrow. Click on page to place.');
              }}
              className={`h-7 sm:h-8 w-7 sm:w-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                activeTool === 'shape' && activeShapeType === 'arrow'
                  ? 'bg-[#B91C1C] text-white shadow-2xs'
                  : 'text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-white'
              }`}
              title="Arrow"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tool: Image */}
          <button
            type="button"
            onClick={() => {
              setActiveTool('image');
              setIsInspectorOpen(true);
              if (!pendingImageUrl) {
                imageInputRef.current?.click();
              } else {
                setStatusMessage('Click on the PDF page or click "Place at Center" to place your image.');
              }
            }}
            className={`h-9 sm:h-10 px-3.5 py-2 rounded-xl text-xs sm:text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer ${
              activeTool === 'image'
                ? 'bg-[#B91C1C] text-white shadow-xs font-semibold'
                : 'text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-200 dark:hover:bg-[#27272A]'
            }`}
            title="Insert PNG, JPG, or WebP image"
          >
            <ImageIcon className="w-4 h-4" />
            <span>Image</span>
          </button>

          {/* Tool: Signature */}
          <button
            type="button"
            onClick={() => {
              setActiveTool('signature');
              setShowSignaturePad(true);
            }}
            className={`h-9 sm:h-10 px-3.5 py-2 rounded-xl text-xs sm:text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer ${
              activeTool === 'signature'
                ? 'bg-[#B91C1C] text-white shadow-xs font-semibold'
                : 'text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-200 dark:hover:bg-[#27272A]'
            }`}
            title="Place electronic signature"
          >
            <PenTool className="w-4 h-4" />
            <span>Signature</span>
          </button>

          {/* Tool: Stamp */}
          <button
            type="button"
            onClick={() => {
              setActiveTool('stamp');
              setStatusMessage('Stamp: Click on page to stamp document.');
            }}
            className={`h-9 sm:h-10 px-3.5 py-2 rounded-xl text-xs sm:text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer ${
              activeTool === 'stamp'
                ? 'bg-[#B91C1C] text-white shadow-xs font-semibold'
                : 'text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-200 dark:hover:bg-[#27272A]'
            }`}
            title="Place status stamp"
          >
            <Stamp className="w-4 h-4" />
            <span>Stamp</span>
          </button>

          {/* Tool: Redact */}
          <button
            type="button"
            onClick={() => {
              setActiveTool('redact');
              setStatusMessage('Permanent Redact: Place blackout box. Content stream is permanently destroyed on export.');
            }}
            className={`h-9 sm:h-10 px-3.5 py-2 rounded-xl text-xs sm:text-[13px] font-medium flex items-center gap-2 transition-colors cursor-pointer ${
              activeTool === 'redact'
                ? 'bg-[#B91C1C] text-white shadow-xs font-semibold'
                : 'text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-200 dark:hover:bg-[#27272A]'
            }`}
            title="Permanent Blackout Redaction"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Redact</span>
          </button>
        </div>

        {/* Page Actions: Rotate & Delete */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleRotatePage(activePage)}
            className="h-9 sm:h-10 px-3.5 py-2 rounded-xl text-xs sm:text-[13px] font-medium border border-[#E4E4E7] dark:border-[#3F3F46] text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-100 dark:hover:bg-[#27272A] flex items-center gap-2 transition-colors cursor-pointer"
            title="Rotate active page clockwise 90°"
          >
            <RotateCw className="w-4 h-4" />
            <span className="hidden sm:inline">Rotate Page</span>
          </button>

          <button
            type="button"
            onClick={() => handleDeletePage(activePage)}
            className="h-9 sm:h-10 px-3.5 py-2 rounded-xl text-xs sm:text-[13px] font-medium border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 transition-colors cursor-pointer"
            title="Delete active page"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Delete Page</span>
          </button>
        </div>
      </div>

      {/* ZONE C, D, E: Main Three-Column Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ZONE C: Collapsible Left Page Navigation Sidebar */}
        <aside
          className={`bg-white dark:bg-[#18181B] border-r border-[#E4E4E7] dark:border-[#3F3F46] flex flex-col shrink-0 transition-all duration-200 z-10 ${
            isSidebarOpen ? 'w-52 sm:w-60' : 'w-10'
          }`}
        >
          <div className="h-10 px-3 border-b border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-between">
            {isSidebarOpen && (
              <span className="text-xs font-semibold uppercase tracking-wider text-[#71717A] dark:text-[#A1A1AA]">
                Pages ({visibleThumbnails.length})
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="p-1 rounded text-[#71717A] hover:text-[#18181B] dark:hover:text-[#FAFAFA]"
              title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          {isSidebarOpen && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {visibleThumbnails.map((thumb) => {
                const isActive = thumb.pageNumber === activePage;
                const rot = extraRotations[thumb.pageNumber] || 0;
                return (
                  <div
                    key={thumb.pageNumber}
                    onClick={() => setActivePage(thumb.pageNumber)}
                    className={`group relative p-2 rounded-xl border transition-all cursor-pointer ${
                      isActive
                        ? 'border-[#B91C1C] dark:border-[#EF4444] bg-[#FEF2F2] dark:bg-[#B91C1C]/10 shadow-xs'
                        : 'border-[#E4E4E7] dark:border-[#3F3F46] hover:border-zinc-400 bg-[#FAFAFA] dark:bg-[#27272A]'
                    }`}
                  >
                    <div className="aspect-[1/1.414] bg-white rounded-lg overflow-hidden border border-zinc-200 flex items-center justify-center relative">
                      {thumb.dataUrl ? (
                        <img
                          src={thumb.dataUrl}
                          alt={`Page ${thumb.pageNumber}`}
                          style={{ transform: `rotate(${rot}deg)` }}
                          className="w-full h-full object-contain transition-transform"
                        />
                      ) : (
                        <span className="text-xs text-zinc-400 font-mono">P.{thumb.pageNumber}</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-1.5 text-xs">
                      <span className={`font-semibold ${isActive ? 'text-[#B91C1C] dark:text-[#EF4444]' : 'text-[#71717A]'}`}>
                        Page {thumb.pageNumber}
                      </span>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRotatePage(thumb.pageNumber);
                          }}
                          className="p-1 hover:text-[#B91C1C]"
                          title="Rotate +90°"
                        >
                          <RotateCw className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePage(thumb.pageNumber);
                          }}
                          className="p-1 hover:text-red-600"
                          title="Delete page"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        {/* ZONE D: Large Central PDF Canvas */}
        <main
          ref={mainContainerRef}
          className="flex-1 overflow-auto p-4 sm:p-8 flex flex-col items-center justify-start min-w-0 bg-zinc-100/60 dark:bg-[#0E0E10] transition-colors"
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
        >
          {/* Status Toast / Banner */}
          {statusMessage && (
            <div className="mb-4 px-4 py-2 rounded-xl bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] shadow-sm text-xs flex items-center justify-between gap-4 max-w-xl w-full">
              <span className="text-[#52525B] dark:text-[#D4D4D8]">{statusMessage}</span>
              <button
                type="button"
                onClick={() => setStatusMessage('')}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {renderError && (
            <div className="mb-4 px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 shadow-sm text-xs flex items-center justify-between gap-4 max-w-xl w-full">
              <span>{renderError}</span>
              <button
                type="button"
                onClick={renderCurrentPage}
                className="px-2 py-1 bg-red-600 text-white rounded font-medium hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 shadow-sm text-xs flex items-center justify-between gap-4 max-w-xl w-full">
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage('')}
                className="text-red-400 hover:text-red-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Rendered PDF Sheet Container */}
          <div
            ref={canvasRef}
            onClick={handleCanvasClick}
            style={{
              width: `${Math.round(pageDimensions.width * (zoomPercent / 100))}px`,
              aspectRatio: `${pageDimensions.width} / ${pageDimensions.height}`,
            }}
            className={`relative bg-white shadow-2xl rounded-xs select-none transition-transform shrink-0 ${
              activeTool !== 'select' ? 'cursor-crosshair' : 'cursor-default'
            }`}
          >
            {/* Background Rendered PDF Canvas Image */}
            {pageRenderUrl ? (
              <img
                src={pageRenderUrl}
                alt={`PDF Page ${activePage}`}
                className="w-full h-full object-contain pointer-events-none select-none block"
              />
            ) : null}

            {/* Loading / Rendering Overlay */}
            {isRenderingPage && (
              <div className="absolute inset-0 bg-white/70 dark:bg-black/60 backdrop-blur-2xs flex flex-col items-center justify-center gap-2 z-30">
                <RefreshCw className="w-7 h-7 text-[#B91C1C] animate-spin" />
                <span className="text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                  Rendering Page {activePage}...
                </span>
              </div>
            )}

            {/* Existing Text Mode: Interactive Bounding Boxes */}
            {activeTool === 'existing-text' && (
              <div className="absolute inset-0 pointer-events-none">
                {activePageDetectedLines.map((line, idx) => {
                  const isSelected = selectedTextLine?.text === line.text && selectedTextLine?.yPercent === line.yPercent;
                  return (
                    <div
                      key={`line_${idx}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectTextLine(line);
                      }}
                      style={{
                        left: `${line.xPercent}%`,
                        top: `${line.yPercent}%`,
                        width: `${line.widthPercent}%`,
                        height: `${line.heightPercent}%`,
                      }}
                      className={`absolute pointer-events-auto cursor-pointer rounded-xs transition-all ${
                        isSelected
                          ? 'border-2 border-[#B91C1C] bg-[#B91C1C]/15 ring-2 ring-[#B91C1C]/30'
                          : 'border border-dashed border-blue-500/50 hover:border-blue-600 hover:bg-blue-500/10'
                      }`}
                      title={`Click to edit: "${line.text}"`}
                    />
                  );
                })}
              </div>
            )}

            {/* User Annotation Items on Active Page */}
            {pageAnnotations.map((item) => {
              const isSelected = item.id === selectedId;

              return (
                <div
                  key={item.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(item.id);
                    setSelectedTextLine(null);
                    setIsInspectorOpen(true);
                  }}
                  onMouseDown={(e) => {
                    if (activeTool === 'select') {
                      e.stopPropagation();
                      setSelectedId(item.id);
                      setDraggingId(item.id);
                      const rect = canvasRef.current?.getBoundingClientRect();
                      if (rect) {
                        const mXPct = ((e.clientX - rect.left) / rect.width) * 100;
                        const mYPct = ((e.clientY - rect.top) / rect.height) * 100;
                        setDragOffset({ dxPct: mXPct - item.xPercent, dyPct: mYPct - item.yPercent });
                      }
                    }
                  }}
                  style={{
                    left: `${item.xPercent}%`,
                    top: `${item.yPercent}%`,
                    width: `${item.widthPercent}%`,
                    height: `${item.heightPercent}%`,
                  }}
                  className={`absolute group cursor-move select-none ${
                    isSelected ? 'ring-2 ring-[#B91C1C] z-20' : 'hover:ring-1 hover:ring-zinc-400 z-10'
                  }`}
                >
                  {/* Content by Type */}
                  {item.type === 'text' && (
                    <div
                      style={{
                        color: item.colorHex || '#18181B',
                        fontSize: `${item.fontSize || 14}px`,
                        fontFamily: item.fontFamily || 'Helvetica, sans-serif',
                        opacity: item.opacity ?? 1,
                        backgroundColor: item.isExistingTextEdit ? item.backgroundColorHex || '#FFFFFF' : 'transparent',
                      }}
                      className="w-full h-full flex items-center overflow-hidden font-medium leading-tight px-1"
                    >
                      {item.text || 'Text'}
                    </div>
                  )}

                  {item.type === 'highlight' && (
                    <div
                      style={{
                        backgroundColor: item.colorHex || '#FBBF24',
                        opacity: item.opacity ?? 0.35,
                      }}
                      className="w-full h-full rounded-xs"
                    />
                  )}

                  {item.type === 'shape' && (
                    <div className="w-full h-full flex items-center justify-center">
                      {item.shapeType === 'ellipse' ? (
                        <div
                          style={{
                            borderColor: item.strokeColorHex || '#B91C1C',
                            borderWidth: `${item.strokeWidth || 2}px`,
                            backgroundColor: item.fillColorHex !== 'transparent' ? item.fillColorHex : 'transparent',
                            opacity: item.opacity ?? 1,
                          }}
                          className="w-full h-full rounded-full border"
                        />
                      ) : item.shapeType === 'line' ? (
                        <div
                          style={{
                            backgroundColor: item.strokeColorHex || '#B91C1C',
                            height: `${item.strokeWidth || 2}px`,
                            opacity: item.opacity ?? 1,
                          }}
                          className="w-full"
                        />
                      ) : item.shapeType === 'arrow' ? (
                        <div
                          style={{
                            borderColor: item.strokeColorHex || '#B91C1C',
                            borderTopWidth: `${item.strokeWidth || 2}px`,
                            opacity: item.opacity ?? 1,
                          }}
                          className="w-full h-0 relative"
                        >
                          <div
                            style={{
                              borderTopColor: item.strokeColorHex || '#B91C1C',
                              borderRightColor: item.strokeColorHex || '#B91C1C',
                              width: '8px',
                              height: '8px',
                            }}
                            className="absolute right-0 top-[-4px] border-t-2 border-r-2 transform rotate-45"
                          />
                        </div>
                      ) : (
                        <div
                          style={{
                            borderColor: item.strokeColorHex || '#B91C1C',
                            borderWidth: `${item.strokeWidth || 2}px`,
                            backgroundColor: item.fillColorHex !== 'transparent' ? item.fillColorHex : 'transparent',
                            opacity: item.opacity ?? 1,
                          }}
                          className={`w-full h-full border ${item.shapeType === 'rounded-rect' ? 'rounded-xl' : 'rounded-xs'}`}
                        />
                      )}
                    </div>
                  )}

                  {item.type === 'comment' && (
                    <div className="w-full h-full bg-amber-50 border border-amber-300 rounded-lg p-2 text-xs text-amber-900 shadow-sm overflow-hidden flex items-start gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span className="truncate">{item.text || 'Note'}</span>
                    </div>
                  )}

                  {item.type === 'stamp' && (
                    <div
                      style={{
                        borderColor: item.colorHex || '#059669',
                        color: item.colorHex || '#059669',
                        opacity: item.opacity ?? 0.85,
                      }}
                      className="w-full h-full border-2 rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-wider bg-white/70 shadow-xs"
                    >
                      {item.text || 'APPROVED'}
                    </div>
                  )}

                  {item.type === 'watermark' && (
                    <div
                      style={{
                        color: item.colorHex || '#B91C1C',
                        opacity: item.opacity ?? 0.22,
                        fontSize: `${item.fontSize || 42}px`,
                      }}
                      className="w-full h-full flex items-center justify-center font-black uppercase tracking-widest transform rotate-[-25deg] select-none"
                    >
                      {item.text || 'CONFIDENTIAL'}
                    </div>
                  )}

                  {item.type === 'redact' && (
                    <div className="w-full h-full bg-black rounded-xs shadow-xs" />
                  )}

                  {(item.type === 'image' || item.type === 'signature') && item.imageDataUrl && (
                    <img
                      src={item.imageDataUrl}
                      alt={item.type}
                      style={{ opacity: item.opacity ?? 1 }}
                      className="w-full h-full object-contain pointer-events-none select-none"
                    />
                  )}

                  {/* Resize Handles (Active when selected) */}
                  {isSelected && (
                    <>
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingId(item.id);
                          setResizeHandle('se');
                        }}
                        className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-[#B91C1C] rounded-full cursor-se-resize shadow-xs"
                      />
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingId(item.id);
                          setResizeHandle('ne');
                        }}
                        className="absolute -right-1.5 -top-1.5 w-3 h-3 bg-[#B91C1C] rounded-full cursor-ne-resize shadow-xs"
                      />
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingId(item.id);
                          setResizeHandle('sw');
                        }}
                        className="absolute -left-1.5 -bottom-1.5 w-3 h-3 bg-[#B91C1C] rounded-full cursor-sw-resize shadow-xs"
                      />
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingId(item.id);
                          setResizeHandle('nw');
                        }}
                        className="absolute -left-1.5 -top-1.5 w-3 h-3 bg-[#B91C1C] rounded-full cursor-nw-resize shadow-xs"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </main>

        {/* ZONE E: Contextual Right-Side Inspector */}
        <aside
          className={`bg-white dark:bg-[#18181B] border-l border-[#E4E4E7] dark:border-[#3F3F46] flex flex-col shrink-0 transition-all duration-200 z-10 ${
            isInspectorOpen ? 'w-64 sm:w-72' : 'w-10'
          }`}
        >
          <div className="h-10 px-3 border-b border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsInspectorOpen((prev) => !prev)}
              className="p-1 rounded text-[#71717A] hover:text-[#18181B] dark:hover:text-[#FAFAFA]"
              title={isInspectorOpen ? 'Collapse inspector' : 'Expand inspector'}
            >
              {isInspectorOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            {isInspectorOpen && (
              <span className="text-xs font-semibold uppercase tracking-wider text-[#71717A] dark:text-[#A1A1AA]">
                {selectedTextLine
                  ? 'Edit Existing Text'
                  : selectedAnnotation
                  ? `${selectedAnnotation.type.toUpperCase()} Properties`
                  : 'Inspector'}
              </span>
            )}
          </div>

          {isInspectorOpen && (
            <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
              {/* Case 1: Existing PDF Text Line Selected */}
              {selectedTextLine ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-400">
                      Detected Original Text:
                    </span>
                    <p className="font-mono text-xs text-[#18181B] dark:text-[#FAFAFA] break-words">
                      "{selectedTextLine.text}"
                    </p>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1">
                      Replacement Text:
                    </label>
                    <textarea
                      id="existing-text-replacement-input"
                      defaultValue={selectedTextLine.text}
                      rows={3}
                      className="w-full p-2.5 rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] font-sans"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const el = document.getElementById('existing-text-replacement-input') as HTMLTextAreaElement;
                        handleApplyExistingTextReplacement(el.value, '#18181B', selectedTextLine.fontSize);
                      }}
                      className="flex-1 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#7F1D1D] text-white font-semibold text-xs shadow-xs"
                    >
                      Apply In-Place Edit
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteExistingTextLine}
                      className="px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium"
                      title="Erase this text line"
                    >
                      Remove
                    </button>
                  </div>

                  <p className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed">
                    Applies in-place coordinate replacement preserving surrounding vector graphics and page dimensions.
                  </p>
                </div>
              ) : selectedAnnotation ? (
                /* Case 2: User-Created Annotation Selected */
                <div className="space-y-4">
                  {/* Text Edit Content */}
                  {(selectedAnnotation.type === 'text' ||
                    selectedAnnotation.type === 'comment' ||
                    selectedAnnotation.type === 'watermark' ||
                    selectedAnnotation.type === 'stamp') && (
                    <div>
                      <label className="block font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1">
                        Content:
                      </label>
                      <textarea
                        value={selectedAnnotation.text || ''}
                        onChange={(e) => updateSelectedAnnotation({ text: e.target.value })}
                        rows={2}
                        className="w-full p-2 rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA]"
                      />
                    </div>
                  )}

                  {/* Font Size */}
                  {selectedAnnotation.type === 'text' && (
                    <div>
                      <label className="block font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1">
                        Font Size: {selectedAnnotation.fontSize || 14}px
                      </label>
                      <input
                        type="range"
                        min="9"
                        max="64"
                        value={selectedAnnotation.fontSize || 14}
                        onChange={(e) => updateSelectedAnnotation({ fontSize: Number(e.target.value) })}
                        className="w-full accent-[#B91C1C]"
                      />
                    </div>
                  )}

                  {/* Color Selector */}
                  <div>
                    <label className="block font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1">
                      Color:
                    </label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {['#18181B', '#B91C1C', '#1D4ED8', '#059669', '#D97706', '#7C3AED', '#FFFFFF'].map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => {
                            if (selectedAnnotation.type === 'shape') {
                              updateSelectedAnnotation({ strokeColorHex: hex });
                            } else {
                              updateSelectedAnnotation({ colorHex: hex });
                            }
                          }}
                          style={{ backgroundColor: hex }}
                          className={`w-6 h-6 rounded-full border border-zinc-300 shadow-2xs ${
                            selectedAnnotation.colorHex === hex || selectedAnnotation.strokeColorHex === hex
                              ? 'ring-2 ring-[#B91C1C] ring-offset-1'
                              : ''
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Shape Fill Color (if Shape selected) */}
                  {selectedAnnotation.type === 'shape' && (
                    <div>
                      <label className="block font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1">
                        Fill Color:
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateSelectedAnnotation({ fillColorHex: 'transparent' })}
                          className={`px-2 py-1 rounded text-[11px] font-medium border ${
                            selectedAnnotation.fillColorHex === 'transparent' || !selectedAnnotation.fillColorHex
                              ? 'border-[#B91C1C] text-[#B91C1C]'
                              : 'border-zinc-300 text-zinc-600'
                          }`}
                        >
                          Transparent
                        </button>
                        {['#FEF2F2', '#EFF6FF', '#ECFDF5', '#FFFBEB', '#000000'].map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => updateSelectedAnnotation({ fillColorHex: hex })}
                            style={{ backgroundColor: hex }}
                            className={`w-5 h-5 rounded-md border border-zinc-300 ${
                              selectedAnnotation.fillColorHex === hex ? 'ring-2 ring-[#B91C1C]' : ''
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Image Properties (if Image selected) */}
                  {selectedAnnotation.type === 'image' && (
                    <div className="space-y-3 p-3 rounded-xl bg-zinc-50 dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46]">
                      <span className="font-semibold text-xs text-[#18181B] dark:text-[#FAFAFA] block">
                        Placed Image
                      </span>
                      {selectedAnnotation.imageDataUrl && (
                        <div className="aspect-video bg-white dark:bg-black rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden flex items-center justify-center p-1">
                          <img
                            src={selectedAnnotation.imageDataUrl}
                            alt="Selected annotation"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      )}
                      <label className="flex items-center gap-2 cursor-pointer pt-1 text-xs text-[#18181B] dark:text-[#FAFAFA]">
                        <input
                          type="checkbox"
                          checked={selectedAnnotation.aspectRatioLocked ?? true}
                          onChange={(e) =>
                            updateSelectedAnnotation({ aspectRatioLocked: e.target.checked })
                          }
                          className="rounded text-[#B91C1C] focus:ring-[#B91C1C]"
                        />
                        <span>Lock Aspect Ratio</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="w-full py-1.5 px-2 rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-center"
                      >
                        Replace Image
                      </button>
                    </div>
                  )}

                  {/* Opacity */}
                  <div>
                    <label className="block font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1">
                      Opacity: {Math.round((selectedAnnotation.opacity ?? 1) * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={selectedAnnotation.opacity ?? 1}
                      onChange={(e) => updateSelectedAnnotation({ opacity: Number(e.target.value) })}
                      className="w-full accent-[#B91C1C]"
                    />
                  </div>

                  {/* Duplicate & Delete Actions */}
                  <div className="pt-2 border-t border-[#E4E4E7] dark:border-[#3F3F46] flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDuplicateSelected}
                      className="flex-1 py-1.5 px-3 rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-zinc-100 dark:hover:bg-[#27272A] font-medium flex items-center justify-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Duplicate</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      className="py-1.5 px-3 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 font-medium flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Case 3: No Object Selected -> Tool Overview */
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] space-y-1">
                    <span className="font-bold text-[#18181B] dark:text-[#FAFAFA] block">Active Tool:</span>
                    <span className="capitalize text-[#B91C1C] dark:text-[#EF4444] font-semibold">
                      {activeTool}
                    </span>
                    <p className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] pt-1">
                      Click anywhere on the document canvas to place an element, or switch to Select mode to move objects.
                    </p>
                  </div>

                  {/* Comprehensive Image Staging workflow if Image tool is active */}
                  {activeTool === 'image' && (
                    <div className="space-y-3 p-4 rounded-xl border border-dashed border-[#B91C1C]/40 bg-[#FEF2F2] dark:bg-[#B91C1C]/10 text-center">
                      <div className="w-10 h-10 mx-auto rounded-full bg-red-100 dark:bg-red-950/60 text-[#B91C1C] dark:text-[#EF4444] flex items-center justify-center">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                      <span className="font-bold text-xs block text-[#18181B] dark:text-[#FAFAFA]">
                        Image Insertion
                      </span>
                      <p className="text-[11px] text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
                        Insert PNG logos (transparency supported), JPEG photos, or WebP graphics into your PDF.
                      </p>

                      {pendingImageUrl ? (
                        <div className="space-y-3 pt-2">
                          <div className="p-2 bg-white dark:bg-black rounded-lg border border-red-200 dark:border-red-900/50">
                            <img
                              src={pendingImageUrl}
                              alt="Staged"
                              className="max-h-28 mx-auto rounded object-contain"
                            />
                            <div className="text-[10px] text-zinc-500 font-mono mt-1">
                              {pendingImageSize.width} × {pendingImageSize.height} px
                            </div>
                          </div>

                          <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-[11px] font-medium">
                            ✓ Ready to place! Click anywhere on the PDF page.
                          </div>

                          <button
                            type="button"
                            onClick={handlePlaceImageAtCenter}
                            className="w-full py-2 bg-[#B91C1C] hover:bg-[#7F1D1D] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                          >
                            Place at Center of Page
                          </button>

                          <button
                            type="button"
                            onClick={() => imageInputRef.current?.click()}
                            className="text-xs text-[#52525B] dark:text-[#D4D4D8] hover:underline block mx-auto"
                          >
                            Choose different image
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3 pt-1">
                          <button
                            type="button"
                            onClick={() => imageInputRef.current?.click()}
                            className="w-full py-2.5 bg-[#B91C1C] hover:bg-[#7F1D1D] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Upload className="w-4 h-4" />
                            <span>Upload Image File</span>
                          </button>
                          <span className="text-[10px] text-[#71717A] dark:text-[#A1A1AA] block">
                            PNG, JPG, or WebP up to 25MB
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stamp selector if Stamp tool */}
                  {activeTool === 'stamp' && (
                    <div className="space-y-2">
                      <label className="block font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                        Stamp Text:
                      </label>
                      <select
                        value={stampPreset}
                        onChange={(e) => setStampPreset(e.target.value)}
                        className="w-full p-2 rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-xs font-medium"
                      >
                        {['APPROVED', 'CONFIDENTIAL', 'DRAFT', 'URGENT', 'RECEIVED', 'VOID', 'PAID'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="pt-2 border-t border-[#E4E4E7] dark:border-[#3F3F46] text-[11px] text-[#71717A] dark:text-[#A1A1AA] space-y-1">
                    <p>• Press <strong>Ctrl+Z</strong> to undo</p>
                    <p>• Press <strong>Ctrl+Y</strong> to redo</p>
                    <p>• Press <strong>Delete</strong> to remove object</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Signature Pad Modal Drawer */}
      {showSignaturePad && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E7] dark:border-[#3F3F46]">
              <div className="flex items-center gap-2">
                <PenTool className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444]" />
                <h3 className="font-bold text-base text-[#18181B] dark:text-[#FAFAFA]">
                  Create Your Signature
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSignaturePad(false)}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <SignatureBuilder
              onSignatureCreated={(dataUrl) => {
                const newId = `sig_${Date.now()}`;
                const sigItem: EditorAnnotationItem = {
                  id: newId,
                  pageNumber: activePage,
                  type: 'signature',
                  xPercent: 35,
                  yPercent: 75,
                  widthPercent: 24,
                  heightPercent: 7,
                  imageDataUrl: dataUrl,
                  opacity: 1,
                };
                pushAnnotationsState([...annotations, sigItem]);
                setSelectedId(newId);
                setShowSignaturePad(false);
                setActiveTool('select');
                setStatusMessage('Placed signature on document. Drag to position.');
              }}
            />
          </div>
        </div>
      )}

      {/* Delete Page / Document Reset Confirmation Modal */}
      {confirmDeleteModal && confirmDeleteModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
                  {confirmDeleteModal.isOnlyPage
                    ? 'Cannot Delete the Only Page'
                    : `Delete Page ${confirmDeleteModal.pageNum}?`}
                </h3>
                <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
                  {confirmDeleteModal.isOnlyPage
                    ? 'A valid PDF document must contain at least one page. If you want to start over or work on a different file, you can close this document or replace it.'
                    : `Are you sure you want to delete Page ${confirmDeleteModal.pageNum}? The remaining ${visibleThumbnails.length - 1} page(s) will be preserved in your document.`}
                </p>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
              {confirmDeleteModal.isOnlyPage ? (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteModal(null)}
                    className="px-3.5 py-2 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] text-xs font-semibold text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-100 dark:hover:bg-[#27272A] cursor-pointer"
                  >
                    Keep Current PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteModal(null);
                      fileInputRef.current?.click();
                    }}
                    className="px-3.5 py-2 rounded-xl border border-[#B91C1C] text-[#B91C1C] dark:text-[#EF4444] text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                  >
                    Replace PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseAndRemoveDocument}
                    className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    Close & Remove Document
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteModal(null)}
                    className="px-4 py-2 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] text-xs font-semibold text-[#52525B] dark:text-[#D4D4D8] hover:bg-zinc-100 dark:hover:bg-[#27272A] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeletePage}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    Delete Page
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PdfEditorWorkspace;
