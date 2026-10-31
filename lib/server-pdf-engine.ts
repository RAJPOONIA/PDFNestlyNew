import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

const execFileAsync = promisify(execFile);

// Augmented PATH ensuring system binaries are always found regardless of minimal PM2 / container PATH
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

const BINARY_CACHE = new Map<string, string | null>();

/**
 * Discovers the absolute path to a system binary with caching and fallback search.
 */
export async function resolveBinary(name: 'qpdf' | 'gs' | 'pdftoppm' | 'pdftotext'): Promise<string | null> {
  if (BINARY_CACHE.has(name)) {
    return BINARY_CACHE.get(name)!;
  }

  // Check explicit environment overrides first
  const envKey = `${name.toUpperCase()}_PATH`;
  if (process.env[envKey] && fsSync.existsSync(process.env[envKey]!)) {
    BINARY_CACHE.set(name, process.env[envKey]!);
    return process.env[envKey]!;
  }

  // Candidate paths across Debian/Ubuntu, RedHat, Alpine, and macOS
  const candidates: Record<string, string[]> = {
    qpdf: ['/usr/bin/qpdf', '/usr/local/bin/qpdf', '/bin/qpdf', '/opt/homebrew/bin/qpdf'],
    gs: ['/usr/bin/gs', '/usr/local/bin/gs', '/bin/gs', '/usr/bin/ghostscript', '/opt/homebrew/bin/gs'],
    pdftoppm: ['/usr/bin/pdftoppm', '/usr/local/bin/pdftoppm', '/bin/pdftoppm'],
    pdftotext: ['/usr/bin/pdftotext', '/usr/local/bin/pdftotext', '/bin/pdftotext'],
  };

  for (const candidate of candidates[name] || []) {
    if (fsSync.existsSync(candidate)) {
      BINARY_CACHE.set(name, candidate);
      return candidate;
    }
  }

  // Try 'which' as fallback
  try {
    const { stdout } = await execFileAsync('which', [name], {
      env: { ...process.env, PATH: SYSTEM_PATH },
      timeout: 3000,
    });
    const found = stdout.trim();
    if (found && fsSync.existsSync(found)) {
      BINARY_CACHE.set(name, found);
      return found;
    }
  } catch {
    // Ignore which failure
  }

  BINARY_CACHE.set(name, null);
  return null;
}

export interface EncryptPdfOptions {
  userPassword?: string;
  ownerPassword?: string;
  keyLength?: 128 | 256;
  allowPrint?: boolean;
  allowCopy?: boolean;
  allowModify?: boolean;
}

export interface PdfProcessResult {
  outputBytes: Uint8Array;
  engineUsed: string;
}

/**
 * Encrypts a PDF file using the best available engine (qpdf AES-256/128, or Ghostscript fallback).
 */
export async function encryptPdf(
  inputPath: string,
  outputPath: string,
  options: EncryptPdfOptions
): Promise<string> {
  const userPwd = options.userPassword || '';
  const ownerPwd = options.ownerPassword || userPwd || crypto.randomBytes(12).toString('hex');
  const keyLength = options.keyLength || 256;
  const allowPrint = options.allowPrint !== false;
  const allowCopy = options.allowCopy !== false;

  if (!userPwd && !options.ownerPassword) {
    throw new Error('Please specify a User Password or Owner Password to encrypt the PDF.');
  }

  const qpdfBin = await resolveBinary('qpdf');
  const gsBin = await resolveBinary('gs');

  // Strategy 1: qpdf (Industry standard AES-256 or AES-128 encryption)
  if (qpdfBin) {
    const qpdfArgs = [
      '--encrypt',
      userPwd,
      ownerPwd,
      String(keyLength),
      allowPrint ? '--print=full' : '--print=none',
      allowCopy ? '--extract=y' : '--extract=n',
      '--modify=none',
      '--',
      inputPath,
      outputPath,
    ];

    await execFileAsync(qpdfBin, qpdfArgs, {
      env: { ...process.env, PATH: SYSTEM_PATH },
      timeout: 30000,
    });

    return `qpdf ${keyLength}-bit AES Standard Encryption`;
  }

  // Strategy 2: Ghostscript fallback (128-bit encryption)
  if (gsBin) {
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
      `-sOwnerPassword=${ownerPwd}`,
    ];
    if (userPwd) {
      gsArgs.push(`-sUserPassword=${userPwd}`);
    }
    gsArgs.push(`-sOutputFile=${outputPath}`, inputPath);

    await execFileAsync(gsBin, gsArgs, {
      env: { ...process.env, PATH: SYSTEM_PATH },
      timeout: 30000,
    });

    return 'Ghostscript 128-bit PDF Encryption';
  }

  // Neither binary is installed on the host
  throw new Error(
    'PDF encryption engine (qpdf / ghostscript) is not installed on the server. ' +
      'Please run "sudo apt-get install -y qpdf ghostscript" on the Ubuntu host.'
  );
}

/**
 * Decrypts / unlocks a PDF file with the user-provided password.
 */
export async function decryptPdf(
  inputPath: string,
  outputPath: string,
  password: string
): Promise<string> {
  if (!password) {
    throw new Error('Please enter the password for this PDF to unlock it.');
  }

  const qpdfBin = await resolveBinary('qpdf');
  const gsBin = await resolveBinary('gs');

  if (qpdfBin) {
    try {
      await execFileAsync(
        qpdfBin,
        [`--password=${password}`, '--decrypt', inputPath, outputPath],
        {
          env: { ...process.env, PATH: SYSTEM_PATH },
          timeout: 30000,
        }
      );
      return 'qpdf Decryption Engine';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('invalid password') || msg.includes('exit code 2')) {
        const error = new Error('Incorrect password: The supplied password could not unlock this document.');
        (error as { statusCode?: number }).statusCode = 401;
        throw error;
      }
      throw err;
    }
  }

  if (gsBin) {
    try {
      await execFileAsync(
        gsBin,
        [
          '-sDEVICE=pdfwrite',
          '-dNOPAUSE',
          '-dQUIET',
          '-dBATCH',
          `-sPDFPassword=${password}`,
          `-sOutputFile=${outputPath}`,
          inputPath,
        ],
        {
          env: { ...process.env, PATH: SYSTEM_PATH },
          timeout: 30000,
        }
      );
      return 'Ghostscript Decryption Engine';
    } catch {
      const error = new Error('Incorrect password: The supplied password could not unlock this document.');
      (error as { statusCode?: number }).statusCode = 401;
      throw error;
    }
  }

  throw new Error(
    'PDF decryption engine (qpdf / ghostscript) is not installed on the server. ' +
      'Please run "sudo apt-get install -y qpdf ghostscript" on the Ubuntu host.'
  );
}

/**
 * Compresses a PDF using Ghostscript or qpdf + pdf-lib stream compaction.
 */
export async function compressPdf(
  inputPath: string,
  outputPath: string,
  level: string
): Promise<{ engineUsed: string; outputBytes: Uint8Array }> {
  const gsBin = await resolveBinary('gs');
  const qpdfBin = await resolveBinary('qpdf');

  const presetConfig: Record<
    string,
    { setting: string; dpi: number; qFactor: string; label: string }
  > = {
    screen: {
      setting: '/screen',
      dpi: 72,
      qFactor: '1.30',
      label: '72 DPI High Compression',
    },
    ebook: {
      setting: '/ebook',
      dpi: 150,
      qFactor: '0.65',
      label: '150 DPI Balanced',
    },
    printer: {
      setting: '/printer',
      dpi: 300,
      qFactor: '0.25',
      label: '300 DPI High Quality',
    },
    prepress: {
      setting: '/prepress',
      dpi: 300,
      qFactor: '0.10',
      label: '300 DPI Archival',
    },
  };
  const cfg = presetConfig[level] || presetConfig.ebook;

  if (gsBin) {
    await execFileAsync(
      gsBin,
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
      {
        env: { ...process.env, PATH: SYSTEM_PATH },
        timeout: 45000,
      }
    );

    const gsOut = await fs.readFile(outputPath);
    const gsBytes = new Uint8Array(gsOut);

    // Compact Ghostscript output with pdf-lib object streams
    try {
      const gsDoc = await PDFDocument.load(gsBytes, { ignoreEncryption: true });
      const gsCompacted = await gsDoc.save({ useObjectStreams: true });
      return {
        outputBytes: gsCompacted.byteLength < gsBytes.byteLength ? gsCompacted : gsBytes,
        engineUsed: `Ghostscript (${cfg.label})`,
      };
    } catch {
      return { outputBytes: gsBytes, engineUsed: `Ghostscript (${cfg.label})` };
    }
  }

  // Fallback if Ghostscript not installed: qpdf stream compression & linearization
  if (qpdfBin) {
    await execFileAsync(
      qpdfBin,
      ['--linearize', '--object-streams=generate', inputPath, outputPath],
      {
        env: { ...process.env, PATH: SYSTEM_PATH },
        timeout: 30000,
      }
    );
    const qpdfOut = await fs.readFile(outputPath);
    return { outputBytes: new Uint8Array(qpdfOut), engineUsed: 'qpdf Stream Compactor' };
  }

  // Pure JS fallback via pdf-lib object streams
  const rawBytes = await fs.readFile(inputPath);
  const doc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
  const compacted = await doc.save({ useObjectStreams: true });
  return { outputBytes: compacted, engineUsed: 'PDF-Lib Object Stream Engine' };
}

/**
 * Repairs a damaged or corrupted PDF using qpdf or Ghostscript stream recovery.
 */
export async function repairPdf(
  inputPath: string,
  outputPath: string
): Promise<{ engineUsed: string; outputBytes: Uint8Array }> {
  const qpdfBin = await resolveBinary('qpdf');
  const gsBin = await resolveBinary('gs');

  // Attempt 1: qpdf recovery
  if (qpdfBin) {
    try {
      await execFileAsync(qpdfBin, ['--replace-input', inputPath, outputPath], {
        env: { ...process.env, PATH: SYSTEM_PATH },
        timeout: 30000,
      });
      const out = await fs.readFile(outputPath);
      const bytes = new Uint8Array(out);
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      if (doc.getPageCount() > 0) {
        return { engineUsed: 'qpdf Structural Recovery Engine', outputBytes: bytes };
      }
    } catch {
      // Fallback to Ghostscript
    }
  }

  // Attempt 2: Ghostscript recovery
  if (gsBin) {
    try {
      await execFileAsync(
        gsBin,
        [
          '-sDEVICE=pdfwrite',
          '-dNOPAUSE',
          '-dQUIET',
          '-dBATCH',
          '-dPDFSTOPONERROR=false',
          `-sOutputFile=${outputPath}`,
          inputPath,
        ],
        {
          env: { ...process.env, PATH: SYSTEM_PATH },
          timeout: 30000,
        }
      );
      const out = await fs.readFile(outputPath);
      const bytes = new Uint8Array(out);
      const recoveredDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      if (recoveredDoc.getPageCount() > 0) {
        return { engineUsed: 'Ghostscript XRef & Stream Recovery Engine', outputBytes: bytes };
      }
    } catch {
      // Continue to error
    }
  }

  throw new Error(
    'Unable to recover readable PDF pages from damaged file. The stream is too severely corrupted.'
  );
}

/**
 * Checks system PDF diagnostic status for the admin panel.
 */
export async function getSystemPdfDiagnostics(): Promise<{
  qpdfInstalled: boolean;
  qpdfPath: string | null;
  ghostscriptInstalled: boolean;
  ghostscriptPath: string | null;
  popplerInstalled: boolean;
  popplerPath: string | null;
  systemPath: string;
}> {
  const [qpdfPath, gsPath, popplerPath] = await Promise.all([
    resolveBinary('qpdf'),
    resolveBinary('gs'),
    resolveBinary('pdftoppm'),
  ]);

  return {
    qpdfInstalled: Boolean(qpdfPath),
    qpdfPath,
    ghostscriptInstalled: Boolean(gsPath),
    ghostscriptPath: gsPath,
    popplerInstalled: Boolean(popplerPath),
    popplerPath,
    systemPath: SYSTEM_PATH,
  };
}
