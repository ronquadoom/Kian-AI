import type { ModelDef, ProviderId } from '../types';
import { MODELS, OFFLINE_MODEL_ID } from '../../shared/constants';

export interface ResolvedModel {
  id: string;
  label: string;
  provider: ProviderId;
  vision: boolean;
  offline: boolean;
}

export function modelById(id: string): ModelDef | undefined {
  return MODELS.find((m) => m.id === id);
}

export function isOffline(id: string): boolean {
  return id === OFFLINE_MODEL_ID;
}

/**
 * Resolve the picker selection into a concrete model to send to the proxy.
 * - `auto` starts a failover chain (Groq → Gemini → OpenRouter).
 * - Image messages route to a vision model (no Groq model accepts images).
 */
export function resolveSelection(id: string, hasImages: boolean): ResolvedModel {
  if (isOffline(id)) {
    return { id: OFFLINE_MODEL_ID, label: 'Offline Demo', provider: 'openrouter', vision: false, offline: true };
  }

  const def = modelById(id);
  if (!def) return resolveSelection('auto', hasImages);

  if (id === 'auto') {
    if (hasImages) {
      const vision = MODELS.find((m) => m.id !== 'auto' && m.vision) ?? MODELS[3];
      return { id: vision.id, label: `${vision.label} (Auto · vision)`, provider: vision.provider, vision: true, offline: false };
    }
    return { id: 'auto', label: 'Auto', provider: 'openrouter', vision: false, offline: false };
  }

  return { id: def.id, label: def.label, provider: def.provider, vision: !!def.vision, offline: false };
}
