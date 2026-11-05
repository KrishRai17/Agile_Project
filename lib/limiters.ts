/**
 * Shared rate limiters for the API routes. Kept on globalThis so dev hot reloads and separate
 * route bundles share one set of counters.
 */
import {
  createExponentialBackoffLimiter,
  createRateLimiter,
  type ExponentialBackoffLimiter,
  type RateLimiter,
} from "./rateLimit";

interface Limiters {
  /** Login attempts per normalized email + known client IP. */
  loginAccount: RateLimiter;
  /** Per-email exponential backoff (slows down attempts without 15-min hard lockout). */
  loginEmail: ExponentialBackoffLimiter;
  /** Login attempts per known client IP (loose: many students may share one campus NAT). */
  loginIp: RateLimiter;
  /** Account registration attempts (separate from loginIp). */
  register: RateLimiter;
  /** Public tracking link lookups per client IP. */
  publicTrack: RateLimiter;
  /** Place search / reverse geocoding per signed-in user. */
  geocode: RateLimiter;
  /** Route lookups per signed-in user. */
  route: RateLimiter;
  /** Calls that actually hit Nominatim, across all users (their usage policy is ~1 request/second). */
  nominatim: RateLimiter;
  /** Calls that actually hit the OSRM demo server, across all users. */
  osrm: RateLimiter;
  /** In-ride chat messages per signed-in user. */
  chat: RateLimiter;
  /** Live GPS location updates per signed-in user. */
  location: RateLimiter;
  /** Creating, cancelling, or responding to ride requests per signed-in user. */
  rideRequests: RateLimiter;
  /** Wallet operations per signed-in user. */
  wallet: RateLimiter;
  /** Post-ride rating submissions per signed-in user. */
  rating: RateLimiter;
  /** Cashier manual verification attempts per client IP / global bucket. */
  cashier: RateLimiter;
  /** Resending verification email per user ID and per email address (3 per hour). */
  verifyResend: RateLimiter;
  /** Global registration bucket when client IP is unknown (30 per 15 min). */
  registerGlobal: RateLimiter;
  /** Location updates for idle drivers without an active accepted ride (20 per min). */
  locationIdle: RateLimiter;
}

const globalForLimiters = globalThis as unknown as { __hoponLimiters?: Limiters };

export const limiters: Limiters = (globalForLimiters.__hoponLimiters ??= {
  loginAccount: createRateLimiter({ limit: 8, windowMs: 15 * 60 * 1000 }),
  loginEmail: createExponentialBackoffLimiter({
    freeAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30_000,
    ttlMs: 15 * 60 * 1000,
  }),
  loginIp: createRateLimiter({ limit: 100, windowMs: 15 * 60 * 1000 }),
  register: createRateLimiter({ limit: 15, windowMs: 15 * 60 * 1000 }),
  publicTrack: createRateLimiter({ limit: 60, windowMs: 60 * 1000 }),
  geocode: createRateLimiter({ limit: 120, windowMs: 60 * 1000 }),
  route: createRateLimiter({ limit: 300, windowMs: 60 * 1000 }),
  nominatim: createRateLimiter({ limit: 60, windowMs: 60 * 1000, maxKeys: 4 }),
  osrm: createRateLimiter({ limit: 300, windowMs: 60 * 1000, maxKeys: 4 }),
  chat: createRateLimiter({ limit: 30, windowMs: 60 * 1000 }),
  location: createRateLimiter({ limit: 120, windowMs: 60 * 1000 }),
  rideRequests: createRateLimiter({ limit: 30, windowMs: 60 * 1000 }),
  wallet: createRateLimiter({ limit: 15, windowMs: 60 * 1000 }),
  rating: createRateLimiter({ limit: 10, windowMs: 60 * 1000 }),
  cashier: createRateLimiter({ limit: 20, windowMs: 15 * 60 * 1000 }),
  verifyResend: createRateLimiter({ limit: 3, windowMs: 60 * 60 * 1000 }),
  registerGlobal: createRateLimiter({ limit: 30, windowMs: 15 * 60 * 1000 }),
  locationIdle: createRateLimiter({ limit: 20, windowMs: 60 * 1000 }),
});
