'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  FileText,
  Download,
  CheckCircle2,
  Lock,
  PenTool,
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import {
  EditorAnnotationItem,
  renderPdfPageAtScale,
  applyEditorAnnotationsToPdf,
  inspectPdfBytes,
  fillPdfFormFields,
} from '@/lib/pdf-engine-client';
import { toPdfBlob } from '@/lib/pdf-utils';
import { SignatureBuilder } from '@/components/SignatureBuilder';

export default function SharedFormFillPage() {
  const params = useParams<{ id: string }>();
  const shareId = params?.id || '';

  const [isLoading, setIsLoading] = useState(true);
  const [requirePin, setRequirePin] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState('Shared Fillable PDF Form');
  const [fileName, setFileName] = useState('form.pdf');
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [annotations, setAnnotations] = useState<EditorAnnotationItem[]>([]);
  const [acroFieldValues, setAcroFieldValues] = useState<Record<string, string | boolean>>({});
  const [detectedAcroFields, setDetectedAcroFields] = useState<
    Array<{ name: string; type: string; options?: string[]; isRequired?: boolean }>
  >([]);

  const [activePage, setActivePage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pageRenderUrl, setPageRenderUrl] = useState<string>('');
  const [pageSize, setPageSize] = useState<{ width: number; height: number }>({ width: 612, height: 792 });

  const [activeSignatureTargetId, setActiveSignatureTargetId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [completedSuccess, setCompletedSuccess] = useState(false);

  const loadSharedForm = useCallback(
    async (pinValue = '') => {
      if (!shareId) return;
      try {
        setIsLoading(true);
        setErrorMsg(null);
        const res = await fetch(
          `/api/shared-forms?id=${encodeURIComponent(shareId)}${
            pinValue ? `&pin=${encodeURIComponent(pinValue)}` : ''
          }`
        );
        const data = await res.json();
        if (res.status === 401 && data.requirePin) {
          setRequirePin(true);
          if (data.title) setFormTitle(data.title);
          if (pinValue) setErrorMsg(data.error || 'Invalid PIN.');
          setIsLoading(false);
          return;
        }
        if (!res.ok) {
          setErrorMsg(data.error || 'Could not load this shared form.');
          setIsLoading(false);
          return;
        }

        setRequirePin(false);
        setFormTitle(data.title || 'Fillable PDF Form');
        setFileName(data.fileName || 'form.pdf');

        const rawBytes = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
        setPdfBytes(rawBytes);

        let parsedAnnots: EditorAnnotationItem[] = [];
        try {
          parsedAnnots = JSON.parse(data.annotationsJson || '[]');
        } catch {
          parsedAnnots = [];
        }
        setAnnotations(parsedAnnots);

        const info = await inspectPdfBytes(rawBytes);
        setPageCount(Math.max(1, info.pageCount));
        setDetectedAcroFields(info.formFields);
        const initVals: Record<string, string | boolean> = {};
        info.formFields.forEach((f) => {
          initVals[f.name] = f.value;
        });
        setAcroFieldValues(initVals);
      } catch (err) {
        setErrorMsg('Failed to load shared form: ' + (err as Error).message);
      } finally {
        setIsLoading(false);
      }
    },
    [shareId]
  );

  useEffect(() => {
    loadSharedForm();
  }, [loadSharedForm]);

  useEffect(() => {
    if (!pdfBytes) return;
    let cancelled = false;
    (async () => {
      try {
        const rendered = await renderPdfPageAtScale(pdfBytes, activePage, 1.35);
        if (!cancelled) {
          setPageRenderUrl(rendered.dataUrl);
          setPageSize({ width: rendered.widthPt, height: rendered.heightPt });
        }
      } catch {
        // Ignore page render error
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBytes, activePage]);

  const updateAnnotationField = (id: string, updates: Partial<EditorAnnotationItem>) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  const handleCompleteAndDownload = async () => {
    if (!pdfBytes) return;
    // Validate required fields
    const missingRequired = annotations.find(
      (a) =>
        a.isRequired &&
        ((a.type === 'form-text' || a.type === 'form-multiline' || a.type === 'form-dropdown')
          ? !(a.fieldValue ?? a.defaultValue ?? a.text ?? '').trim()
          : a.type === 'form-checkbox'
            ? !a.checked
            : a.type === 'form-signature'
              ? !a.imageDataUrl && !(a.fieldValue ?? '').trim()
              : false)
    );
    if (missingRequired) {
      setErrorMsg(
        `Please complete required field "${missingRequired.fieldName || missingRequired.type}" on Page ${missingRequired.pageNumber}.`
      );
      setActivePage(missingRequired.pageNumber);
      return;
    }

    try {
      setIsDownloading(true);
      setErrorMsg(null);
      let working = pdfBytes;
      if (Object.keys(acroFieldValues).length > 0) {
        working = await fillPdfFormFields(working, acroFieldValues, false);
      }
      const outBytes = await applyEditorAnnotationsToPdf(working, annotations);
      const blob = toPdfBlob(outBytes);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName.replace(/\.pdf$/i, '')}-completed.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setCompletedSuccess(true);

      await fetch('/api/shared-forms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: shareId }),
      }).catch(() => {});
    } catch (err) {
      setErrorMsg('Failed to export completed PDF: ' + (err as Error).message);
    } finally {
      setIsDownloading(false);
    }
  };

  const pageAnnotations = annotations
    .filter((a) => a.pageNumber === activePage)
    .sort((a, b) => (a.tabOrder ?? 999) - (b.tabOrder ?? 999));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/edit-pdf"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            PDFNestly Studio
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-red-500" />
            <span className="font-bold text-sm text-white truncate max-w-xs sm:max-w-md">
              {formTitle}
            </span>
            <span className="px-2 py-0.5 rounded bg-red-600/20 border border-red-500/30 text-red-300 text-[10px] font-bold uppercase">
              Fill & Sign Mode
            </span>
          </div>
        </div>

        {!requirePin && pdfBytes && (
          <div className="flex items-center gap-2.5">
            {pageCount > 1 && (
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs">
                <button
                  type="button"
                  disabled={activePage <= 1}
                  onClick={() => setActivePage((p) => Math.max(1, p - 1))}
                  className="p-0.5 text-slate-400 hover:text-white disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono text-slate-200 px-1">
                  Page {activePage} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={activePage >= pageCount}
                  onClick={() => setActivePage((p) => Math.min(pageCount, p + 1))}
                  className="p-0.5 text-slate-400 hover:text-white disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              type="button"
              data-testid="complete-shared-form-btn"
              onClick={handleCompleteAndDownload}
              disabled={isDownloading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white shadow-lg shadow-red-600/20 transition-colors"
            >
              <Download className="w-4 h-4" />
              {isDownloading ? 'Generating Signed PDF...' : 'Complete & Download Signed PDF'}
            </button>
          </div>
        )}
      </header>

      {errorMsg && (
        <div className="bg-red-950/90 border-b border-red-800 px-4 py-2.5 text-xs text-red-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-red-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {completedSuccess && (
        <div className="bg-emerald-950/90 border-b border-emerald-800 px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>
            Your completed & signed PDF has been downloaded with all interactive AcroForm fields preserved!
          </span>
        </div>
      )}

      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 overflow-auto">
        {isLoading ? (
          <div className="text-center space-y-2 text-slate-400 text-sm">
            <p className="font-semibold text-white">Loading shared PDF form...</p>
          </div>
        ) : requirePin ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 text-center shadow-2xl">
            <div className="w-11 h-11 rounded-xl bg-red-600/20 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto">
              <Lock className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h1 className="font-bold text-base text-white">Protected PDF Form</h1>
              <p className="text-xs text-slate-400">
                Enter the access PIN provided by the sender to fill and sign <strong>{formTitle}</strong>.
              </p>
            </div>
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Enter Access PIN"
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white text-center focus:outline-none focus:border-red-500"
            />
            <button
              type="button"
              onClick={() => loadSharedForm(pinInput)}
              className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white"
            >
              Unlock Form
            </button>
          </div>
        ) : pdfBytes ? (
          <div className="flex flex-col lg:flex-row items-start gap-6 max-w-6xl w-full justify-center">
            {/* Interactive PDF Page Canvas */}
            <div
              style={{
                width: `${Math.round(pageSize.width * 1.15)}px`,
                height: `${Math.round(pageSize.height * 1.15)}px`,
              }}
              className="relative bg-white shadow-2xl rounded-xs shrink-0 mx-auto overflow-hidden"
            >
              {pageRenderUrl && (
                <img
                  src={pageRenderUrl}
                  alt={`Form Page ${activePage}`}
                  className="w-full h-full object-contain pointer-events-none select-none"
                />
              )}

              {pageAnnotations.map((item) => {
                const posStyle: React.CSSProperties = {
                  left: `${item.xPercent}%`,
                  top: `${item.yPercent}%`,
                  width: `${item.widthPercent}%`,
                  height: `${item.heightPercent}%`,
                };

                if (item.type === 'form-text') {
                  return (
                    <input
                      key={item.id}
                      type="text"
                      value={item.fieldValue ?? item.defaultValue ?? ''}
                      placeholder={item.fieldPlaceholder || item.fieldName || 'Enter text...'}
                      onChange={(e) => updateAnnotationField(item.id, { fieldValue: e.target.value })}
                      style={posStyle}
                      className="absolute z-20 bg-sky-50/90 hover:bg-white focus:bg-white border border-sky-500 focus:border-red-600 rounded-xs px-1.5 text-xs text-slate-900 focus:outline-none"
                    />
                  );
                }
                if (item.type === 'form-multiline') {
                  return (
                    <textarea
                      key={item.id}
                      value={item.fieldValue ?? item.defaultValue ?? ''}
                      placeholder={item.fieldPlaceholder || item.fieldName || 'Enter text...'}
                      onChange={(e) => updateAnnotationField(item.id, { fieldValue: e.target.value })}
                      style={posStyle}
                      className="absolute z-20 bg-sky-50/90 hover:bg-white focus:bg-white border border-sky-500 focus:border-red-600 rounded-xs p-1.5 text-xs text-slate-900 resize-none focus:outline-none"
                    />
                  );
                }
                if (item.type === 'form-dropdown') {
                  const opts = item.dropdownOptions?.length
                    ? item.dropdownOptions
                    : ['Option 1', 'Option 2', 'Option 3'];
                  return (
                    <select
                      key={item.id}
                      value={item.fieldValue ?? item.defaultValue ?? opts[0]}
                      onChange={(e) => updateAnnotationField(item.id, { fieldValue: e.target.value })}
                      style={posStyle}
                      className="absolute z-20 bg-sky-50/90 border border-sky-500 rounded-xs px-1 text-xs text-slate-900 focus:outline-none"
                    >
                      {opts.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  );
                }
                if (item.type === 'form-checkbox') {
                  return (
                    <label
                      key={item.id}
                      style={posStyle}
                      className="absolute z-20 flex items-center justify-center bg-sky-50/85 border border-sky-500 rounded-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(item.checked)}
                        onChange={(e) => updateAnnotationField(item.id, { checked: e.target.checked })}
                        className="w-4 h-4 accent-red-600 cursor-pointer"
                      />
                    </label>
                  );
                }
                if (item.type === 'form-radio') {
                  const grp = item.radioGroupName || 'radio_group_1';
                  return (
                    <label
                      key={item.id}
                      style={posStyle}
                      className="absolute z-20 flex items-center justify-center bg-sky-50/85 border border-sky-500 rounded-full cursor-pointer"
                    >
                      <input
                        type="radio"
                        name={grp}
                        checked={Boolean(item.checked)}
                        onChange={() => {
                          setAnnotations((prev) =>
                            prev.map((a) =>
                              a.type === 'form-radio' && (a.radioGroupName || 'radio_group_1') === grp
                                ? { ...a, checked: a.id === item.id }
                                : a
                            )
                          );
                        }}
                        className="w-4 h-4 accent-red-600 cursor-pointer"
                      />
                    </label>
                  );
                }
                if (item.type === 'form-signature') {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSignatureTargetId(item.id)}
                      style={posStyle}
                      className="absolute z-20 bg-red-50/90 hover:bg-red-100/90 border-2 border-dashed border-red-500 rounded-xs flex items-center justify-center p-1 transition-colors"
                    >
                      {item.imageDataUrl ? (
                        <img
                          src={item.imageDataUrl}
                          alt="Signed"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700">
                          <PenTool className="w-3.5 h-3.5" />
                          Click to Sign{item.isRequired ? ' *' : ''}
                        </span>
                      )}
                    </button>
                  );
                }
                return null;
              })}
            </div>

            {/* Sidebar for Existing AcroForm Fields if present */}
            {detectedAcroFields.length > 0 && (
              <div className="w-full lg:w-72 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shrink-0">
                <h2 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                  Embedded Form Fields ({detectedAcroFields.length})
                </h2>
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {detectedAcroFields.map((f) => (
                    <div key={f.name} className="space-y-1 text-xs">
                      <label className="text-slate-300 font-medium block">{f.name}</label>
                      {f.type === 'checkbox' ? (
                        <input
                          type="checkbox"
                          checked={Boolean(acroFieldValues[f.name])}
                          onChange={(e) =>
                            setAcroFieldValues((p) => ({ ...p, [f.name]: e.target.checked }))
                          }
                          className="accent-red-600"
                        />
                      ) : (
                        <input
                          type="text"
                          value={String(acroFieldValues[f.name] ?? '')}
                          onChange={(e) =>
                            setAcroFieldValues((p) => ({ ...p, [f.name]: e.target.value }))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </main>

      {/* Signature Modal for signing form-signature fields */}
      {activeSignatureTargetId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-950 rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Sign Form Field
              </h3>
              <button
                type="button"
                onClick={() => setActiveSignatureTargetId(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SignatureBuilder
              onSignatureReady={(dataUrl) => {
                updateAnnotationField(activeSignatureTargetId, {
                  imageDataUrl: dataUrl,
                  fieldValue: `Signed ${new Date().toISOString().slice(0, 10)}`,
                });
                setActiveSignatureTargetId(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
