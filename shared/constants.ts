import type { ModelDef, Persona, ProviderId } from '../src/types';

export const PROVIDER_IDS = ['openrouter', 'groq', 'gemini'] as const;

/** Providers the zero-setup proxy will accept. Anything else is rejected. */
export const PROXY_PROVIDER_ALLOW_LIST: readonly string[] = PROVIDER_IDS;

/**
 * Model ids are slugs: alphanumeric plus `.`, `_`, `-`, and `/` (for OpenRouter
 * "org/model" ids). `..` is rejected separately so traversal is impossible.
 */
export const MODEL_ID_SLUG = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  /** Tailwind-independent accent hex used for glows, badges, etc. */
  accent: string;
  /** Tailwind-independent text color hex. */
  text: string;
  /** Tailwind-independent border/soft color hex. */
  soft: string;
  freeQuota: string;
  limits: string[];
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  groq: {
    id: 'groq',
    name: 'Groq',
    accent: '#f59e0b',
    text: '#fbbf24',
    soft: 'rgba(245, 158, 11, 0.16)',
    freeQuota: '~30 req/min + per-model daily caps',
    limits: ['Free tier is rate-limited per minute and per model, per day.', 'No Groq model accepts images.'],
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    accent: '#10b981',
    text: '#34d399',
    soft: 'rgba(16, 185, 129, 0.16)',
    freeQuota: 'Flash ~250–1,500/day · Flash-Lite ~1,000/day',
    limits: [
      'Free tier prompts may be used to improve Google products.',
      'Gemini free tier is not available in the EU/EEA/UK/Switzerland.',
    ],
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    accent: '#8b5cf6',
    text: '#a78bfa',
    soft: 'rgba(139, 92, 246, 0.16)',
    freeQuota: '50 requests/day, account-level',
    limits: ['Free models have daily per-model caps and account-level limits.'],
  },
};

export const MODELS: ModelDef[] = [
  {
    id: 'auto',
    label: 'Auto',
    provider: 'openrouter',
    note: 'Groq → Gemini → OpenRouter, images to vision models',
  },
  {
    id: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B',
    provider: 'groq',
    note: '~30 req/min + daily caps',
  },
  {
    id: 'deepseek-r1-distill-llama-70b',
    label: 'DeepSeek R1 · Llama 70B',
    provider: 'groq',
    note: '~30 req/min + daily caps',
  },
  {
    id: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    provider: 'gemini',
    vision: true,
    note: '~250–1,500/day · sees images',
  },
  {
    id: 'gemini-2.0-flash-lite',
    label: 'Gemini 2.0 Flash-Lite',
    provider: 'gemini',
    vision: true,
    note: '~1,000/day · sees images',
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    label: 'Llama 3.3 70B · OR',
    provider: 'openrouter',
    note: '50 req/day, account-level',
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct',
    label: 'Qwen 2.5 72B · OR',
    provider: 'openrouter',
    vision: true,
    note: '50 req/day · sees images',
  },
  {
    id: 'meta-llama/llama-3.2-90b-vision-instruct',
    label: 'Llama 3.2 90B Vision · OR',
    provider: 'openrouter',
    vision: true,
    note: '50 req/day · sees images',
  },
];

export const OFFLINE_MODEL_ID = 'offline-demo';

export const PERSONAS: Persona[] = [
  {
    id: 'assistant',
    name: 'Helpful Assistant',
    emoji: '✨',
    description: 'Friendly, concise, and helpful.',
    systemPrompt:
      'You are Kian, a friendly, accurate assistant. Answer clearly and concisely. If you do not know something, say so. Prefer plain language over jargon.',
  },
  {
    id: 'coder',
    name: 'Coder',
    emoji: '💻',
    description: 'Code-first, terse, with runnable examples.',
    systemPrompt:
      'You are an expert software engineer. Give correct, idiomatic, working code with minimal prose. Point out trade-offs and edge cases briefly. Never invent APIs.',
  },
  {
    id: 'writer',
    name: 'Writer',
    emoji: '✍️',
    description: 'Editorial, polished prose.',
    systemPrompt:
      'You are a skilled writer and editor. Produce clear, well-structured, engaging prose. Match tone to the user\u2019s request and revise confidently.',
  },
];

export const DEFAULT_PERSONA = PERSONAS[0];

export const DEFAULT_MODEL_ID = 'auto';

/** OpenRouter rejects messages that carry more than 20 combined attachments. */
export const MAX_IMAGES = 10;
export const MAX_DOCUMENTS = 5;
export const MAX_ATTACHMENTS = 20;
export const MAX_DOC_CHARS = 24_000;
