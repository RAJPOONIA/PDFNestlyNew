export interface PageDimensionPreset {
  name: string;
  label: string;
  widthPt: number;
  heightPt: number;
  dimensionsMm: string;
}

export const PAGE_SIZE_PRESETS: Record<string, PageDimensionPreset> = {
  A4: {
    name: 'A4',
    label: 'A4 (210 × 297 mm)',
    widthPt: 595.28,
    heightPt: 841.89,
    dimensionsMm: '210 × 297 mm',
  },
  Letter: {
    name: 'Letter',
    label: 'US Letter (8.5 × 11 in)',
    widthPt: 612,
    heightPt: 792,
    dimensionsMm: '215.9 × 279.4 mm',
  },
  Legal: {
    name: 'Legal',
    label: 'US Legal (8.5 × 14 in)',
    widthPt: 612,
    heightPt: 1008,
    dimensionsMm: '215.9 × 355.6 mm',
  },
  A3: {
    name: 'A3',
    label: 'A3 (297 × 420 mm)',
    widthPt: 841.89,
    heightPt: 1190.55,
    dimensionsMm: '297 × 420 mm',
  },
  A5: {
    name: 'A5',
    label: 'A5 (148 × 210 mm)',
    widthPt: 419.53,
    heightPt: 595.28,
    dimensionsMm: '148 × 210 mm',
  },
};

/**
 * Parses a human-readable 1-based page range string (e.g., "1-3, 5, 7-9")
 * into sorted, deduplicated 0-based page indices.
 * Throws a descriptive Error if syntax or bounds are invalid.
 */
export function parsePageRanges(rangeStr: string, maxPages: number): number[] {
  if (maxPages <= 0) {
    throw new Error('Document has no pages to select.');
  }
  const trimmed = rangeStr.trim();
  if (!trimmed) {
    throw new Error('Please enter at least one page number or range (e.g., 1-3, 5).');
  }

  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error('Invalid page range format.');
  }

  const indices = new Set<number>();

  for (const part of parts) {
    if (part.includes('-')) {
      const subParts = part.split('-').map((s) => s.trim());
      if (subParts.length !== 2 || !subParts[0] || !subParts[1]) {
        throw new Error(`Invalid range syntax "${part}". Expected format like "1-3".`);
      }
      const start = Number(subParts[0]);
      const end = Number(subParts[1]);
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error(`Page numbers in "${part}" must be whole integers.`);
      }
      if (start < 1 || end < 1) {
        throw new Error(`Page numbers must be 1 or greater (found "${part}").`);
      }
      if (start > maxPages || end > maxPages) {
        throw new Error(`Page range "${part}" exceeds document length of ${maxPages} pages.`);
      }
      if (start > end) {
        throw new Error(`Start page cannot be greater than end page in "${part}".`);
      }
      for (let p = start; p <= end; p++) {
        indices.add(p - 1);
      }
    } else {
      const pageNum = Number(part);
      if (!Number.isInteger(pageNum) || pageNum < 1) {
        throw new Error(`Invalid page number "${part}". Must be a positive integer.`);
      }
      if (pageNum > maxPages) {
        throw new Error(`Page ${pageNum} exceeds document length of ${maxPages} pages.`);
      }
      indices.add(pageNum - 1);
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Splits a page range string into separate groups of 0-based page indices.
 * E.g. "1-2, 3-4" -> [[0, 1], [2, 3]]
 */
export function parseSeparateRangeGroups(
  rangeStr: string,
  maxPages: number
): Array<{ label: string; indices: number[] }> {
  const trimmed = rangeStr.trim();
  if (!trimmed) {
    throw new Error('Please enter page ranges separated by commas (e.g., 1-2, 3-5).');
  }
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.map((part) => {
    const indices = parsePageRanges(part, maxPages);
    return {
      label: part.replace(/\s+/g, ''),
      indices,
    };
  });
}

/**
 * Validates actual file magic bytes rather than trusting file extension alone.
 */
export function validateFileHeader(
  bytes: Uint8Array,
  expectedCategory: 'pdf' | 'image' | 'office-or-text' | 'any'
): { valid: boolean; detectedFormat: string; error?: string } {
  if (!bytes || bytes.length === 0) {
    return { valid: false, detectedFormat: 'empty', error: 'File is empty (0 bytes).' };
  }

  // Check %PDF- header within the first 1024 bytes (per PDF spec)
  const headSlice = bytes.subarray(0, Math.min(bytes.length, 1024));
  const headAscii = Array.from(headSlice)
    .map((b) => String.fromCharCode(b))
    .join('');

  const isPdf = headAscii.includes('%PDF-');
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const isJpg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const isWebp =
    bytes.length >= 12 &&
    headAscii.startsWith('RIFF') &&
    headAscii.slice(8, 12) === 'WEBP';
  const isZipContainer =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;

  let detectedFormat = 'unknown';
  if (isPdf) detectedFormat = 'pdf';
  else if (isPng) detectedFormat = 'png';
  else if (isJpg) detectedFormat = 'jpg';
  else if (isWebp) detectedFormat = 'webp';
  else if (isZipContainer) detectedFormat = 'office-zip';
  else {
    // Check if plain text / CSV / HTML
    let printableCount = 0;
    const checkLen = Math.min(bytes.length, 512);
    for (let i = 0; i < checkLen; i++) {
      const c = bytes[i];
      if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126) || c >= 128) {
        printableCount++;
      }
    }
    if (printableCount / checkLen > 0.9) {
      detectedFormat = 'text';
    }
  }

  if (expectedCategory === 'pdf') {
    if (!isPdf) {
      return {
        valid: false,
        detectedFormat,
        error: `Invalid PDF file: Missing "%PDF-" magic header (detected ${detectedFormat}).`,
      };
    }
    return { valid: true, detectedFormat: 'pdf' };
  }

  if (expectedCategory === 'image') {
    if (!isPng && !isJpg && !isWebp) {
      return {
        valid: false,
        detectedFormat,
        error: `Unsupported image binary header. Expected JPG, PNG, or WebP (detected ${detectedFormat}).`,
      };
    }
    return { valid: true, detectedFormat };
  }

  if (expectedCategory === 'office-or-text') {
    if (detectedFormat !== 'office-zip' && detectedFormat !== 'text' && !isPdf) {
      return {
        valid: false,
        detectedFormat,
        error: `Unsupported document structure. Expected DOCX, XLSX, CSV, HTML, or TXT.`,
      };
    }
    return { valid: true, detectedFormat };
  }

  return { valid: true, detectedFormat };
}

/**
 * Formats byte counts into human-readable units using tabular precision.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const val = bytes / Math.pow(k, i);
  return `${val >= 100 || i === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`;
}

/**
 * Calculates actual compression savings between input and output sizes.
 */
export function calculateCompressionRatio(
  originalBytes: number,
  outputBytes: number
): {
  savedBytes: number;
  percentReduced: number;
  summary: string;
} {
  if (originalBytes <= 0) {
    return { savedBytes: 0, percentReduced: 0, summary: '0% change' };
  }
  const savedBytes = originalBytes - outputBytes;
  const percentReduced = Number(((savedBytes / originalBytes) * 100).toFixed(1));
  if (savedBytes > 0) {
    return {
      savedBytes,
      percentReduced,
      summary: `Reduced by ${percentReduced}% (saved ${formatFileSize(savedBytes)})`,
    };
  } else if (savedBytes === 0) {
    return {
      savedBytes: 0,
      percentReduced: 0,
      summary: 'Already optimal (0% size reduction)',
    };
  } else {
    return {
      savedBytes,
      percentReduced,
      summary: `Increased by ${formatFileSize(Math.abs(savedBytes))} due to embedded structure/fonts`,
    };
  }
}

/**
 * Sanitizes filenames to prevent path traversal and invalid OS characters.
 */
export function sanitizeFileName(name: string, fallback = 'document.pdf'): string {
  const cleaned = name
    .replace(/^.*[\\/]/, '') // strip directory paths
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^\.+/, '');
  return cleaned.length > 0 ? cleaned.slice(0, 120) : fallback;
}

export interface DiffEntry {
  type: 'same' | 'added' | 'removed';
  value: string;
  lineNumberA?: number;
  lineNumberB?: number;
}

/**
 * Performs line-by-line Longest Common Subsequence (LCS) diffing between two extracted PDF texts.
 */
export function computeTextDiff(textA: string, textB: string): DiffEntry[] {
  const linesA = textA
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const linesB = textB
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const m = linesA.length;
  const n = linesB.length;

  // LCS matrix
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffEntry[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      result.push({
        type: 'same',
        value: linesA[i - 1],
        lineNumberA: i,
        lineNumberB: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({
        type: 'added',
        value: linesB[j - 1],
        lineNumberB: j,
      });
      j--;
    } else if (i > 0) {
      result.push({
        type: 'removed',
        value: linesA[i - 1],
        lineNumberA: i,
      });
      i--;
    }
  }

  return result.reverse();
}

/**
 * Safely wraps a Uint8Array in a PDF Blob across TypeScript 5.9 ArrayBufferLike rules.
 */
export function toPdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}

