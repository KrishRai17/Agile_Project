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

export interface BackoffResult {
  allowed: boolean;
  failures: number;
  delayMs: number;
  retryAfterSec: number;
}

export interface ExponentialBackoffLimiter {
  check(key: string, nowMs?: number, recordAttempt?: boolean): BackoffResult;
  recordFailure(key: string, nowMs?: number): BackoffResult;
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
 * Per-key exponential backoff limiter that slows down repeated attempts (e.g. 1s, 2s, 4s, 8s...)
 * after `freeAttempts` instead of hard-locking an account for 15 minutes.
 */
export function createExponentialBackoffLimiter(options?: {
  freeAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  ttlMs?: number;
  maxKeys?: number;
}): ExponentialBackoffLimiter {
  const freeAttempts = options?.freeAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 30_000;
  const ttlMs = options?.ttlMs ?? 15 * 60 * 1000;
  const maxKeys = options?.maxKeys ?? 5000;
  const entries = new Map<string, { failures: number; nextAllowedAt: number; expiresAt: number }>();

  function makeRoom(now: number): void {
    for (const [k, v] of entries) {
      if (v.expiresAt <= now) entries.delete(k);
    }
    while (entries.size >= maxKeys) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  return {
    check(key, now = Date.now(), recordAttempt = true) {
      const existing = entries.get(key);
      if (existing && existing.expiresAt > now) {
        if (now < existing.nextAllowedAt) {
          const waitMs = existing.nextAllowedAt - now;
          return {
            allowed: false,
            failures: existing.failures,
            delayMs: waitMs,
            retryAfterSec: Math.max(1, Math.ceil(waitMs / 1000)),
          };
        }
        if (!recordAttempt) {
          return {
            allowed: true,
            failures: existing.failures,
            delayMs: 0,
            retryAfterSec: 0,
          };
        }
        const failures = existing.failures + 1;
        const exponent = Math.max(0, failures - freeAttempts);
        const delayMs =
          failures >= freeAttempts ? Math.min(maxDelayMs, baseDelayMs * 2 ** exponent) : 0;
        entries.set(key, {
          failures,
          nextAllowedAt: now + delayMs,
          expiresAt: now + ttlMs,
        });
        return {
          allowed: true,
          failures,
          delayMs,
          retryAfterSec: 0,
        };
      }

      if (!recordAttempt) {
        return {
          allowed: true,
          failures: 0,
          delayMs: 0,
          retryAfterSec: 0,
        };
      }

      if (entries.size >= maxKeys) makeRoom(now);
      const failures = 1;
      const delayMs = failures >= freeAttempts ? baseDelayMs : 0;
      entries.set(key, {
        failures,
        nextAllowedAt: now + delayMs,
        expiresAt: now + ttlMs,
      });
      return {
        allowed: true,
        failures,
        delayMs,
        retryAfterSec: 0,
      };
    },
    recordFailure(key, now = Date.now()) {
      return this.check(key, now, true);
    },
    reset(key) {
      entries.delete(key);
    },
    size() {
      return entries.size;
    },
  };
}

const globalForProxyWarn = globalThis as unknown as { __hoponProxyWarned?: boolean };

/**
 * Logs a one-time startup warning when running in production without `TRUST_PROXY=true`.
 */
export function warnIfUntrustedProxyInProduction(): boolean {
  if (process.env.NODE_ENV === "production" && process.env.TRUST_PROXY !== "true") {
    if (!globalForProxyWarn.__hoponProxyWarned) {
      globalForProxyWarn.__hoponProxyWarned = true;
      console.warn(
        "[HopOn] Warning: NODE_ENV is 'production' but TRUST_PROXY is not 'true'. Forwarded IP headers will be ignored."
      );
    }
    return true;
  }
  return false;
}

warnIfUntrustedProxyInProduction();

/**
 * Best-effort client IP. X-Forwarded-For / X-Real-IP are only trusted when `TRUST_PROXY=true`
 * (behind a reverse proxy you control such as Vercel or nginx); otherwise a client can spoof them.
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  warnIfUntrustedProxyInProduction();
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) {
      const parts = forwarded
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const parsedHops = parseInt(process.env.TRUSTED_PROXY_HOPS || "1", 10);
      const hops = Number.isFinite(parsedHops) && parsedHops >= 1 ? parsedHops : 1;
      if (parts.length >= hops) {
        const targetIp = parts[parts.length - hops];
        if (targetIp) return targetIp;
      }
    }
    const realIp = headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }
  return "unknown";
}
