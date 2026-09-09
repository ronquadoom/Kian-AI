import { describe, expect, it, vi } from 'vitest';
import { CooldownRegistry } from '../src/lib/cooldown';

describe('CooldownRegistry — quota memory', () => {
  it('is not blocked before any 429', () => {
    const reg = new CooldownRegistry();
    expect(reg.isBlocked('model', 'llama-3.3-70b-versatile')).toBe(false);
  });

  it('escalates 60s → 10min → until midnight UTC', () => {
    vi.useFakeTimers();
    try {
      const now = new Date('2026-09-09T12:00:00Z').getTime();
      vi.setSystemTime(now);
      const reg = new CooldownRegistry();
      const id = 'gemini-2.0-flash';

      reg.hit('model', id);
      expect(reg.isBlocked('model', id)).toBe(true);
      expect(reg.describe('model', id)).toBe('60s');

      // Second hit while already cooling → next tier (10 min).
      reg.hit('model', id);
      expect(reg.describe('model', id)).toBe('10m');

      // Third hit → until midnight UTC.
      reg.hit('model', id);
      expect(reg.describe('model', id)).toBe('until midnight UTC');

      // Just before midnight it is still blocked…
      vi.setSystemTime(new Date('2026-09-09T23:59:59Z').getTime());
      expect(reg.isBlocked('model', id)).toBe(true);

      // …and cleared right after midnight.
      vi.setSystemTime(new Date('2026-09-10T00:00:01Z').getTime());
      expect(reg.isBlocked('model', id)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('prunes expired entries', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-09T12:00:00Z').getTime());
      const reg = new CooldownRegistry();
      reg.hit('model', 'x');
      vi.setSystemTime(new Date('2026-09-09T12:02:00Z').getTime());
      reg.prune();
      expect(reg.isBlocked('model', 'x')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks at provider scope too', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now());
      const reg = new CooldownRegistry();
      reg.hit('provider', 'groq');
      expect(reg.isBlocked('provider', 'groq')).toBe(true);
      expect(reg.isBlocked('model', 'some-model')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
