import { describe, expect, it } from 'vitest';
import { resolveSelection } from '../src/lib/models';
import { buildChain } from '../src/lib/chat';
import { isValidModelId, resolveModel } from '../shared/models';

describe('resolveSelection', () => {
  it('routes Auto without images to a non-vision fallback model', () => {
    const sel = resolveSelection('auto', false);
    expect(sel.id).toBe('auto');
    expect(sel.offline).toBe(false);
  });

  it('routes Auto with images to a vision model', () => {
    const sel = resolveSelection('auto', true);
    expect(sel.vision).toBe(true);
    expect(sel.offline).toBe(false);
  });

  it('returns the offline demo when selected', () => {
    const sel = resolveSelection('offline-demo', false);
    expect(sel.offline).toBe(true);
    expect(sel.id).toBe('offline-demo');
  });

  it('keeps a named Groq model (not vision) as-is', () => {
    const sel = resolveSelection('llama-3.3-70b-versatile', false);
    expect(sel.provider).toBe('groq');
    expect(sel.vision).toBe(false);
  });
});

describe('buildChain', () => {
  it('orders Auto text chain Groq first, OpenRouter last', () => {
    const chain = buildChain({ id: 'auto', label: 'Auto', provider: 'openrouter', vision: false, offline: false }, false);
    expect(chain[0].provider).toBe('groq');
    expect(chain[chain.length - 1].provider).toBe('openrouter');
    expect(chain.length).toBe(3);
  });

  it('uses vision-capable providers for image messages', () => {
    const chain = buildChain({ id: 'auto', label: 'Auto', provider: 'openrouter', vision: true, offline: false }, true);
    expect(chain[0].provider).toBe('gemini');
    expect(chain[chain.length - 1].provider).toBe('openrouter');
  });

  it('is a single step for an explicit model', () => {
    const chain = buildChain(
      { id: 'llama-3.3-70b-versatile', label: 'Llama', provider: 'groq', vision: false, offline: false },
      false,
    );
    expect(chain).toEqual([{ model: 'llama-3.3-70b-versatile', provider: 'groq' }]);
  });
});

describe('model id validation', () => {
  it('rejects traversal', () => {
    expect(isValidModelId('../etc/passwd')).toBe(false);
    expect(isValidModelId('a/../b')).toBe(false);
    expect(isValidModelId('..%2Ffoo')).toBe(false);
    expect(isValidModelId('/leading')).toBe(false);
    expect(isValidModelId('trailing/')).toBe(false);
    expect(isValidModelId('')).toBe(false);
  });

  it('accepts provider model slugs', () => {
    expect(isValidModelId('llama-3.3-70b-versatile')).toBe(true);
    expect(isValidModelId('meta-llama/llama-3.3-70b-instruct')).toBe(true);
    expect(isValidModelId('gemini-2.0-flash')).toBe(true);
    expect(isValidModelId('offline-demo')).toBe(true);
  });

  it('routes gemini ids to the Gemini host', () => {
    expect(resolveModel('gemini-2.0-flash').kind).toBe('gemini');
    expect(resolveModel('gemini-2.0-flash').provider).toBe('gemini');
  });

  it('routes slash ids to OpenRouter and bare ids to Groq', () => {
    expect(resolveModel('meta-llama/llama-3.3-70b-instruct').kind).toBe('openrouter');
    expect(resolveModel('llama-3.3-70b-versatile').kind).toBe('groq');
  });
});
