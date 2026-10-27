'use client';

import {
  PDFDocument,
  PDFPage,
  PDFDict,
  PDFHexString,
  PDFString,
  StandardFonts,
  rgb,
  degrees,
  PDFName,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
} from 'pdf-lib';
import JSZip from 'jszip';
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  WidthType,
} from 'docx';
import * as XLSX from 'xlsx';
import {
  PAGE_SIZE_PRESETS,
  parsePageRanges,
  parseSeparateRangeGroups,
  computeTextDiff,
  DiffEntry,
  toPdfBlob,
} from './pdf-utils';

// Lazy-load pdfjs-dist in browser only
let pdfjsLibPromise: Promise<typeof import('pdfjs-dist')> | null = null;

export async function getPdfJs() {
  if (typeof window === 'undefined') {
    const nodeMod = await import('pdfjs-dist/legacy/build/pdf.mjs');
    return nodeMod as unknown as typeof import('pdfjs-dist');
  }
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return mod;
    });
  }
  return pdfjsLibPromise;
}

export interface PageThumbnailInfo {
  pageNumber: number; // 1-based
  widthPt: number;
  heightPt: number;
  rotation: number;
  dataUrl: string;
}

export interface ExtractedTextLine {
  id: string;
  pageNumber: number; // 1-based
  text: string;
  originalText: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

export interface DetectedFormField {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'optionlist' | 'radio' | 'unknown';
  value: string | boolean;
  options?: string[];
}

export interface PdfInspectionReport {
  pageCount: number;
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: string;
  modificationDate: string;
  pages: Array<{
    pageNumber: number;
    widthPt: number;
    heightPt: number;
    widthMm: number;
    heightMm: number;
    rotation: number;
  }>;
  formFields: DetectedFormField[];
}

export interface EditorAnnotationItem {
  id: string;
  pageNumber: number; // 1-based
  type:
    | 'text'
    | 'highlight'
    | 'rectangle'
    | 'redact'
    | 'stamp'
    | 'watermark'
    | 'signature'
    | 'comment'
    | 'image';
  xPercent: number; // 0 to 100 from left
  yPercent: number; // 0 to 100 from top
  widthPercent: number;
  heightPercent: number;
  text?: string;
  colorHex?: string;
  fontSize?: number;
  opacity?: number;
  imageDataUrl?: string;
}

/**
 * Inspects a PDF buffer for metadata, page dimensions, and interactive AcroForm fields.
 */
export async function inspectPdfBytes(bytes: Uint8Array): Promise<PdfInspectionReport> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  const pageDetails = pages.map((p, idx) => {
    const { width, height } = p.getSize();
    return {
      pageNumber: idx + 1,
      widthPt: Math.round(width * 100) / 100,
      heightPt: Math.round(height * 100) / 100,
      widthMm: Math.round(width * 0.352778),
      heightMm: Math.round(height * 0.352778),
      rotation: p.getRotation().angle,
    };
  });

  const formFields: DetectedFormField[] = [];
  try {
    const form = pdfDoc.getForm();
    const rawFields = form.getFields();
    for (const f of rawFields) {
      const name = f.getName();
      if (f instanceof PDFTextField) {
        formFields.push({ name, type: 'text', value: f.getText() || '' });
      } else if (f instanceof PDFCheckBox) {
        formFields.push({ name, type: 'checkbox', value: f.isChecked() });
      } else if (f instanceof PDFDropdown) {
        const selected = f.getSelected();
        formFields.push({
          name,
          type: 'dropdown',
          value: selected[0] || '',
          options: f.getOptions(),
        });
      } else if (f instanceof PDFOptionList) {
        const selected = f.getSelected();
        formFields.push({
          name,
          type: 'optionlist',
          value: selected[0] || '',
          options: f.getOptions(),
        });
      } else if (f instanceof PDFRadioGroup) {
        formFields.push({
          name,
          type: 'radio',
          value: f.getSelected() || '',
          options: f.getOptions(),
        });
      }
    }
  } catch {
    // Document has no AcroForm or non-standard form dictionary
  }

  return {
    pageCount: pages.length,
    title: pdfDoc.getTitle() || '',
    author: pdfDoc.getAuthor() || '',
    subject: pdfDoc.getSubject() || '',
    keywords: pdfDoc.getKeywords() || '',
    creator: pdfDoc.getCreator() || '',
    producer: pdfDoc.getProducer() || '',
    creationDate: pdfDoc.getCreationDate()?.toISOString() || '',
    modificationDate: pdfDoc.getModificationDate()?.toISOString() || '',
    pages: pageDetails,
    formFields,
  };
}

/**
 * Renders thumbnails for a PDF using PDF.js.
 */
export async function renderPdfThumbnails(
  bytes: Uint8Array,
  scale = 0.45,
  maxPagesToRender = 50
): Promise<PageThumbnailInfo[]> {
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({ data: bytes.slice(0) });
  const pdf = await loadingTask.promise;
  const total = Math.min(pdf.numPages, maxPagesToRender);
  const results: PageThumbnailInfo[] = [];

  for (let pageNum = 1; pageNum <= total; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const unscaled = page.getViewport({ scale: 1.0 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    }

    results.push({
      pageNumber: pageNum,
      widthPt: Math.round(unscaled.width),
      heightPt: Math.round(unscaled.height),
      rotation: page.rotate,
      dataUrl: canvas.toDataURL('image/jpeg', 0.85),
    });
  }

  return results;
}

/**
 * Renders a single PDF page at high resolution to a data URL.
 */
export async function renderSinglePageDataUrl(
  bytes: Uint8Array,
  pageNumber: number,
  scale = 1.5,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/png',
  quality = 0.92
): Promise<{ dataUrl: string; widthPx: number; heightPx: number }> {
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({ data: bytes.slice(0) });
  const pdf = await loadingTask.promise;
  const clampedPage = Math.max(1, Math.min(pdf.numPages, pageNumber));
  const page = await pdf.getPage(clampedPage);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  }

  return {
    dataUrl: canvas.toDataURL(mimeType, quality),
    widthPx: canvas.width,
    heightPx: canvas.height,
  };
}

/**
 * Extracts structured text lines and coordinates from all pages of a PDF using PDF.js.
 */
export async function extractPdfTextAndLines(bytes: Uint8Array): Promise<{
  fullText: string;
  pageTexts: string[];
  lines: ExtractedTextLine[];
  tables: string[][][]; // per-page 2D table rows
}> {
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({ data: bytes.slice(0) });
  const pdf = await loadingTask.promise;

  const pageTexts: string[] = [];
  const allLines: ExtractedTextLine[] = [];
  const tables: string[][][] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const textContent = await page.getTextContent();

    interface RawGlyphRun {
      str: string;
      x: number;
      y: number;
      width: number;
      height: number;
      fontSize: number;
    }

    const runs: RawGlyphRun[] = [];
    for (const item of textContent.items) {
      if ('str' in item && item.str.trim().length > 0) {
        const tx = item.transform;
        const fontSize = Math.max(6, Math.round(Math.hypot(tx[0], tx[1]) * 10) / 10);
        runs.push({
          str: item.str,
          x: Math.round(tx[4] * 10) / 10,
          y: Math.round(tx[5] * 10) / 10,
          width: Math.max(10, Math.round((item.width || item.str.length * fontSize * 0.5) * 10) / 10),
          height: Math.max(fontSize, Math.round((item.height || fontSize) * 10) / 10),
          fontSize,
        });
      }
    }

    // Group runs into horizontal lines by Y-coordinate tolerance (within 4 points)
    runs.sort((a, b) => b.y - a.y || a.x - b.x);
    const groupedRows: RawGlyphRun[][] = [];

    for (const run of runs) {
      const existingRow = groupedRows.find((row) => Math.abs(row[0].y - run.y) <= 4);
      if (existingRow) {
        existingRow.push(run);
      } else {
        groupedRows.push([run]);
      }
    }

    const pageLineStrings: string[] = [];
    const pageTableRows: string[][] = [];

    groupedRows.forEach((rowRuns, rIdx) => {
      rowRuns.sort((a, b) => a.x - b.x);
      const combinedText = rowRuns.map((r) => r.str).join(' ');
      pageLineStrings.push(combinedText);

      // If row has multiple distinct X-separated columns, also record as table row candidate
      if (rowRuns.length >= 2) {
        pageTableRows.push(rowRuns.map((r) => r.str.trim()));
      } else {
        // Also split by pipe or multiple spaces if present
        const splitCells = combinedText
          .split(/\s{2,}|\|/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (splitCells.length >= 2) {
          pageTableRows.push(splitCells);
        }
      }

      const first = rowRuns[0];
      const last = rowRuns[rowRuns.length - 1];
      const totalWidth = Math.max(first.width, last.x + last.width - first.x);

      allLines.push({
        id: `p${p}-l${rIdx}`,
        pageNumber: p,
        text: combinedText,
        originalText: combinedText,
        x: first.x,
        y: first.y,
        width: totalWidth,
        height: first.height,
        fontSize: first.fontSize,
      });
    });

    pageTexts.push(pageLineStrings.join('\n'));
    if (pageTableRows.length > 0) {
      tables.push(pageTableRows);
    }
  }

  return {
    fullText: pageTexts.join('\n\n--- Page Break ---\n\n'),
    pageTexts,
    lines: allLines,
    tables,
  };
}

/**
 * Helper: Copy document metadata from a source PDFDocument to a target PDFDocument.
 */
function copyDocMetadata(srcDoc: PDFDocument, targetDoc: PDFDocument) {
  const title = srcDoc.getTitle();
  const author = srcDoc.getAuthor();
  const subject = srcDoc.getSubject();
  const keywords = srcDoc.getKeywords();
  const creator = srcDoc.getCreator();

  if (title) targetDoc.setTitle(title);
  if (author) targetDoc.setAuthor(author);
  if (subject) targetDoc.setSubject(subject);
  if (keywords) {
    targetDoc.setKeywords(
      keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    );
  }
  if (creator) targetDoc.setCreator(creator);
}

/**
 * Helper: Register copied page Widget annotations into the target document's Catalog /AcroForm
 * so interactive form fields are not orphaned when copying pages via pdf-lib.
 */
function registerCopiedPagesWidgets(
  targetDoc: PDFDocument,
  copiedPages: PDFPage[],
  seenFieldNames: Set<string>,
  addedFieldRefs: Set<string>,
  docSuffix?: string
) {
  for (const page of copiedPages) {
    const annots = page.node.Annots();
    if (!annots) continue;

    for (let i = 0; i < annots.size(); i++) {
      const annotRef = annots.get(i);
      const annotDict = targetDoc.context.lookupMaybe(annotRef, PDFDict);
      if (!annotDict) continue;

      if (annotDict.get(PDFName.of('Subtype')) === PDFName.of('Widget')) {
        annotDict.set(PDFName.of('P'), page.ref);

        const parentRef = annotDict.get(PDFName.of('Parent'));
        const fieldRef = parentRef || annotRef;
        const fieldKey = fieldRef.toString();

        const fieldDict = targetDoc.context.lookupMaybe(fieldRef, PDFDict);
        if (fieldDict && !addedFieldRefs.has(fieldKey)) {
          addedFieldRefs.add(fieldKey);

          const tObj = fieldDict.get(PDFName.of('T'));
          if (tObj instanceof PDFHexString || tObj instanceof PDFString) {
            const rawName = tObj.decodeText();
            const finalName =
              seenFieldNames.has(rawName) && docSuffix
                ? `${rawName}_${docSuffix}`
                : rawName;
            seenFieldNames.add(finalName);
            if (finalName !== rawName) {
              fieldDict.set(PDFName.of('T'), PDFHexString.fromText(finalName));
            }
          }

          try {
            const form = targetDoc.getForm();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            form.acroForm.addField(fieldRef as any);
          } catch {
            // Skip malformed widget ref
          }
        }
      }
    }
  }
}

/**
 * 1. Merge multiple PDF files in order while preserving interactive AcroForm fields and metadata.
 */
export async function mergePdfFiles(
  filesBytes: Uint8Array[],
  options?: { flattenForms?: boolean }
): Promise<Uint8Array> {
  if (filesBytes.length === 0) {
    throw new Error('Please provide at least one PDF file to merge.');
  }
  const mergedPdf = await PDFDocument.create();
  const seenFieldNames = new Set<string>();
  const addedFieldRefs = new Set<string>();

  for (let dIdx = 0; dIdx < filesBytes.length; dIdx++) {
    const buf = filesBytes[dIdx];
    const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });

    if (dIdx === 0) {
      copyDocMetadata(srcDoc, mergedPdf);
    }

    if (options?.flattenForms) {
      try {
        srcDoc.getForm().flatten();
      } catch {
        // No form to flatten
      }
    }

    const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
    copiedPages.forEach((p) => mergedPdf.addPage(p));

    if (!options?.flattenForms) {
      registerCopiedPagesWidgets(
        mergedPdf,
        copiedPages,
        seenFieldNames,
        addedFieldRefs,
        `doc${dIdx + 1}`
      );
    }
  }
  return await mergedPdf.save();
}

export interface SplitPdfPart {
  fileName: string;
  bytes: Uint8Array;
  pageCount: number;
}

/**
 * 2. Split PDF: extract selected pages into 1 PDF, split by ranges into ZIP, or burst every page into ZIP.
 * Preserves document metadata and interactive AcroForm fields on extracted pages, and returns individual splitParts.
 */
export async function splitPdfFile(
  bytes: Uint8Array,
  mode: 'extract-single' | 'ranges-zip' | 'burst-all-zip',
  rangeInput: string,
  baseName = 'document'
): Promise<{
  blob: Blob;
  fileName: string;
  isZip: boolean;
  count: number;
  splitParts: SplitPdfPart[];
}> {
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();

  if (mode === 'extract-single') {
    const indices = parsePageRanges(rangeInput, totalPages);
    const outDoc = await PDFDocument.create();
    copyDocMetadata(srcDoc, outDoc);
    const copied = await outDoc.copyPages(srcDoc, indices);
    copied.forEach((p) => outDoc.addPage(p));
    registerCopiedPagesWidgets(outDoc, copied, new Set(), new Set());
    const outBytes = await outDoc.save();
    const outFileName = `${baseName}-extracted-pages.pdf`;
    return {
      blob: toPdfBlob(outBytes),
      fileName: outFileName,
      isZip: false,
      count: indices.length,
      splitParts: [
        {
          fileName: outFileName,
          bytes: outBytes,
          pageCount: indices.length,
        },
      ],
    };
  }

  const zip = new JSZip();
  const splitParts: SplitPdfPart[] = [];

  if (mode === 'burst-all-zip') {
    for (let i = 0; i < totalPages; i++) {
      const singleDoc = await PDFDocument.create();
      copyDocMetadata(srcDoc, singleDoc);
      const [copied] = await singleDoc.copyPages(srcDoc, [i]);
      singleDoc.addPage(copied);
      registerCopiedPagesWidgets(singleDoc, [copied], new Set(), new Set());
      const singleBytes = await singleDoc.save();
      const partName = `${baseName}-page-${String(i + 1).padStart(3, '0')}.pdf`;
      zip.file(partName, singleBytes);
      splitParts.push({
        fileName: partName,
        bytes: singleBytes,
        pageCount: 1,
      });
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return {
      blob: zipBlob,
      fileName: `${baseName}-all-${totalPages}-pages.zip`,
      isZip: true,
      count: totalPages,
      splitParts,
    };
  }

  // ranges-zip
  const groups = parseSeparateRangeGroups(rangeInput, totalPages);
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g];
    const partDoc = await PDFDocument.create();
    copyDocMetadata(srcDoc, partDoc);
    const copied = await partDoc.copyPages(srcDoc, grp.indices);
    copied.forEach((p) => partDoc.addPage(p));
    registerCopiedPagesWidgets(partDoc, copied, new Set(), new Set());
    const partBytes = await partDoc.save();
    const partName = `${baseName}-pages-${grp.label}.pdf`;
    zip.file(partName, partBytes);
    splitParts.push({
      fileName: partName,
      bytes: partBytes,
      pageCount: grp.indices.length,
    });
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return {
    blob: zipBlob,
    fileName: `${baseName}-split-ranges.zip`,
    isZip: true,
    count: groups.length,
    splitParts,
  };
}

/**
 * 4, 5, 6, 7. Organize, Rotate, Delete, Reorder, Duplicate, and Insert Blank Pages.
 */
export interface PageOrganizerInstruction {
  type: 'existing' | 'blank';
  originalPageIndex?: number; // 0-based
  extraRotation?: number; // 0, 90, 180, 270
  widthPt?: number;
  heightPt?: number;
}

export async function buildOrganizedPdf(
  bytes: Uint8Array,
  instructions: PageOrganizerInstruction[]
): Promise<Uint8Array> {
  if (instructions.length === 0) {
    throw new Error('Output PDF must contain at least one page.');
  }
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const outDoc = await PDFDocument.create();
  copyDocMetadata(srcDoc, outDoc);
  const seenFieldNames = new Set<string>();
  const addedFieldRefs = new Set<string>();

  for (let idx = 0; idx < instructions.length; idx++) {
    const item = instructions[idx];
    if (item.type === 'blank') {
      outDoc.addPage([item.widthPt || 612, item.heightPt || 792]);
    } else if (typeof item.originalPageIndex === 'number') {
      const [copied] = await outDoc.copyPages(srcDoc, [item.originalPageIndex]);
      const currentAngle = copied.getRotation().angle;
      const newAngle = (currentAngle + (item.extraRotation || 0)) % 360;
      copied.setRotation(degrees(newAngle));
      outDoc.addPage(copied);
      registerCopiedPagesWidgets(
        outDoc,
        [copied],
        seenFieldNames,
        addedFieldRefs,
        `p${idx + 1}`
      );
    }
  }

  return await outDoc.save();
}

/**
 * 8. Crop PDF Pages by margin offsets in points.
 */
export async function cropPdfPages(
  bytes: Uint8Array,
  marginsPt: { top: number; right: number; bottom: number; left: number },
  pageRangeStr?: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = pdfDoc.getPageCount();
  const targetIndices = pageRangeStr?.trim()
    ? parsePageRanges(pageRangeStr, total)
    : Array.from({ length: total }, (_, i) => i);

  for (const idx of targetIndices) {
    const page = pdfDoc.getPage(idx);
    const box = page.getCropBox();
    const newX = box.x + Math.max(0, marginsPt.left);
    const newY = box.y + Math.max(0, marginsPt.bottom);
    const newW = Math.max(36, box.width - marginsPt.left - marginsPt.right);
    const newH = Math.max(36, box.height - marginsPt.top - marginsPt.bottom);
    page.setCropBox(newX, newY, newW, newH);
    page.setMediaBox(newX, newY, newW, newH);
  }

  return await pdfDoc.save();
}

/**
 * 9. Add Page Numbers, Headers & Footers.
 */
export async function addPageNumbersAndHeaders(
  bytes: Uint8Array,
  options: {
    format: 'page-x-of-y' | 'page-x' | 'numeric' | 'dash-numeric';
    position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-center';
    startFromPage: number; // 1-based
    fontSize: number;
    headerText?: string;
    footerText?: string;
  }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const total = pages.length;

  pages.forEach((page, idx) => {
    const pageNum = idx + 1;
    if (pageNum < options.startFromPage) return;

    const box = page.getCropBox();
    const { x: originX, y: originY, width, height } = box;
    let label = `${pageNum}`;
    if (options.format === 'page-x-of-y') label = `Page ${pageNum} of ${total}`;
    else if (options.format === 'page-x') label = `Page ${pageNum}`;
    else if (options.format === 'dash-numeric') label = `- ${pageNum} -`;

    const textWidth = font.widthOfTextAtSize(label, options.fontSize);
    let x = originX + (width - textWidth) / 2;
    let y = originY + 24;

    if (options.position.includes('right')) x = originX + width - textWidth - 36;
    if (options.position.includes('left')) x = originX + 36;
    if (options.position.includes('top')) y = originY + height - 30;

    page.drawText(label, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(0.15, 0.2, 0.28),
    });

    if (options.headerText?.trim()) {
      page.drawText(options.headerText.trim(), {
        x: originX + 36,
        y: originY + height - 30,
        size: Math.max(8, options.fontSize - 1),
        font,
        color: rgb(0.35, 0.4, 0.48),
      });
    }

    if (options.footerText?.trim()) {
      page.drawText(options.footerText.trim(), {
        x: originX + 36,
        y: originY + 24,
        size: Math.max(8, options.fontSize - 1),
        font,
        color: rgb(0.35, 0.4, 0.48),
      });
    }
  });

  return await pdfDoc.save();
}

/**
 * Helper to parse hex color into 0-1 RGB tuple.
 */
function hexToRgbTuple(hex = '#1d4ed8'): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [0.1, 0.3, 0.8];
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [
    Number.isFinite(r) ? r : 0.1,
    Number.isFinite(g) ? g : 0.3,
    Number.isFinite(b) ? b : 0.8,
  ];
}

/**
 * 10 & 11. Apply Editor Annotations, Text Overlays, Watermarks, Stamps, Highlights, Shapes, Signatures,
 * Blackout Redactions (destroying underlying content stream on redacted pages), and Page Rotations/Deletions.
 */
export async function applyEditorAnnotationsToPdf(
  bytes: Uint8Array,
  annotations: EditorAnnotationItem[],
  pageEdits?: {
    extraRotations?: Record<number, number>; // 1-based pageNumber -> degrees
    deletedPages?: number[]; // 1-based pageNumbers to delete
  }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  // First handle any pages that contain 'redact' blackout annotations by replacing the page with a sanitized stream
  const redactedPageNumbers = Array.from(
    new Set(annotations.filter((a) => a.type === 'redact').map((a) => a.pageNumber))
  );

  for (const pageNum of redactedPageNumbers) {
    const pageIdx = pageNum - 1;
    if (pageIdx < 0 || pageIdx >= pages.length) continue;
    const oldPage = pages[pageIdx];
    const { width, height } = oldPage.getSize();
    const oldRotation = oldPage.getRotation().angle;
    const pageRedactions = annotations.filter(
      (a) => a.pageNumber === pageNum && a.type === 'redact'
    );

    // Replace the PDFPage instance in pdfDoc so pdf-lib's cached contentStreamRef from the original page is discarded
    pdfDoc.removePage(pageIdx);
    const cleanPage = pdfDoc.insertPage(pageIdx, [width, height]);
    if (oldRotation) {
      cleanPage.setRotation(degrees(oldRotation));
    }
    pages[pageIdx] = cleanPage;

    if (typeof document !== 'undefined') {
      // Browser environment: rasterize page via PDF.js at 2.0x, burn black boxes onto bitmap, and draw onto cleanPage
      const pdfjs = await getPdfJs();
      const loadingTask = pdfjs.getDocument({ data: bytes.slice(0) });
      const pdf = await loadingTask.promise;
      const pdfjsPage = await pdf.getPage(pageNum);
      const renderScale = 2.0;
      const viewport = pdfjsPage.getViewport({ scale: renderScale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await pdfjsPage.render({ canvasContext: ctx, viewport, canvas }).promise;

        // Burn blackout redaction boxes directly onto the rendered bitmap
        for (const rItem of pageRedactions) {
          const rx = (rItem.xPercent / 100) * canvas.width;
          const ry = (rItem.yPercent / 100) * canvas.height;
          const rw = (rItem.widthPercent / 100) * canvas.width;
          const rh = (rItem.heightPercent / 100) * canvas.height;
          ctx.fillStyle = '#000000';
          ctx.fillRect(rx, ry, rw, rh);
        }
      }

      const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const b64 = jpgDataUrl.split(',')[1];
      const jpgBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const embeddedJpg = await pdfDoc.embedJpg(jpgBytes);

      cleanPage.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width,
        height,
      });
    } else {
      // Headless Node environment (without DOM canvas): extract text lines on this page,
      // omit any line overlapping a redaction box, and redraw only safe lines + blackout rectangles onto cleanPage
      const { lines } = await extractPdfTextAndLines(bytes);
      const pageLines = lines.filter((l) => l.pageNumber === pageNum);

      for (const line of pageLines) {
        const lineBottom = line.y;
        const lineTop = line.y + line.height;
        const lineLeft = line.x;
        const lineRight = line.x + line.width;

        const isRedacted = pageRedactions.some((rItem) => {
          const boxW = (rItem.widthPercent / 100) * width;
          const boxH = (rItem.heightPercent / 100) * height;
          const boxLeft = (rItem.xPercent / 100) * width;
          const boxRight = boxLeft + boxW;
          const boxBottom = height - (rItem.yPercent / 100) * height - boxH;
          const boxTop = boxBottom + boxH;

          return (
            lineRight >= boxLeft - 4 &&
            lineLeft <= boxRight + 4 &&
            lineTop >= boxBottom - 4 &&
            lineBottom <= boxTop + 4
          );
        });

        if (!isRedacted) {
          const safeStr = line.text.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
          if (safeStr.trim()) {
            cleanPage.drawText(safeStr, {
              x: line.x,
              y: line.y,
              size: line.fontSize,
              font: fontRegular,
              color: rgb(0.1, 0.12, 0.16),
            });
          }
        }
      }

      for (const rItem of pageRedactions) {
        const boxW = (rItem.widthPercent / 100) * width;
        const boxH = (rItem.heightPercent / 100) * height;
        const pdfX = (rItem.xPercent / 100) * width;
        const pdfY = height - (rItem.yPercent / 100) * height - boxH;
        cleanPage.drawRectangle({
          x: pdfX,
          y: pdfY,
          width: boxW,
          height: boxH,
          color: rgb(0, 0, 0),
          opacity: 1,
        });
      }
    }
  }

  for (const item of annotations) {
    // Redact items were already burned and sanitized above
    if (item.type === 'redact') continue;

    const pageIdx = item.pageNumber - 1;
    if (pageIdx < 0 || pageIdx >= pages.length) continue;
    const page = pages[pageIdx];
    const mediaBox = page.getMediaBox();
    const { width, height } = page.getSize();

    const boxW = (item.widthPercent / 100) * width;
    const boxH = (item.heightPercent / 100) * height;
    const pdfX = mediaBox.x + (item.xPercent / 100) * width;
    const pdfY = mediaBox.y + height - (item.yPercent / 100) * height - boxH;

    const [r, g, b] = hexToRgbTuple(item.colorHex || '#1e40af');
    const opacity = typeof item.opacity === 'number' ? item.opacity : 1;

    if (item.type === 'text' || item.type === 'comment') {
      const fSize = item.fontSize || 12;
      if (item.type === 'comment') {
        page.drawRectangle({
          x: pdfX - 4,
          y: pdfY - 4,
          width: Math.max(120, boxW),
          height: Math.max(28, boxH),
          color: rgb(1, 0.97, 0.82),
          borderColor: rgb(0.9, 0.75, 0.2),
          borderWidth: 1,
          opacity: 0.95,
        });
      }
      const safeText = (item.text || 'Text Note').replace(
        /[^\x20-\x7E\xA0-\xFF]/g,
        ' '
      );
      page.drawText(safeText, {
        x: pdfX,
        y: pdfY + Math.max(0, boxH - fSize),
        size: fSize,
        font: fontRegular,
        color: rgb(r, g, b),
        opacity,
      });
    } else if (item.type === 'highlight') {
      page.drawRectangle({
        x: pdfX,
        y: pdfY,
        width: boxW,
        height: boxH,
        color: rgb(r, g, b),
        opacity: 0.35,
      });
    } else if (item.type === 'rectangle') {
      page.drawRectangle({
        x: pdfX,
        y: pdfY,
        width: boxW,
        height: boxH,
        borderColor: rgb(r, g, b),
        borderWidth: 2,
        opacity,
      });
    } else if (item.type === 'stamp') {
      const stampText = (item.text || 'APPROVED')
        .toUpperCase()
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
      page.drawRectangle({
        x: pdfX,
        y: pdfY,
        width: Math.max(110, boxW),
        height: Math.max(32, boxH),
        borderColor: rgb(r, g, b),
        borderWidth: 2,
        opacity: 0.85,
      });
      page.drawText(stampText, {
        x: pdfX + 10,
        y: pdfY + 9,
        size: 13,
        font: fontBold,
        color: rgb(r, g, b),
        opacity: 0.9,
      });
    } else if (item.type === 'watermark') {
      const wmText = (item.text || 'CONFIDENTIAL').replace(
        /[^\x20-\x7E\xA0-\xFF]/g,
        ' '
      );
      page.drawText(wmText, {
        x: pdfX,
        y: pdfY + boxH * 0.25,
        size: item.fontSize || 42,
        font: fontBold,
        color: rgb(r, g, b),
        opacity: item.opacity ?? 0.22,
        rotate: degrees(25),
      });
    } else if (
      (item.type === 'signature' || item.type === 'image') &&
      item.imageDataUrl
    ) {
      const base64Data = item.imageDataUrl.split(',')[1];
      if (base64Data) {
        const imgBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        const embeddedImg = item.imageDataUrl.includes('image/png')
          ? await pdfDoc.embedPng(imgBytes)
          : await pdfDoc.embedJpg(imgBytes);
        page.drawImage(embeddedImg, {
          x: pdfX,
          y: pdfY,
          width: boxW,
          height: boxH,
          opacity,
        });
      }
    }
  }

  // Apply per-page extra rotations if requested from the Editor Workspace
  if (pageEdits?.extraRotations) {
    for (const [pageNumStr, extraDeg] of Object.entries(pageEdits.extraRotations)) {
      const pIdx = Number(pageNumStr) - 1;
      if (pIdx >= 0 && pIdx < pages.length && extraDeg) {
        const p = pages[pIdx];
        const currentAngle = p.getRotation().angle;
        p.setRotation(degrees((currentAngle + extraDeg) % 360));
      }
    }
  }

  // Remove any deleted pages in descending index order (ensuring at least 1 page remains)
  if (pageEdits?.deletedPages && pageEdits.deletedPages.length > 0) {
    const sortedDesc = Array.from(new Set(pageEdits.deletedPages))
      .map((n) => n - 1)
      .filter((idx) => idx >= 0 && idx < pdfDoc.getPageCount())
      .sort((a, b) => b - a);

    for (const removeIdx of sortedDesc) {
      if (pdfDoc.getPageCount() > 1) {
        pdfDoc.removePage(removeIdx);
      }
    }
  }

  return await pdfDoc.save();
}

/**
 * 12. Fill Interactive AcroForm Fields and optionally flatten.
 */
export async function fillPdfFormFields(
  bytes: Uint8Array,
  values: Record<string, string | boolean>,
  flattenAfterFill = false
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  for (const [fieldName, val] of Object.entries(values)) {
    try {
      const field = form.getField(fieldName);
      if (field instanceof PDFTextField) {
        field.setText(String(val));
      } else if (field instanceof PDFCheckBox) {
        if (val) field.check();
        else field.uncheck();
      } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        field.select(String(val));
      } else if (field instanceof PDFRadioGroup) {
        field.select(String(val));
      }
    } catch {
      // Skip unknown field
    }
  }

  if (flattenAfterFill) {
    form.flatten();
  }

  return await pdfDoc.save();
}

/**
 * Helper to normalize any supported image File (JPG, PNG, WebP) into PNG or JPG bytes.
 * JPG and PNG files are embedded directly via pdf-lib (works in both Browser and Node.js);
 * WebP or other formats use HTML5 Canvas in the browser to transcode to lossless PNG.
 */
async function decodeImageFileForPdf(
  file: File
): Promise<{ bytes: Uint8Array; format: 'jpg' | 'png'; name: string }> {
  const rawBuffer = await file.arrayBuffer();
  const rawBytes = new Uint8Array(rawBuffer);

  const isJpg =
    rawBytes.length > 3 &&
    rawBytes[0] === 0xff &&
    rawBytes[1] === 0xd8 &&
    rawBytes[2] === 0xff;
  if (isJpg) {
    return {
      bytes: rawBytes,
      format: 'jpg',
      name: file.name,
    };
  }

  const isPng =
    rawBytes.length > 8 &&
    rawBytes[0] === 0x89 &&
    rawBytes[1] === 0x50 &&
    rawBytes[2] === 0x4e &&
    rawBytes[3] === 0x47;
  if (isPng) {
    return {
      bytes: rawBytes,
      format: 'png',
      name: file.name,
    };
  }

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error(`Unsupported image format in ${file.name}. Only PNG and JPG are supported in headless mode.`);
  }

  // Convert WebP or other browser-supported image formats to lossless PNG bytes via canvas
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Failed to read image ${file.name}`));
    reader.readAsDataURL(file);
  });

  const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Invalid image format in ${file.name}`));
    img.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = imgEl.naturalWidth || 800;
  canvas.height = imgEl.naturalHeight || 600;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(imgEl, 0, 0);
  }
  const pngDataUrl = canvas.toDataURL('image/png');
  const b64 = pngDataUrl.split(',')[1];
  const pngBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  return {
    bytes: pngBytes,
    format: 'png',
    name: file.name,
  };
}

/**
 * 13 & 29. Convert multiple Images (JPG, PNG, WebP) to PDF or Multi-Column Contact Sheet PDF.
 */
export async function convertImagesToPdf(
  files: File[],
  options: {
    pageSize: 'fit' | 'A4' | 'Letter';
    marginPt: number;
    contactSheetColumns?: number; // 1 = normal 1 image per page; 2, 3, 4 = contact sheet grid
    showCaptions?: boolean;
  }
): Promise<Uint8Array> {
  if (files.length === 0) {
    throw new Error('Please upload at least one image.');
  }

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const embeddedList = [];
  for (const f of files) {
    const decoded = await decodeImageFileForPdf(f);
    const embedded =
      decoded.format === 'jpg'
        ? await pdfDoc.embedJpg(decoded.bytes)
        : await pdfDoc.embedPng(decoded.bytes);
    embeddedList.push({
      embedded,
      width: embedded.width,
      height: embedded.height,
      name: decoded.name,
    });
  }

  const cols = options.contactSheetColumns || 1;

  if (cols <= 1) {
    for (const imgData of embeddedList) {
      if (options.pageSize === 'fit') {
        const pageW = imgData.width + options.marginPt * 2;
        const pageH = imgData.height + options.marginPt * 2;
        const page = pdfDoc.addPage([pageW, pageH]);
        page.drawImage(imgData.embedded, {
          x: options.marginPt,
          y: options.marginPt,
          width: imgData.width,
          height: imgData.height,
        });
      } else {
        const preset = PAGE_SIZE_PRESETS[options.pageSize] || PAGE_SIZE_PRESETS.A4;
        const page = pdfDoc.addPage([preset.widthPt, preset.heightPt]);
        const availW = preset.widthPt - options.marginPt * 2;
        const availH = preset.heightPt - options.marginPt * 2;
        const scale = Math.min(availW / imgData.width, availH / imgData.height);
        const drawW = imgData.width * scale;
        const drawH = imgData.height * scale;
        page.drawImage(imgData.embedded, {
          x: (preset.widthPt - drawW) / 2,
          y: (preset.heightPt - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      }
    }
  } else {
    // Contact sheet grid mode (cols x cols per page)
    const rows = cols;
    const perPage = cols * rows;
    const preset = PAGE_SIZE_PRESETS[options.pageSize === 'fit' ? 'A4' : options.pageSize] || PAGE_SIZE_PRESETS.A4;
    const margin = Math.max(24, options.marginPt);
    const gap = 14;
    const cellW = (preset.widthPt - margin * 2 - gap * (cols - 1)) / cols;
    const cellH = (preset.heightPt - margin * 2 - gap * (rows - 1)) / rows;

    for (let i = 0; i < embeddedList.length; i += perPage) {
      const page = pdfDoc.addPage([preset.widthPt, preset.heightPt]);
      const chunk = embeddedList.slice(i, i + perPage);

      for (let j = 0; j < chunk.length; j++) {
        const item = chunk[j];
        const colIdx = j % cols;
        const rowIdx = Math.floor(j / cols);

        const cellX = margin + colIdx * (cellW + gap);
        const cellTopY = preset.heightPt - margin - rowIdx * (cellH + gap);
        const cellBottomY = cellTopY - cellH;

        page.drawRectangle({
          x: cellX,
          y: cellBottomY,
          width: cellW,
          height: cellH,
          borderColor: rgb(0.84, 0.87, 0.92),
          borderWidth: 0.75,
          color: rgb(0.99, 0.99, 1),
        });

        const captionSpace = options.showCaptions ? 18 : 4;
        const imgBoxW = cellW - 12;
        const imgBoxH = cellH - 12 - captionSpace;
        const scale = Math.min(imgBoxW / item.width, imgBoxH / item.height);
        const drawW = item.width * scale;
        const drawH = item.height * scale;

        page.drawImage(item.embedded, {
          x: cellX + (cellW - drawW) / 2,
          y: cellBottomY + captionSpace + (imgBoxH - drawH) / 2 + 4,
          width: drawW,
          height: drawH,
        });

        if (options.showCaptions) {
          const shortCaption = item.name.slice(0, 26);
          page.drawText(shortCaption, {
            x: cellX + 6,
            y: cellBottomY + 6,
            size: 8,
            font,
            color: rgb(0.25, 0.3, 0.38),
          });
        }
      }
    }
  }

  return await pdfDoc.save();
}

/**
 * 14. Convert PDF pages to JPG, PNG, or WebP images and package as a ZIP.
 */
export async function convertPdfToImagesBundle(
  bytes: Uint8Array,
  format: 'jpg' | 'png' | 'webp',
  scale = 2.0,
  baseName = 'document'
): Promise<{
  zipBlob: Blob;
  images: Array<{ pageNumber: number; dataUrl: string; fileName: string }>;
}> {
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({ data: bytes.slice(0) });
  const pdf = await loadingTask.promise;

  const mimeMap = {
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  } as const;

  const zip = new JSZip();
  const images: Array<{ pageNumber: number; dataUrl: string; fileName: string }> = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const { dataUrl } = await renderSinglePageDataUrl(bytes, p, scale, mimeMap[format], 0.92);
    const fileName = `${baseName}-page-${String(p).padStart(3, '0')}.${format}`;
    images.push({ pageNumber: p, dataUrl, fileName });

    const b64 = dataUrl.split(',')[1];
    zip.file(fileName, b64, { base64: true });
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return { zipBlob, images };
}

/**
 * 15 & 25. Convert Word (.docx), Excel (.xlsx), CSV, HTML, or Plain Text to PDF.
 */
export async function convertDocumentOrTextToPdf(
  input: { file?: File; rawText?: string; title?: string },
  options: { pageSize: 'A4' | 'Letter'; fontSize: number }
): Promise<Uint8Array> {
  let extractedText = input.rawText || '';
  let docTitle = input.title || 'PDFNestly Generated Document';

  if (input.file) {
    docTitle = input.file.name.replace(/\.[^.]+$/, '');
    const ext = input.file.name.split('.').pop()?.toLowerCase() || '';
    const arrayBuffer = await input.file.arrayBuffer();

    if (ext === 'docx') {
      const mammoth = await import('mammoth');
      const mammothInput =
        typeof Buffer !== 'undefined'
          ? { arrayBuffer, buffer: Buffer.from(arrayBuffer) }
          : { arrayBuffer };
      const res = await mammoth.extractRawText(mammothInput);
      extractedText = res.value || 'No text content found in DOCX file.';
    } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const lines: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        lines.push(`=== Sheet: ${sheetName} ===`);
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
        for (const r of rows) {
          if (Array.isArray(r) && r.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
            lines.push(r.map((c) => String(c ?? '')).join('  |  '));
          }
        }
        lines.push('');
      }
      extractedText = lines.join('\n');
    } else {
      const rawStr = new TextDecoder().decode(arrayBuffer);
      if (ext === 'html' || ext === 'htm') {
        if (typeof DOMParser !== 'undefined') {
          const parser = new DOMParser();
          const dom = parser.parseFromString(rawStr, 'text/html');
          extractedText = dom.body.innerText || dom.body.textContent || rawStr;
        } else {
          extractedText = rawStr
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ');
        }
      } else {
        extractedText = rawStr;
      }
    }
  }

  if (!extractedText.trim()) {
    throw new Error('Document content is empty. Please enter text or upload a non-empty file.');
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(docTitle);
  pdfDoc.setCreator('PDFNestly Document Converter');

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const preset = PAGE_SIZE_PRESETS[options.pageSize] || PAGE_SIZE_PRESETS.A4;
  const margin = 50;
  const maxLineWidth = preset.widthPt - margin * 2;
  const lineHeight = options.fontSize * 1.45;

  let page = pdfDoc.addPage([preset.widthPt, preset.heightPt]);
  let cursorY = preset.heightPt - margin;

  // Draw Document Title Header
  page.drawText(docTitle, {
    x: margin,
    y: cursorY,
    size: options.fontSize + 4,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });
  cursorY -= lineHeight * 1.8;

  // Sanitize characters to WinAnsi-compatible ASCII/Latin-1 for standard PDF fonts
  const cleanParagraphs = extractedText
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, ' ')
    .split(/\r?\n/);

  for (const para of cleanParagraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      cursorY -= lineHeight * 0.6;
      if (cursorY < margin) {
        page = pdfDoc.addPage([preset.widthPt, preset.heightPt]);
        cursorY = preset.heightPt - margin;
      }
      continue;
    }

    const isHeading = trimmed.startsWith('#') || trimmed.startsWith('===');
    const activeFont = isHeading ? fontBold : fontRegular;
    const activeSize = isHeading ? options.fontSize + 1.5 : options.fontSize;
    const words = trimmed.replace(/^#+\s*/, '').split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = activeFont.widthOfTextAtSize(testLine, activeSize);
      if (width > maxLineWidth && currentLine) {
        if (cursorY < margin) {
          page = pdfDoc.addPage([preset.widthPt, preset.heightPt]);
          cursorY = preset.heightPt - margin;
        }
        page.drawText(currentLine, {
          x: margin,
          y: cursorY,
          size: activeSize,
          font: activeFont,
          color: rgb(0.15, 0.2, 0.28),
        });
        cursorY -= lineHeight;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      if (cursorY < margin) {
        page = pdfDoc.addPage([preset.widthPt, preset.heightPt]);
        cursorY = preset.heightPt - margin;
      }
      page.drawText(currentLine, {
        x: margin,
        y: cursorY,
        size: activeSize,
        font: activeFont,
        color: rgb(0.15, 0.2, 0.28),
      });
      cursorY -= lineHeight;
    }
  }

  return await pdfDoc.save();
}

/**
 * 16. Export PDF content to genuine DOCX, XLSX, CSV, HTML Presentation Outline, or Plain Text.
 */
export async function exportPdfToFormat(
  bytes: Uint8Array,
  targetFormat: 'docx' | 'xlsx' | 'csv' | 'txt' | 'html',
  baseName = 'document'
): Promise<{ blob: Blob; fileName: string; previewText: string }> {
  const extracted = await extractPdfTextAndLines(bytes);
  const info = await inspectPdfBytes(bytes);

  if (targetFormat === 'txt') {
    const blob = new Blob([extracted.fullText], { type: 'text/plain;charset=utf-8' });
    return {
      blob,
      fileName: `${baseName}.txt`,
      previewText: extracted.fullText,
    };
  }

  if (targetFormat === 'csv') {
    const allRows: string[][] = [];
    if (extracted.tables.length > 0) {
      extracted.tables.forEach((pageTable) => {
        pageTable.forEach((row) => allRows.push(row));
      });
    } else {
      extracted.lines.forEach((l) => allRows.push([String(l.pageNumber), l.text]));
    }
    const worksheet = XLSX.utils.aoa_to_sheet(allRows);
    const csvStr = XLSX.utils.sheet_to_csv(worksheet);
    return {
      blob: new Blob([csvStr], { type: 'text/csv;charset=utf-8' }),
      fileName: `${baseName}.csv`,
      previewText: csvStr,
    };
  }

  if (targetFormat === 'xlsx') {
    const wb = XLSX.utils.book_new();
    if (extracted.tables.length > 0) {
      extracted.tables.forEach((pageTable, idx) => {
        const ws = XLSX.utils.aoa_to_sheet(pageTable);
        XLSX.utils.book_append_sheet(wb, ws, `Page_${idx + 1}_Table`);
      });
    }
    // Always append a Full_Text_Lines sheet as well
    const lineRows = [
      ['Page', 'Y-Coord', 'Font Size', 'Extracted Text'],
      ...extracted.lines.map((l) => [String(l.pageNumber), String(l.y), String(l.fontSize), l.text]),
    ];
    const wsLines = XLSX.utils.aoa_to_sheet(lineRows);
    XLSX.utils.book_append_sheet(wb, wsLines, 'All_Document_Lines');

    const xlsxBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return {
      blob: new Blob([xlsxBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      fileName: `${baseName}.xlsx`,
      previewText: extracted.fullText,
    };
  }

  if (targetFormat === 'html') {
    const slidesHtml = extracted.pageTexts
      .map(
        (pText, idx) => `
      <section style="border:1px solid #cbd5e1; border-radius:8px; padding:24px; margin-bottom:24px; background:#fff;">
        <h2 style="margin-top:0; color:#0f172a; font-family:sans-serif;">Slide / Page ${idx + 1}</h2>
        <pre style="white-space:pre-wrap; font-family:sans-serif; line-height:1.6; color:#334155;">${pText}</pre>
      </section>`
      )
      .join('\n');

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${info.title || baseName}</title></head>
<body style="background:#f8fafc; padding:40px; max-width:900px; margin:0 auto;">
  <h1 style="font-family:sans-serif; color:#0f172a;">${info.title || baseName}</h1>
  ${slidesHtml}
</body>
</html>`;
    return {
      blob: new Blob([fullHtml], { type: 'text/html;charset=utf-8' }),
      fileName: `${baseName}-slides.html`,
      previewText: extracted.fullText,
    };
  }

  // Default: genuine Microsoft Word .docx generation via `docx` package
  const children: Array<Paragraph | DocxTable> = [
    new Paragraph({
      text: info.title || baseName,
      heading: HeadingLevel.HEADING_1,
    }),
  ];

  for (const line of extracted.lines) {
    const isHeading = line.fontSize >= 13.5;
    children.push(
      new Paragraph({
        heading: isHeading ? HeadingLevel.HEADING_2 : undefined,
        children: [
          new TextRun({
            text: line.text,
            bold: isHeading,
            size: Math.round(line.fontSize * 2), // half-points
          }),
        ],
      })
    );
  }

  if (extracted.tables.length > 0) {
    for (const tableGrid of extracted.tables) {
      const maxCols = Math.max(...tableGrid.map((r) => r.length), 1);
      const docxRows = tableGrid.map(
        (rowCells) =>
          new DocxTableRow({
            children: Array.from({ length: maxCols }, (_, cIdx) => {
              return new DocxTableCell({
                width: { size: Math.floor(100 / maxCols), type: WidthType.PERCENTAGE },
                children: [new Paragraph(rowCells[cIdx] || '')],
              });
            }),
          })
      );
      children.push(
        new DocxTable({
          rows: docxRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        })
      );
    }
  }

  const wordDoc = new DocxDocument({
    sections: [{ children }],
  });
  const docxBlob = await Packer.toBlob(wordDoc);
  return {
    blob: docxBlob,
    fileName: `${baseName}.docx`,
    previewText: extracted.fullText,
  };
}

/**
 * 17. Real OCR Scanned PDF using Tesseract.js + Searchable PDF generation.
 */
export async function performOcrOnPdf(
  bytes: Uint8Array,
  language = 'eng',
  maxPages = 5,
  onProgress?: (statusText: string, percent: number) => void
): Promise<{
  searchablePdfBytes: Uint8Array;
  recognizedText: string;
  averageConfidence: number;
}> {
  const Tesseract = await import('tesseract.js');
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({ data: bytes.slice(0) });
  const pdf = await loadingTask.promise;

  const pagesToProcess = Math.min(pdf.numPages, maxPages);
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  const pageTranscripts: string[] = [];
  let totalConfidence = 0;

  for (let p = 1; p <= pagesToProcess; p++) {
    onProgress?.(`Rendering page ${p} of ${pagesToProcess} for OCR...`, Math.round(((p - 1) / pagesToProcess) * 100));
    const { dataUrl, widthPx, heightPx } = await renderSinglePageDataUrl(
      bytes,
      p,
      1.75,
      'image/png'
    );

    onProgress?.(`Running Tesseract OCR (${language}) on page ${p}...`, Math.round(((p - 0.5) / pagesToProcess) * 100));
    const result = await Tesseract.recognize(dataUrl, language);
    const pageText = result.data.text || '';
    totalConfidence += result.data.confidence || 0;
    pageTranscripts.push(`--- Page ${p} (Confidence: ${Math.round(result.data.confidence || 0)}%) ---\n${pageText}`);

    // Embed scanned page image + searchable text layer in output PDF
    const b64 = dataUrl.split(',')[1];
    const pngBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const embeddedPng = await outDoc.embedPng(pngBytes);

    const pagePtW = Math.round(widthPx / 1.75);
    const pagePtH = Math.round(heightPx / 1.75);
    const pdfPage = outDoc.addPage([pagePtW, pagePtH]);

    pdfPage.drawImage(embeddedPng, {
      x: 0,
      y: 0,
      width: pagePtW,
      height: pagePtH,
    });

    // Write recognized lines into an invisible searchable text layer (opacity 0.01) so Ctrl+F and selection work
    const cleanLines = pageText
      .replace(/[^\x20-\x7E\n]/g, ' ')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    cleanLines.forEach((lineStr, idx) => {
      const yPos = Math.max(12, pagePtH - 36 - idx * 14);
      pdfPage.drawText(lineStr.slice(0, 110), {
        x: 36,
        y: yPos,
        size: 10,
        font,
        color: rgb(0, 0, 0),
        opacity: 0.01,
      });
    });
  }

  onProgress?.('Finalizing searchable PDF...', 100);
  const searchablePdfBytes = await outDoc.save();
  return {
    searchablePdfBytes,
    recognizedText: pageTranscripts.join('\n\n'),
    averageConfidence: Math.round(totalConfidence / Math.max(1, pagesToProcess)),
  };
}

/**
 * 19. Edit Existing PDF Text Lines at exact extracted coordinates.
 */
export async function applyCoordinateTextEdits(
  bytes: Uint8Array,
  editedLines: ExtractedTextLine[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  const modifiedOnly = editedLines.filter((l) => l.text !== l.originalText);

  for (const line of modifiedOnly) {
    const page = pages[line.pageNumber - 1];
    if (!page) continue;

    // Mask original glyph run cleanly with white rectangle
    page.drawRectangle({
      x: Math.max(0, line.x - 2),
      y: Math.max(0, line.y - 3),
      width: line.width + 12,
      height: line.height + 6,
      color: rgb(1, 1, 1),
    });

    const safeStr = line.text.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
    if (safeStr.trim().length > 0) {
      page.drawText(safeStr, {
        x: line.x,
        y: line.y,
        size: line.fontSize,
        font,
        color: rgb(0.08, 0.1, 0.16),
      });
    }
  }

  return await pdfDoc.save();
}

/**
 * 21. Permanent Content Redaction:
 * Finds all matching sensitive terms (or coordinate boxes), blacks them out on a rasterized canvas,
 * and reconstructs the PDF without the underlying text stream so redacted tokens cannot be recovered.
 */
export async function permanentlyRedactPdf(
  bytes: Uint8Array,
  searchTerms: string[]
): Promise<{
  redactedPdfBytes: Uint8Array;
  redactionCount: number;
  verifiedClean: boolean;
}> {
  const cleanTerms = searchTerms.map((t) => t.trim()).filter(Boolean);
  if (cleanTerms.length === 0) {
    throw new Error('Please enter at least one sensitive word, token, or phrase to redact.');
  }

  const { lines } = await extractPdfTextAndLines(bytes);
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({ data: bytes.slice(0) });
  const pdf = await loadingTask.promise;

  const outDoc = await PDFDocument.create();
  const fontRegular = await outDoc.embedFont(StandardFonts.Helvetica);
  let redactionCount = 0;
  const renderScale = 2.0;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: renderScale });
    const unscaled = page.getViewport({ scale: 1.0 });
    const pageLines = lines.filter((l) => l.pageNumber === p);

    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;

        // Locate any lines on this page matching sensitive terms
        for (const line of pageLines) {
          const lowerLine = line.text.toLowerCase();
          const matched = cleanTerms.some((term) => lowerLine.includes(term.toLowerCase()));
          if (matched) {
            redactionCount++;
            // Convert PDF bottom-left coordinates to Canvas top-left coordinates
            const rx = (line.x - 3) * renderScale;
            const ry = (unscaled.height - line.y - line.height - 2) * renderScale;
            const rw = (line.width + 10) * renderScale;
            const rh = (line.height + 6) * renderScale;

            ctx.fillStyle = '#000000';
            ctx.fillRect(rx, ry, rw, rh);
          }
        }
      }

      const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const b64 = jpgDataUrl.split(',')[1];
      const jpgBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const embeddedJpg = await outDoc.embedJpg(jpgBytes);

      const outPage = outDoc.addPage([unscaled.width, unscaled.height]);
      outPage.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width: unscaled.width,
        height: unscaled.height,
      });
    } else {
      // Headless Node environment: reconstruct clean page omitting redacted text lines and drawing blackout bars
      const outPage = outDoc.addPage([unscaled.width, unscaled.height]);
      for (const line of pageLines) {
        const lowerLine = line.text.toLowerCase();
        const matched = cleanTerms.some((term) => lowerLine.includes(term.toLowerCase()));
        if (matched) {
          redactionCount++;
          outPage.drawRectangle({
            x: Math.max(0, line.x - 3),
            y: Math.max(0, line.y - 2),
            width: line.width + 10,
            height: line.height + 6,
            color: rgb(0, 0, 0),
          });
        } else {
          const safeStr = line.text.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
          if (safeStr.trim()) {
            outPage.drawText(safeStr, {
              x: line.x,
              y: line.y,
              size: line.fontSize,
              font: fontRegular,
              color: rgb(0.1, 0.12, 0.16),
            });
          }
        }
      }
    }
  }

  const redactedPdfBytes = await outDoc.save();

  // Verify that the output PDF has 0 selectable occurrences of the redacted terms
  const postAudit = await extractPdfTextAndLines(redactedPdfBytes);
  const stillPresent = cleanTerms.some((term) =>
    postAudit.fullText.toLowerCase().includes(term.toLowerCase())
  );

  return {
    redactedPdfBytes,
    redactionCount,
    verifiedClean: !stillPresent,
  };
}

/**
 * 22. Compare Two PDFs and generate a Diff Report PDF.
 */
export async function compareTwoPdfs(
  bytesA: Uint8Array,
  bytesB: Uint8Array
): Promise<{
  diffs: DiffEntry[];
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
  infoA: PdfInspectionReport;
  infoB: PdfInspectionReport;
  reportPdfBytes: Uint8Array;
}> {
  const [extA, extB, infoA, infoB] = await Promise.all([
    extractPdfTextAndLines(bytesA),
    extractPdfTextAndLines(bytesB),
    inspectPdfBytes(bytesA),
    inspectPdfBytes(bytesB),
  ]);

  const diffs = computeTextDiff(extA.fullText, extB.fullText);
  const addedCount = diffs.filter((d) => d.type === 'added').length;
  const removedCount = diffs.filter((d) => d.type === 'removed').length;
  const unchangedCount = diffs.filter((d) => d.type === 'same').length;

  // Generate a downloadable PDF Audit Report
  const reportText = [
    `PDFNestly Comparison Audit Report`,
    `Document A: ${infoA.title || 'Original PDF'} (${infoA.pageCount} pages)`,
    `Document B: ${infoB.title || 'Revised PDF'} (${infoB.pageCount} pages)`,
    `Summary: +${addedCount} Added Lines  |  -${removedCount} Removed Lines  |  ${unchangedCount} Unchanged Lines`,
    ``,
    ...diffs.map((d) => {
      if (d.type === 'added') return `[+ ADDED] ${d.value}`;
      if (d.type === 'removed') return `[- REMOVED] ${d.value}`;
      return `[  SAME ] ${d.value}`;
    }),
  ].join('\n');

  const reportPdfBytes = await convertDocumentOrTextToPdf(
    { rawText: reportText, title: 'PDF Comparison Diff Report' },
    { pageSize: 'Letter', fontSize: 10 }
  );

  return {
    diffs,
    addedCount,
    removedCount,
    unchangedCount,
    infoA,
    infoB,
    reportPdfBytes,
  };
}

/**
 * 24. Update PDF Metadata and optionally prepend a Bookmarks / Table of Contents sheet.
 */
export async function updatePdfMetadataAndBookmarks(
  bytes: Uint8Array,
  metadata: {
    title: string;
    author: string;
    subject: string;
    keywords: string;
    creator: string;
    bookmarksList?: Array<{ title: string; targetPage: number }>;
    prependTocSheet?: boolean;
  }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  pdfDoc.setTitle(metadata.title);
  pdfDoc.setAuthor(metadata.author);
  pdfDoc.setSubject(metadata.subject);
  pdfDoc.setKeywords(
    metadata.keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
  );
  pdfDoc.setCreator(metadata.creator || 'PDFNestly Metadata Editor');
  pdfDoc.setModificationDate(new Date());

  if (metadata.prependTocSheet && metadata.bookmarksList && metadata.bookmarksList.length > 0) {
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const tocPage = pdfDoc.insertPage(0, [612, 792]);

    tocPage.drawText(metadata.title || 'Document Bookmarks & Contents', {
      x: 50,
      y: 730,
      size: 16,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.16),
    });

    metadata.bookmarksList.forEach((bm, idx) => {
      const y = 685 - idx * 24;
      if (y > 50) {
        tocPage.drawText(`${idx + 1}. ${bm.title}`, {
          x: 50,
          y,
          size: 11,
          font: fontReg,
          color: rgb(0.15, 0.2, 0.28),
        });
        tocPage.drawText(`Page ${bm.targetPage}`, {
          x: 500,
          y,
          size: 11,
          font: fontBold,
          color: rgb(0.1, 0.3, 0.7),
        });
      }
    });
  }

  return await pdfDoc.save();
}

/**
 * 26. Resize PDF Pages to standard preset (A4, Letter, Legal, A3, A5) and optionally append blank page.
 */
export async function resizePdfPagesToPreset(
  bytes: Uint8Array,
  presetKey: string,
  appendBlankPage = false
): Promise<Uint8Array> {
  const preset = PAGE_SIZE_PRESETS[presetKey] || PAGE_SIZE_PRESETS.A4;
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const outDoc = await PDFDocument.create();
  const srcPages = srcDoc.getPages();

  for (const sp of srcPages) {
    const { width, height } = sp.getSize();
    const embedded = await outDoc.embedPage(sp);
    const newPage = outDoc.addPage([preset.widthPt, preset.heightPt]);

    const scale = Math.min(preset.widthPt / width, preset.heightPt / height);
    const drawW = width * scale;
    const drawH = height * scale;

    newPage.drawPage(embedded, {
      x: (preset.widthPt - drawW) / 2,
      y: (preset.heightPt - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }

  if (appendBlankPage) {
    outDoc.addPage([preset.widthPt, preset.heightPt]);
  }

  return await outDoc.save();
}

/**
 * 27 & 28. Flatten PDF or Strip Annotations, Form Fields, and Metadata.
 */
export async function sanitizeOrFlattenPdf(
  bytes: Uint8Array,
  options: {
    flattenForms: boolean;
    stripAnnotations: boolean;
    stripMetadata: boolean;
  }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  if (options.flattenForms) {
    try {
      const form = pdfDoc.getForm();
      form.flatten();
    } catch {
      // No AcroForm present
    }
  }

  if (options.stripAnnotations) {
    const pages = pdfDoc.getPages();
    for (const page of pages) {
      page.node.delete(PDFName.of('Annots'));
    }
  }

  if (options.stripMetadata) {
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setCreator('');
    pdfDoc.setProducer('');
  }

  return await pdfDoc.save();
}
