import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRateLimitStore, __resetRateLimitStore } from '../api/rate-limit';

describe('in-memory fixed-window rate limits', () => {
  beforeEach(() => {
    __resetRateLimitStore();
  });

  it('increments within a window and resets after it', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-09T12:00:00Z').getTime());
      const store = createRateLimitStore();

      expect(await store.hit('visitor', 3, 60_000)).toBe(1);
      expect(await store.hit('visitor', 3, 60_000)).toBe(2);
      expect(await store.hit('visitor', 3, 60_000)).toBe(3);

      // Window passes.
      vi.setSystemTime(new Date('2026-09-09T12:01:00Z').getTime());
      expect(await store.hit('visitor', 3, 60_000)).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps separate buckets independent', async () => {
    const store = createRateLimitStore();
    expect(await store.hit('a', 2, 60_000)).toBe(1);
    expect(await store.hit('b', 2, 60_000)).toBe(1);
    expect(await store.hit('a', 2, 60_000)).toBe(2);
  });
});
