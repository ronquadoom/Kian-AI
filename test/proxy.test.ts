import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimitStore } from '../api/rate-limit';

type HandleChat = (req: Request) => Promise<Response>;

const SAVED_ENV: Record<string, string | undefined> = {};

function setEnv(env: Record<string, string>) {
  for (const key of ['GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
    SAVED_ENV[key] = process.env[key];
    delete process.env[key];
  }
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
}

function restoreEnv() {
  for (const key of ['GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
    if (SAVED_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = SAVED_ENV[key];
  }
}

async function loadHandleChat(env: Record<string, string>): Promise<HandleChat> {
  setEnv(env);
  vi.resetModules();
  __resetRateLimitStore();
  const mod = await import('../api/chat');
  return mod.handleChat;
}

function request(body: unknown, ip = '203.0.113.7'): Request {
  return new Request('https://kian.local/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

const validBody = {
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  payload: { messages: [{ role: 'user', content: 'hi' }], stream: true },
};

function sseSuccess(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreEnv();
  __resetRateLimitStore();
});

describe('proxy validation', () => {
  it('rejects providers outside the allow-list', async () => {
    const handle = await loadHandleChat({});
    const res = await handle(request({ ...validBody, provider: 'openai' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('provider_not_allowed');
  });

  it('rejects model ids with traversal', async () => {
    const handle = await loadHandleChat({});
    const res = await handle(request({ ...validBody, model: '../etc/passwd' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('model_invalid');
  });

  it('rejects a non-object payload', async () => {
    const handle = await loadHandleChat({});
    const res = await handle(request({ provider: 'groq', model: 'x', payload: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('rejects empty messages', async () => {
    const handle = await loadHandleChat({});
    const res = await handle(request({ ...validBody, payload: { messages: [] } }));
    expect(res.status).toBe(400);
  });
});

describe('offline demo', () => {
  it('streams a rule-based template without any keys', async () => {
    const handle = await loadHandleChat({});
    const res = await handle(request({ ...validBody, model: 'offline-demo', provider: 'gemini' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    // Fold the SSE deltas back into text (the phrase spans multiple chunks).
    const raw = await res.text();
    let content = '';
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
        const delta = obj.choices?.[0]?.delta?.content;
        if (delta) content += delta;
      } catch {
        /* ignore */
      }
    }

    expect(content).toContain('rule-based template');
    expect(content).toContain('Offline Demo');
    expect(raw).toContain('[DONE]');
  });
});

describe('provider configuration', () => {
  it('returns 503 when a provider key is missing', async () => {
    const handle = await loadHandleChat({});
    const res = await handle(request(validBody));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('provider_not_configured');
  });

  it('attaches the env key (never caller credentials) upstream', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => sseSuccess());
    vi.stubGlobal('fetch', fetchMock);

    const handle = await loadHandleChat({ GROQ_API_KEY: 'test-key' });
    const req = new Request('https://kian.local/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.7',
        authorization: 'Bearer evil-caller-key',
        'x-goog-api-key': 'evil',
      },
      body: JSON.stringify(validBody),
    });
    await handle(req);

    const url = fetchMock.mock.calls[0][0] as string;
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(url).toContain('api.groq.com');
    expect(init.headers.authorization).toBe('Bearer test-key');
    expect(init.headers['x-goog-api-key']).toBeUndefined();
  });

  it('streams the provider response through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseSuccess()));
    const handle = await loadHandleChat({ GROQ_API_KEY: 'test-key' });
    const res = await handle(request(validBody));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('hello');
  });

  it('passes upstream error statuses through', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 })),
    );
    const handle = await loadHandleChat({ GROQ_API_KEY: 'wrong-key' });
    const res = await handle(request(validBody));
    expect(res.status).toBe(401);
  });
});

describe('proxy rate limits', () => {
  it('blocks after the per-visitor-per-minute budget', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseSuccess()));
    const handle = await loadHandleChat({ GROQ_API_KEY: 'test-key' });

    for (let i = 0; i < 20; i += 1) {
      const res = await handle(request(validBody, '198.51.100.1'));
      expect(res.status).toBe(200);
    }

    const blocked = await handle(request(validBody, '198.51.100.1'));
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.error.code).toBe('rate_limited');
  });

  it('tracks visitors independently', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseSuccess()));
    const handle = await loadHandleChat({ GROQ_API_KEY: 'test-key' });

    const a = await handle(request(validBody, '198.51.100.1'));
    const b = await handle(request(validBody, '198.51.100.2'));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });
});
