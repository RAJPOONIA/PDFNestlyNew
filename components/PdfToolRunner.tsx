'use client';

import React, { useState, useEffect } from 'react';
import {
  Upload,
  Download,
  Sparkles,
  RotateCw,
  Trash2,
  Copy,
  ArrowLeft,
  ArrowRight,
  Plus,
  CheckCircle2,
  AlertCircle,
  FileText,
  Lock,
  Unlock,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { PdfToolDefinition } from '@/lib/tools-registry';
import {
  formatFileSize,
  validateFileHeader,
  calculateCompressionRatio,
  PAGE_SIZE_PRESETS,
  DiffEntry,
  toPdfBlob,
} from '@/lib/pdf-utils';
import { generateSamplePdfBytes } from '@/lib/sample-pdf';
import {
  PageThumbnailInfo,
  PdfInspectionReport,
  ExtractedTextLine,
  PageOrganizerInstruction,
  inspectPdfBytes,
  renderPdfThumbnails,
  extractPdfTextAndLines,
  mergePdfFiles,
  splitPdfFile,
  buildOrganizedPdf,
  cropPdfPages,
  addPageNumbersAndHeaders,
  fillPdfFormFields,
  convertImagesToPdf,
  convertPdfToImagesBundle,
  convertDocumentOrTextToPdf,
  exportPdfToFormat,
  performOcrOnPdf,
  applyCoordinateTextEdits,
  permanentlyRedactPdf,
  compareTwoPdfs,
  updatePdfMetadataAndBookmarks,
  resizePdfPagesToPreset,
  sanitizeOrFlattenPdf,
} from '@/lib/pdf-engine-client';
import { PdfEditorWorkspace } from './PdfEditorWorkspace';

interface PdfToolRunnerProps {
  tool: PdfToolDefinition;
}

interface UploadedPdfItem {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
}

export function PdfToolRunner({ tool }: PdfToolRunnerProps) {
  // If tool is 'edit-pdf' or 'sign-pdf', render the full interactive editor workspace
  if (tool.slug === 'edit-pdf' || tool.slug === 'sign-pdf') {
    return (
      <PdfEditorWorkspace
        defaultTool={tool.slug === 'sign-pdf' ? 'signature' : 'text'}
      />
    );
  }

  return <StandardToolWorkspace tool={tool} />;
}

function StandardToolWorkspace({ tool }: { tool: PdfToolDefinition }) {
  // Primary PDF state
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [inspection, setInspection] = useState<PdfInspectionReport | null>(null);
  const [thumbnails, setThumbnails] = useState<PageThumbnailInfo[]>([]);

  // Multi-PDF state (for Merge & Compare)
  const [multiPdfs, setMultiPdfs] = useState<UploadedPdfItem[]>([]);
  const [compareBytesB, setCompareBytesB] = useState<Uint8Array | null>(null);
  const [compareNameB, setCompareNameB] = useState<string>('');

  // Images state (for JPG-to-PDF & Contact Sheet)
  const [imageFiles, setImageFiles] = useState<File[]>([]);

  // Office / Text input state
  const [officeFile, setOfficeFile] = useState<File | null>(null);
  const [composerTitle, setComposerTitle] = useState<string>(
    'Project Proposal & Technical Specification'
  );
  const [composerText, setComposerText] = useState<string>(
    `# 1. Executive Summary\nThis document was generated directly in the browser using PDFNestly's vector typesetting engine.\n\n# 2. Scope of Deliverables\nAll pages automatically wrap long paragraphs and preserve clean margins across A4 or US Letter sheets.\n\n# 3. Financial Summary\nPhase 1 Architecture & Setup: $2,400.00\nPhase 2 Production Deployment: $3,600.00`
  );

  // Page Organizer instruction list (for Rotate, Delete, Reorder, Organize)
  const [pageInstructions, setPageInstructions] = useState<
    Array<PageOrganizerInstruction & { thumbUrl?: string; label: string }>
  >([]);

  // Tool-specific options
  const [mergeFlattenForms, setMergeFlattenForms] = useState<boolean>(false);
  const [splitMode, setSplitMode] = useState<
    'extract-single' | 'ranges-zip' | 'burst-all-zip'
  >('extract-single');
  const [pageRangeInput, setPageRangeInput] = useState<string>('1-2');
  const [splitPartsDownloads, setSplitPartsDownloads] = useState<
    Array<{ fileName: string; url: string; pageCount: number; byteLength: number }>
  >([]);
  const [compressLevel, setCompressLevel] = useState<string>('ebook');
  const [cropMargins, setCropMargins] = useState({
    top: 36,
    right: 36,
    bottom: 36,
    left: 36,
  });
  const [pageNumberOptions, setPageNumberOptions] = useState({
    format: 'page-x-of-y' as const,
    position: 'bottom-center' as const,
    startFromPage: 1,
    fontSize: 10,
    headerText: 'PDFNestly Confidential Agreement',
    footerText: 'Internal Distribution Only',
  });
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const [flattenAfterFill, setFlattenAfterFill] = useState<boolean>(false);
  const [imageOutputFormat, setImageOutputFormat] = useState<'jpg' | 'png' | 'webp'>('png');
  const [imageScale, setImageScale] = useState<number>(2.0);
  const [renderedImagesPreview, setRenderedImagesPreview] = useState<
    Array<{ pageNumber: number; dataUrl: string; fileName: string }>
  >([]);
  const [exportFormat, setExportFormat] = useState<
    'docx' | 'xlsx' | 'csv' | 'txt' | 'html'
  >('docx');
  const [exportedPreviewText, setExportedPreviewText] = useState<string>('');
  const [ocrLang, setOcrLang] = useState<string>('eng');
  const [ocrProgressText, setOcrProgressText] = useState<string>('');
  const [ocrResultText, setOcrResultText] = useState<string>('');
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);

  // Extract & Text Edit state
  const [extractedData, setExtractedData] = useState<{
    fullText: string;
    lines: ExtractedTextLine[];
    tables: string[][][];
  } | null>(null);
  const [editableLines, setEditableLines] = useState<ExtractedTextLine[]>([]);

  // Security / Password / Redaction state
  const [securityAction, setSecurityAction] = useState<'protect' | 'unlock'>('protect');
  const [userPassword, setUserPassword] = useState<string>('');
  const [ownerPassword, setOwnerPassword] = useState<string>('');
  const [allowPrint, setAllowPrint] = useState<boolean>(true);
  const [allowCopy, setAllowCopy] = useState<boolean>(true);
  const [redactTermsInput, setRedactTermsInput] = useState<string>(
    'sk_live_994810294810_REDACT_ME, Northwind'
  );
  const [redactionReport, setRedactionReport] = useState<{
    count: number;
    verifiedClean: boolean;
  } | null>(null);

  // Compare state
  const [compareResults, setCompareResults] = useState<{
    diffs: DiffEntry[];
    addedCount: number;
    removedCount: number;
    unchangedCount: number;
  } | null>(null);

  // Metadata & Bookmarks state
  const [metaForm, setMetaForm] = useState({
    title: '',
    author: '',
    subject: '',
    keywords: '',
    creator: '',
    prependTocSheet: true,
    bookmarksText: '1. Master Service Agreement | 1\n2. Financial Schedule | 2\n3. Security Architecture | 3\n4. Execution Signatures | 4',
  });

  // Resize / Flatten / Print-ready state
  const [targetPageSize, setTargetPageSize] = useState<string>('A4');
  const [appendBlank, setAppendBlank] = useState<boolean>(false);
  const [contactSheetCols, setContactSheetCols] = useState<number>(
    tool.slug === 'contact-sheet-pdf' ? 2 : 1
  );
  const [bleedPt, setBleedPt] = useState<number>(18);
  const [addTrimMarks, setAddTrimMarks] = useState<boolean>(true);

  // Processing & Result Output State
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [resultDownload, setResultDownload] = useState<{
    url: string;
    fileName: string;
    originalBytes?: number;
    outputBytes: number;
    engineUsed: string;
    summaryMessage: string;
  } | null>(null);

  // When primary pdfBytes changes, inspect & render thumbnails (with graceful fallback for password-protected or damaged PDFs)
  useEffect(() => {
    if (!pdfBytes) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        let info: PdfInspectionReport;
        try {
          info = await inspectPdfBytes(pdfBytes);
        } catch {
          info = {
            pageCount: 1,
            title: fileName || 'Encrypted or Damaged PDF',
            author: '',
            subject: '',
            keywords: '',
            creator: '',
            producer: '',
            creationDate: '',
            modificationDate: '',
            pages: [
              {
                pageNumber: 1,
                widthPt: 612,
                heightPt: 792,
                widthMm: 216,
                heightMm: 279,
                rotation: 0,
              },
            ],
            formFields: [],
          };
        }

        let thumbs: PageThumbnailInfo[] = [];
        try {
          thumbs = await renderPdfThumbnails(pdfBytes, 0.35);
        } catch {
          // Encrypted PDF (awaiting password in Unlock tool) or damaged stream (awaiting Repair tool)
          thumbs = info.pages.map((p) => ({
            pageNumber: p.pageNumber,
            widthPt: p.widthPt,
            heightPt: p.heightPt,
            rotation: p.rotation,
            dataUrl: '',
          }));
        }

        if (cancelled) return;
        setInspection(info);
        setThumbnails(thumbs);
        setPageRangeInput(info.pageCount <= 1 ? '1' : `1-${Math.min(2, info.pageCount)}`);

        // Initialize form values
        const initialForms: Record<string, string | boolean> = {};
        info.formFields.forEach((f) => {
          initialForms[f.name] = f.value;
        });
        setFormValues(initialForms);

        // Initialize metadata form
        setMetaForm((prev) => ({
          ...prev,
          title: info.title,
          author: info.author,
          subject: info.subject,
          keywords: info.keywords,
          creator: info.creator,
        }));

        // Initialize page organizer instructions
        const pageList = thumbs.length > 0 ? thumbs : info.pages;
        setPageInstructions(
          pageList.map((t, idx) => ({
            type: 'existing',
            originalPageIndex: idx,
            extraRotation: 0,
            thumbUrl: 'dataUrl' in t && t.dataUrl ? t.dataUrl : undefined,
            label: `Page ${t.pageNumber}`,
          }))
        );

        // If tool needs text/lines extraction immediately (extract-pdf-data or edit-pdf-text)
        if (
          tool.slug === 'extract-pdf-data' ||
          tool.slug === 'edit-pdf-text' ||
          tool.slug === 'pdf-to-word'
        ) {
          const ext = await extractPdfTextAndLines(pdfBytes);
          if (!cancelled) {
            setExtractedData(ext);
            setEditableLines(ext.lines.slice(0, 60));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Unable to inspect uploaded PDF.'
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfBytes, fileName, tool.slug]);

  const clearResult = () => {
    if (resultDownload?.url) {
      URL.revokeObjectURL(resultDownload.url);
    }
    splitPartsDownloads.forEach((p) => URL.revokeObjectURL(p.url));
    setSplitPartsDownloads([]);
    setResultDownload(null);
    setErrorMessage('');
  };

  // Load Sample Data tailored to the current tool
  const handleLoadSample = async () => {
    clearResult();
    setIsProcessing(true);
    try {
      if (tool.acceptedInputs === 'multi-pdf') {
        const [bytesA, bytesB] = await Promise.all([
          generateSamplePdfBytes('primary'),
          generateSamplePdfBytes('comparison'),
        ]);
        setMultiPdfs([
          {
            id: 'sample-1',
            name: 'Contract-Part-1-Agreement.pdf',
            bytes: bytesA,
            pageCount: 4,
          },
          {
            id: 'sample-2',
            name: 'Contract-Part-2-Addendum.pdf',
            bytes: bytesB,
            pageCount: 4,
          },
        ]);
      } else if (tool.acceptedInputs === 'two-pdfs') {
        const [bytesA, bytesB] = await Promise.all([
          generateSamplePdfBytes('primary'),
          generateSamplePdfBytes('comparison'),
        ]);
        setPdfBytes(bytesA);
        setFileName('Service-Agreement-v1.0.pdf');
        setCompareBytesB(bytesB);
        setCompareNameB('Service-Agreement-v2.0-Revised.pdf');
      } else if (tool.acceptedInputs === 'images') {
        // Generate 4 crisp sample proof images using HTML5 canvas
        const generatedFiles: File[] = [];
        const colors = ['#1e3a8a', '#0f766e', '#334155', '#7c2d12'];
        for (let i = 1; i <= 4; i++) {
          const c = document.createElement('canvas');
          c.width = 640;
          c.height = 480;
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(0, 0, 640, 480);
            ctx.fillStyle = colors[i - 1];
            ctx.fillRect(32, 32, 576, 90);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 26px sans-serif';
            ctx.fillText(`PDFNestly Sample Exhibit #${i}`, 54, 88);
            ctx.fillStyle = '#1e293b';
            ctx.font = '18px sans-serif';
            ctx.fillText(
              `High-resolution proof card ${i} of 4 (640 × 480 px)`,
              54,
              200
            );
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 3;
            ctx.strokeRect(32, 32, 576, 416);
          }
          const blob = await new Promise<Blob | null>((r) =>
            c.toBlob((b) => r(b), 'image/png')
          );
          if (blob) {
            generatedFiles.push(
              new File([blob], `sample-exhibit-0${i}.png`, { type: 'image/png' })
            );
          }
        }
        setImageFiles(generatedFiles);
      } else {
        const sampleBytes = await generateSamplePdfBytes('primary');
        setPdfBytes(sampleBytes);
        setFileName('PDFNestly-Sample-Agreement.pdf');
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to generate sample input.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle user file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    clearResult();

    try {
      if (tool.acceptedInputs === 'multi-pdf') {
        const added: UploadedPdfItem[] = [];
        for (const f of files) {
          const bytes = new Uint8Array(await f.arrayBuffer());
          const v = validateFileHeader(bytes, 'pdf');
          if (!v.valid) {
            throw new Error(`${f.name}: ${v.error}`);
          }
          const info = await inspectPdfBytes(bytes);
          added.push({
            id: `${Date.now()}-${Math.random()}`,
            name: f.name,
            bytes,
            pageCount: info.pageCount,
          });
        }
        setMultiPdfs((prev) => [...prev, ...added]);
      } else if (tool.acceptedInputs === 'images') {
        for (const f of files) {
          const bytes = new Uint8Array(await f.arrayBuffer());
          const v = validateFileHeader(bytes, 'image');
          if (!v.valid) {
            throw new Error(`${f.name}: ${v.error}`);
          }
        }
        setImageFiles((prev) => [...prev, ...files]);
      } else if (tool.acceptedInputs === 'office-or-text') {
        const f = files[0];
        const bytes = new Uint8Array(await f.arrayBuffer());
        const v = validateFileHeader(bytes, 'office-or-text');
        if (!v.valid) {
          throw new Error(v.error);
        }
        setOfficeFile(f);
      } else {
        const f = files[0];
        const bytes = new Uint8Array(await f.arrayBuffer());
        if (tool.slug !== 'repair-pdf') {
          const v = validateFileHeader(bytes, 'pdf');
          if (!v.valid) {
            throw new Error(v.error);
          }
        }
        setPdfBytes(bytes);
        setFileName(f.name);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'File validation failed.');
    } finally {
      e.target.value = '';
    }
  };

  // Execute the active PDF tool operation
  const handleExecuteTool = async () => {
    clearResult();
    setIsProcessing(true);

    try {
      const baseName =
        (fileName || officeFile?.name || 'pdfnestly-document').replace(
          /\.[^.]+$/,
          ''
        ) || 'document';

      // 1. Merge PDF
      if (tool.slug === 'merge-pdf') {
        if (multiPdfs.length < 2) {
          throw new Error('Please upload or load at least 2 PDF files to merge.');
        }
        const totalIn = multiPdfs.reduce((acc, m) => acc + m.bytes.byteLength, 0);
        const outBytes = await mergePdfFiles(
          multiPdfs.map((m) => m.bytes),
          { flattenForms: mergeFlattenForms }
        );
        const blob = toPdfBlob(outBytes);
        setResultDownload({
          url: URL.createObjectURL(blob),
          fileName: 'merged-document.pdf',
          originalBytes: totalIn,
          outputBytes: outBytes.byteLength,
          engineUsed: 'pdf-lib (Local Browser)',
          summaryMessage: `Merged ${multiPdfs.length} PDF files into a unified PDF document (${
            mergeFlattenForms ? 'form fields flattened' : 'interactive form fields preserved'
          }).`,
        });
        return;
      }

      // 2. Split PDF
      if (tool.slug === 'split-pdf') {
        if (!pdfBytes) throw new Error('Please upload or load a PDF file first.');
        const res = await splitPdfFile(pdfBytes, splitMode, pageRangeInput, baseName);
        setSplitPartsDownloads(
          res.splitParts.map((part) => ({
            fileName: part.fileName,
            url: URL.createObjectURL(toPdfBlob(part.bytes)),
            pageCount: part.pageCount,
            byteLength: part.bytes.byteLength,
          }))
        );
        setResultDownload({
          url: URL.createObjectURL(res.blob),
          fileName: res.fileName,
          originalBytes: pdfBytes.byteLength,
          outputBytes: res.blob.size,
          engineUsed: res.isZip ? 'pdf-lib + JSZip (Local Browser)' : 'pdf-lib (Local Browser)',
          summaryMessage: `Successfully generated ${res.fileName} (${res.count} output file(s)).`,
        });
        return;
      }

      // 3, 20, 23, 30. Server-side Ghostscript operations (Compress, Protect/Unlock, Repair, Print-Ready)
      if (
        tool.slug === 'compress-pdf' ||
        tool.slug === 'protect-pdf' ||
        tool.slug === 'repair-pdf' ||
        tool.slug === 'print-ready-pdf'
      ) {
        if (!pdfBytes) throw new Error('Please upload or load a PDF file first.');
        const formData = new FormData();
        formData.append(
          'file',
          toPdfBlob(pdfBytes),
          fileName || 'input.pdf'
        );

        if (tool.slug === 'compress-pdf') {
          formData.append('operation', 'compress');
          formData.append('level', compressLevel);
        } else if (tool.slug === 'protect-pdf') {
          if (securityAction === 'protect') {
            formData.append('operation', 'protect');
            formData.append('userPassword', userPassword);
            formData.append('ownerPassword', ownerPassword);
            formData.append('allowPrint', String(allowPrint));
            formData.append('allowCopy', String(allowCopy));
          } else {
            formData.append('operation', 'unlock');
            formData.append('password', userPassword);
          }
        } else if (tool.slug === 'repair-pdf') {
          formData.append('operation', 'repair');
        } else if (tool.slug === 'print-ready-pdf') {
          formData.append('operation', 'print-ready');
          formData.append('bleedPt', String(bleedPt));
          formData.append('addTrimMarks', String(addTrimMarks));
        }

        const response = await fetch('/api/pdf/process', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.error || `Server error (${response.status})`);
        }

        const outArrayBuf = await response.arrayBuffer();
        const outBytes = new Uint8Array(outArrayBuf);
        const engineHeader =
          response.headers.get('X-Engine-Used') || 'Ghostscript 9.55 Server Engine';
        const ratio = calculateCompressionRatio(
          pdfBytes.byteLength,
          outBytes.byteLength
        );

        const suffixMap: Record<string, string> = {
          'compress-pdf': 'compressed',
          'protect-pdf': securityAction === 'protect' ? 'protected' : 'unlocked',
          'repair-pdf': 'repaired',
          'print-ready-pdf': 'print-ready',
        };

        setResultDownload({
          url: URL.createObjectURL(toPdfBlob(outBytes)),
          fileName: `${baseName}-${suffixMap[tool.slug]}.pdf`,
          originalBytes: pdfBytes.byteLength,
          outputBytes: outBytes.byteLength,
          engineUsed: engineHeader,
          summaryMessage:
            tool.slug === 'compress-pdf'
              ? `Compression complete: ${ratio.summary}.`
              : `Processed successfully with ${engineHeader}.`,
        });
        return;
      }

      // 4, 5, 6, 7. Rotate, Delete, Reorder, Organize
      if (
        tool.slug === 'rotate-pdf' ||
        tool.slug === 'delete-pdf-pages' ||
        tool.slug === 'reorder-pdf-pages' ||
        tool.slug === 'organize-pdf'
      ) {
        if (!pdfBytes) throw new Error('Please upload or load a PDF file first.');
        const outBytes = await buildOrganizedPdf(pdfBytes, pageInstructions);
        setResultDownload({
          url: URL.createObjectURL(toPdfBlob(outBytes)),
          fileName: `${baseName}-${tool.slug}.pdf`,
          originalBytes: pdfBytes.byteLength,
          outputBytes: outBytes.byteLength,
          engineUsed: 'pdf-lib Page Organizer (Local Browser)',
          summaryMessage: `Saved PDF with ${pageInstructions.length} organized page(s).`,
        });
        return;
      }

      // 8. Crop PDF
      if (tool.slug === 'crop-pdf') {
        if (!pdfBytes) throw new Error('Please upload or load a PDF file first.');
        const outBytes = await cropPdfPages(pdfBytes, cropMargins);
        setResultDownload({
          url: URL.createObjectURL(toPdfBlob(outBytes)),
          fileName: `${baseName}-cropped.pdf`,
          originalBytes: pdfBytes.byteLength,
          outputBytes: outBytes.byteLength,
          engineUsed: 'pdf-lib CropBox/MediaBox Engine',
          summaryMessage: `Applied margins (${cropMargins.top}pt top, ${cropMargins.right}pt right, ${cropMargins.bottom}pt bottom, ${cropMargins.left}pt left).`,
        });
        return;
      }

      // 9. Page Numbers, Headers & Footers
      if (tool.slug === 'page-numbers-pdf') {
        if (!pdfBytes) throw new Error('Please upload or load a PDF file first.');
        const outBytes = await addPageNumbersAndHeaders(pdfBytes, pageNumberOptions);
        setResultDownload({
          url: URL.createObjectURL(toPdfBlob(outBytes)),
          fileName: `${baseName}-numbered.pdf`,
          originalBytes: pdfBytes.byteLength,
          outputBytes: outBytes.byteLength,
          engineUsed: 'pdf-lib Vector Typesetter',
          summaryMessage: `Added page numbering and headers/footers across document.`,
        });
        return;
      }

      // 12. Fill Interactive PDF Forms
      if (tool.slug === 'fill-pdf-forms') {
        if (!pdfBytes) throw new Error('Please upload or load a PDF file first.');
        const outBytes = await fillPdfFormFields(
          pdfBytes,
          formValues,
          flattenAfterFill
        );
        setResultDownload({
          url: URL.createObjectURL(toPdfBlob(outBytes)),
          fileName: `${baseName}-filled-form.pdf`,
          originalBytes: pdfBytes.byteLength,
          outputBytes: outBytes.byteLength,
          engineUsed: 'pdf-lib AcroForm Engine',
          summaryMessage: `Saved ${Object.keys(formValues).length} form field value(s)${
            flattenAfterFill ? ' and flattened fields into static content' : ''
          }.`,
        });
        return;
      }

      // 13 & 29. Images to PDF & Contact Sheet PDF
      if (tool.slug === 'jpg-to-pdf' || tool.slug === 'contact-sheet-pdf') {
        if (imageFiles.length === 0) {
          throw new Error(
            'Please upload at least one image (or click Load Sample Proof Images).'
          );
        }
        const totalIn = imageFiles.reduce((acc, f) => acc + f.size, 0);
        const outBytes = await convertImagesToPdf(imageFiles, {
          pageSize: targetPageSize as 'fit' | 'A4' | 'Letter',
          marginPt: 24,
          contactSheetColumns:
            tool.slug === 'contact-sheet-pdf' ? contactSheetCols : 1,
          showCaptions: tool.slug === 'contact-sheet-pdf',
        });
        setResultDownload({
          url: URL.createObjectURL(toPdfBlob(outBytes)),
          fileName:
            tool.slug === 'contact-sheet-pdf'
              ? 'contact-sheet-grid.pdf'
              : 'images-compiled.pdf',
          originalBytes: totalIn,
          outputBytes: outBytes.byteLength,
          engineUsed: 'Canvas Image Decoder + pdf-lib Compositor',
          summaryMessage: `Compiled ${imageFiles.length} image(s) into a valid PDF document.`,
        });
        return;
      }

      // 14. PDF to Images (JPG, PNG, WebP)
      if (tool.slug === 'pdf-to-jpg') {
        if (!pdfBytes) throw new Error('Please upload or load a PDF file first.');
        const bundle = await convertPdfToImagesBundle(
          pdfBytes,
          imageOutputFormat,
          imageScale,
          baseName
        );
        setRenderedImagesPreview(bundle.images);
        setResultDownload({
          url: URL.createObjectURL(bundle.zipBlob),
          fileName: `${baseName}-${imageOutputFormat}-images.zip`,
          originalBytes: pdfBytes.byteLength,
          outputBytes: bundle.zipBlob.size,
          engineUsed: 'Mozilla PDF.js Rasterizer + JSZip',
          summaryMessage: `Rendered ${bundle.images.length} page(s) to ${imageOutputFormat.toUpperCase()} images and packaged into ZIP.`,
        });
        return;
      }

      // 15 & 25. Word/Excel/Text to PDF & Create PDF from Scratch
      if (tool.slug === 'word-to-pdf' || tool.slug === 'create-pdf') {
        const outBytes = await convertDocumentOrTextToPdf(
          {
            file: officeFile || undefined,
            rawText: officeFile ? undefined : composerText,
            title: composerTitle,
          },
          {
            pageSize: (targetPageSize === 'Letter' ? 'Letter' : 'A4') as
              | 'A4'
              | 'Letter',
            fontSize: 11,
          }
        );
        setResultDownload({
          url: URL.createObjectURL(toPdfBlob(outBytes)),
          fileName: `${baseName}-converted.pdf`,
          originalBytes: officeFile?.size || composerText.length,
          outputBytes: outBytes.byteLength,
          engineUsed: 'Mammoth / SheetJS + pdf-lib Typesetter',
          summaryMessage: 'Generated paginated vector PDF document.',
        });
        return;
      }

      // 16. Export PDF to Word (.docx), Excel (.xlsx), CSV, HTML, or TXT
      if (tool.slug === 'pdf-to-word') {
        if (!pdfBytes) throw new Error('Please upload or load a PDF file first.');
        const res = await exportPdfToFormat(pdfBytes, exportFormat, baseName);
        setExportedPreviewText(res.previewText);
        setResultDownload({
          url: URL.createObjectURL(res.blob),
          fileName: res.fileName,
          originalBytes: pdfBytes.byteLength,
          outputBytes: res.blob.size,
          engineUsed: 'PDF.js Coordinate Parser + OpenXML (docx / SheetJS) Builder',
          summaryMessage: `Exported PDF structure to ${res.fileName}.`,
        });
        return;
      }

      // 17. OCR PDF
      if (tool.slug === 'ocr-pdf') {
        if (!pdfBytes) throw new Error('Please upload or load a PDF file first.');
        const res = await performOcrOnPdf(
          pdfBytes,
          ocrLang,
          4,
          (status, pct) => setOcrProgressText(`${status} (${pct}%)`)
        );
        setOcrResultText(res.recognizedText);
        setOcrConfidence(res.averageConfidence);
        setResultDownload({
          url: URL.createObjectURL(
            toPdfBlob(res.searchablePdfBytes)
          ),
          fileName: `${baseName}-searchable-ocr.pdf`,
          originalBytes: pdfBytes.byteLength,
          outputBytes: res.searchablePdfBytes.byteLength,
          engineUsed: 'Tesseract.js WebAssembly OCR + pdf-lib Searchable Layer',
          summaryMessage: `OCR completed with ${res.averageConfidence}% average word confidence. Searchable PDF ready.`,
        });
        return;
      }

      // 18. Extract Text, Tables & Metadata
      if (tool.slug === 'extract-pdf-data') {
        if (!pdfBytes) throw new Error('Please upload or load a PDF file first.');
        const ext = await extractPdfTextAndLines(pdfBytes);
        setExtractedData(ext);
        const jsonReport = JSON.stringify(
          {
            metadata: inspection,
            tables: ext.tables,
            fullText: ext.fullText,
          },
          null,
          2
        );
        const blob = new Blob([jsonReport], { type: 'application/json' });
        setResultDownload({
          url: URL.createObjectURL(blob),
          fileName: `${baseName}-extracted-data.json`,
          originalBytes: pdfBytes.byteLength,
          outputBytes: blob.size,
          engineUsed: 'PDF.js Text & Table Coordinate Extractor',
          summaryMessage: `Extracted ${ext.lines.length} text lines and ${ext.tables.length} table block(s).`,
        });
        return;
      }

      // 19. Edit Existing PDF Text Lines
      if (tool.slug === 'edit-pdf-text') {
        if (!pdfBytes) throw new Error('Please upload or load a PDF file first.');
        const outBytes = await applyCoordinateTextEdits(pdfBytes, editableLines);
        const changedCount = editableLines.filter(
          (l) => l.text !== l.originalText
        ).length;
        setResultDownload({
          url: URL.createObjectURL(toPdfBlob(outBytes)),
          fileName: `${baseName}-text-edited.pdf`,
          originalBytes: pdfBytes.byteLength,
          outputBytes: outBytes.byteLength,
          engineUsed: 'PDF.js Coordinate Locator + pdf-lib Vector Text Replacer',
          summaryMessage: `Updated ${changedCount} text line(s) at their exact page coordinates.`,
        });
        return;
      }

      // 21. Permanent Redaction
      if (tool.slug === 'redact-pdf') {
        if (!pdfBytes) throw new Error('Please upload or load a PDF file first.');
        const terms = redactTermsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        const res = await permanentlyRedactPdf(pdfBytes, terms);
        setRedactionReport({
          count: res.redactionCount,
          verifiedClean: res.verifiedClean,
        });
        setResultDownload({
          url: URL.createObjectURL(
            toPdfBlob(res.redactedPdfBytes)
          ),
          fileName: `${baseName}-redacted-sanitized.pdf`,
          originalBytes: pdfBytes.byteLength,
          outputBytes: res.redactedPdfBytes.byteLength,
          engineUsed: 'PDF.js Raster Sanitizer + Stream Reconstruction',
          summaryMessage: `Burned ${res.redactionCount} redaction region(s) and destroyed underlying text streams (Post-audit clean: ${
            res.verifiedClean ? 'VERIFIED' : 'CHECK'
          }).`,
        });
        return;
      }

      // 22. Compare Two PDFs
      if (tool.slug === 'compare-pdf') {
        if (!pdfBytes || !compareBytesB) {
          throw new Error(
            'Please upload both Original PDF (A) and Revised PDF (B), or click "Load Sample v1 & v2 Pair".'
          );
        }
        const res = await compareTwoPdfs(pdfBytes, compareBytesB);
        setCompareResults({
          diffs: res.diffs,
          addedCount: res.addedCount,
          removedCount: res.removedCount,
          unchangedCount: res.unchangedCount,
        });
        setResultDownload({
          url: URL.createObjectURL(
            toPdfBlob(res.reportPdfBytes)
          ),
          fileName: 'pdf-comparison-audit-report.pdf',
          originalBytes: pdfBytes.byteLength + compareBytesB.byteLength,
          outputBytes: res.reportPdfBytes.byteLength,
          engineUsed: 'PDF.js Text Extractor + LCS Diff Engine',
          summaryMessage: `Comparison complete: +${res.addedCount} additions, -${res.removedCount} removals, ${res.unchangedCount} unchanged lines.`,
        });
        return;
      }

      // 24. PDF Metadata & Bookmarks
      if (tool.slug === 'pdf-metadata') {
        if (!pdfBytes) throw new Error('Please upload or load a PDF file first.');
        const parsedBookmarks = metaForm.bookmarksText
          .split('\n')
          .map((line) => {
            const [t, p] = line.split('|').map((s) => s.trim());
            return {
              title: t || 'Section',
              targetPage: Number(p) || 1,
            };
          })
          .filter((b) => b.title.length > 0);

        const outBytes = await updatePdfMetadataAndBookmarks(pdfBytes, {
          ...metaForm,
          bookmarksList: parsedBookmarks,
        });
        setResultDownload({
          url: URL.createObjectURL(toPdfBlob(outBytes)),
          fileName: `${baseName}-metadata-updated.pdf`,
          originalBytes: pdfBytes.byteLength,
          outputBytes: outBytes.byteLength,
          engineUsed: 'pdf-lib Info Dictionary & Outline Builder',
          summaryMessage: 'Updated PDF metadata properties and bookmark table of contents.',
        });
        return;
      }

      // 26. Resize PDF Pages & Add Blank Pages
      if (tool.slug === 'resize-pdf-pages') {
        if (!pdfBytes) throw new Error('Please upload or load a PDF file first.');
        const outBytes = await resizePdfPagesToPreset(
          pdfBytes,
          targetPageSize,
          appendBlank
        );
        setResultDownload({
          url: URL.createObjectURL(toPdfBlob(outBytes)),
          fileName: `${baseName}-resized-${targetPageSize}.pdf`,
          originalBytes: pdfBytes.byteLength,
          outputBytes: outBytes.byteLength,
          engineUsed: 'pdf-lib XObject Page Scaler',
          summaryMessage: `Standardized all pages to ${targetPageSize} sheet dimensions.`,
        });
        return;
      }

      // 27 & 28. Flatten PDF / Remove Annotations & Metadata
      if (
        tool.slug === 'flatten-pdf' ||
        tool.slug === 'remove-pdf-annotations'
      ) {
        if (!pdfBytes) throw new Error('Please upload or load a PDF file first.');
        const outBytes = await sanitizeOrFlattenPdf(pdfBytes, {
          flattenForms: true,
          stripAnnotations: tool.slug === 'remove-pdf-annotations',
          stripMetadata: tool.slug === 'remove-pdf-annotations',
        });
        setResultDownload({
          url: URL.createObjectURL(toPdfBlob(outBytes)),
          fileName: `${baseName}-${tool.slug}.pdf`,
          originalBytes: pdfBytes.byteLength,
          outputBytes: outBytes.byteLength,
          engineUsed: 'pdf-lib Dictionary Sanitizer & Form Flattener',
          summaryMessage:
            tool.slug === 'flatten-pdf'
              ? 'Flattened interactive form fields into permanent page content.'
              : 'Stripped annotations, comments, form widgets, and identifying metadata.',
        });
        return;
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Operation failed unexpectedly.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl overflow-hidden shadow-xs">
      {/* Top Engine & Privacy Transparency Bar */}
      <div className="px-5 py-3 bg-[#FAFAFA] dark:bg-[#27272A] border-b border-[#E4E4E7] dark:border-[#3F3F46] flex flex-wrap items-center justify-between gap-2 text-xs text-[#52525B] dark:text-[#D4D4D8]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
          <span>{tool.privacyDisclosure}</span>
        </div>
        <div className="font-mono text-[#52525B] dark:text-[#D4D4D8]">
          Engine: <strong className="text-[#18181B] dark:text-[#FAFAFA]">{tool.engineLabel}</strong>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Step 1: Upload or Load Sample Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-[#E4E4E7] dark:border-[#3F3F46]">
          <div>
            <h2 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
              1. Select Document Input
            </h2>
            <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] mt-0.5">
              Upload your own file(s) or load a real sample document to test{' '}
              {tool.shortTitle} immediately.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label
              htmlFor={`upload-input-${tool.slug}`}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg cursor-pointer transition-colors whitespace-nowrap shrink-0 shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              {tool.acceptedInputs === 'multi-pdf'
                ? 'Upload PDF Files'
                : tool.acceptedInputs === 'images'
                ? 'Upload Images (JPG/PNG/WebP)'
                : tool.acceptedInputs === 'office-or-text'
                ? 'Upload DOCX / XLSX / CSV / TXT'
                : 'Upload PDF File'}
              <input
                id={`upload-input-${tool.slug}`}
                type="file"
                multiple={
                  tool.acceptedInputs === 'multi-pdf' ||
                  tool.acceptedInputs === 'images'
                }
                accept={
                  tool.acceptedInputs === 'images'
                    ? 'image/jpeg,image/png,image/webp'
                    : tool.acceptedInputs === 'office-or-text'
                    ? '.docx,.xlsx,.xls,.csv,.html,.txt'
                    : 'application/pdf,.pdf'
                }
                onChange={handleFileUpload}
                className="sr-only"
              />
            </label>

            {tool.acceptedInputs === 'two-pdfs' && (
              <label
                htmlFor="upload-second-pdf"
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] bg-[#FAFAFA] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#09090B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Revised PDF (B)
                <input
                  id="upload-second-pdf"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const b = new Uint8Array(await f.arrayBuffer());
                    const check = validateFileHeader(b, 'pdf');
                    if (!check.valid) {
                      setErrorMessage(check.error || 'Invalid second PDF');
                      return;
                    }
                    setCompareBytesB(b);
                    setCompareNameB(f.name);
                  }}
                  className="sr-only"
                />
              </label>
            )}

            <button
              type="button"
              onClick={handleLoadSample}
              disabled={isProcessing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] bg-white dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#FAFAFA] dark:hover:bg-[#09090B] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#B91C1C] dark:text-[#EF4444]" />
              {tool.acceptedInputs === 'multi-pdf'
                ? 'Load 2 Sample PDFs'
                : tool.acceptedInputs === 'two-pdfs'
                ? 'Load Sample v1 & v2 Pair'
                : tool.acceptedInputs === 'images'
                ? 'Load 4 Sample Proof Images'
                : 'Load Sample PDF'}
            </button>
          </div>
        </div>

        {/* Loaded File Summary & Tool-Specific Controls */}
        {tool.acceptedInputs === 'multi-pdf' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#52525B] dark:text-[#D4D4D8]">
                Files Queued for Merge ({multiPdfs.length})
              </h3>
              <label className="inline-flex items-center gap-2 text-xs text-[#18181B] dark:text-[#FAFAFA] cursor-pointer">
                <input
                  type="checkbox"
                  checked={mergeFlattenForms}
                  onChange={(e) => setMergeFlattenForms(e.target.checked)}
                  className="accent-[#B91C1C]"
                />
                <span>Flatten interactive form fields before merging</span>
              </label>
            </div>
            {multiPdfs.length === 0 ? (
              <div className="p-8 border border-dashed border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA]/50 dark:bg-[#09090B]/40 rounded-lg text-center text-xs text-[#52525B] dark:text-[#D4D4D8]">
                No PDF files queued yet. Click &ldquo;Upload PDF Files&rdquo; or
                &ldquo;Load 2 Sample PDFs&rdquo; above.
              </div>
            ) : (
              <div className="space-y-2">
                {multiPdfs.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-4 py-2.5 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-[#52525B] dark:text-[#D4D4D8]">
                        {idx + 1}.
                      </span>
                      <FileText className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444]" />
                      <span className="font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                        {item.name}
                      </span>
                      <span className="text-[#52525B] dark:text-[#D4D4D8] tabular-nums">
                        · {item.pageCount} pages ·{' '}
                        {formatFileSize(item.bytes.byteLength)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => {
                          const copy = [...multiPdfs];
                          const temp = copy[idx - 1];
                          copy[idx - 1] = copy[idx];
                          copy[idx] = temp;
                          setMultiPdfs(copy);
                        }}
                        aria-label={`Move ${item.name} up`}
                        className="px-2 py-1 bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded hover:bg-[#FAFAFA] dark:hover:bg-[#09090B] disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={idx === multiPdfs.length - 1}
                        onClick={() => {
                          const copy = [...multiPdfs];
                          const temp = copy[idx + 1];
                          copy[idx + 1] = copy[idx];
                          copy[idx] = temp;
                          setMultiPdfs(copy);
                        }}
                        aria-label={`Move ${item.name} down`}
                        className="px-2 py-1 bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded hover:bg-[#FAFAFA] dark:hover:bg-[#09090B] disabled:opacity-40"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMultiPdfs(multiPdfs.filter((m) => m.id !== item.id))
                        }
                        aria-label={`Remove ${item.name}`}
                        className="p-1 text-[#D64545] hover:bg-[#D64545]/10 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Two-PDF Comparison Status */}
        {tool.acceptedInputs === 'two-pdfs' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg text-xs space-y-1">
              <div className="font-bold text-[#52525B] dark:text-[#D4D4D8]">Original PDF (Document A)</div>
              {pdfBytes ? (
                <div className="text-[#18181B] dark:text-[#FAFAFA] font-medium tabular-nums">
                  {fileName} ({formatFileSize(pdfBytes.byteLength)})
                </div>
              ) : (
                <div className="text-[#52525B] dark:text-[#D4D4D8]">Not loaded yet</div>
              )}
            </div>
            <div className="p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg text-xs space-y-1">
              <div className="font-bold text-[#52525B] dark:text-[#D4D4D8]">Revised PDF (Document B)</div>
              {compareBytesB ? (
                <div className="text-[#18181B] dark:text-[#FAFAFA] font-medium tabular-nums">
                  {compareNameB} ({formatFileSize(compareBytesB.byteLength)})
                </div>
              ) : (
                <div className="text-[#52525B] dark:text-[#D4D4D8]">Not loaded yet</div>
              )}
            </div>
          </div>
        )}

        {/* Images Queue */}
        {tool.acceptedInputs === 'images' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#52525B] dark:text-[#D4D4D8]">
                Selected Images ({imageFiles.length})
              </span>
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5">
                  <span className="text-[#52525B] dark:text-[#D4D4D8] font-medium">Sheet Size:</span>
                  <select
                    value={targetPageSize}
                    onChange={(e) => setTargetPageSize(e.target.value)}
                    className="px-2.5 py-1.5 bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                  >
                    <option value="A4">A4 (210 × 297 mm)</option>
                    <option value="Letter">US Letter (8.5 × 11 in)</option>
                    <option value="fit">Fit to Image Dimensions</option>
                  </select>
                </label>
                {tool.slug === 'contact-sheet-pdf' && (
                  <label className="flex items-center gap-1.5">
                    <span className="text-[#52525B] dark:text-[#D4D4D8] font-medium">Grid Columns:</span>
                    <select
                      value={contactSheetCols}
                      onChange={(e) => setContactSheetCols(Number(e.target.value))}
                      className="px-2.5 py-1.5 bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                    >
                      <option value={2}>2 × 2 Grid (4 per page)</option>
                      <option value={3}>3 × 3 Grid (9 per page)</option>
                      <option value={4}>4 × 4 Grid (16 per page)</option>
                    </select>
                  </label>
                )}
              </div>
            </div>
            {imageFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {imageFiles.map((img, i) => (
                  <div
                    key={i}
                    className="px-3 py-1.5 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded text-xs text-[#18181B] dark:text-[#FAFAFA] flex items-center gap-2"
                  >
                    <span>{img.name}</span>
                    <span className="text-[#52525B] dark:text-[#D4D4D8] tabular-nums">
                      ({formatFileSize(img.size)})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Office or Text Composer Input */}
        {tool.acceptedInputs === 'office-or-text' && (
          <div className="space-y-4">
            {officeFile ? (
              <div className="p-3 bg-[#B91C1C]/10 border border-[#B91C1C]/30 rounded-lg flex items-center justify-between text-xs text-[#18181B] dark:text-[#FAFAFA]">
                <span>
                  Loaded file: <strong>{officeFile.name}</strong> (
                  {formatFileSize(officeFile.size)})
                </span>
                <button
                  type="button"
                  onClick={() => setOfficeFile(null)}
                  className="text-[#B91C1C] dark:text-[#EF4444] underline"
                >
                  Switch to Text Composer
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="composer-doc-title"
                      className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                    >
                      Document Title
                    </label>
                    <input
                      id="composer-doc-title"
                      type="text"
                      value={composerTitle}
                      onChange={(e) => setComposerTitle(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="composer-page-size"
                      className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                    >
                      Target Page Size
                    </label>
                    <select
                      id="composer-page-size"
                      value={targetPageSize}
                      onChange={(e) => setTargetPageSize(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                    >
                      <option value="A4">A4 (210 × 297 mm)</option>
                      <option value="Letter">US Letter (8.5 × 11 in)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="composer-body-textarea"
                    className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                  >
                    Document Content (Use # for Headings, or upload a .docx/.xlsx/.csv file above)
                  </label>
                  <textarea
                    id="composer-body-textarea"
                    rows={7}
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    className="w-full p-3 text-xs font-mono bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Single-PDF Loaded Inspector & Tool-Specific Configuration */}
        {pdfBytes && inspection && tool.acceptedInputs === 'pdf' && (
          <div className="space-y-5">
            {/* File Info Bar */}
            <div className="px-4 py-3 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444]" />
                <span className="font-bold text-[#18181B] dark:text-[#FAFAFA]">{fileName}</span>
                <span className="text-[#52525B] dark:text-[#D4D4D8] tabular-nums">
                  · {inspection.pageCount} Pages ·{' '}
                  {formatFileSize(pdfBytes.byteLength)}
                </span>
              </div>
              <div className="text-[#52525B] dark:text-[#D4D4D8] tabular-nums">
                Page 1 Size: {inspection.pages[0]?.widthPt} ×{' '}
                {inspection.pages[0]?.heightPt} pt ({inspection.pages[0]?.widthMm} ×{' '}
                {inspection.pages[0]?.heightMm} mm)
              </div>
            </div>

            {/* Split PDF Options */}
            {tool.slug === 'split-pdf' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg">
                <div>
                  <label
                    htmlFor="split-mode-select"
                    className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                  >
                    Split Mode
                  </label>
                  <select
                    id="split-mode-select"
                    value={splitMode}
                    onChange={(e) =>
                      setSplitMode(
                        e.target.value as
                          | 'extract-single'
                          | 'ranges-zip'
                          | 'burst-all-zip'
                      )
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                  >
                    <option value="extract-single">
                      Extract Selected Pages into 1 PDF
                    </option>
                    <option value="ranges-zip">
                      Split by Custom Ranges into Separate PDFs (ZIP)
                    </option>
                    <option value="burst-all-zip">
                      Burst Every Page into Separate PDFs (ZIP)
                    </option>
                  </select>
                </div>
                {splitMode !== 'burst-all-zip' && (
                  <div>
                    <label
                      htmlFor="split-range-input"
                      className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                    >
                      Page Ranges (1 to {inspection.pageCount})
                    </label>
                    <input
                      id="split-range-input"
                      type="text"
                      value={pageRangeInput}
                      onChange={(e) => setPageRangeInput(e.target.value)}
                      placeholder="e.g. 1-2, 4"
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Compress PDF Options */}
            {tool.slug === 'compress-pdf' && (
              <div className="p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg space-y-2">
                <label
                  htmlFor="compress-preset-select"
                  className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
                >
                  Ghostscript Compression Profile
                </label>
                <select
                  id="compress-preset-select"
                  value={compressLevel}
                  onChange={(e) => setCompressLevel(e.target.value)}
                  className="w-full sm:w-96 px-3 py-2 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                >
                  <option value="screen">
                    Maximum Compression — Screen Preset (72 DPI images)
                  </option>
                  <option value="ebook">
                    Balanced Compression — eBook Preset (150 DPI images, Recommended)
                  </option>
                  <option value="printer">
                    High Quality — Printer Preset (300 DPI images)
                  </option>
                  <option value="prepress">
                    Archival Prepress — Color Preserving (300 DPI)
                  </option>
                </select>
              </div>
            )}

            {/* Interactive Page Organizer Grid (Rotate, Delete, Reorder, Organize) */}
            {(tool.slug === 'rotate-pdf' ||
              tool.slug === 'delete-pdf-pages' ||
              tool.slug === 'reorder-pdf-pages' ||
              tool.slug === 'organize-pdf') && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#52525B] dark:text-[#D4D4D8]">
                    Interactive Page Sequence ({pageInstructions.length} Pages)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPageInstructions((prev) =>
                          prev.map((p) => ({
                            ...p,
                            extraRotation: ((p.extraRotation || 0) + 90) % 360,
                          }))
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#FAFAFA] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#09090B] border border-[#E4E4E7] dark:border-[#3F3F46] text-[#18181B] dark:text-[#FAFAFA] rounded-lg"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      Rotate All +90°
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPageInstructions((prev) => [
                          ...prev,
                          {
                            type: 'blank',
                            widthPt: 612,
                            heightPt: 792,
                            label: 'Blank Page',
                          },
                        ])
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#FAFAFA] dark:bg-[#27272A] hover:bg-[#E4E4E7] dark:hover:bg-[#09090B] border border-[#E4E4E7] dark:border-[#3F3F46] text-[#18181B] dark:text-[#FAFAFA] rounded-lg"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Append Blank Page
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {pageInstructions.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg flex flex-col justify-between space-y-2"
                    >
                      <div className="aspect-[1/1.28] bg-white border border-[#E4E4E7] dark:border-[#3F3F46] rounded flex items-center justify-center overflow-hidden">
                        {item.thumbUrl ? (
                          <img
                            src={item.thumbUrl}
                            alt={item.label}
                            referrerPolicy="no-referrer"
                            style={{
                              transform: `rotate(${item.extraRotation || 0}deg)`,
                            }}
                            className="w-full h-full object-contain transition-transform"
                          />
                        ) : (
                          <span className="text-xs text-[#52525B] font-medium">
                            Blank Sheet
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                        <span>
                          #{idx + 1} ({item.label})
                        </span>
                        {item.extraRotation ? (
                          <span className="text-[#B91C1C] dark:text-[#EF4444] font-mono">
                            +{item.extraRotation}°
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-[#E4E4E7] dark:border-[#3F3F46]">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => {
                            const copy = [...pageInstructions];
                            const tmp = copy[idx - 1];
                            copy[idx - 1] = copy[idx];
                            copy[idx] = tmp;
                            setPageInstructions(copy);
                          }}
                          title="Move Left"
                          aria-label={`Move page ${idx + 1} left`}
                          className="p-1 bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded hover:bg-[#FAFAFA] dark:hover:bg-[#09090B] disabled:opacity-40"
                        >
                          <ArrowLeft className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const copy = [...pageInstructions];
                            copy[idx] = {
                              ...copy[idx],
                              extraRotation:
                                ((copy[idx].extraRotation || 0) + 90) % 360,
                            };
                            setPageInstructions(copy);
                          }}
                          title="Rotate +90°"
                          aria-label={`Rotate page ${idx + 1}`}
                          className="p-1 bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded hover:bg-[#FAFAFA] dark:hover:bg-[#09090B]"
                        >
                          <RotateCw className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const copy = [...pageInstructions];
                            copy.splice(idx + 1, 0, { ...item });
                            setPageInstructions(copy);
                          }}
                          title="Duplicate Page"
                          aria-label={`Duplicate page ${idx + 1}`}
                          className="p-1 bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded hover:bg-[#FAFAFA] dark:hover:bg-[#09090B]"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={pageInstructions.length <= 1}
                          onClick={() => {
                            setPageInstructions(
                              pageInstructions.filter((_, i) => i !== idx)
                            );
                          }}
                          title="Delete Page"
                          aria-label={`Delete page ${idx + 1}`}
                          className="p-1 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] text-[#D64545] rounded hover:bg-[#D64545]/10 disabled:opacity-40"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === pageInstructions.length - 1}
                          onClick={() => {
                            const copy = [...pageInstructions];
                            const tmp = copy[idx + 1];
                            copy[idx + 1] = copy[idx];
                            copy[idx] = tmp;
                            setPageInstructions(copy);
                          }}
                          title="Move Right"
                          aria-label={`Move page ${idx + 1} right`}
                          className="p-1 bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded hover:bg-[#FAFAFA] dark:hover:bg-[#09090B] disabled:opacity-40"
                        >
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Crop PDF Controls */}
            {tool.slug === 'crop-pdf' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg">
                {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                  <div key={side}>
                    <label
                      htmlFor={`crop-${side}`}
                      className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] capitalize mb-1"
                    >
                      {side} Margin (pt)
                    </label>
                    <input
                      id={`crop-${side}`}
                      type="number"
                      min={0}
                      max={200}
                      value={cropMargins[side]}
                      onChange={(e) =>
                        setCropMargins((prev) => ({
                          ...prev,
                          [side]: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg tabular-nums"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Page Numbers, Headers & Footers Controls */}
            {tool.slug === 'page-numbers-pdf' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg">
                <div>
                  <label
                    htmlFor="pn-format"
                    className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                  >
                    Numbering Format
                  </label>
                  <select
                    id="pn-format"
                    value={pageNumberOptions.format}
                    onChange={(e) =>
                      setPageNumberOptions((p) => ({
                        ...p,
                        format: e.target.value as typeof p.format,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                  >
                    <option value="page-x-of-y">Page 1 of N</option>
                    <option value="page-x">Page 1</option>
                    <option value="dash-numeric">- 1 -</option>
                    <option value="numeric">1</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="pn-pos"
                    className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                  >
                    Position
                  </label>
                  <select
                    id="pn-pos"
                    value={pageNumberOptions.position}
                    onChange={(e) =>
                      setPageNumberOptions((p) => ({
                        ...p,
                        position: e.target.value as typeof p.position,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                  >
                    <option value="bottom-center">Bottom Center</option>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="top-right">Top Right</option>
                    <option value="top-center">Top Center</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="pn-header"
                    className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                  >
                    Optional Running Header Text
                  </label>
                  <input
                    id="pn-header"
                    type="text"
                    value={pageNumberOptions.headerText}
                    onChange={(e) =>
                      setPageNumberOptions((p) => ({
                        ...p,
                        headerText: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="pn-footer"
                    className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                  >
                    Optional Running Footer Text
                  </label>
                  <input
                    id="pn-footer"
                    type="text"
                    value={pageNumberOptions.footerText}
                    onChange={(e) =>
                      setPageNumberOptions((p) => ({
                        ...p,
                        footerText: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                  />
                </div>
              </div>
            )}

            {/* Fill Interactive PDF Forms Inspector */}
            {tool.slug === 'fill-pdf-forms' && (
              <div className="p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#18181B] dark:text-[#FAFAFA]">
                    Detected Interactive AcroForm Fields ({inspection.formFields.length})
                  </h3>
                  <label className="flex items-center gap-1.5 text-xs text-[#18181B] dark:text-[#FAFAFA] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={flattenAfterFill}
                      onChange={(e) => setFlattenAfterFill(e.target.checked)}
                      className="accent-[#B91C1C]"
                    />
                    <span>Flatten fields after saving</span>
                  </label>
                </div>
                {inspection.formFields.length === 0 ? (
                  <p className="text-xs text-[#52525B] dark:text-[#D4D4D8]">
                    This PDF does not contain interactive AcroForm fields. Click
                    &ldquo;Load Sample PDF&rdquo; above to test a PDF with 3
                    interactive form fields, or open the Interactive PDF Editor to
                    place text overlays.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {inspection.formFields.map((field) => (
                      <div
                        key={field.name}
                        className="p-3 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg space-y-1.5"
                      >
                        <label
                          htmlFor={`acro-${field.name}`}
                          className="block text-xs font-mono font-semibold text-[#18181B] dark:text-[#FAFAFA]"
                        >
                          {field.name}{' '}
                          <span className="text-[#52525B] dark:text-[#D4D4D8] font-normal">
                            ({field.type})
                          </span>
                        </label>
                        {field.type === 'checkbox' ? (
                          <input
                            id={`acro-${field.name}`}
                            type="checkbox"
                            checked={Boolean(formValues[field.name])}
                            onChange={(e) =>
                              setFormValues((prev) => ({
                                ...prev,
                                [field.name]: e.target.checked,
                              }))
                            }
                            className="w-4 h-4 accent-[#B91C1C]"
                          />
                        ) : (
                          <input
                            id={`acro-${field.name}`}
                            type="text"
                            value={String(formValues[field.name] ?? '')}
                            onChange={(e) =>
                              setFormValues((prev) => ({
                                ...prev,
                                [field.name]: e.target.value,
                              }))
                            }
                            className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* PDF to Images Options */}
            {tool.slug === 'pdf-to-jpg' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg">
                <div>
                  <label
                    htmlFor="img-format-select"
                    className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                  >
                    Output Image Format
                  </label>
                  <select
                    id="img-format-select"
                    value={imageOutputFormat}
                    onChange={(e) =>
                      setImageOutputFormat(
                        e.target.value as 'jpg' | 'png' | 'webp'
                      )
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                  >
                    <option value="png">PNG (Lossless Sharp Text)</option>
                    <option value="jpg">JPG (Compact Photo Format)</option>
                    <option value="webp">WebP (Modern High-Efficiency)</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="img-dpi-select"
                    className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                  >
                    Rendering Resolution Scale
                  </label>
                  <select
                    id="img-dpi-select"
                    value={imageScale}
                    onChange={(e) => setImageScale(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                  >
                    <option value={1.5}>Standard (150 DPI equivalent)</option>
                    <option value={2.0}>High-Definition (200 DPI equivalent)</option>
                    <option value={3.0}>Print Quality (300 DPI equivalent)</option>
                  </select>
                </div>
              </div>
            )}

            {/* PDF to Word / Excel / CSV Options */}
            {tool.slug === 'pdf-to-word' && (
              <div className="p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg space-y-2">
                <label
                  htmlFor="export-format-select"
                  className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
                >
                  Target Export Format
                </label>
                <select
                  id="export-format-select"
                  value={exportFormat}
                  onChange={(e) =>
                    setExportFormat(
                      e.target.value as 'docx' | 'xlsx' | 'csv' | 'txt' | 'html'
                    )
                  }
                  className="w-full sm:w-96 px-3 py-2 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                >
                  <option value="docx">
                    Microsoft Word Document (.docx — Paragraphs & Tables)
                  </option>
                  <option value="xlsx">
                    Microsoft Excel Workbook (.xlsx — Detected Tables & Lines)
                  </option>
                  <option value="csv">
                    Comma-Separated Values (.csv — Table Grid)
                  </option>
                  <option value="html">
                    Presentation Slide Outline (.html)
                  </option>
                  <option value="txt">Plain Text Transcript (.txt)</option>
                </select>
              </div>
            )}

            {/* OCR Options */}
            {tool.slug === 'ocr-pdf' && (
              <div className="p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg space-y-3">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <label
                      htmlFor="ocr-lang-select"
                      className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                    >
                      Recognition Language
                    </label>
                    <select
                      id="ocr-lang-select"
                      value={ocrLang}
                      onChange={(e) => setOcrLang(e.target.value)}
                      className="px-3 py-2 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                    >
                      <option value="eng">English (eng)</option>
                      <option value="spa">Spanish (spa)</option>
                      <option value="fra">French (fra)</option>
                      <option value="deu">German (deu)</option>
                    </select>
                  </div>
                  {ocrProgressText && (
                    <div className="text-xs font-mono text-[#B91C1C] dark:text-[#EF4444] pt-4">
                      {ocrProgressText}
                    </div>
                  )}
                </div>
                {ocrResultText && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                      Recognized OCR Transcript (Avg Confidence: {ocrConfidence}%):
                    </div>
                    <pre className="p-3 bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded text-xs font-mono max-h-48 overflow-auto whitespace-pre-wrap">
                      {ocrResultText}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Edit Existing PDF Text Lines Table */}
            {tool.slug === 'edit-pdf-text' && editableLines.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                  Detected Text Lines ({editableLines.length}) — Edit any line in
                  place to replace at its exact (X, Y) coordinate:
                </div>
                <div className="max-h-64 overflow-y-auto border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg divide-y divide-[#E4E4E7] dark:divide-[#3F3F46]">
                  {editableLines.slice(0, 25).map((line, idx) => (
                    <div
                      key={line.id}
                      className="p-2.5 bg-white dark:bg-[#27272A] flex items-center gap-3 text-xs"
                    >
                      <span className="font-mono text-[#52525B] dark:text-[#D4D4D8] shrink-0 w-24 tabular-nums">
                        P{line.pageNumber} ({Math.round(line.x)},{Math.round(line.y)})
                      </span>
                      <input
                        type="text"
                        aria-label={`Edit text line ${idx + 1}`}
                        value={line.text}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditableLines((prev) =>
                            prev.map((l) =>
                              l.id === line.id ? { ...l, text: val } : l
                            )
                          );
                        }}
                        className="flex-1 px-2.5 py-1 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded font-sans text-[#18181B] dark:text-[#FAFAFA]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Password Protect / Unlock Controls */}
            {tool.slug === 'protect-pdf' && (
              <div className="p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg space-y-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSecurityAction('protect')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ${
                      securityAction === 'protect'
                        ? 'bg-[#B91C1C] text-white'
                        : 'bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46]'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Encrypt PDF with Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setSecurityAction('unlock')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ${
                      securityAction === 'unlock'
                        ? 'bg-[#B91C1C] text-white'
                        : 'bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46]'
                    }`}
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Unlock / Decrypt PDF
                  </button>
                </div>

                {securityAction === 'protect' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="pdf-user-pass"
                        className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                      >
                        Document Open Password (User Password)
                      </label>
                      <input
                        id="pdf-user-pass"
                        type="password"
                        value={userPassword}
                        onChange={(e) => setUserPassword(e.target.value)}
                        placeholder="Enter password required to open PDF"
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="pdf-owner-pass"
                        className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                      >
                        Permissions Password (Owner Password)
                      </label>
                      <input
                        id="pdf-owner-pass"
                        type="password"
                        value={ownerPassword}
                        onChange={(e) => setOwnerPassword(e.target.value)}
                        placeholder="Optional owner password"
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-5 pt-1 text-xs text-[#18181B] dark:text-[#FAFAFA]">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowPrint}
                          onChange={(e) => setAllowPrint(e.target.checked)}
                          className="accent-[#B91C1C]"
                        />
                        <span>Allow Printing</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowCopy}
                          onChange={(e) => setAllowCopy(e.target.checked)}
                          className="accent-[#B91C1C]"
                        />
                        <span>Allow Text & Graphic Copying</span>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label
                      htmlFor="pdf-unlock-pass"
                      className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                    >
                      Existing PDF Password
                    </label>
                    <input
                      id="pdf-unlock-pass"
                      type="password"
                      value={userPassword}
                      onChange={(e) => setUserPassword(e.target.value)}
                      placeholder="Enter current password to remove encryption"
                      className="w-full sm:w-96 px-3 py-2 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Permanent Redaction Controls */}
            {tool.slug === 'redact-pdf' && (
              <div className="p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg space-y-3">
                <div>
                  <label
                    htmlFor="redact-terms-input"
                    className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                  >
                    Sensitive Words, Tokens, or Phrases to Permanently Redact
                    (comma-separated)
                  </label>
                  <input
                    id="redact-terms-input"
                    type="text"
                    value={redactTermsInput}
                    onChange={(e) => setRedactTermsInput(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                  />
                </div>
                {redactionReport && (
                  <div className="p-3 bg-[#16865B]/10 border border-[#16865B]/30 rounded text-xs text-[#16865B] dark:text-[#34D399]">
                    Sanitized <strong>{redactionReport.count}</strong> matching text
                    line(s). Post-redaction stream audit:{' '}
                    <strong>
                      {redactionReport.verifiedClean
                        ? '0 occurrences remaining in output PDF stream'
                        : 'Reviewed'}
                    </strong>
                    .
                  </div>
                )}
              </div>
            )}

            {/* Metadata & Bookmarks Editor Controls */}
            {tool.slug === 'pdf-metadata' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg">
                <div>
                  <label
                    htmlFor="meta-title"
                    className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                  >
                    Title
                  </label>
                  <input
                    id="meta-title"
                    type="text"
                    value={metaForm.title}
                    onChange={(e) =>
                      setMetaForm((p) => ({ ...p, title: e.target.value }))
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="meta-author"
                    className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                  >
                    Author
                  </label>
                  <input
                    id="meta-author"
                    type="text"
                    value={metaForm.author}
                    onChange={(e) =>
                      setMetaForm((p) => ({ ...p, author: e.target.value }))
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="meta-subject"
                    className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                  >
                    Subject
                  </label>
                  <input
                    id="meta-subject"
                    type="text"
                    value={metaForm.subject}
                    onChange={(e) =>
                      setMetaForm((p) => ({ ...p, subject: e.target.value }))
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="meta-keywords"
                    className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                  >
                    Keywords (comma-separated)
                  </label>
                  <input
                    id="meta-keywords"
                    type="text"
                    value={metaForm.keywords}
                    onChange={(e) =>
                      setMetaForm((p) => ({ ...p, keywords: e.target.value }))
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                  />
                </div>
              </div>
            )}

            {/* Resize Pages Controls */}
            {tool.slug === 'resize-pdf-pages' && (
              <div className="flex flex-wrap items-center gap-4 p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg">
                <div>
                  <label
                    htmlFor="resize-preset-select"
                    className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                  >
                    Target Standard Sheet Size
                  </label>
                  <select
                    id="resize-preset-select"
                    value={targetPageSize}
                    onChange={(e) => setTargetPageSize(e.target.value)}
                    className="px-3 py-2 text-xs bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                  >
                    {Object.values(PAGE_SIZE_PRESETS).map((preset) => (
                      <option key={preset.name} value={preset.name}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-[#18181B] dark:text-[#FAFAFA] pt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appendBlank}
                    onChange={(e) => setAppendBlank(e.target.checked)}
                    className="accent-[#B91C1C]"
                  />
                  <span>Also append 1 blank page at end of document</span>
                </label>
              </div>
            )}

            {/* Print-Ready Controls */}
            {tool.slug === 'print-ready-pdf' && (
              <div className="flex flex-wrap items-center gap-6 p-4 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg text-xs">
                <div>
                  <label
                    htmlFor="bleed-pt-input"
                    className="block font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
                  >
                    Bleed Margin Padding (points)
                  </label>
                  <input
                    id="bleed-pt-input"
                    type="number"
                    min={0}
                    max={54}
                    value={bleedPt}
                    onChange={(e) => setBleedPt(Number(e.target.value))}
                    className="w-28 px-3 py-1.5 bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg tabular-nums"
                  />
                </div>
                <label className="flex items-center gap-2 text-[#18181B] dark:text-[#FAFAFA] pt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addTrimMarks}
                    onChange={(e) => setAddTrimMarks(e.target.checked)}
                    className="accent-[#B91C1C]"
                  />
                  <span>Draw Printer Corner Trim Marks</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* Compare Results Diff Viewer */}
        {tool.slug === 'compare-pdf' && compareResults && (
          <div className="space-y-3 border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg p-4 bg-[#FAFAFA] dark:bg-[#27272A]">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-[#18181B] dark:text-[#FAFAFA]">
                Line-by-Line Comparison Results
              </span>
              <div className="flex items-center gap-3 font-mono tabular-nums">
                <span className="text-[#16865B] dark:text-[#34D399] font-semibold">
                  +{compareResults.addedCount} Added
                </span>
                <span className="text-[#D64545] dark:text-[#F87171] font-semibold">
                  -{compareResults.removedCount} Removed
                </span>
                <span className="text-[#52525B] dark:text-[#D4D4D8]">
                  {compareResults.unchangedCount} Unchanged
                </span>
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded divide-y divide-[#E4E4E7] dark:divide-[#3F3F46] font-mono text-xs">
              {compareResults.diffs.map((d, i) => (
                <div
                  key={i}
                  className={`px-3 py-1.5 flex items-start gap-2 ${
                    d.type === 'added'
                      ? 'bg-[#16865B]/10 text-[#16865B] dark:text-[#34D399]'
                      : d.type === 'removed'
                      ? 'bg-[#D64545]/10 text-[#D64545] dark:text-[#F87171]'
                      : 'text-[#52525B] dark:text-[#D4D4D8]'
                  }`}
                >
                  <span className="font-bold shrink-0 w-16">
                    {d.type === 'added'
                      ? '[+ ADD]'
                      : d.type === 'removed'
                      ? '[- DEL]'
                      : '[ SAME]'}
                  </span>
                  <span className="break-all">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extracted Data Viewer (Extract Text & Tables or PDF to Word Preview) */}
        {(tool.slug === 'extract-pdf-data' || exportedPreviewText) &&
          (extractedData || exportedPreviewText) && (
            <div className="space-y-2 border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg p-4 bg-[#FAFAFA] dark:bg-[#27272A]">
              <div className="text-xs font-bold text-[#18181B] dark:text-[#FAFAFA]">
                Extracted Document Structure Preview
              </div>
              <pre className="p-3 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded text-xs font-mono max-h-48 overflow-auto whitespace-pre-wrap text-[#18181B] dark:text-[#FAFAFA]">
                {exportedPreviewText || extractedData?.fullText}
              </pre>
            </div>
          )}

        {/* Rendered Images Grid Preview (PDF to JPG/PNG/WebP) */}
        {tool.slug === 'pdf-to-jpg' && renderedImagesPreview.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-[#18181B] dark:text-[#FAFAFA]">
              Rendered Page Images (Click any image to download individually):
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {renderedImagesPreview.map((img) => (
                <a
                  key={img.pageNumber}
                  href={img.dataUrl}
                  download={img.fileName}
                  className="p-2 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg hover:border-[#B91C1C] transition-colors block text-center"
                >
                  <img
                    src={img.dataUrl}
                    alt={img.fileName}
                    referrerPolicy="no-referrer"
                    className="w-full h-36 object-contain mb-1.5 bg-white border border-[#E4E4E7] dark:border-[#3F3F46] rounded"
                  />
                  <span className="text-[11px] font-medium text-[#B91C1C] dark:text-[#EF4444] underline">
                    {img.fileName}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Individual Split PDF Files Download List */}
        {tool.slug === 'split-pdf' && splitPartsDownloads.length > 0 && (
          <div className="space-y-2 border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg p-4 bg-[#FAFAFA] dark:bg-[#27272A]">
            <h4 className="text-xs font-bold text-[#18181B] dark:text-[#FAFAFA]">
              Generated Split PDF Files ({splitPartsDownloads.length}):
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {splitPartsDownloads.map((part) => (
                <a
                  key={part.fileName}
                  href={part.url}
                  download={part.fileName}
                  className="px-3 py-2 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] hover:border-[#B91C1C] rounded-lg flex items-center justify-between text-xs transition-colors"
                >
                  <span className="font-medium text-[#18181B] dark:text-[#FAFAFA] truncate">
                    {part.fileName} ({part.pageCount} pg ·{' '}
                    {formatFileSize(part.byteLength)})
                  </span>
                  <span className="text-[#B91C1C] dark:text-[#EF4444] font-semibold shrink-0 ml-2 underline">
                    Download PDF
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="p-4 bg-[#D64545]/10 border border-[#D64545]/30 rounded-lg flex items-start gap-2.5 text-xs text-[#D64545] dark:text-[#F87171]"
          >
            <AlertCircle className="w-4 h-4 text-[#D64545] dark:text-[#F87171] shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Processing Error: </strong>
              {errorMessage}
            </div>
          </div>
        )}

        {/* Execute Action & Result Download Bar */}
        <div className="pt-4 border-t border-[#E4E4E7] dark:border-[#3F3F46] flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleExecuteTool}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] disabled:opacity-50 rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Processing Document...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Run {tool.shortTitle} Now
              </>
            )}
          </button>

          {resultDownload && (
            <div className="flex-1 p-4 bg-[#16865B]/10 dark:bg-[#16865B]/15 border border-[#16865B]/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-[#18181B] dark:text-[#FAFAFA]">
                  <CheckCircle2 className="w-4 h-4 text-[#16865B] dark:text-[#34D399] shrink-0" />
                  <span>{resultDownload.summaryMessage}</span>
                </div>
                <div className="text-[#52525B] dark:text-[#D4D4D8] font-mono tabular-nums">
                  {resultDownload.originalBytes
                    ? `Input: ${formatFileSize(resultDownload.originalBytes)} → `
                    : ''}
                  Output: <strong className="text-[#18181B] dark:text-[#FAFAFA]">{formatFileSize(resultDownload.outputBytes)}</strong>{' '}
                  · Engine: {resultDownload.engineUsed}
                </div>
              </div>
              <a
                href={resultDownload.url}
                download={resultDownload.fileName}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#16865B] hover:bg-[#126E4A] rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                Download {resultDownload.fileName}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
