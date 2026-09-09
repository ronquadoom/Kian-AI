/**
 * Client-side Offline Demo — a rule-based template, NOT a model.
 * No network call is made; this only renders a deterministic canned response.
 */

import type { Message, Persona } from '../types';

export interface OfflineContext {
  persona: Persona;
  selectionLabel: string;
  messages: Message[];
}

const SPLIT_RE = /(\s+|[,.;:!?()\[\]{}"'])/;

function tokenize(text: string): string[] {
  return text.split(SPLIT_RE).filter((t) => t.length > 0);
}

export function offlineMarkdown(ctx: OfflineContext): string {
  const { persona, selectionLabel, messages } = ctx;
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');

  let images = 0;
  let docs = 0;
  let docChars = 0;
  for (const m of messages) {
    images += m.images?.length ?? 0;
    for (const d of m.documents ?? []) {
      docs += 1;
      docChars += d.text.length;
    }
  }

  const lines: string[] = [];
  lines.push('You are talking to **Offline Demo** — a rule-based template, not a language model.');
  lines.push('No network call was made, and no AI generated this reply. The app never fakes an answer.');
  lines.push('');
  lines.push('### What a real request would look like');
  lines.push(`- **Selected model:** ${selectionLabel}`);
  lines.push(`- **Persona:** ${persona.emoji} ${persona.name}`);
  lines.push(`- **Turns:** ${messages.length} · **Images:** ${images} · **Docs:** ${docs} (${docChars} chars)`);
  lines.push('');
  lines.push('### Latest message');
  if (lastUser) {
    const text = lastUser.content.trim();
    lines.push(`> ${text ? (text.length > 280 ? text.slice(0, 280) + '…' : text) : '_(attachments only)_'}`);
  } else {
    lines.push('_(empty conversation)_');
  }
  lines.push('');
  lines.push('To get real answers, switch the model picker to **Auto** or a named model. If those return an error, the proxy has no keys for that provider — add them in the server environment (see README → Credentials).');
  lines.push('');
  lines.push('Until then you can still try everything else: create and rename sessions, switch personas (✨ assistant · 💻 coder · ✍️ writer), attach an image or PDF, and use text-to-speech.');
  return lines.join('\n');
}

export async function* offlineTokenStream(ctx: OfflineContext, signal?: AbortSignal): AsyncGenerator<string> {
  const markdown = offlineMarkdown(ctx);
  for (const token of tokenize(markdown)) {
    if (signal?.aborted) return;
    yield token;
    await new Promise((r) => setTimeout(r, 3));
  }
}
