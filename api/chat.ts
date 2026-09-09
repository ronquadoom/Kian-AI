/**
 * Kian AI — zero-setup proxy (one Node serverless function).
 *
 * Runs on Vercel as `api/chat.ts` and is emulated locally by the Vite dev
 * middleware in vite.config.ts, so there is exactly one implementation.
 *
 * Behavior:
 *  - Accepts only a fixed provider allow-list (openrouter / groq / gemini).
 *  - Validates model ids as slugs (never trusts user paths).
 *  - Reads keys from process.env ONLY; any caller-supplied credential is ignored.
 *  - Streams the provider response through, passing error statuses through.
 *  - Enforces in-memory rate limits (per visitor per minute/day + a global
 *    per-day bill guard) that can be swapped for Redis via Upstash REST.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

import {
  jsonError,
  type ChatRequestPayload,
  type ProviderId,
} from '../shared/types';
import { PROXY_PROVIDER_ALLOW_LIST } from '../shared/constants';
import { buildTextPrompt } from '../shared/prompt';
import { resolveModel, isValidModelId } from '../shared/models';
import {
  buildGroqBody,
  buildGeminiBody,
  buildOpenRouterBody,
  renderWireMessages,
} from './wire';
import { createRateLimitStore, type RateLimitState } from './rate-limit';

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

function env(name: string): string {
  return (process.env[name] ?? '').trim();
}

/**
 * Keys are read lazily at request time (not at module load) so local `.env`
 * files loaded by the dev server — and Vercel's per-request env — are always
 * honored.
 */
function apiKey(provider: ProviderId): string {
  switch (provider) {
    case 'groq':
      return env('GROQ_API_KEY');
    case 'gemini':
      return env('GEMINI_API_KEY');
    case 'openrouter':
      return env('OPENROUTER_API_KEY');
  }
}

const RATE = {
  perVisitorPerMinute: 20,
  perVisitorPerDay: 200,
  globalPerDay: 2000,
};

const MAX_BODY_CHARS = 4_500_000;

/** Caller-supplied credential headers that are dropped and re-attached from env. */
const DROP_HEADERS = ['authorization', 'x-goog-api-key', 'api-key', 'x-api-key'];

function useRedis(): boolean {
  return env('UPSTASH_REDIS_REST_URL') !== '' && env('UPSTASH_REDIS_REST_TOKEN') !== '';
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProviderId(value: unknown): value is ProviderId {
  return PROXY_PROVIDER_ALLOW_LIST.includes(value as ProviderId);
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

function upstashHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

/**
 * A Redis-backed store using plain Upstash REST (POST with a Lua pipeline).
 * Enabled by setting UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.
 */
function createUpstashStore(url: string, token: string): RateLimitState {
  const prefix = 'kian:rl:';
  return {
    async hit(bucket: string, _limit: number, windowMs: number): Promise<number> {
      const key = prefix + bucket;
      const lua = [
        'local c = redis.call("INCR", KEYS[1])',
        'if c == 1 then',
        '  redis.call("PEXPIRE", KEYS[1], ARGV[1])',
        'end',
        'return c',
      ].join('\n');
      const res = await fetch(url, {
        method: 'POST',
        headers: upstashHeaders(token),
        body: JSON.stringify({ args: [key, String(windowMs), lua] }),
      });
      if (!res.ok) throw new Error(`Upstash request failed (${res.status})`);
      const data = (await res.json()) as { result?: number };
      return typeof data.result === 'number' ? data.result : 0;
    },
  };
}

function makeRateLimiter(state: RateLimitState) {
  return async function check(visitorKey: string) {
    const now = Date.now();
    const minuteBucket = `${visitorKey}:m:${Math.floor(now / 60_000)}`;
    const dayBucket = `${visitorKey}:d:${new Date().toISOString().slice(0, 10)}`;
    const globalDayBucket = `global:d:${new Date().toISOString().slice(0, 10)}`;

    const [minute, visitorDay, globalDay] = await Promise.all([
      state.hit(minuteBucket, RATE.perVisitorPerMinute, 60_000),
      state.hit(dayBucket, RATE.perVisitorPerDay, 86_400_000),
      state.hit(globalDayBucket, RATE.globalPerDay, 86_400_000),
    ]);

    if (globalDay > RATE.globalPerDay) return 'global';
    if (visitorDay > RATE.perVisitorPerDay) return 'visitor_day';
    if (minute > RATE.perVisitorPerMinute) return 'visitor_minute';
    return null;
  };
}

/* ------------------------------------------------------------------ */
/* Upstream calls                                                      */
/* ------------------------------------------------------------------ */

function headersFor(provider: ProviderId): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json', accept: 'text/event-stream' };
  const key = apiKey(provider);
  switch (provider) {
    case 'groq':
      if (key) h.authorization = `Bearer ${key}`;
      break;
    case 'openrouter':
      if (key) h.authorization = `Bearer ${key}`;
      h['http-referer'] = env('OPENROUTER_REFERER') || 'https://kian-ai.vercel.app';
      h['x-title'] = 'Kian AI';
      break;
    case 'gemini':
      if (key) h['x-goog-api-key'] = key;
      break;
  }
  return h;
}

async function callUpstream(payload: ChatRequestPayload): Promise<Response> {
  const route = resolveModel(payload.model);

  let body: unknown;
  switch (route.kind) {
    case 'groq':
      body = buildGroqBody(payload);
      break;
    case 'gemini':
      body = buildGeminiBody(payload);
      break;
    case 'openrouter':
      body = buildOpenRouterBody(payload);
      break;
  }

  let res: Response;
  try {
    res = await fetch(route.url, {
      method: 'POST',
      headers: headersFor(route.provider),
      body: JSON.stringify(body),
    });
  } catch {
    return new Response(
      JSON.stringify({
        error: { code: 'provider_error', message: `Could not reach ${route.provider}.` },
      }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  return res;
}

/** Forward the provider response through, stripping content-length (SSE has none). */
function passthrough(upstream: Response): Response {
  const headers = new Headers();
  const copy = ['content-type', 'cache-control', 'connection', 'x-accel-buffering'];
  for (const key of copy) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (!headers.has('content-type')) headers.set('content-type', 'text/event-stream; charset=utf-8');
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-cache, no-transform');
  return new Response(upstream.body, { status: upstream.status, headers });
}

/* ------------------------------------------------------------------ */
/* Offline demo (rule-based template — NOT a model)                     */
/* ------------------------------------------------------------------ */

interface OfflineInstruction {
  system?: string;
  transcript: { role: string; content: string }[];
  imageCount: number;
  contentChars: number;
  provider: string;
  model: string;
  fails: string[];
}

function tokenize(text: string): string[] {
  return text.split(/(\s+|[,.;:!?()\[\]{}"'])/).filter((t) => t.length > 0);
}

function truncate(text: string, n: number): string {
  return text.length <= n ? text : `${text.slice(0, n - 1)}…`;
}

function offlineMarkdown(inst: OfflineInstruction): string {
  const { transcript, imageCount, contentChars, provider, model, fails } = inst;

  const lines: string[] = [];
  lines.push('You are talking to **Offline Demo** — a rule-based template, not a language model.');
  lines.push('No network call was made and no AI generated this reply.');
  lines.push('');
  lines.push('### What I would have sent');
  lines.push(`- **Provider:** ${provider}`);
  lines.push(`- **Model:** ${model}`);
  if (inst.system) lines.push(`- **System prompt:** ${truncate(inst.system, 120)}`);
  lines.push(`- **Turns:** ${transcript.length} · **Images:** ${imageCount} · **Content:** ${contentChars} chars`);
  lines.push('');
  lines.push('### Latest message');
  const lastUser = [...transcript].reverse().find((m) => m.role === 'user');
  if (lastUser) {
    lines.push(`> ${truncate(lastUser.content, 280) || '_(no text — attachments only)_'}`);
  } else {
    lines.push('_(empty conversation)_');
  }
  if (fails.length > 0) {
    lines.push('');
    lines.push('### Why you are seeing this');
    for (const f of fails) lines.push(`- ${f}`);
    lines.push('');
    lines.push('Add provider keys to the proxy (README → Credentials) to get real answers.');
  } else {
    lines.push('');
    lines.push('_This model is offline by design — select a named model or Auto for real answers._');
  }
  lines.push('');
  lines.push(
    'Try this offline: switch **personas**, attach an **image** or a **PDF**, rename this session, or press the speaker for text-to-speech.',
  );

  return lines.join('\n');
}

function offlineInstruction(payload: ChatRequestPayload): OfflineInstruction {
  const fails: string[] = [];
  if (!apiKey('groq')) fails.push('Groq: no key configured on the proxy.');
  if (!apiKey('gemini')) fails.push('Gemini: no key configured on the proxy.');
  if (!apiKey('openrouter')) fails.push('OpenRouter: no key configured on the proxy.');

  const route = resolveModel(payload.model);
  let imageCount = 0;
  let contentChars = 0;
  const transcript: { role: string; content: string }[] = [];

  for (const m of payload.messages) {
    transcript.push({ role: m.role, content: m.content });
    imageCount += (m.images ?? []).length;
    contentChars += m.content.length;
  }

  const firstSystem = payload.messages.find((m) => m.role === 'system');

  return {
    system: firstSystem?.content,
    transcript,
    imageCount,
    contentChars,
    provider: route.provider,
    model: route.model,
    fails,
  };
}

function offlineResponse(payload: ChatRequestPayload): Response {
  const instruction = offlineInstruction(payload);
  const tokens = tokenize(buildTextPrompt() + '\n\n' + offlineMarkdown(instruction));
  let cancelled = false;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      (async () => {
        const id = 'kian-offline';
        const created = Math.floor(Date.now() / 1000);
        push({ id, object: 'chat.completion.chunk', created, model: 'offline-demo', choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] });
        for (const token of tokens) {
          if (cancelled) break;
          push({ id, object: 'chat.completion.chunk', created, model: 'offline-demo', choices: [{ index: 0, delta: { content: token }, finish_reason: null }] });
          await new Promise((r) => setTimeout(r, 3));
        }
        push({ id, object: 'chat.completion.chunk', created, model: 'offline-demo', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      })().catch(() => controller.close());
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}

/* ------------------------------------------------------------------ */
/* Core handler (web Request → Response)                               */
/* ------------------------------------------------------------------ */

async function handleChatRaw(visitorKey: string, body: unknown): Promise<Response> {
  /* 1. Validate request shape. */
  if (!isRecord(body)) return jsonError('bad_request', 'Expected a JSON object.', 400);

  const provider = body.provider;
  const model = body.model;
  const payloadRaw = body.payload;

  if (typeof provider !== 'string') return jsonError('bad_request', 'Missing "provider".', 400);
  if (!isProviderId(provider)) return jsonError('provider_not_allowed', 'Provider not allowed.', 400);
  if (typeof model !== 'string' || model.length === 0) return jsonError('bad_request', 'Missing "model".', 400);
  if (!isValidModelId(model)) return jsonError('model_invalid', 'Model id is not a valid slug.', 400);
  if (!isRecord(payloadRaw)) return jsonError('bad_request', 'Missing "payload".', 400);

  const payload = payloadRaw as unknown as ChatRequestPayload;
  payload.provider = provider;
  payload.model = model;

  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return jsonError('bad_request', 'payload.messages must be a non-empty array.', 400);
  }
  for (const m of payload.messages) {
    if (!isRecord(m) || typeof m.content !== 'string') {
      return jsonError('bad_request', 'Each message needs a string "content".', 400);
    }
  }

  const messageBytes = JSON.stringify(renderWireMessages(payload.messages)).length;
  if (messageBytes > 4_000_000) {
    return jsonError('bad_request', 'Combined message content is too large.', 413);
  }

  /* 2. Offline demo — rule-based template, never fakes a model call. */
  if (model === 'offline-demo') {
    return offlineResponse(payload);
  }

  /* 3. Provider key present? */
  const route = resolveModel(model);
  if (!apiKey(route.provider)) {
    return jsonError('provider_not_configured', `${route.provider} is not configured on this server.`, 503);
  }

  /* 4. Rate limiting. */
  const rateLimiter = makeRateLimiter(
    useRedis() ? createUpstashStore(env('UPSTASH_REDIS_REST_URL'), env('UPSTASH_REDIS_REST_TOKEN')) : createRateLimitStore(),
  );
  const blocked = await rateLimiter(visitorKey);
  if (blocked) {
    return jsonError('rate_limited', 'Rate limit exceeded. Try again shortly.', 429);
  }

  /* 5. Call upstream and stream through. */
  return passthrough(await callUpstream(payload));
}

export async function handleChat(request: Request): Promise<Response> {
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) {
      return jsonError('bad_request', 'Request body exceeds 4.5 MB.', 413);
    }
    body = text ? JSON.parse(text) : undefined;
  } catch {
    return jsonError('bad_request', 'Request body is not valid JSON.', 400);
  }

  const visitorKey = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  return handleChatRaw(visitorKey, body);
}

/**
 * Vercel serverless entry. Also imported by the Vite dev middleware, which
 * calls handleChat(request) directly with a web Request.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Drop any caller-supplied credential headers before doing anything else.
  for (const h of DROP_HEADERS) {
    if (req.headers[h]) delete req.headers[h];
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const rawBody = Buffer.concat(chunks).toString('utf8');

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  const request = new Request(`https://kian.local${req.url ?? '/'}`, {
    method: req.method ?? 'POST',
    headers,
    body: rawBody,
  });

  const response = await handleChat(request);

  res.statusCode = response.status;
  for (const [key, value] of response.headers.entries()) res.setHeader(key, value);

  const reader = response.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  }
  res.end();
}
