/**
 * Shared rate limiters for the API routes. Kept on globalThis so dev hot reloads and separate
 * route bundles share one set of counters.
 */
import { createRateLimiter, type RateLimiter } from "./rateLimit";

interface Limiters {
  /** Login attempts per client IP + email. */
  loginAccount: RateLimiter;
  /** Login attempts per client IP (loose: many students may share one campus NAT). */
  loginIp: RateLimiter;
  /** Place search / reverse geocoding per signed-in user. */
  geocode: RateLimiter;
  /** Route lookups per signed-in user. */
  route: RateLimiter;
  /** Calls that actually hit Nominatim, across all users (their usage policy is ~1 request/second). */
  nominatim: RateLimiter;
  /** Calls that actually hit the OSRM demo server, across all users. */
  osrm: RateLimiter;
}

const globalForLimiters = globalThis as unknown as { __hoponLimiters?: Limiters };

export const limiters: Limiters = (globalForLimiters.__hoponLimiters ??= {
  loginAccount: createRateLimiter({ limit: 8, windowMs: 15 * 60 * 1000 }),
  loginIp: createRateLimiter({ limit: 100, windowMs: 15 * 60 * 1000 }),
  geocode: createRateLimiter({ limit: 60, windowMs: 60 * 1000 }),
  route: createRateLimiter({ limit: 60, windowMs: 60 * 1000 }),
  nominatim: createRateLimiter({ limit: 50, windowMs: 60 * 1000, maxKeys: 4 }),
  osrm: createRateLimiter({ limit: 120, windowMs: 60 * 1000, maxKeys: 4 }),
});
