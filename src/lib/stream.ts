/**
 * Streaming SSE parsers.
 *
 * The proxy always speaks OpenAI-compatible SSE (even for Gemini, which the
 * proxy adapts) so the client only ever needs one parser. `[DONE]` ends the
 * stream.
 */

export interface StreamChunk {
  content?: string;
  /** Gemini-style signature-only chunks (and others with no text) have no content. */
  skip?: boolean;
}

export function isSseChunk(data: string): boolean {
  return /^data:\s*/m.test(data);
}

interface OpenAiChunk {
  choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
}

interface GeminiChunk {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string | null;
  }[];
}

/**
 * Yield one parsed event at a time. Handles BOTH wire formats the proxy can
 * stream through:
 *  - OpenAI-compatible (Groq/OpenRouter): `choices[0].delta.content`.
 *  - Gemini: `candidates[0].content.parts[].text`, with signature-only chunks
 *    (finishReason present, empty text) yielded as `{ skip: true }`.
 */
export function* parseSseEvent(data: string): Generator<StreamChunk> {
  const lines = data.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === '[DONE]') return;
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      continue;
    }

    const openAi = json as OpenAiChunk;
    if (openAi.choices && openAi.choices.length > 0) {
      const delta = openAi.choices[0].delta;
      const content = delta && typeof delta.content === 'string' ? delta.content : '';
      const finishReason = openAi.choices[0].finish_reason;
      if (!content && finishReason) yield { skip: true };
      else if (content) yield { content };
      continue;
    }

    const gemini = json as GeminiChunk;
    if (gemini.candidates && gemini.candidates.length > 0) {
      const candidate = gemini.candidates[0];
      const parts = candidate.content?.parts ?? [];
      const finishReason = candidate.finishReason;
      let text = '';
      for (const part of parts) {
        if (part && typeof part.text === 'string') text += part.text;
      }
      if (text) yield { content: text };
      else if (finishReason) yield { skip: true };
    }
  }
}

export interface StreamResult {
  content: string;
  cancelled: boolean;
  truncated: boolean;
}

/**
 * Read a streaming response body and fold it into text.
 * Returns early when the reader is cancelled (e.g. the user hit Stop).
 */
export async function readStreamText(
  response: Response,
  onDelta: (text: string) => void,
): Promise<StreamResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return { content: text, cancelled: false, truncated: false };
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let cancelled = false;
  let truncated = false;

  for (;;) {
    let done = false;
    let value: Uint8Array | undefined;
    try {
      const read = await reader.read();
      done = read.done;
      value = read.value;
    } catch {
      cancelled = true;
      break;
    }
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const event of events) {
      for (const chunk of parseSseEvent(event)) {
        if (chunk.skip) continue;
        if (chunk.content) {
          content += chunk.content;
          onDelta(chunk.content);
        }
      }
    }

    if (content.length > 4_000_000) {
      truncated = true;
      break;
    }
  }

  for (const chunk of parseSseEvent(buffer)) {
    if (chunk.skip) continue;
    if (chunk.content) {
      content += chunk.content;
      onDelta(chunk.content);
    }
  }

  // Non-SSE fallback: if the upstream returned a plain body (e.g. a JSON
  // payload without `data:` events), surface it rather than losing it.
  if (content === '' && buffer.trim() !== '') {
    content = buffer.trim();
    onDelta(content);
  }

  try {
    await reader.cancel();
  } catch {
    /* ignore */
  }

  return { content, cancelled, truncated };
}
