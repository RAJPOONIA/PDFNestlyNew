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
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough as StrikethroughIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Move,
  Crop,
  Hand,
  Search,
  Save,
  GripVertical,
  Scissors,
  FilePlus2,
  CheckSquare,
  ListFilter,
  Share2,
  Pin,
  ChevronDown,
  Check,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from 'lucide-react';
import {
  EditorAnnotationItem,
  PageThumbnailInfo,
  CandidateFormField,
  renderPdfThumbnails,
  renderSinglePageDataUrl,
  applyEditorAnnotationsToPdf,
  stripEditedTextFromPdfBytes,
  extractPdfTextAndLines,
  insertBlankPageIntoPdf,
  extractPagesFromPdf,
  detectCandidateFormFields,
} from '@/lib/pdf-engine-client';
import { generateSamplePdfBytes } from '@/lib/sample-pdf';
import { formatFileSize, validateFileHeader, toPdfBlob } from '@/lib/pdf-utils';
import { loadCurrentDocument, storeCurrentDocument, clearCurrentDocument } from '@/lib/document-store';
import { SignatureBuilder } from './SignatureBuilder';
import { PdfNestlyMark } from './Logo';
import { trackPdfActivity, createClientJobId } from '@/lib/activity-client';

export type EditorToolMode =
  | 'select'
  | 'pan'
  | 'existing-text'
  | 'text'
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'shape'
  | 'comment'
  | 'stamp'
  | 'watermark'
  | 'signature'
  | 'redact'
  | 'image'
  | 'crop'
  | 'form-text'
  | 'form-multiline'
  | 'form-dropdown'
  | 'form-radio'
  | 'form-checkbox'
  | 'form-signature'
  | 'symbol-check'
  | 'symbol-cross'
  | 'symbol-dot'
  | 'symbol-circle'
  | 'symbol-checkbox';

export type ShapeType = 'rectangle' | 'rounded-rect' | 'ellipse' | 'line' | 'arrow';

export interface CropBoxPercent {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

interface DetectedTextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  pageNumber: number;
  pageWidthPt: number;
  pageHeightPt: number;
  fontFamily: 'Helvetica' | 'TimesRoman' | 'Courier';
  isBold: boolean;
  isItalic: boolean;
  colorHex: string;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

interface EditorSnapshot {
  annotations: EditorAnnotationItem[];
  extraRotations: Record<number, number>;
  deletedPages: number[];
  pageCrops: Record<number, CropBoxPercent>;
  pageSequence: number[];
}

interface PdfEditorWorkspaceProps {
  initialPdfBytes?: Uint8Array | null;
  initialFileName?: string;
  defaultTool?: EditorToolMode;
}

function roundPct(val: number): number {
  return Math.round(val * 100) / 100;
}

function getCssFontFamily(fontFamily?: string): string {
  if (fontFamily === 'TimesRoman') return 'Georgia, "Times New Roman", Times, serif';
  if (fontFamily === 'Courier') return '"Courier New", Courier, monospace';
  return 'Inter, Helvetica, Arial, sans-serif';
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
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }>({ width: 612, height: 792 });
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

  // Unified History state covering annotations + page operations
  const [history, setHistory] = useState<EditorSnapshot[]>([
    {
      annotations: [],
      extraRotations: {},
      deletedPages: [],
      pageCrops: {},
      pageSequence: [],
    },
  ]);
  const [historyIdx, setHistoryIdx] = useState<number>(0);
  const [savedIdx, setSavedIdx] = useState<number>(0);
  const [exportedIdx, setExportedIdx] = useState<number | null>(null);

  const currentSnapshot = history[historyIdx] || {
    annotations: [],
    extraRotations: {},
    deletedPages: [],
    pageCrops: {},
    pageSequence: [],
  };
  const annotations = currentSnapshot.annotations;
  const extraRotations = currentSnapshot.extraRotations;
  const deletedPages = currentSnapshot.deletedPages;
  const pageCrops = currentSnapshot.pageCrops;
  const pageSequence = currentSnapshot.pageSequence;

  // Selection, in-place text editing & drag state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInitialText, setEditInitialText] = useState<string | null>(null);
  const [hoveredLineIdx, setHoveredLineIdx] = useState<number | null>(null);
  const [selectedTextLine, setSelectedTextLine] = useState<DetectedTextLine | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dxPct: number; dyPct: number }>({ dxPct: 0, dyPct: 0 });

  // Pan tool state
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  // Manual Crop tool state
  const [draftCrop, setDraftCrop] = useState<CropBoxPercent>({
    xPercent: 8,
    yPercent: 8,
    widthPercent: 84,
    heightPercent: 84,
  });
  const [cropAction, setCropAction] = useState<
    | null
    | {
        mode: 'move' | 'resize' | 'draw';
        handle?: string;
        startX: number;
        startY: number;
        initialCrop: CropBoxPercent;
      }
  >(null);

  // Drag-and-drop page reordering state
  const [draggedPagePos, setDraggedPagePos] = useState<number | null>(null);
  const [dragOverPagePos, setDragOverPagePos] = useState<number | null>(null);

  // Find & Replace state
  const [showFindBar, setShowFindBar] = useState<boolean>(false);
  const [findQuery, setFindQuery] = useState<string>('');
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [activeMatchIdx, setActiveMatchIdx] = useState<number>(0);

  // Confirmation Modal state for Delete / Close
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<{
    isOpen: boolean;
    pageNum: number;
    isOnlyPage: boolean;
  } | null>(null);

  // Image & signature staging
  const [pendingImageUrl, setPendingImageUrl] = useState<string>('');
  const [pendingImageSize, setPendingImageSize] = useState<{ width: number; height: number }>({ width: 200, height: 100 });
  const [replacingImageTargetId, setReplacingImageTargetId] = useState<string | null>(null);
  const [replacingSignatureTargetId, setReplacingSignatureTargetId] = useState<string | null>(null);
  const [strippedCanvasIds, setStrippedCanvasIds] = useState<Set<string>>(new Set());
  const [sampledBgColors, setSampledBgColors] = useState<Record<string, string>>({});
  const [stampPreset, setStampPreset] = useState<string>('APPROVED');

  // Tool behavior & Forms state
  const [keepToolActive, setKeepToolActive] = useState<boolean>(false);
  const [showFormsMenu, setShowFormsMenu] = useState<boolean>(false);
  const [formEditMode, setFormEditMode] = useState<boolean>(false);
  const [showTabOrderModal, setShowTabOrderModal] = useState<boolean>(false);
  const [detectedCandidates, setDetectedCandidates] = useState<CandidateFormField[] | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Record<string, boolean>>({});
  const [isDetectingFields, setIsDetectingFields] = useState<boolean>(false);
  const [showShareFormModal, setShowShareFormModal] = useState<boolean>(false);
  const [shareFormTitle, setShareFormTitle] = useState<string>('');
  const [shareFormPin, setShareFormPin] = useState<string>('');
  const [shareFormDays, setShareFormDays] = useState<number>(14);
  const [isCreatingShareLink, setIsCreatingShareLink] = useState<boolean>(false);
  const [createdShareUrl, setCreatedShareUrl] = useState<string>('');
  const [signingFormFieldId, setSigningFormFieldId] = useState<string | null>(null);

  // Status & loading
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState<boolean>(false);
  const [exportedResult, setExportedResult] = useState<{ url: string; fileName: string; byteLength: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mainContainerRef = useRef<HTMLElement>(null);
  const activeEditorInputRef = useRef<HTMLTextAreaElement | null>(null);
  const hasInitialFittedRef = useRef<boolean>(false);

  // Honest Save State calculation
  const hasUnsavedChanges = historyIdx !== savedIdx && historyIdx !== exportedIdx;

  // Ordered visible thumbnails based on pageSequence & deletedPages
  const orderedThumbnails = React.useMemo(() => {
    const seq =
      pageSequence.length > 0
        ? pageSequence
        : thumbnails.map((t) => t.pageNumber);
    const result: Array<{ thumb: PageThumbnailInfo; seqIndex: number }> = [];
    seq.forEach((pNum, idx) => {
      if (deletedPages.includes(pNum)) return;
      const found = thumbnails.find((t) => t.pageNumber === pNum);
      if (found) {
        result.push({ thumb: found, seqIndex: idx });
      }
    });
    return result;
  }, [thumbnails, pageSequence, deletedPages]);

  const visibleThumbnails = React.useMemo(
    () => orderedThumbnails.map((item) => item.thumb),
    [orderedThumbnails]
  );

  // Sync draftCrop when entering crop tool or changing pages
  useEffect(() => {
    if (activeTool === 'crop') {
      const existing = pageCrops[activePage];
      if (existing) {
        setDraftCrop(existing);
      } else {
        setDraftCrop({ xPercent: 8, yPercent: 8, widthPercent: 84, heightPercent: 84 });
      }
    }
  }, [activeTool, activePage, pageCrops]);

  // Focus in-place textarea when editingId becomes active
  useEffect(() => {
    if (editingId && activeEditorInputRef.current) {
      const el = activeEditorInputRef.current;
      el.focus();
    }
  }, [editingId]);

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

  // Push a new snapshot to unified history
  const pushSnapshot = useCallback(
    (partial: Partial<EditorSnapshot>) => {
      setHistory((prev) => {
        const current = prev[historyIdx] || {
          annotations: [],
          extraRotations: {},
          deletedPages: [],
          pageCrops: {},
          pageSequence: [],
        };
        const nextSnap: EditorSnapshot = {
          annotations: partial.annotations !== undefined ? partial.annotations : current.annotations,
          extraRotations: partial.extraRotations !== undefined ? partial.extraRotations : current.extraRotations,
          deletedPages: partial.deletedPages !== undefined ? partial.deletedPages : current.deletedPages,
          pageCrops: partial.pageCrops !== undefined ? partial.pageCrops : current.pageCrops,
          pageSequence: partial.pageSequence !== undefined ? partial.pageSequence : current.pageSequence,
        };
        const sliced = prev.slice(0, historyIdx + 1);
        return [...sliced, nextSnap];
      });
      setHistoryIdx((prev) => prev + 1);
    },
    [historyIdx]
  );

  const pushAnnotationsState = useCallback(
    (nextList: EditorAnnotationItem[]) => {
      pushSnapshot({ annotations: nextList });
    },
    [pushSnapshot]
  );

  const handleUndo = useCallback(() => {
    if (historyIdx > 0) {
      setHistoryIdx((prev) => prev - 1);
      setEditingId(null);
      setSelectedId(null);
      setStatusMessage('Undid last action.');
    }
  }, [historyIdx]);

  const handleRedo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      setHistoryIdx((prev) => prev + 1);
      setEditingId(null);
      setSelectedId(null);
      setStatusMessage('Redid action.');
    }
  }, [historyIdx, history.length]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedId) return;
    const target = annotations.find((a) => a.id === selectedId);
    if (!target) return;

    if (target.isExistingTextEdit) {
      // Deleting an existing text block clears its text so the original PDF text stays removed/masked
      const next = annotations.map((a) => (a.id === selectedId ? { ...a, text: '' } : a));
      pushAnnotationsState(next);
      setEditingId(null);
      setStatusMessage('Removed existing text from page. Click Undo to restore.');
    } else {
      const next = annotations.filter((a) => a.id !== selectedId);
      pushAnnotationsState(next);
      setSelectedId(null);
      setEditingId(null);
      setStatusMessage('Deleted selected object.');
    }
  }, [selectedId, annotations, pushAnnotationsState]);

  // 3. Keyboard shortcuts: Undo (Ctrl+Z), Redo (Ctrl+Y / Ctrl+Shift+Z), Find (Ctrl+F), Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowFindBar((prev) => !prev);
        return;
      }

      if (isInputFocused) {
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
        setEditingId(null);
        setSelectedId(null);
        setSelectedTextLine(null);
        if (activeTool === 'crop') {
          setActiveTool('select');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIdx, history.length, selectedId, activeTool, handleUndo, handleRedo, handleDeleteSelected]);

  // 4. Render thumbnails and extract text whenever pdfBytes changes
  useEffect(() => {
    if (!pdfBytes) return;
    let isCancelled = false;
    setIsLoading(true);

    renderPdfThumbnails(pdfBytes, 0.25)
      .then((thumbs) => {
        if (isCancelled) return;
        setThumbnails(thumbs);
        const initialSeq = thumbs.map((t) => t.pageNumber);
        setHistory((prev) => {
          if (prev.length === 1 && prev[0].pageSequence.length === 0) {
            return [{ ...prev[0], pageSequence: initialSeq }];
          }
          return prev;
        });
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

    // Extract text lines with exact page-relative percentage coordinates
    extractPdfTextAndLines(pdfBytes)
      .then((report) => {
        if (isCancelled) return;
        const mapped: DetectedTextLine[] = report.lines.map((line) => ({
          text: line.text,
          x: line.x,
          y: line.y,
          width: line.width,
          height: line.height,
          fontSize: line.fontSize,
          pageNumber: line.pageNumber,
          pageWidthPt: line.pageWidthPt ?? 612,
          pageHeightPt: line.pageHeightPt ?? 792,
          fontFamily: line.fontFamily ?? 'Helvetica',
          isBold: line.isBold ?? false,
          isItalic: line.isItalic ?? false,
          colorHex: line.colorHex ?? '#0f172a',
          xPercent: line.xPercent ?? 10,
          yPercent: line.yPercent ?? 10,
          widthPercent: line.widthPercent ?? 20,
          heightPercent: line.heightPercent ?? 2.5,
        }));
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
      const availW = Math.max(260, container.clientWidth - 48);
      const availH = Math.max(260, container.clientHeight - 48);

      const scaleW = availW / pageDimensions.width;
      const scaleH = availH / pageDimensions.height;

      let targetZoom: number;
      if (mode === 'width') {
        targetZoom = Math.round(Math.max(30, Math.min(200, scaleW * 100)));
      } else {
        const fitScale = Math.min(scaleW, scaleH);
        targetZoom = Math.round(Math.max(30, Math.min(150, fitScale * 100)));
      }

      setZoomPercent(targetZoom);
      setFitMode(mode);
    },
    [pageDimensions.width, pageDimensions.height]
  );

  // Memoized key for existing text edits on the active page so we only re-strip and re-render
  // the underlying PDF page canvas when an existing text line is activated/removed, not on every keystroke.
  const activePageExistingEdits = React.useMemo(
    () =>
      annotations.filter(
        (a) => a.pageNumber === activePage && a.isExistingTextEdit && Boolean(a.originalText)
      ),
    [annotations, activePage]
  );

  const activePageExistingEditKey = React.useMemo(
    () =>
      activePageExistingEdits
        .map((a) => `${a.id}:${a.originalText}:${a.originXPt ?? ''}:${a.originYPt ?? ''}`)
        .join('|'),
    [activePageExistingEdits]
  );

  // Sample the local background pixel color around a text bounding box on the rendered page image
  // Used only as a non-white fallback when a PDF uses rasterized images where content-stream text stripping cannot apply.
  const sampleLocalBackgroundFromRender = useCallback(
    (
      renderUrl: string,
      xPercent: number,
      yPercent: number,
      widthPercent: number,
      heightPercent: number
    ): Promise<string | null> => {
      return new Promise((resolve) => {
        if (!renderUrl) {
          resolve(null);
          return;
        }
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx || canvas.width <= 0 || canvas.height <= 0) {
              resolve(null);
              return;
            }
            ctx.drawImage(img, 0, 0);
            const xPx = Math.max(1, Math.min(canvas.width - 2, Math.round((xPercent / 100) * canvas.width)));
            const yPx = Math.max(1, Math.min(canvas.height - 2, Math.round((yPercent / 100) * canvas.height)));
            const wPx = Math.max(4, Math.round((widthPercent / 100) * canvas.width));
            const hPx = Math.max(4, Math.round((heightPercent / 100) * canvas.height));

            // Sample perimeter points just outside the text glyphs (top, bottom, left)
            const sampleCoords: Array<[number, number]> = [
              [Math.max(0, xPx - 3), Math.max(0, yPx + Math.floor(hPx / 2))],
              [Math.min(canvas.width - 1, xPx + Math.floor(wPx / 2)), Math.max(0, yPx - 2)],
              [Math.min(canvas.width - 1, xPx + Math.floor(wPx / 2)), Math.min(canvas.height - 1, yPx + hPx + 2)],
            ];

            let rSum = 0;
            let gSum = 0;
            let bSum = 0;
            let count = 0;
            for (const [sx, sy] of sampleCoords) {
              const pixel = ctx.getImageData(sx, sy, 1, 1).data;
              if (pixel[3] > 200) {
                rSum += pixel[0];
                gSum += pixel[1];
                bSum += pixel[2];
                count++;
              }
            }
            if (count === 0) {
              resolve(null);
              return;
            }
            const r = Math.round(rSum / count);
            const g = Math.round(gSum / count);
            const b = Math.round(bSum / count);
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            resolve(hex);
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = renderUrl;
      });
    },
    []
  );

  // 6. Render active page preview whenever page, zoom, extra rotations, or stripped text lines change
  const renderCurrentPage = useCallback(() => {
    if (!pdfBytes) return () => {};
    let active = true;
    setIsRenderingPage(true);
    setRenderError('');

    const baseScale = Math.max(0.6, Math.min(2.5, (zoomPercent / 100) * 1.5));
    const extraRot = extraRotations[activePage] || 0;

    (async () => {
      try {
        let bytesToRender = pdfBytes;
        let newlyStrippedIds = new Set<string>();

        if (activePageExistingEdits.length > 0) {
          const stripRes = await stripEditedTextFromPdfBytes(
            pdfBytes,
            activePageExistingEdits,
            activePage
          );
          bytesToRender = stripRes.bytes;
          newlyStrippedIds = new Set(stripRes.removedIds);
        }

        const res = await renderSinglePageDataUrl(bytesToRender, activePage, baseScale, extraRot);
        if (!active) return;
        setStrippedCanvasIds(newlyStrippedIds);
        setPageRenderUrl(res.dataUrl);
        if (res.unscaledWidthPt && res.unscaledHeightPt) {
          setPageDimensions({ width: res.unscaledWidthPt, height: res.unscaledHeightPt });
        }
        setIsRenderingPage(false);
      } catch (err) {
        if (!active) return;
        setRenderError('Failed to render page: ' + (err as Error).message);
        setIsRenderingPage(false);
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBytes, activePage, zoomPercent, extraRotations, activePageExistingEditKey]);

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

  const handleDuplicateSelected = () => {
    if (!selectedId) return;
    const target = annotations.find((a) => a.id === selectedId);
    if (!target) return;
    const copyItem: EditorAnnotationItem = {
      ...target,
      id: `copy_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      isExistingTextEdit: false,
      xPercent: Math.min(85, roundPct(target.xPercent + 3)),
      yPercent: Math.min(85, roundPct(target.yPercent + 3)),
    };
    pushAnnotationsState([...annotations, copyItem]);
    setSelectedId(copyItem.id);
    setStatusMessage('Duplicated object.');
  };

  // Reset history helper
  const resetEditorHistory = (initialSeq: number[] = []) => {
    setHistory([
      {
        annotations: [],
        extraRotations: {},
        deletedPages: [],
        pageCrops: {},
        pageSequence: initialSeq,
      },
    ]);
    setHistoryIdx(0);
    setSavedIdx(0);
    setExportedIdx(null);
    setSelectedId(null);
    setEditingId(null);
    setSelectedTextLine(null);
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
      resetEditorHistory();
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
      resetEditorHistory();
      setActivePage(1);
      hasInitialFittedRef.current = false;
      setStatusMessage('Loaded 4-page interactive sample contract.');
    } catch (err) {
      setErrorMessage('Failed to generate sample: ' + (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // Image upload handling for Image Insertion OR Replace Image
  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        const offscreen = document.createElement('canvas');
        offscreen.width = Math.max(1, img.naturalWidth);
        offscreen.height = Math.max(1, img.naturalHeight);
        const ctx = offscreen.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const normalizedPng = offscreen.toDataURL('image/png');

          // If replacing an existing image annotation
          if (replacingImageTargetId) {
            const target = annotations.find((a) => a.id === replacingImageTargetId);
            if (target) {
              const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
              const pageAspect = pageDimensions.width / Math.max(1, pageDimensions.height);
              const nextHeightPct = target.aspectRatioLocked
                ? roundPct(Math.min(80, Math.max(4, (target.widthPercent / aspect) * pageAspect)))
                : target.heightPercent;
              const next = annotations.map((a) =>
                a.id === replacingImageTargetId
                  ? { ...a, imageDataUrl: normalizedPng, heightPercent: nextHeightPct }
                  : a
              );
              pushAnnotationsState(next);
              setStatusMessage(`Replaced image with "${file.name}".`);
            }
            setReplacingImageTargetId(null);
            return;
          }

          setPendingImageUrl(normalizedPng);
          setPendingImageSize({ width: img.naturalWidth, height: img.naturalHeight });
          setStatusMessage(
            `Image "${file.name}" ready (${img.naturalWidth}×${img.naturalHeight}px). Click on the PDF page or use "Place at Center".`
          );
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
      xPercent: roundPct(50 - widthPct / 2),
      yPercent: roundPct(40 - heightPct / 2),
      widthPercent: roundPct(widthPct),
      heightPercent: roundPct(heightPct),
      imageDataUrl: pendingImageUrl,
      aspectRatioLocked: true,
      opacity: 1,
      rotationDeg: 0,
    };
    pushAnnotationsState([...annotations, newItem]);
    setSelectedId(newId);
    setActiveTool('select');
    setStatusMessage('Image placed at center of page. Drag to move or use corners to resize.');
  };

  // Activate in-place editing on an existing PDF text line
  const handleActivateExistingTextLine = useCallback(
    (line: DetectedTextLine, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setSelectedTextLine(line);

      // Check if an existing-text annotation already exists for this exact line
      const existingAnnot = annotations.find(
        (a) =>
          a.pageNumber === line.pageNumber &&
          a.isExistingTextEdit &&
          ((a.originXPt !== undefined &&
            a.originYPt !== undefined &&
            Math.abs(a.originXPt - line.x) < 2 &&
            Math.abs(a.originYPt - line.y) < 2) ||
            (a.originalText === line.text &&
              Math.abs((a.originXPercent ?? a.xPercent) - line.xPercent) < 1.5 &&
              Math.abs((a.originYPercent ?? a.yPercent) - line.yPercent) < 1.5))
      );

      if (existingAnnot) {
        setSelectedId(existingAnnot.id);
        setEditInitialText(existingAnnot.text ?? '');
        setEditingId(existingAnnot.id);
        return;
      }

      const newId = `edit_txt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      // Sample local perimeter background color asynchronously in case stream stripping is still rendering
      if (pageRenderUrl) {
        sampleLocalBackgroundFromRender(
          pageRenderUrl,
          line.xPercent,
          line.yPercent,
          line.widthPercent,
          line.heightPercent
        ).then((sampledHex) => {
          if (sampledHex) {
            setSampledBgColors((prev) => ({ ...prev, [newId]: sampledHex }));
          }
        });
      }

      const exactFontSize = Math.max(6, Math.round((line.fontSize || 12) * 10) / 10);
      const newEditItem: EditorAnnotationItem = {
        id: newId,
        pageNumber: line.pageNumber,
        type: 'text',
        isExistingTextEdit: true,
        originalText: line.text,
        text: line.text,
        xPercent: line.xPercent,
        yPercent: line.yPercent,
        widthPercent: Math.max(3.2, roundPct(line.widthPercent + 1.2)),
        heightPercent: Math.max(2.0, roundPct(line.heightPercent + 0.3)),
        originXPt: line.x,
        originYPt: line.y,
        originWidthPt: line.width,
        originHeightPt: line.height,
        originXPercent: line.xPercent,
        originYPercent: line.yPercent,
        originWidthPercent: line.widthPercent,
        originHeightPercent: line.heightPercent,
        fontSize: exactFontSize,
        fontFamily: line.fontFamily || 'Helvetica',
        isBold: line.isBold || false,
        isItalic: line.isItalic || false,
        isUnderline: false,
        isStrikethrough: false,
        textAlign: 'left',
        letterSpacingPt: 0,
        lineHeightMultiplier: 1.15,
        colorHex: line.colorHex || '#0f172a',
        // Never set fillHex: '#ffffff' by default! Original PDF background is preserved via stream stripping.
        fillHex: undefined,
        opacity: 1,
      };

      pushAnnotationsState([...annotations, newEditItem]);
      setSelectedId(newId);
      setEditInitialText(line.text);
      setEditingId(newId);
      setStatusMessage('Editing PDF text in-place (preserving original background). Type directly on canvas, drag to move, or press Esc to cancel.');
    },
    [annotations, pageRenderUrl, pushAnnotationsState, sampleLocalBackgroundFromRender]
  );

  // Detect candidate form fields on the PDF and present for user confirmation
  const handleDetectFormFields = async () => {
    if (!pdfBytes) return;
    setShowFormsMenu(false);
    setIsDetectingFields(true);
    setErrorMessage('');
    try {
      const candidates = await detectCandidateFormFields(pdfBytes);
      setDetectedCandidates(candidates);
      const initialSel: Record<string, boolean> = {};
      candidates.forEach((c) => {
        initialSel[c.id] = true;
      });
      setSelectedCandidateIds(initialSel);
      setStatusMessage(
        candidates.length > 0
          ? `Detected ${candidates.length} candidate form field(s). Review and confirm which fields to add.`
          : 'No automatic form field labels were detected. You can add form fields manually from the Forms menu.'
      );
    } catch (err) {
      setErrorMessage('Failed to scan PDF for form fields: ' + (err as Error).message);
    } finally {
      setIsDetectingFields(false);
    }
  };

  const handleConfirmDetectedFields = () => {
    if (!detectedCandidates) return;
    const chosen = detectedCandidates.filter((c) => selectedCandidateIds[c.id]);
    if (chosen.length === 0) {
      setDetectedCandidates(null);
      return;
    }

    const baseTab = annotations.filter((a) => a.type.startsWith('form-')).length;
    const newFormItems: EditorAnnotationItem[] = chosen.map((c, idx) => ({
      id: `det_form_${Date.now()}_${idx}`,
      pageNumber: c.pageNumber,
      type: c.fieldType,
      xPercent: c.xPercent,
      yPercent: c.yPercent,
      widthPercent: c.widthPercent,
      heightPercent: c.heightPercent,
      fieldName: c.fieldName,
      fieldPlaceholder: c.label,
      fieldValue: c.defaultValue || '',
      defaultValue: c.defaultValue || '',
      checked: Boolean(c.checked),
      dropdownOptions: c.dropdownOptions,
      radioGroupName: c.radioGroupName,
      radioOptionValue: c.radioOptionValue,
      isRequired: Boolean(c.isRequired),
      isMultiline: c.fieldType === 'form-multiline',
      fontSize: 11,
      colorHex: '#0f172a',
      fillHex: c.fieldType === 'form-signature' ? '#fef2f2' : '#f0f9ff',
      strokeColorHex: c.fieldType === 'form-signature' ? '#dc2626' : '#0284c7',
      strokeWidth: 1,
      tabOrder: baseTab + idx + 1,
    }));

    pushAnnotationsState([...annotations, ...newFormItems]);
    setDetectedCandidates(null);
    setFormEditMode(true);
    setActiveTool('select');
    setStatusMessage(`Added ${newFormItems.length} confirmed interactive AcroForm field(s).`);
  };

  // Reorder form field tab order on active page
  const handleMoveTabOrder = (annotationId: string, direction: 'up' | 'down') => {
    const pageForms = annotations
      .filter((a) => a.pageNumber === activePage && a.type.startsWith('form-'))
      .sort((a, b) => (a.tabOrder ?? 999) - (b.tabOrder ?? 999));

    const curIdx = pageForms.findIndex((f) => f.id === annotationId);
    if (curIdx === -1) return;
    const swapIdx = direction === 'up' ? curIdx - 1 : curIdx + 1;
    if (swapIdx < 0 || swapIdx >= pageForms.length) return;

    const reordered = [...pageForms];
    const [moved] = reordered.splice(curIdx, 1);
    reordered.splice(swapIdx, 0, moved);

    const orderMap = new Map<string, number>();
    reordered.forEach((f, i) => orderMap.set(f.id, i + 1));

    const updated = annotations.map((a) =>
      orderMap.has(a.id) ? { ...a, tabOrder: orderMap.get(a.id) } : a
    );
    pushAnnotationsState(updated);
    setStatusMessage('Updated form field Tab navigation order.');
  };

  // Publish & generate shareable Fill & Sign link
  const handleCreateSharedFormLink = async () => {
    if (!pdfBytes) return;
    setIsCreatingShareLink(true);
    setErrorMessage('');
    try {
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < pdfBytes.length; i += chunkSize) {
        binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunkSize));
      }
      const pdfBase64 = btoa(binary);

      const res = await fetch('/api/shared-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: shareFormTitle.trim() || fileName.replace(/\.pdf$/i, ''),
          fileName,
          pdfBase64,
          annotationsJson: JSON.stringify(annotations),
          accessPin: shareFormPin.trim(),
          expiresInDays: shareFormDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not publish shared form.');
      }
      const fullUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${data.sharePath}`
          : data.sharePath;
      setCreatedShareUrl(fullUrl);
      setStatusMessage('Published fillable form! Share the link with recipients to fill and sign.');
    } catch (err) {
      setErrorMessage('Failed to share form: ' + (err as Error).message);
    } finally {
      setIsCreatingShareLink(false);
    }
  };

  // Canvas Click Handler: Places active tool object onto the active page or commits in-place text edit
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    setShowFormsMenu(false);
    setShowMoreMenu(false);

    if (editingId) {
      setEditingId(null);
      setEditInitialText(null);
    }

    if (activeTool === 'select' || activeTool === 'existing-text' || activeTool === 'pan' || activeTool === 'crop') {
      if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvasBg === 'true') {
        setSelectedId(null);
        setSelectedTextLine(null);
      }
      return;
    }
    if (!pdfBytes) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const xPercent = Math.max(0, Math.min(92, roundPct((clickX / rect.width) * 100)));
    const yPercent = Math.max(0, Math.min(92, roundPct((clickY / rect.height) * 100)));

    const newId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nextTabOrder =
      annotations.filter((a) => a.pageNumber === activePage && a.type.startsWith('form-')).length + 1;
    let newItem: EditorAnnotationItem;

    if (activeTool === 'text') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'text',
        xPercent,
        yPercent,
        widthPercent: 26,
        heightPercent: 4.5,
        text: 'Type text here',
        fontSize: 14,
        fontFamily: 'Helvetica',
        isBold: false,
        isItalic: false,
        isUnderline: false,
        isStrikethrough: false,
        textAlign: 'left',
        letterSpacingPt: 0,
        lineHeightMultiplier: 1.2,
        colorHex: '#0f172a',
        opacity: 1,
      };
      pushAnnotationsState([...annotations, newItem]);
      setSelectedId(newId);
      setEditInitialText('Type text here');
      setEditingId(newId);
      if (!keepToolActive) {
        setActiveTool('select');
      }
      setStatusMessage('Added text box. Type directly on the canvas.');
      return;
    } else if (activeTool === 'highlight') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'highlight',
        xPercent,
        yPercent,
        widthPercent: 28,
        heightPercent: 3.5,
        colorHex: '#facc15',
        opacity: 0.4,
      };
    } else if (activeTool === 'underline') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'underline',
        xPercent,
        yPercent,
        widthPercent: 25,
        heightPercent: 2.2,
        colorHex: '#dc2626',
        strokeWidth: 2,
        opacity: 1,
      };
    } else if (activeTool === 'strikethrough') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'strikethrough',
        xPercent,
        yPercent,
        widthPercent: 25,
        heightPercent: 2.2,
        colorHex: '#dc2626',
        strokeWidth: 2,
        opacity: 1,
      };
    } else if (activeTool === 'shape') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: activeShapeType,
        xPercent,
        yPercent,
        widthPercent: 20,
        heightPercent: activeShapeType === 'line' || activeShapeType === 'arrow' ? 2 : 12,
        colorHex: '#dc2626',
        fillHex: '',
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
        widthPercent: 28,
        heightPercent: 8,
        text: 'Review note: Please verify this section.',
        fontSize: 11,
        fontFamily: 'Helvetica',
        colorHex: '#1e293b',
        fillHex: '#fef08a',
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
        heightPercent: 6,
        stampLabel: stampPreset,
        fontSize: 14,
        colorHex:
          stampPreset === 'REJECTED' || stampPreset === 'CONFIDENTIAL'
            ? '#dc2626'
            : stampPreset === 'APPROVED' || stampPreset === 'COMPLETED'
              ? '#16a34a'
              : '#2563eb',
        opacity: 0.9,
      };
    } else if (activeTool === 'watermark') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'watermark',
        xPercent: 25,
        yPercent: 45,
        widthPercent: 50,
        heightPercent: 12,
        text: 'CONFIDENTIAL',
        fontSize: 38,
        colorHex: '#94a3b8',
        opacity: 0.25,
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
    } else if (activeTool === 'signature') {
      if (!pendingImageUrl) {
        setSigningFormFieldId(null);
        setReplacingSignatureTargetId(null);
        setShowSignaturePad(true);
        return;
      }
      const sigAspect = pendingImageSize.width / Math.max(1, pendingImageSize.height);
      const widthPct = 22;
      const pageAspect = pageDimensions.width / Math.max(1, pageDimensions.height);
      const heightPct = Math.min(35, Math.max(4.5, (widthPct / sigAspect) * pageAspect));
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'signature',
        xPercent: Math.max(0, Math.min(100 - widthPct, xPercent)),
        yPercent: Math.max(0, Math.min(100 - heightPct, yPercent)),
        widthPercent: roundPct(widthPct),
        heightPercent: roundPct(heightPct),
        imageDataUrl: pendingImageUrl,
        aspectRatioLocked: true,
        opacity: 1,
        rotationDeg: 0,
      };
    } else if (activeTool === 'image') {
      if (!pendingImageUrl) {
        imageInputRef.current?.click();
        return;
      }
      const aspect = pendingImageSize.width / Math.max(1, pendingImageSize.height);
      const widthPct = 25;
      const pageAspect = pageDimensions.width / Math.max(1, pageDimensions.height);
      const heightPct = Math.min(60, Math.max(5, (widthPct / aspect) * pageAspect));

      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'image',
        xPercent: Math.max(0, Math.min(100 - widthPct, xPercent)),
        yPercent: Math.max(0, Math.min(100 - heightPct, yPercent)),
        widthPercent: roundPct(widthPct),
        heightPercent: roundPct(heightPct),
        imageDataUrl: pendingImageUrl,
        aspectRatioLocked: true,
        opacity: 1,
        rotationDeg: 0,
      };
    } else if (
      activeTool === 'symbol-check' ||
      activeTool === 'symbol-cross' ||
      activeTool === 'symbol-dot' ||
      activeTool === 'symbol-circle' ||
      activeTool === 'symbol-checkbox'
    ) {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: activeTool,
        xPercent,
        yPercent,
        widthPercent: 3.0,
        heightPercent: 2.3,
        colorHex: '#0f172a',
        checked: true,
        opacity: 1,
      };
    } else if (activeTool === 'form-text') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'form-text',
        xPercent,
        yPercent,
        widthPercent: 26,
        heightPercent: 3.6,
        fieldName: `text_field_${nextTabOrder}`,
        fieldPlaceholder: 'Enter text...',
        fieldValue: '',
        defaultValue: '',
        isRequired: false,
        fontSize: 12,
        colorHex: '#0f172a',
        fillHex: '#f0f9ff',
        strokeColorHex: '#0284c7',
        strokeWidth: 1,
        tabOrder: nextTabOrder,
      };
    } else if (activeTool === 'form-multiline') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'form-multiline',
        xPercent,
        yPercent,
        widthPercent: 36,
        heightPercent: 9,
        fieldName: `multiline_${nextTabOrder}`,
        fieldPlaceholder: 'Enter multiline notes...',
        fieldValue: '',
        defaultValue: '',
        isMultiline: true,
        isRequired: false,
        fontSize: 11,
        colorHex: '#0f172a',
        fillHex: '#f0f9ff',
        strokeColorHex: '#0284c7',
        strokeWidth: 1,
        tabOrder: nextTabOrder,
      };
    } else if (activeTool === 'form-dropdown') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'form-dropdown',
        xPercent,
        yPercent,
        widthPercent: 26,
        heightPercent: 3.8,
        fieldName: `dropdown_${nextTabOrder}`,
        dropdownOptions: ['Option 1', 'Option 2', 'Option 3'],
        fieldValue: 'Option 1',
        defaultValue: 'Option 1',
        isRequired: false,
        fontSize: 11,
        colorHex: '#0f172a',
        fillHex: '#f0f9ff',
        strokeColorHex: '#0284c7',
        strokeWidth: 1,
        tabOrder: nextTabOrder,
      };
    } else if (activeTool === 'form-radio') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'form-radio',
        xPercent,
        yPercent,
        widthPercent: 3.0,
        heightPercent: 2.4,
        fieldName: 'radio_group_1',
        radioGroupName: 'radio_group_1',
        radioOptionValue: `Option_${nextTabOrder}`,
        checked: nextTabOrder === 1,
        isRequired: false,
        colorHex: '#0f172a',
        fillHex: '#f0f9ff',
        strokeColorHex: '#0284c7',
        strokeWidth: 1,
        tabOrder: nextTabOrder,
      };
    } else if (activeTool === 'form-checkbox') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'form-checkbox',
        xPercent,
        yPercent,
        widthPercent: 3.0,
        heightPercent: 2.4,
        fieldName: `checkbox_${nextTabOrder}`,
        checked: true,
        isRequired: false,
        colorHex: '#0f172a',
        fillHex: '#f0f9ff',
        strokeColorHex: '#0284c7',
        strokeWidth: 1,
        tabOrder: nextTabOrder,
      };
    } else if (activeTool === 'form-signature') {
      newItem = {
        id: newId,
        pageNumber: activePage,
        type: 'form-signature',
        xPercent,
        yPercent,
        widthPercent: 26,
        heightPercent: 6,
        fieldName: `Sig_field_${nextTabOrder}`,
        fieldPlaceholder: 'Sign Here',
        isRequired: true,
        colorHex: '#991b1b',
        fillHex: '#fef2f2',
        strokeColorHex: '#dc2626',
        strokeWidth: 1,
        tabOrder: nextTabOrder,
      };
    } else {
      return;
    }

    pushAnnotationsState([...annotations, newItem]);
    setSelectedId(newId);
    if (!keepToolActive) {
      setActiveTool('select');
    }
    setStatusMessage(
      `Placed ${newItem.type} on Page ${activePage}.${
        keepToolActive ? ' ("Keep Tool Active" is ON — click again to place another.)' : ' Switched back to Select mode.'
      }`
    );
  };

  // Start dragging an annotation on the canvas
  const handleStartDrag = (e: React.MouseEvent, item: EditorAnnotationItem) => {
    e.stopPropagation();
    if (!canvasRef.current) return;
    setSelectedId(item.id);
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseXPct = ((e.clientX - rect.left) / rect.width) * 100;
    const mouseYPct = ((e.clientY - rect.top) / rect.height) * 100;
    setDraggingId(item.id);
    setDragOffset({
      dxPct: mouseXPct - item.xPercent,
      dyPct: mouseYPct - item.yPercent,
    });
  };

  // Start resizing an annotation via corner/edge handles
  const handleStartResize = (e: React.MouseEvent, item: EditorAnnotationItem, handle: string) => {
    e.stopPropagation();
    setSelectedId(item.id);
    setResizingId(item.id);
    setResizeHandle(handle);
  };

  // Pan mouse down on main container
  const handleMainContainerMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    if (activeTool !== 'pan' || !mainContainerRef.current) return;
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: mainContainerRef.current.scrollLeft,
      scrollTop: mainContainerRef.current.scrollTop,
    };
  };

  // Manual Crop Mouse Down
  const handleCropMouseDown = (
    e: React.MouseEvent,
    mode: 'move' | 'resize' | 'draw',
    handle?: string
  ) => {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseXPct = ((e.clientX - rect.left) / rect.width) * 100;
    const mouseYPct = ((e.clientY - rect.top) / rect.height) * 100;

    if (mode === 'draw') {
      const startBox: CropBoxPercent = {
        xPercent: roundPct(Math.max(0, Math.min(95, mouseXPct))),
        yPercent: roundPct(Math.max(0, Math.min(95, mouseYPct))),
        widthPercent: 5,
        heightPercent: 5,
      };
      setDraftCrop(startBox);
      setCropAction({
        mode: 'resize',
        handle: 'se',
        startX: mouseXPct,
        startY: mouseYPct,
        initialCrop: startBox,
      });
      return;
    }

    setCropAction({
      mode,
      handle,
      startX: mouseXPct,
      startY: mouseYPct,
      initialCrop: { ...draftCrop },
    });
  };

  // Handle mouse move over canvas for dragging, resizing, crop, or pan
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning && panStartRef.current && mainContainerRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      mainContainerRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
      mainContainerRef.current.scrollTop = panStartRef.current.scrollTop - dy;
      return;
    }

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseXPct = ((e.clientX - rect.left) / rect.width) * 100;
    const mouseYPct = ((e.clientY - rect.top) / rect.height) * 100;

    if (cropAction && activeTool === 'crop') {
      const dx = mouseXPct - cropAction.startX;
      const dy = mouseYPct - cropAction.startY;
      const init = cropAction.initialCrop;

      if (cropAction.mode === 'move') {
        const nextX = roundPct(Math.max(0, Math.min(100 - init.widthPercent, init.xPercent + dx)));
        const nextY = roundPct(Math.max(0, Math.min(100 - init.heightPercent, init.yPercent + dy)));
        setDraftCrop({
          ...init,
          xPercent: nextX,
          yPercent: nextY,
        });
      } else if (cropAction.mode === 'resize' && cropAction.handle) {
        let { xPercent, yPercent, widthPercent, heightPercent } = init;
        const h = cropAction.handle;
        if (h.includes('e')) {
          widthPercent = roundPct(Math.max(5, Math.min(100 - xPercent, init.widthPercent + dx)));
        }
        if (h.includes('s')) {
          heightPercent = roundPct(Math.max(5, Math.min(100 - yPercent, init.heightPercent + dy)));
        }
        if (h.includes('w')) {
          const maxShift = init.widthPercent - 5;
          const shift = Math.max(-init.xPercent, Math.min(maxShift, dx));
          xPercent = roundPct(init.xPercent + shift);
          widthPercent = roundPct(init.widthPercent - shift);
        }
        if (h.includes('n')) {
          const maxShift = init.heightPercent - 5;
          const shift = Math.max(-init.yPercent, Math.min(maxShift, dy));
          yPercent = roundPct(init.yPercent + shift);
          heightPercent = roundPct(init.heightPercent - shift);
        }
        setDraftCrop({ xPercent, yPercent, widthPercent, heightPercent });
      }
      return;
    }

    if (!draggingId && !resizingId) return;

    if (draggingId) {
      setHistory((prev) => {
        const copy = [...prev];
        const snap = copy[historyIdx];
        if (!snap) return prev;
        const currentList = [...snap.annotations];
        const idx = currentList.findIndex((a) => a.id === draggingId);
        if (idx === -1) return prev;

        const item = currentList[idx];
        const nextX = Math.max(0, Math.min(100 - (item.widthPercent || 5), mouseXPct - dragOffset.dxPct));
        const nextY = Math.max(0, Math.min(100 - (item.heightPercent || 3), mouseYPct - dragOffset.dyPct));

        currentList[idx] = {
          ...item,
          xPercent: roundPct(nextX),
          yPercent: roundPct(nextY),
        };
        copy[historyIdx] = { ...snap, annotations: currentList };
        return copy;
      });
    } else if (resizingId && resizeHandle) {
      setHistory((prev) => {
        const copy = [...prev];
        const snap = copy[historyIdx];
        if (!snap) return prev;
        const currentList = [...snap.annotations];
        const idx = currentList.findIndex((a) => a.id === resizingId);
        if (idx === -1) return prev;

        const item = currentList[idx];
        const aspect = (item.widthPercent || 20) / Math.max(1, item.heightPercent || 10);
        const lockRatio = Boolean(
          item.aspectRatioLocked && (item.type === 'image' || item.type === 'signature')
        );

        let newX = item.xPercent;
        let newY = item.yPercent;
        let newW = item.widthPercent || 20;
        let newH = item.heightPercent || 10;
        const rightEdge = item.xPercent + (item.widthPercent || 20);
        const bottomEdge = item.yPercent + (item.heightPercent || 10);

        if (resizeHandle.includes('e')) {
          newW = Math.max(3, Math.min(100 - item.xPercent, mouseXPct - item.xPercent));
        }
        if (resizeHandle.includes('w')) {
          newX = Math.max(0, Math.min(rightEdge - 3, mouseXPct));
          newW = rightEdge - newX;
        }
        if (resizeHandle.includes('s')) {
          newH = Math.max(1.8, Math.min(100 - item.yPercent, mouseYPct - item.yPercent));
        }
        if (resizeHandle.includes('n')) {
          newY = Math.max(0, Math.min(bottomEdge - 1.8, mouseYPct));
          newH = bottomEdge - newY;
        }

        if (lockRatio) {
          if (resizeHandle.includes('e') || resizeHandle.includes('w')) {
            newH = Math.max(1.8, Math.min(100 - (resizeHandle.includes('n') ? 0 : newY), newW / aspect));
            if (resizeHandle.includes('n')) {
              newY = Math.max(0, bottomEdge - newH);
            }
          } else if (resizeHandle === 's' || resizeHandle === 'n') {
            newW = Math.max(3, Math.min(100 - newX, newH * aspect));
          }
        }

        currentList[idx] = {
          ...item,
          xPercent: roundPct(newX),
          yPercent: roundPct(newY),
          widthPercent: roundPct(newW),
          heightPercent: roundPct(newH),
        };
        copy[historyIdx] = { ...snap, annotations: currentList };
        return copy;
      });
    }
  };

  const handleCanvasMouseUp = () => {
    setDraggingId(null);
    setResizingId(null);
    setResizeHandle(null);
    setCropAction(null);
    setIsPanning(false);
    panStartRef.current = null;
  };

  // Update selected annotation property
  const updateSelectedProperty = (updates: Partial<EditorAnnotationItem>) => {
    if (!selectedId) return;
    const next = annotations.map((item) => (item.id === selectedId ? { ...item, ...updates } : item));
    pushAnnotationsState(next);
  };

  // Apply manual crop
  const handleApplyCrop = (applyToAll: boolean) => {
    const nextCrops = { ...pageCrops };
    if (applyToAll) {
      visibleThumbnails.forEach((t) => {
        nextCrops[t.pageNumber] = { ...draftCrop };
      });
      pushSnapshot({ pageCrops: nextCrops });
      setStatusMessage(`Applied crop (${Math.round(draftCrop.widthPercent)}% × ${Math.round(draftCrop.heightPercent)}%) to all ${visibleThumbnails.length} pages.`);
    } else {
      nextCrops[activePage] = { ...draftCrop };
      pushSnapshot({ pageCrops: nextCrops });
      setStatusMessage(`Applied crop to Page ${activePage}.`);
    }
    setActiveTool('select');
  };

  const handleResetCrop = (resetAll: boolean = false) => {
    if (resetAll) {
      pushSnapshot({ pageCrops: {} });
      setDraftCrop({ xPercent: 8, yPercent: 8, widthPercent: 84, heightPercent: 84 });
      setStatusMessage('Reset crop on all pages.');
    } else {
      const nextCrops = { ...pageCrops };
      delete nextCrops[activePage];
      pushSnapshot({ pageCrops: nextCrops });
      setDraftCrop({ xPercent: 8, yPercent: 8, widthPercent: 84, heightPercent: 84 });
      setStatusMessage(`Reset crop on Page ${activePage}.`);
    }
  };

  // Page management handlers inside editor
  const handleRotateCurrentPage = (pageNum: number = activePage, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nextRot = ((extraRotations[pageNum] || 0) + 90) % 360;
    pushSnapshot({
      extraRotations: { ...extraRotations, [pageNum]: nextRot },
    });
    setStatusMessage(`Rotated Page ${pageNum} (+${nextRot}°).`);
  };

  const handleDuplicatePage = (seqIndex: number, pageNum: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const baseSeq =
      pageSequence.length > 0 ? [...pageSequence] : thumbnails.map((t) => t.pageNumber);
    baseSeq.splice(seqIndex + 1, 0, pageNum);
    pushSnapshot({ pageSequence: baseSeq });
    setStatusMessage(`Duplicated Page ${pageNum}.`);
  };

  const handleInsertBlankPageAfter = async (pageNum: number = activePage) => {
    if (!pdfBytes) return;
    try {
      setIsLoading(true);
      const updatedBytes = await insertBlankPageIntoPdf(
        pdfBytes,
        pageNum,
        pageDimensions.width || 612,
        pageDimensions.height || 792
      );
      setPdfBytes(updatedBytes);
      setStatusMessage(`Inserted blank page after Page ${pageNum}.`);
    } catch (err) {
      setErrorMessage('Failed to insert blank page: ' + (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExtractSinglePage = async (pageNum: number = activePage) => {
    if (!pdfBytes) return;
    try {
      const extracted = await extractPagesFromPdf(pdfBytes, [pageNum]);
      const blob = toPdfBlob(extracted);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName.replace(/\.pdf$/i, '')}-page-${pageNum}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setStatusMessage(`Extracted and downloaded Page ${pageNum}.`);
    } catch (err) {
      setErrorMessage('Failed to extract page: ' + (err as Error).message);
    }
  };

  // Drag-and-drop page reordering handlers
  const handlePageDragStart = (seqIndex: number) => {
    setDraggedPagePos(seqIndex);
  };

  const handlePageDragOver = (e: React.DragEvent, seqIndex: number) => {
    e.preventDefault();
    if (dragOverPagePos !== seqIndex) {
      setDragOverPagePos(seqIndex);
    }
  };

  const handlePageDrop = (e: React.DragEvent, targetSeqIndex: number) => {
    e.preventDefault();
    if (draggedPagePos === null || draggedPagePos === targetSeqIndex) {
      setDraggedPagePos(null);
      setDragOverPagePos(null);
      return;
    }
    const baseSeq =
      pageSequence.length > 0 ? [...pageSequence] : thumbnails.map((t) => t.pageNumber);
    const [movedPage] = baseSeq.splice(draggedPagePos, 1);
    baseSeq.splice(targetSeqIndex, 0, movedPage);
    pushSnapshot({ pageSequence: baseSeq });
    setDraggedPagePos(null);
    setDragOverPagePos(null);
    setStatusMessage(`Reordered Page ${movedPage} to position ${targetSeqIndex + 1}.`);
  };

  // Request Page Delete or Document Close with Confirmation Modal
  const handleRequestDeletePage = (pageNum: number = activePage, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const isOnlyPage = visibleThumbnails.length <= 1;
    setConfirmDeleteModal({
      isOpen: true,
      pageNum,
      isOnlyPage,
    });
  };

  // Execute confirmed Page Delete or Document Close
  const handleConfirmDeleteOrClose = async () => {
    if (!confirmDeleteModal) return;
    const { pageNum, isOnlyPage } = confirmDeleteModal;
    setConfirmDeleteModal(null);

    if (isOnlyPage) {
      await clearCurrentDocument();
      setPdfBytes(null);
      setThumbnails([]);
      setPageRenderUrl('');
      setDetectedLines([]);
      resetEditorHistory();
      setExportedResult(null);
      setStatusMessage('Closed document and returned to file upload.');
      return;
    }

    const nextDeleted = [...deletedPages, pageNum];
    pushSnapshot({ deletedPages: nextDeleted });
    const remaining = thumbnails.filter((t) => !nextDeleted.includes(t.pageNumber));
    if (remaining.length > 0 && pageNum === activePage) {
      setActivePage(remaining[0].pageNumber);
    }
    setStatusMessage(`Removed Page ${pageNum} from export.`);
  };

  // Find & Replace matching logic
  const findMatches = React.useMemo(() => {
    const q = findQuery.trim().toLowerCase();
    if (!q) return [];
    return detectedLines.filter(
      (line) => !deletedPages.includes(line.pageNumber) && line.text.toLowerCase().includes(q)
    );
  }, [findQuery, detectedLines, deletedPages]);

  const handleJumpToMatch = (idx: number) => {
    if (findMatches.length === 0) return;
    const bounded = ((idx % findMatches.length) + findMatches.length) % findMatches.length;
    setActiveMatchIdx(bounded);
    const match = findMatches[bounded];
    if (match.pageNumber !== activePage) {
      setActivePage(match.pageNumber);
    }
    setSelectedTextLine(match);
  };

  const handleReplaceCurrentMatch = () => {
    if (findMatches.length === 0) return;
    const match = findMatches[activeMatchIdx] || findMatches[0];
    if (!match) return;

    const regex = new RegExp(findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const existingAnnot = annotations.find(
      (a) =>
        a.pageNumber === match.pageNumber &&
        a.isExistingTextEdit &&
        Math.abs((a.originXPt ?? 0) - match.x) < 2 &&
        Math.abs((a.originYPt ?? 0) - match.y) < 2
    );

    if (existingAnnot) {
      const updatedText = (existingAnnot.text ?? match.text).replace(regex, replaceQuery);
      const next = annotations.map((a) => (a.id === existingAnnot.id ? { ...a, text: updatedText } : a));
      pushAnnotationsState(next);
      setSelectedId(existingAnnot.id);
    } else {
      const newId = `find_rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const updatedText = match.text.replace(regex, replaceQuery);
      const newItem: EditorAnnotationItem = {
        id: newId,
        pageNumber: match.pageNumber,
        type: 'text',
        isExistingTextEdit: true,
        originalText: match.text,
        text: updatedText,
        xPercent: match.xPercent,
        yPercent: match.yPercent,
        widthPercent: Math.max(3.2, roundPct(match.widthPercent + 1.5)),
        heightPercent: Math.max(2.0, roundPct(match.heightPercent + 0.3)),
        originXPt: match.x,
        originYPt: match.y,
        originWidthPt: match.width,
        originHeightPt: match.height,
        originXPercent: match.xPercent,
        originYPercent: match.yPercent,
        originWidthPercent: match.widthPercent,
        originHeightPercent: match.heightPercent,
        fontSize: Math.max(6, Math.round((match.fontSize || 12) * 10) / 10),
        fontFamily: match.fontFamily || 'Helvetica',
        isBold: match.isBold || false,
        isItalic: match.isItalic || false,
        colorHex: match.colorHex || '#0f172a',
        fillHex: undefined,
        opacity: 1,
      };
      pushAnnotationsState([...annotations, newItem]);
      setSelectedId(newId);
    }
    setStatusMessage(`Replaced "${findQuery}" with "${replaceQuery}" on Page ${match.pageNumber}.`);
  };

  const handleReplaceAllMatches = () => {
    if (findMatches.length === 0) return;
    const regex = new RegExp(findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const nextList = [...annotations];

    findMatches.forEach((match, idx) => {
      const existingIdx = nextList.findIndex(
        (a) =>
          a.pageNumber === match.pageNumber &&
          a.isExistingTextEdit &&
          Math.abs((a.originXPt ?? 0) - match.x) < 2 &&
          Math.abs((a.originYPt ?? 0) - match.y) < 2
      );
      if (existingIdx !== -1) {
        const cur = nextList[existingIdx];
        nextList[existingIdx] = {
          ...cur,
          text: (cur.text ?? match.text).replace(regex, replaceQuery),
        };
      } else {
        nextList.push({
          id: `find_rep_all_${Date.now()}_${idx}`,
          pageNumber: match.pageNumber,
          type: 'text',
          isExistingTextEdit: true,
          originalText: match.text,
          text: match.text.replace(regex, replaceQuery),
          xPercent: match.xPercent,
          yPercent: match.yPercent,
          widthPercent: Math.max(3.2, roundPct(match.widthPercent + 1.5)),
          heightPercent: Math.max(2.0, roundPct(match.heightPercent + 0.3)),
          originXPt: match.x,
          originYPt: match.y,
          originWidthPt: match.width,
          originHeightPt: match.height,
          originXPercent: match.xPercent,
          originYPercent: match.yPercent,
          originWidthPercent: match.widthPercent,
          originHeightPercent: match.heightPercent,
          fontSize: Math.max(6, Math.round((match.fontSize || 12) * 10) / 10),
          fontFamily: match.fontFamily || 'Helvetica',
          isBold: match.isBold || false,
          isItalic: match.isItalic || false,
          colorHex: match.colorHex || '#0f172a',
          fillHex: undefined,
          opacity: 1,
        });
      }
    });

    pushAnnotationsState(nextList);
    setStatusMessage(`Replaced ${findMatches.length} occurrence(s) of "${findQuery}".`);
  };

  // Save current edits to browser workspace store (IndexedDB)
  const handleSaveToWorkspace = async () => {
    if (!pdfBytes) return;
    setIsSavingWorkspace(true);
    setErrorMessage('');
    try {
      const updatedBytes = await applyEditorAnnotationsToPdf(pdfBytes, annotations, {
        extraRotations,
        deletedPages,
        pageCrops,
        pageSequence: pageSequence.length > 0 ? pageSequence : undefined,
      });
      await storeCurrentDocument({ name: fileName, bytes: updatedBytes }, 'editor-save');
      setSavedIdx(historyIdx);
      setStatusMessage('Saved changes to workspace.');
    } catch (err) {
      setErrorMessage('Failed to save workspace: ' + (err as Error).message);
    } finally {
      setIsSavingWorkspace(false);
    }
  };

  // Export & Download final PDF
  const handleExportPdf = async () => {
    if (!pdfBytes) return;
    setEditingId(null);
    setIsExporting(true);
    setErrorMessage('');
    setExportedResult(null);

    const editorSlug = defaultTool === 'signature' ? 'sign-pdf' : 'edit-pdf';
    const editorTitle = defaultTool === 'signature' ? 'Sign PDF' : 'Edit PDF';
    const jobId = createClientJobId(editorSlug);
    const startMs = Date.now();

    await trackPdfActivity({
      eventType: 'pdf_processing_started',
      toolSlug: editorSlug,
      toolName: editorTitle,
      jobId,
      fileSizeBytes: pdfBytes.byteLength,
      status: 'started',
    });

    try {
      const outBytes = await applyEditorAnnotationsToPdf(pdfBytes, annotations, {
        extraRotations,
        deletedPages,
        pageCrops,
        pageSequence: pageSequence.length > 0 ? pageSequence : undefined,
      });
      const blob = toPdfBlob(outBytes);
      const url = URL.createObjectURL(blob);
      const baseName = fileName.replace(/\.pdf$/i, '');
      const finalName = `${baseName}-edited.pdf`;

      setExportedResult({
        url,
        fileName: finalName,
        byteLength: outBytes.byteLength,
      });
      setExportedIdx(historyIdx);
      setSavedIdx(historyIdx);
      setStatusMessage(`Exported "${finalName}" (${formatFileSize(outBytes.byteLength)}) successfully.`);

      const durationMs = Math.max(1, Date.now() - startMs);
      await trackPdfActivity({
        eventType: 'pdf_processing_completed',
        toolSlug: editorSlug,
        toolName: editorTitle,
        jobId,
        fileSizeBytes: pdfBytes.byteLength,
        outputSizeBytes: outBytes.byteLength,
        durationMs,
        status: 'succeeded',
      });

      const a = document.createElement('a');
      a.href = url;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      await trackPdfActivity({
        eventType: 'pdf_download_completed',
        toolSlug: editorSlug,
        toolName: editorTitle,
        jobId,
        fileSizeBytes: pdfBytes.byteLength,
        outputSizeBytes: outBytes.byteLength,
        durationMs,
        status: 'succeeded',
        dedupeKey: `download_${jobId}`,
      });
    } catch (err) {
      const errMsg = (err as Error).message || 'Export failed';
      setErrorMessage('Export failed: ' + errMsg);
      await trackPdfActivity({
        eventType: 'pdf_processing_failed',
        toolSlug: editorSlug,
        toolName: editorTitle,
        jobId,
        fileSizeBytes: pdfBytes.byteLength,
        status: 'failed',
        errorCategory: errMsg.slice(0, 80),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const selectedAnnotation = annotations.find((a) => a.id === selectedId) || null;
  const pageAnnotations = annotations.filter((a) => a.pageNumber === activePage);
  const pageTextLines = detectedLines.filter((l) => l.pageNumber === activePage);
  const activePageCrop = pageCrops[activePage] || null;

  // Determine if a detected text line already has an active existing-text edit annotation
  const isLineAlreadyEdited = useCallback(
    (line: DetectedTextLine) => {
      return pageAnnotations.some(
        (a) =>
          a.isExistingTextEdit &&
          ((a.originXPt !== undefined &&
            a.originYPt !== undefined &&
            Math.abs(a.originXPt - line.x) < 2 &&
            Math.abs(a.originYPt - line.y) < 2) ||
            (a.originalText === line.text &&
              Math.abs((a.originXPercent ?? a.xPercent) - line.xPercent) < 1.5 &&
              Math.abs((a.originYPercent ?? a.yPercent) - line.yPercent) < 1.5))
      );
    },
    [pageAnnotations]
  );

  // Compute actual canvas CSS dimensions from page point size and zoomPercent
  const displayWidthPx = Math.round(pageDimensions.width * (zoomPercent / 100));
  const displayHeightPx = Math.round(pageDimensions.height * (zoomPercent / 100));
  const scaleFactor = zoomPercent / 100;

  return (
    <div
      className="flex flex-col h-[calc(100vh-4rem)] min-h-[640px] bg-slate-900 text-slate-100 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl select-none"
      onMouseUp={handleCanvasMouseUp}
    >
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleReplaceDocument}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleImageFileSelect}
      />

      {/* TOP BAR */}
      <header className="bg-slate-950 border-b border-slate-800 px-3 py-2 flex items-center justify-between gap-2 shrink-0 z-40">
        {/* Left: Brand & File Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors shrink-0"
            title="Back to PDFNestly Home"
          >
            <PdfNestlyMark className="w-5 h-5 rounded" />
            <span className="font-bold text-xs tracking-tight text-white hidden sm:inline">PDFNestly Studio</span>
          </Link>

          {pdfBytes && (
            <div className="flex items-center gap-2 min-w-0 bg-slate-900/90 border border-slate-800/80 px-2.5 py-1 rounded-lg">
              <FileText className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="text-xs font-semibold text-white truncate max-w-[140px] md:max-w-[200px]" title={fileName}>
                {fileName}
              </span>
              <span className="text-[11px] text-slate-400 shrink-0 hidden md:inline">
                ({visibleThumbnails.length} {visibleThumbnails.length === 1 ? 'pg' : 'pgs'})
              </span>

              {/* Honest Save Status Badge */}
              {hasUnsavedChanges ? (
                <span
                  data-testid="save-status-badge"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Unsaved edits
                </span>
              ) : exportedIdx === historyIdx && historyIdx > 0 ? (
                <span
                  data-testid="save-status-badge"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  Exported
                </span>
              ) : savedIdx === historyIdx && historyIdx > 0 ? (
                <span
                  data-testid="save-status-badge"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30 shrink-0"
                >
                  <CheckCircle2 className="w-3 h-3 text-sky-400" />
                  Saved in workspace
                </span>
              ) : (
                <span
                  data-testid="save-status-badge"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 shrink-0"
                >
                  Original PDF
                </span>
              )}
            </div>
          )}
        </div>

        {/* Center: Primary Tools + Forms Dropdown */}
        <div className="flex items-center gap-0.5 py-0.5 flex-wrap">
          {[
            { id: 'select', label: 'Select / Edit', icon: MousePointer, hint: 'Click any text on canvas to edit in-place, or drag objects' },
            { id: 'pan', label: 'Hand', icon: Hand, hint: 'Pan around zoomed page' },
            { id: 'existing-text', label: 'Edit Text', icon: RefreshCw, hint: 'Highlight & edit existing PDF text in-place' },
            { id: 'text', label: 'Add Text', icon: Type, hint: 'Click anywhere on page to insert new text' },
            { id: 'highlight', label: 'Highlight', icon: Highlighter, hint: 'Highlight text or area' },
            { id: 'underline', label: 'Underline', icon: UnderlineIcon, hint: 'Underline text' },
            { id: 'strikethrough', label: 'Strikeout', icon: StrikethroughIcon, hint: 'Strikethrough text' },
            { id: 'shape', label: 'Shapes', icon: Square, hint: 'Draw rectangles, ellipses, lines, or arrows' },
            { id: 'image', label: 'Image', icon: ImageIcon, hint: 'Insert PNG, JPG, or WebP image' },
            { id: 'signature', label: 'Sign', icon: PenTool, hint: 'Draw, type, or upload signature' },
            { id: 'crop', label: 'Crop', icon: Crop, hint: 'Drag crop handles on canvas to crop page' },
            { id: 'comment', label: 'Note', icon: MessageSquare, hint: 'Add sticky note' },
            { id: 'stamp', label: 'Stamp', icon: Stamp, hint: 'Place status stamp' },
            { id: 'redact', label: 'Whiteout', icon: ShieldAlert, hint: 'Blackout / whiteout sensitive area' },
          ].map((tool) => {
            const Icon = tool.icon;
            const active = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                title={tool.hint}
                onClick={() => {
                  setEditingId(null);
                  setShowFormsMenu(false);
                  setActiveTool(tool.id as EditorToolMode);
                  if (tool.id === 'signature') {
                    setSigningFormFieldId(null);
                    setReplacingSignatureTargetId(null);
                    setShowSignaturePad(true);
                  } else if (tool.id === 'image' && !pendingImageUrl) {
                    setReplacingImageTargetId(null);
                    imageInputRef.current?.click();
                  }
                }}
                className={`flex items-center gap-1 px-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                  active
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden 2xl:inline">{tool.label}</span>
              </button>
            );
          })}

          {/* SEJDA-STYLE FORMS & SYMBOLS MENU */}
          <div className="relative">
            <button
              type="button"
              data-testid="forms-menu-button"
              onClick={() => setShowFormsMenu((prev) => !prev)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 border ${
                activeTool.startsWith('form-') || activeTool.startsWith('symbol-') || showFormsMenu
                  ? 'bg-red-600 text-white border-red-500 shadow-sm'
                  : 'bg-slate-900 text-slate-200 border-slate-800 hover:bg-slate-800 hover:text-white'
              }`}
              title="Interactive PDF Forms, Checkmarks & Fillable Fields"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Forms</span>
              <ChevronDown className="w-3 h-3 opacity-80" />
            </button>

            {showFormsMenu && (
              <div
                data-testid="forms-dropdown-menu"
                className="absolute left-0 mt-1.5 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 z-50 text-xs"
              >
                {/* Quick Symbols Row */}
                <div className="px-3 pb-2 border-b border-slate-800">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                    Quick Fill Symbols
                  </span>
                  <div className="grid grid-cols-5 gap-1">
                    {[
                      { id: 'symbol-check', label: '✓', title: 'Checkmark (✓)' },
                      { id: 'symbol-cross', label: '✕', title: 'Cross (✕)' },
                      { id: 'symbol-dot', label: '•', title: 'Dot (•)' },
                      { id: 'symbol-circle', label: '◯', title: 'Circle (◯)' },
                      { id: 'symbol-checkbox', label: '☑', title: 'Checked Box (☑)' },
                    ].map((sym) => (
                      <button
                        key={sym.id}
                        type="button"
                        title={sym.title}
                        onClick={() => {
                          setActiveTool(sym.id as EditorToolMode);
                          setShowFormsMenu(false);
                        }}
                        className={`py-1.5 rounded-lg border font-bold text-sm flex items-center justify-center transition-colors ${
                          activeTool === sym.id
                            ? 'bg-red-600 border-red-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        {sym.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Interactive AcroForm Fields */}
                <div className="py-1.5 border-b border-slate-800">
                  <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Interactive AcroForm Fields
                  </span>
                  {[
                    { id: 'form-text', label: 'Text Box (Single Line)', badge: 'Abc' },
                    { id: 'form-multiline', label: 'Multiline Text Area', badge: '¶' },
                    { id: 'form-dropdown', label: 'Dropdown Menu', badge: '▼' },
                    { id: 'form-checkbox', label: 'Interactive Checkbox', badge: '☑' },
                    { id: 'form-radio', label: 'Radio Button', badge: '◉' },
                    { id: 'form-signature', label: 'Signature Field', badge: '✒' },
                  ].map((fld) => (
                    <button
                      key={fld.id}
                      type="button"
                      data-testid={`tool-${fld.id}`}
                      onClick={() => {
                        setActiveTool(fld.id as EditorToolMode);
                        setShowFormsMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-800 ${
                        activeTool === fld.id ? 'bg-red-600/20 text-red-300 font-semibold' : 'text-slate-200'
                      }`}
                    >
                      <span>{fld.label}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-400">
                        {fld.badge}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Smart Form Actions */}
                <div className="pt-1.5 space-y-0.5">
                  <button
                    type="button"
                    disabled={!pdfBytes || isDetectingFields}
                    onClick={handleDetectFormFields}
                    className="w-full px-3 py-1.5 text-left text-sky-300 hover:bg-slate-800 flex items-center gap-2 disabled:opacity-40"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>{isDetectingFields ? 'Scanning PDF...' : 'Detect Form Fields Automatically'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormEditMode((prev) => !prev);
                      setShowFormsMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-slate-400" />
                      Form Field Labels & Config Mode
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        formEditMode ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {formEditMode ? 'ON' : 'OFF'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={!pdfBytes}
                    onClick={() => {
                      setShowFormsMenu(false);
                      setShowTabOrderModal(true);
                    }}
                    className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2 disabled:opacity-40"
                  >
                    <ListFilter className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Change Field Tab Order</span>
                  </button>
                  <button
                    type="button"
                    disabled={!pdfBytes}
                    onClick={() => {
                      setShowFormsMenu(false);
                      setShareFormTitle(fileName.replace(/\.pdf$/i, ''));
                      setCreatedShareUrl('');
                      setShowShareFormModal(true);
                    }}
                    className="w-full px-3 py-1.5 text-left text-emerald-300 hover:bg-slate-800 flex items-center gap-2 disabled:opacity-40 font-semibold"
                  >
                    <Share2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Publish & Share Fillable Form Link</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Keep Tool Active Toggle */}
          <button
            type="button"
            data-testid="keep-tool-active-toggle"
            onClick={() => setKeepToolActive((prev) => !prev)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors shrink-0 ${
              keepToolActive
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Keep selected tool active after placing an element on the page"
          >
            <Pin className="w-3 h-3" />
            <span className="hidden 2xl:inline">Keep Active</span>
          </button>
        </div>

        {/* Right: Find, Undo/Redo, Save, Zoom, More, Export */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Find & Replace toggle */}
          <button
            type="button"
            onClick={() => setShowFindBar((prev) => !prev)}
            className={`p-1.5 rounded-lg border transition-colors ${
              showFindBar
                ? 'bg-red-600/20 border-red-500/50 text-red-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Find & Replace Text (Ctrl+F)"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {/* Undo / Redo */}
          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={handleUndo}
              disabled={historyIdx <= 0}
              className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyIdx >= history.length - 1}
              className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="hidden lg:flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setFitMode('custom');
                setZoomPercent((z) => Math.max(30, z - 15));
              }}
              className="p-1.5 text-slate-300 hover:text-white"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] font-mono font-semibold text-slate-300 min-w-[42px] text-center">
              {zoomPercent}%
            </span>
            <button
              type="button"
              onClick={() => {
                setFitMode('custom');
                setZoomPercent((z) => Math.min(220, z + 15));
              }}
              className="p-1.5 text-slate-300 hover:text-white"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => calculateFitZoom('page')}
              className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors ${
                fitMode === 'page' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Fit Page in Viewport"
            >
              Fit
            </button>
            <button
              type="button"
              onClick={() => calculateFitZoom('width')}
              className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors ${
                fitMode === 'width' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Fit Width"
            >
              Width
            </button>
          </div>

          {/* Save to Workspace button */}
          {pdfBytes && (
            <button
              type="button"
              onClick={handleSaveToWorkspace}
              disabled={isSavingWorkspace || !hasUnsavedChanges}
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                hasUnsavedChanges
                  ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                  : 'bg-slate-900 text-slate-500 border-slate-800 cursor-default'
              }`}
              title="Save current edits in browser workspace"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingWorkspace ? 'Saving...' : 'Save'}</span>
            </button>
          )}

          {/* More Menu Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreMenu((prev) => !prev)}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
              title="More Document Actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMoreMenu && (
              <div
                className="absolute right-0 mt-1.5 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1.5 z-50 text-xs"
                onMouseLeave={() => setShowMoreMenu(false)}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full px-3.5 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2.5"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-400" />
                  Replace PDF Document
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    handleLoadSample();
                  }}
                  className="w-full px-3.5 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Load 4-Page Sample PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    setActiveTool('watermark');
                  }}
                  className="w-full px-3.5 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2.5"
                >
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  Add Page Watermark
                </button>
                {pdfBytes && (
                  <>
                    <div className="my-1 border-t border-slate-800" />
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreMenu(false);
                        handleInsertBlankPageAfter(activePage);
                      }}
                      className="w-full px-3.5 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2.5"
                    >
                      <FilePlus2 className="w-3.5 h-3.5 text-emerald-400" />
                      Insert Blank Page After P.{activePage}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreMenu(false);
                        handleExtractSinglePage(activePage);
                      }}
                      className="w-full px-3.5 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2.5"
                    >
                      <Scissors className="w-3.5 h-3.5 text-purple-400" />
                      Extract Page {activePage} as PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreMenu(false);
                        handleRotateCurrentPage(activePage);
                      }}
                      className="w-full px-3.5 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2.5"
                    >
                      <RotateCw className="w-3.5 h-3.5 text-slate-400" />
                      Rotate Current Page (+90°)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreMenu(false);
                        handleRequestDeletePage(activePage);
                      }}
                      className="w-full px-3.5 py-2 text-left text-red-400 hover:bg-slate-800 flex items-center gap-2.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {visibleThumbnails.length <= 1 ? 'Close / Clear Document' : 'Delete Current Page'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Primary Export Button */}
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!pdfBytes || isExporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-xs font-bold text-white transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Exporting...' : 'Export PDF'}</span>
          </button>
        </div>
      </header>

      {/* FIND & REPLACE BAR */}
      {showFindBar && pdfBytes && (
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs z-20">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={findQuery}
                onChange={(e) => {
                  setFindQuery(e.target.value);
                  setActiveMatchIdx(0);
                }}
                placeholder="Find text in PDF..."
                className="bg-transparent text-white focus:outline-none w-40 sm:w-52 text-xs"
              />
              {findQuery && (
                <span className="text-[10px] font-mono text-slate-400">
                  {findMatches.length > 0 ? `${activeMatchIdx + 1}/${findMatches.length}` : '0 matches'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={findMatches.length === 0}
                onClick={() => handleJumpToMatch(activeMatchIdx - 1)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={findMatches.length === 0}
                onClick={() => handleJumpToMatch(activeMatchIdx + 1)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
              >
                Next
              </button>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1">
              <input
                type="text"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder="Replace with..."
                className="bg-transparent text-white focus:outline-none w-40 sm:w-52 text-xs"
              />
            </div>

            <button
              type="button"
              disabled={findMatches.length === 0}
              onClick={handleReplaceCurrentMatch}
              className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-semibold"
            >
              Replace
            </button>
            <button
              type="button"
              disabled={findMatches.length === 0}
              onClick={handleReplaceAllMatches}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-semibold border border-slate-700"
            >
              Replace All ({findMatches.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowFindBar(false)}
            className="text-slate-400 hover:text-white p-1"
            title="Close Find & Replace"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* EXPORT READY BANNER */}
      {exportedResult && (
        <div className="bg-emerald-950/90 border-b border-emerald-800 px-4 py-2 flex items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>{exportedResult.fileName}</strong> ({formatFileSize(exportedResult.byteLength)}) is ready.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={exportedResult.url}
              download={exportedResult.fileName}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" />
              Download Again
            </a>
            <button
              type="button"
              onClick={() => setExportedResult(null)}
              className="text-emerald-400 hover:text-white px-1.5"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* STATUS OR ERROR BAR */}
      {errorMessage && (
        <div className="bg-red-950/90 border-b border-red-800 px-4 py-1.5 flex items-center justify-between text-xs text-red-200 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button type="button" onClick={() => setErrorMessage('')} className="text-red-300 hover:text-white font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* MAIN THREE-PANEL WORKSPACE */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT SIDEBAR: COMPACT SEJDA-STYLE PAGE THUMBNAIL RAIL */}
        {pdfBytes && (
          <aside
            data-testid="page-thumbnail-sidebar"
            className={`${
              isSidebarOpen ? 'w-28 sm:w-32' : 'w-9'
            } bg-slate-950 border-r border-slate-800 flex flex-col transition-all duration-200 shrink-0 z-10`}
          >
            <div className="px-2 py-1.5 border-b border-slate-800 flex items-center justify-between">
              {isSidebarOpen && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Pages ({visibleThumbnails.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleInsertBlankPageAfter(activePage)}
                    className="p-0.5 rounded bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800"
                    title="Insert Blank Page After Current Page"
                  >
                    <PlusCircle className="w-3 h-3" />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white ml-auto"
                title={isSidebarOpen ? 'Collapse Pages Panel' : 'Expand Pages Panel'}
              >
                {isSidebarOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>

            {isSidebarOpen && (
              <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
                {orderedThumbnails.map(({ thumb, seqIndex }, displayIdx) => {
                  const isActive = thumb.pageNumber === activePage;
                  const countOnPage = annotations.filter((a) => a.pageNumber === thumb.pageNumber).length;
                  const rot = extraRotations[thumb.pageNumber] || 0;
                  const isCropped = Boolean(pageCrops[thumb.pageNumber]);
                  const isDragOver = dragOverPagePos === seqIndex;

                  return (
                    <div
                      key={`${thumb.pageNumber}_${seqIndex}`}
                      data-testid={`page-thumbnail-${displayIdx + 1}`}
                      draggable
                      onDragStart={() => handlePageDragStart(seqIndex)}
                      onDragOver={(e) => handlePageDragOver(e, seqIndex)}
                      onDrop={(e) => handlePageDrop(e, seqIndex)}
                      onClick={() => setActivePage(thumb.pageNumber)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActivePage(thumb.pageNumber);
                        }
                      }}
                      className={`group relative w-full text-left rounded-lg p-1.5 border transition-all cursor-pointer ${
                        isActive
                          ? 'bg-red-950/35 border-red-500 ring-1 ring-red-500/40'
                          : isDragOver
                            ? 'bg-slate-800/80 border-sky-400 ring-1 ring-sky-400'
                            : 'bg-slate-900/60 border-slate-800/90 hover:border-slate-700'
                      }`}
                    >
                      {/* Compact Hover Quick Actions */}
                      <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => handleRotateCurrentPage(thumb.pageNumber, e)}
                          title={`Rotate Page ${thumb.pageNumber} (+90°)`}
                          className="p-0.5 rounded bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 shadow"
                        >
                          <RotateCw className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDuplicatePage(seqIndex, thumb.pageNumber, e)}
                          title={`Duplicate Page ${thumb.pageNumber}`}
                          className="p-0.5 rounded bg-slate-900/90 hover:bg-slate-800 text-sky-300 border border-slate-700 shadow"
                        >
                          <Copy className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleRequestDeletePage(thumb.pageNumber, e)}
                          title={
                            visibleThumbnails.length <= 1
                              ? 'Close / Clear Document'
                              : `Delete Page ${thumb.pageNumber}`
                          }
                          className="p-0.5 rounded bg-red-950/90 hover:bg-red-600 text-red-200 hover:text-white border border-red-800 shadow"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>

                      <div className="relative bg-white rounded overflow-hidden aspect-[1/1.414] max-w-[88px] mx-auto flex items-center justify-center shadow-inner">
                        <img
                          src={thumb.dataUrl}
                          alt={`Page ${thumb.pageNumber}`}
                          className="w-full h-full object-contain transition-transform"
                          style={{ transform: `rotate(${rot}deg)` }}
                        />
                        {countOnPage > 0 && (
                          <span className="absolute bottom-1 right-1 bg-red-600 text-white text-[9px] font-bold px-1 py-0.2 rounded-full shadow">
                            {countOnPage}
                          </span>
                        )}
                        {isCropped && (
                          <span className="absolute bottom-1 left-1 bg-amber-600 text-white text-[8px] font-bold px-1 rounded shadow">
                            CROP
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] px-0.5">
                        <span
                          className={`font-bold flex items-center gap-0.5 ${
                            isActive ? 'text-red-400' : 'text-slate-400'
                          }`}
                        >
                          <GripVertical className="w-2.5 h-2.5 text-slate-600 cursor-grab" />
                          {displayIdx + 1}
                          {thumb.pageNumber !== displayIdx + 1 ? ` (#${thumb.pageNumber})` : ''}
                        </span>
                        {rot > 0 && <span className="text-[9px] text-amber-400">+{rot}°</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        )}

        {/* CENTER VIEWPORT: INTERACTIVE CANVAS OR UPLOAD DROPZONE */}
        <main
          ref={mainContainerRef}
          onMouseDown={handleMainContainerMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedId(null);
              setEditingId(null);
              setSelectedTextLine(null);
              setShowFormsMenu(false);
              setShowMoreMenu(false);
            }
          }}
          className={`flex-1 bg-slate-900/95 overflow-auto flex items-center justify-center p-4 sm:p-6 relative ${
            activeTool === 'pan' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''
          }`}
        >
          {!pdfBytes ? (
            /* EMPTY UPLOAD STATE */
            <div className="max-w-md w-full bg-slate-950 border-2 border-dashed border-slate-800 rounded-2xl p-8 text-center space-y-5 my-auto">
              <div className="w-14 h-14 rounded-2xl bg-red-600/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto">
                <Upload className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-bold text-white">Open a PDF in PDFNestly Studio</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Click any existing text directly on the PDF canvas to edit, format, or delete it in-place. Insert images, signatures, shapes, or crop pages with full visual precision.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5 justify-center pt-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white transition-colors shadow-lg shadow-red-600/20"
                >
                  <Upload className="w-4 h-4" />
                  Select PDF File
                </button>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Load 4-Page Sample Contract
                </button>
              </div>
            </div>
          ) : (
            /* ACTIVE PDF PAGE CANVAS */
            <div className="my-auto flex flex-col items-center">
              {/* Contextual Mode Banner */}
              {(activeTool === 'select' || activeTool === 'existing-text' || activeTool === 'text') && (
                <div className="mb-3 px-3.5 py-1.5 rounded-full bg-slate-950/90 border border-slate-800 text-slate-300 text-[11px] font-medium flex items-center gap-2 shadow-lg">
                  <Sparkles className="w-3.5 h-3.5 text-red-400" />
                  <span>
                    <strong>Direct Canvas Editing:</strong> Click any existing text to edit it in-place on the PDF{activeTool === 'text' ? ', or click blank space to add new text' : ''}.
                  </span>
                </div>
              )}

              {activeTool === 'crop' && (
                <div className="mb-3 px-4 py-2 rounded-xl bg-amber-950/90 border border-amber-700 text-amber-200 text-xs font-medium flex flex-wrap items-center gap-3 shadow-lg">
                  <div className="flex items-center gap-1.5">
                    <Crop className="w-4 h-4 text-amber-400" />
                    <span>
                      Crop Area: <strong>{Math.round(draftCrop.widthPercent)}% × {Math.round(draftCrop.heightPercent)}%</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleApplyCrop(false)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors"
                    >
                      Apply to Page {activePage}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyCrop(true)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-amber-500/40 transition-colors"
                    >
                      Apply to All Pages
                    </button>
                    {activePageCrop && (
                      <button
                        type="button"
                        onClick={() => handleResetCrop(false)}
                        className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs"
                      >
                        Reset
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveTool('select')}
                      className="px-2 py-1 text-amber-300 hover:text-white text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {activeTool === 'image' && pendingImageUrl && (
                <div className="mb-3 px-3.5 py-1.5 rounded-full bg-emerald-950/90 border border-emerald-700 text-emerald-200 text-xs font-medium flex items-center gap-2 shadow-lg">
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Click anywhere on the page to place your image, or</span>
                  <button
                    type="button"
                    onClick={handlePlaceImageAtCenter}
                    className="underline font-bold text-white hover:text-emerald-300"
                  >
                    Place at Center
                  </button>
                </div>
              )}

              {/* Page Sheet Container */}
              <div
                ref={canvasRef}
                data-testid="pdf-page-canvas"
                onClick={handleCanvasClick}
                style={{
                  width: `${displayWidthPx}px`,
                  height: `${displayHeightPx}px`,
                }}
                className={`relative bg-white shadow-2xl rounded-sm transition-all select-none ${
                  activeTool === 'pan'
                    ? isPanning
                      ? 'cursor-grabbing'
                      : 'cursor-grab'
                    : activeTool === 'crop'
                      ? 'cursor-crosshair'
                      : activeTool !== 'select' && activeTool !== 'existing-text'
                        ? 'cursor-crosshair'
                        : 'cursor-default'
                }`}
              >
                {/* Rendered PDF Page Image */}
                {pageRenderUrl ? (
                  <img
                    src={pageRenderUrl}
                    alt={`PDF Page ${activePage}`}
                    data-canvas-bg="true"
                    className="w-full h-full object-contain pointer-events-none select-none"
                    draggable={false}
                  />
                ) : renderError ? (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-950 text-red-300 text-xs gap-3">
                    <AlertCircle className="w-6 h-6 text-red-500" />
                    <p>{renderError}</p>
                    <button
                      type="button"
                      onClick={() => renderCurrentPage()}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold"
                    >
                      Retry Render
                    </button>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                    Rendering page {activePage}...
                  </div>
                )}

                {isRenderingPage && pageRenderUrl && (
                  <div className="absolute top-2 right-2 bg-slate-900/80 text-white text-[10px] px-2 py-0.5 rounded-full pointer-events-none">
                    Updating...
                  </div>
                )}

                {/* Active Crop Indicator Overlay (when not actively in crop tool) */}
                {activePageCrop && activeTool !== 'crop' && (
                  <div
                    className="absolute border-2 border-dashed border-amber-500/70 pointer-events-none z-10"
                    style={{
                      left: `${activePageCrop.xPercent}%`,
                      top: `${activePageCrop.yPercent}%`,
                      width: `${activePageCrop.widthPercent}%`,
                      height: `${activePageCrop.heightPercent}%`,
                    }}
                  >
                    <span className="absolute -top-5 left-0 bg-amber-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                      Crop Boundary
                    </span>
                  </div>
                )}

                {/* MANUAL CROP OVERLAY & 8 RESIZE HANDLES */}
                {activeTool === 'crop' && (
                  <div
                    onMouseDown={(e) => handleCropMouseDown(e, 'draw')}
                    className="absolute inset-0 bg-slate-950/45 z-30"
                  >
                    <div
                      onMouseDown={(e) => handleCropMouseDown(e, 'move')}
                      style={{
                        left: `${draftCrop.xPercent}%`,
                        top: `${draftCrop.yPercent}%`,
                        width: `${draftCrop.widthPercent}%`,
                        height: `${draftCrop.heightPercent}%`,
                      }}
                      className="absolute border-2 border-amber-400 bg-transparent shadow-[0_0_0_9999px_rgba(2,6,23,0.55)] cursor-move"
                    >
                      {/* Rule of thirds grid lines */}
                      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                        <div className="border-r border-b border-amber-300/30" />
                        <div className="border-r border-b border-amber-300/30" />
                        <div className="border-b border-amber-300/30" />
                        <div className="border-r border-b border-amber-300/30" />
                        <div className="border-r border-b border-amber-300/30" />
                        <div className="border-b border-amber-300/30" />
                        <div className="border-r border-amber-300/30" />
                        <div className="border-r border-amber-300/30" />
                        <div />
                      </div>

                      {/* 8 Resize Handles */}
                      {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((h) => {
                        const posClass =
                          h === 'nw'
                            ? '-top-1.5 -left-1.5 cursor-nwse-resize'
                            : h === 'n'
                              ? '-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize'
                              : h === 'ne'
                                ? '-top-1.5 -right-1.5 cursor-nesw-resize'
                                : h === 'e'
                                  ? 'top-1/2 -translate-y-1/2 -right-1.5 cursor-ew-resize'
                                  : h === 'se'
                                    ? '-bottom-1.5 -right-1.5 cursor-nwse-resize'
                                    : h === 's'
                                      ? '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize'
                                      : h === 'sw'
                                        ? '-bottom-1.5 -left-1.5 cursor-nesw-resize'
                                        : 'top-1/2 -translate-y-1/2 -left-1.5 cursor-ew-resize';
                        return (
                          <div
                            key={h}
                            onMouseDown={(e) => handleCropMouseDown(e, 'resize', h)}
                            className={`absolute w-3.5 h-3.5 bg-amber-400 border-2 border-slate-950 rounded-full shadow ${posClass}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* HOVER-TO-IDENTIFY & CLICK-TO-EDIT EXISTING PDF TEXT LAYER */}
                {(activeTool === 'select' || activeTool === 'existing-text' || activeTool === 'text') &&
                  pageTextLines.map((line, idx) => {
                    // Do not render raw hover target if this line has already been converted into an in-place edit annotation
                    if (isLineAlreadyEdited(line)) return null;

                    const isHovered = hoveredLineIdx === idx;
                    const isSearchMatch =
                      findQuery.trim().length > 0 &&
                      line.text.toLowerCase().includes(findQuery.trim().toLowerCase());

                    return (
                      <div
                        key={`line_${idx}_${line.x}_${line.y}`}
                        data-testid={`pdf-text-line-${idx}`}
                        onMouseEnter={() => setHoveredLineIdx(idx)}
                        onMouseLeave={() => setHoveredLineIdx((prev) => (prev === idx ? null : prev))}
                        onClick={(e) => handleActivateExistingTextLine(line, e)}
                        style={{
                          left: `${line.xPercent}%`,
                          top: `${line.yPercent}%`,
                          width: `${Math.max(2, line.widthPercent)}%`,
                          height: `${Math.max(1.6, line.heightPercent)}%`,
                        }}
                        title={`Click to edit "${line.text}" in-place`}
                        className={`absolute transition-all cursor-text rounded-[2px] ${
                          isSearchMatch
                            ? 'bg-amber-400/35 ring-2 ring-amber-500 z-10'
                            : activeTool === 'existing-text'
                              ? isHovered
                                ? 'bg-red-500/15 ring-1.5 ring-red-500 z-10'
                                : 'bg-sky-500/5 ring-1 ring-sky-500/30 hover:ring-red-500'
                              : isHovered
                                ? 'bg-sky-500/10 ring-1 ring-sky-500/75 z-10'
                                : 'bg-transparent'
                        }`}
                      />
                    );
                  })}

                {/* ORIGIN MASK FOR MOVED EXISTING TEXT EDITS (only used if PDF stream stripping did not apply, e.g. scanned raster PDFs) */}
                {pageAnnotations
                  .filter(
                    (item) =>
                      item.isExistingTextEdit &&
                      !strippedCanvasIds.has(item.id) &&
                      item.originXPercent !== undefined &&
                      item.originYPercent !== undefined &&
                      (Math.abs(item.xPercent - item.originXPercent) > 0.25 ||
                        Math.abs(item.yPercent - item.originYPercent) > 0.25)
                  )
                  .map((item) => (
                    <div
                      key={`origin_mask_${item.id}`}
                      style={{
                        left: `${Math.max(0, item.originXPercent ?? item.xPercent)}%`,
                        top: `${Math.max(0, item.originYPercent ?? item.yPercent)}%`,
                        width: `${Math.min(100, item.originWidthPercent ?? item.widthPercent)}%`,
                        height: `${Math.min(100, item.originHeightPercent ?? item.heightPercent)}%`,
                        backgroundColor: item.fillHex || sampledBgColors[item.id] || 'transparent',
                      }}
                      className="absolute pointer-events-none z-10"
                    />
                  ))}

                {/* INTERACTIVE ANNOTATION & IN-PLACE TEXT EDIT OVERLAYS */}
                {pageAnnotations.map((item) => {
                  const isSelected = item.id === selectedId;
                  const isEditingThis = item.id === editingId;
                  const isTextObject =
                    item.type === 'text' || item.type === 'comment' || Boolean(item.isExistingTextEdit);
                  const scaledFontPx = Math.max(9, Math.round((item.fontSize || 12) * scaleFactor));
                  const cssFont = getCssFontFamily(item.fontFamily);
                  const textDecorations = [
                    item.isUnderline ? 'underline' : '',
                    item.isStrikethrough ? 'line-through' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  // Position floating toolbar below the text box if too close to top of page
                  const toolbarBelow = item.yPercent < 12;

                  return (
                    <div
                      key={item.id}
                      data-testid={`editor-annotation-${item.id}`}
                      onMouseDown={(e) => {
                        if (isEditingThis) {
                          e.stopPropagation();
                          return;
                        }
                        handleStartDrag(e, item);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(item.id);
                        if (isTextObject && !isEditingThis) {
                          setEditInitialText(item.text ?? '');
                          setEditingId(item.id);
                        }
                      }}
                      style={{
                        left: `${item.xPercent}%`,
                        top: `${item.yPercent}%`,
                        width: `${item.widthPercent}%`,
                        height: `${item.heightPercent}%`,
                        opacity: item.opacity ?? 1,
                      }}
                      className={`absolute group transition-shadow ${
                        isEditingThis ? 'z-30 cursor-text' : 'z-20 cursor-move'
                      } ${
                        isSelected
                          ? 'ring-2 ring-red-500 shadow-lg'
                          : item.isExistingTextEdit && item.text === ''
                            ? 'hover:ring-1 hover:ring-slate-300'
                            : 'hover:ring-1 hover:ring-red-400/70'
                      }`}
                    >
                      {/* CONTEXTUAL FLOATING TEXT FORMATTING TOOLBAR (Phase 3) */}
                      {isSelected && isTextObject && !showFormsMenu && !showMoreMenu && (
                        <div
                          data-testid="floating-text-toolbar"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          className={`absolute left-0 ${
                            toolbarBelow ? 'top-full mt-2' : 'bottom-full mb-2'
                          } z-50 flex items-center gap-1 bg-slate-950/95 border border-slate-700 rounded-xl px-2 py-1.5 shadow-2xl text-white whitespace-nowrap`}
                        >
                          {/* Drag Handle */}
                          <div
                            onMouseDown={(e) => {
                              setEditingId(null);
                              handleStartDrag(e, item);
                            }}
                            title="Drag to move text box anywhere on page"
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-move flex items-center"
                          >
                            <Move className="w-3.5 h-3.5" />
                          </div>

                          <div className="h-4 w-px bg-slate-800 mx-0.5" />

                          {/* Font Family */}
                          <select
                            aria-label="Font Family"
                            value={item.fontFamily || 'Helvetica'}
                            onChange={(e) =>
                              updateSelectedProperty({
                                fontFamily: e.target.value as 'Helvetica' | 'TimesRoman' | 'Courier',
                              })
                            }
                            className="bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-[11px] text-white focus:outline-none focus:border-red-500"
                          >
                            <option value="Helvetica">Sans (Helvetica)</option>
                            <option value="TimesRoman">Serif (Times)</option>
                            <option value="Courier">Mono (Courier)</option>
                          </select>

                          {/* Font Size */}
                          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg">
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedProperty({
                                  fontSize: Math.max(6, (item.fontSize || 12) - 1),
                                })
                              }
                              className="px-1.5 py-0.5 text-slate-300 hover:text-white text-xs font-bold"
                              title="Decrease Font Size"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              aria-label="Font Size"
                              min={6}
                              max={72}
                              value={item.fontSize || 12}
                              onChange={(e) =>
                                updateSelectedProperty({
                                  fontSize: Math.max(6, Math.min(72, Number(e.target.value) || 12)),
                                })
                              }
                              className="w-9 bg-transparent text-center text-[11px] font-mono text-white focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedProperty({
                                  fontSize: Math.min(72, (item.fontSize || 12) + 1),
                                })
                              }
                              className="px-1.5 py-0.5 text-slate-300 hover:text-white text-xs font-bold"
                              title="Increase Font Size"
                            >
                              +
                            </button>
                          </div>

                          <div className="h-4 w-px bg-slate-800 mx-0.5" />

                          {/* Bold / Italic / Underline / Strikethrough */}
                          <button
                            type="button"
                            onClick={() => updateSelectedProperty({ isBold: !item.isBold })}
                            className={`p-1 rounded ${
                              item.isBold ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                            }`}
                            title="Bold"
                          >
                            <Bold className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSelectedProperty({ isItalic: !item.isItalic })}
                            className={`p-1 rounded ${
                              item.isItalic ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                            }`}
                            title="Italic"
                          >
                            <Italic className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSelectedProperty({ isUnderline: !item.isUnderline })}
                            className={`p-1 rounded ${
                              item.isUnderline ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                            }`}
                            title="Underline"
                          >
                            <UnderlineIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSelectedProperty({ isStrikethrough: !item.isStrikethrough })}
                            className={`p-1 rounded ${
                              item.isStrikethrough ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                            }`}
                            title="Strikethrough"
                          >
                            <StrikethroughIcon className="w-3.5 h-3.5" />
                          </button>

                          <div className="h-4 w-px bg-slate-800 mx-0.5" />

                          {/* Alignment */}
                          <button
                            type="button"
                            onClick={() => updateSelectedProperty({ textAlign: 'left' })}
                            className={`p-1 rounded ${
                              (item.textAlign || 'left') === 'left'
                                ? 'bg-slate-800 text-white'
                                : 'text-slate-400 hover:text-white'
                            }`}
                            title="Align Left"
                          >
                            <AlignLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSelectedProperty({ textAlign: 'center' })}
                            className={`p-1 rounded ${
                              item.textAlign === 'center'
                                ? 'bg-slate-800 text-white'
                                : 'text-slate-400 hover:text-white'
                            }`}
                            title="Align Center"
                          >
                            <AlignCenter className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSelectedProperty({ textAlign: 'right' })}
                            className={`p-1 rounded ${
                              item.textAlign === 'right'
                                ? 'bg-slate-800 text-white'
                                : 'text-slate-400 hover:text-white'
                            }`}
                            title="Align Right"
                          >
                            <AlignRight className="w-3.5 h-3.5" />
                          </button>

                          <div className="h-4 w-px bg-slate-800 mx-0.5" />

                          {/* Text Color Input */}
                          <label
                            className="flex items-center gap-1 cursor-pointer px-1 py-0.5 rounded hover:bg-slate-800"
                            title="Text Color"
                          >
                            <input
                              type="color"
                              value={item.colorHex || '#0f172a'}
                              onChange={(e) => updateSelectedProperty({ colorHex: e.target.value })}
                              className="w-4 h-4 rounded border-0 cursor-pointer bg-transparent"
                            />
                          </label>

                          {/* Delete / Clear Text */}
                          <button
                            type="button"
                            onClick={handleDeleteSelected}
                            className="p-1 rounded text-red-400 hover:bg-red-950/60 hover:text-red-300"
                            title={item.isExistingTextEdit ? 'Delete / Clear Text' : 'Delete Text Box'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* CONTEXTUAL FLOATING TOOLBAR FOR SIGNATURE & IMAGE OBJECTS */}
                      {isSelected &&
                        (item.type === 'signature' || item.type === 'image') &&
                        !showFormsMenu &&
                        !showMoreMenu && (
                          <div
                            data-testid="floating-signature-toolbar"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            className={`absolute left-0 ${
                              toolbarBelow ? 'top-full mt-2' : 'bottom-full mb-2'
                            } z-50 flex items-center gap-1 bg-slate-950/95 border border-slate-700 rounded-xl px-2 py-1.5 shadow-2xl text-white whitespace-nowrap`}
                          >
                            <div
                              onMouseDown={(e) => handleStartDrag(e, item)}
                              title="Drag to move"
                              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-move flex items-center"
                            >
                              <Move className="w-3.5 h-3.5" />
                            </div>
                            <div className="h-4 w-px bg-slate-800 mx-0.5" />
                            {item.type === 'signature' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSigningFormFieldId(null);
                                  setReplacingSignatureTargetId(item.id);
                                  setShowSignaturePad(true);
                                }}
                                className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold flex items-center gap-1"
                                title="Open Signature Studio to type, draw, upload, or pick another signature"
                              >
                                <PenTool className="w-3 h-3" />
                                Change Signature
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setReplacingImageTargetId(item.id);
                                  imageInputRef.current?.click();
                                }}
                                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold flex items-center gap-1"
                              >
                                <Upload className="w-3 h-3" />
                                Replace Image
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedProperty({
                                  aspectRatioLocked: !item.aspectRatioLocked,
                                })
                              }
                              className={`px-1.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 ${
                                item.aspectRatioLocked
                                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/40'
                                  : 'bg-slate-900 text-slate-400 hover:text-white'
                              }`}
                              title="Toggle Aspect Ratio Lock when resizing corners"
                            >
                              {item.aspectRatioLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                              <span>Ratio</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedProperty({
                                  rotationDeg: (((item.rotationDeg || 0) - 15 + 360) % 360),
                                })
                              }
                              className="px-1.5 py-1 rounded hover:bg-slate-800 text-[11px] font-semibold text-slate-300 hover:text-white"
                              title="Rotate Counter-Clockwise (-15°)"
                            >
                              -15°
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedProperty({
                                  rotationDeg: (((item.rotationDeg || 0) + 15) % 360),
                                })
                              }
                              className="px-1.5 py-1 rounded hover:bg-slate-800 text-[11px] font-semibold text-slate-300 hover:text-white"
                              title="Rotate Clockwise (+15°)"
                            >
                              +15°
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedProperty({
                                  rotationDeg: (((item.rotationDeg || 0) + 90) % 360),
                                })
                              }
                              className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                              title="Rotate +90°"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={handleDuplicateSelected}
                              className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                              title="Duplicate"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={handleDeleteSelected}
                              className="p-1 rounded text-red-400 hover:bg-red-950/60 hover:text-red-300"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                      {/* ITEM RENDERING BY TYPE */}
                      {isTextObject && (
                        <div
                          style={{
                            backgroundColor: item.isExistingTextEdit
                              ? item.backgroundColorHex ||
                                item.fillHex ||
                                (strippedCanvasIds.has(item.id)
                                  ? 'transparent'
                                  : sampledBgColors[item.id] || 'transparent')
                              : item.type === 'comment'
                                ? item.fillHex || '#fef08a'
                                : item.backgroundColorHex || item.fillHex || 'transparent',
                          }}
                          className={`w-full h-full flex items-start overflow-visible ${
                            item.type === 'comment' ? 'p-1.5 rounded border border-amber-400/80 shadow-sm' : ''
                          }`}
                        >
                          {isEditingThis ? (
                            <textarea
                              ref={activeEditorInputRef}
                              data-testid="in-place-text-input"
                              value={item.text ?? ''}
                              onChange={(e) => {
                                const nextText = e.target.value;
                                const updates: Partial<EditorAnnotationItem> = { text: nextText };
                                // Auto-expand box width slightly if typed replacement text is longer than original
                                if (item.isExistingTextEdit) {
                                  const charCount = Math.max(1, nextText.length);
                                  const approxCharWidthPct =
                                    (((item.fontSize || 11) * 0.56) / Math.max(1, pageDimensions.width || 612)) * 100;
                                  const neededWidthPct = roundPct(charCount * approxCharWidthPct + 1.4);
                                  if (neededWidthPct > item.widthPercent) {
                                    updates.widthPercent = Math.min(95 - item.xPercent, neededWidthPct);
                                  }
                                }
                                updateSelectedProperty(updates);
                              }}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Escape') {
                                  if (editInitialText !== null) {
                                    updateSelectedProperty({ text: editInitialText });
                                  }
                                  setEditingId(null);
                                  setEditInitialText(null);
                                }
                              }}
                              style={{
                                fontFamily: cssFont,
                                fontSize: `${scaledFontPx}px`,
                                fontWeight: item.isBold ? 700 : 400,
                                fontStyle: item.isItalic ? 'italic' : 'normal',
                                textDecoration: textDecorations || 'none',
                                textAlign: item.textAlign || 'left',
                                color: item.colorHex || '#0f172a',
                                letterSpacing: item.letterSpacingPt
                                  ? `${item.letterSpacingPt * scaleFactor}px`
                                  : undefined,
                                lineHeight: item.lineHeightMultiplier || 1.15,
                              }}
                              className="w-full h-full min-h-[1.2em] bg-transparent resize-none focus:outline-none p-0 m-0 overflow-hidden select-text"
                            />
                          ) : (
                            <div
                              style={{
                                fontFamily: cssFont,
                                fontSize: `${scaledFontPx}px`,
                                fontWeight: item.isBold ? 700 : 400,
                                fontStyle: item.isItalic ? 'italic' : 'normal',
                                textDecoration: textDecorations || 'none',
                                textAlign: item.textAlign || 'left',
                                color: item.colorHex || '#0f172a',
                                letterSpacing: item.letterSpacingPt
                                  ? `${item.letterSpacingPt * scaleFactor}px`
                                  : undefined,
                                lineHeight: item.lineHeightMultiplier || 1.15,
                              }}
                              className="w-full h-full whitespace-pre-wrap break-words leading-tight"
                            >
                              {item.text === '' && item.isExistingTextEdit ? (
                                isSelected ? (
                                  <span className="text-[10px] italic text-slate-400 select-none">
                                    [Deleted text — click to type or Undo]
                                  </span>
                                ) : null
                              ) : (
                                item.text
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {item.type === 'highlight' && (
                        <div
                          className="w-full h-full rounded-xs"
                          style={{
                            backgroundColor: item.colorHex || '#facc15',
                            mixBlendMode: 'multiply',
                          }}
                        />
                      )}

                      {item.type === 'underline' && (
                        <div
                          className="w-full h-full flex items-end"
                          style={{
                            borderBottom: `${Math.max(2, item.strokeWidth || 2)}px solid ${
                              item.colorHex || '#dc2626'
                            }`,
                          }}
                        />
                      )}

                      {item.type === 'strikethrough' && (
                        <div className="w-full h-full flex items-center">
                          <div
                            className="w-full"
                            style={{
                              borderTop: `${Math.max(2, item.strokeWidth || 2)}px solid ${
                                item.colorHex || '#dc2626'
                              }`,
                            }}
                          />
                        </div>
                      )}

                      {(item.type === 'rectangle' || item.type === 'rounded-rect') && (
                        <div
                          className={`w-full h-full ${item.type === 'rounded-rect' ? 'rounded-xl' : ''}`}
                          style={{
                            border: `${item.strokeWidth || 2}px solid ${item.colorHex || '#dc2626'}`,
                            backgroundColor: item.fillHex || 'transparent',
                          }}
                        />
                      )}

                      {item.type === 'ellipse' && (
                        <div
                          className="w-full h-full rounded-full"
                          style={{
                            border: `${item.strokeWidth || 2}px solid ${item.colorHex || '#dc2626'}`,
                            backgroundColor: item.fillHex || 'transparent',
                          }}
                        />
                      )}

                      {(item.type === 'line' || item.type === 'arrow') && (
                        <div className="w-full h-full flex items-center">
                          <div
                            className="w-full relative"
                            style={{
                              height: `${item.strokeWidth || 2}px`,
                              backgroundColor: item.colorHex || '#dc2626',
                            }}
                          >
                            {item.type === 'arrow' && (
                              <div
                                className="absolute right-0 -top-1.5 w-3 h-3 border-t-2 border-r-2 rotate-45"
                                style={{ borderColor: item.colorHex || '#dc2626' }}
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {item.type === 'stamp' && (
                        <div
                          className="w-full h-full border-2 rounded flex items-center justify-center font-extrabold tracking-widest uppercase px-2 text-center"
                          style={{
                            borderColor: item.colorHex || '#dc2626',
                            color: item.colorHex || '#dc2626',
                            fontSize: `${Math.max(10, Math.round((item.fontSize || 14) * scaleFactor))}px`,
                            backgroundColor: 'rgba(255,255,255,0.85)',
                          }}
                        >
                          {item.stampLabel || item.text || 'APPROVED'}
                        </div>
                      )}

                      {item.type === 'watermark' && (
                        <div
                          className="w-full h-full flex items-center justify-center font-black tracking-widest uppercase select-none pointer-events-none"
                          style={{
                            color: item.colorHex || '#94a3b8',
                            fontSize: `${Math.max(18, Math.round((item.fontSize || 36) * scaleFactor))}px`,
                            transform: 'rotate(-25deg)',
                          }}
                        >
                          {item.text || 'CONFIDENTIAL'}
                        </div>
                      )}

                      {item.type === 'redact' && (
                        <div
                          className="w-full h-full"
                          style={{
                            backgroundColor: item.colorHex || '#000000',
                          }}
                        />
                      )}

                      {(item.type === 'signature' || item.type === 'image') && item.imageDataUrl && (
                        <img
                          src={item.imageDataUrl}
                          alt={item.type}
                          style={{
                            transform: item.rotationDeg ? `rotate(${item.rotationDeg}deg)` : undefined,
                          }}
                          className="w-full h-full object-contain pointer-events-none select-none"
                          draggable={false}
                        />
                      )}

                      {/* SYMBOLS RENDERING (✓, ✕, •, ◯, ☑) */}
                      {(item.type === 'symbol-check' ||
                        item.type === 'symbol-cross' ||
                        item.type === 'symbol-dot' ||
                        item.type === 'symbol-circle' ||
                        item.type === 'symbol-checkbox') && (
                        <div
                          style={{
                            color: item.colorHex || '#0f172a',
                            fontSize: `${Math.max(12, Math.round(displayHeightPx * (item.heightPercent / 100) * 0.85))}px`,
                          }}
                          className="w-full h-full flex items-center justify-center font-bold leading-none select-none"
                        >
                          {item.type === 'symbol-check' && '✓'}
                          {item.type === 'symbol-cross' && '✕'}
                          {item.type === 'symbol-dot' && '•'}
                          {item.type === 'symbol-circle' && (
                            <div
                              className="w-full h-full rounded-full"
                              style={{ border: `2px solid ${item.colorHex || '#0f172a'}` }}
                            />
                          )}
                          {item.type === 'symbol-checkbox' && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(item.id);
                                const next = annotations.map((a) =>
                                  a.id === item.id ? { ...a, checked: !(a.checked ?? true) } : a
                                );
                                pushAnnotationsState(next);
                              }}
                              className="w-full h-full flex items-center justify-center rounded-xs cursor-pointer"
                              style={{
                                border: `1.5px solid ${item.colorHex || '#0f172a'}`,
                                backgroundColor: 'rgba(255,255,255,0.85)',
                              }}
                            >
                              {(item.checked ?? true) ? '✓' : ''}
                            </div>
                          )}
                        </div>
                      )}

                      {/* INTERACTIVE ACROFORM FIELDS RENDERING ON CANVAS */}
                      {item.type.startsWith('form-') && (
                        <div
                          className="w-full h-full relative flex items-center"
                          style={{
                            backgroundColor: item.fillHex || (item.type === 'form-signature' ? '#fef2f2' : '#f0f9ff'),
                            border: `1.5px solid ${
                              item.strokeColorHex || (item.type === 'form-signature' ? '#dc2626' : '#0284c7')
                            }`,
                            borderRadius: item.type === 'form-radio' ? '9999px' : '3px',
                          }}
                        >
                          {/* Field Name & Tab Order Badge when in Form Edit Mode or Selected */}
                          {(formEditMode || isSelected) && (
                            <div className="absolute -top-4 left-0 z-40 flex items-center gap-1 bg-slate-900 text-sky-300 border border-sky-500/40 px-1.5 py-0.2 rounded text-[9px] font-mono whitespace-nowrap pointer-events-none shadow">
                              <span>#{item.tabOrder ?? 1}</span>
                              <span>{item.fieldName || item.type}</span>
                              {item.isRequired && <span className="text-red-400 font-bold">*</span>}
                            </div>
                          )}

                          {item.type === 'form-text' && (
                            <input
                              type="text"
                              aria-label={item.fieldName || 'Form Text Field'}
                              value={item.fieldValue ?? item.defaultValue ?? ''}
                              placeholder={item.fieldPlaceholder || item.fieldName || 'Enter text...'}
                              readOnly={item.isReadOnly}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(item.id);
                              }}
                              onChange={(e) => {
                                const val = e.target.value;
                                const next = annotations.map((a) =>
                                  a.id === item.id ? { ...a, fieldValue: val, defaultValue: val } : a
                                );
                                pushAnnotationsState(next);
                              }}
                              style={{
                                fontSize: `${Math.max(10, Math.round((item.fontSize || 11) * scaleFactor))}px`,
                                color: item.colorHex || '#0f172a',
                              }}
                              className="w-full h-full bg-transparent px-1.5 focus:outline-none select-text"
                            />
                          )}

                          {item.type === 'form-multiline' && (
                            <textarea
                              aria-label={item.fieldName || 'Form Multiline Field'}
                              value={item.fieldValue ?? item.defaultValue ?? ''}
                              placeholder={item.fieldPlaceholder || item.fieldName || 'Enter notes...'}
                              readOnly={item.isReadOnly}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(item.id);
                              }}
                              onChange={(e) => {
                                const val = e.target.value;
                                const next = annotations.map((a) =>
                                  a.id === item.id ? { ...a, fieldValue: val, defaultValue: val } : a
                                );
                                pushAnnotationsState(next);
                              }}
                              style={{
                                fontSize: `${Math.max(9, Math.round((item.fontSize || 11) * scaleFactor))}px`,
                                color: item.colorHex || '#0f172a',
                              }}
                              className="w-full h-full bg-transparent p-1 resize-none focus:outline-none select-text"
                            />
                          )}

                          {item.type === 'form-dropdown' && (
                            <select
                              aria-label={item.fieldName || 'Form Dropdown Field'}
                              value={
                                item.fieldValue ??
                                item.defaultValue ??
                                (item.dropdownOptions && item.dropdownOptions[0]) ??
                                ''
                              }
                              disabled={item.isReadOnly}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(item.id);
                              }}
                              onChange={(e) => {
                                const val = e.target.value;
                                const next = annotations.map((a) =>
                                  a.id === item.id ? { ...a, fieldValue: val, defaultValue: val } : a
                                );
                                pushAnnotationsState(next);
                              }}
                              style={{
                                fontSize: `${Math.max(9, Math.round((item.fontSize || 11) * scaleFactor))}px`,
                                color: item.colorHex || '#0f172a',
                              }}
                              className="w-full h-full bg-transparent px-1 focus:outline-none cursor-pointer"
                            >
                              {(item.dropdownOptions && item.dropdownOptions.length > 0
                                ? item.dropdownOptions
                                : ['Option 1', 'Option 2', 'Option 3']
                              ).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          )}

                          {item.type === 'form-checkbox' && (
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(item.id);
                                if (item.isReadOnly) return;
                                const next = annotations.map((a) =>
                                  a.id === item.id ? { ...a, checked: !a.checked } : a
                                );
                                pushAnnotationsState(next);
                              }}
                              className="w-full h-full flex items-center justify-center font-bold text-slate-900"
                            >
                              {item.checked ? '✓' : ''}
                            </button>
                          )}

                          {item.type === 'form-radio' && (
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(item.id);
                                if (item.isReadOnly) return;
                                const grp = item.radioGroupName || item.fieldName || 'radio_group_1';
                                const next = annotations.map((a) => {
                                  if (
                                    a.pageNumber === item.pageNumber &&
                                    a.type === 'form-radio' &&
                                    (a.radioGroupName || a.fieldName || 'radio_group_1') === grp
                                  ) {
                                    return { ...a, checked: a.id === item.id };
                                  }
                                  return a;
                                });
                                pushAnnotationsState(next);
                              }}
                              className="w-full h-full rounded-full flex items-center justify-center"
                            >
                              {item.checked && <span className="w-2/3 h-2/3 rounded-full bg-slate-900 block" />}
                            </button>
                          )}

                          {item.type === 'form-signature' && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(item.id);
                                setSigningFormFieldId(item.id);
                                setShowSignaturePad(true);
                              }}
                              className="w-full h-full flex items-center justify-center px-1 cursor-pointer overflow-hidden"
                              title="Click to sign this signature field"
                            >
                              {item.imageDataUrl ? (
                                <img
                                  src={item.imageDataUrl}
                                  alt="Field Signature"
                                  className="max-h-full max-w-full object-contain pointer-events-none"
                                />
                              ) : (
                                <span className="text-[10px] font-bold text-red-700 flex items-center gap-1 select-none">
                                  <PenTool className="w-3 h-3" />
                                  {item.fieldPlaceholder || 'Click to Sign'}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* RESIZE HANDLES WHEN SELECTED (compact text boxes use only right-edge handle so text is never obscured) */}
                      {isSelected && !isEditingThis && (
                        <>
                          {(isTextObject && item.widthPercent < 10
                            ? (['e'] as const)
                            : isTextObject
                              ? (['e', 'se'] as const)
                              : (['nw', 'ne', 'sw', 'se', 'e', 's'] as const)
                          ).map((handle) => {
                            const posClass =
                              handle === 'nw'
                                ? '-top-1.5 -left-1.5 cursor-nwse-resize'
                                : handle === 'ne'
                                  ? '-top-1.5 -right-1.5 cursor-nesw-resize'
                                  : handle === 'sw'
                                    ? '-bottom-1.5 -left-1.5 cursor-nesw-resize'
                                    : handle === 'se'
                                      ? '-bottom-1.5 -right-1.5 cursor-nwse-resize'
                                      : handle === 'e'
                                        ? 'top-1/2 -translate-y-1/2 -right-1.5 cursor-ew-resize'
                                        : '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize';
                            return (
                              <div
                                key={handle}
                                onMouseDown={(e) => handleStartResize(e, item, handle)}
                                className={`absolute w-2.5 h-2.5 bg-white border-2 border-red-600 rounded-full shadow ${posClass}`}
                              />
                            );
                          })}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        {/* RIGHT INSPECTOR PANEL: DYNAMIC PROPERTIES BASED ON SELECTED ELEMENT OR ACTIVE TOOL */}
        {pdfBytes && (
          <aside
            className={`${
              isInspectorOpen ? 'w-72' : 'w-10'
            } bg-slate-950 border-l border-slate-800 flex flex-col transition-all duration-200 shrink-0 z-10`}
          >
            <div className="p-2 border-b border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsInspectorOpen((prev) => !prev)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                title={isInspectorOpen ? 'Collapse Inspector' : 'Expand Inspector'}
              >
                {isInspectorOpen ? <ChevronRight className="w-4 h-4" /> : < Sliders className="w-4 h-4" />}
              </button>
              {isInspectorOpen && (
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
                  Inspector & Properties
                </span>
              )}
            </div>

            {isInspectorOpen && (
              <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
                {/* TOOL-SPECIFIC STAGING CONTROLS */}
                {activeTool === 'shape' && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2.5">
                    <span className="font-bold text-white block">Select Shape Type</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { id: 'rectangle', label: 'Rectangle', icon: Square },
                          { id: 'rounded-rect', label: 'Rounded', icon: Square },
                          { id: 'ellipse', label: 'Ellipse', icon: Circle },
                          { id: 'line', label: 'Line', icon: Minus },
                          { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
                        ] as const
                      ).map((sh) => {
                        const ShIcon = sh.icon;
                        return (
                          <button
                            key={sh.id}
                            type="button"
                            onClick={() => setActiveShapeType(sh.id)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium ${
                              activeShapeType === sh.id
                                ? 'bg-red-600/20 border-red-500 text-white'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <ShIcon className="w-3.5 h-3.5" />
                            {sh.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeTool === 'stamp' && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                    <span className="font-bold text-white block">Stamp Preset</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {['APPROVED', 'CONFIDENTIAL', 'DRAFT', 'FINAL', 'REJECTED', 'COMPLETED'].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setStampPreset(st)}
                          className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold ${
                            stampPreset === st
                              ? 'bg-red-600 border-red-500 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTool === 'crop' && (
                  <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-300 flex items-center gap-1.5">
                        <Crop className="w-3.5 h-3.5" />
                        Manual Page Crop
                      </span>
                      <span className="text-[10px] text-slate-400">Page {activePage}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Drag the handles on the PDF canvas or adjust exact crop percentages below.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Left X (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={90}
                          value={Math.round(draftCrop.xPercent)}
                          onChange={(e) =>
                            setDraftCrop((c) => ({
                              ...c,
                              xPercent: Math.max(0, Math.min(90, Number(e.target.value) || 0)),
                            }))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Top Y (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={90}
                          value={Math.round(draftCrop.yPercent)}
                          onChange={(e) =>
                            setDraftCrop((c) => ({
                              ...c,
                              yPercent: Math.max(0, Math.min(90, Number(e.target.value) || 0)),
                            }))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Width (%)</label>
                        <input
                          type="number"
                          min={5}
                          max={100}
                          value={Math.round(draftCrop.widthPercent)}
                          onChange={(e) =>
                            setDraftCrop((c) => ({
                              ...c,
                              widthPercent: Math.max(5, Math.min(100 - c.xPercent, Number(e.target.value) || 50)),
                            }))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Height (%)</label>
                        <input
                          type="number"
                          min={5}
                          max={100}
                          value={Math.round(draftCrop.heightPercent)}
                          onChange={(e) =>
                            setDraftCrop((c) => ({
                              ...c,
                              heightPercent: Math.max(5, Math.min(100 - c.yPercent, Number(e.target.value) || 50)),
                            }))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleApplyCrop(false)}
                        className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                      >
                        Apply Crop to Page {activePage}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyCrop(true)}
                        className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700"
                      >
                        Apply Crop to All Pages
                      </button>
                      {Object.keys(pageCrops).length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleResetCrop(true)}
                          className="w-full py-1.5 rounded-lg bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white text-xs border border-slate-800"
                        >
                          Reset All Page Crops
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* DYNAMIC SELECTED OBJECT PROPERTIES */}
                {selectedAnnotation ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 block">
                          {selectedAnnotation.isExistingTextEdit
                            ? 'Existing PDF Text'
                            : `${selectedAnnotation.type} Object`}
                        </span>
                        <span className="text-[11px] text-slate-400">Page {selectedAnnotation.pageNumber}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {!selectedAnnotation.isExistingTextEdit && (
                          <button
                            type="button"
                            onClick={handleDuplicateSelected}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                            title="Duplicate Object"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleDeleteSelected}
                          className="p-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/80 text-red-300"
                          title={selectedAnnotation.isExistingTextEdit ? 'Clear / Remove Text' : 'Delete Object'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* TEXT & EXISTING TEXT PROPERTIES */}
                    {(selectedAnnotation.type === 'text' ||
                      selectedAnnotation.type === 'comment' ||
                      selectedAnnotation.type === 'watermark' ||
                      selectedAnnotation.isExistingTextEdit) && (
                      <div className="space-y-3">
                        {selectedAnnotation.isExistingTextEdit && selectedAnnotation.originalText && (
                          <div className="bg-slate-950 border border-slate-800 rounded-lg p-2 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] text-slate-500 block">Original PDF Text:</span>
                              <span className="text-[11px] text-slate-300 truncate block">
                                {selectedAnnotation.originalText}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedProperty({
                                  text: selectedAnnotation.originalText,
                                  xPercent: selectedAnnotation.originXPercent ?? selectedAnnotation.xPercent,
                                  yPercent: selectedAnnotation.originYPercent ?? selectedAnnotation.yPercent,
                                })
                              }
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 shrink-0"
                              title="Restore original text and position"
                            >
                              Revert
                            </button>
                          </div>
                        )}

                        <div className="space-y-1">
                          <label className="text-slate-400 font-medium block">Text Content</label>
                          <textarea
                            rows={3}
                            value={selectedAnnotation.text ?? ''}
                            onChange={(e) => updateSelectedProperty({ text: e.target.value })}
                            placeholder={
                              selectedAnnotation.isExistingTextEdit
                                ? 'Leave blank to delete original text...'
                                : 'Enter text...'
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-red-500"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-slate-400 font-medium block">Font Family</label>
                            <select
                              value={selectedAnnotation.fontFamily || 'Helvetica'}
                              onChange={(e) =>
                                updateSelectedProperty({
                                  fontFamily: e.target.value as 'Helvetica' | 'TimesRoman' | 'Courier',
                                })
                              }
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white text-xs"
                            >
                              <option value="Helvetica">Helvetica (Sans)</option>
                              <option value="TimesRoman">Times Roman (Serif)</option>
                              <option value="Courier">Courier (Mono)</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-slate-400 font-medium block">
                              Font Size ({selectedAnnotation.fontSize || 12}pt)
                            </label>
                            <input
                              type="number"
                              min={6}
                              max={72}
                              value={selectedAnnotation.fontSize || 12}
                              onChange={(e) =>
                                updateSelectedProperty({
                                  fontSize: Math.max(6, Math.min(72, Number(e.target.value) || 12)),
                                })
                              }
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white text-xs"
                            />
                          </div>
                        </div>

                        {/* Formatting & Alignment Buttons */}
                        <div className="space-y-1">
                          <label className="text-slate-400 font-medium block">Formatting & Alignment</label>
                          <div className="flex items-center justify-between gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateSelectedProperty({ isBold: !selectedAnnotation.isBold })}
                                className={`p-1.5 rounded ${
                                  selectedAnnotation.isBold
                                    ? 'bg-red-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                                title="Bold"
                              >
                                <Bold className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => updateSelectedProperty({ isItalic: !selectedAnnotation.isItalic })}
                                className={`p-1.5 rounded ${
                                  selectedAnnotation.isItalic
                                    ? 'bg-red-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                                title="Italic"
                              >
                                <Italic className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateSelectedProperty({ isUnderline: !selectedAnnotation.isUnderline })
                                }
                                className={`p-1.5 rounded ${
                                  selectedAnnotation.isUnderline
                                    ? 'bg-red-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                                title="Underline"
                              >
                                <UnderlineIcon className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateSelectedProperty({ isStrikethrough: !selectedAnnotation.isStrikethrough })
                                }
                                className={`p-1.5 rounded ${
                                  selectedAnnotation.isStrikethrough
                                    ? 'bg-red-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                                title="Strikethrough"
                              >
                                <StrikethroughIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="h-4 w-px bg-slate-800" />
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateSelectedProperty({ textAlign: 'left' })}
                                className={`p-1.5 rounded ${
                                  (selectedAnnotation.textAlign || 'left') === 'left'
                                    ? 'bg-slate-800 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                                title="Align Left"
                              >
                                <AlignLeft className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => updateSelectedProperty({ textAlign: 'center' })}
                                className={`p-1.5 rounded ${
                                  selectedAnnotation.textAlign === 'center'
                                    ? 'bg-slate-800 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                                title="Align Center"
                              >
                                <AlignCenter className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => updateSelectedProperty({ textAlign: 'right' })}
                                className={`p-1.5 rounded ${
                                  selectedAnnotation.textAlign === 'right'
                                    ? 'bg-slate-800 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                                title="Align Right"
                              >
                                <AlignRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Character & Line Spacing */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-slate-400 font-medium block">
                              Char Spacing ({selectedAnnotation.letterSpacingPt || 0}pt)
                            </label>
                            <input
                              type="number"
                              step={0.5}
                              min={-2}
                              max={20}
                              value={selectedAnnotation.letterSpacingPt || 0}
                              onChange={(e) =>
                                updateSelectedProperty({ letterSpacingPt: Number(e.target.value) || 0 })
                              }
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-slate-400 font-medium block">
                              Line Height ({selectedAnnotation.lineHeightMultiplier || 1.2}×)
                            </label>
                            <input
                              type="number"
                              step={0.1}
                              min={0.8}
                              max={3}
                              value={selectedAnnotation.lineHeightMultiplier || 1.2}
                              onChange={(e) =>
                                updateSelectedProperty({ lineHeightMultiplier: Number(e.target.value) || 1.2 })
                              }
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white"
                            />
                          </div>
                        </div>
                        {/* Optional Background Fill Control for Text / Existing Text */}
                        <div className="pt-1 border-t border-slate-800 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 font-medium">Background Fill</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  updateSelectedProperty({
                                    fillHex: undefined,
                                    backgroundColorHex: undefined,
                                  })
                                }
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  !selectedAnnotation.fillHex && !selectedAnnotation.backgroundColorHex
                                    ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300'
                                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                                }`}
                                title="Preserve original PDF background without drawing a color box"
                              >
                                Preserve Original (Transparent)
                              </button>
                              <input
                                type="color"
                                title="Set explicit custom background fill color"
                                value={selectedAnnotation.fillHex || selectedAnnotation.backgroundColorHex || '#ffffff'}
                                onChange={(e) =>
                                  updateSelectedProperty({
                                    fillHex: e.target.value,
                                    backgroundColorHex: e.target.value,
                                  })
                                }
                                className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* IMAGE / SIGNATURE SPECIFIC PROPERTIES */}
                    {(selectedAnnotation.type === 'image' || selectedAnnotation.type === 'signature') && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Lock Aspect Ratio</span>
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedProperty({
                                aspectRatioLocked: !selectedAnnotation.aspectRatioLocked,
                              })
                            }
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                              selectedAnnotation.aspectRatioLocked
                                ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300'
                                : 'bg-slate-950 border-slate-800 text-slate-400'
                            }`}
                          >
                            {selectedAnnotation.aspectRatioLocked ? (
                              <>
                                <Lock className="w-3 h-3" /> Locked
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3 h-3" /> Unlocked
                              </>
                            )}
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-slate-400 font-medium">
                              Rotation ({selectedAnnotation.rotationDeg || 0}°)
                            </label>
                            <button
                              type="button"
                              onClick={() => updateSelectedProperty({ rotationDeg: 0 })}
                              className="text-[10px] text-slate-400 hover:text-white"
                            >
                              Reset 0°
                            </button>
                          </div>
                          <input
                            type="range"
                            min={-180}
                            max={180}
                            step={1}
                            value={
                              (selectedAnnotation.rotationDeg || 0) > 180
                                ? (selectedAnnotation.rotationDeg || 0) - 360
                                : selectedAnnotation.rotationDeg || 0
                            }
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              updateSelectedProperty({ rotationDeg: (val + 360) % 360 });
                            }}
                            className="w-full accent-red-600"
                          />
                          <div className="grid grid-cols-4 gap-1">
                            {[0, 90, 180, 270].map((deg) => (
                              <button
                                key={deg}
                                type="button"
                                onClick={() => updateSelectedProperty({ rotationDeg: deg })}
                                className={`py-1 rounded border text-[11px] font-semibold ${
                                  (selectedAnnotation.rotationDeg || 0) === deg
                                    ? 'bg-red-600 border-red-500 text-white'
                                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                                }`}
                              >
                                {deg}°
                              </button>
                            ))}
                          </div>
                        </div>

                        {selectedAnnotation.type === 'signature' && (
                          <div className="space-y-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSigningFormFieldId(null);
                                setReplacingSignatureTargetId(selectedAnnotation.id);
                                setShowSignaturePad(true);
                              }}
                              className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold border border-red-500 flex items-center justify-center gap-1.5 shadow-sm"
                            >
                              <PenTool className="w-3.5 h-3.5" />
                              Change / Edit Signature
                            </button>
                            <p className="text-[10px] text-slate-400 leading-relaxed bg-slate-950 border border-slate-800/80 rounded-lg p-2">
                              Embedded as a high-resolution transparent PNG electronic signature appearance. (Not a hardware PKI/PAdES cryptographic certificate.)
                            </p>
                          </div>
                        )}

                        {selectedAnnotation.type === 'image' && (
                          <button
                            type="button"
                            onClick={() => {
                              setReplacingImageTargetId(selectedAnnotation.id);
                              imageInputRef.current?.click();
                            }}
                            className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700 flex items-center justify-center gap-1.5"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Replace Image
                          </button>
                        )}
                      </div>
                    )}

                    {/* STROKE WIDTH FOR SHAPES & LINES */}
                    {(selectedAnnotation.type === 'rectangle' ||
                      selectedAnnotation.type === 'rounded-rect' ||
                      selectedAnnotation.type === 'ellipse' ||
                      selectedAnnotation.type === 'line' ||
                      selectedAnnotation.type === 'arrow' ||
                      selectedAnnotation.type === 'underline' ||
                      selectedAnnotation.type === 'strikethrough') && (
                      <div className="space-y-1">
                        <label className="text-slate-400 font-medium block">
                          Border / Line Thickness ({selectedAnnotation.strokeWidth || 2}px)
                        </label>
                        <input
                          type="range"
                          min={1}
                          max={12}
                          value={selectedAnnotation.strokeWidth || 2}
                          onChange={(e) => updateSelectedProperty({ strokeWidth: Number(e.target.value) })}
                          className="w-full accent-red-600"
                        />
                      </div>
                    )}

                    {/* COLOR PICKER FOR NON-IMAGE OBJECTS */}
                    {selectedAnnotation.type !== 'signature' && selectedAnnotation.type !== 'image' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-slate-400 font-medium">Primary Color</label>
                          <input
                            type="color"
                            value={selectedAnnotation.colorHex || '#0f172a'}
                            onChange={(e) => updateSelectedProperty({ colorHex: e.target.value })}
                            className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            '#0f172a',
                            '#dc2626',
                            '#2563eb',
                            '#16a34a',
                            '#d97706',
                            '#7c3aed',
                            '#facc15',
                            '#ffffff',
                          ].map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              onClick={() => updateSelectedProperty({ colorHex: hex })}
                              className={`w-5 h-5 rounded-full border ${
                                selectedAnnotation.colorHex === hex
                                  ? 'ring-2 ring-white scale-110'
                                  : 'border-slate-700'
                              }`}
                              style={{ backgroundColor: hex }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* POSITION & DIMENSIONS */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Pos X (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={98}
                          value={Math.round(selectedAnnotation.xPercent)}
                          onChange={(e) =>
                            updateSelectedProperty({
                              xPercent: Math.max(0, Math.min(98, Number(e.target.value) || 0)),
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Pos Y (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={98}
                          value={Math.round(selectedAnnotation.yPercent)}
                          onChange={(e) =>
                            updateSelectedProperty({
                              yPercent: Math.max(0, Math.min(98, Number(e.target.value) || 0)),
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Width (%)</label>
                        <input
                          type="number"
                          min={2}
                          max={100}
                          value={Math.round(selectedAnnotation.widthPercent)}
                          onChange={(e) => {
                            const nextW = Math.max(2, Math.min(100, Number(e.target.value) || 10));
                            if (
                              selectedAnnotation.aspectRatioLocked &&
                              (selectedAnnotation.type === 'image' || selectedAnnotation.type === 'signature')
                            ) {
                              const ratio =
                                selectedAnnotation.widthPercent / Math.max(1, selectedAnnotation.heightPercent);
                              updateSelectedProperty({
                                widthPercent: nextW,
                                heightPercent: Math.max(2, roundPct(nextW / ratio)),
                              });
                            } else {
                              updateSelectedProperty({ widthPercent: nextW });
                            }
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Height (%)</label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={Math.round(selectedAnnotation.heightPercent)}
                          onChange={(e) =>
                            updateSelectedProperty({
                              heightPercent: Math.max(1, Math.min(100, Number(e.target.value) || 5)),
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white"
                        />
                      </div>
                    </div>

                    {/* INTERACTIVE ACROFORM FIELD CONFIGURATION IN INSPECTOR */}
                    {selectedAnnotation.type.startsWith('form-') && (
                      <div className="space-y-3 border-t border-slate-800 pt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                            AcroForm Field Settings
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            Tab #{selectedAnnotation.tabOrder ?? 1}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <label className="text-slate-400 font-medium block">Field Name (AcroForm ID)</label>
                          <input
                            type="text"
                            value={selectedAnnotation.fieldName || ''}
                            onChange={(e) => updateSelectedProperty({ fieldName: e.target.value })}
                            placeholder="e.g. client_full_name"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono text-xs"
                          />
                        </div>

                        {(selectedAnnotation.type === 'form-text' ||
                          selectedAnnotation.type === 'form-multiline' ||
                          selectedAnnotation.type === 'form-signature') && (
                          <div className="space-y-1">
                            <label className="text-slate-400 font-medium block">Placeholder / Label</label>
                            <input
                              type="text"
                              value={selectedAnnotation.fieldPlaceholder || ''}
                              onChange={(e) => updateSelectedProperty({ fieldPlaceholder: e.target.value })}
                              placeholder="Enter placeholder..."
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white text-xs"
                            />
                          </div>
                        )}

                        {(selectedAnnotation.type === 'form-text' ||
                          selectedAnnotation.type === 'form-multiline') && (
                          <div className="space-y-1">
                            <label className="text-slate-400 font-medium block">Field Value / Default Value</label>
                            <input
                              type="text"
                              value={selectedAnnotation.fieldValue ?? selectedAnnotation.defaultValue ?? ''}
                              onChange={(e) =>
                                updateSelectedProperty({
                                  fieldValue: e.target.value,
                                  defaultValue: e.target.value,
                                })
                              }
                              placeholder="Default text..."
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white text-xs"
                            />
                          </div>
                        )}

                        {selectedAnnotation.type === 'form-dropdown' && (
                          <div className="space-y-1.5">
                            <label className="text-slate-400 font-medium block">
                              Dropdown Options (one per line)
                            </label>
                            <textarea
                              rows={4}
                              value={(selectedAnnotation.dropdownOptions || ['Option 1', 'Option 2']).join('\n')}
                              onChange={(e) => {
                                const opts = e.target.value
                                  .split('\n')
                                  .map((s) => s.trim())
                                  .filter(Boolean);
                                updateSelectedProperty({
                                  dropdownOptions: opts.length > 0 ? opts : ['Option 1'],
                                  fieldValue: opts[0] || 'Option 1',
                                });
                              }}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs font-mono"
                            />
                          </div>
                        )}

                        {selectedAnnotation.type === 'form-radio' && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-slate-400 font-medium block">Radio Group</label>
                              <input
                                type="text"
                                value={selectedAnnotation.radioGroupName || 'radio_group_1'}
                                onChange={(e) =>
                                  updateSelectedProperty({
                                    radioGroupName: e.target.value,
                                    fieldName: e.target.value,
                                  })
                                }
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white text-xs font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-slate-400 font-medium block">Option Value</label>
                              <input
                                type="text"
                                value={selectedAnnotation.radioOptionValue || 'Option_1'}
                                onChange={(e) => updateSelectedProperty({ radioOptionValue: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white text-xs font-mono"
                              />
                            </div>
                          </div>
                        )}

                        {(selectedAnnotation.type === 'form-checkbox' ||
                          selectedAnnotation.type === 'form-radio') && (
                          <label className="flex items-center justify-between cursor-pointer pt-1">
                            <span className="text-slate-300">Checked by Default</span>
                            <input
                              type="checkbox"
                              checked={Boolean(selectedAnnotation.checked)}
                              onChange={(e) => updateSelectedProperty({ checked: e.target.checked })}
                              className="rounded accent-red-600"
                            />
                          </label>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedAnnotation.isRequired)}
                              onChange={(e) => updateSelectedProperty({ isRequired: e.target.checked })}
                              className="rounded accent-red-600"
                            />
                            <span>Required</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedAnnotation.isReadOnly)}
                              onChange={(e) => updateSelectedProperty({ isReadOnly: e.target.checked })}
                              className="rounded accent-red-600"
                            />
                            <span>Read-Only</span>
                          </label>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-slate-400">Tab Order Position</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveTabOrder(selectedAnnotation.id, 'up')}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                              title="Move Earlier in Tab Order"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveTabOrder(selectedAnnotation.id, 'down')}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                              title="Move Later in Tab Order"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* OPACITY SLIDER */}
                    <div className="space-y-1">
                      <label className="text-slate-400 font-medium block">
                        Opacity ({Math.round((selectedAnnotation.opacity ?? 1) * 100)}%)
                      </label>
                      <input
                        type="range"
                        min={15}
                        max={100}
                        value={Math.round((selectedAnnotation.opacity ?? 1) * 100)}
                        onChange={(e) => updateSelectedProperty({ opacity: Number(e.target.value) / 100 })}
                        className="w-full accent-red-600"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 text-center text-slate-400 space-y-2">
                    <MousePointer className="w-5 h-5 mx-auto text-slate-500" />
                    <p className="font-semibold text-slate-300">Direct Canvas Editing</p>
                    <p className="text-[11px] leading-relaxed">
                      Click any existing text line on the PDF canvas to edit it directly in-place, or use the <strong>Forms</strong> menu to add fillable fields, checkmarks, or shareable Fill &amp; Sign links.
                    </p>
                  </div>
                )}

                {/* Document Summary & Quick Actions */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 space-y-2 text-[11px] text-slate-400">
                  <div className="flex justify-between">
                    <span>Active Page:</span>
                    <span className="font-semibold text-white">
                      {activePage} of {visibleThumbnails.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Page Size:</span>
                    <span className="font-mono text-slate-300">
                      {Math.round(pageDimensions.width)} × {Math.round(pageDimensions.height)} pt
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Detected Text Blocks:</span>
                    <span className="font-semibold text-white">{pageTextLines.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Edits / Fields:</span>
                    <span className="font-semibold text-white">{annotations.length}</span>
                  </div>
                  {statusMessage && (
                    <p className="text-[11px] text-emerald-400 pt-1 border-t border-slate-800/80">
                      {statusMessage}
                    </p>
                  )}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* SIGNATURE BUILDER MODAL */}
      {showSignaturePad && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="signature-modal"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white text-slate-900 rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {signingFormFieldId
                    ? 'Sign Form Field'
                    : replacingSignatureTargetId
                      ? 'Replace Signature'
                      : 'Create Your Signature'}
                </h3>
                <p className="text-xs text-slate-500">
                  Type with 10 cursive styles, draw with smooth ink, upload an image, or capture with camera.
                </p>
              </div>
              <button
                type="button"
                data-testid="close-signature-modal"
                onClick={() => {
                  setSigningFormFieldId(null);
                  setReplacingSignatureTargetId(null);
                  setShowSignaturePad(false);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SignatureBuilder
              onSignatureReady={(dataUrl) => {
                // 1. Signing an interactive AcroForm signature field
                if (signingFormFieldId) {
                  const next = annotations.map((a) =>
                    a.id === signingFormFieldId ? { ...a, imageDataUrl: dataUrl } : a
                  );
                  pushAnnotationsState(next);
                  setSigningFormFieldId(null);
                  setShowSignaturePad(false);
                  setStatusMessage('Signed interactive signature field.');
                  return;
                }

                // Measure natural dimensions of the transparent signature PNG
                const finishPlacement = (natW: number, natH: number) => {
                  setPendingImageUrl(dataUrl);
                  setPendingImageSize({ width: natW, height: natH });
                  const sigAspect = Math.max(0.5, natW / Math.max(1, natH));
                  const pageAspect = (pageDimensions.width || 612) / Math.max(1, pageDimensions.height || 792);

                  // 2. Replacing an existing signature annotation on the canvas
                  if (replacingSignatureTargetId) {
                    const target = annotations.find((a) => a.id === replacingSignatureTargetId);
                    if (target) {
                      const nextHeightPct = target.aspectRatioLocked
                        ? roundPct(Math.min(45, Math.max(4, (target.widthPercent / sigAspect) * pageAspect)))
                        : target.heightPercent;
                      const next = annotations.map((a) =>
                        a.id === replacingSignatureTargetId
                          ? { ...a, imageDataUrl: dataUrl, heightPercent: nextHeightPct }
                          : a
                      );
                      pushAnnotationsState(next);
                      setSelectedId(replacingSignatureTargetId);
                    }
                    setReplacingSignatureTargetId(null);
                    setShowSignaturePad(false);
                    setActiveTool('select');
                    setStatusMessage('Updated signature on page.');
                    return;
                  }

                  // 3. Place new signature directly onto the active PDF page and select it immediately
                  const widthPct = 22;
                  const heightPct = roundPct(Math.min(35, Math.max(4.5, (widthPct / sigAspect) * pageAspect)));
                  const existingSigsOnPage = annotations.filter(
                    (a) => a.pageNumber === activePage && a.type === 'signature'
                  ).length;
                  const staggerOffset = (existingSigsOnPage % 4) * 3;
                  const newSigId = `sig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                  const newSigItem: EditorAnnotationItem = {
                    id: newSigId,
                    pageNumber: activePage,
                    type: 'signature',
                    xPercent: roundPct(Math.min(72, 38 + staggerOffset)),
                    yPercent: roundPct(Math.min(82, 62 + staggerOffset)),
                    widthPercent: roundPct(widthPct),
                    heightPercent: heightPct,
                    imageDataUrl: dataUrl,
                    aspectRatioLocked: true,
                    opacity: 1,
                    rotationDeg: 0,
                  };
                  pushAnnotationsState([...annotations, newSigItem]);
                  setSelectedId(newSigId);
                  setShowSignaturePad(false);
                  setActiveTool('select');
                  setIsInspectorOpen(true);
                  setStatusMessage(
                    'Signature placed on Page ' +
                      activePage +
                      '! Drag to position anywhere, or use corner handles to resize.'
                  );
                };

                const probeImg = new Image();
                probeImg.onload = () => {
                  finishPlacement(probeImg.naturalWidth || 360, probeImg.naturalHeight || 110);
                };
                probeImg.onerror = () => {
                  finishPlacement(360, 110);
                };
                probeImg.src = dataUrl;
              }}
            />
          </div>
        </div>
      )}

      {/* CANDIDATE FORM FIELD DETECTION CONFIRMATION MODAL */}
      {detectedCandidates !== null && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="detect-fields-modal"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold text-base text-white">Review Detected Form Fields</h3>
              </div>
              <button
                type="button"
                onClick={() => setDetectedCandidates(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detectedCandidates.length === 0 ? (
              <p className="text-xs text-slate-300 leading-relaxed">
                No automatic form field patterns (such as underscores, colons, or signature lines) were found on this PDF. You can place interactive fields manually from the <strong>Forms</strong> menu.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-300">
                  We detected <strong>{detectedCandidates.length}</strong> candidate form field(s). Confirm which fields you want to add to the document:
                </p>
                <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                  {detectedCandidates.map((cand) => (
                    <label
                      key={cand.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedCandidateIds[cand.id])}
                          onChange={(e) =>
                            setSelectedCandidateIds((prev) => ({
                              ...prev,
                              [cand.id]: e.target.checked,
                            }))
                          }
                          className="rounded accent-red-600"
                        />
                        <div className="min-w-0">
                          <span className="font-semibold text-white block truncate">{cand.label}</span>
                          <span className="text-[10px] font-mono text-slate-400">
                            Page {cand.pageNumber} • {cand.fieldName}
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-mono shrink-0">
                        {cand.fieldType.replace('form-', '')}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDetectedCandidates(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
              >
                Cancel
              </button>
              {detectedCandidates.length > 0 && (
                <button
                  type="button"
                  onClick={handleConfirmDetectedFields}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white"
                >
                  Add Selected Fields
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB ORDER MANAGER MODAL */}
      {showTabOrderModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white">Form Field Tab Order (Page {activePage})</h3>
              <button
                type="button"
                onClick={() => setShowTabOrderModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {(() => {
              const pageForms = annotations
                .filter((a) => a.pageNumber === activePage && a.type.startsWith('form-'))
                .sort((a, b) => (a.tabOrder ?? 999) - (b.tabOrder ?? 999));

              if (pageForms.length === 0) {
                return (
                  <p className="text-xs text-slate-400">
                    No interactive form fields exist on Page {activePage} yet. Add form fields from the <strong>Forms</strong> menu first.
                  </p>
                );
              }

              return (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {pageForms.map((f, idx) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-red-600/20 border border-red-500/40 text-red-300 font-mono font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <span className="font-semibold text-white block truncate">
                            {f.fieldName || f.type}
                          </span>
                          <span className="text-[10px] text-slate-400">{f.type.replace('form-', '')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveTabOrder(f.id, 'up')}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === pageForms.length - 1}
                          onClick={() => handleMoveTabOrder(f.id, 'down')}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowTabOrderModal(false)}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PUBLISH & SHARE FILLABLE FORM MODAL */}
      {showShareFormModal && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="share-form-modal"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base text-white">Publish &amp; Share Fillable Form</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowShareFormModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Generate a shareable link so recipients can fill out form fields, sign the PDF online in their browser, and download the completed document.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-medium block mb-1">Form Title</label>
                <input
                  type="text"
                  value={shareFormTitle}
                  onChange={(e) => setShareFormTitle(e.target.value)}
                  placeholder="e.g. Client Service Agreement"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Optional Access PIN</label>
                  <input
                    type="text"
                    value={shareFormPin}
                    onChange={(e) => setShareFormPin(e.target.value)}
                    placeholder="Leave blank for public"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Expires In (Days)</label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={shareFormDays}
                    onChange={(e) => setShareFormDays(Math.max(1, Math.min(90, Number(e.target.value) || 14)))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              {createdShareUrl && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700/60 space-y-2">
                  <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    Shareable Fill &amp; Sign Link Ready:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={createdShareUrl}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(createdShareUrl);
                        setStatusMessage('Copied share link to clipboard.');
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px]"
                    >
                      Copy
                    </button>
                    <a
                      href={createdShareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                      title="Open Fill & Sign Page"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowShareFormModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
              >
                Close
              </button>
              <button
                type="button"
                disabled={isCreatingShareLink}
                onClick={handleCreateSharedFormLink}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-xs font-bold text-white"
              >
                {isCreatingShareLink ? 'Publishing...' : 'Generate Shareable Link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL FOR PAGE DELETE OR DOCUMENT CLOSE */}
      {confirmDeleteModal && confirmDeleteModal.isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base text-white">
                  {confirmDeleteModal.isOnlyPage
                    ? 'Close and Clear Document?'
                    : `Delete Page ${confirmDeleteModal.pageNum}?`}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {confirmDeleteModal.isOnlyPage
                    ? 'This is the only remaining page in the document. Confirming will close this PDF and return you to the file upload screen.'
                    : `Are you sure you want to remove Page ${confirmDeleteModal.pageNum} from this PDF document?`}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmDeleteModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteOrClose}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white transition-colors shadow-lg shadow-red-600/20"
              >
                {confirmDeleteModal.isOnlyPage ? 'Close Document' : `Delete Page ${confirmDeleteModal.pageNum}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
