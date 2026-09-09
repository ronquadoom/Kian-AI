import type { ProviderId } from './types';
import { MODEL_ID_SLUG } from './constants';

/** Allowed upstream hosts. Path building is internal and never injects user input. */
export const GROQ_HOST = 'api.groq.com';
export const GEMINI_HOST = 'generativelanguage.googleapis.com';
export const OPENROUTER_HOST = 'openrouter.ai';

export type RouteKind = 'groq' | 'gemini' | 'openrouter';

export function providerHost(provider: ProviderId): string {
  switch (provider) {
    case 'groq':
      return GROQ_HOST;
    case 'gemini':
      return GEMINI_HOST;
    case 'openrouter':
      return OPENROUTER_HOST;
  }
}

export interface ModelRoute {
  provider: ProviderId;
  model: string;
  kind: RouteKind;
  url: string;
  headers: Record<string, string>;
}

export function resolveModel(model: string): ModelRoute {
  if (model === 'auto') {
    return {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      kind: 'groq',
      url: `https://${GROQ_HOST}/openai/v1/chat/completions`,
      headers: {},
    };
  }

  if (model.startsWith('gemini')) {
    return {
      provider: 'gemini',
      model,
      kind: 'gemini',
      url: `https://${GEMINI_HOST}/v1beta/models/${model}:streamGenerateContent?alt=sse`,
      headers: {},
    };
  }

  if (model.includes('/')) {
    return {
      provider: 'openrouter',
      model,
      kind: 'openrouter',
      url: `https://${OPENROUTER_HOST}/api/v1/chat/completions`,
      headers: {},
    };
  }

  return {
    provider: 'groq',
    model,
    kind: 'groq',
    url: `https://${GROQ_HOST}/openai/v1/chat/completions`,
    headers: {},
  };
}

export function isValidModelId(model: string): boolean {
  if (typeof model !== 'string' || model.length === 0 || model.length > 128) return false;
  if (model.includes('..')) return false;
  if (model.startsWith('/') || model.endsWith('/') || model.startsWith('.')) return false;
  return MODEL_ID_SLUG.test(model);
}
