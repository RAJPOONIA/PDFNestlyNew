import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { PDFDocument, rgb } from 'pdf-lib';
import { validateFileHeader } from '@/lib/pdf-utils';

const execFileAsync = promisify(execFile);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(req: NextRequest) {
  let tempDir: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const operation = String(formData.get('operation') || '').trim();

    if (!file) {
      return NextResponse.json(
        { error: 'No PDF file provided in request.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `File size exceeds maximum limit of 50 MB (received ${(
            file.size /
            (1024 * 1024)
          ).toFixed(1)} MB).`,
        },
        { status: 413 }
      );
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const headerValidation = validateFileHeader(new Uint8Array(inputBuffer), 'pdf');

    // Allow 'repair' operation to attempt recovery even if header has leading garbage bytes, provided '%PDF-' exists in the file
    if (!headerValidation.valid) {
      if (operation === 'repair') {
        const rawAscii = inputBuffer.subarray(0, Math.min(inputBuffer.length, 4096)).toString('latin1');
        if (!rawAscii.includes('%PDF-')) {
          return NextResponse.json(
            { error: 'File does not contain a recognizable %PDF- signature and cannot be repaired.' },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { error: headerValidation.error || 'Uploaded file is not a valid PDF.' },
          { status: 400 }
        );
      }
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdfnestly-'));
    const inputPath = path.join(tempDir, `input-${crypto.randomUUID()}.pdf`);
    const outputPath = path.join(tempDir, `output-${crypto.randomUUID()}.pdf`);

    await fs.writeFile(inputPath, inputBuffer);

    let engineUsed = 'Ghostscript 9.55.0';
    let outputBytes: Uint8Array;

    if (operation === 'compress') {
      const level = String(formData.get('level') || 'ebook');
      const presetConfig: Record<
        string,
        { setting: string; dpi: number; qFactor: string; label: string }
      > = {
        screen: {
          setting: '/screen',
          dpi: 72,
          qFactor: '1.30',
          label: '/screen 72 DPI High Compression',
        },
        ebook: {
          setting: '/ebook',
          dpi: 150,
          qFactor: '0.65',
          label: '/ebook 150 DPI Balanced',
        },
        printer: {
          setting: '/printer',
          dpi: 300,
          qFactor: '0.25',
          label: '/printer 300 DPI High Quality',
        },
        prepress: {
          setting: '/prepress',
          dpi: 300,
          qFactor: '0.10',
          label: '/prepress 300 DPI Archival',
        },
      };
      const cfg = presetConfig[level] || presetConfig.ebook;

      // Place overrides AFTER -dPDFSETTINGS so Ghostscript does not force 52KB sRGB ICC profile or Base-14 font bloat
      await execFileAsync(
        'gs',
        [
          '-sDEVICE=pdfwrite',
          '-dCompatibilityLevel=1.5',
          `-dPDFSETTINGS=${cfg.setting}`,
          '-dNOPAUSE',
          '-dQUIET',
          '-dBATCH',
          '-sColorConversionStrategy=LeaveColorUnchanged',
          '-dEmbedAllFonts=false',
          '-dSubsetFonts=true',
          '-dCompressFonts=true',
          '-dDetectDuplicateImages=true',
          '-dDownsampleColorImages=true',
          '-dDownsampleGrayImages=true',
          '-dDownsampleMonoImages=true',
          '-dColorImageDownsampleType=/Bicubic',
          `-dColorImageResolution=${cfg.dpi}`,
          `-dGrayImageResolution=${cfg.dpi}`,
          `-dMonoImageResolution=${cfg.dpi * 2}`,
          '-dColorImageDownsampleThreshold=1.0',
          '-dGrayImageDownsampleThreshold=1.0',
          '-dAutoFilterColorImages=false',
          '-dColorImageFilter=/DCTEncode',
          `-sOutputFile=${outputPath}`,
          '-c',
          `<< /ColorACSImageDict << /QFactor ${cfg.qFactor} /Blend 1 /HSamples [2 1 1 2] /VSamples [2 1 1 2] >> /ColorImageDict << /QFactor ${cfg.qFactor} /Blend 1 /HSamples [2 1 1 2] /VSamples [2 1 1 2] >> >> setdistillerparams`,
          '-f',
          inputPath,
        ],
        { timeout: 30000 }
      );

      const gsOut = await fs.readFile(outputPath);
      const gsBytes = new Uint8Array(gsOut);

      // Compact Ghostscript's output cross-reference table into PDF 1.5 Object Streams
      try {
        const gsDoc = await PDFDocument.load(gsBytes, { ignoreEncryption: true });
        const gsCompacted = await gsDoc.save({ useObjectStreams: true });
        outputBytes =
          gsCompacted.byteLength < gsBytes.byteLength ? gsCompacted : gsBytes;
      } catch {
        outputBytes = gsBytes;
      }
      engineUsed = `Ghostscript 9.55 (${cfg.label})`;
    } else if (operation === 'protect') {
      const userPassword = String(formData.get('userPassword') || '');
      const ownerPassword = String(
        formData.get('ownerPassword') || userPassword || crypto.randomBytes(8).toString('hex')
      );
      const allowPrint = formData.get('allowPrint') !== 'false';
      const allowCopy = formData.get('allowCopy') !== 'false';

      if (!userPassword && !formData.get('ownerPassword')) {
        return NextResponse.json(
          { error: 'Please specify a User Password or Owner Password to encrypt the PDF.' },
          { status: 400 }
        );
      }

      // Compute PDF Revision 3 128-bit permission bitmask (negative signed 32-bit int per PDF spec)
      let permissions = -3904; // base restricted mask
      if (allowPrint) permissions += 4 + 2048;
      if (allowCopy) permissions += 16;

      const gsArgs = [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.5',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        '-dEncryptionR=3',
        '-dKeyLength=128',
        `-dPermissions=${permissions}`,
        `-sOwnerPassword=${ownerPassword}`,
      ];
      if (userPassword) {
        gsArgs.push(`-sUserPassword=${userPassword}`);
      }
      gsArgs.push(`-sOutputFile=${outputPath}`, inputPath);

      await execFileAsync('gs', gsArgs, { timeout: 30000 });
      const gsOut = await fs.readFile(outputPath);
      outputBytes = new Uint8Array(gsOut);
      engineUsed = 'Ghostscript 9.55 (128-bit PDF Encryption)';
    } else if (operation === 'unlock') {
      const password = String(formData.get('password') || '');
      if (!password) {
        return NextResponse.json(
          { error: 'Please enter the existing password for this PDF to unlock it.' },
          { status: 400 }
        );
      }

      try {
        await execFileAsync(
          'gs',
          [
            '-sDEVICE=pdfwrite',
            '-dNOPAUSE',
            '-dQUIET',
            '-dBATCH',
            `-sPDFPassword=${password}`,
            `-sOutputFile=${outputPath}`,
            inputPath,
          ],
          { timeout: 30000 }
        );
      } catch {
        return NextResponse.json(
          {
            error:
              'Unable to decrypt PDF: The supplied password is incorrect or the PDF uses an unsupported security handler.',
          },
          { status: 401 }
        );
      }

      const gsOut = await fs.readFile(outputPath);
      outputBytes = new Uint8Array(gsOut);
      engineUsed = 'Ghostscript 9.55 Decryption Engine';
    } else if (operation === 'repair') {
      try {
        await execFileAsync(
          'gs',
          [
            '-sDEVICE=pdfwrite',
            '-dNOPAUSE',
            '-dQUIET',
            '-dBATCH',
            '-dPDFSTOPONERROR=false',
            `-sOutputFile=${outputPath}`,
            inputPath,
          ],
          { timeout: 30000 }
        );
        const gsOut = await fs.readFile(outputPath);
        outputBytes = new Uint8Array(gsOut);
        const recoveredDoc = await PDFDocument.load(outputBytes, { ignoreEncryption: true });
        if (recoveredDoc.getPageCount() === 0) {
          throw new Error('Zero pages recovered from damaged stream.');
        }
      } catch (repairErr) {
        return NextResponse.json(
          {
            error: `Unable to recover readable PDF pages from damaged file: ${
              repairErr instanceof Error ? repairErr.message : 'Corrupted stream'
            }`,
          },
          { status: 422 }
        );
      }
      engineUsed = 'Ghostscript 9.55 XRef & Stream Recovery Engine';
    } else if (operation === 'print-ready') {
      const bleedPt = Math.max(0, Math.min(72, Number(formData.get('bleedPt') || 18)));
      const addTrimMarks = formData.get('addTrimMarks') !== 'false';

      // Step 1: Add trim marks & bleed padding with pdf-lib
      const srcDoc = await PDFDocument.load(inputBuffer, { ignoreEncryption: true });
      const outDoc = await PDFDocument.create();
      const pages = srcDoc.getPages();

      for (let i = 0; i < pages.length; i++) {
        const srcPage = pages[i];
        const { width, height } = srcPage.getSize();
        const newWidth = width + bleedPt * 2;
        const newHeight = height + bleedPt * 2;

        const embeddedPage = await outDoc.embedPage(srcPage);
        const page = outDoc.addPage([newWidth, newHeight]);
        page.drawPage(embeddedPage, {
          x: bleedPt,
          y: bleedPt,
          width,
          height,
        });

        if (addTrimMarks && bleedPt >= 10) {
          const markLen = Math.min(bleedPt - 3, 14);
          const markColor = rgb(0, 0, 0);
          // Bottom-left
          page.drawLine({ start: { x: 2, y: bleedPt }, end: { x: 2 + markLen, y: bleedPt }, thickness: 0.5, color: markColor });
          page.drawLine({ start: { x: bleedPt, y: 2 }, end: { x: bleedPt, y: 2 + markLen }, thickness: 0.5, color: markColor });
          // Bottom-right
          page.drawLine({ start: { x: newWidth - 2 - markLen, y: bleedPt }, end: { x: newWidth - 2, y: bleedPt }, thickness: 0.5, color: markColor });
          page.drawLine({ start: { x: newWidth - bleedPt, y: 2 }, end: { x: newWidth - bleedPt, y: 2 + markLen }, thickness: 0.5, color: markColor });
          // Top-left
          page.drawLine({ start: { x: 2, y: newHeight - bleedPt }, end: { x: 2 + markLen, y: newHeight - bleedPt }, thickness: 0.5, color: markColor });
          page.drawLine({ start: { x: bleedPt, y: newHeight - 2 - markLen }, end: { x: bleedPt, y: newHeight - 2 }, thickness: 0.5, color: markColor });
          // Top-right
          page.drawLine({ start: { x: newWidth - 2 - markLen, y: newHeight - bleedPt }, end: { x: newWidth - 2, y: newHeight - bleedPt }, thickness: 0.5, color: markColor });
          page.drawLine({ start: { x: newWidth - bleedPt, y: newHeight - 2 - markLen }, end: { x: newWidth - bleedPt, y: newHeight - 2 }, thickness: 0.5, color: markColor });
        }
      }

      const markedBytes = await outDoc.save();
      await fs.writeFile(inputPath, Buffer.from(markedBytes));

      // Step 2: Run Ghostscript /prepress 300 DPI optimization
      await execFileAsync(
        'gs',
        [
          '-sDEVICE=pdfwrite',
          '-dCompatibilityLevel=1.5',
          '-dPDFSETTINGS=/prepress',
          '-dNOPAUSE',
          '-dQUIET',
          '-dBATCH',
          '-dEmbedAllFonts=true',
          `-sOutputFile=${outputPath}`,
          inputPath,
        ],
        { timeout: 30000 }
      );
      const gsOut = await fs.readFile(outputPath);
      outputBytes = new Uint8Array(gsOut);
      engineUsed = 'pdf-lib Trim Marks + Ghostscript 9.55 (/prepress 300 DPI)';
    } else {
      return NextResponse.json(
        { error: `Unsupported server operation: "${operation}".` },
        { status: 400 }
      );
    }

    return new NextResponse(Buffer.from(outputBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'X-Original-Size': String(inputBuffer.byteLength),
        'X-Output-Size': String(outputBytes.byteLength),
        'X-Engine-Used': engineUsed,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Server PDF processing failed.';
    return NextResponse.json(
      { error: `PDF processing failed: ${message}` },
      { status: 500 }
    );
  } finally {
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
