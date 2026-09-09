/**
 * Minimal ambient declaration for `@vercel/node` so `api/chat.ts` type-checks
 * without installing the package. In the Vercel runtime the real types exist;
 * here we only need the subset we use.
 */
declare module '@vercel/node' {
  import type { IncomingHttpHeaders } from 'node:http';

  export interface VercelRequest {
    method?: string;
    url?: string;
    headers: IncomingHttpHeaders;
    body?: unknown;
    query: Record<string, string | string[]>;
    cookies: Record<string, string>;
    [Symbol.asyncIterator](): AsyncIterableIterator<Buffer>;
  }

  export interface VercelResponse {
    statusCode: number;
    setHeader(name: string, value: string | number | readonly string[]): void;
    write(chunk: string | Uint8Array): void;
    end(chunk?: string | Uint8Array): void;
  }
}
