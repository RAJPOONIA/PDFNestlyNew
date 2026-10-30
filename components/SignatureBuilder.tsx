'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Eraser,
  Check,
  PenTool,
  Type,
  Upload,
  Camera,
  Undo2,
  Trash2,
  BookmarkCheck,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Crop,
  Sliders,
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export interface SavedSignatureItem {
  id: string;
  label: string;
  dataUrl: string;
  createdAt: string;
}

interface SignatureBuilderProps {
  onSignatureCreated?: (dataUrl: string) => void;
  onSignatureReady?: (dataUrl: string) => void;
  defaultSignerName?: string;
}

interface DrawnPoint {
  x: number;
  y: number;
}

interface DrawnStroke {
  points: DrawnPoint[];
  color: string;
  width: number;
}

export interface SignatureFontPreset {
  id: string;
  label: string;
  fontFamily: string;
  canvasFont: string;
  slantDeg: number;
  verticalScale: number;
}

export const SIGNATURE_FONT_PRESETS: SignatureFontPreset[] = [
  {
    id: 'dancing-script',
    label: 'Executive Cursive',
    fontFamily: '"Dancing Script", "Brush Script MT", "Segoe Script", cursive',
    canvasFont: 'italic 600 58px "Dancing Script", "Brush Script MT", "Segoe Script", Georgia, cursive',
    slantDeg: -4,
    verticalScale: 1,
  },
  {
    id: 'great-vibes',
    label: 'Calligraphic Formal',
    fontFamily: '"Great Vibes", "Snell Roundhand", "Apple Chancery", cursive',
    canvasFont: 'italic 62px "Great Vibes", "Snell Roundhand", "Apple Chancery", Georgia, serif',
    slantDeg: -6,
    verticalScale: 1.05,
  },
  {
    id: 'alex-brush',
    label: 'Classic Fountain Pen',
    fontFamily: '"Alex Brush", "Edwardian Script ITC", "Palatino Linotype", cursive',
    canvasFont: 'italic 62px "Alex Brush", "Palatino Linotype", "Book Antiqua", Georgia, serif',
    slantDeg: -9,
    verticalScale: 1.02,
  },
  {
    id: 'sacramento',
    label: 'Fine Nib Script',
    fontFamily: '"Sacramento", "Freestyle Script", "Zapfino", cursive',
    canvasFont: 'italic 62px "Sacramento", "Freestyle Script", Georgia, cursive',
    slantDeg: -7,
    verticalScale: 1.08,
  },
  {
    id: 'allura',
    label: 'Legal Signatory',
    fontFamily: '"Allura", " Kunstler Script", "Apple Chancery", cursive',
    canvasFont: 'italic 64px "Allura", "Apple Chancery", Georgia, cursive',
    slantDeg: -5,
    verticalScale: 1.04,
  },
  {
    id: 'satisfy',
    label: 'Fluid Ballpoint',
    fontFamily: '"Satisfy", "Bradley Hand", "Segoe Script", cursive',
    canvasFont: 'italic 54px "Satisfy", "Bradley Hand", "Segoe Script", cursive',
    slantDeg: -4,
    verticalScale: 0.98,
  },
  {
    id: 'pacifico',
    label: 'Modern Rollerball',
    fontFamily: '"Pacifico", "Bradley Hand", "Lucida Handwriting", cursive',
    canvasFont: '50px "Pacifico", "Bradley Hand", "Lucida Handwriting", cursive',
    slantDeg: -2,
    verticalScale: 0.95,
  },
  {
    id: 'caveat',
    label: 'Natural Handwritten',
    fontFamily: '"Caveat", "Segoe Print", "Comic Sans MS", cursive',
    canvasFont: 'bold 60px "Caveat", "Segoe Print", cursive',
    slantDeg: -3,
    verticalScale: 1,
  },
  {
    id: 'kaushan-script',
    label: 'Bold Felt Tip',
    fontFamily: '"Kaushan Script", "Brush Script MT", cursive',
    canvasFont: 'italic 52px "Kaushan Script", "Brush Script MT", Georgia, cursive',
    slantDeg: -6,
    verticalScale: 0.98,
  },
  {
    id: 'marck-script',
    label: 'Personal Autograph',
    fontFamily: '"Marck Script", "Lucida Handwriting", "Segoe Script", cursive',
    canvasFont: 'italic 56px "Marck Script", "Lucida Handwriting", Georgia, cursive',
    slantDeg: -5,
    verticalScale: 1.02,
  },
];

export const INK_COLORS = [
  { id: 'black', label: 'Ink Black', hex: '#0f172a' },
  { id: 'blue', label: 'Royal Blue', hex: '#1d4ed8' },
  { id: 'navy', label: 'Fountain Navy', hex: '#1e3a8a' },
  { id: 'crimson', label: 'Crimson Red', hex: '#b91c1c' },
  { id: 'emerald', label: 'Emerald Ink', hex: '#047857' },
  { id: 'purple', label: 'Imperial Purple', hex: '#6d28d9' },
];

export function getScopedSignaturesStorageKey(uid?: string | null): string {
  return uid ? `pdfnestly_saved_signatures_u_${uid}` : 'pdfnestly_saved_signatures_v1';
}

/**
 * Auto-trims excess transparent whitespace around a signature canvas so the exported PNG
 * fits its bounding box tightly with clean padding.
 */
function trimCanvasTransparentBounds(sourceCanvas: HTMLCanvasElement, paddingPx = 14): string {
  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) return sourceCanvas.toDataURL('image/png');

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const imgData = ctx.getImageData(0, 0, w, h).data;

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let foundInk = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = imgData[(y * w + x) * 4 + 3];
      if (alpha > 12) {
        foundInk = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!foundInk) {
    return sourceCanvas.toDataURL('image/png');
  }

  const cropX = Math.max(0, minX - paddingPx);
  const cropY = Math.max(0, minY - paddingPx);
  const cropW = Math.min(w - cropX, maxX - minX + 1 + paddingPx * 2);
  const cropH = Math.min(h - cropY, maxY - minY + 1 + paddingPx * 2);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = Math.max(80, cropW);
  outCanvas.height = Math.max(36, cropH);
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return sourceCanvas.toDataURL('image/png');

  outCtx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return outCanvas.toDataURL('image/png');
}

export function SignatureBuilder({
  onSignatureCreated,
  onSignatureReady,
  defaultSignerName = 'Alex Morgan',
}: SignatureBuilderProps) {
  const [activeTab, setActiveTab] = useState<'type' | 'draw' | 'upload' | 'camera'>('type');
  const [typedName, setTypedName] = useState(defaultSignerName);
  const [selectedFontId, setSelectedFontId] = useState<string>(SIGNATURE_FONT_PRESETS[0].id);
  const [strokeColor, setStrokeColor] = useState('#1d4ed8');
  const [strokeWidth, setStrokeWidth] = useState<number>(3.2);
  const [includeDate, setIncludeDate] = useState(false);
  const [includeFlourish, setIncludeFlourish] = useState(true);
  const [saveForFuture, setSaveForFuture] = useState(true);
  const [currentUserUid, setCurrentUserUid] = useState<string | null>(auth?.currentUser?.uid ?? null);
  const [savedSignatures, setSavedSignatures] = useState<SavedSignatureItem[]>([]);

  // Live preview canvas ref for Type tab
  const typedPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Draw tab state
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState<DrawnStroke[]>([]);
  const currentPointsRef = useRef<DrawnPoint[]>([]);

  // Upload tab state
  const [uploadedRawUrl, setUploadedRawUrl] = useState<string | null>(null);
  const [uploadedProcessedUrl, setUploadedProcessedUrl] = useState<string | null>(null);
  const [autoRemoveBg, setAutoRemoveBg] = useState<boolean>(true);
  const [bgThreshold, setBgThreshold] = useState<number>(225);
  const [cropInsetPct, setCropInsetPct] = useState<{ top: number; bottom: number; left: number; right: number }>({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });

  // Camera tab state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'requesting' | 'streaming' | 'captured' | 'error'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedRawUrl, setCapturedRawUrl] = useState<string | null>(null);
  const [capturedProcessedUrl, setCapturedProcessedUrl] = useState<string | null>(null);
  const [cameraHighContrast, setCameraHighContrast] = useState<boolean>(true);
  const [cameraCropPct, setCameraCropPct] = useState<{ top: number; bottom: number; left: number; right: number }>({
    top: 6,
    bottom: 6,
    left: 6,
    right: 6,
  });

  // Track authenticated user for private per-user saved signatures
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUserUid(u?.uid ?? null);
    });
    return () => unsub();
  }, []);

  // Load Google Fonts for 10 distinct handwritten/cursive signature styles + load scoped saved signatures
  useEffect(() => {
    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
      const linkId = 'pdfnestly-signature-google-fonts-v2';
      if (!document.getElementById(linkId) && navigator.onLine !== false) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 800);
        fetch(
          'https://fonts.googleapis.com/css2?family=Alex+Brush&family=Allura&family=Caveat:wght@600&family=Dancing+Script:wght@600&family=Great+Vibes&family=Kaushan+Script&family=Marck+Script&family=Pacifico&family=Sacramento&family=Satisfy&display=swap',
          { mode: 'no-cors', signal: controller.signal }
        )
          .then(() => {
            window.clearTimeout(timeoutId);
            if (!document.getElementById(linkId)) {
              const link = document.createElement('link');
              link.id = linkId;
              link.rel = 'stylesheet';
              link.href =
                'https://fonts.googleapis.com/css2?family=Alex+Brush&family=Allura&family=Caveat:wght@600&family=Dancing+Script:wght@600&family=Great+Vibes&family=Kaushan+Script&family=Marck+Script&family=Pacifico&family=Sacramento&family=Satisfy&display=swap';
              document.head.appendChild(link);
            }
          })
          .catch(() => {
            window.clearTimeout(timeoutId);
          });
      }
    }
    if (typeof window !== 'undefined') {
      try {
        const storageKey = getScopedSignaturesStorageKey(currentUserUid);
        const raw = window.localStorage.getItem(storageKey) || window.localStorage.getItem('pdfnestly_saved_signatures_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setSavedSignatures(parsed);
          }
        }
      } catch {
        // Ignore parse error
      }
    }
  }, [currentUserUid]);

  const emitSignature = useCallback(
    (dataUrl: string, labelForSave?: string) => {
      if (saveForFuture && typeof window !== 'undefined') {
        try {
          const item: SavedSignatureItem = {
            id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            label: labelForSave || typedName || 'Saved Signature',
            dataUrl,
            createdAt: new Date().toISOString().slice(0, 10),
          };
          const updated = [item, ...savedSignatures.filter((s) => s.dataUrl !== dataUrl)].slice(0, 10);
          setSavedSignatures(updated);
          const storageKey = getScopedSignaturesStorageKey(currentUserUid);
          window.localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch {
          // Ignore storage quota errors
        }
      }
      if (onSignatureCreated) onSignatureCreated(dataUrl);
      if (onSignatureReady) onSignatureReady(dataUrl);
    },
    [onSignatureCreated, onSignatureReady, saveForFuture, savedSignatures, typedName, currentUserUid]
  );

  // Render Typed Signature onto a canvas context (shared between live preview canvas and exported high-DPI PNG)
  const drawTypedSignatureToCanvas = useCallback(
    (targetCanvas: HTMLCanvasElement) => {
      const preset =
        SIGNATURE_FONT_PRESETS.find((p) => p.id === selectedFontId) || SIGNATURE_FONT_PRESETS[0];
      const ctx = targetCanvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

      const cleanName = typedName.trim() || 'Authorized Signer';
      ctx.save();
      ctx.translate(34, 96);
      ctx.rotate((preset.slantDeg * Math.PI) / 180);
      ctx.scale(1, preset.verticalScale);
      ctx.font = preset.canvasFont;
      ctx.fillStyle = strokeColor;
      ctx.fillText(cleanName, 0, 0);

      if (includeFlourish) {
        const textWidth = Math.min(540, Math.max(110, ctx.measureText(cleanName).width));
        ctx.strokeStyle = strokeColor;
        ctx.globalAlpha = 0.78;
        ctx.lineWidth = 2.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(4, 14);
        ctx.quadraticCurveTo(textWidth * 0.52, 4, textWidth * 0.94, 17);
        ctx.stroke();
      }
      ctx.restore();

      if (includeDate) {
        const dateStr = `Signed ${new Date().toISOString().slice(0, 10)}`;
        ctx.font = '600 13px Helvetica, Arial, sans-serif';
        ctx.fillStyle = '#475569';
        ctx.fillText(dateStr, 34, 152);
      }
    },
    [selectedFontId, typedName, strokeColor, includeFlourish, includeDate]
  );

  // Update live preview canvas in Type tab whenever name, font, color, or options change
  useEffect(() => {
    if (activeTab === 'type' && typedPreviewCanvasRef.current) {
      drawTypedSignatureToCanvas(typedPreviewCanvasRef.current);
      if (typeof document !== 'undefined' && 'fonts' in document) {
        document.fonts.ready
          .then(() => {
            if (typedPreviewCanvasRef.current) {
              drawTypedSignatureToCanvas(typedPreviewCanvasRef.current);
            }
          })
          .catch(() => {});
      }
    }
  }, [activeTab, drawTypedSignatureToCanvas]);

  // Stop camera stream when leaving camera tab or unmounting
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'camera') {
      stopCameraStream();
    }
    return () => {
      stopCameraStream();
    };
  }, [activeTab, stopCameraStream]);

  // Redraw freehand canvas whenever strokes change
  const renderStrokesToCanvas = useCallback(
    (targetCanvas: HTMLCanvasElement, strokeList: DrawnStroke[], activePoints: DrawnPoint[] = []) => {
      const ctx = targetCanvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

      const drawSinglePath = (pts: DrawnPoint[], color: string, width: number) => {
        if (pts.length === 0) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          return;
        }

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = (pts[i].x + pts[i + 1].x) / 2;
          const midY = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
        ctx.restore();
      };

      for (const s of strokeList) {
        drawSinglePath(s.points, s.color, s.width);
      }
      if (activePoints.length > 0) {
        drawSinglePath(activePoints, strokeColor, strokeWidth);
      }
    },
    [strokeColor, strokeWidth]
  );

  useEffect(() => {
    if (activeTab === 'draw' && drawCanvasRef.current) {
      renderStrokesToCanvas(drawCanvasRef.current, strokes, currentPointsRef.current);
    }
  }, [activeTab, strokes, renderStrokesToCanvas]);

  const getCanvasPoint = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ): DrawnPoint | null => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
    return {
      x: ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
  };

  const handleDrawStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const pt = getCanvasPoint(e);
    if (!pt || !drawCanvasRef.current) return;
    setIsDrawing(true);
    currentPointsRef.current = [pt];
    renderStrokesToCanvas(drawCanvasRef.current, strokes, currentPointsRef.current);
  };

  const handleDrawMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawCanvasRef.current) return;
    const pt = getCanvasPoint(e);
    if (!pt) return;
    currentPointsRef.current.push(pt);
    renderStrokesToCanvas(drawCanvasRef.current, strokes, currentPointsRef.current);
  };

  const handleDrawEnd = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPointsRef.current.length > 0) {
      const completed: DrawnStroke = {
        points: [...currentPointsRef.current],
        color: strokeColor,
        width: strokeWidth,
      };
      currentPointsRef.current = [];
      setStrokes((prev) => [...prev, completed]);
    }
  };

  const handleUndoStroke = () => {
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handleClearDraw = () => {
    currentPointsRef.current = [];
    setStrokes([]);
    if (drawCanvasRef.current) {
      const ctx = drawCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, drawCanvasRef.current.width, drawCanvasRef.current.height);
    }
  };

  // Process uploaded or camera image (crop + optional background transparency removal)
  const processSignatureBitmap = useCallback(
    (
      sourceUrl: string,
      removeWhiteBackground: boolean,
      threshold: number,
      crop: { top: number; bottom: number; left: number; right: number },
      onDone: (processedDataUrl: string) => void
    ) => {
      const img = new Image();
      img.onload = () => {
        const srcW = Math.max(1, img.naturalWidth);
        const srcH = Math.max(1, img.naturalHeight);
        const cropLeftPx = Math.floor((crop.left / 100) * srcW);
        const cropRightPx = Math.floor((crop.right / 100) * srcW);
        const cropTopPx = Math.floor((crop.top / 100) * srcH);
        const cropBottomPx = Math.floor((crop.bottom / 100) * srcH);

        const outW = Math.max(16, srcW - cropLeftPx - cropRightPx);
        const outH = Math.max(16, srcH - cropTopPx - cropBottomPx);

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, cropLeftPx, cropTopPx, outW, outH, 0, 0, outW, outH);

        if (removeWhiteBackground) {
          const imgData = ctx.getImageData(0, 0, outW, outH);
          const d = imgData.data;
          const softFloor = Math.max(120, threshold - 32);
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            const a = d[i + 3];
            if (a === 0) continue;
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            if (luminance >= threshold) {
              d[i + 3] = 0; // Turn light paper background transparent
            } else if (luminance > softFloor) {
              // Soft anti-aliased edge feathering
              d[i + 3] = Math.round(((threshold - luminance) / Math.max(1, threshold - softFloor)) * a);
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }

        onDone(trimCanvasTransparentBounds(canvas, 8));
      };
      img.src = sourceUrl;
    },
    []
  );

  useEffect(() => {
    if (uploadedRawUrl) {
      processSignatureBitmap(uploadedRawUrl, autoRemoveBg, bgThreshold, cropInsetPct, setUploadedProcessedUrl);
    }
  }, [uploadedRawUrl, autoRemoveBg, bgThreshold, cropInsetPct, processSignatureBitmap]);

  useEffect(() => {
    if (capturedRawUrl) {
      processSignatureBitmap(
        capturedRawUrl,
        cameraHighContrast,
        225,
        cameraCropPct,
        setCapturedProcessedUrl
      );
    }
  }, [capturedRawUrl, cameraHighContrast, cameraCropPct, processSignatureBitmap]);

  const handleUploadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCropInsetPct({ top: 0, bottom: 0, left: 0, right: 0 });
        setUploadedRawUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Start Camera
  const startCamera = async () => {
    setCameraError(null);
    setCameraStatus('requesting');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraStatus('error');
      setCameraError(
        'Camera API is not available in this browser environment. You can use the instant sample capture below or switch to the Upload tab.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 360 } },
      });
      streamRef.current = stream;
      setCameraStatus('streaming');
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      setCameraStatus('error');
      setCameraError(
        (err as Error)?.message ||
          'Camera permission was denied or no camera device was detected. You can generate a test camera capture below or upload a photo.'
      );
    }
  };

  const captureFromVideo = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth || 560;
    canvas.height = v.videoHeight || 220;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    setCapturedRawUrl(dataUrl);
    setCameraStatus('captured');
    stopCameraStream();
  };

  const simulateCameraPaperCapture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 580;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fcfcfc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(40, 118);
    ctx.rotate((-5 * Math.PI) / 180);
    ctx.font = 'italic 54px "Dancing Script", "Brush Script MT", Georgia, serif';
    ctx.fillStyle = strokeColor;
    ctx.fillText(typedName.trim() || 'Authorized Signer', 0, 0);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(6, 14);
    ctx.quadraticCurveTo(140, 2, 260, 18);
    ctx.stroke();
    ctx.restore();

    setCapturedRawUrl(canvas.toDataURL('image/png'));
    setCameraStatus('captured');
  };

  // Emit Typed Signature
  const handleConfirmTypedSignature = (overrideFontId?: string) => {
    const fontIdToUse = overrideFontId || selectedFontId;
    const preset =
      SIGNATURE_FONT_PRESETS.find((p) => p.id === fontIdToUse) || SIGNATURE_FONT_PRESETS[0];
    const outCanvas = document.createElement('canvas');
    outCanvas.width = 680;
    outCanvas.height = includeDate ? 185 : 165;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return;

    const cleanName = typedName.trim() || 'Authorized Signer';
    ctx.save();
    ctx.translate(34, 96);
    ctx.rotate((preset.slantDeg * Math.PI) / 180);
    ctx.scale(1, preset.verticalScale);
    ctx.font = preset.canvasFont;
    ctx.fillStyle = strokeColor;
    ctx.fillText(cleanName, 0, 0);

    if (includeFlourish) {
      const textWidth = Math.min(560, Math.max(110, ctx.measureText(cleanName).width));
      ctx.strokeStyle = strokeColor;
      ctx.globalAlpha = 0.78;
      ctx.lineWidth = 2.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(4, 14);
      ctx.quadraticCurveTo(textWidth * 0.52, 4, textWidth * 0.94, 17);
      ctx.stroke();
    }
    ctx.restore();

    if (includeDate) {
      const dateStr = `Signed ${new Date().toISOString().slice(0, 10)}`;
      ctx.font = '600 13px Helvetica, Arial, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(dateStr, 34, 152);
    }

    const trimmedPng = trimCanvasTransparentBounds(outCanvas, 12);
    emitSignature(trimmedPng, `${cleanName} (${preset.label})`);
  };

  // Emit Drawn Signature
  const handleConfirmDrawnSignature = () => {
    if (strokes.length === 0) {
      handleConfirmTypedSignature();
      return;
    }
    const outCanvas = document.createElement('canvas');
    outCanvas.width = 720;
    outCanvas.height = includeDate ? 265 : 230;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return;

    if (drawCanvasRef.current) {
      ctx.drawImage(drawCanvasRef.current, 0, 0, 720, 220);
    }

    if (includeDate) {
      const dateStr = `Signed ${new Date().toISOString().slice(0, 10)}`;
      ctx.font = '600 13px Helvetica, Arial, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(dateStr, 28, 250);
    }

    const trimmedPng = trimCanvasTransparentBounds(outCanvas, 12);
    emitSignature(trimmedPng, 'Freehand Drawn Signature');
  };

  // Emit Uploaded Signature
  const handleConfirmUploadedSignature = () => {
    if (!uploadedProcessedUrl) return;
    emitSignature(uploadedProcessedUrl, 'Uploaded Image Signature');
  };

  // Emit Camera Signature
  const handleConfirmCameraSignature = () => {
    if (!capturedProcessedUrl) return;
    emitSignature(capturedProcessedUrl, 'Camera Captured Signature');
  };

  const handleDeleteSavedSignature = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = savedSignatures.filter((s) => s.id !== id);
    setSavedSignatures(next);
    if (typeof window !== 'undefined') {
      try {
        const storageKey = getScopedSignaturesStorageKey(currentUserUid);
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
    }
  };

  const activePreset =
    SIGNATURE_FONT_PRESETS.find((p) => p.id === selectedFontId) || SIGNATURE_FONT_PRESETS[0];

  return (
    <div
      data-testid="signature-builder-modal"
      className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 space-y-4"
    >
      {/* SAVED SIGNATURES QUICK REUSE BAR */}
      {savedSignatures.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <BookmarkCheck className="w-3.5 h-3.5 text-red-600" />
              Saved Signatures (Click to Place Immediately)
            </span>
            <span className="text-[10px] text-slate-400">{savedSignatures.length} saved privately</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {savedSignatures.map((sig) => (
              <div
                key={sig.id}
                onClick={() => {
                  if (onSignatureCreated) onSignatureCreated(sig.dataUrl);
                  if (onSignatureReady) onSignatureReady(sig.dataUrl);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    if (onSignatureCreated) onSignatureCreated(sig.dataUrl);
                    if (onSignatureReady) onSignatureReady(sig.dataUrl);
                  }
                }}
                data-testid={`saved-signature-item-${sig.id}`}
                title={`Insert "${sig.label}"`}
                className="group relative flex items-center gap-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-red-500 rounded-lg px-2.5 py-1.5 cursor-pointer shrink-0 transition-all shadow-2xs"
              >
                <img
                  src={sig.dataUrl}
                  alt={sig.label}
                  className="h-8 w-24 object-contain pointer-events-none"
                />
                <button
                  type="button"
                  onClick={(e) => handleDeleteSavedSignature(sig.id, e)}
                  title="Delete saved signature"
                  className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4-TAB NAVIGATION (Type / Draw / Upload Image / Camera) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div
          role="tablist"
          aria-label="Signature Creation Methods"
          className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full sm:w-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'type'}
            data-testid="sig-tab-type"
            onClick={() => setActiveTab('type')}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'type'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>Type</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'draw'}
            data-testid="sig-tab-draw"
            onClick={() => setActiveTab('draw')}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'draw'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Draw</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'upload'}
            data-testid="sig-tab-upload"
            onClick={() => setActiveTab('upload')}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'upload'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Image</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'camera'}
            data-testid="sig-tab-camera"
            onClick={() => {
              setActiveTab('camera');
              if (cameraStatus === 'idle') {
                startCamera();
              }
            }}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'camera'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Camera</span>
          </button>
        </div>

        {/* INK COLOR SWATCHES (For Type & Draw tabs) */}
        {(activeTab === 'type' || activeTab === 'draw') && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Ink Color:</span>
            <div className="flex items-center gap-1.5">
              {INK_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setStrokeColor(c.hex)}
                  title={c.label}
                  aria-label={`Select ${c.label}`}
                  data-testid={`sig-color-${c.id}`}
                  className={`w-6 h-6 rounded-full border transition-transform ${
                    strokeColor.toLowerCase() === c.hex.toLowerCase()
                      ? 'ring-2 ring-red-500 ring-offset-2 scale-110 border-white'
                      : 'border-slate-300 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
              <input
                type="color"
                value={strokeColor}
                onChange={(e) => setStrokeColor(e.target.value)}
                aria-label="Custom Signature Ink Color"
                title="Custom Ink Color"
                className="w-6 h-6 rounded cursor-pointer bg-transparent border border-slate-300"
              />
            </div>
          </div>
        )}
      </div>

      {/* TAB A: TYPE SIGNATURE */}
      {activeTab === 'type' && (
        <div className="space-y-3.5">
          {/* Name Input + Live Main Preview */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
            <div className="md:col-span-5 flex flex-col justify-between space-y-2">
              <div>
                <label
                  htmlFor="typed-signer-name"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Type Your Name or Initials
                </label>
                <div className="relative">
                  <input
                    id="typed-signer-name"
                    data-testid="sig-type-input"
                    type="text"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder="e.g., Alex Morgan"
                    className="w-full px-3.5 py-2.5 text-sm font-semibold bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeFlourish}
                    onChange={(e) => setIncludeFlourish(e.target.checked)}
                    className="rounded border-slate-300 text-red-600 focus:ring-red-600"
                  />
                  <span>Pen underline flourish</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeDate}
                    onChange={(e) => setIncludeDate(e.target.checked)}
                    className="rounded border-slate-300 text-red-600 focus:ring-red-600"
                  />
                  <span>Include date stamp</span>
                </label>
              </div>
            </div>

            {/* Live High-DPI Transparent Signature Preview */}
            <div className="md:col-span-7 flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:12px_12px] bg-white p-2.5 relative">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                <span>Live Transparent Preview ({activePreset.label})</span>
                <span className="text-emerald-600 font-semibold">Transparent PNG</span>
              </div>
              <canvas
                ref={typedPreviewCanvasRef}
                width={640}
                height={165}
                data-testid="sig-typed-live-canvas"
                className="w-full h-20 object-contain pointer-events-none select-none"
              />
            </div>
          </div>

          {/* 10 Handwritten Signature Font Styles Grid */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Select Handwritten Font Style ({SIGNATURE_FONT_PRESETS.length} Cursive &amp; Script Fonts)
              </span>
              <span className="text-[11px] text-slate-400">
                Click to preview • Double-click to insert immediately
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {SIGNATURE_FONT_PRESETS.map((preset) => {
                const isSelected = selectedFontId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`sig-style-${preset.id}`}
                    onClick={() => setSelectedFontId(preset.id)}
                    onDoubleClick={() => {
                      setSelectedFontId(preset.id);
                      handleConfirmTypedSignature(preset.id);
                    }}
                    className={`group relative flex flex-col justify-between p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-red-50/70 dark:bg-red-950/30 border-red-600 ring-2 ring-red-500/30 shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {preset.label}
                      </span>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-bold">
                          <Check className="w-2.5 h-2.5" /> Selected
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontFamily: preset.fontFamily,
                        color: strokeColor,
                        transform: `skewX(${preset.slantDeg}deg)`,
                      }}
                      className="text-2xl sm:text-3xl py-1 truncate w-full select-none"
                    >
                      {typedName.trim() || 'Authorized Signer'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={saveForFuture}
                onChange={(e) => setSaveForFuture(e.target.checked)}
                className="rounded border-slate-300 text-red-600 focus:ring-red-600"
              />
              <span>Save signature to my private browser library for one-click reuse</span>
            </label>

            <button
              type="button"
              data-testid="sig-confirm-type-btn"
              onClick={() => handleConfirmTypedSignature()}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-md shadow-red-600/20"
            >
              <Check className="w-4 h-4" />
              Use Typed Signature
            </button>
          </div>
        </div>
      )}

      {/* TAB B: DRAW SIGNATURE */}
      {activeTab === 'draw' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Pen Thickness:</span>
              {[
                { label: 'Fine', width: 1.8 },
                { label: 'Medium', width: 3.2 },
                { label: 'Bold', width: 4.8 },
                { label: 'Calligraphy', width: 6.4 },
              ].map((sw) => (
                <button
                  key={sw.label}
                  type="button"
                  onClick={() => setStrokeWidth(sw.width)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    Math.abs(strokeWidth - sw.width) < 0.4
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800'
                  }`}
                >
                  {sw.label}
                </button>
              ))}
              <input
                type="range"
                min={1}
                max={9}
                step={0.4}
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                aria-label="Pen Stroke Thickness"
                className="w-20 accent-red-600"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="sig-draw-undo"
                onClick={handleUndoStroke}
                disabled={strokes.length === 0}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 disabled:opacity-40 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Undo Stroke {strokes.length > 0 ? `(${strokes.length})` : ''}
              </button>
              <button
                type="button"
                data-testid="sig-draw-clear"
                onClick={handleClearDraw}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors"
              >
                <Eraser className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>
          </div>

          <div className="relative bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:12px_12px] bg-white border-2 border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden shadow-inner">
            <canvas
              ref={drawCanvasRef}
              width={720}
              height={220}
              data-testid="signature-canvas"
              onMouseDown={handleDrawStart}
              onMouseMove={handleDrawMove}
              onMouseUp={handleDrawEnd}
              onMouseLeave={handleDrawEnd}
              onTouchStart={handleDrawStart}
              onTouchMove={handleDrawMove}
              onTouchEnd={handleDrawEnd}
              className="w-full h-48 sm:h-52 cursor-crosshair touch-none"
            />
            {/* Signature baseline guide */}
            <div className="pointer-events-none absolute bottom-10 left-8 right-8 border-b border-dashed border-slate-300" />
            <span className="pointer-events-none absolute bottom-2.5 left-8 text-[11px] text-slate-400">
              Sign naturally above the line using mouse, touchpad, or touch screen (100% transparent background)
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveForFuture}
                  onChange={(e) => setSaveForFuture(e.target.checked)}
                  className="rounded border-slate-300 text-red-600"
                />
                <span>Save signature</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeDate}
                  onChange={(e) => setIncludeDate(e.target.checked)}
                  className="rounded border-slate-300 text-red-600"
                />
                <span>Include date stamp</span>
              </label>
            </div>

            <button
              type="button"
              data-testid="sig-confirm-draw-btn"
              onClick={handleConfirmDrawnSignature}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-md shadow-red-600/20"
            >
              <Check className="w-4 h-4" />
              Use Drawn Signature
            </button>
          </div>
        </div>
      )}

      {/* TAB C: UPLOAD SIGNATURE IMAGE */}
      {activeTab === 'upload' && (
        <div className="space-y-3.5">
          {!uploadedRawUrl ? (
            <label
              htmlFor="sig-image-upload"
              data-testid="sig-upload-dropzone"
              className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 hover:border-red-600 cursor-pointer transition-colors text-center"
            >
              <Upload className="w-7 h-7 text-red-600 mb-2" />
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                Upload Signature Image (PNG, JPG, JPEG, WebP)
              </span>
              <span className="text-xs text-slate-500 mt-1">
                Transparent PNG preserved automatically — optional white-paper removal for photographed signatures
              </span>
              <input
                id="sig-image-upload"
                data-testid="sig-upload-input"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handleUploadFileChange}
                className="sr-only"
              />
            </label>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Crop className="w-3.5 h-3.5 text-red-600" />
                  Preview, Crop &amp; Clean Uploaded Signature
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCropInsetPct({ top: 0, bottom: 0, left: 0, right: 0 })}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    Reset Crop
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadedRawUrl(null);
                      setUploadedProcessedUrl(null);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove / Replace Image
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:12px_12px] bg-white flex items-center justify-center min-h-[130px]">
                {uploadedProcessedUrl && (
                  <img
                    src={uploadedProcessedUrl}
                    alt="Uploaded signature preview"
                    className="max-h-28 object-contain"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px]">
                <div>
                  <label className="text-slate-500 block">Crop Left ({cropInsetPct.left}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={cropInsetPct.left}
                    onChange={(e) => setCropInsetPct((p) => ({ ...p, left: Number(e.target.value) }))}
                    className="w-full accent-red-600"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block">Crop Right ({cropInsetPct.right}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={cropInsetPct.right}
                    onChange={(e) => setCropInsetPct((p) => ({ ...p, right: Number(e.target.value) }))}
                    className="w-full accent-red-600"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block">Crop Top ({cropInsetPct.top}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={cropInsetPct.top}
                    onChange={(e) => setCropInsetPct((p) => ({ ...p, top: Number(e.target.value) }))}
                    className="w-full accent-red-600"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block">Crop Bottom ({cropInsetPct.bottom}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={cropInsetPct.bottom}
                    onChange={(e) => setCropInsetPct((p) => ({ ...p, bottom: Number(e.target.value) }))}
                    className="w-full accent-red-600"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRemoveBg}
                      onChange={(e) => setAutoRemoveBg(e.target.checked)}
                      className="rounded border-slate-300 text-red-600"
                    />
                    <span>Make white paper background transparent</span>
                  </label>
                  {autoRemoveBg && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Sliders className="w-3 h-3" />
                      <span>Sensitivity:</span>
                      <input
                        type="range"
                        min={165}
                        max={248}
                        value={bgThreshold}
                        onChange={(e) => setBgThreshold(Number(e.target.value))}
                        className="w-20 accent-red-600"
                      />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  data-testid="sig-confirm-upload-btn"
                  onClick={handleConfirmUploadedSignature}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-md shadow-red-600/20"
                >
                  <Check className="w-4 h-4" />
                  Use Uploaded Signature
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB D: CAMERA SIGNATURE CAPTURE */}
      {activeTab === 'camera' && (
        <div className="space-y-3.5">
          {cameraStatus === 'streaming' && (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video max-h-56 w-full flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="pointer-events-none absolute inset-6 border-2 border-dashed border-red-400/80 rounded-lg flex items-end justify-center pb-2">
                  <span className="bg-slate-950/80 text-white text-[10px] px-2 py-0.5 rounded">
                    Align your handwritten signature inside the frame
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={captureFromVideo}
                  data-testid="sig-camera-capture-btn"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl"
                >
                  <Camera className="w-4 h-4" />
                  Take Photo
                </button>
              </div>
            </div>
          )}

          {(cameraStatus === 'error' || cameraStatus === 'idle' || cameraStatus === 'requesting') && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {cameraStatus === 'requesting'
                      ? 'Requesting camera permission...'
                      : 'Sign on white paper and hold it up to your camera'}
                  </p>
                  {cameraError && <p className="text-amber-600 dark:text-amber-400">{cameraError}</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={startCamera}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry Camera Access
                </button>
                <button
                  type="button"
                  data-testid="sig-camera-simulate-btn"
                  onClick={simulateCameraPaperCapture}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Capture Sample Paper Signature
                </button>
              </div>
            </div>
          )}

          {cameraStatus === 'captured' && capturedProcessedUrl && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Captured Signature Preview (Transparent Ink Extracted)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCapturedRawUrl(null);
                    setCapturedProcessedUrl(null);
                    startCamera();
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retake Photo
                </button>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:12px_12px] bg-white flex items-center justify-center min-h-[120px]">
                <img
                  src={capturedProcessedUrl}
                  alt="Camera captured signature"
                  className="max-h-24 object-contain"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px]">
                <div>
                  <label className="text-slate-500 block">Crop Left ({cameraCropPct.left}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={cameraCropPct.left}
                    onChange={(e) => setCameraCropPct((p) => ({ ...p, left: Number(e.target.value) }))}
                    className="w-full accent-red-600"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block">Crop Right ({cameraCropPct.right}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={cameraCropPct.right}
                    onChange={(e) => setCameraCropPct((p) => ({ ...p, right: Number(e.target.value) }))}
                    className="w-full accent-red-600"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block">Crop Top ({cameraCropPct.top}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={cameraCropPct.top}
                    onChange={(e) => setCameraCropPct((p) => ({ ...p, top: Number(e.target.value) }))}
                    className="w-full accent-red-600"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block">Crop Bottom ({cameraCropPct.bottom}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={cameraCropPct.bottom}
                    onChange={(e) => setCameraCropPct((p) => ({ ...p, bottom: Number(e.target.value) }))}
                    className="w-full accent-red-600"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cameraHighContrast}
                    onChange={(e) => setCameraHighContrast(e.target.checked)}
                    className="rounded border-slate-300 text-red-600"
                  />
                  <span>Auto-extract ink &amp; remove paper background</span>
                </label>
                <button
                  type="button"
                  data-testid="sig-confirm-camera-btn"
                  onClick={handleConfirmCameraSignature}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md shadow-red-600/20"
                >
                  <Check className="w-4 h-4" />
                  Use Captured Signature
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ELECTRONIC SIGNATURE DISCLOSURE */}
      <p className="text-[10px] text-slate-400 leading-relaxed pt-1 border-t border-slate-100 dark:border-slate-900">
        Note: Signatures created here are placed as visual electronic signature graphics on your PDF document and do not attach a cryptographic PKI/PAdES hardware certificate.
      </p>
    </div>
  );
}
