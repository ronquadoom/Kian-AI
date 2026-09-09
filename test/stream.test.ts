import { describe, expect, it } from 'vitest';
import { parseSseEvent, readStreamText } from '../src/lib/stream';

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('parseSseEvent', () => {
  it('parses OpenAI-style delta content', () => {
    const chunks = [...parseSseEvent('data: {"choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}')];
    expect(chunks).toEqual([{ content: 'Hel' }]);
  });

  it('ignores [DONE]', () => {
    const chunks = [...parseSseEvent('data: [DONE]')];
    expect(chunks).toEqual([]);
  });

  it('skips signature-only Gemini-style chunks (finishReason + empty text)', () => {
    const chunks = [...parseSseEvent('data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP"}]}')];
    expect(chunks).toEqual([{ skip: true }]);
  });

  it('tolerates garbage lines', () => {
    const chunks = [...parseSseEvent(': keep-alive\ndata: not-json\n\n')];
    expect(chunks).toEqual([]);
  });
});

describe('readStreamText', () => {
  it('folds multiple SSE chunks into text', async () => {
    const response = sseResponse([
      'data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    let text = '';
    const result = await readStreamText(response, (d) => {
      text += d;
    });
    expect(result.content).toBe('Hello world');
    expect(text).toBe('Hello world');
    expect(result.cancelled).toBe(false);
  });

  it('handles a chunk split across read boundaries', async () => {
    const response = sseResponse([
      'data: {"choices":[{"delta":{"con',
      'tent":"cd"},"finish_reason":null}]}\n\ndata: [DONE]\n\n',
    ]);
    const result = await readStreamText(response, () => {});
    expect(result.content).toBe('cd');
  });

  it('surfaces a plain (non-SSE) body instead of losing it', async () => {
    const response = new Response('{"choices":[{"message":{"content":"x"}}]}', { status: 200 });
    const result = await readStreamText(response, () => {});
    expect(result.content).toContain('x');
  });
});
