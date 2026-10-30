'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  UploadCloud,
  FileText,
  AlertCircle,
  CheckCircle2,
  Lock,
  RefreshCw,
  X,
  Minimize2,
  Layers,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { storeCurrentDocument, clearCurrentDocument } from '@/lib/document-store';

function isValidPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  const sample = String.fromCharCode(...bytes.slice(0, Math.min(bytes.length, 1024)));
  return sample.includes('%PDF-');
}

export function HomeHeroUpload() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);

    // Validate size (100 MB max)
    if (file.size > 100 * 1024 * 1024) {
      setError('File size exceeds the 100 MB limit. Please select a smaller PDF.');
      setSelectedFile(null);
      return;
    }

    // Validate type or extension
    const isPdfExt = file.name.toLowerCase().endsWith('.pdf');
    const isPdfMime = file.type === 'application/pdf' || file.type === '';
    if (!isPdfExt && !isPdfMime) {
      setError('Please upload a valid PDF document (.pdf).');
      setSelectedFile(null);
      return;
    }

    setIsValidating(true);
    try {
      const buffer = await file.arrayBuffer();
      const isValid = isValidPdfBytes(new Uint8Array(buffer));
      if (!isValid) {
        setError('The selected file does not appear to be a valid or uncorrupted PDF (missing %PDF- header).');
        setSelectedFile(null);
        return;
      }

      // Store in shared IndexedDB store so PDFNestly Studio immediately opens it
      await storeCurrentDocument(file, 'homepage-upload');
      setSelectedFile(file);
      router.push('/edit-pdf');
    } catch {
      setError('Failed to read and validate the PDF. The file may be locked or corrupted.');
      setSelectedFile(null);
      setIsValidating(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const openInEditor = () => {
    router.push('/edit-pdf');
  };

  const handleReplacePdf = async () => {
    setSelectedFile(null);
    setError(null);
    await clearCurrentDocument();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-2xl border-2 border-dashed transition-all p-6 sm:p-8 text-center ${
          isDragging
            ? 'border-[#B91C1C] bg-[#FEF2F2] dark:bg-[#B91C1C]/10 scale-[1.01] shadow-lg'
            : 'border-[#E4E4E7] dark:border-[#3F3F46] bg-white dark:bg-[#18181B] hover:border-[#B91C1C]/60 dark:hover:border-[#EF4444]/60 shadow-sm'
        }`}
      >
        <input
          ref={fileInputRef}
          data-testid="home-hero-pdf-input"
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleFileInputChange}
        />

        {!selectedFile ? (
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-[#FEF2F2] dark:bg-[#B91C1C]/15 flex items-center justify-center text-[#B91C1C] dark:text-[#EF4444] shadow-sm">
              <UploadCloud className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-[#18181B] dark:text-[#FAFAFA]">
                Drop your PDF here to open in PDFNestly Studio
              </h3>
              <p className="text-sm text-[#52525B] dark:text-[#D4D4D8] mt-1">
                Upload any PDF document to launch directly into the full-screen PDFNestly Studio editor.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                data-testid="home-upload-pdf-button"
                onClick={() => fileInputRef.current?.click()}
                className="px-7 py-3.5 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] active:bg-[#7F1D1D] text-white font-semibold text-sm transition-colors shadow-sm flex items-center gap-2.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B91C1C]"
              >
                <FileText className="w-4 h-4" />
                Upload PDF & Open Studio
              </button>
            </div>

            <div className="flex items-center gap-4 text-xs text-[#71717A] dark:text-[#A1A1AA] pt-2">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Up to 100 MB
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                Zero-Upload Engine
              </span>
              <span>•</span>
              <span>No signup required</span>
            </div>
          </div>
        ) : (
          <div className="space-y-5 text-left">
            <div className="flex items-center justify-between p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[#FEF2F2] dark:bg-[#B91C1C]/20 flex items-center justify-center text-[#B91C1C] dark:text-[#EF4444] shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#18181B] dark:text-[#FAFAFA] truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-[#71717A] dark:text-[#A1A1AA]">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready in Document Store
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleReplacePdf}
                className="px-3 py-1.5 rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-[#52525B] dark:text-[#D4D4D8] transition-colors flex items-center gap-1.5"
                title="Replace with another PDF"
              >
                <X className="w-3.5 h-3.5" />
                <span>Replace PDF</span>
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  type="button"
                  onClick={openInEditor}
                  className="flex-1 py-3 px-5 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] active:bg-[#7F1D1D] text-white font-bold text-sm transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Open in PDFNestly Studio</span>
                </button>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#71717A] dark:text-[#A1A1AA] mb-2">
                  Or apply a direct operation:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Link
                    href="/compress-pdf"
                    className="p-3 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] hover:border-[#B91C1C] dark:hover:border-[#EF4444] text-[#18181B] dark:text-[#FAFAFA] transition-colors text-left flex flex-col justify-between group"
                  >
                    <Minimize2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold leading-tight">Compress PDF</span>
                  </Link>
                  <Link
                    href="/split-pdf"
                    className="p-3 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] hover:border-[#B91C1C] dark:hover:border-[#EF4444] text-[#18181B] dark:text-[#FAFAFA] transition-colors text-left flex flex-col justify-between group"
                  >
                    <Layers className="w-4 h-4 text-amber-600 dark:text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold leading-tight">Split Pages</span>
                  </Link>
                  <Link
                    href="/tools"
                    className="p-3 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] hover:border-[#B91C1C] dark:hover:border-[#EF4444] text-[#18181B] dark:text-[#FAFAFA] transition-colors text-left flex flex-col justify-between group"
                  >
                    <ArrowRight className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] mb-2 group-hover:translate-x-1 transition-transform" />
                    <span className="text-xs font-semibold leading-tight">More Tools (All 30)</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {isValidating && (
          <div className="absolute inset-0 bg-white/80 dark:bg-[#18181B]/80 backdrop-blur-xs rounded-2xl flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#B91C1C] dark:text-[#EF4444]">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Validating PDF structure...
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

export default HomeHeroUpload;
