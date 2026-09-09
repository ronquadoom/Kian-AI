/**
 * Quota memory: after a 429 we remember the model for the session with an
 * escalating cooldown — 60s, then 10 minutes, then until midnight UTC — so the
 * next message skips it.
 */

const TIER_MS = [60_000, 10 * 60_000];

export type CooldownScope = 'model' | 'provider';

export interface CooldownEntry {
  tier: number;
  until: number;
}

export class CooldownRegistry {
  private entries = new Map<string, CooldownEntry>();

  key(scope: CooldownScope, id: string): string {
    return `${scope}:${id}`;
  }

  /** Record a 429 and advance the cooldown tier for the given model + provider. */
  hit(scope: CooldownScope, id: string): void {
    const key = this.key(scope, id);
    const existing = this.entries.get(key);
    const tier = existing ? Math.min(existing.tier + 1, 2) : 0;
    this.entries.set(key, { tier, until: this.untilForTier(tier) });
  }

  private untilForTier(tier: number): number {
    if (tier < 2) return Date.now() + TIER_MS[tier];
    // Tier 2 — until midnight UTC.
    const now = new Date();
    const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
    return midnight;
  }

  remainingMs(scope: CooldownScope, id: string): number {
    const entry = this.entries.get(this.key(scope, id));
    if (!entry) return 0;
    return Math.max(0, entry.until - Date.now());
  }

  /** True when the id should be skipped right now. */
  isBlocked(scope: CooldownScope, id: string): boolean {
    return this.remainingMs(scope, id) > 0;
  }

  /** Purge expired entries so the registry does not grow forever. */
  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.until <= now) this.entries.delete(key);
    }
  }

  describe(scope: CooldownScope, id: string): string {
    const ms = this.remainingMs(scope, id);
    if (ms <= 0) return '';
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 120) return `${seconds}s`;
    const minutes = Math.ceil(ms / 60_000);
    if (minutes < 120) return `${minutes}m`;
    return 'until midnight UTC';
  }
}
