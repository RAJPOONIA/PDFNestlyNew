'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Eraser, Check, PenTool, Type, Upload } from 'lucide-react';

interface SignatureBuilderProps {
  onSignatureCreated: (dataUrl: string) => void;
  defaultSignerName?: string;
}

export function SignatureBuilder({
  onSignatureCreated,
  defaultSignerName = 'Alex Morgan',
}: SignatureBuilderProps) {
  const [mode, setMode] = useState<'draw' | 'type' | 'upload'>('draw');
  const [typedName, setTypedName] = useState(defaultSignerName);
  const [includeDate, setIncludeDate] = useState(true);
  const [strokeColor, setStrokeColor] = useState('#1e3a8a');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawnStrokes, setHasDrawnStrokes] = useState(false);

  useEffect(() => {
    if (mode === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [mode]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawnStrokes(true);
  };

  const drawMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearPad = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasDrawnStrokes(false);
  };

  const emitDrawnOrTypedSignature = () => {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = 440;
    outCanvas.height = 150;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return;

    if (mode === 'draw' && canvasRef.current) {
      if (!hasDrawnStrokes) {
        // Draw a clean fallback script signature if user clicked apply directly
        ctx.font = 'italic 36px Georgia, serif';
        ctx.fillStyle = strokeColor;
        ctx.fillText(typedName || 'Authorized Signer', 24, 78);
      } else {
        ctx.drawImage(canvasRef.current, 0, 0, 440, 115);
      }
    } else if (mode === 'type') {
      ctx.font = 'italic 38px Georgia, serif';
      ctx.fillStyle = strokeColor;
      ctx.fillText(typedName || 'Authorized Signer', 20, 76);
    }

    if (includeDate) {
      const dateStr = `Signed ${new Date().toISOString().slice(0, 10)}`;
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(dateStr, 20, 134);
    }

    onSignatureCreated(outCanvas.toDataURL('image/png'));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onSignatureCreated(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl p-4 bg-[#FAFAFA] dark:bg-[#18181B] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-1 bg-[#E4E4E7]/70 dark:bg-[#09090B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg">
          <button
            type="button"
            onClick={() => setMode('draw')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              mode === 'draw'
                ? 'bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] shadow-xs'
                : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-[#FAFAFA]'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            Draw Signature
          </button>
          <button
            type="button"
            onClick={() => setMode('type')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              mode === 'type'
                ? 'bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] shadow-xs'
                : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-[#FAFAFA]'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            Type Signature
          </button>
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              mode === 'upload'
                ? 'bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] shadow-xs'
                : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-[#FAFAFA]'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload PNG/JPG
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-[#71717A] dark:text-[#A1A1AA]">
            <span>Ink:</span>
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
              aria-label="Signature Ink Color"
              className="w-6 h-6 rounded border border-[#E4E4E7] dark:border-[#3F3F46] cursor-pointer bg-white"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-[#18181B] dark:text-[#FAFAFA] cursor-pointer">
            <input
              type="checkbox"
              checked={includeDate}
              onChange={(e) => setIncludeDate(e.target.checked)}
              className="rounded border-[#E4E4E7] dark:border-[#3F3F46] text-[#B91C1C]"
            />
            <span>Stamp Date</span>
          </label>
        </div>
      </div>

      {mode === 'draw' && (
        <div className="space-y-2">
          <div className="relative bg-white border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg overflow-hidden">
            <canvas
              ref={canvasRef}
              width={440}
              height={120}
              data-testid="signature-canvas"
              onMouseDown={startDrawing}
              onMouseMove={drawMove}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={drawMove}
              onTouchEnd={stopDrawing}
              className="w-full h-28 cursor-crosshair touch-none"
            />
            <span className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-[#71717A]">
              Sign above line (or click Use Signature to generate from name)
            </span>
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={clearPad}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#71717A] dark:text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-[#FAFAFA] bg-white dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg transition-colors"
            >
              <Eraser className="w-3.5 h-3.5" />
              Clear Pad
            </button>
            <button
              type="button"
              onClick={emitDrawnOrTypedSignature}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Use This Signature
            </button>
          </div>
        </div>
      )}

      {mode === 'type' && (
        <div className="space-y-3">
          <div>
            <label htmlFor="typed-signer-name" className="block text-xs font-medium text-[#18181B] dark:text-[#FAFAFA] mb-1">
              Full Legal Name
            </label>
            <input
              id="typed-signer-name"
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
            />
          </div>
          <div
            className="p-4 bg-white border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg text-2xl italic font-serif"
            style={{ color: strokeColor }}
          >
            {typedName || 'Authorized Signer'}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={emitDrawnOrTypedSignature}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Use Typed Signature
            </button>
          </div>
        </div>
      )}

      {mode === 'upload' && (
        <div className="space-y-2">
          <label
            htmlFor="sig-image-upload"
            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg bg-white dark:bg-[#27272A] hover:border-[#B91C1C] cursor-pointer transition-colors"
          >
            <Upload className="w-5 h-5 text-[#71717A] dark:text-[#A1A1AA] mb-1.5" />
            <span className="text-xs font-medium text-[#18181B] dark:text-[#FAFAFA]">
              Upload transparent PNG or JPG signature
            </span>
            <input
              id="sig-image-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageUpload}
              className="sr-only"
            />
          </label>
        </div>
      )}
    </div>
  );
}
