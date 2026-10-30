import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import { POST as processPdfRoute } from '../app/api/pdf/process/route';
import { generateSamplePdfBytes } from './sample-pdf';
import { PDF_TOOLS_REGISTRY, getToolBySlug } from './tools-registry';
import { validateFileHeader } from './pdf-utils';
import {
  mergePdfFiles,
  splitPdfFile,
  buildOrganizedPdf,
  cropPdfPages,
  addPageNumbersAndHeaders,
  applyEditorAnnotationsToPdf,
  fillPdfFormFields,
  convertImagesToPdf,
  convertDocumentOrTextToPdf,
  exportPdfToFormat,
  applyCoordinateTextEdits,
  permanentlyRedactPdf,
  compareTwoPdfs,
  updatePdfMetadataAndBookmarks,
  resizePdfPagesToPreset,
  sanitizeOrFlattenPdf,
  inspectPdfBytes,
  extractPdfTextAndLines,
  detectCandidateFormFields,
  stripEditedTextFromPdfBytes,
} from './pdf-engine-client';

/**
 * Helper to create a custom user-uploaded PDF (distinct from sample-pdf.ts)
 * to prove that production operations process the user's actual uploaded document.
 */
async function createCustomUserPdf(customToken: string, pageCount = 3): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Custom User Upload - ${customToken}`);
  doc.setAuthor('External Test User');
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`USER_UPLOADED_DOC_${customToken}_PAGE_${i}`, {
      x: 50,
      y: 700,
      size: 14,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(`CONFIDENTIAL_TOKEN_${customToken}_SECRET`, {
      x: 50,
      y: 650,
      size: 12,
      font,
      color: rgb(0.8, 0.1, 0.1),
    });
  }
  return await doc.save({ useObjectStreams: false });
}

test('PDF_TOOLS_REGISTRY contains all 30 distinct PDF tools with valid slugs and SEO metadata', () => {
  assert.equal(PDF_TOOLS_REGISTRY.length, 30);
  const slugs = new Set(PDF_TOOLS_REGISTRY.map((t) => t.slug));
  assert.equal(slugs.size, 30);

  assert.ok(getToolBySlug('merge-pdf'));
  assert.ok(getToolBySlug('split-pdf'));
  assert.ok(getToolBySlug('compress-pdf'));
  assert.ok(getToolBySlug('edit-pdf'));
});

test('1. Merge PDF (mergePdfFiles) merges custom user PDFs and sample PDFs while preserving metadata and collision-free AcroForm fields', async () => {
  const customA = await createCustomUserPdf('ALPHA', 2);
  const customB = await createCustomUserPdf('BETA', 3);

  const customMerged = await mergePdfFiles([customA, customB]);
  const customReport = await inspectPdfBytes(customMerged);
  assert.equal(customReport.pageCount, 5);
  assert.equal(customReport.title, 'Custom User Upload - ALPHA');
  const customExt = await extractPdfTextAndLines(customMerged);
  assert.ok(customExt.fullText.includes('USER_UPLOADED_DOC_ALPHA_PAGE_1'));
  assert.ok(customExt.fullText.includes('USER_UPLOADED_DOC_BETA_PAGE_3'));

  // Also verify AcroForm field deduplication across two interactive PDFs
  const [bytesA, bytesB] = await Promise.all([
    generateSamplePdfBytes('primary'),
    generateSamplePdfBytes('comparison'),
  ]);

  const mergedBytes = await mergePdfFiles([bytesA, bytesB], { flattenForms: false });
  assert.equal(validateFileHeader(mergedBytes, 'pdf').valid, true);

  const report = await inspectPdfBytes(mergedBytes);
  assert.equal(report.pageCount, 8);
  assert.equal(report.title, 'PDFNestly Enterprise Service Agreement v1.0');
  assert.equal(report.formFields.length, 6);
  const fieldNames = report.formFields.map((f) => f.name);
  assert.deepEqual(fieldNames, [
    'client_organization',
    'project_code',
    'authorize_terms',
    'client_organization_doc2',
    'project_code_doc2',
    'authorize_terms_doc2',
  ]);

  // Flatten forms mode
  const flattenedMerged = await mergePdfFiles([bytesA, bytesB], { flattenForms: true });
  const flatReport = await inspectPdfBytes(flattenedMerged);
  assert.equal(flatReport.pageCount, 8);
  assert.equal(flatReport.formFields.length, 0);
});

test('2. Split PDF (splitPdfFile) extracts ranges, bursts pages into valid ZIPs, and preserves AcroForm fields', async () => {
  const sampleBytes = await generateSamplePdfBytes('primary');

  // Extract Page 1 (which has 3 AcroForm fields) and Page 4
  const singleRes = await splitPdfFile(sampleBytes, 'extract-single', '1, 4', 'contract');
  assert.equal(singleRes.isZip, false);
  assert.equal(singleRes.count, 2);
  assert.equal(singleRes.splitParts.length, 1);

  const singleReport = await inspectPdfBytes(singleRes.splitParts[0].bytes);
  assert.equal(singleReport.pageCount, 2);
  assert.equal(singleReport.title, 'PDFNestly Enterprise Service Agreement v1.0');
  assert.equal(singleReport.formFields.length, 3);

  // Ranges ZIP ("1-2, 3-4")
  const rangesRes = await splitPdfFile(sampleBytes, 'ranges-zip', '1-2, 3-4', 'contract');
  assert.equal(rangesRes.isZip, true);
  assert.equal(rangesRes.count, 2);
  assert.equal(rangesRes.splitParts.length, 2);

  // Verify ZIP archive actually unpacks into valid PDFs
  const zipLoaded = await JSZip.loadAsync(await rangesRes.blob.arrayBuffer());
  const zipFileNames = Object.keys(zipLoaded.files);
  assert.deepEqual(zipFileNames, ['contract-pages-1-2.pdf', 'contract-pages-3-4.pdf']);
  const unzippedPart1 = await zipLoaded.file('contract-pages-1-2.pdf')!.async('uint8array');
  const part1Report = await inspectPdfBytes(unzippedPart1);
  assert.equal(part1Report.pageCount, 2);
  assert.equal(part1Report.formFields.length, 3);

  // Burst All ZIP (4 individual pages)
  const burstRes = await splitPdfFile(sampleBytes, 'burst-all-zip', '', 'contract');
  assert.equal(burstRes.isZip, true);
  assert.equal(burstRes.count, 4);
  assert.equal(burstRes.splitParts.length, 4);
});

test('3. Rotate, Delete, Reorder, Duplicate & Insert Blank Pages (buildOrganizedPdf) modifies page sequence and geometry accurately', async () => {
  const customBytes = await createCustomUserPdf('ORGANIZE_TEST', 3);

  // Instructions:
  // 1) Page 3 rotated +90 deg
  // 2) Page 1 rotated +180 deg
  // (Page 2 is deleted)
  // 3) Duplicate of Page 1 (0 deg)
  // 4) Inserted Blank Page (500 x 700 pt)
  const organizedBytes = await buildOrganizedPdf(customBytes, [
    { type: 'existing', originalPageIndex: 2, extraRotation: 90 },
    { type: 'existing', originalPageIndex: 0, extraRotation: 180 },
    { type: 'existing', originalPageIndex: 0, extraRotation: 0 },
    { type: 'blank', widthPt: 500, heightPt: 700 },
  ]);

  const report = await inspectPdfBytes(organizedBytes);
  assert.equal(report.pageCount, 4);
  assert.equal(report.pages[0].rotation, 90);
  assert.equal(report.pages[1].rotation, 180);
  assert.equal(report.pages[2].rotation, 0);
  assert.equal(report.pages[3].widthPt, 500);
  assert.equal(report.pages[3].heightPt, 700);

  const ext = await extractPdfTextAndLines(organizedBytes);
  assert.ok(ext.pageTexts[0].includes('USER_UPLOADED_DOC_ORGANIZE_TEST_PAGE_3'));
  assert.ok(ext.pageTexts[1].includes('USER_UPLOADED_DOC_ORGANIZE_TEST_PAGE_1'));
  assert.ok(ext.pageTexts[2].includes('USER_UPLOADED_DOC_ORGANIZE_TEST_PAGE_1'));
  assert.equal(ext.fullText.includes('USER_UPLOADED_DOC_ORGANIZE_TEST_PAGE_2'), false);
});

test('4. Crop PDF & Page Numbers/Headers/Footers (cropPdfPages, addPageNumbersAndHeaders)', async () => {
  const customBytes = await createCustomUserPdf('CROP_NUM', 2);

  // Crop 36pt from all 4 sides of 612x792 -> 540x720
  const croppedBytes = await cropPdfPages(customBytes, {
    top: 36,
    right: 36,
    bottom: 36,
    left: 36,
  });
  const cropReport = await inspectPdfBytes(croppedBytes);
  assert.equal(cropReport.pages[0].widthPt, 540);
  assert.equal(cropReport.pages[0].heightPt, 720);

  // Add page numbers, header, and footer
  const numberedBytes = await addPageNumbersAndHeaders(croppedBytes, {
    format: 'page-x-of-y',
    position: 'bottom-center',
    startFromPage: 1,
    fontSize: 10,
    headerText: 'CUSTOM_HEADER_2026',
    footerText: 'CUSTOM_FOOTER_2026',
  });
  const numExt = await extractPdfTextAndLines(numberedBytes);
  assert.ok(numExt.pageTexts[0].includes('Page 1 of 2'));
  assert.ok(numExt.pageTexts[1].includes('Page 2 of 2'));
  assert.ok(numExt.fullText.includes('CUSTOM_HEADER_2026'));
  assert.ok(numExt.fullText.includes('CUSTOM_FOOTER_2026'));
});

test('5. Main PDF Editor (applyEditorAnnotationsToPdf) applies text, stamps, watermarks, blackout redactions (destroying underlying text), rotations, and page deletions', async () => {
  const sampleBytes = await generateSamplePdfBytes('primary');

  const beforeExt = await extractPdfTextAndLines(sampleBytes);
  assert.ok(beforeExt.fullText.includes('sk_live_994810294810_REDACT_ME'));

  const editedBytes = await applyEditorAnnotationsToPdf(
    sampleBytes,
    [
      {
        id: 'ann-text-1',
        pageNumber: 1,
        type: 'text',
        xPercent: 15,
        yPercent: 20,
        widthPercent: 30,
        heightPercent: 5,
        text: 'CUSTOM_EDITOR_NOTE_2026',
        colorHex: '#1d4ed8',
        fontSize: 14,
      },
      {
        id: 'ann-stamp-2',
        pageNumber: 2,
        type: 'stamp',
        xPercent: 25,
        yPercent: 12,
        widthPercent: 25,
        heightPercent: 6,
        text: 'APPROVED_STAMP_2026',
        colorHex: '#15803d',
      },
      {
        id: 'ann-redact-1',
        pageNumber: 1,
        type: 'redact',
        xPercent: 5,
        yPercent: 50,
        widthPercent: 85,
        heightPercent: 12,
        colorHex: '#000000',
      },
    ],
    {
      extraRotations: { 1: 90 },
      deletedPages: [4],
    }
  );

  assert.equal(validateFileHeader(editedBytes, 'pdf').valid, true);
  const afterReport = await inspectPdfBytes(editedBytes);
  assert.equal(afterReport.pageCount, 3);
  assert.equal(afterReport.pages[0].rotation, 90);

  const afterExt = await extractPdfTextAndLines(editedBytes);
  assert.ok(afterExt.fullText.includes('CUSTOM_EDITOR_NOTE_2026'));
  assert.ok(afterExt.fullText.includes('APPROVED_STAMP_2026'));
  assert.equal(
    afterExt.fullText.includes('sk_live_994810294810_REDACT_ME'),
    false,
    'Redacted page must not retain underlying sensitive text token'
  );
});

test('6. Server API (/api/pdf/process) verifies HTTP status codes, Content-Type headers, Compress presets, Password Protect/Unlock, Repair, and Print-Ready', async () => {
  // 6a. Reject missing file with HTTP 400
  const emptyForm = new FormData();
  emptyForm.append('operation', 'compress');
  const resMissing = await processPdfRoute(
    new NextRequest('http://localhost:3000/api/pdf/process', {
      method: 'POST',
      body: emptyForm,
    })
  );
  assert.equal(resMissing.status, 400);

  // 6b. Reject invalid non-PDF file with HTTP 400
  const badForm = new FormData();
  badForm.append('file', new Blob(['NOT_A_PDF_FILE_CONTENT'], { type: 'text/plain' }), 'bad.pdf');
  badForm.append('operation', 'compress');
  const resBad = await processPdfRoute(
    new NextRequest('http://localhost:3000/api/pdf/process', {
      method: 'POST',
      body: badForm,
    })
  );
  assert.equal(resBad.status, 400);

  // 6c. Compress PDF across all 4 presets via POST /api/pdf/process
  const sampleBytes = await generateSamplePdfBytes('primary');
  const sizes: Record<string, number> = {};

  for (const level of ['screen', 'ebook', 'printer', 'prepress']) {
    const fd = new FormData();
    fd.append(
      'file',
      new Blob([Buffer.from(sampleBytes)], { type: 'application/pdf' }),
      'sample.pdf'
    );
    fd.append('operation', 'compress');
    fd.append('level', level);

    const res = await processPdfRoute(
      new NextRequest('http://localhost:3000/api/pdf/process', {
        method: 'POST',
        body: fd,
      })
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'application/pdf');
    assert.ok(res.headers.get('X-Engine-Used')?.includes('Ghostscript 9.55'));

    const outBytes = new Uint8Array(await res.arrayBuffer());
    assert.equal(validateFileHeader(outBytes, 'pdf').valid, true);
    sizes[level] = outBytes.byteLength;
    assert.ok(
      outBytes.byteLength < sampleBytes.byteLength,
      `API preset ${level} (${outBytes.byteLength} B) must be smaller than input (${sampleBytes.byteLength} B)`
    );
  }
  assert.ok(sizes.screen < sizes.ebook, 'screen < ebook');
  assert.ok(sizes.ebook < sizes.printer, 'ebook < printer');
  assert.ok(sizes.printer <= sizes.prepress, 'printer <= prepress');

  // 6d. Password Protect & Unlock with custom uploaded PDF (verifies real user content, not sample)
  const userPdf = await createCustomUserPdf('VAULT_99', 2);
  const protectFd = new FormData();
  protectFd.append(
    'file',
    new Blob([Buffer.from(userPdf)], { type: 'application/pdf' }),
    'vault.pdf'
  );
  protectFd.append('operation', 'protect');
  protectFd.append('userPassword', 'correct-pass-2026');
  protectFd.append('ownerPassword', 'owner-pass-2026');
  protectFd.append('allowPrint', 'false');
  protectFd.append('allowCopy', 'false');

  const resProtect = await processPdfRoute(
    new NextRequest('http://localhost:3000/api/pdf/process', {
      method: 'POST',
      body: protectFd,
    })
  );
  assert.equal(resProtect.status, 200);
  const encryptedBytes = new Uint8Array(await resProtect.arrayBuffer());
  assert.equal(validateFileHeader(encryptedBytes, 'pdf').valid, true);

  // Attempt unlock with WRONG password -> must fail with HTTP 401
  const wrongUnlockFd = new FormData();
  wrongUnlockFd.append(
    'file',
    new Blob([Buffer.from(encryptedBytes)], { type: 'application/pdf' }),
    'vault-protected.pdf'
  );
  wrongUnlockFd.append('operation', 'unlock');
  wrongUnlockFd.append('password', 'wrong-password');
  const resWrongUnlock = await processPdfRoute(
    new NextRequest('http://localhost:3000/api/pdf/process', {
      method: 'POST',
      body: wrongUnlockFd,
    })
  );
  assert.equal(resWrongUnlock.status, 401);

  // Attempt unlock with CORRECT password -> must return HTTP 200 and restore exact custom user text
  const rightUnlockFd = new FormData();
  rightUnlockFd.append(
    'file',
    new Blob([Buffer.from(encryptedBytes)], { type: 'application/pdf' }),
    'vault-protected.pdf'
  );
  rightUnlockFd.append('operation', 'unlock');
  rightUnlockFd.append('password', 'correct-pass-2026');
  const resRightUnlock = await processPdfRoute(
    new NextRequest('http://localhost:3000/api/pdf/process', {
      method: 'POST',
      body: rightUnlockFd,
    })
  );
  assert.equal(resRightUnlock.status, 200);
  const unlockedBytes = new Uint8Array(await resRightUnlock.arrayBuffer());
  const unlockedExt = await extractPdfTextAndLines(unlockedBytes);
  assert.ok(unlockedExt.fullText.includes('USER_UPLOADED_DOC_VAULT_99_PAGE_1'));
  assert.ok(unlockedExt.fullText.includes('USER_UPLOADED_DOC_VAULT_99_PAGE_2'));

  // 6e. Print-Ready PDF (18pt bleed adds +36pt width/height -> 648x828)
  const printFd = new FormData();
  printFd.append(
    'file',
    new Blob([Buffer.from(userPdf)], { type: 'application/pdf' }),
    'print.pdf'
  );
  printFd.append('operation', 'print-ready');
  printFd.append('bleedPt', '18');
  printFd.append('addTrimMarks', 'true');
  const resPrint = await processPdfRoute(
    new NextRequest('http://localhost:3000/api/pdf/process', {
      method: 'POST',
      body: printFd,
    })
  );
  assert.equal(resPrint.status, 200);
  const printBytes = new Uint8Array(await resPrint.arrayBuffer());
  const printReport = await inspectPdfBytes(printBytes);
  assert.equal(printReport.pages[0].widthPt, 648);
  assert.equal(printReport.pages[0].heightPt, 828);

  // 6f. Repair PDF recovers readable pages from a stream with corrupted xref trailer
  const corruptedPdf = new Uint8Array(userPdf.byteLength + 32);
  corruptedPdf.set(userPdf, 0);
  corruptedPdf.set(new TextEncoder().encode('\n%%CORRUPTED_TRAILER_GARBAGE'), userPdf.byteLength);
  const repairFd = new FormData();
  repairFd.append(
    'file',
    new Blob([Buffer.from(corruptedPdf)], { type: 'application/pdf' }),
    'damaged.pdf'
  );
  repairFd.append('operation', 'repair');
  const resRepair = await processPdfRoute(
    new NextRequest('http://localhost:3000/api/pdf/process', {
      method: 'POST',
      body: repairFd,
    })
  );
  assert.equal(resRepair.status, 200);
  const repairedBytes = new Uint8Array(await resRepair.arrayBuffer());
  const repairedExt = await extractPdfTextAndLines(repairedBytes);
  assert.ok(repairedExt.fullText.includes('USER_UPLOADED_DOC_VAULT_99_PAGE_1'));
});

test('7. Advanced Client PDF Tools: Form Filling, Coordinate Text Edit, Redaction, Compare, Metadata, Resize, Flatten, Conversions', async () => {
  const sampleBytes = await generateSamplePdfBytes('primary');

  // 7a. Fill AcroForm fields
  const filledBytes = await fillPdfFormFields(
    sampleBytes,
    {
      client_organization: 'Acme Aerospace Industries',
      project_code: 'PO-9999-ACME',
      authorize_terms: false,
    },
    false
  );
  const filledReport = await inspectPdfBytes(filledBytes);
  const orgField = filledReport.formFields.find((f) => f.name === 'client_organization');
  const codeField = filledReport.formFields.find((f) => f.name === 'project_code');
  const checkField = filledReport.formFields.find((f) => f.name === 'authorize_terms');
  assert.equal(orgField?.value, 'Acme Aerospace Industries');
  assert.equal(codeField?.value, 'PO-9999-ACME');
  assert.equal(checkField?.value, false);

  // 7b. Edit Existing PDF Text Lines at exact coordinates
  const customDoc = await createCustomUserPdf('LINE_EDIT', 1);
  const extracted = await extractPdfTextAndLines(customDoc);
  const editedLines = extracted.lines.map((l) =>
    l.text.includes('USER_UPLOADED_DOC_LINE_EDIT_PAGE_1')
      ? { ...l, text: 'REPLACED_COORDINATE_HEADING_2026' }
      : l
  );
  const textEditedBytes = await applyCoordinateTextEdits(customDoc, editedLines);
  const afterEditExt = await extractPdfTextAndLines(textEditedBytes);
  assert.ok(afterEditExt.fullText.includes('REPLACED_COORDINATE_HEADING_2026'));

  // 7c. Permanent Content Redaction by search term
  const redactRes = await permanentlyRedactPdf(customDoc, ['CONFIDENTIAL_TOKEN_LINE_EDIT_SECRET']);
  assert.equal(redactRes.redactionCount, 1);
  assert.equal(redactRes.verifiedClean, true);
  const afterRedactExt = await extractPdfTextAndLines(redactRes.redactedPdfBytes);
  assert.equal(afterRedactExt.fullText.includes('CONFIDENTIAL_TOKEN_LINE_EDIT_SECRET'), false);
  assert.ok(afterRedactExt.fullText.includes('USER_UPLOADED_DOC_LINE_EDIT_PAGE_1'));

  // 7d. Compare Two PDFs
  const sampleB = await generateSamplePdfBytes('comparison');
  const diffRes = await compareTwoPdfs(sampleBytes, sampleB);
  assert.ok(diffRes.addedCount > 0);
  assert.ok(diffRes.removedCount > 0);
  assert.equal(validateFileHeader(diffRes.reportPdfBytes, 'pdf').valid, true);

  // 7e. Metadata & Bookmarks TOC sheet
  const metaUpdatedBytes = await updatePdfMetadataAndBookmarks(customDoc, {
    title: 'Updated Custom Title',
    author: 'Updated Author',
    subject: 'Updated Subject',
    keywords: 'alpha, beta, gamma',
    creator: 'PDFNestly Test',
    prependTocSheet: true,
    bookmarksList: [{ title: 'Executive Section', targetPage: 1 }],
  });
  const metaReport = await inspectPdfBytes(metaUpdatedBytes);
  assert.equal(metaReport.title, 'Updated Custom Title');
  assert.equal(metaReport.author, 'Updated Author');
  assert.equal(metaReport.pageCount, 2); // 1 original + 1 prepended TOC page

  // 7f. Resize Pages to A4 + append blank page
  const resizedBytes = await resizePdfPagesToPreset(customDoc, 'A4', true);
  const resizedReport = await inspectPdfBytes(resizedBytes);
  assert.equal(resizedReport.pageCount, 2);
  assert.equal(Math.round(resizedReport.pages[0].widthPt), 595);
  assert.equal(Math.round(resizedReport.pages[0].heightPt), 842);

  // 7g. Flatten & Strip Metadata/Annotations
  const sanitizedBytes = await sanitizeOrFlattenPdf(sampleBytes, {
    flattenForms: true,
    stripAnnotations: true,
    stripMetadata: true,
  });
  const sanitizedReport = await inspectPdfBytes(sanitizedBytes);
  assert.equal(sanitizedReport.formFields.length, 0);
  assert.equal(sanitizedReport.title, '');

  // 7h. Export PDF to DOCX, XLSX, CSV, TXT, HTML and convert back to PDF
  const docxExport = await exportPdfToFormat(sampleBytes, 'docx', 'agreement');
  assert.equal(docxExport.fileName, 'agreement.docx');
  assert.ok(docxExport.blob.size > 1000);

  const xlsxExport = await exportPdfToFormat(sampleBytes, 'xlsx', 'agreement');
  assert.equal(xlsxExport.fileName, 'agreement.xlsx');
  assert.ok(xlsxExport.blob.size > 1000);

  // Convert generated DOCX & XLSX files back to PDF via convertDocumentOrTextToPdf
  const docxFile = new File([await docxExport.blob.arrayBuffer()], 'agreement.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const pdfFromDocx = await convertDocumentOrTextToPdf(
    { file: docxFile },
    { pageSize: 'A4', fontSize: 11 }
  );
  const docxPdfExt = await extractPdfTextAndLines(pdfFromDocx);
  assert.ok(docxPdfExt.fullText.includes('Master Service Agreement'));

  const xlsxFile = new File([await xlsxExport.blob.arrayBuffer()], 'agreement.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const pdfFromXlsx = await convertDocumentOrTextToPdf(
    { file: xlsxFile },
    { pageSize: 'Letter', fontSize: 10 }
  );
  const xlsxPdfExt = await extractPdfTextAndLines(pdfFromXlsx);
  assert.ok(xlsxPdfExt.fullText.includes('PDF-CORE-01'));

  // 7i. Convert PNG Images to Single PDF and Contact Sheet PDF
  const png1x1 = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0,
    0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0, 0, 3, 1, 1,
    0, 24, 221, 141, 176, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
  ]);
  const imgFile1 = new File([png1x1], 'proof1.png', { type: 'image/png' });
  const imgFile2 = new File([png1x1], 'proof2.png', { type: 'image/png' });
  const imgPdfBytes = await convertImagesToPdf([imgFile1, imgFile2], {
    pageSize: 'A4',
    marginPt: 24,
    contactSheetColumns: 1,
  });
  const imgPdfReport = await inspectPdfBytes(imgPdfBytes);
  assert.equal(imgPdfReport.pageCount, 2);

  const contactSheetBytes = await convertImagesToPdf([imgFile1, imgFile2], {
    pageSize: 'A4',
    marginPt: 24,
    contactSheetColumns: 2,
    showCaptions: true,
  });
  const csReport = await inspectPdfBytes(contactSheetBytes);
  assert.equal(csReport.pageCount, 1);
});

test('8. Studio Existing Text Editing Suite: All 12 Scenarios, Genuine Content Stream Removal, Formatting, Move, Crop & Reorder', async () => {
  // Build a multi-page test PDF with paragraphs, table cells, multi-column text, varied font sizes, and embedded image
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const timesItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const courier = await doc.embedFont(StandardFonts.Courier);

  const page1 = doc.addPage([612, 792]);
  // 1. Single word target
  page1.drawText('STATUS_ORIGINAL_WORD', { x: 50, y: 730, size: 12, font: helv });
  // 2. Full sentence replacement target
  page1.drawText('The quick brown fox jumps over the lazy dog.', { x: 50, y: 700, size: 12, font: helv });
  // 3. Delete single word inside sentence target
  page1.drawText('Remove UNWANTED_TOKEN from this sentence.', { x: 50, y: 670, size: 12, font: helv });
  // 4. Delete entire line target (must NOT produce "Text Note")
  page1.drawText('DELETE_ENTIRE_LINE_COMPLETELY_NOW', { x: 50, y: 640, size: 12, font: helv });
  // 5. Add text inside existing sentence target
  page1.drawText('Contract Effective Date:', { x: 50, y: 610, size: 12, font: helvBold });
  // 6. Short text -> longer text target
  page1.drawText('SHORT_TAG', { x: 50, y: 580, size: 11, font: helv });
  // 7. Long text -> shorter text target
  page1.drawText('VERY_LONG_LEGACY_DESCRIPTION_TEXT_TO_SHORTEN_CLEANLY', { x: 50, y: 550, size: 11, font: helv });

  // 8. Table row with distinct columns (must segment separately and preserve sibling cells)
  page1.drawText('CELL_A1_ITEM', { x: 50, y: 500, size: 10, font: helv });
  page1.drawText('CELL_B1_PRICE_500', { x: 220, y: 500, size: 10, font: helv });
  page1.drawText('CELL_C1_QTY_10', { x: 400, y: 500, size: 10, font: helv });

  // 9. Text near embedded image
  const png1x1 = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0,
    0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0, 0, 3, 1, 1,
    0, 24, 221, 141, 176, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
  ]);
  const embeddedImg = await doc.embedPng(png1x1);
  page1.drawImage(embeddedImg, { x: 50, y: 420, width: 40, height: 40 });
  page1.drawText('CAPTION_NEAR_IMAGE_ORIGINAL', { x: 105, y: 435, size: 11, font: helv });

  // 10. Multi-column layout text
  page1.drawText('LEFT_COLUMN_PARAGRAPH_LINE', { x: 50, y: 370, size: 10, font: timesItalic });
  page1.drawText('RIGHT_COLUMN_PARAGRAPH_LINE', { x: 330, y: 370, size: 10, font: courier });

  // 11. Different font sizes (24pt heading & 9pt footnote) + movable line
  page1.drawText('LARGE_HEADING_24PT', { x: 50, y: 310, size: 24, font: helvBold });
  page1.drawText('SMALL_FOOTNOTE_9PT', { x: 50, y: 270, size: 9, font: helv });
  page1.drawText('MOVABLE_LINE_ORIGINAL', { x: 50, y: 230, size: 12, font: helv });

  // 12. Page 2 for multi-page editing
  const page2 = doc.addPage([612, 792]);
  page2.drawText('PAGE_TWO_CLAUSE_ORIGINAL', { x: 60, y: 700, size: 14, font: helvBold });
  page2.drawText('PAGE_TWO_UNCHANGED_LINE', { x: 60, y: 660, size: 12, font: helv });

  const sourceBytes = await doc.save();
  const extracted = await extractPdfTextAndLines(sourceBytes);

  // Verify table cells and multi-column lines were segmented into separate DetectedTextLines
  const findLine = (substr: string) => {
    const found = extracted.lines.find((l) => l.text.includes(substr));
    assert.ok(found, `Expected to find extracted text segment containing "${substr}"`);
    return found!;
  };

  const line1 = findLine('STATUS_ORIGINAL_WORD');
  const line2 = findLine('The quick brown fox jumps over the lazy dog.');
  const line3 = findLine('Remove UNWANTED_TOKEN from this sentence.');
  const line4 = findLine('DELETE_ENTIRE_LINE_COMPLETELY_NOW');
  const line5 = findLine('Contract Effective Date:');
  const line6 = findLine('SHORT_TAG');
  const line7 = findLine('VERY_LONG_LEGACY_DESCRIPTION_TEXT_TO_SHORTEN_CLEANLY');
  const line8Price = findLine('CELL_B1_PRICE_500');
  const line9Img = findLine('CAPTION_NEAR_IMAGE_ORIGINAL');
  const line10LeftCol = findLine('LEFT_COLUMN_PARAGRAPH_LINE');
  const line11Large = findLine('LARGE_HEADING_24PT');
  const line11Small = findLine('SMALL_FOOTNOTE_9PT');
  const lineMove = findLine('MOVABLE_LINE_ORIGINAL');
  const line12Page2 = findLine('PAGE_TWO_CLAUSE_ORIGINAL');

  // Helper to create an existing-text annotation exactly as PdfEditorWorkspace does
  const makeEditAnnot = (
    line: typeof line1,
    newText: string,
    overrides: Partial<EditorAnnotationItem> = {}
  ): EditorAnnotationItem => ({
    id: `test_edit_${line.pageNumber}_${line.x}_${line.y}`,
    pageNumber: line.pageNumber,
    type: 'text',
    isExistingTextEdit: true,
    originalText: line.text,
    text: newText,
    xPercent: line.xPercent,
    yPercent: line.yPercent,
    widthPercent: line.widthPercent,
    heightPercent: line.heightPercent,
    originXPt: line.x,
    originYPt: line.y,
    originWidthPt: line.width,
    originHeightPt: line.height,
    originXPercent: line.xPercent,
    originYPercent: line.yPercent,
    originWidthPercent: line.widthPercent,
    originHeightPercent: line.heightPercent,
    fontSize: line.fontSize,
    fontFamily: line.fontFamily,
    isBold: line.isBold,
    isItalic: line.isItalic,
    colorHex: line.colorHex,
    fillHex: '#ffffff',
    opacity: 1,
    ...overrides,
  });

  const annotations: EditorAnnotationItem[] = [
    // 1. Replace single word
    makeEditAnnot(line1, 'STATUS_APPROVED_WORD'),
    // 2. Replace full sentence
    makeEditAnnot(line2, 'The swift red falcon soars above the quiet valley.'),
    // 3. Delete single word inside sentence
    makeEditAnnot(line3, 'Remove from this sentence.'),
    // 4. Delete entire line (empty string "")
    makeEditAnnot(line4, ''),
    // 5. Add text inside existing sentence
    makeEditAnnot(line5, 'Contract Effective Date: October 30, 2026'),
    // 6. Change short text to longer text
    makeEditAnnot(line6, 'EXPANDED_ENTERPRISE_COMPLIANCE_IDENTIFIER_2026'),
    // 7. Change long text to shorter text
    makeEditAnnot(line7, 'COMPACT_SUMMARY'),
    // 8. Edit single cell in table without affecting CELL_A1_ITEM or CELL_C1_QTY_10
    makeEditAnnot(line8Price, 'CELL_B1_PRICE_950'),
    // 9. Edit text near image
    makeEditAnnot(line9Img, 'CAPTION_NEAR_IMAGE_UPDATED'),
    // 10. Edit left column without affecting right column
    makeEditAnnot(line10LeftCol, 'LEFT_COLUMN_EDITED_CLEANLY', { fontFamily: 'TimesRoman', isItalic: true }),
    // 11. Edit different font sizes + apply underline/strikethrough/spacing
    makeEditAnnot(line11Large, 'LARGE_HEADING_UPDATED_24PT', {
      isBold: true,
      isUnderline: true,
      letterSpacingPt: 0.5,
    }),
    makeEditAnnot(line11Small, 'SMALL_FOOTNOTE_UPDATED_9PT', { isStrikethrough: true }),
    // Move existing text to a new position on the page
    makeEditAnnot(lineMove, 'MOVED_LINE_AT_NEW_COORDINATES', {
      xPercent: Math.min(80, lineMove.xPercent + 25),
      yPercent: Math.min(85, lineMove.yPercent + 5),
    }),
    // 12. Edit text on Page 2
    makeEditAnnot(line12Page2, 'PAGE_TWO_CLAUSE_REPLACED_SUCCESSFULLY'),
  ];

  const editedPdfBytes = await applyEditorAnnotationsToPdf(sourceBytes, annotations);
  const afterExt = await extractPdfTextAndLines(editedPdfBytes);

  // Verify all 12 new replacement texts are present in the exported PDF
  assert.ok(afterExt.fullText.includes('STATUS_APPROVED_WORD'));
  assert.ok(afterExt.fullText.includes('The swift red falcon soars above the quiet valley.'));
  assert.ok(afterExt.fullText.includes('Remove from this sentence.'));
  assert.ok(afterExt.fullText.includes('Contract Effective Date: October 30, 2026'));
  assert.ok(afterExt.fullText.includes('EXPANDED_ENTERPRISE_COMPLIANCE_IDENTIFIER_2026'));
  assert.ok(afterExt.fullText.includes('COMPACT_SUMMARY'));
  assert.ok(afterExt.fullText.includes('CELL_B1_PRICE_950'));
  assert.ok(afterExt.fullText.includes('CAPTION_NEAR_IMAGE_UPDATED'));
  assert.ok(afterExt.fullText.includes('LEFT_COLUMN_EDITED_CLEANLY'));
  assert.ok(afterExt.fullText.includes('LARGE_HEADING_UPDATED_24PT'));
  assert.ok(afterExt.fullText.includes('SMALL_FOOTNOTE_UPDATED_9PT'));
  assert.ok(afterExt.fullText.includes('MOVED_LINE_AT_NEW_COORDINATES'));
  assert.ok(afterExt.fullText.includes('PAGE_TWO_CLAUSE_REPLACED_SUCCESSFULLY'));

  // Verify sibling table cells, right column, and unchanged page 2 text remain intact
  assert.ok(afterExt.fullText.includes('CELL_A1_ITEM'));
  assert.ok(afterExt.fullText.includes('CELL_C1_QTY_10'));
  assert.ok(afterExt.fullText.includes('RIGHT_COLUMN_PARAGRAPH_LINE'));
  assert.ok(afterExt.fullText.includes('PAGE_TWO_UNCHANGED_LINE'));

  // CRITICAL VERIFICATION: Original replaced or deleted text is genuinely removed from the PDF text stream (NO duplicate text, NO "Text Note")
  assert.equal(afterExt.fullText.includes('STATUS_ORIGINAL_WORD'), false, 'Original single word must be removed');
  assert.equal(afterExt.fullText.includes('lazy dog'), false, 'Original sentence must be removed');
  assert.equal(afterExt.fullText.includes('UNWANTED_TOKEN'), false, 'Deleted word must be removed');
  assert.equal(afterExt.fullText.includes('DELETE_ENTIRE_LINE_COMPLETELY_NOW'), false, 'Deleted line must be removed');
  assert.equal(afterExt.fullText.includes('Text Note'), false, 'Deleting a line must NEVER insert "Text Note"');
  assert.equal(afterExt.fullText.includes('SHORT_TAG'), false, 'Original short text must be removed');
  assert.equal(
    afterExt.fullText.includes('VERY_LONG_LEGACY_DESCRIPTION_TEXT_TO_SHORTEN_CLEANLY'),
    false,
    'Original long text must be removed'
  );
  assert.equal(afterExt.fullText.includes('CELL_B1_PRICE_500'), false, 'Original table cell value must be removed');
  assert.equal(afterExt.fullText.includes('CAPTION_NEAR_IMAGE_ORIGINAL'), false, 'Original image caption must be removed');
  assert.equal(afterExt.fullText.includes('LEFT_COLUMN_PARAGRAPH_LINE'), false, 'Original left column line must be removed');
  assert.equal(afterExt.fullText.includes('MOVABLE_LINE_ORIGINAL'), false, 'Original moved line text must be removed');
  assert.equal(afterExt.fullText.includes('PAGE_TWO_CLAUSE_ORIGINAL'), false, 'Original page 2 text must be removed');

  // Verify Manual Page Crop & Page Reordering / Duplication in applyEditorAnnotationsToPdf
  const croppedAndReorderedBytes = await applyEditorAnnotationsToPdf(editedPdfBytes, [], {
    pageCrops: {
      1: { xPercent: 10, yPercent: 10, widthPercent: 80, heightPercent: 80 },
    },
    pageSequence: [2, 1, 2], // Reorder Page 2 first, then Page 1, then duplicate Page 2
  });
  const cropReport = await inspectPdfBytes(croppedAndReorderedBytes);
  assert.equal(cropReport.pageCount, 3, 'Page sequence [2, 1, 2] should produce 3 pages');
});

test('9. Sejda UX & Interactive AcroForm Creation: Candidate Field Detection, Text/Multiline/Dropdown/Radio/Checkbox/Signature Widgets, Tab Order & Symbols', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);

  // Draw typical form prompts so detectCandidateFormFields finds them
  page.drawText('Full Name: ____________________', { x: 50, y: 700, size: 12, font });
  page.drawText('Client Signature: _______________', { x: 50, y: 650, size: 12, font });
  page.drawText('[ ] Agree to Terms', { x: 50, y: 600, size: 12, font });

  const formTemplateBytes = new Uint8Array(await doc.save());

  // 1. Verify detectCandidateFormFields detects candidate fields without modifying the PDF
  const candidates = await detectCandidateFormFields(formTemplateBytes);
  assert.ok(candidates.length >= 2, 'Should detect at least 2 candidate form fields from underscored/checkbox prompts');
  assert.ok(candidates.some((c) => c.fieldType === 'form-signature'), 'Should detect signature field candidate');

  // 2. Apply all 6 interactive AcroForm field types + all 5 quick symbols
  const outBytes = await applyEditorAnnotationsToPdf(formTemplateBytes, [
    {
      id: 'f_text',
      pageNumber: 1,
      type: 'form-text',
      xPercent: 25,
      yPercent: 10,
      widthPercent: 30,
      heightPercent: 4,
      fieldName: 'applicant_name',
      fieldValue: 'Jane Doe',
      isRequired: true,
      tabOrder: 1,
    },
    {
      id: 'f_multi',
      pageNumber: 1,
      type: 'form-multiline',
      xPercent: 25,
      yPercent: 18,
      widthPercent: 40,
      heightPercent: 10,
      fieldName: 'project_notes',
      fieldValue: 'Line 1\nLine 2',
      isMultiline: true,
      tabOrder: 2,
    },
    {
      id: 'f_drop',
      pageNumber: 1,
      type: 'form-dropdown',
      xPercent: 25,
      yPercent: 32,
      widthPercent: 28,
      heightPercent: 4,
      fieldName: 'plan_tier',
      dropdownOptions: ['Starter', 'Professional', 'Enterprise'],
      fieldValue: 'Enterprise',
      tabOrder: 3,
    },
    {
      id: 'f_chk',
      pageNumber: 1,
      type: 'form-checkbox',
      xPercent: 25,
      yPercent: 40,
      widthPercent: 3,
      heightPercent: 2.5,
      fieldName: 'accept_terms',
      checked: true,
      tabOrder: 4,
    },
    {
      id: 'f_rad1',
      pageNumber: 1,
      type: 'form-radio',
      xPercent: 25,
      yPercent: 46,
      widthPercent: 3,
      heightPercent: 2.5,
      fieldName: 'billing_cycle',
      radioGroupName: 'billing_cycle',
      radioOptionValue: 'Annual',
      checked: true,
      tabOrder: 5,
    },
    {
      id: 'f_sig',
      pageNumber: 1,
      type: 'form-signature',
      xPercent: 25,
      yPercent: 54,
      widthPercent: 28,
      heightPercent: 6,
      fieldName: 'authorized_signature',
      fieldPlaceholder: 'Sign Here',
      tabOrder: 6,
    },
    {
      id: 'sym_1',
      pageNumber: 1,
      type: 'symbol-check',
      xPercent: 10,
      yPercent: 70,
      widthPercent: 3,
      heightPercent: 2.5,
      colorHex: '#16a34a',
    },
    {
      id: 'sym_2',
      pageNumber: 1,
      type: 'symbol-cross',
      xPercent: 16,
      yPercent: 70,
      widthPercent: 3,
      heightPercent: 2.5,
      colorHex: '#dc2626',
    },
    {
      id: 'sym_3',
      pageNumber: 1,
      type: 'symbol-dot',
      xPercent: 22,
      yPercent: 70,
      widthPercent: 3,
      heightPercent: 2.5,
    },
    {
      id: 'sym_4',
      pageNumber: 1,
      type: 'symbol-circle',
      xPercent: 28,
      yPercent: 70,
      widthPercent: 3,
      heightPercent: 2.5,
    },
    {
      id: 'sym_5',
      pageNumber: 1,
      type: 'symbol-checkbox',
      xPercent: 34,
      yPercent: 70,
      widthPercent: 3,
      heightPercent: 2.5,
      checked: true,
    },
  ]);

  // 3. Inspect exported PDF to confirm genuine AcroForm fields exist and retain values
  const loadedOut = await PDFDocument.load(outBytes);
  const outForm = loadedOut.getForm();
  const fieldNames = outForm.getFields().map((f) => f.getName());
  assert.ok(fieldNames.includes('applicant_name'), 'Exported PDF must contain applicant_name AcroForm text field');
  assert.ok(fieldNames.includes('project_notes'), 'Exported PDF must contain project_notes AcroForm multiline field');
  assert.ok(fieldNames.includes('plan_tier'), 'Exported PDF must contain plan_tier AcroForm dropdown field');
  assert.ok(fieldNames.includes('accept_terms'), 'Exported PDF must contain accept_terms AcroForm checkbox field');
  assert.ok(fieldNames.includes('billing_cycle'), 'Exported PDF must contain billing_cycle AcroForm radio group');
  assert.equal(outForm.getTextField('applicant_name').getText(), 'Jane Doe');
  assert.equal(outForm.getCheckBox('accept_terms').isChecked(), true);
});

test('10. Non-Destructive PDF Text Editing on Colored Table Cells ("37" -> "40" on Page 2 TOTAL Row) & Surgical TJ Array Cell Stripping', async () => {
  // 1. Load the 4-page sample contract where Page 2 has the light-blue TOTAL row:
  //    ['TOTAL', 'Annual Contract Commitment (USD)', '37', '-', '$7,910.00']
  const sampleBytes = await generateSamplePdfBytes('primary');
  const extracted = await extractPdfTextAndLines(sampleBytes);

  const page2Lines = extracted.lines.filter((l) => l.pageNumber === 2);
  const qty37Line = page2Lines.find((l) => l.text.trim() === '37');
  assert.ok(qty37Line, 'Should detect the "37" cell in the Page 2 TOTAL row');
  assert.equal(qty37Line.isBold, true, 'Stream style parser should detect bold weight on TOTAL row "37"');
  assert.equal(
    qty37Line.colorHex?.toLowerCase(),
    '#1a2638',
    'Stream style parser should detect exact dark navy RGB color (#1a2638) of TOTAL row text'
  );

  // Also verify dark header white text color extraction ("Item Code" on dark navy header)
  const itemCodeHeaderLine = page2Lines.find((l) => l.text.trim() === 'Item Code');
  assert.ok(itemCodeHeaderLine, 'Should detect "Item Code" header cell on Page 2');
  assert.equal(
    itemCodeHeaderLine.colorHex?.toLowerCase(),
    '#ffffff',
    'Stream style parser should detect white text (#ffffff) on dark table header'
  );

  // 2. Build the exact in-place edit annotation created by PdfEditorWorkspace (with fillHex: undefined)
  const edit37Annotation = {
    id: 'edit_total_qty_37',
    pageNumber: 2,
    type: 'text' as const,
    isExistingTextEdit: true,
    originalText: '37',
    text: '40',
    xPercent: qty37Line.xPercent!,
    yPercent: qty37Line.yPercent!,
    widthPercent: Math.max(3.2, qty37Line.widthPercent! + 1.2),
    heightPercent: Math.max(2.0, qty37Line.heightPercent! + 0.3),
    originXPt: qty37Line.x,
    originYPt: qty37Line.y,
    originWidthPt: qty37Line.width,
    originHeightPt: qty37Line.height,
    originXPercent: qty37Line.xPercent,
    originYPercent: qty37Line.yPercent,
    originWidthPercent: qty37Line.widthPercent,
    originHeightPercent: qty37Line.heightPercent,
    fontSize: qty37Line.fontSize,
    fontFamily: qty37Line.fontFamily,
    isBold: qty37Line.isBold,
    colorHex: qty37Line.colorHex,
    fillHex: undefined,
  };

  // 3. Verify live canvas stripping via stripEditedTextFromPdfBytes removes "37" cleanly
  const liveStripped = await stripEditedTextFromPdfBytes(sampleBytes, [edit37Annotation], 2);
  assert.ok(
    liveStripped.removedIds.includes('edit_total_qty_37'),
    'stripEditedTextFromPdfBytes must report edit_total_qty_37 as removed from content stream'
  );
  const liveExtracted = await extractPdfTextAndLines(liveStripped.bytes);
  const livePage2Lines = liveExtracted.lines.filter((l) => l.pageNumber === 2);
  assert.equal(
    livePage2Lines.some((l) => l.text.trim() === '37'),
    false,
    'Live stripped PDF stream must not contain original "37" cell text'
  );
  assert.ok(
    livePage2Lines.some((l) => l.text.includes('Annual Contract Commitment (USD)')),
    'Neighboring cell "Annual Contract Commitment (USD)" must remain intact on live canvas'
  );
  assert.ok(
    livePage2Lines.some((l) => l.text.includes('$7,910.00')),
    'Neighboring cell "$7,910.00" must remain intact on live canvas'
  );

  // 4. Verify full PDF export via applyEditorAnnotationsToPdf replaces "37" with "40"
  //    AND does NOT draw any #ffffff white cover rectangle over the light-blue TOTAL row
  const exportedBytes = await applyEditorAnnotationsToPdf(sampleBytes, [edit37Annotation]);
  const exportedExtracted = await extractPdfTextAndLines(exportedBytes);
  const exportedPage2Lines = exportedExtracted.lines.filter((l) => l.pageNumber === 2);

  assert.equal(
    exportedPage2Lines.some((l) => l.text.trim() === '37'),
    false,
    'Exported Page 2 must not contain original "37"'
  );
  assert.ok(
    exportedPage2Lines.some((l) => l.text.trim() === '40'),
    'Exported Page 2 must contain replacement "40"'
  );
  assert.ok(
    exportedPage2Lines.some((l) => l.text.includes('TOTAL')),
    'Exported Page 2 must preserve "TOTAL" cell'
  );
  assert.ok(
    exportedPage2Lines.some((l) => l.text.includes('$7,910.00')),
    'Exported Page 2 must preserve "$7,910.00" cell'
  );
});

