// Generates test/fixtures/sample.pdf — a tiny, valid single-page PDF with
// extractable ASCII text. No dependencies; run with `node scripts/make-pdf-fixture.mjs`.
//
// Committed so tests can exercise REAL pdf.js text extraction without network
// or synthetic data.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '..', 'test', 'fixtures', 'sample.pdf');

const text = 'Kian AI - sample PDF for tests. Streaming chat, sessions, personas, attachments.';

function buildPdf() {
  const objects = [];

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objects[3] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>';
  objects[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  // Text is kept well inside the page width (612pt) so pdf.js extraction does
  // not drop glyphs that would fall off the right edge.
  const streamContent = [
    'BT',
    '/F1 16 Tf',
    '56 720 Td',
    '(Kian AI - sample PDF for tests.) Tj',
    '0 -26 Td',
    '(Streaming chat, sessions, personas, attachments.) Tj',
    '0 -26 Td',
    '(Free quota: Groq, Gemini, OpenRouter.) Tj',
    'ET',
    '',
  ].join('\n');
  objects[4] = `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i += 1) {
    if (!objects[i]) throw new Error(`Missing object ${i}`);
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;
  return pdf;
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buildPdf());
console.log(`Wrote ${outPath} (${buildPdf().length} bytes)`);
