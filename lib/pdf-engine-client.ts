'use client';

import {
  PDFDocument,
  PDFPage,
  PDFDict,
  PDFArray,
  PDFRef,
  PDFNumber,
  PDFRawStream,
  PDFHexString,
  PDFString,
  PDFFont,
  StandardFonts,
  rgb,
  degrees,
  PDFName,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  decodePDFRawStream,
  setCharacterSpacing,
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
  pageWidthPt?: number;
  pageHeightPt?: number;
  fontFamily?: 'Helvetica' | 'TimesRoman' | 'Courier';
  isBold?: boolean;
  isItalic?: boolean;
  colorHex?: string;
  xPercent?: number;
  yPercent?: number;
  widthPercent?: number;
  heightPercent?: number;
}

export interface DetectedFormField {
  name: string;
  type: 'text' | 'multiline' | 'checkbox' | 'dropdown' | 'optionlist' | 'radio' | 'signature' | 'unknown';
  value: string | boolean;
  options?: string[];
  isRequired?: boolean;
  isReadOnly?: boolean;
  isMultiline?: boolean;
  pageNumber?: number;
  xPercent?: number;
  yPercent?: number;
  widthPercent?: number;
  heightPercent?: number;
}

export interface CandidateFormField {
  id: string;
  pageNumber: number;
  fieldName: string;
  label: string;
  fieldType:
    | 'form-text'
    | 'form-multiline'
    | 'form-dropdown'
    | 'form-radio'
    | 'form-checkbox'
    | 'form-signature';
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  source: 'existing-acroform' | 'detected-label';
  defaultValue?: string;
  checked?: boolean;
  dropdownOptions?: string[];
  radioGroupName?: string;
  radioOptionValue?: string;
  isRequired?: boolean;
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
    | 'underline'
    | 'strikethrough'
    | 'rectangle'
    | 'rounded-rect'
    | 'ellipse'
    | 'shape'
    | 'circle'
    | 'triangle'
    | 'line'
    | 'arrow'
    | 'redact'
    | 'stamp'
    | 'watermark'
    | 'signature'
    | 'comment'
    | 'image'
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
  xPercent: number; // 0 to 100 from left
  yPercent: number; // 0 to 100 from top
  widthPercent: number;
  heightPercent: number;
  text?: string;
  colorHex?: string;
  fillHex?: string;
  stampLabel?: string;
  fontSize?: number;
  opacity?: number;
  imageDataUrl?: string;
  shapeType?: 'rectangle' | 'rounded-rect' | 'ellipse' | 'triangle' | 'line' | 'arrow' | 'freehand';
  fillColorHex?: string;
  strokeColorHex?: string;
  strokeWidth?: number;
  isExistingTextEdit?: boolean;
  originalText?: string;
  backgroundColorHex?: string;
  aspectRatioLocked?: boolean;
  fontFamily?: string;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrikethrough?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  letterSpacingPt?: number;
  lineHeightMultiplier?: number;
  rotationDeg?: number;
  originXPt?: number;
  originYPt?: number;
  originWidthPt?: number;
  originHeightPt?: number;
  originXPercent?: number;
  originYPercent?: number;
  originWidthPercent?: number;
  originHeightPercent?: number;
  hyperlinkUrl?: string;
  // Interactive AcroForm properties
  fieldName?: string;
  fieldValue?: string;
  defaultValue?: string;
  fieldPlaceholder?: string;
  isRequired?: boolean;
  isReadOnly?: boolean;
  isMultiline?: boolean;
  dropdownOptions?: string[];
  radioGroupName?: string;
  radioOptionValue?: string;
  checked?: boolean;
  tabOrder?: number;
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
      const isRequired = f.isRequired();
      const isReadOnly = f.isReadOnly();

      // Attempt to locate widget coordinates and page
      let pageNumber = 1;
      let xPercent: number | undefined;
      let yPercent: number | undefined;
      let widthPercent: number | undefined;
      let heightPercent: number | undefined;

      try {
        const widgets = f.acroField.getWidgets();
        if (widgets.length > 0) {
          const w = widgets[0];
          const rect = w.getRectangle();
          const pRef = w.P();
          const foundPageIdx = pRef
            ? pages.findIndex((p) => p.ref === pRef)
            : 0;
          const pIdx = foundPageIdx >= 0 ? foundPageIdx : 0;
          pageNumber = pIdx + 1;
          const pageObj = pages[pIdx];
          if (pageObj) {
            const { width, height } = pageObj.getSize();
            const mediaBox = pageObj.getMediaBox();
            xPercent = Math.round(((rect.x - mediaBox.x) / width) * 1000) / 10;
            yPercent = Math.round(((mediaBox.y + height - rect.y - rect.height) / height) * 1000) / 10;
            widthPercent = Math.round((rect.width / width) * 1000) / 10;
            heightPercent = Math.round((rect.height / height) * 1000) / 10;
          }
        }
      } catch {
        // Ignore widget rect lookup error
      }

      if (f instanceof PDFTextField) {
        const isMultiline = f.isMultiline();
        const isSigField = name.toLowerCase().startsWith('sig_') || name.toLowerCase().includes('signature');
        formFields.push({
          name,
          type: isSigField ? 'signature' : isMultiline ? 'multiline' : 'text',
          value: f.getText() || '',
          isRequired,
          isReadOnly,
          isMultiline,
          pageNumber,
          xPercent,
          yPercent,
          widthPercent,
          heightPercent,
        });
      } else if (f instanceof PDFCheckBox) {
        formFields.push({
          name,
          type: 'checkbox',
          value: f.isChecked(),
          isRequired,
          isReadOnly,
          pageNumber,
          xPercent,
          yPercent,
          widthPercent,
          heightPercent,
        });
      } else if (f instanceof PDFDropdown) {
        const selected = f.getSelected();
        formFields.push({
          name,
          type: 'dropdown',
          value: selected[0] || '',
          options: f.getOptions(),
          isRequired,
          isReadOnly,
          pageNumber,
          xPercent,
          yPercent,
          widthPercent,
          heightPercent,
        });
      } else if (f instanceof PDFOptionList) {
        const selected = f.getSelected();
        formFields.push({
          name,
          type: 'optionlist',
          value: selected[0] || '',
          options: f.getOptions(),
          isRequired,
          isReadOnly,
          pageNumber,
          xPercent,
          yPercent,
          widthPercent,
          heightPercent,
        });
      } else if (f instanceof PDFRadioGroup) {
        formFields.push({
          name,
          type: 'radio',
          value: f.getSelected() || '',
          options: f.getOptions(),
          isRequired,
          isReadOnly,
          pageNumber,
          xPercent,
          yPercent,
          widthPercent,
          heightPercent,
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
 * Analyzes a PDF for both existing AcroForm fields and visual text labels (e.g., "Name:", "Date:", "Email:", "Signature:", "[ ]")
 * to propose candidate interactive form fields for user review and confirmation.
 */
export async function detectCandidateFormFields(bytes: Uint8Array): Promise<CandidateFormField[]> {
  const candidates: CandidateFormField[] = [];
  const inspection = await inspectPdfBytes(bytes);

  // 1. Include any existing AcroForm fields first
  inspection.formFields.forEach((f, idx) => {
    const fieldType: CandidateFormField['fieldType'] =
      f.type === 'checkbox'
        ? 'form-checkbox'
        : f.type === 'dropdown' || f.type === 'optionlist'
          ? 'form-dropdown'
          : f.type === 'radio'
            ? 'form-radio'
            : f.type === 'signature'
              ? 'form-signature'
              : f.type === 'multiline'
                ? 'form-multiline'
                : 'form-text';

    candidates.push({
      id: `cand_acro_${idx}_${f.name}`,
      pageNumber: f.pageNumber || 1,
      fieldName: f.name,
      label: `Existing AcroForm: ${f.name}`,
      fieldType,
      xPercent: f.xPercent ?? 20,
      yPercent: f.yPercent ?? 20 + idx * 7,
      widthPercent: f.widthPercent ?? (fieldType === 'form-checkbox' || fieldType === 'form-radio' ? 3.2 : 28),
      heightPercent: f.heightPercent ?? (fieldType === 'form-multiline' ? 8 : fieldType === 'form-checkbox' || fieldType === 'form-radio' ? 2.5 : 3.6),
      source: 'existing-acroform',
      defaultValue: typeof f.value === 'string' ? f.value : '',
      checked: typeof f.value === 'boolean' ? f.value : false,
      dropdownOptions: f.options,
      radioGroupName: fieldType === 'form-radio' ? f.name : undefined,
      radioOptionValue: fieldType === 'form-radio' && typeof f.value === 'string' ? f.value || f.options?.[0] || 'Option1' : undefined,
      isRequired: Boolean(f.isRequired),
    });
  });

  // 2. Scan page text lines for common form labels and blank lines/checkboxes
  const maxPagesToScan = Math.min(inspection.pageCount, 15);
  let allExtractedLines: ExtractedTextLine[] = [];
  try {
    const ext = await extractPdfTextAndLines(bytes);
    allExtractedLines = ext.lines;
  } catch {
    // Ignore extraction error
  }

  for (let pNum = 1; pNum <= maxPagesToScan; pNum++) {
    try {
      const lines = allExtractedLines.filter((l) => l.pageNumber === pNum);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const raw = line.text.trim();
        if (!raw) continue;

        const lower = raw.toLowerCase();
        const lineX = line.xPercent ?? 10;
        const lineY = line.yPercent ?? 15;
        const lineW = line.widthPercent ?? 20;
        const lineH = line.heightPercent ?? 2.4;

        // Detect checkbox patterns like "[ ]", "[_]", "☐"
        if (/^(\[\s*\]|\[\s*_\s*\]|\(\s*\)|☐)\s*(.+)$/i.test(raw)) {
          const match = raw.match(/^(\[\s*\]|\[\s*_\s*\]|\(\s*\)|☐)\s*(.+)$/i);
          const cleanLabel = (match?.[2] || raw).replace(/[^a-zA-Z0-9_ ]/g, '').trim();
          const slug = cleanLabel.toLowerCase().replace(/\s+/g, '_').slice(0, 28) || `checkbox_${pNum}_${i}`;
          const isRadio = raw.startsWith('(');
          candidates.push({
            id: `cand_lbl_${pNum}_${i}`,
            pageNumber: pNum,
            fieldName: slug,
            label: cleanLabel || 'Checkbox Option',
            fieldType: isRadio ? 'form-radio' : 'form-checkbox',
            xPercent: Math.max(2, Math.round((lineX - 0.5) * 10) / 10),
            yPercent: Math.max(2, Math.round((lineY - 0.2) * 10) / 10),
            widthPercent: 2.8,
            heightPercent: 2.2,
            source: 'detected-label',
            checked: false,
            radioGroupName: isRadio ? `radio_group_p${pNum}` : undefined,
            radioOptionValue: isRadio ? slug : undefined,
          });
          continue;
        }

        // Detect Signature labels
        if (
          /\b(signature|sign here|authorized signer|client signature|representative signature)\b/i.test(lower) &&
          raw.length < 65
        ) {
          const slug = `signature_p${pNum}_${i + 1}`;
          const placeRight = lineX + lineW < 62;
          candidates.push({
            id: `cand_sig_${pNum}_${i}`,
            pageNumber: pNum,
            fieldName: `Sig_${slug}`,
            label: raw.replace(/[:_]+$/, '').trim() || 'Signature',
            fieldType: 'form-signature',
            xPercent: placeRight ? Math.min(72, Math.round((lineX + lineW + 1.5) * 10) / 10) : Math.round(lineX * 10) / 10,
            yPercent: placeRight ? Math.max(2, Math.round((lineY - 1.2) * 10) / 10) : Math.min(92, Math.round((lineY + lineH + 0.8) * 10) / 10),
            widthPercent: 26,
            heightPercent: 5.5,
            source: 'detected-label',
          });
          continue;
        }

        // Detect standard field labels ending with ':' or followed by underscores '___'
        const labelMatch = raw.match(
          /^(full name|first name|last name|name|client|company|organization|title|role|email|e-mail|phone|tel|address|street|city|state|zip|postal code|country|date|effective date|invoice #|account #|department|status|category|amount|total|notes|comments|description)\s*[:_-]?\s*(_+)?$/i
        );
        if (labelMatch) {
          const fieldKey = labelMatch[1].toLowerCase();
          const slug = `${fieldKey.replace(/[^a-z0-9]+/g, '_')}_p${pNum}_${i + 1}`;
          const isMulti = fieldKey === 'notes' || fieldKey === 'comments' || fieldKey === 'description';
          const isDropdown = fieldKey === 'status' || fieldKey === 'category';
          const placeRight = !isMulti && lineX + lineW < 68;

          candidates.push({
            id: `cand_txt_${pNum}_${i}`,
            pageNumber: pNum,
            fieldName: slug,
            label: labelMatch[1],
            fieldType: isMulti ? 'form-multiline' : isDropdown ? 'form-dropdown' : 'form-text',
            xPercent: placeRight ? Math.min(70, Math.round((lineX + lineW + 1.5) * 10) / 10) : Math.round(lineX * 10) / 10,
            yPercent: placeRight ? Math.max(2, Math.round((lineY - 0.4) * 10) / 10) : Math.min(90, Math.round((lineY + lineH + 0.6) * 10) / 10),
            widthPercent: isMulti ? 45 : 28,
            heightPercent: isMulti ? 7.5 : 3.2,
            source: 'detected-label',
            dropdownOptions: isDropdown ? ['Active', 'Pending', 'Completed', 'Archived'] : undefined,
          });
        }
      }
    } catch {
      // Ignore text extraction error on individual page
    }
  }

  return candidates;
}

/**
 * Renders thumbnails for a PDF using PDF.js.
 */
export async function renderPdfThumbnails(
  bytes: Uint8Array,
  scale = 0.35,
  maxPagesToRender = 500
): Promise<PageThumbnailInfo[]> {
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({ data: bytes.slice(0) });
  const pdf = await loadingTask.promise;
  const total = Math.min(pdf.numPages, maxPagesToRender);
  const effectiveScale = total > 25 ? Math.min(scale, 0.22) : scale;
  const results: PageThumbnailInfo[] = [];

  for (let pageNum = 1; pageNum <= total; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: effectiveScale });
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
      dataUrl: canvas.toDataURL('image/jpeg', 0.8),
    });
  }

  return results;
}

export interface RenderSinglePageResult {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  unscaledWidthPt: number;
  unscaledHeightPt: number;
  rotation: number;
}

/**
 * Renders a single PDF page at high resolution to a data URL.
 */
export async function renderSinglePageDataUrl(
  bytes: Uint8Array,
  pageNumber: number,
  scale?: number,
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp',
  quality?: number
): Promise<RenderSinglePageResult>;
export async function renderSinglePageDataUrl(
  bytes: Uint8Array,
  pageNumber: number,
  scale?: number,
  rotation?: number,
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp',
  quality?: number
): Promise<RenderSinglePageResult>;
export async function renderSinglePageDataUrl(
  bytes: Uint8Array,
  pageNumber: number,
  scale = 1.5,
  arg4: number | 'image/jpeg' | 'image/png' | 'image/webp' = 0,
  arg5?: number | 'image/jpeg' | 'image/png' | 'image/webp',
  arg6 = 0.92
): Promise<RenderSinglePageResult> {
  let rotation = 0;
  let effectiveMime: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/png';
  let effectiveQuality = 0.92;

  if (typeof arg4 === 'number') {
    rotation = arg4;
    if (typeof arg5 === 'string') {
      effectiveMime = arg5;
    }
    if (typeof arg6 === 'number') {
      effectiveQuality = arg6;
    }
  } else if (typeof arg4 === 'string') {
    effectiveMime = arg4;
    if (typeof arg5 === 'number') {
      effectiveQuality = arg5;
    }
  }

  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({ data: bytes.slice(0) });
  const pdf = await loadingTask.promise;
  const clampedPage = Math.max(1, Math.min(pdf.numPages, pageNumber));
  const page = await pdf.getPage(clampedPage);
  const totalRotation = ((page.rotate || 0) + (rotation || 0)) % 360;
  const viewport = page.getViewport({ scale, rotation: totalRotation });
  const unscaled = page.getViewport({ scale: 1.0, rotation: totalRotation });

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
    dataUrl: canvas.toDataURL(effectiveMime, effectiveQuality),
    widthPx: canvas.width,
    heightPx: canvas.height,
    unscaledWidthPt: Math.round(unscaled.width),
    unscaledHeightPt: Math.round(unscaled.height),
    rotation: totalRotation,
  };
}

function multiplyAffineMatrices(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

function rgbFloatsToHex(r: number, g: number, b: number): string {
  const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  const toHex = (n: number) => clampByte(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface StreamFontInfo {
  fontFamily: 'Helvetica' | 'TimesRoman' | 'Courier';
  isBold: boolean;
  isItalic: boolean;
}

interface StreamTextStyleHint {
  x: number;
  y: number;
  text: string;
  fontFamily: 'Helvetica' | 'TimesRoman' | 'Courier';
  isBold: boolean;
  isItalic: boolean;
  colorHex: string;
}

function collectPageRawStreams(pdfDoc: PDFDocument, page: PDFPage): PDFRawStream[] {
  const rawStreams: PDFRawStream[] = [];
  const contentsEntry = page.node.Contents();
  if (contentsEntry instanceof PDFRef) {
    const lookedUp = pdfDoc.context.lookup(contentsEntry);
    if (lookedUp instanceof PDFRawStream) rawStreams.push(lookedUp);
  } else if (contentsEntry instanceof PDFArray) {
    for (let i = 0; i < contentsEntry.size(); i++) {
      const item = contentsEntry.get(i);
      const lookedUp = item instanceof PDFRef ? pdfDoc.context.lookup(item) : item;
      if (lookedUp instanceof PDFRawStream) rawStreams.push(lookedUp);
    }
  } else if (contentsEntry instanceof PDFRawStream) {
    rawStreams.push(contentsEntry);
  }

  // Also inspect Form XObjects (/Resources -> /XObject -> /Subtype /Form)
  try {
    const resources = page.node.Resources();
    const xObjectDict = resources ? pdfDoc.context.lookupMaybe(resources.get(PDFName.of('XObject')), PDFDict) : undefined;
    if (xObjectDict) {
      for (const [, val] of xObjectDict.entries()) {
        const looked = val instanceof PDFRef ? pdfDoc.context.lookup(val) : val;
        if (looked instanceof PDFRawStream) {
          const subtype = looked.dict.get(PDFName.of('Subtype'));
          if (subtype === PDFName.of('Form')) {
            rawStreams.push(looked);
          }
        }
      }
    }
  } catch {
    // Ignore malformed XObject resources
  }

  return rawStreams;
}

function extractPageFontResourceMap(pdfDoc: PDFDocument, page: PDFPage): Map<string, StreamFontInfo> {
  const map = new Map<string, StreamFontInfo>();
  try {
    const resources = page.node.Resources();
    if (!resources) return map;
    const fontDict = pdfDoc.context.lookupMaybe(resources.get(PDFName.of('Font')), PDFDict);
    if (!fontDict) return map;

    for (const [keyName, val] of fontDict.entries()) {
      const cleanKey = keyName.decodeText().replace(/^\//, '');
      const fDict = val instanceof PDFRef ? pdfDoc.context.lookupMaybe(val, PDFDict) : val instanceof PDFDict ? val : undefined;
      if (!fDict) continue;
      const baseFontObj = fDict.get(PDFName.of('BaseFont'));
      const baseFontRaw =
        baseFontObj instanceof PDFName
          ? baseFontObj.decodeText()
          : baseFontObj instanceof PDFString || baseFontObj instanceof PDFHexString
            ? baseFontObj.decodeText()
            : String(baseFontObj || '');
      const lower = baseFontRaw.toLowerCase();

      let fontFamily: 'Helvetica' | 'TimesRoman' | 'Courier' = 'Helvetica';
      if (lower.includes('courier') || lower.includes('mono') || lower.includes('consolas')) {
        fontFamily = 'Courier';
      } else if ((lower.includes('times') || lower.includes('serif') || lower.includes('georgia') || lower.includes('roman')) && !lower.includes('sans')) {
        fontFamily = 'TimesRoman';
      }
      const isBold = lower.includes('bold') || lower.includes('black') || lower.includes('heavy') || lower.includes('demi');
      const isItalic = lower.includes('italic') || lower.includes('oblique');
      map.set(cleanKey, { fontFamily, isBold, isItalic });
    }
  } catch {
    // Ignore malformed font dict
  }
  return map;
}

function extractPageStreamTextStyleHints(pdfDoc: PDFDocument, page: PDFPage): StreamTextStyleHint[] {
  const hints: StreamTextStyleHint[] = [];
  const fontMap = extractPageFontResourceMap(pdfDoc, page);
  const rawStreams = collectPageRawStreams(pdfDoc, page);

  let ctm = [1, 0, 0, 1, 0, 0];
  let fillHex = '#0f172a';
  let activeFontKey = '';
  let activeFontSize = 12;
  let activeLeading = 14;
  const stateStack: Array<{
    ctm: number[];
    fillHex: string;
    activeFontKey: string;
    activeFontSize: number;
    activeLeading: number;
  }> = [];

  const streamOpRegex =
    /\b(q|Q|BT|ET)\b|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(cm|Tm)\b|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+rg\b|(-?\d+(?:\.\d+)?)\s+g\b|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+k\b|\/([^\s/()<>[\]{}]+)\s+(-?\d+(?:\.\d+)?)\s+Tf\b|(-?\d+(?:\.\d+)?)\s+TL\b|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(T[dD])\b|\b(T\*)\b|<([0-9A-Fa-f\s]*)>\s*Tj\b|\(((?:\\.|[^\\()])*)\)\s*(Tj|')\b|\[([\s\S]*?)\]\s*TJ\b/g;

  for (const rawStream of rawStreams) {
    try {
      const decodedBytes = decodePDFRawStream(rawStream).decode();
      let contentStr = '';
      const chunkSize = 8192;
      for (let i = 0; i < decodedBytes.length; i += chunkSize) {
        contentStr += String.fromCharCode(...decodedBytes.subarray(i, i + chunkSize));
      }

      let tm = [1, 0, 0, 1, 0, 0];
      let tlm = [1, 0, 0, 1, 0, 0];
      let m: RegExpExecArray | null;

      while ((m = streamOpRegex.exec(contentStr)) !== null) {
        const simpleOp = m[1];
        if (simpleOp === 'q') {
          stateStack.push({
            ctm: [...ctm],
            fillHex,
            activeFontKey,
            activeFontSize,
            activeLeading,
          });
          continue;
        }
        if (simpleOp === 'Q') {
          const popped = stateStack.pop();
          if (popped) {
            ctm = popped.ctm;
            fillHex = popped.fillHex;
            activeFontKey = popped.activeFontKey;
            activeFontSize = popped.activeFontSize;
            activeLeading = popped.activeLeading;
          }
          continue;
        }
        if (simpleOp === 'BT') {
          tm = [1, 0, 0, 1, 0, 0];
          tlm = [1, 0, 0, 1, 0, 0];
          continue;
        }
        if (simpleOp === 'ET') {
          continue;
        }

        const matOp = m[8];
        if (matOp === 'cm') {
          const mat = [
            parseFloat(m[2]),
            parseFloat(m[3]),
            parseFloat(m[4]),
            parseFloat(m[5]),
            parseFloat(m[6]),
            parseFloat(m[7]),
          ];
          ctm = multiplyAffineMatrices(mat, ctm);
          continue;
        }
        if (matOp === 'Tm') {
          tm = [
            parseFloat(m[2]),
            parseFloat(m[3]),
            parseFloat(m[4]),
            parseFloat(m[5]),
            parseFloat(m[6]),
            parseFloat(m[7]),
          ];
          tlm = [...tm];
          continue;
        }

        if (m[9] !== undefined && m[10] !== undefined && m[11] !== undefined) {
          fillHex = rgbFloatsToHex(parseFloat(m[9]), parseFloat(m[10]), parseFloat(m[11]));
          continue;
        }
        if (m[12] !== undefined) {
          const gVal = parseFloat(m[12]);
          fillHex = rgbFloatsToHex(gVal, gVal, gVal);
          continue;
        }
        if (m[13] !== undefined && m[14] !== undefined && m[15] !== undefined && m[16] !== undefined) {
          const c = parseFloat(m[13]);
          const mag = parseFloat(m[14]);
          const yel = parseFloat(m[15]);
          const kVal = parseFloat(m[16]);
          fillHex = rgbFloatsToHex((1 - c) * (1 - kVal), (1 - mag) * (1 - kVal), (1 - yel) * (1 - kVal));
          continue;
        }
        if (m[17] !== undefined && m[18] !== undefined) {
          activeFontKey = m[17];
          activeFontSize = Math.abs(parseFloat(m[18])) || 12;
          continue;
        }
        if (m[19] !== undefined) {
          activeLeading = parseFloat(m[19]) || activeLeading;
          continue;
        }
        if (m[20] !== undefined && m[21] !== undefined && m[22]) {
          const tx = parseFloat(m[20]) || 0;
          const ty = parseFloat(m[21]) || 0;
          if (m[22] === 'TD') {
            activeLeading = -ty;
          }
          tlm = multiplyAffineMatrices([1, 0, 0, 1, tx, ty], tlm);
          tm = [...tlm];
          continue;
        }
        if (m[23] === 'T*') {
          tlm = multiplyAffineMatrices([1, 0, 0, 1, 0, -activeLeading], tlm);
          tm = [...tlm];
          continue;
        }

        let decoded = '';
        if (m[24] !== undefined) {
          decoded = decodeHexPdfOperand(m[24]);
        } else if (m[25] !== undefined) {
          if (m[26] === "'") {
            tlm = multiplyAffineMatrices([1, 0, 0, 1, 0, -activeLeading], tlm);
            tm = [...tlm];
          }
          decoded = decodeLiteralPdfOperand(m[25]);
        } else if (m[27] !== undefined) {
          decoded = decodeArrayPdfOperand(m[27]);
        } else {
          continue;
        }

        if (decoded.trim().length > 0) {
          const eff = multiplyAffineMatrices(tm, ctm);
          const fInfo = fontMap.get(activeFontKey) || {
            fontFamily: 'Helvetica',
            isBold: false,
            isItalic: false,
          };
          hints.push({
            x: eff[4],
            y: eff[5],
            text: decoded.trim(),
            fontFamily: fInfo.fontFamily,
            isBold: fInfo.isBold,
            isItalic: fInfo.isItalic,
            colorHex: fillHex,
          });
        }
      }
    } catch {
      // Ignore stream decode error
    }
  }

  return hints;
}

/**
 * Extracts structured text lines and coordinates from all pages of a PDF using PDF.js,
 * enriched with exact font family, bold/italic flags, and RGB fill colors from pdf-lib content stream inspection.
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

  let pdfLibDoc: PDFDocument | null = null;
  try {
    pdfLibDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    pdfLibDoc = null;
  }

  const pageTexts: string[] = [];
  const allLines: ExtractedTextLine[] = [];
  const tables: string[][][] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const unscaled = page.getViewport({ scale: 1.0 });
    const pageWidthPt = Math.max(72, Math.round(unscaled.width * 100) / 100);
    const pageHeightPt = Math.max(72, Math.round(unscaled.height * 100) / 100);
    const textContent = await page.getTextContent();
    const stylesMap = (textContent as unknown as { styles?: Record<string, { fontFamily?: string }> }).styles || {};

    const streamHints: StreamTextStyleHint[] =
      pdfLibDoc && p <= pdfLibDoc.getPageCount()
        ? extractPageStreamTextStyleHints(pdfLibDoc, pdfLibDoc.getPage(p - 1))
        : [];

    interface RawGlyphRun {
      str: string;
      x: number;
      y: number;
      width: number;
      height: number;
      fontSize: number;
      fontFamily: 'Helvetica' | 'TimesRoman' | 'Courier';
      isBold: boolean;
      isItalic: boolean;
      colorHex: string;
    }

    const runs: RawGlyphRun[] = [];
    for (const item of textContent.items) {
      if ('str' in item && item.str.trim().length > 0) {
        const tx = item.transform;
        const fontSize = Math.max(6, Math.round(Math.hypot(tx[0], tx[1]) * 10) / 10);
        const fontNameRaw = String(item.fontName || '').toLowerCase();
        const styleFamRaw = String(stylesMap[item.fontName]?.fontFamily || '').toLowerCase();
        const combinedFontHint = `${fontNameRaw} ${styleFamRaw}`;

        let fontFamily: 'Helvetica' | 'TimesRoman' | 'Courier' = 'Helvetica';
        if (combinedFontHint.includes('courier') || combinedFontHint.includes('mono')) {
          fontFamily = 'Courier';
        } else if (
          (combinedFontHint.includes('times') || combinedFontHint.includes('serif')) &&
          !combinedFontHint.includes('sans')
        ) {
          fontFamily = 'TimesRoman';
        }

        let isBold =
          combinedFontHint.includes('bold') ||
          combinedFontHint.includes('black') ||
          combinedFontHint.includes('heavy');
        let isItalic =
          combinedFontHint.includes('italic') ||
          combinedFontHint.includes('oblique') ||
          Math.abs(tx[2]) > 0.05;
        let colorHex = '#0f172a';

        const runX = Math.round(tx[4] * 100) / 100;
        const runY = Math.round(tx[5] * 100) / 100;

        // Match against PDF content stream style hints for exact /BaseFont weight and RGB fill color
        const matchedHint = streamHints.find(
          (h) =>
            Math.abs(h.y - runY) <= 5 &&
            Math.abs(h.x - runX) <= 18 &&
            (h.text === item.str.trim() ||
              h.text.includes(item.str.trim()) ||
              item.str.trim().includes(h.text))
        );
        if (matchedHint) {
          fontFamily = matchedHint.fontFamily;
          isBold = matchedHint.isBold || isBold;
          isItalic = matchedHint.isItalic || isItalic;
          colorHex = matchedHint.colorHex;
        }

        runs.push({
          str: item.str,
          x: runX,
          y: runY,
          width: Math.max(4, Math.round((item.width || item.str.length * fontSize * 0.5) * 100) / 100),
          height: Math.max(fontSize, Math.round((item.height || fontSize) * 100) / 100),
          fontSize,
          fontFamily,
          isBold,
          isItalic,
          colorHex,
        });
      }
    }

    // Group runs into horizontal rows by Y-coordinate tolerance (within 4 points)
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
    let pageSegmentIdx = 0;

    groupedRows.forEach((rowRuns) => {
      rowRuns.sort((a, b) => a.x - b.x);
      const fullRowText = rowRuns.map((r) => r.str).join(' ');
      pageLineStrings.push(fullRowText);

      // Split row into independent column/cell segments when horizontal gap exceeds ~1.8x font size (min 18pt)
      const segments: RawGlyphRun[][] = [];
      for (const r of rowRuns) {
        if (segments.length === 0) {
          segments.push([r]);
        } else {
          const currentSeg = segments[segments.length - 1];
          const prevRun = currentSeg[currentSeg.length - 1];
          const prevRight = prevRun.x + prevRun.width;
          const gapPt = r.x - prevRight;
          const splitThreshold = Math.max(18, prevRun.fontSize * 1.85);
          if (gapPt > splitThreshold) {
            segments.push([r]);
          } else {
            currentSeg.push(r);
          }
        }
      }

      if (segments.length >= 2) {
        pageTableRows.push(segments.map((seg) => seg.map((r) => r.str).join(' ').trim()));
      } else {
        const splitCells = fullRowText
          .split(/\s{2,}|\|/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (splitCells.length >= 2) {
          pageTableRows.push(splitCells);
        }
      }

      for (const segRuns of segments) {
        const segText = segRuns.map((r) => r.str).join(' ');
        const first = segRuns[0];
        const last = segRuns[segRuns.length - 1];
        const totalWidth = Math.round(Math.max(first.width, last.x + last.width - first.x) * 100) / 100;
        const ascentPt = first.fontSize * 0.85;
        const descentPt = first.fontSize * 0.25;
        const boxHeightPt = Math.max(first.height, ascentPt + descentPt);
        const topFromPageTopPt = Math.max(0, pageHeightPt - (first.y + ascentPt));

        const xPercent = Math.round(Math.max(0, Math.min(99, (first.x / pageWidthPt) * 100)) * 100) / 100;
        const yPercent = Math.round(Math.max(0, Math.min(99, (topFromPageTopPt / pageHeightPt) * 100)) * 100) / 100;
        const widthPercent = Math.round(Math.max(1.2, Math.min(100 - xPercent, (totalWidth / pageWidthPt) * 100)) * 100) / 100;
        const heightPercent = Math.round(Math.max(1.2, Math.min(50, (boxHeightPt / pageHeightPt) * 100)) * 100) / 100;

        allLines.push({
          id: `p${p}-l${pageSegmentIdx++}`,
          pageNumber: p,
          text: segText,
          originalText: segText,
          x: first.x,
          y: first.y,
          width: totalWidth,
          height: first.height,
          fontSize: first.fontSize,
          pageWidthPt,
          pageHeightPt,
          fontFamily: first.fontFamily,
          isBold: first.isBold,
          isItalic: first.isItalic,
          colorHex: first.colorHex,
          xPercent,
          yPercent,
          widthPercent,
          heightPercent,
        });
      }
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

  if (targetIndices.length === 0) {
    throw new Error('No valid pages matched the selected page range.');
  }

  for (const idx of targetIndices) {
    const page = pdfDoc.getPage(idx);
    const box = page.getCropBox();
    const top = Math.max(0, Number(marginsPt.top) || 0);
    const right = Math.max(0, Number(marginsPt.right) || 0);
    const bottom = Math.max(0, Number(marginsPt.bottom) || 0);
    const left = Math.max(0, Number(marginsPt.left) || 0);

    if (left + right >= box.width - 18 || top + bottom >= box.height - 18) {
      throw new Error(
        `Crop margins on page ${idx + 1} exceed the available page dimensions (${Math.round(box.width)} × ${Math.round(box.height)} pt).`
      );
    }

    const newX = box.x + left;
    const newY = box.y + bottom;
    const newW = Math.max(18, box.width - left - right);
    const newH = Math.max(18, box.height - top - bottom);
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

interface TextRemovalTarget {
  id: string;
  originalText: string;
  originXPt?: number;
  originYPt?: number;
  originWidthPt?: number;
  fontSize?: number;
}

function normalizeForStreamMatch(str: string): string {
  return str.replace(/\s+/g, ' ').trim().toLowerCase();
}

function decodeHexPdfOperand(hexRaw: string): string {
  const clean = hexRaw.replace(/\s+/g, '');
  if (!clean) return '';
  if (clean.length % 4 === 0 && (clean.startsWith('00') || clean.startsWith('feff') || clean.startsWith('FEFF'))) {
    let out = '';
    const startIdx = clean.toLowerCase().startsWith('feff') ? 4 : 0;
    for (let i = startIdx; i < clean.length; i += 4) {
      const code = parseInt(clean.slice(i, i + 4), 16);
      if (Number.isFinite(code) && code > 0) {
        out += String.fromCharCode(code);
      }
    }
    if (out.trim().length > 0) return out;
  }
  let out = '';
  for (let i = 0; i < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i + 2), 16);
    if (Number.isFinite(code) && code > 0) {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

function decodeLiteralPdfOperand(litRaw: string): string {
  return litRaw
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

function decodeArrayPdfOperand(arrRaw: string): string {
  let out = '';
  const tokenRegex = /<([0-9A-Fa-f\s]*)>|\(((?:\\.|[^\\()])*)\)|(-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(arrRaw)) !== null) {
    if (m[1] !== undefined) {
      out += decodeHexPdfOperand(m[1]);
    } else if (m[2] !== undefined) {
      out += decodeLiteralPdfOperand(m[2]);
    } else if (m[3] !== undefined) {
      const kern = parseFloat(m[3]);
      if (kern < -180 && !out.endsWith(' ')) {
        out += ' ';
      }
    }
  }
  return out;
}

/**
 * Surgically removes a target cell/token from a multi-column `[...] TJ` array operand
 * while preserving the exact horizontal kerning position of subsequent columns on the same row.
 */
function surgicallyStripTargetFromTJArray(
  arrRaw: string,
  pageStartX: number,
  effectiveFontSize: number,
  target: TextRemovalTarget
): { replacedArr: string; didStrip: boolean } {
  interface TjPiece {
    raw: string;
    isString: boolean;
    decoded: string;
    kernVal: number;
  }

  const pieces: TjPiece[] = [];
  const tokenRegex = /<([0-9A-Fa-f\s]*)>|\(((?:\\.|[^\\()])*)\)|(-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(arrRaw)) !== null) {
    if (m[1] !== undefined) {
      pieces.push({
        raw: m[0],
        isString: true,
        decoded: decodeHexPdfOperand(m[1]),
        kernVal: 0,
      });
    } else if (m[2] !== undefined) {
      pieces.push({
        raw: m[0],
        isString: true,
        decoded: decodeLiteralPdfOperand(m[2]),
        kernVal: 0,
      });
    } else if (m[3] !== undefined) {
      pieces.push({
        raw: m[0],
        isString: false,
        decoded: '',
        kernVal: parseFloat(m[3]) || 0,
      });
    }
  }

  if (pieces.length === 0) return { replacedArr: arrRaw, didStrip: false };

  // Group pieces into column runs separated by large negative kerning shifts (< -180)
  interface TjSegment {
    pieces: TjPiece[];
    text: string;
    startX: number;
    advanceThousandths: number;
  }

  const segments: TjSegment[] = [];
  let currentPieces: TjPiece[] = [];
  let currentText = '';
  let runningX = pageStartX;
  let segStartX = pageStartX;
  let segAdvanceThousandths = 0;

  const flushSegment = () => {
    if (currentPieces.length > 0) {
      segments.push({
        pieces: currentPieces,
        text: currentText,
        startX: segStartX,
        advanceThousandths: segAdvanceThousandths,
      });
      currentPieces = [];
      currentText = '';
      segAdvanceThousandths = 0;
    }
  };

  for (const p of pieces) {
    if (!p.isString && p.kernVal < -180 && currentText.trim().length > 0) {
      flushSegment();
      // The large negative kerning piece itself bridges to the next segment
      const kernAdvancePt = (-p.kernVal / 1000) * effectiveFontSize;
      runningX += kernAdvancePt;
      segments.push({
        pieces: [p],
        text: '',
        startX: runningX,
        advanceThousandths: p.kernVal,
      });
      segStartX = runningX;
      continue;
    }

    if (currentPieces.length === 0) {
      segStartX = runningX;
    }
    currentPieces.push(p);
    if (p.isString) {
      currentText += p.decoded;
      const charAdvThousandths = -p.decoded.length * 520;
      segAdvanceThousandths += charAdvThousandths;
      runningX += p.decoded.length * effectiveFontSize * 0.52;
    } else {
      segAdvanceThousandths += p.kernVal;
      runningX += (-p.kernVal / 1000) * effectiveFontSize;
    }
  }
  flushSegment();

  const normTarget = normalizeForStreamMatch(target.originalText);
  if (!normTarget) return { replacedArr: arrRaw, didStrip: false };

  let didStrip = false;
  const outTokens: string[] = [];

  for (const seg of segments) {
    const normSeg = normalizeForStreamMatch(seg.text);
    const xMatches =
      typeof target.originXPt === 'number'
        ? Math.abs(seg.startX - target.originXPt) <= Math.max(24, (target.originWidthPt || 40) + 16)
        : true;

    if (normSeg && normSeg === normTarget && xMatches && !didStrip) {
      didStrip = true;
      // Replace the removed string glyphs with an equivalent negative kerning shift so following columns do not shift left
      const replacementKern = Math.round(seg.advanceThousandths);
      if (replacementKern !== 0) {
        outTokens.push(`${replacementKern}`);
      }
    } else {
      for (const p of seg.pieces) {
        outTokens.push(p.raw);
      }
    }
  }

  return {
    replacedArr: outTokens.join(' '),
    didStrip,
  };
}

/**
 * Removes original PDF text operators (`Tj` / `TJ` / `'`) from a page's content stream(s)
 * when existing text is edited or deleted, while 100% preserving all vector background fills,
 * table cell colors, borders, gradients, watermarks, and images.
 */
function removeOriginalTextFromPageContentStreams(
  pdfDoc: PDFDocument,
  page: PDFPage,
  targets: TextRemovalTarget[]
): Set<string> {
  const removedIds = new Set<string>();
  if (targets.length === 0) return removedIds;

  const rawStreams = collectPageRawStreams(pdfDoc, page);
  if (rawStreams.length === 0) return removedIds;

  // Track CTM (`cm`) and graphics state (`q`/`Q`) across the page stream(s)
  let ctm = [1, 0, 0, 1, 0, 0];
  let activeFontSize = 12;
  let activeLeading = 14;
  const stateStack: Array<{
    ctm: number[];
    activeFontSize: number;
    activeLeading: number;
  }> = [];

  const innerTokenRegex =
    /\/([^\s/()<>[\]{}]+)\s+(-?\d+(?:\.\d+)?)\s+Tf\b|(-?\d+(?:\.\d+)?)\s+TL\b|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Tm\b|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(T[dD])\b|\b(T\*)\b|<([0-9A-Fa-f\s]*)>\s*Tj\b|\(((?:\\.|[^\\()])*)\)\s*(Tj|')\b|\[([\s\S]*?)\]\s*TJ\b/g;

  for (const rawStream of rawStreams) {
    try {
      const decodedBytes = decodePDFRawStream(rawStream).decode();
      let contentStr = '';
      const chunkSize = 8192;
      for (let i = 0; i < decodedBytes.length; i += chunkSize) {
        contentStr += String.fromCharCode(...decodedBytes.subarray(i, i + chunkSize));
      }

      let streamChanged = false;

      // Scan top-level chunks (outside and inside BT...ET) so CTM `cm` and `q`/`Q` are accurately tracked
      const blockRegex =
        /\b(q|Q)\b|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+cm\b|\bBT\b([\s\S]*?)\bET\b/g;

      const updatedContent = contentStr.replace(
        blockRegex,
        (
          fullMatch,
          qOp,
          cmA,
          cmB,
          cmC,
          cmD,
          cmE,
          cmF,
          btInner: string | undefined
        ) => {
          if (qOp === 'q') {
            stateStack.push({
              ctm: [...ctm],
              activeFontSize,
              activeLeading,
            });
            return fullMatch;
          }
          if (qOp === 'Q') {
            const popped = stateStack.pop();
            if (popped) {
              ctm = popped.ctm;
              activeFontSize = popped.activeFontSize;
              activeLeading = popped.activeLeading;
            }
            return fullMatch;
          }
          if (cmA !== undefined && cmF !== undefined) {
            const mat = [
              parseFloat(cmA),
              parseFloat(cmB),
              parseFloat(cmC),
              parseFloat(cmD),
              parseFloat(cmE),
              parseFloat(cmF),
            ];
            ctm = multiplyAffineMatrices(mat, ctm);
            return fullMatch;
          }

          if (btInner === undefined) return fullMatch;

          let tm = [1, 0, 0, 1, 0, 0];
          let tlm = [1, 0, 0, 1, 0, 0];
          let hasPositioned = false;

          const replacedInner = btInner.replace(
            innerTokenRegex,
            (
              match,
              _tfFont,
              tfSize,
              tlVal,
              tmA,
              tmB,
              tmC,
              tmD,
              tmE,
              tmF,
              tdX,
              tdY,
              tdOp,
              tStar,
              hexTj,
              litTj,
              litOp,
              arrTJ
            ) => {
              if (tfSize !== undefined) {
                activeFontSize = Math.abs(parseFloat(tfSize)) || 12;
                return match;
              }
              if (tlVal !== undefined) {
                activeLeading = parseFloat(tlVal) || activeLeading;
                return match;
              }
              if (tmE !== undefined && tmF !== undefined) {
                tm = [
                  parseFloat(tmA) || 1,
                  parseFloat(tmB) || 0,
                  parseFloat(tmC) || 0,
                  parseFloat(tmD) || 1,
                  parseFloat(tmE) || 0,
                  parseFloat(tmF) || 0,
                ];
                tlm = [...tm];
                hasPositioned = true;
                return match;
              }
              if (tdX !== undefined && tdY !== undefined) {
                const tx = parseFloat(tdX) || 0;
                const ty = parseFloat(tdY) || 0;
                if (tdOp === 'TD') {
                  activeLeading = -ty;
                }
                tlm = multiplyAffineMatrices([1, 0, 0, 1, tx, ty], tlm);
                tm = [...tlm];
                hasPositioned = true;
                return match;
              }
              if (tStar !== undefined) {
                tlm = multiplyAffineMatrices([1, 0, 0, 1, 0, -activeLeading], tlm);
                tm = [...tlm];
                hasPositioned = true;
                return match;
              }

              let decodedText = '';
              if (hexTj !== undefined) {
                decodedText = decodeHexPdfOperand(hexTj);
              } else if (litTj !== undefined) {
                if (litOp === "'") {
                  tlm = multiplyAffineMatrices([1, 0, 0, 1, 0, -activeLeading], tlm);
                  tm = [...tlm];
                  hasPositioned = true;
                }
                decodedText = decodeLiteralPdfOperand(litTj);
              } else if (arrTJ !== undefined) {
                decodedText = decodeArrayPdfOperand(arrTJ);
              } else {
                return match;
              }

              const eff = multiplyAffineMatrices(tm, ctm);
              const curX = hasPositioned ? eff[4] : null;
              const curY = hasPositioned ? eff[5] : null;
              const effFontSize =
                Math.abs(activeFontSize * Math.hypot(eff[0], eff[1])) ||
                Math.abs(eff[3]) ||
                activeFontSize;

              // Advance tm horizontally for any subsequent Tj/TJ on the same line without an intermediate Td/Tm
              const advanceTextSpace = Math.max(1, decodedText.length) * activeFontSize * 0.5;
              tm = multiplyAffineMatrices([1, 0, 0, 1, advanceTextSpace, 0], tm);

              const normDecoded = normalizeForStreamMatch(decodedText);

              for (const t of targets) {
                const normTarget = normalizeForStreamMatch(t.originalText);
                const yTol = Math.max(6, (t.fontSize || effFontSize || 12) * 0.65);
                const hasCoord = typeof t.originYPt === 'number';
                const sameY =
                  hasCoord && curY !== null ? Math.abs(curY - t.originYPt!) <= yTol : false;
                const sameX =
                  typeof t.originXPt === 'number' && curX !== null
                    ? curX >= t.originXPt - 16 &&
                      curX <= t.originXPt + (t.originWidthPt || 350) + 16
                    : true;
                const sameXTight =
                  typeof t.originXPt === 'number' && curX !== null
                    ? Math.abs(curX - t.originXPt) <= 10
                    : false;

                // 1. Exact or substring match at the target coordinates
                if (sameY && sameX) {
                  // If this is a multi-column TJ array containing more than just the target cell, strip only the target cell
                  if (
                    arrTJ !== undefined &&
                    normDecoded &&
                    normTarget &&
                    normDecoded !== normTarget &&
                    normDecoded.includes(normTarget)
                  ) {
                    const surgical = surgicallyStripTargetFromTJArray(
                      arrTJ,
                      curX ?? t.originXPt ?? 0,
                      effFontSize,
                      t
                    );
                    if (surgical.didStrip) {
                      removedIds.add(t.id);
                      streamChanged = true;
                      return `[${surgical.replacedArr}] TJ`;
                    }
                  }

                  if (
                    !normDecoded ||
                    !normTarget ||
                    normDecoded === normTarget ||
                    normTarget.includes(normDecoded) ||
                    (sameXTight && decodedText.length <= Math.max(3, t.originalText.length + 2))
                  ) {
                    removedIds.add(t.id);
                    streamChanged = true;
                    return litOp === "'" ? "''" : '() Tj';
                  }
                }

                // 2. Multi-column TJ array where the array started earlier on the row (curX < originXPt)
                if (
                  sameY &&
                  arrTJ !== undefined &&
                  normDecoded &&
                  normTarget &&
                  normDecoded !== normTarget &&
                  normDecoded.includes(normTarget)
                ) {
                  const surgical = surgicallyStripTargetFromTJArray(
                    arrTJ,
                    curX ?? 0,
                    effFontSize,
                    t
                  );
                  if (surgical.didStrip) {
                    removedIds.add(t.id);
                    streamChanged = true;
                    return `[${surgical.replacedArr}] TJ`;
                  }
                }

                // 3. Fallback when coordinates are unpositioned or match on same Y
                if (normDecoded.length >= 1 && normTarget.length >= 1 && normDecoded === normTarget) {
                  if (!hasCoord || curY === null || (sameY && sameX)) {
                    removedIds.add(t.id);
                    streamChanged = true;
                    return litOp === "'" ? "''" : '() Tj';
                  }
                }
              }

              return match;
            }
          );

          return `BT${replacedInner}ET`;
        }
      );

      if (streamChanged) {
        const newBytes = new Uint8Array(updatedContent.length);
        for (let i = 0; i < updatedContent.length; i++) {
          newBytes[i] = updatedContent.charCodeAt(i) & 0xff;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (rawStream as any).contents = newBytes;
        rawStream.dict.delete(PDFName.of('Filter'));
        rawStream.dict.delete(PDFName.of('DecodeParms'));
        rawStream.dict.set(PDFName.of('Length'), PDFNumber.of(newBytes.length));
      }
    } catch {
      // Ignore un-decodable stream filter
    }
  }

  return removedIds;
}

/**
 * Strips the original PDF text operators for active `isExistingTextEdit` annotations
 * and returns the modified PDF bytes + list of stripped annotation IDs.
 * Used by the live browser canvas preview so edited text is genuinely removed from the rendered
 * PDF page without placing any destructive white boxes over colored backgrounds or tables.
 */
export async function stripEditedTextFromPdfBytes(
  bytes: Uint8Array,
  annotations: EditorAnnotationItem[],
  onlyPageNumber?: number
): Promise<{ bytes: Uint8Array; removedIds: string[] }> {
  const relevant = annotations.filter(
    (a) =>
      a.isExistingTextEdit &&
      a.originalText &&
      (onlyPageNumber === undefined || a.pageNumber === onlyPageNumber)
  );
  if (relevant.length === 0) {
    return { bytes, removedIds: [] };
  }

  try {
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const allRemoved = new Set<string>();

    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const pageNum = pIdx + 1;
      if (onlyPageNumber !== undefined && pageNum !== onlyPageNumber) continue;
      const pageEdits = relevant.filter((a) => a.pageNumber === pageNum);
      if (pageEdits.length === 0) continue;

      const page = pages[pIdx];
      const mediaBox = page.getMediaBox();
      const { width, height } = page.getSize();

      const targets: TextRemovalTarget[] = pageEdits.map((item) => {
        const fSize = item.fontSize || 12;
        const origXPct = item.originXPercent ?? item.xPercent;
        const origYPct = item.originYPercent ?? item.yPercent;
        const origWPct = item.originWidthPercent ?? item.widthPercent;
        const fallbackOriginXPt = mediaBox.x + (origXPct / 100) * width;
        const fallbackOriginYPt = mediaBox.y + height - (origYPct / 100) * height - fSize * 0.85;
        const fallbackOriginWidthPt = (origWPct / 100) * width;

        return {
          id: item.id,
          originalText: item.originalText || '',
          originXPt: item.originXPt ?? fallbackOriginXPt,
          originYPt: item.originYPt ?? fallbackOriginYPt,
          originWidthPt: item.originWidthPt ?? fallbackOriginWidthPt,
          fontSize: fSize,
        };
      });

      const removedOnPage = removeOriginalTextFromPageContentStreams(pdfDoc, page, targets);
      removedOnPage.forEach((id) => allRemoved.add(id));
    }

    if (allRemoved.size === 0) {
      return { bytes, removedIds: [] };
    }

    const outBytes = await pdfDoc.save({ useObjectStreams: false });
    return { bytes: outBytes, removedIds: Array.from(allRemoved) };
  } catch {
    return { bytes, removedIds: [] };
  }
}

async function resolveStandardPdfFont(
  pdfDoc: PDFDocument,
  cache: Map<string, PDFFont>,
  family = 'Helvetica',
  isBold = false,
  isItalic = false
): Promise<PDFFont> {
  const famLower = family.toLowerCase();
  let stdFont: StandardFonts = StandardFonts.Helvetica;

  if (famLower.includes('times') || famLower.includes('serif')) {
    if (isBold && isItalic) stdFont = StandardFonts.TimesRomanBoldItalic;
    else if (isBold) stdFont = StandardFonts.TimesRomanBold;
    else if (isItalic) stdFont = StandardFonts.TimesRomanItalic;
    else stdFont = StandardFonts.TimesRoman;
  } else if (famLower.includes('courier') || famLower.includes('mono')) {
    if (isBold && isItalic) stdFont = StandardFonts.CourierBoldOblique;
    else if (isBold) stdFont = StandardFonts.CourierBold;
    else if (isItalic) stdFont = StandardFonts.CourierOblique;
    else stdFont = StandardFonts.Courier;
  } else {
    if (isBold && isItalic) stdFont = StandardFonts.HelveticaBoldOblique;
    else if (isBold) stdFont = StandardFonts.HelveticaBold;
    else if (isItalic) stdFont = StandardFonts.HelveticaOblique;
    else stdFont = StandardFonts.Helvetica;
  }

  const existing = cache.get(stdFont);
  if (existing) return existing;
  const embedded = await pdfDoc.embedFont(stdFont);
  cache.set(stdFont, embedded);
  return embedded;
}

/**
 * 10 & 11. Apply Editor Annotations, In-Place Existing Text Replacements (removing original text from content stream),
 * Text Overlays, Watermarks, Stamps, Highlights, Underlines, Strikethroughs, Shapes, Signatures,
 * Blackout Redactions (destroying underlying content stream on redacted pages), and Page Reordering/Rotations/Crops/Deletions.
 */
export async function applyEditorAnnotationsToPdf(
  bytes: Uint8Array,
  annotations: EditorAnnotationItem[],
  pageEdits?: {
    extraRotations?: Record<number, number>; // 1-based pageNumber -> degrees
    deletedPages?: number[]; // 1-based pageNumbers to delete
    pageCrops?: Record<
      number,
      | { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number }
      | { top: number; right: number; bottom: number; left: number }
    >;
    pageSequence?:
      | number[]
      | Array<{
          id?: string;
          type: 'existing' | 'blank';
          originalPageNumber?: number; // 1-based in source PDF
          widthPt?: number;
          heightPt?: number;
          extraRotation?: number;
          cropMarginsPt?: { top: number; right: number; bottom: number; left: number };
        }>;
  }
): Promise<Uint8Array> {
  const workingBytes = bytes;
  const pdfDoc = await PDFDocument.load(workingBytes, { ignoreEncryption: true });
  const fontCache = new Map<string, PDFFont>();
  const fontRegular = await resolveStandardPdfFont(pdfDoc, fontCache, 'Helvetica', false, false);
  const fontBold = await resolveStandardPdfFont(pdfDoc, fontCache, 'Helvetica', true, false);
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

    pdfDoc.removePage(pageIdx);
    const cleanPage = pdfDoc.insertPage(pageIdx, [width, height]);
    if (oldRotation) {
      cleanPage.setRotation(degrees(oldRotation));
    }
    pages[pageIdx] = cleanPage;

    if (typeof document !== 'undefined') {
      const pdfjs = await getPdfJs();
      const loadingTask = pdfjs.getDocument({ data: workingBytes.slice(0) });
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

        for (const rItem of pageRedactions) {
          const rx = (rItem.xPercent / 100) * canvas.width;
          const ry = (rItem.yPercent / 100) * canvas.height;
          const rw = (rItem.widthPercent / 100) * canvas.width;
          const rh = (rItem.heightPercent / 100) * canvas.height;
          ctx.fillStyle = rItem.colorHex || '#000000';
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
      const { lines } = await extractPdfTextAndLines(workingBytes);
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
        const [rr, rg, rb] = hexToRgbTuple(rItem.colorHex || '#000000');
        cleanPage.drawRectangle({
          x: pdfX,
          y: pdfY,
          width: boxW,
          height: boxH,
          color: rgb(rr, rg, rb),
          opacity: 1,
        });
      }
    }
  }

  // Group and execute content-stream text removals per page for all existing-text edits
  const streamRemovedIds = new Set<string>();
  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const pageNum = pIdx + 1;
    const pageExistingEdits = annotations.filter(
      (a) => a.pageNumber === pageNum && a.isExistingTextEdit && a.originalText
    );
    if (pageExistingEdits.length === 0) continue;

    const page = pages[pIdx];
    const mediaBox = page.getMediaBox();
    const { width, height } = page.getSize();

    const targets: TextRemovalTarget[] = pageExistingEdits.map((item) => {
      const fSize = item.fontSize || 12;
      const origXPct = item.originXPercent ?? item.xPercent;
      const origYPct = item.originYPercent ?? item.yPercent;
      const origWPct = item.originWidthPercent ?? item.widthPercent;
      const fallbackOriginXPt = mediaBox.x + (origXPct / 100) * width;
      const fallbackOriginYPt = mediaBox.y + height - (origYPct / 100) * height - fSize * 0.85;
      const fallbackOriginWidthPt = (origWPct / 100) * width;

      return {
        id: item.id,
        originalText: item.originalText || '',
        originXPt: item.originXPt ?? fallbackOriginXPt,
        originYPt: item.originYPt ?? fallbackOriginYPt,
        originWidthPt: item.originWidthPt ?? fallbackOriginWidthPt,
        fontSize: fSize,
      };
    });

    const removedOnPage = removeOriginalTextFromPageContentStreams(pdfDoc, page, targets);
    removedOnPage.forEach((id) => streamRemovedIds.add(id));
  }

  for (const item of annotations) {
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

    const [r, g, b] = hexToRgbTuple(item.colorHex || '#18181B');
    const opacity = typeof item.opacity === 'number' ? item.opacity : 1;

    // IMPORTANT: Handle `isExistingTextEdit` BEFORE generic `item.type === 'text'`
    if (item.isExistingTextEdit) {
      const fSize = item.fontSize || 12;
      const origXPct = item.originXPercent ?? item.xPercent;
      const origYPct = item.originYPercent ?? item.yPercent;
      const origWPct = item.originWidthPercent ?? item.widthPercent;
      const origHPct = item.originHeightPercent ?? item.heightPercent;

      const origBoxW = item.originWidthPt ?? (origWPct / 100) * width;
      const origBoxH = item.originHeightPt ?? (origHPct / 100) * height;
      const origXPt = item.originXPt ?? mediaBox.x + (origXPct / 100) * width;
      const origBaselineYPt =
        item.originYPt ?? mediaBox.y + height - (origYPct / 100) * height - fSize * 0.85;

      const wasRemovedFromStream = streamRemovedIds.has(item.id);
      const bgHex = item.backgroundColorHex || item.fillHex;
      const hasExplicitBg =
        typeof bgHex === 'string' &&
        bgHex.trim().length > 0 &&
        bgHex !== 'transparent' &&
        bgHex !== 'none';

      // NON-DESTRUCTIVE BACKGROUND PRESERVATION:
      // When original text is removed from the PDF content stream (`wasRemovedFromStream === true`),
      // NEVER draw a generic white rectangle over the cell, so colored table cells, borders, gradients,
      // and watermarks remain 100% intact. Only draw a background fill if the user explicitly chose one,
      // or if the page is a scanned raster image (`!wasRemovedFromStream`) with a sampled background color.
      if (hasExplicitBg && (item.backgroundColorHex || !wasRemovedFromStream)) {
        const bgCol = hexToRgbTuple(bgHex);
        page.drawRectangle({
          x: Math.max(mediaBox.x, origXPt - 0.5),
          y: Math.max(mediaBox.y, origBaselineYPt - fSize * 0.2),
          width: Math.max(4, origBoxW + 1),
          height: Math.max(origBoxH * 0.92, fSize * 1.05),
          color: rgb(bgCol[0], bgCol[1], bgCol[2]),
          opacity: 1,
        });
      }

      const rawReplacement = item.text ?? '';
      if (rawReplacement.trim().length > 0) {
        const activeFont = await resolveStandardPdfFont(
          pdfDoc,
          fontCache,
          item.fontFamily || 'Helvetica',
          Boolean(item.isBold),
          Boolean(item.isItalic)
        );

        // If user did not move the text box, anchor directly to exact original baseline (zero rounding drift).
        // If user dragged the text box, apply the exact point delta from the original position.
        const movedX = Math.abs(item.xPercent - origXPct) >= 0.15;
        const movedY = Math.abs(item.yPercent - origYPct) >= 0.15;
        const deltaXPt = movedX ? ((item.xPercent - origXPct) / 100) * width : 0;
        const deltaYPt = movedY ? -((item.yPercent - origYPct) / 100) * height : 0;

        const baseDrawX = origXPt + deltaXPt;
        const baseDrawY = origBaselineYPt + deltaYPt;
        const charSpacing = item.letterSpacingPt || 0;
        const lineMult = item.lineHeightMultiplier || 1.3;
        const linesToDraw = rawReplacement
          .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, ' ')
          .split(/\r?\n/);

        linesToDraw.forEach((lineStr, lIdx) => {
          if (!lineStr) return;
          const lineY = baseDrawY - lIdx * (fSize * lineMult);
          const measuredW =
            activeFont.widthOfTextAtSize(lineStr, fSize) +
            (lineStr.length > 1 ? (lineStr.length - 1) * charSpacing : 0);

          let lineX = baseDrawX;
          if (item.textAlign === 'center') {
            lineX = baseDrawX + Math.max(0, (boxW - measuredW) / 2);
          } else if (item.textAlign === 'right') {
            lineX = baseDrawX + Math.max(0, boxW - measuredW);
          }

          if (charSpacing !== 0) {
            page.pushOperators(setCharacterSpacing(charSpacing));
          }
          page.drawText(lineStr, {
            x: lineX,
            y: lineY,
            size: fSize,
            font: activeFont,
            color: rgb(r, g, b),
            opacity,
          });
          if (charSpacing !== 0) {
            page.pushOperators(setCharacterSpacing(0));
          }

          if (item.isUnderline) {
            page.drawLine({
              start: { x: lineX, y: lineY - fSize * 0.12 },
              end: { x: lineX + measuredW, y: lineY - fSize * 0.12 },
              thickness: Math.max(0.75, fSize * 0.06),
              color: rgb(r, g, b),
              opacity,
            });
          }
          if (item.isStrikethrough) {
            page.drawLine({
              start: { x: lineX, y: lineY + fSize * 0.3 },
              end: { x: lineX + measuredW, y: lineY + fSize * 0.3 },
              thickness: Math.max(0.75, fSize * 0.06),
              color: rgb(r, g, b),
              opacity,
            });
          }
        });
      }
      continue;
    }

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
      } else {
        const bgHex = item.backgroundColorHex || item.fillHex;
        if (bgHex && bgHex !== 'transparent' && bgHex !== 'none') {
          const bgCol = hexToRgbTuple(bgHex);
          page.drawRectangle({
            x: pdfX - 2,
            y: pdfY - 2,
            width: boxW + 4,
            height: boxH + 4,
            color: rgb(bgCol[0], bgCol[1], bgCol[2]),
            opacity,
          });
        }
      }

      const rawText = item.text ?? '';
      if (rawText.trim().length > 0) {
        const activeFont = await resolveStandardPdfFont(
          pdfDoc,
          fontCache,
          item.fontFamily || 'Helvetica',
          Boolean(item.isBold),
          Boolean(item.isItalic)
        );
        const charSpacing = item.letterSpacingPt || 0;
        const lineMult = item.lineHeightMultiplier || 1.3;
        const linesToDraw = rawText
          .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, ' ')
          .split(/\r?\n/);

        const topBaselineY = pdfY + Math.max(0, boxH - fSize * 0.9);
        linesToDraw.forEach((lineStr, lIdx) => {
          if (!lineStr) return;
          const lineY = topBaselineY - lIdx * (fSize * lineMult);
          const measuredW =
            activeFont.widthOfTextAtSize(lineStr, fSize) +
            (lineStr.length > 1 ? (lineStr.length - 1) * charSpacing : 0);

          let lineX = pdfX;
          if (item.textAlign === 'center') {
            lineX = pdfX + Math.max(0, (boxW - measuredW) / 2);
          } else if (item.textAlign === 'right') {
            lineX = pdfX + Math.max(0, boxW - measuredW);
          }

          if (charSpacing !== 0) {
            page.pushOperators(setCharacterSpacing(charSpacing));
          }
          page.drawText(lineStr, {
            x: lineX,
            y: lineY,
            size: fSize,
            font: activeFont,
            color: rgb(r, g, b),
            opacity,
          });
          if (charSpacing !== 0) {
            page.pushOperators(setCharacterSpacing(0));
          }

          if (item.isUnderline) {
            page.drawLine({
              start: { x: lineX, y: lineY - fSize * 0.12 },
              end: { x: lineX + measuredW, y: lineY - fSize * 0.12 },
              thickness: Math.max(0.75, fSize * 0.06),
              color: rgb(r, g, b),
              opacity,
            });
          }
          if (item.isStrikethrough) {
            page.drawLine({
              start: { x: lineX, y: lineY + fSize * 0.3 },
              end: { x: lineX + measuredW, y: lineY + fSize * 0.3 },
              thickness: Math.max(0.75, fSize * 0.06),
              color: rgb(r, g, b),
              opacity,
            });
          }
        });
      }
    } else if (item.type === 'highlight') {
      page.drawRectangle({
        x: pdfX,
        y: pdfY,
        width: boxW,
        height: boxH,
        color: rgb(r, g, b),
        opacity: item.opacity ?? 0.35,
      });
    } else if (item.type === 'underline') {
      page.drawLine({
        start: { x: pdfX, y: pdfY + 2 },
        end: { x: pdfX + boxW, y: pdfY + 2 },
        thickness: Math.max(1.5, item.strokeWidth || 2),
        color: rgb(r, g, b),
        opacity,
      });
    } else if (item.type === 'strikethrough') {
      page.drawLine({
        start: { x: pdfX, y: pdfY + boxH / 2 },
        end: { x: pdfX + boxW, y: pdfY + boxH / 2 },
        thickness: Math.max(1.5, item.strokeWidth || 2),
        color: rgb(r, g, b),
        opacity,
      });
    } else if (
      item.type === 'rectangle' ||
      item.type === 'rounded-rect' ||
      item.type === 'ellipse' ||
      item.type === 'shape' ||
      item.type === 'circle' ||
      item.type === 'triangle' ||
      item.type === 'line' ||
      item.type === 'arrow'
    ) {
      const sType =
        item.shapeType ||
        (item.type === 'circle' || item.type === 'ellipse'
          ? 'ellipse'
          : item.type === 'triangle'
            ? 'triangle'
            : item.type === 'line'
              ? 'line'
              : item.type === 'arrow'
                ? 'arrow'
                : 'rectangle');
      const strokeW = item.strokeWidth ?? 2;
      const strokeCol = item.strokeColorHex ? hexToRgbTuple(item.strokeColorHex) : [r, g, b];
      const strokeRgb = rgb(strokeCol[0], strokeCol[1], strokeCol[2]);
      const rawFill = item.fillColorHex || item.fillHex;
      const hasFill = Boolean(rawFill && rawFill !== 'transparent' && rawFill !== 'none');
      const fillCol = hasFill ? hexToRgbTuple(rawFill!) : null;
      const fillRgb = fillCol ? rgb(fillCol[0], fillCol[1], fillCol[2]) : undefined;

      if (sType === 'ellipse') {
        const radiusX = Math.max(1, boxW / 2);
        const radiusY = Math.max(1, boxH / 2);
        page.drawEllipse({
          x: pdfX + radiusX,
          y: pdfY + radiusY,
          xScale: radiusX,
          yScale: radiusY,
          color: fillRgb,
          borderColor: strokeRgb,
          borderWidth: strokeW,
          opacity,
        });
      } else if (sType === 'triangle') {
        const pTop = { x: pdfX + boxW / 2, y: pdfY + boxH };
        const pRight = { x: pdfX + boxW, y: pdfY };
        const pLeft = { x: pdfX, y: pdfY };
        page.drawLine({ start: pLeft, end: pRight, thickness: strokeW, color: strokeRgb, opacity });
        page.drawLine({ start: pRight, end: pTop, thickness: strokeW, color: strokeRgb, opacity });
        page.drawLine({ start: pTop, end: pLeft, thickness: strokeW, color: strokeRgb, opacity });
      } else if (sType === 'line') {
        page.drawLine({
          start: { x: pdfX, y: pdfY + boxH / 2 },
          end: { x: pdfX + boxW, y: pdfY + boxH / 2 },
          thickness: strokeW,
          color: strokeRgb,
          opacity,
        });
      } else if (sType === 'arrow') {
        const startX = pdfX;
        const startY = pdfY + boxH / 2;
        const endX = pdfX + boxW;
        const endY = pdfY + boxH / 2;
        page.drawLine({
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          thickness: strokeW,
          color: strokeRgb,
          opacity,
        });
        const angle = Math.atan2(endY - startY, endX - startX);
        const headLen = Math.min(14, Math.max(6, strokeW * 3));
        page.drawLine({
          start: { x: endX, y: endY },
          end: {
            x: endX - headLen * Math.cos(angle - Math.PI / 6),
            y: endY - headLen * Math.sin(angle - Math.PI / 6),
          },
          thickness: strokeW,
          color: strokeRgb,
          opacity,
        });
        page.drawLine({
          start: { x: endX, y: endY },
          end: {
            x: endX - headLen * Math.cos(angle + Math.PI / 6),
            y: endY - headLen * Math.sin(angle + Math.PI / 6),
          },
          thickness: strokeW,
          color: strokeRgb,
          opacity,
        });
      } else {
        page.drawRectangle({
          x: pdfX,
          y: pdfY,
          width: boxW,
          height: boxH,
          color: fillRgb,
          borderColor: strokeRgb,
          borderWidth: strokeW,
          opacity,
        });
      }
    } else if (item.type === 'stamp') {
      const stampText = (item.stampLabel || item.text || 'APPROVED')
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
        const rotDeg = item.rotationDeg || 0;
        if (rotDeg !== 0) {
          // Rotate clockwise around center (cx, cy) to match CSS transform-origin: center
          const cx = pdfX + boxW / 2;
          const cy = pdfY + boxH / 2;
          const rad = (-rotDeg * Math.PI) / 180;
          const cosA = Math.cos(rad);
          const sinA = Math.sin(rad);
          const rotX = cx + (-boxW / 2) * cosA - (-boxH / 2) * sinA;
          const rotY = cy + (-boxW / 2) * sinA + (-boxH / 2) * cosA;
          page.drawImage(embeddedImg, {
            x: rotX,
            y: rotY,
            width: boxW,
            height: boxH,
            opacity,
            rotate: degrees(-rotDeg),
          });
        } else {
          page.drawImage(embeddedImg, {
            x: pdfX,
            y: pdfY,
            width: boxW,
            height: boxH,
            opacity,
          });
        }
      }
    } else if (
      item.type === 'symbol-check' ||
      item.type === 'symbol-cross' ||
      item.type === 'symbol-dot' ||
      item.type === 'symbol-circle' ||
      item.type === 'symbol-checkbox'
    ) {
      const symColor = rgb(r, g, b);
      const thickness = Math.max(1.6, Math.min(4, Math.min(boxW, boxH) * 0.14));

      if (item.type === 'symbol-checkbox') {
        page.drawRectangle({
          x: pdfX,
          y: pdfY,
          width: boxW,
          height: boxH,
          borderColor: symColor,
          borderWidth: Math.max(1.2, thickness * 0.75),
          color: rgb(1, 1, 1),
          opacity,
        });
        if (item.checked !== false) {
          page.drawLine({
            start: { x: pdfX + boxW * 0.2, y: pdfY + boxH * 0.48 },
            end: { x: pdfX + boxW * 0.42, y: pdfY + boxH * 0.22 },
            thickness,
            color: symColor,
            opacity,
          });
          page.drawLine({
            start: { x: pdfX + boxW * 0.42, y: pdfY + boxH * 0.22 },
            end: { x: pdfX + boxW * 0.82, y: pdfY + boxH * 0.78 },
            thickness,
            color: symColor,
            opacity,
          });
        }
      } else if (item.type === 'symbol-check') {
        page.drawLine({
          start: { x: pdfX + boxW * 0.16, y: pdfY + boxH * 0.48 },
          end: { x: pdfX + boxW * 0.42, y: pdfY + boxH * 0.2 },
          thickness,
          color: symColor,
          opacity,
        });
        page.drawLine({
          start: { x: pdfX + boxW * 0.42, y: pdfY + boxH * 0.2 },
          end: { x: pdfX + boxW * 0.85, y: pdfY + boxH * 0.82 },
          thickness,
          color: symColor,
          opacity,
        });
      } else if (item.type === 'symbol-cross') {
        page.drawLine({
          start: { x: pdfX + boxW * 0.2, y: pdfY + boxH * 0.2 },
          end: { x: pdfX + boxW * 0.8, y: pdfY + boxH * 0.8 },
          thickness,
          color: symColor,
          opacity,
        });
        page.drawLine({
          start: { x: pdfX + boxW * 0.2, y: pdfY + boxH * 0.8 },
          end: { x: pdfX + boxW * 0.8, y: pdfY + boxH * 0.2 },
          thickness,
          color: symColor,
          opacity,
        });
      } else if (item.type === 'symbol-dot') {
        const rad = Math.max(2, Math.min(boxW, boxH) * 0.32);
        page.drawEllipse({
          x: pdfX + boxW / 2,
          y: pdfY + boxH / 2,
          xScale: rad,
          yScale: rad,
          color: symColor,
          opacity,
        });
      } else if (item.type === 'symbol-circle') {
        const radX = Math.max(2, boxW * 0.42);
        const radY = Math.max(2, boxH * 0.42);
        page.drawEllipse({
          x: pdfX + boxW / 2,
          y: pdfY + boxH / 2,
          xScale: radX,
          yScale: radY,
          borderColor: symColor,
          borderWidth: thickness,
          opacity,
        });
      }
    }
  }

  // Interactive AcroForm Fields Pass (sorted by tabOrder per page so PDF Tab key order matches user configuration)
  const formAnnotations = annotations
    .filter((a) =>
      [
        'form-text',
        'form-multiline',
        'form-dropdown',
        'form-radio',
        'form-checkbox',
        'form-signature',
      ].includes(a.type)
    )
    .sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      const orderA = typeof a.tabOrder === 'number' ? a.tabOrder : 9999;
      const orderB = typeof b.tabOrder === 'number' ? b.tabOrder : 9999;
      if (orderA !== orderB) return orderA - orderB;
      if (Math.abs(a.yPercent - b.yPercent) > 1.5) return a.yPercent - b.yPercent;
      return a.xPercent - b.xPercent;
    });

  if (formAnnotations.length > 0) {
    const form = pdfDoc.getForm();
    const usedFieldNames = new Set<string>();
    try {
      form.getFields().forEach((f) => usedFieldNames.add(f.getName()));
    } catch {
      // No existing fields
    }

    const radioGroupsMap = new Map<string, PDFRadioGroup>();
    const pagesWithForms = new Set<number>();

    const getUniqueFieldName = (rawBase: string, fallbackPrefix: string): string => {
      const cleaned = (rawBase || fallbackPrefix).replace(/[^a-zA-Z0-9_.-]/g, '_').trim() || fallbackPrefix;
      if (!usedFieldNames.has(cleaned)) {
        usedFieldNames.add(cleaned);
        return cleaned;
      }
      let counter = 2;
      while (usedFieldNames.has(`${cleaned}_${counter}`)) {
        counter++;
      }
      const unique = `${cleaned}_${counter}`;
      usedFieldNames.add(unique);
      return unique;
    };

    for (let fIdx = 0; fIdx < formAnnotations.length; fIdx++) {
      const item = formAnnotations[fIdx];
      const pageIdx = item.pageNumber - 1;
      if (pageIdx < 0 || pageIdx >= pages.length) continue;
      const page = pages[pageIdx];
      pagesWithForms.add(pageIdx);

      const mediaBox = page.getMediaBox();
      const { width, height } = page.getSize();
      const boxW = Math.max(10, (item.widthPercent / 100) * width);
      const boxH = Math.max(10, (item.heightPercent / 100) * height);
      const pdfX = mediaBox.x + (item.xPercent / 100) * width;
      const pdfY = mediaBox.y + height - (item.yPercent / 100) * height - boxH;

      const [r, g, b] = hexToRgbTuple(item.colorHex || '#0f172a');
      const borderTuple = item.strokeColorHex ? hexToRgbTuple(item.strokeColorHex) : [0.45, 0.52, 0.62];
      const bgTuple =
        item.fillHex && item.fillHex !== 'transparent' && item.fillHex !== 'none'
          ? hexToRgbTuple(item.fillHex)
          : [0.98, 0.99, 1];

      if (item.type === 'form-text' || item.type === 'form-multiline') {
        const fName = getUniqueFieldName(
          item.fieldName || `${item.type === 'form-multiline' ? 'multiline' : 'text'}_${fIdx + 1}`,
          'text_field'
        );
        const tf = form.createTextField(fName);
        if (item.type === 'form-multiline' || item.isMultiline) {
          tf.enableMultiline();
        }
        if (item.isRequired) tf.enableRequired();
        if (item.isReadOnly) tf.enableReadOnly();

        const initialVal = item.fieldValue ?? item.defaultValue ?? item.text ?? '';
        if (initialVal) {
          tf.setText(initialVal);
        }

        tf.addToPage(page, {
          x: pdfX,
          y: pdfY,
          width: boxW,
          height: boxH,
          textColor: rgb(r, g, b),
          backgroundColor: rgb(bgTuple[0], bgTuple[1], bgTuple[2]),
          borderColor: rgb(borderTuple[0], borderTuple[1], borderTuple[2]),
          borderWidth: item.strokeWidth ?? 1,
          font: fontRegular,
        });
        if (item.fontSize) {
          try {
            tf.setFontSize(item.fontSize);
          } catch {
            // Ignore font size error
          }
        }
      } else if (item.type === 'form-dropdown') {
        const fName = getUniqueFieldName(item.fieldName || `dropdown_${fIdx + 1}`, 'dropdown_field');
        const dd = form.createDropdown(fName);
        const opts =
          item.dropdownOptions && item.dropdownOptions.length > 0
            ? item.dropdownOptions.filter((o) => o.trim().length > 0)
            : ['Option 1', 'Option 2', 'Option 3'];
        dd.setOptions(opts);
        const selectedVal = item.fieldValue ?? item.defaultValue ?? '';
        if (selectedVal && opts.includes(selectedVal)) {
          dd.select(selectedVal);
        } else if (opts.length > 0 && item.defaultValue !== '') {
          dd.select(opts[0]);
        }
        if (item.isRequired) dd.enableRequired();
        if (item.isReadOnly) dd.enableReadOnly();

        dd.addToPage(page, {
          x: pdfX,
          y: pdfY,
          width: boxW,
          height: boxH,
          textColor: rgb(r, g, b),
          backgroundColor: rgb(bgTuple[0], bgTuple[1], bgTuple[2]),
          borderColor: rgb(borderTuple[0], borderTuple[1], borderTuple[2]),
          borderWidth: item.strokeWidth ?? 1,
          font: fontRegular,
        });
      } else if (item.type === 'form-checkbox') {
        const fName = getUniqueFieldName(item.fieldName || `checkbox_${fIdx + 1}`, 'checkbox_field');
        const cb = form.createCheckBox(fName);
        if (item.isRequired) cb.enableRequired();
        if (item.isReadOnly) cb.enableReadOnly();
        cb.addToPage(page, {
          x: pdfX,
          y: pdfY,
          width: boxW,
          height: boxH,
          textColor: rgb(r, g, b),
          backgroundColor: rgb(bgTuple[0], bgTuple[1], bgTuple[2]),
          borderColor: rgb(borderTuple[0], borderTuple[1], borderTuple[2]),
          borderWidth: item.strokeWidth ?? 1,
        });
        if (item.checked) {
          cb.check();
        } else {
          cb.uncheck();
        }
      } else if (item.type === 'form-radio') {
        const rawGroup = (item.radioGroupName || item.fieldName || 'radio_group_1').replace(
          /[^a-zA-Z0-9_.-]/g,
          '_'
        );
        let rg = radioGroupsMap.get(rawGroup);
        if (!rg) {
          const uniqueGroup = usedFieldNames.has(rawGroup)
            ? getUniqueFieldName(rawGroup, 'radio_group')
            : rawGroup;
          usedFieldNames.add(uniqueGroup);
          rg = form.createRadioGroup(uniqueGroup);
          radioGroupsMap.set(rawGroup, rg);
        }
        if (item.isRequired) rg.enableRequired();
        if (item.isReadOnly) rg.enableReadOnly();

        const optValue = (item.radioOptionValue || item.fieldValue || `Option_${fIdx + 1}`).trim();
        rg.addOptionToPage(optValue, page, {
          x: pdfX,
          y: pdfY,
          width: boxW,
          height: boxH,
          textColor: rgb(r, g, b),
          backgroundColor: rgb(bgTuple[0], bgTuple[1], bgTuple[2]),
          borderColor: rgb(borderTuple[0], borderTuple[1], borderTuple[2]),
          borderWidth: item.strokeWidth ?? 1,
        });
        if (item.checked) {
          rg.select(optValue);
        }
      } else if (item.type === 'form-signature') {
        const rawSigName = item.fieldName || `Sig_field_${fIdx + 1}`;
        const sigFieldName = getUniqueFieldName(
          rawSigName.toLowerCase().startsWith('sig_') ? rawSigName : `Sig_${rawSigName}`,
          'Sig_field'
        );

        // If user already signed inside this signature field, embed the visual signature image AND record the field
        if (item.imageDataUrl) {
          const base64Data = item.imageDataUrl.split(',')[1];
          if (base64Data) {
            const imgBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
            const embeddedImg = item.imageDataUrl.includes('image/png')
              ? await pdfDoc.embedPng(imgBytes)
              : await pdfDoc.embedJpg(imgBytes);
            page.drawRectangle({
              x: pdfX,
              y: pdfY,
              width: boxW,
              height: boxH,
              color: rgb(1, 1, 1),
              borderColor: rgb(0.75, 0.8, 0.86),
              borderWidth: 0.75,
            });
            page.drawImage(embeddedImg, {
              x: pdfX + 2,
              y: pdfY + 2,
              width: Math.max(8, boxW - 4),
              height: Math.max(8, boxH - 4),
            });
          }
        }

        const sigTf = form.createTextField(sigFieldName);
        if (item.isRequired) sigTf.enableRequired();
        if (item.imageDataUrl) {
          sigTf.setText(item.fieldValue || 'Signed electronically');
          sigTf.enableReadOnly();
        } else if (item.fieldValue || item.defaultValue) {
          sigTf.setText(item.fieldValue || item.defaultValue || '');
        }
        sigTf.addToPage(page, {
          x: pdfX,
          y: pdfY,
          width: boxW,
          height: boxH,
          textColor: rgb(r, g, b),
          backgroundColor: item.imageDataUrl ? undefined : rgb(0.99, 0.96, 0.96),
          borderColor: rgb(0.85, 0.25, 0.25),
          borderWidth: item.strokeWidth ?? 1,
          font: fontRegular,
        });
      }
    }

    // Set /Tabs /A (Annotations array order) on pages containing form fields so Tab order follows sorted creation order
    pagesWithForms.forEach((pIdx) => {
      const p = pages[pIdx];
      if (p) {
        p.node.set(PDFName.of('Tabs'), PDFName.of('A'));
      }
    });
  }

  // Apply per-page crop margins or percentage boxes if requested from the Editor Workspace
  if (pageEdits?.pageCrops) {
    for (const [pageNumStr, cropSpec] of Object.entries(pageEdits.pageCrops)) {
      const pIdx = Number(pageNumStr) - 1;
      if (pIdx >= 0 && pIdx < pages.length && cropSpec) {
        const p = pages[pIdx];
        const box = p.getCropBox();
        if ('xPercent' in cropSpec && 'widthPercent' in cropSpec) {
          const xPct = Math.max(0, Math.min(95, Number(cropSpec.xPercent) || 0));
          const yPct = Math.max(0, Math.min(95, Number(cropSpec.yPercent) || 0));
          const wPct = Math.max(5, Math.min(100 - xPct, Number(cropSpec.widthPercent) || 100));
          const hPct = Math.max(5, Math.min(100 - yPct, Number(cropSpec.heightPercent) || 100));

          const newW = Math.max(18, (wPct / 100) * box.width);
          const newH = Math.max(18, (hPct / 100) * box.height);
          const newX = box.x + (xPct / 100) * box.width;
          const newY = box.y + box.height - (yPct / 100) * box.height - newH;
          p.setCropBox(newX, newY, newW, newH);
          p.setMediaBox(newX, newY, newW, newH);
        } else if ('top' in cropSpec) {
          const top = Math.max(0, Number(cropSpec.top) || 0);
          const right = Math.max(0, Number(cropSpec.right) || 0);
          const bottom = Math.max(0, Number(cropSpec.bottom) || 0);
          const left = Math.max(0, Number(cropSpec.left) || 0);
          if (left + right < box.width - 18 && top + bottom < box.height - 18) {
            const newX = box.x + left;
            const newY = box.y + bottom;
            const newW = Math.max(18, box.width - left - right);
            const newH = Math.max(18, box.height - top - bottom);
            p.setCropBox(newX, newY, newW, newH);
            p.setMediaBox(newX, newY, newW, newH);
          }
        }
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

  // If an explicit pageSequence is provided (reordered or duplicated pages) and differs from default 1..N
  if (pageEdits?.pageSequence && pageEdits.pageSequence.length > 0) {
    const deletedSet = new Set(pageEdits.deletedPages || []);
    const seqNumbers: number[] = pageEdits.pageSequence
      .map((entry) => (typeof entry === 'number' ? entry : entry.originalPageNumber || 1))
      .filter((pNum) => !deletedSet.has(pNum) && pNum >= 1 && pNum <= pdfDoc.getPageCount());

    const isIdentity =
      seqNumbers.length === pdfDoc.getPageCount() &&
      seqNumbers.every((val, idx) => val === idx + 1);

    if (!isIdentity && seqNumbers.length > 0) {
      const reorderedDoc = await PDFDocument.create();
      const zeroBasedIndices = seqNumbers.map((n) => n - 1);
      const copiedPages = await reorderedDoc.copyPages(pdfDoc, zeroBasedIndices);
      copiedPages.forEach((cp) => reorderedDoc.addPage(cp));
      return await reorderedDoc.save();
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
  const fontCache = new Map<string, PDFFont>();
  const pages = pdfDoc.getPages();

  const modifiedOnly = editedLines.filter((l) => l.text !== l.originalText);

  // Remove original text operators from content streams per page first
  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const pageNum = pIdx + 1;
    const pageMods = modifiedOnly.filter((l) => l.pageNumber === pageNum);
    if (pageMods.length === 0) continue;

    const targets: TextRemovalTarget[] = pageMods.map((l) => ({
      id: l.id,
      originalText: l.originalText,
      originXPt: l.x,
      originYPt: l.y,
      originWidthPt: l.width,
      fontSize: l.fontSize,
    }));

    const removedIds = removeOriginalTextFromPageContentStreams(pdfDoc, pages[pIdx], targets);

    for (const line of pageMods) {
      const page = pages[pIdx];
      if (!removedIds.has(line.id)) {
        page.drawRectangle({
          x: Math.max(0, line.x - 1.5),
          y: Math.max(0, line.y - line.fontSize * 0.25),
          width: line.width + 4,
          height: Math.max(line.height, line.fontSize * 1.15),
          color: rgb(1, 1, 1),
        });
      }

      const safeStr = line.text.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
      if (safeStr.trim().length > 0) {
        const font = await resolveStandardPdfFont(
          pdfDoc,
          fontCache,
          line.fontFamily || 'Helvetica',
          Boolean(line.isBold),
          Boolean(line.isItalic)
        );
        const [r, g, b] = hexToRgbTuple(line.colorHex || '#141928');
        page.drawText(safeStr, {
          x: line.x,
          y: line.y,
          size: line.fontSize,
          font,
          color: rgb(r, g, b),
        });
      }
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

/**
 * Renders a single PDF page at a given scale and returns its dataUrl and unscaled dimensions in points.
 */
export async function renderPdfPageAtScale(
  bytes: Uint8Array,
  pageNumber: number,
  scale = 1.5,
  extraRotation = 0
): Promise<{ dataUrl: string; widthPt: number; heightPt: number; rotation: number }> {
  const res = await renderSinglePageDataUrl(bytes, pageNumber, scale, extraRotation);
  return {
    dataUrl: res.dataUrl,
    widthPt: res.unscaledWidthPt,
    heightPt: res.unscaledHeightPt,
    rotation: res.rotation,
  };
}

/**
 * Inserts a blank page into a PDF immediately after `afterPageNumber` (1-indexed).
 */
export async function insertBlankPageIntoPdf(
  bytes: Uint8Array,
  afterPageNumber: number,
  widthPt = 612,
  heightPt = 792
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = pdfDoc.getPageCount();
  const insertIdx = Math.max(0, Math.min(total, afterPageNumber));
  pdfDoc.insertPage(insertIdx, [Math.max(72, widthPt), Math.max(72, heightPt)]);
  return new Uint8Array(await pdfDoc.save());
}

/**
 * Extracts specific 1-indexed page numbers from a PDF into a new standalone PDF document.
 */
export async function extractPagesFromPdf(
  bytes: Uint8Array,
  pageNumbers: number[]
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const outDoc = await PDFDocument.create();
  copyDocMetadata(srcDoc, outDoc);
  const total = srcDoc.getPageCount();
  const validIndices = pageNumbers
    .map((n) => n - 1)
    .filter((idx) => idx >= 0 && idx < total);

  if (validIndices.length === 0) {
    throw new Error('No valid page numbers specified for extraction.');
  }

  const copied = await outDoc.copyPages(srcDoc, validIndices);
  copied.forEach((p) => outDoc.addPage(p));
  return new Uint8Array(await outDoc.save());
}

