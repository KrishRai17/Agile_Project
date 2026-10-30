/**
 * Tiny in-memory fixed-window rate limiter. Pure functions, no framework imports.
 * State lives in the Node process, so with several server instances each one counts separately;
 * use a shared store (e.g. Redis) if you scale out.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets (0 when allowed). */
  retryAfterSec: number;
}

export interface RateLimiter {
  check(key: string, nowMs?: number): RateLimitResult;
  reset(key: string): void;
  size(): number;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  /** Upper bound on tracked keys so memory cannot grow without limit. */
  maxKeys?: number;
}): RateLimiter {
  const { limit, windowMs } = options;
  const maxKeys = options.maxKeys ?? 5000;
  const hits = new Map<string, { count: number; resetAt: number }>();

  function makeRoom(now: number): void {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
    // Still full of live entries: drop the oldest ones.
    while (hits.size >= maxKeys) {
      const oldest = hits.keys().next().value;
      if (oldest === undefined) break;
      hits.delete(oldest);
    }
  }

  return {
    check(key, now = Date.now()) {
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        if (!entry && hits.size >= maxKeys) makeRoom(now);
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSec: 0 };
      }
      if (entry.count >= limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
        };
      }
      entry.count += 1;
      return { allowed: true, remaining: Math.max(0, limit - entry.count), retryAfterSec: 0 };
    },
    reset(key) {
      hits.delete(key);
    },
    size() {
      return hits.size;
    },
  };
}

/**
 * Best-effort client IP. X-Forwarded-For is only trustworthy behind a proxy you control
 * (Vercel, nginx, ...); otherwise a client can spoof it, so never rely on this alone.
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
