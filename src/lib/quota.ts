/**
 * Quota memory + the client→proxy transport.
 *
 * On a 429/5xx (before output has streamed) the caller retries the next
 * provider in the failover chain; once output has streamed we NEVER switch.
 * This module records the 429 in the session cooldown registry so the next
 * message skips that model.
 */

import type { ChatRequestPayload, ProviderId } from '../../shared/types';
import { CooldownRegistry } from './cooldown';

export interface ClientError {
  kind: 'http' | 'json' | 'stream' | 'rate_limit' | 'unavailable';
  status?: number;
  message: string;
  provider?: ProviderId;
}

export class QuotaMemory {
  private registry = new CooldownRegistry();

  cooldown(): CooldownRegistry {
    return this.registry;
  }

  /** Remember a 429 for a model + its provider. */
  hit(model: string, provider: ProviderId): void {
    this.registry.prune();
    this.registry.hit('model', model);
    this.registry.hit('provider', provider);
  }

  skipModel(model: string, provider: ProviderId): string {
    const modelBlocked = this.registry.isBlocked('model', model);
    const providerBlocked = this.registry.isBlocked('provider', provider);
    if (modelBlocked) return `model ${model} is cooling down (${this.registry.describe('model', model)})`;
    if (providerBlocked) return `provider ${provider} is cooling down (${this.registry.describe('provider', provider)})`;
    return '';
  }
}

export async function postChat(payload: ChatRequestPayload): Promise<Response> {
  return fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Deliberately no auth header — the proxy attaches keys from env.
    body: JSON.stringify({ provider: payload.provider, model: payload.model, payload }),
  });
}

export function isRetryable(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export async function parseErrorResponse(response: Response): Promise<ClientError> {
  let message = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    if (body?.error?.message) message = body.error.message;
  } catch {
    /* keep default */
  }
  const rateLimited = response.status === 429;
  return {
    kind: rateLimited ? 'rate_limit' : 'http',
    status: response.status,
    message,
  };
}
