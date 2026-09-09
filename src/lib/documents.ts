/**
 * Document attachments: PDF text via pdf.js, plus plain text files.
 * Text is shared across files against a 24,000-char budget.
 */

export const MAX_DOC_CHARS = 24_000;

export interface ExtractedDocument {
  name: string;
  text: string;
}

/** Minimal structural type so tests can inject the legacy Node build of pdf.js. */
export interface PdfLike {
  getDocument(params: { data: ArrayBuffer | Uint8Array; [key: string]: unknown }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: { str: string }[] }> }>;
      destroy(): Promise<void>;
    }>;
  };
}

// pdf.js is lazy-loaded only when a document is actually attached, so the
// initial app bundle stays small.
let browserPdfPromise: Promise<PdfLike> | null = null;

function getBrowserPdf(): Promise<PdfLike> {
  if (!browserPdfPromise) {
    browserPdfPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
      return pdfjs as unknown as PdfLike;
    })();
  }
  return browserPdfPromise;
}

const TEXT_MIME = /^text\/(plain|markdown|csv|html|xml|json|javascript|typescript)$/i;
const TEXT_EXT = /\.(txt|md|markdown|csv|log|tsv|json|js|ts|tsx|jsx|html|htm|xml|css|yml|yaml|toml|ini|sh|py|java|c|cpp|h|rs|go|rb|php)$/i;

export function isDocumentFile(file: File): boolean {
  if (file.type === 'application/pdf') return true;
  if (/\.pdf$/i.test(file.name)) return true;
  if (TEXT_MIME.test(file.type)) return true;
  if (TEXT_EXT.test(file.name)) return true;
  return false;
}

export async function extractPdfTextFromBuffer(
  data: ArrayBuffer | Uint8Array,
  pdfLib?: PdfLike,
  options: Record<string, unknown> = {},
): Promise<string> {
  const lib = pdfLib ?? (await getBrowserPdf());
  const doc = await lib.getDocument({ data, ...options }).promise;
  const parts: string[] = [];
  for (let page = 1; page <= doc.numPages; page += 1) {
    const pageProxy = await doc.getPage(page);
    const content = await pageProxy.getTextContent();
    const pageText = content.items.map((item) => item.str).join(' ');
    parts.push(pageText);
  }
  await doc.destroy();
  return parts.join('\n\n').replace(/\u0000/g, '').trim();
}

async function extractTextFile(file: File): Promise<string> {
  return file.text();
}

/**
 * Extract text from document files, respecting a shared char budget.
 * Returns the documents that fit and the amount of budget used.
 */
export async function extractDocuments(files: File[], budget: number = MAX_DOC_CHARS): Promise<ExtractedDocument[]> {
  const docs: ExtractedDocument[] = [];
  let remaining = budget;

  for (const file of files) {
    if (remaining <= 0) break;
    try {
      const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
      const text = isPdf
        ? await extractPdfTextFromBuffer(await file.arrayBuffer())
        : await extractTextFile(file);
      const slice = text.slice(0, remaining);
      if (slice.length === 0) continue;
      docs.push({ name: file.name, text: slice });
      remaining -= slice.length;
    } catch {
      docs.push({ name: file.name, text: '' });
    }
  }

  return docs;
}
