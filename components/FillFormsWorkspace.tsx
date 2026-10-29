'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  PenTool,
  ScanText,
  Upload,
  Sparkles,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  PdfInspectionReport,
  renderSinglePageDataUrl,
} from '@/lib/pdf-engine-client';

interface FillFormsWorkspaceProps {
  pdfBytes: Uint8Array;
  inspection: PdfInspectionReport;
  formValues: Record<string, string | boolean>;
  onChangeFormValues: (values: Record<string, string | boolean>) => void;
  flattenAfterFill: boolean;
  onChangeFlattenAfterFill: (flatten: boolean) => void;
  onLoadSampleForm: () => void;
  onUploadAnother: () => void;
  isInspecting?: boolean;
}

function formatFieldLabel(rawName: string): string {
  return rawName
    .replace(/[_.-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function FillFormsWorkspace({
  pdfBytes,
  inspection,
  formValues,
  onChangeFormValues,
  flattenAfterFill,
  onChangeFlattenAfterFill,
  onLoadSampleForm,
  onUploadAnother,
  isInspecting = false,
}: FillFormsWorkspaceProps) {
  const [activePage, setActivePage] = useState<number>(1);
  const [pagePreviewUrl, setPagePreviewUrl] = useState<string>('');
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);

  useEffect(() => {
    setActivePage(1);
  }, [pdfBytes]);

  useEffect(() => {
    let cancelled = false;
    setIsRenderingPage(true);
    (async () => {
      try {
        const res = await renderSinglePageDataUrl(
          pdfBytes,
          activePage,
          1.35,
          0,
          'image/png',
          0.9
        );
        if (!cancelled && res.dataUrl) {
          setPagePreviewUrl(res.dataUrl);
        }
      } catch {
        // Ignore preview error if encrypted
      } finally {
        if (!cancelled) {
          setIsRenderingPage(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfBytes, activePage]);

  const handleResetValues = () => {
    const initial: Record<string, string | boolean> = {};
    inspection.formFields.forEach((f) => {
      initial[f.name] = f.value;
    });
    onChangeFormValues(initial);
  };

  if (isInspecting) {
    return (
      <div className="p-8 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl flex flex-col items-center justify-center gap-2 text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]">
        <RefreshCw className="w-5 h-5 animate-spin text-[#B91C1C]" />
        <span>Inspecting PDF for interactive AcroForm fields...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left Column: Document Page Reference Preview (5 cols on lg) */}
      <div className="lg:col-span-5 bg-[#F4F4F5] dark:bg-[#09090B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#52525B] dark:text-[#D4D4D8]">
            Document Preview
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={activePage <= 1}
              onClick={() => setActivePage((p) => Math.max(1, p - 1))}
              aria-label="Previous Page"
              className="p-1 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded text-[#18181B] dark:text-[#FAFAFA] disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] tabular-nums">
              Page {activePage} of {inspection.pageCount}
            </span>
            <button
              type="button"
              disabled={activePage >= inspection.pageCount}
              onClick={() =>
                setActivePage((p) => Math.min(inspection.pageCount, p + 1))
              }
              aria-label="Next Page"
              className="p-1 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded text-[#18181B] dark:text-[#FAFAFA] disabled:opacity-40"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="aspect-[1/1.29] bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg flex items-center justify-center overflow-hidden relative shadow-xs">
          {isRenderingPage && (
            <div className="absolute inset-0 bg-white/75 dark:bg-[#18181B]/75 flex items-center justify-center">
              <RefreshCw className="w-4 h-4 animate-spin text-[#B91C1C]" />
            </div>
          )}
          {pagePreviewUrl ? (
            <img
              src={pagePreviewUrl}
              alt={`Page ${activePage} preview`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="text-xs text-[#71717A]">Page {activePage}</span>
          )}
        </div>
      </div>

      {/* Right Column: Interactive Form Fields or Zero-Fields Guidance (7 cols on lg) */}
      <div className="lg:col-span-7 space-y-4">
        {inspection.formFields.length === 0 ? (
          <div className="p-6 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#B91C1C]/10 border border-[#B91C1C]/25 text-[#B91C1C] dark:text-[#EF4444] flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
                  No interactive form fields were found in this PDF.
                </h3>
                <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
                  This document contains flat page graphics or standard text rather than
                  embedded AcroForm inputs. You can open this PDF directly in{' '}
                  <strong className="text-[#18181B] dark:text-[#FAFAFA]">
                    PDFNestly Studio
                  </strong>{' '}
                  to place visual text overlays, checkmarks, dates, and signatures anywhere on the page.
                </p>
              </div>
            </div>

            <div className="p-3 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg text-[11px] text-[#52525B] dark:text-[#D4D4D8]">
              <strong className="text-[#18181B] dark:text-[#FAFAFA]">
                Note on Form Types:
              </strong>{' '}
              Filling interactive AcroForm fields updates native PDF form widgets, whereas PDFNestly Studio places visual text and signature overlays directly over flat or scanned pages.
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <Link
                href="/edit-pdf"
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg transition-colors shadow-xs whitespace-nowrap shrink-0"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Open in PDFNestly Studio</span>
              </Link>

              <Link
                href="/ocr-pdf"
                className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] bg-white dark:bg-[#18181B] hover:border-[#B91C1C] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <ScanText className="w-3.5 h-3.5 text-[#B91C1C]" />
                <span>Run OCR on Scanned PDF</span>
              </Link>

              <button
                type="button"
                onClick={onLoadSampleForm}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] bg-white dark:bg-[#18181B] hover:border-[#B91C1C] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#B91C1C]" />
                <span>Load Sample Fillable Form</span>
              </button>

              <button
                type="button"
                onClick={onUploadAnother}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA] rounded-lg whitespace-nowrap shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Try Another PDF</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E4E4E7] dark:border-[#3F3F46]">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[#16865B]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#18181B] dark:text-[#FAFAFA]">
                  Interactive Form Fields ({inspection.formFields.length})
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-[#18181B] dark:text-[#FAFAFA] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={flattenAfterFill}
                    onChange={(e) => onChangeFlattenAfterFill(e.target.checked)}
                    className="accent-[#B91C1C]"
                  />
                  <span>Flatten fields after saving</span>
                </label>

                <button
                  type="button"
                  onClick={handleResetValues}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-md text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA]"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
              {inspection.formFields.map((field) => {
                const readableLabel = formatFieldLabel(field.name);
                return (
                  <div
                    key={field.name}
                    className="p-3.5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`acro-${field.name}`}
                        className="text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] truncate"
                        title={field.name}
                      >
                        {readableLabel}
                      </label>
                      <span className="px-1.5 py-0.5 text-[10px] font-mono uppercase bg-[#F4F4F5] dark:bg-[#27272A] text-[#52525B] dark:text-[#D4D4D8] rounded shrink-0">
                        {field.type}
                      </span>
                    </div>

                    <div className="text-[10px] font-mono text-[#71717A] truncate">
                      Field ID: {field.name}
                    </div>

                    {field.type === 'checkbox' ? (
                      <label className="inline-flex items-center gap-2 pt-1 cursor-pointer text-xs text-[#18181B] dark:text-[#FAFAFA]">
                        <input
                          id={`acro-${field.name}`}
                          type="checkbox"
                          checked={Boolean(formValues[field.name])}
                          onChange={(e) =>
                            onChangeFormValues({
                              ...formValues,
                              [field.name]: e.target.checked,
                            })
                          }
                          className="w-4 h-4 accent-[#B91C1C]"
                        />
                        <span>
                          {formValues[field.name] ? 'Checked (Yes)' : 'Unchecked (No)'}
                        </span>
                      </label>
                    ) : (field.type === 'dropdown' ||
                        field.type === 'optionlist' ||
                        field.type === 'radio') &&
                      field.options &&
                      field.options.length > 0 ? (
                      <select
                        id={`acro-${field.name}`}
                        value={String(formValues[field.name] ?? '')}
                        onChange={(e) =>
                          onChangeFormValues({
                            ...formValues,
                            [field.name]: e.target.value,
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-md"
                      >
                        <option value="">Select option...</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`acro-${field.name}`}
                        type="text"
                        value={String(formValues[field.name] ?? '')}
                        onChange={(e) =>
                          onChangeFormValues({
                            ...formValues,
                            [field.name]: e.target.value,
                          })
                        }
                        placeholder={`Enter ${readableLabel.toLowerCase()}...`}
                        className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-md"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
