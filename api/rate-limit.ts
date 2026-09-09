/**
 * In-memory fixed-window rate-limit store.
 *
 * Honest note: in-memory state resets whenever the serverless instance is
 * recycled and is NOT shared across instances, so it is a best-effort bill
 * guard, not a hard guarantee. Set UPSTASH_REDIS_REST_URL /
 * UPSTASH_REDIS_REST_TOKEN to get durable, shared limits via Upstash REST
 * (the api/chat.ts module already supports it).
 */

export interface RateLimitState {
  /** Increment a bucket and return the new count. */
  hit(bucket: string, limit: number, windowMs: number): Promise<number>;
}

interface Bucket {
  count: number;
  limit: number;
  windowMs: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function prune(): void {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export function createRateLimitStore(): RateLimitState {
  return {
    async hit(bucket: string, limit: number, windowMs: number): Promise<number> {
      prune();
      const now = Date.now();
      const existing = buckets.get(bucket);
      if (!existing || existing.resetAt <= now) {
        buckets.set(bucket, { count: 1, limit, windowMs, resetAt: now + windowMs });
        return 1;
      }
      existing.count += 1;
      return existing.count;
    },
  };
}

/** Exposed for tests. */
export function __resetRateLimitStore(): void {
  buckets.clear();
}

/** Exposed for tests. */
export function __rateLimitBucketCount(): number {
  return buckets.size;
}
