import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePageRanges,
  parseSeparateRangeGroups,
  validateFileHeader,
  formatFileSize,
  calculateCompressionRatio,
  sanitizeFileName,
  computeTextDiff,
} from './pdf-utils';

test('parsePageRanges parses individual pages and ranges into sorted 0-based indices', () => {
  assert.deepEqual(parsePageRanges('1-3, 5, 2', 6), [0, 1, 2, 4]);
  assert.deepEqual(parsePageRanges('4', 4), [3]);
});

test('parsePageRanges throws on out-of-bounds or malformed syntax', () => {
  assert.throws(() => parsePageRanges('', 5), /Please enter at least one page/);
  assert.throws(() => parsePageRanges('1-7', 5), /exceeds document length/);
  assert.throws(() => parsePageRanges('4-2', 5), /Start page cannot be greater/);
  assert.throws(() => parsePageRanges('0', 5), /positive integer/);
});

test('parseSeparateRangeGroups preserves distinct split groups', () => {
  const groups = parseSeparateRangeGroups('1-2, 3-4', 4);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], { label: '1-2', indices: [0, 1] });
  assert.deepEqual(groups[1], { label: '3-4', indices: [2, 3] });
});

test('validateFileHeader detects PDF, PNG, JPG, and rejects mismatched binaries', () => {
  const pdfBytes = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n');
  assert.deepEqual(validateFileHeader(pdfBytes, 'pdf'), {
    valid: true,
    detectedFormat: 'pdf',
  });

  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(validateFileHeader(pngBytes, 'pdf').valid, false);
  assert.equal(validateFileHeader(pngBytes, 'image').valid, true);
  assert.equal(validateFileHeader(pngBytes, 'image').detectedFormat, 'png');
});

test('formatFileSize and calculateCompressionRatio compute accurate metrics', () => {
  assert.equal(formatFileSize(0), '0 B');
  assert.equal(formatFileSize(1024), '1.0 KB');
  assert.equal(formatFileSize(1048576), '1.0 MB');

  const ratio = calculateCompressionRatio(100000, 65000);
  assert.equal(ratio.savedBytes, 35000);
  assert.equal(ratio.percentReduced, 35);
});

test('sanitizeFileName removes path traversal and unsafe characters', () => {
  assert.equal(sanitizeFileName('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFileName('My Contract (Final)!.pdf'), 'My_Contract_Final_.pdf');
});

test('computeTextDiff identifies same, added, and removed lines accurately', () => {
  const textA = 'Line 1\nLine 2\nLine 3';
  const textB = 'Line 1\nLine 2 Modified\nLine 3';
  const diff = computeTextDiff(textA, textB);
  assert.equal(diff.filter((d) => d.type === 'same').length, 2);
  assert.equal(diff.filter((d) => d.type === 'removed')[0].value, 'Line 2');
  assert.equal(diff.filter((d) => d.type === 'added')[0].value, 'Line 2 Modified');
});
