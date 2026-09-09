import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractPdfTextFromBuffer, isDocumentFile, MAX_DOC_CHARS } from '../src/lib/documents';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures', 'sample.pdf');

type PdfLike = import('../src/lib/documents').PdfLike;

describe('PDF text extraction (real pdf.js, committed fixture)', () => {
  it('extracts real text from the committed PDF', async () => {
    // Use the legacy Node build of pdf.js so no worker thread is required.
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfLike;
    const standardFontDataUrl = join(here, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/';

    const data = new Uint8Array(readFileSync(fixture));
    const text = await extractPdfTextFromBuffer(data, pdfjs, { standardFontDataUrl });

    expect(text).toContain('Kian AI - sample PDF for tests.');
    expect(text).toContain('Streaming chat, sessions, personas, attachments.');
    expect(text).toContain('Free quota: Groq, Gemini, OpenRouter.');
  });
});

describe('document classification and budget', () => {
  it('recognizes PDFs and text files, rejects images', () => {
    expect(isDocumentFile(new File([], 'a.pdf', { type: 'application/pdf' }))).toBe(true);
    expect(isDocumentFile(new File([], 'a.txt', { type: 'text/plain' }))).toBe(true);
    expect(isDocumentFile(new File([], 'a.md'))).toBe(true);
    expect(isDocumentFile(new File([], 'a.png', { type: 'image/png' }))).toBe(false);
  });

  it('exposes the 24,000-char shared budget', () => {
    expect(MAX_DOC_CHARS).toBe(24_000);
  });
});
