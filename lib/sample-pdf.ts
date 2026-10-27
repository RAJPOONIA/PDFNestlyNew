import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Generates a valid uncompressed RGB PNG image in memory (works in both Node and Browser)
 * so sample PDFs include a real embedded raster graphic for testing PDF compression,
 * image extraction, and rendering.
 */
function generateEmbeddedSealPng(width = 320, height = 140): Uint8Array {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }

  function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function writeUInt32BE(arr: Uint8Array, offset: number, val: number) {
    arr[offset] = (val >>> 24) & 0xff;
    arr[offset + 1] = (val >>> 16) & 0xff;
    arr[offset + 2] = (val >>> 8) & 0xff;
    arr[offset + 3] = val & 0xff;
  }

  function makeChunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    writeUInt32BE(out, 0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const crcInput = out.subarray(4, 8 + data.length);
    writeUInt32BE(out, 8 + data.length, crc32(crcInput));
    return out;
  }

  // Raw scanlines: each row has 1 filter byte (0) + width * 3 RGB bytes
  const rowSize = 1 + width * 3;
  const rawScanlines = new Uint8Array(height * rowSize);
  let prng = 0x13579bdf;
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawScanlines[rowOffset] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 3;
      const border = x < 8 || x >= width - 8 || y < 8 || y >= height - 8;
      if (border) {
        rawScanlines[px] = 30;
        rawScanlines[px + 1] = 64;
        rawScanlines[px + 2] = 175;
      } else {
        // Continuous-tone gradient + fine grain so lossless FlateDecode retains realistic raster size (~180 KB)
        // while DCTEncode + DPI downsampling achieves genuine resolution-dependent compression
        prng = (Math.imul(prng, 1664525) + 1013904223) >>> 0;
        const grain = (prng >>> 24) & 0x1f;
        const gradX = Math.floor((x / width) * 55);
        const gradY = Math.floor((y / height) * 45);
        rawScanlines[px] = (140 + gradX + grain) & 0xff;
        rawScanlines[px + 1] = (155 + gradY + ((grain * 3) & 0x1f)) & 0xff;
        rawScanlines[px + 2] = (175 + ((gradX + gradY) >> 1) + ((prng >>> 19) & 0x1f)) & 0xff;
      }
    }
  }

  // Wrap rawScanlines in valid ZLIB stored (uncompressed) deflate blocks (max 65535 bytes per block)
  const maxBlock = 65535;
  const numBlocks = Math.ceil(rawScanlines.length / maxBlock);
  const zlibData = new Uint8Array(2 + rawScanlines.length + numBlocks * 5 + 4);
  zlibData[0] = 0x78; // CMF
  zlibData[1] = 0x01; // FLG
  let zOffset = 2;

  for (let b = 0; b < numBlocks; b++) {
    const start = b * maxBlock;
    const end = Math.min(start + maxBlock, rawScanlines.length);
    const len = end - start;
    const isLast = b === numBlocks - 1 ? 1 : 0;
    zlibData[zOffset++] = isLast;
    zlibData[zOffset++] = len & 0xff;
    zlibData[zOffset++] = (len >>> 8) & 0xff;
    const nlen = (~len) & 0xffff;
    zlibData[zOffset++] = nlen & 0xff;
    zlibData[zOffset++] = (nlen >>> 8) & 0xff;
    zlibData.set(rawScanlines.subarray(start, end), zOffset);
    zOffset += len;
  }

  // Compute Adler-32 checksum for ZLIB stream
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < rawScanlines.length; i++) {
    s1 = (s1 + rawScanlines[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const adler = ((s2 << 16) | s1) >>> 0;
  writeUInt32BE(zlibData, zOffset, adler);

  const ihdr = new Uint8Array(13);
  writeUInt32BE(ihdr, 0, width);
  writeUInt32BE(ihdr, 4, height);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 2; // RGB

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const cIhdr = makeChunk('IHDR', ihdr);
  const cIdat = makeChunk('IDAT', zlibData);
  const cIend = makeChunk('IEND', new Uint8Array(0));

  const finalPng = new Uint8Array(sig.length + cIhdr.length + cIdat.length + cIend.length);
  let pos = 0;
  finalPng.set(sig, pos); pos += sig.length;
  finalPng.set(cIhdr, pos); pos += cIhdr.length;
  finalPng.set(cIdat, pos); pos += cIdat.length;
  finalPng.set(cIend, pos);
  return finalPng;
}

/**
 * Generates a realistic 4-page PDF document ("PDFNestly Enterprise Service Agreement & Invoice")
 * containing:
 * - Page 1: Executive Agreement, Metadata, and Interactive AcroForm fields (Client Name, Project Code, Approval Checkbox)
 * - Page 2: Itemized Financial Table (for testing PDF-to-Excel/CSV/Table extraction)
 * - Page 3: Technical Architecture & Confidentiality Clauses
 * - Page 4: Signature Block, Embedded Raster Graphic Seal, & Execution Page
 */
export async function generateSamplePdfBytes(variant: 'primary' | 'comparison' = 'primary'): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  pdfDoc.setTitle(
    variant === 'primary'
      ? 'PDFNestly Enterprise Service Agreement v1.0'
      : 'PDFNestly Enterprise Service Agreement v2.0 (Revised)'
  );
  pdfDoc.setAuthor('PDFNestly Document Engineering');
  pdfDoc.setSubject('Commercial SaaS Agreement, Financial Schedule, and Execution Form');
  pdfDoc.setKeywords(['PDFNestly', 'Contract', 'Invoice', 'AcroForm', 'Table']);
  pdfDoc.setCreator('PDFNestly Sample Generator (pdf-lib)');
  pdfDoc.setProducer('PDFNestly Engine');

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  const form = pdfDoc.getForm();

  // --- PAGE 1: Agreement Overview & Interactive Form Fields ---
  const page1 = pdfDoc.addPage([612, 792]); // US Letter
  page1.drawRectangle({
    x: 0,
    y: 720,
    width: 612,
    height: 72,
    color: rgb(0.06, 0.09, 0.16),
  });
  page1.drawText('PDFNestly.com — Enterprise Document Platform', {
    x: 48,
    y: 752,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page1.drawText(
    variant === 'primary'
      ? 'Document Reference: MSA-2026-0891  |  Revision: 1.0'
      : 'Document Reference: MSA-2026-0891  |  Revision: 2.0 (Updated Pricing)',
    {
      x: 48,
      y: 734,
      size: 10,
      font: fontMono,
      color: rgb(0.75, 0.82, 0.95),
    }
  );

  page1.drawText('1. Master Service Agreement Overview', {
    x: 48,
    y: 675,
    size: 14,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });

  const introLines =
    variant === 'primary'
      ? [
          'This Master Service Agreement ("Agreement") is entered into as of October 27, 2026',
          'between PDFNestly Inc. ("Provider") and the Client identified in the interactive schedule.',
          'All document processing operations execute under strict zero-trust security standards.',
          'Standard SLA uptime commitment is 99.90% across regional document processing nodes.',
        ]
      : [
          'This Master Service Agreement ("Agreement") is entered into as of November 01, 2026',
          'between PDFNestly Inc. ("Provider") and the Client identified in the interactive schedule.',
          'All document processing operations execute under strict zero-trust security standards.',
          'Enhanced SLA uptime commitment is 99.99% across dedicated high-availability clusters.',
        ];

  introLines.forEach((line, idx) => {
    page1.drawText(line, {
      x: 48,
      y: 648 - idx * 18,
      size: 10.5,
      font: fontRegular,
      color: rgb(0.2, 0.25, 0.33),
    });
  });

  // Interactive AcroForm Box
  page1.drawRectangle({
    x: 48,
    y: 410,
    width: 516,
    height: 150,
    borderColor: rgb(0.78, 0.83, 0.9),
    borderWidth: 1,
    color: rgb(0.97, 0.98, 1.0),
  });

  page1.drawText('Interactive Client Information Form (AcroForm Supported)', {
    x: 64,
    y: 536,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.25, 0.6),
  });

  page1.drawText('Client Organization Name:', {
    x: 64,
    y: 505,
    size: 10,
    font: fontRegular,
    color: rgb(0.15, 0.2, 0.28),
  });
  const clientField = form.createTextField('client_organization');
  clientField.setText(variant === 'primary' ? 'Northwind Global Logistics Ltd.' : 'Northwind Global Holdings Corp.');
  clientField.addToPage(page1, {
    x: 220,
    y: 498,
    width: 320,
    height: 22,
    borderWidth: 1,
    borderColor: rgb(0.6, 0.68, 0.78),
    backgroundColor: rgb(1, 1, 1),
  });

  page1.drawText('Purchase Order / Project Code:', {
    x: 64,
    y: 468,
    size: 10,
    font: fontRegular,
    color: rgb(0.15, 0.2, 0.28),
  });
  const codeField = form.createTextField('project_code');
  codeField.setText(variant === 'primary' ? 'PO-2026-4410' : 'PO-2026-4410-REV2');
  codeField.addToPage(page1, {
    x: 220,
    y: 461,
    width: 200,
    height: 22,
    borderWidth: 1,
    borderColor: rgb(0.6, 0.68, 0.78),
    backgroundColor: rgb(1, 1, 1),
  });

  page1.drawText('Authorize Automated Billing & Compliance Terms:', {
    x: 92,
    y: 430,
    size: 10,
    font: fontRegular,
    color: rgb(0.15, 0.2, 0.28),
  });
  const approvalCheck = form.createCheckBox('authorize_terms');
  approvalCheck.check();
  approvalCheck.addToPage(page1, {
    x: 64,
    y: 426,
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: rgb(0.1, 0.25, 0.6),
  });

  page1.drawText('Confidential Account Identifier (Test Redaction Target):', {
    x: 48,
    y: 365,
    size: 11,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });
  page1.drawText('SENSITIVE-API-TOKEN: sk_live_994810294810_REDACT_ME', {
    x: 48,
    y: 344,
    size: 10.5,
    font: fontMono,
    color: rgb(0.75, 0.12, 0.15),
  });

  // --- PAGE 2: Financial Schedule & Structured Table ---
  const page2 = pdfDoc.addPage([612, 792]);
  page2.drawText('2. Itemized Financial Schedule & Resource Quotas', {
    x: 48,
    y: 730,
    size: 14,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });
  page2.drawText('Structured tabular data for PDF-to-Excel (XLSX) and CSV extraction verification:', {
    x: 48,
    y: 708,
    size: 10,
    font: fontRegular,
    color: rgb(0.3, 0.35, 0.45),
  });

  const tableRows = [
    ['Item Code', 'Service Description', 'Qty', 'Unit Price', 'Line Total'],
    ['PDF-CORE-01', 'Enterprise PDF Rendering & Merge Cluster', '12', '$250.00', '$3,000.00'],
    ['PDF-OCR-02', 'Optical Character Recognition (Multi-Lang)', '12', '$180.00', '$2,160.00'],
    ['PDF-SEC-03', 'Hardware HSM Encryption & Redaction Node', '12', variant === 'primary' ? '$150.00' : '$125.00', variant === 'primary' ? '$1,800.00' : '$1,500.00'],
    ['PDF-API-04', 'High-Throughput Conversion Webhook Tier', '1', '$950.00', '$950.00'],
    ['TOTAL', 'Annual Contract Commitment (USD)', '37', '-', variant === 'primary' ? '$7,910.00' : '$7,610.00'],
  ];

  const colX = [48, 140, 385, 435, 510];
  let currentY = 670;

  tableRows.forEach((row, rIdx) => {
    const isHeader = rIdx === 0;
    const isTotal = rIdx === tableRows.length - 1;
    page2.drawRectangle({
      x: 44,
      y: currentY - 8,
      width: 524,
      height: 26,
      color: isHeader
        ? rgb(0.1, 0.25, 0.55)
        : isTotal
        ? rgb(0.92, 0.95, 0.99)
        : rIdx % 2 === 0
        ? rgb(0.98, 0.98, 0.99)
        : rgb(1, 1, 1),
      borderColor: rgb(0.82, 0.86, 0.92),
      borderWidth: 0.5,
    });

    row.forEach((cell, cIdx) => {
      page2.drawText(cell, {
        x: colX[cIdx],
        y: currentY,
        size: 9.5,
        font: isHeader || isTotal ? fontBold : fontRegular,
        color: isHeader ? rgb(1, 1, 1) : rgb(0.1, 0.15, 0.22),
      });
    });

    currentY -= 26;
  });

  // --- PAGE 3: Data Privacy, Retention & Technical Specifications ---
  const page3 = pdfDoc.addPage([612, 792]);
  page3.drawText('3. Security Architecture & Temporary Storage Policy', {
    x: 48,
    y: 730,
    size: 14,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });

  const policyParagraphs = [
    '3.1 Local Browser Execution: Operations such as merging, splitting, page rotation, reordering,',
    'cropping, watermarking, form filling, and signature placement run inside WebAssembly and JavaScript',
    'memory buffers directly in the client browser whenever supported.',
    '',
    '3.2 Ephemeral Server Processing: Operations requiring Ghostscript (such as high-ratio stream',
    'compression, 128-bit password encryption, decryption, and damaged xref table recovery) execute',
    'in isolated temporary directories (/tmp) and are immediately unlinked upon response completion.',
    '',
    '3.3 True Redaction Verification: Unlike simple visual annotations that place a black rectangle',
    'over sensitive text while leaving underlying strings selectable, PDFNestly permanent redaction',
    'rasterizes or purges the underlying content stream so redacted tokens cannot be recovered.',
  ];

  policyParagraphs.forEach((line, idx) => {
    page3.drawText(line, {
      x: 48,
      y: 695 - idx * 18,
      size: 10.5,
      font: fontRegular,
      color: rgb(0.2, 0.25, 0.33),
    });
  });

  // --- PAGE 4: Signature, Embedded Raster Graphic Seal & Execution Block ---
  const page4 = pdfDoc.addPage([612, 792]);
  page4.drawText('4. Authorized Signatures & Execution Page', {
    x: 48,
    y: 730,
    size: 14,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });

  page4.drawText(
    'IN WITNESS WHEREOF, the parties have executed this Master Service Agreement on the date below.',
    {
      x: 48,
      y: 695,
      size: 10.5,
      font: fontRegular,
      color: rgb(0.2, 0.25, 0.33),
    }
  );

  page4.drawRectangle({
    x: 48,
    y: 520,
    width: 240,
    height: 120,
    borderColor: rgb(0.7, 0.76, 0.85),
    borderWidth: 1,
    color: rgb(0.99, 0.99, 1),
  });
  page4.drawText('CLIENT SIGNATURE AREA', {
    x: 64,
    y: 618,
    size: 9,
    font: fontBold,
    color: rgb(0.4, 0.46, 0.55),
  });
  page4.drawText('Place your drawn or typed signature here', {
    x: 64,
    y: 575,
    size: 9,
    font: fontRegular,
    color: rgb(0.55, 0.6, 0.68),
  });

  page4.drawRectangle({
    x: 324,
    y: 520,
    width: 240,
    height: 120,
    borderColor: rgb(0.7, 0.76, 0.85),
    borderWidth: 1,
    color: rgb(0.99, 0.99, 1),
  });
  page4.drawText('PROVIDER COUNTERSIGNATURE', {
    x: 340,
    y: 618,
    size: 9,
    font: fontBold,
    color: rgb(0.4, 0.46, 0.55),
  });
  page4.drawText('Signed: Eleanor Vance, VP Operations', {
    x: 340,
    y: 575,
    size: 10,
    font: fontBold,
    color: rgb(0.1, 0.25, 0.55),
  });

  // Embed real 360 DPI continuous-tone raster verification banner (800x400 px drawn at 160x80 pt = 360 DPI)
  // so 72 DPI (/screen), 150 DPI (/ebook), and 300 DPI (/printer, /prepress) downsampling all operate genuinely
  const sealPngBytes = generateEmbeddedSealPng(800, 400);
  const embeddedSeal = await pdfDoc.embedPng(sealPngBytes);
  page4.drawImage(embeddedSeal, {
    x: 48,
    y: 350,
    width: 160,
    height: 80,
  });
  page4.drawText('Official Cryptographic Verification Graphic (800×400 px @ 360 DPI Raster Stream)', {
    x: 48,
    y: 334,
    size: 8.5,
    font: fontMono,
    color: rgb(0.35, 0.4, 0.48),
  });

  return await pdfDoc.save({ useObjectStreams: false });
}
