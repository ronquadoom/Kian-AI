/**
 * Browser-side image downscaling.
 *
 * Images are resized to a 1024px longest side and re-encoded as JPEG with
 * per-image 1.5 MB and per-message 3 MB caps so the whole request fits the
 * serverless 4.5 MB body. If the browser cannot resize (e.g. no canvas), we
 * fall back to the original file.
 */

export const MAX_LONGEST_SIDE = 1024;
export const PER_IMAGE_MAX_BYTES = 1_500_000; // 1.5 MB
export const PER_MESSAGE_MAX_BYTES = 3_000_000; // 3 MB

export interface DownscaleOptions {
  maxSide?: number;
  perImageMaxBytes?: number;
  perMessageMaxBytes?: number;
}

export interface ImageAttachment {
  mime: string;
  data: string; // base64 without data: prefix
  bytes: number;
}

const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif)$/i;

function canDownscale(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = dataUrl;
  });
}

async function fileToDataUrl(file: File | Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
  }
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return `data:${file.type || 'application/octet-stream'};base64,${base64}`;
}

async function downscaleDataUrl(dataUrl: string, opts: Required<DownscaleOptions>): Promise<ImageAttachment> {
  const img = await loadImage(dataUrl);
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;

  const scale = Math.min(1, opts.maxSide / Math.max(srcWidth, srcHeight));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.9;
  let encoded = canvas.toDataURL('image/jpeg', quality);
  while (encoded.length > opts.perImageMaxBytes && quality > 0.45) {
    quality -= 0.1;
    encoded = canvas.toDataURL('image/jpeg', quality);
  }

  const base64 = splitDataUrl(encoded)[1];
  return { mime: 'image/jpeg', data: base64, bytes: byteLength(base64) };
}

function splitDataUrl(dataUrl: string): [string, string] {
  const idx = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, idx);
  const mimeMatch = /data:([^;]+)/.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  return [mime, dataUrl.slice(idx + 1)];
}

function byteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Convert a user-selected image file into a proxy-ready attachment.
 * Returns undefined if the image does not fit the per-message budget after
 * downscaling (callers then surface an honest message).
 */
export async function prepareImage(file: File, opts: DownscaleOptions = {}): Promise<ImageAttachment | undefined> {
  const options: Required<DownscaleOptions> = {
    maxSide: opts.maxSide ?? MAX_LONGEST_SIDE,
    perImageMaxBytes: opts.perImageMaxBytes ?? PER_IMAGE_MAX_BYTES,
    perMessageMaxBytes: opts.perMessageMaxBytes ?? PER_MESSAGE_MAX_BYTES,
  };

  if (canDownscale()) {
    try {
      const dataUrl = await fileToDataUrl(file);
      const resized = await downscaleDataUrl(dataUrl, options);
      if (resized.bytes <= options.perMessageMaxBytes) return resized;
      return undefined;
    } catch {
      // Fall through to the original file.
    }
  }

  // Fallback: original bytes, base64-encoded.
  const dataUrl = await fileToDataUrl(file);
  const [mime, base64] = splitDataUrl(dataUrl);
  const bytes = byteLength(base64);
  if (bytes > options.perMessageMaxBytes) return undefined;
  return { mime: mime || file.type || 'image/jpeg', data: base64, bytes };
}

export function isImageFile(file: File): boolean {
  return IMAGE_MIME.test(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
}
