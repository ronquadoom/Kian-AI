/**
 * Provider wire-format builders.
 *
 * Groq and OpenRouter are OpenAI-compatible (POST .../chat/completions,
 * `messages[]`, `stream: true`, delta at `choices[0].delta.content`).
 *
 * Gemini is different: POST .../models/{model}:streamGenerateContent?alt=sse;
 * system prompt in `systemInstruction`, history in `contents[].parts`,
 * assistant role is "model", images as `inline_data` (base64, no data: prefix),
 * deltas at `candidates[0].content.parts[].text`, no `[DONE]` terminator, and
 * signature-only chunks must be skipped.
 */

import type { ChatRequestPayload, WireMessage } from '../shared/types';

export function renderWireMessages(messages: WireMessage[]): WireMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.images && m.images.length > 0 ? { images: m.images } : {}),
  }));
}

/* --------------------------- Groq --------------------------- */

export function buildGroqBody(payload: ChatRequestPayload) {
  return {
    model: payload.model,
    stream: payload.stream !== false,
    temperature: payload.temperature ?? 0.7,
    messages: renderWireMessages(payload.messages),
  };
}

/* --------------------------- Gemini --------------------------- */

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[] };
  generationConfig?: Record<string, unknown>;
}

function textParts(text: string): GeminiPart[] {
  return text ? [{ text }] : [];
}

function imageParts(images: { mime: string; data: string }[]): GeminiPart[] {
  return images.map((img) => ({
    inline_data: { mime_type: img.mime, data: img.data },
  }));
}

export function buildGeminiBody(payload: ChatRequestPayload): GeminiRequest {
  const system = payload.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const turns = payload.messages.filter((m) => m.role !== 'system');

  const contents: GeminiContent[] = [];
  for (const m of turns) {
    const role: 'user' | 'model' = m.role === 'assistant' ? 'model' : 'user';
    const parts: GeminiPart[] = [...textParts(m.content), ...imageParts(m.images ?? [])];
    if (parts.length === 0) parts.push({ text: '' });
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  }

  const req: GeminiRequest = { contents };
  if (system) req.systemInstruction = { parts: [{ text: system }] };
  req.generationConfig = { temperature: payload.temperature ?? 0.7 };
  return req;
}

/* --------------------------- OpenRouter --------------------------- */

export function buildOpenRouterBody(payload: ChatRequestPayload) {
  const messages = payload.messages.map((m) => {
    if (m.role !== 'user' || !m.images || m.images.length === 0) {
      return { role: m.role, content: m.content };
    }
    const parts: unknown[] = [];
    if (m.content) parts.push({ type: 'text', text: m.content });
    for (const img of m.images) {
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${img.mime};base64,${img.data}` },
      });
    }
    return { role: 'user', content: parts };
  });

  return {
    model: payload.model,
    stream: payload.stream !== false,
    temperature: payload.temperature ?? 0.7,
    messages,
  };
}
