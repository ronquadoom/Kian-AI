/**
 * Client chat engine: builds the wire payload, runs the ordered failover chain
 * (Groq first, OpenRouter last), streams tokens, and never switches provider
 * after output has started streaming.
 */

import type { Message, Persona } from '../types';
import type { ProviderId, WireMessage } from '../../shared/types';
import type { ResolvedModel } from './models';
import { isRetryable, parseErrorResponse, postChat, QuotaMemory, type ClientError } from './quota';
import { readStreamText } from './stream';
import { offlineTokenStream } from './offline';

export interface ChainStep {
  model: string;
  provider: ProviderId;
}

export function buildChain(selection: ResolvedModel, hasImages: boolean): ChainStep[] {
  if (selection.id === 'auto') {
    if (hasImages) {
      return [
        { model: 'gemini-2.0-flash', provider: 'gemini' },
        { model: 'qwen/qwen-2.5-72b-instruct', provider: 'openrouter' },
        { model: 'meta-llama/llama-3.2-90b-vision-instruct', provider: 'openrouter' },
      ];
    }
    return [
      { model: 'llama-3.3-70b-versatile', provider: 'groq' },
      { model: 'gemini-2.0-flash', provider: 'gemini' },
      { model: 'meta-llama/llama-3.3-70b-instruct', provider: 'openrouter' },
    ];
  }
  return [{ model: selection.id, provider: selection.provider }];
}

function splitDataUrl(dataUrl: string): { mime: string; data: string } {
  const idx = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, idx);
  const mimeMatch = /data:([^;]+)/.exec(header);
  return { mime: mimeMatch ? mimeMatch[1] : 'image/jpeg', data: dataUrl.slice(idx + 1) };
}

export function buildWireMessages(messages: Message[], persona: Persona): WireMessage[] {
  const out: WireMessage[] = [{ role: 'system', content: persona.systemPrompt }];

  for (const m of messages) {
    let content = m.content;
    const docs = m.documents ?? [];
    if (docs.length > 0) {
      const docText = docs
        .map((d) => `[Attached document: ${d.name}]\n${d.text}`)
        .join('\n\n');
      content = content ? `${content}\n\n${docText}` : docText;
    }
    const images = (m.images ?? []).map(splitDataUrl);
    out.push({ role: m.role, content, ...(images.length > 0 ? { images } : {}) });
  }

  return out;
}

export interface SendResult {
  ok: boolean;
  cancelled: boolean;
  content: string;
  model: string;
  provider: ProviderId;
  errors: ClientError[];
}

export interface SendOptions {
  messages: Message[];
  persona: Persona;
  selection: ResolvedModel;
  hasImages: boolean;
  quota: QuotaMemory;
  onDelta: (text: string) => void;
  signal: AbortSignal;
}

export async function streamChat(opts: SendOptions): Promise<SendResult> {
  const { messages, persona, selection, hasImages, quota, onDelta, signal } = opts;

  /* Offline demo — rule-based template, no network. */
  if (selection.offline) {
    let content = '';
    for await (const token of offlineTokenStream({ persona, selectionLabel: 'Offline Demo', messages }, signal)) {
      content += token;
      onDelta(token);
    }
    return { ok: true, cancelled: signal.aborted, content, model: 'offline-demo', provider: 'openrouter', errors: [] };
  }

  /* Honest refusal: the selected model cannot see images. */
  if (hasImages && !selection.vision) {
    return {
      ok: false,
      cancelled: false,
      content: '',
      model: selection.id,
      provider: selection.provider,
      errors: [
        {
          kind: 'unavailable',
          message:
            `${selection.label} cannot see images. Switch the model to Auto (routes to a vision model), Gemini, or a vision model on OpenRouter.`,
        },
      ],
    };
  }

  const wire = buildWireMessages(messages, persona);
  const chain = buildChain(selection, hasImages);
  const errors: ClientError[] = [];

  for (const step of chain) {
    if (signal.aborted) {
      return { ok: false, cancelled: true, content: '', model: step.model, provider: step.provider, errors };
    }

    const skip = quota.skipModel(step.model, step.provider);
    if (skip) {
      errors.push({ kind: 'rate_limit', message: `Skipped — ${skip}`, provider: step.provider });
      continue;
    }

    let response: Response;
    try {
      response = await postChat({
        provider: step.provider,
        model: step.model,
        messages: wire,
        stream: true,
        temperature: 0.7,
      });
    } catch (err) {
      if (signal.aborted) {
        return { ok: false, cancelled: true, content: '', model: step.model, provider: step.provider, errors };
      }
      errors.push({
        kind: 'http',
        message: err instanceof Error ? err.message : 'Network error reaching the proxy.',
        provider: step.provider,
      });
      continue;
    }

    if (!response.ok) {
      const clientError = await parseErrorResponse(response);
      clientError.provider = step.provider;
      if (clientError.kind === 'rate_limit') quota.hit(step.model, step.provider);
      errors.push(clientError);

      if (isRetryable(response.status)) {
        // Nothing streamed yet — safe to try the next provider in the chain.
        continue;
      }
      // Non-retryable (bad request, provider not configured on a single-model chain…)
      break;
    }

    /* Streaming has started: never switch provider from here on. */
    let content = '';
    const stream = await readStreamText(response, (delta) => {
      content += delta;
      onDelta(delta);
    });

    return {
      ok: true,
      cancelled: stream.cancelled || signal.aborted,
      content,
      model: step.model,
      provider: step.provider,
      errors,
    };
  }

  return {
    ok: false,
    cancelled: signal.aborted,
    content: '',
    model: chain[chain.length - 1].model,
    provider: chain[chain.length - 1].provider,
    errors,
  };
}
