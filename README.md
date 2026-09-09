# Kian AI

A free, browser-based AI chat web app that talks to **real language models** over HTTP. It never fakes an answer: if it can't reach a model, it says so plainly instead of inventing a reply.

- **Stack:** React 19 + TypeScript + Vite + Tailwind CSS 4, with a single Node serverless function (`api/chat.ts`) as the proxy.
- **Providers:** Groq, Google Gemini, and OpenRouter — each with a different wire format, handled separately.
- **Zero-setup proxy:** visitors need no API keys; keys live in server environment variables.

---

## Features

- **Streaming chat** — tokens appear as they're generated, with a blinking caret.
- **Multiple sessions** — create, switch, rename, and delete chats in the sidebar.
- **Model picker** — an **Auto** mode, named models, and a clearly-labeled **Offline Demo** (a rule-based template, *not* a model).
- **Personas** — switchable system prompts (✨ helpful assistant · 💻 coder · ✍️ writer).
- **Voice** — optional text-to-speech read-back (`SpeechSynthesis`) and speech-to-text input (`SpeechRecognition`), used only where the browser supports them.
- **Persistence** — chats and settings live in `localStorage`.
- **Attachments** — up to 10 images and 5 documents per message, with browser-side image downscaling and PDF/text extraction.
- **Auto / failover** — an ordered chain (Groq first, OpenRouter last) with per-model quota memory.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 (Vite dev middleware emulates /api/chat)
```

Then create a `.env` (copy `.env.example`) with the provider keys you want to use. Restart the dev server after adding keys.

```bash
npm run build      # production build (type-check + Vite)
npm test           # Vitest suite
```

## Credentials

Keys are read **only** from server environment variables — never from the client, and never committed. A key shipped in the client bundle is public.

| Variable | Provider | Where to get it |
| --- | --- | --- |
| `GROQ_API_KEY` | Groq | https://console.groq.com/keys |
| `GEMINI_API_KEY` | Google Gemini | https://aistudio.google.com/app/apikey |
| `OPENROUTER_API_KEY` | OpenRouter | https://openrouter.ai/settings/keys |
| `OPENROUTER_REFERER` | OpenRouter (optional) | Your site URL (some free models require a referer) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Rate limits (optional) | https://upstash.com (enables durable, shared limits) |

Local dev: `.env` is loaded by the Vite dev server (Node 22+). On Vercel, set the same variables in project settings.

## Providers & free quotas

“Free” means **$0, not unlimited**. Limits are approximate and set by each provider; they change over time. The app surfaces these in Settings & limits.

| Provider | Free quota (approx.) | Auth header |
| --- | --- | --- |
| Groq | ~30 req/min + per-model daily caps | `Authorization: Bearer <key>` |
| Google Gemini | Flash ~250–1,500/day, Flash-Lite ~1,000/day | `x-goog-api-key: <key>` |
| OpenRouter | 50 requests/day, account-level | `Authorization: Bearer <key>` |

**Honesty notes (also shown in the UI):**

- Gemini's free tier may use prompts to improve Google products.
- Gemini's free tier is not available in the EU/EEA/UK/Switzerland.

## Wire formats (handled separately — no shared request builder)

- **Groq / OpenRouter** are OpenAI-compatible: `POST .../chat/completions`, a `messages` array, `stream: true`, with deltas at `choices[0].delta.content`.
- **Gemini** is different: `POST .../models/{model}:streamGenerateContent?alt=sse`; system prompt in `systemInstruction`, history in `contents[].parts`, assistant role is `"model"`, images as `inline_data`, deltas at `candidates[0].content.parts[].text`, **no `[DONE]` terminator**, and signature-only chunks are skipped. The client stream parser handles both shapes.

## Auto / failover & quota memory

- **Auto** uses an ordered chain — Groq first, OpenRouter last. For image messages it routes to vision-capable models (no Groq model accepts images).
- On a retryable error (429 / 5xx) it tries the next provider — but **never** after output has started streaming.
- On a 429 it remembers the model for the session with an **escalating cooldown**: 60 s → 10 min → until midnight UTC, so the next message skips it.

## Attachments

- Up to **10 images** and **5 documents** per message (OpenRouter rejects > 20 combined).
- **Images** are downscaled in the browser to a 1024 px longest side, JPEG, with per-image 1.5 MB and per-message 3 MB caps to fit the serverless 4.5 MB body; the original is used if the browser can't resize.
- **Documents:** PDF text via pdf.js (lazy-loaded) and plain text files, shared against a 24,000-char budget.

## The zero-setup proxy (`api/chat.ts`)

- Accepts a provider allow-list (`openrouter` / `groq` / `gemini`) only.
- Validates model ids as slugs and rejects `..` traversal.
- Reads keys from `process.env` only; caller-supplied credentials are ignored.
- Streams the provider response through and passes error statuses through.
- Client sends `{provider, model, payload}` with **no auth header**; the proxy attaches the key.

**Rate limits (in-memory fixed windows):** 20 per visitor per minute, 200 per visitor per day, and a 2,000-per-day global bill guard. In-memory state resets when the serverless instance is recycled and is *not* shared across instances, so it is a best-effort guard — set the Upstash variables for durable, shared limits (the Redis path is plain Upstash REST).

## Design

Dark, near-black deep-space theme (`#090d16` / `#0b0f19`), glassmorphism panels, an animated aurora/nebula backdrop (blurred cyan/purple/indigo glows + a star-field + grain), cyan/emerald/purple/amber accents, and micro-interactions (bubble fade/slide-in, blinking caret, hover lift, a cyan-to-purple gradient send button with intensifying glow). Geometric sans for UI, monospace for keys/code.

## Tests

`npm test` runs 50 Vitest tests across 8 files, using stubbed `fetch` and synthetic SSE streams:

- routing (Auto → vision, failover order, model id validation),
- payload builders for all three wire formats,
- streaming parser (OpenAI + Gemini chunks, split boundaries, `[DONE]`, signature-only skip),
- failover + cooldowns + "never switch after streaming" + non-vision image refusal,
- the proxy (allow-list, traversal rejection, env-only keys, streaming through, error passthrough, rate limits),
- the in-memory rate-limit store,
- **real PDF text extraction** from a committed fixture (`test/fixtures/sample.pdf`, generated by `scripts/make-pdf-fixture.mjs`).

## What could not be verified live

Honest limitations of this environment — these are covered by tests but were **not** exercised against the real services:

- **Live calls to Groq, Gemini, and OpenRouter** (no keys were available here). Wire formats and auth are asserted against the documented schemas with stubbed responses only.
- **Browser image downscaling** (canvas resizing) — the fallback-to-original path is unit-testable, but the canvas path needs a real browser.
- **Text-to-speech / speech-to-text** — feature-gated on browser support; not exercised here.
- **Vercel deployment and the Upstash Redis rate-limit path** — implemented but not deployed against real infrastructure.
- **Other runtime-only behavior** — real streaming latency, aborting mid-stream against a live provider, and `localStorage` quota behavior across browsers.

## License

MIT
