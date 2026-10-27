import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { generateSamplePdfBytes } from './sample-pdf';
import { validateFileHeader } from './pdf-utils';

test('generateSamplePdfBytes produces a valid 4-page PDF with AcroForm fields and metadata', async () => {
  const bytes = await generateSamplePdfBytes('primary');
  const headerCheck = validateFileHeader(bytes, 'pdf');
  assert.equal(headerCheck.valid, true);
  assert.equal(headerCheck.detectedFormat, 'pdf');

  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 4);
  assert.equal(doc.getTitle(), 'PDFNestly Enterprise Service Agreement v1.0');

  const form = doc.getForm();
  const fields = form.getFields();
  assert.equal(fields.length, 3);
});
