import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { PDFDocument, rgb } from 'pdf-lib';
import { validateFileHeader } from '@/lib/pdf-utils';
import {
  encryptPdf,
  decryptPdf,
  compressPdf,
  repairPdf,
  resolveBinary,
} from '@/lib/server-pdf-engine';

const execFileAsync = promisify(execFile);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

const SYSTEM_PATH = [
  process.env.PATH || '',
  '/usr/local/sbin',
  '/usr/local/bin',
  '/usr/sbin',
  '/usr/bin',
  '/sbin',
  '/bin',
  '/opt/homebrew/bin',
]
  .filter(Boolean)
  .join(':');

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

    let engineUsed = 'PDFNestly Engine';
    let outputBytes: Uint8Array;

    if (operation === 'compress') {
      const level = String(formData.get('level') || 'ebook');
      const result = await compressPdf(inputPath, outputPath, level);
      outputBytes = result.outputBytes;
      engineUsed = result.engineUsed;
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

      engineUsed = await encryptPdf(inputPath, outputPath, {
        userPassword,
        ownerPassword,
        keyLength: 256,
        allowPrint,
        allowCopy,
      });

      const outBuf = await fs.readFile(outputPath);
      outputBytes = new Uint8Array(outBuf);
    } else if (operation === 'unlock') {
      const password = String(formData.get('password') || '');
      if (!password) {
        return NextResponse.json(
          { error: 'Please enter the existing password for this PDF to unlock it.' },
          { status: 400 }
        );
      }

      try {
        engineUsed = await decryptPdf(inputPath, outputPath, password);
        const outBuf = await fs.readFile(outputPath);
        outputBytes = new Uint8Array(outBuf);
      } catch (unlockErr: unknown) {
        const errorMsg =
          unlockErr instanceof Error
            ? unlockErr.message
            : 'Unable to decrypt PDF with the provided password.';
        const statusCode =
          unlockErr && typeof unlockErr === 'object' && 'statusCode' in unlockErr
            ? (unlockErr as { statusCode: number }).statusCode
            : 401;

        return NextResponse.json({ error: errorMsg }, { status: statusCode });
      }
    } else if (operation === 'repair') {
      try {
        const result = await repairPdf(inputPath, outputPath);
        outputBytes = result.outputBytes;
        engineUsed = result.engineUsed;
      } catch (repairErr: unknown) {
        return NextResponse.json(
          {
            error:
              repairErr instanceof Error
                ? repairErr.message
                : 'Unable to recover readable PDF pages from damaged file.',
          },
          { status: 422 }
        );
      }
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

      // Step 2: Run Ghostscript /prepress 300 DPI optimization if available
      const gsBin = await resolveBinary('gs');
      if (gsBin) {
        await execFileAsync(
          gsBin,
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
          {
            env: { ...process.env, PATH: SYSTEM_PATH },
            timeout: 30000,
          }
        );
        const gsOut = await fs.readFile(outputPath);
        outputBytes = new Uint8Array(gsOut);
        engineUsed = 'pdf-lib Trim Marks + Ghostscript (/prepress 300 DPI)';
      } else {
        outputBytes = markedBytes;
        engineUsed = 'pdf-lib Trim Marks & Bleed Embedding Engine';
      }
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
