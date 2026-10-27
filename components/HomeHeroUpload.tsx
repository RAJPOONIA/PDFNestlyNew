'use client';

import React, { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Edit3,
  Layers,
  Minimize2,
  Lock,
  RefreshCw,
  X,
} from 'lucide-react';

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

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('Please select a valid PDF file (.pdf extension).');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setError('File size exceeds the 100MB limit for browser processing.');
      return;
    }

    setIsValidating(true);
    try {
      const buffer = await file.arrayBuffer();
      const isValid = isValidPdfBytes(new Uint8Array(buffer));
      if (!isValid) {
        setError('The selected file does not appear to be a valid or uncorrupted PDF (missing %PDF- header).');
        setSelectedFile(null);
        setIsValidating(false);
        return;
      }
      setSelectedFile(file);
    } catch {
      setError('Could not read file. Please ensure it is accessible.');
      setSelectedFile(null);
    } finally {
      setIsValidating(false);
    }
  }, []);

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
    if (!selectedFile) {
      router.push('/edit-pdf');
      return;
    }
    // Store in sessionStorage for immediate pick-up by workspace
    const reader = new FileReader();
    reader.onload = () => {
      try {
        sessionStorage.setItem('pdfnestly_editor_preload', reader.result as string);
        sessionStorage.setItem('pdfnestly_editor_preload_name', selectedFile.name);
      } catch {
        // Fallback if quota exceeded
      }
      router.push('/edit-pdf');
    };
    reader.readAsDataURL(selectedFile);
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
                Drop your PDF here, or browse files
              </h3>
              <p className="text-sm text-[#52525B] dark:text-[#D4D4D8] mt-1">
                Client-side processing for private docs. Files never leave your browser without permission.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-3 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] active:bg-[#7F1D1D] text-white font-semibold text-sm transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                Choose PDF File
              </button>
              <Link
                href="/edit-pdf"
                className="px-5 py-3 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-zinc-50 dark:hover:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] font-medium text-sm transition-colors flex items-center gap-2"
              >
                <Edit3 className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444]" />
                Open PDF Editor
              </Link>
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
          <div className="space-y-4 text-left">
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
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • PDF Document Verified
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                title="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#71717A] dark:text-[#A1A1AA] mb-2">
                Choose what to do with this file:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={openInEditor}
                  className="p-3 rounded-xl border border-[#B91C1C] dark:border-[#EF4444] bg-[#FEF2F2] dark:bg-[#B91C1C]/15 hover:bg-[#B91C1C] hover:text-white text-[#B91C1C] dark:text-[#EF4444] dark:hover:text-white transition-colors text-left flex flex-col justify-between group cursor-pointer"
                >
                  <Edit3 className="w-4 h-4 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold leading-tight">Edit in Workspace</span>
                </button>

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
                  <span className="text-xs font-semibold leading-tight">All 30 Tools</span>
                </Link>
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
