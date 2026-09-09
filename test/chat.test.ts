import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamChat } from '../src/lib/chat';
import { QuotaMemory } from '../src/lib/quota';
import type { ResolvedModel } from '../src/lib/models';
import type { Message } from '../src/types';
import { PERSONAS } from '../shared/constants';

const persona = PERSONAS[0];
const userMessage: Message = { id: 'm1', role: 'user', content: 'hi' };

const auto: ResolvedModel = { id: 'auto', label: 'Auto', provider: 'openrouter', vision: false, offline: false };
const groqModel: ResolvedModel = { id: 'llama-3.3-70b-versatile', label: 'Llama', provider: 'groq', vision: false, offline: false };

function sse(text: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: {"choices":[{"delta":{"content":${JSON.stringify(text)}},"finish_reason":null}]}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function json(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function modelFromCall(call: unknown[]): string {
  const init = call[1] as { body?: string };
  const body = JSON.parse(init.body ?? '{}') as { model: string };
  return body.model;
}

const signal = new AbortController().signal;

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('streamChat — offline', () => {
  it('never touches the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await streamChat({
      messages: [userMessage],
      persona,
      selection: { id: 'offline-demo', label: 'Offline Demo', provider: 'openrouter', vision: false, offline: true },
      hasImages: false,
      quota: new QuotaMemory(),
      onDelta: () => {},
      signal,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.content).toContain('rule-based template');
  });
});

describe('streamChat — failover chain', () => {
  it('tries Groq → Gemini → OpenRouter and succeeds on the last', async () => {
    const fetchMock = vi.fn(async (_url: string, init: { body?: string }) => {
      const model = modelFromCall([_url, init]);
      if (model === 'llama-3.3-70b-versatile') return json(429, 'rate_limited', 'quota');
      if (model === 'gemini-2.0-flash') return json(500, 'provider_error', 'boom');
      return sse('from openrouter');
    });
    vi.stubGlobal('fetch', fetchMock);

    let streamed = '';
    const result = await streamChat({
      messages: [userMessage],
      persona,
      selection: auto,
      hasImages: false,
      quota: new QuotaMemory(),
      onDelta: (d) => {
        streamed += d;
      },
      signal,
    });

    expect(result.ok).toBe(true);
    expect(result.content).toBe('from openrouter');
    expect(streamed).toBe('from openrouter');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(modelFromCall(fetchMock.mock.calls[0])).toBe('llama-3.3-70b-versatile');
    expect(modelFromCall(fetchMock.mock.calls[1])).toBe('gemini-2.0-flash');
    expect(modelFromCall(fetchMock.mock.calls[2])).toBe('meta-llama/llama-3.3-70b-instruct');
  });

  it('never switches after output has streamed (first success wins)', async () => {
    const fetchMock = vi.fn(async () => sse('first answer'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await streamChat({
      messages: [userMessage],
      persona,
      selection: auto,
      hasImages: false,
      quota: new QuotaMemory(),
      onDelta: () => {},
      signal,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('records a 429 cooldown and skips that model next message', async () => {
    const fetchMock = vi.fn(async (_url: string, init: { body?: string }) => {
      const model = modelFromCall([_url, init]);
      if (model === 'llama-3.3-70b-versatile') return json(429, 'rate_limited', 'quota');
      return sse('fallback');
    });
    vi.stubGlobal('fetch', fetchMock);
    const quota = new QuotaMemory();

    const first = await streamChat({
      messages: [userMessage], persona, selection: auto, hasImages: false, quota, onDelta: () => {}, signal,
    });
    expect(first.ok).toBe(true);
    expect(quota.cooldown().isBlocked('model', 'llama-3.3-70b-versatile')).toBe(true);

    fetchMock.mockClear();
    const second = await streamChat({
      messages: [userMessage], persona, selection: auto, hasImages: false, quota, onDelta: () => {}, signal,
    });
    expect(second.ok).toBe(true);
    // Groq was skipped straight away.
    expect(modelFromCall(fetchMock.mock.calls[0])).toBe('gemini-2.0-flash');
  });

  it('stops on a non-retryable error for a single-model chain', async () => {
    const fetchMock = vi.fn(async () => json(400, 'bad_request', 'nope'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await streamChat({
      messages: [userMessage], persona, selection: groqModel, hasImages: false,
      quota: new QuotaMemory(), onDelta: () => {}, signal,
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.errors[0].message).toBe('nope');
  });

  it('refuses images for a non-vision model without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await streamChat({
      messages: [userMessage], persona, selection: groqModel, hasImages: true,
      quota: new QuotaMemory(), onDelta: () => {}, signal,
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.errors[0].message).toContain('cannot see images');
  });
});
