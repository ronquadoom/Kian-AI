import { describe, expect, it } from 'vitest';
import { buildGeminiBody, buildGroqBody, buildOpenRouterBody } from '../api/wire';
import type { ChatRequestPayload } from '../shared/types';

const base: ChatRequestPayload = {
  provider: 'gemini',
  model: 'gemini-2.0-flash',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello', images: [{ mime: 'image/jpeg', data: 'abc123' }] },
    { role: 'assistant', content: 'Hi there' },
    { role: 'user', content: 'How are you?' },
  ],
  stream: true,
};

describe('buildGroqBody (OpenAI-compatible)', () => {
  it('passes messages and stream through', () => {
    const body = buildGroqBody(base) as { model: string; stream: boolean; messages: unknown[] };
    expect(body.model).toBe('gemini-2.0-flash');
    expect(body.stream).toBe(true);
    expect(body.messages).toHaveLength(4);
  });
});

describe('buildGeminiBody (wire format differs)', () => {
  it('puts the system prompt in systemInstruction, not contents', () => {
    const body = buildGeminiBody(base) as {
      systemInstruction: { parts: { text: string }[] };
      contents: { role: string; parts: unknown[] }[];
    };
    expect(body.systemInstruction.parts[0].text).toBe('You are a helpful assistant.');
    expect(body.contents.some((c) => c.role === 'system')).toBe(false);
  });

  it('maps assistant role to "model"', () => {
    const body = buildGeminiBody(base) as { contents: { role: string }[] };
    expect(body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
  });

  it('emits images as inline_data without a data: prefix', () => {
    const body = buildGeminiBody(base) as { contents: { role: string; parts: { inline_data?: { mime_type: string; data: string } }[] }[] };
    const first = body.contents[0];
    expect(first.parts[0]).toEqual({ text: 'Hello' });
    expect(first.parts[1]).toEqual({ inline_data: { mime_type: 'image/jpeg', data: 'abc123' } });
  });
});

describe('buildOpenRouterBody (OpenAI-compatible + image_url parts)', () => {
  it('builds multimodal content parts for images', () => {
    const body = buildOpenRouterBody(base) as { messages: { role: string; content: unknown }[] };
    const user = body.messages.find((m) => m.role === 'user') as { content: unknown[] };
    expect(Array.isArray(user.content)).toBe(true);
    const parts = user.content as { type: string; image_url?: { url: string } }[];
    expect(parts[0]).toEqual({ type: 'text', text: 'Hello' });
    expect(parts[1].type).toBe('image_url');
    expect(parts[1].image_url?.url).toBe('data:image/jpeg;base64,abc123');
  });

  it('keeps text-only messages as plain strings', () => {
    const body = buildOpenRouterBody({
      ...base,
      messages: [{ role: 'user', content: 'just text' }],
    }) as { messages: { role: string; content: unknown }[] };
    expect(body.messages[0].content).toBe('just text');
  });
});
