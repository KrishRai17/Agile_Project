/**
 * Signed session tokens (HMAC-SHA256). Server-side only.
 *
 * A token is `base64url(payload).base64url(signature)`. The payload carries the user id and an
 * expiry; the signature stops anyone from forging or editing it. The secret comes from the
 * SESSION_SECRET environment variable and MUST be set in production.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "hopon_session";
/** Token lifetime for a normal (non "remember me") session. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24;
/** Token + cookie lifetime when the user ticks "Remember me". */
export const REMEMBER_ME_SECONDS = 60 * 60 * 24 * 30;

export interface SessionPayload {
  uid: string;
  iat: number;
  exp: number;
  ver?: number;
}

const DEV_SECRET = "hopon-dev-only-secret-do-not-use-in-production";

export function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 16) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set (16+ characters) in production.");
  }
  return DEV_SECRET;
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createSessionToken(
  uid: string,
  ttlSeconds: number = SESSION_TTL_SECONDS,
  secret: string = getSessionSecret(),
  nowMs: number = Date.now(),
  sessionVersion?: number | null
): string {
  const iat = Math.floor(nowMs / 1000);
  const payload: SessionPayload = {
    uid,
    iat,
    exp: iat + ttlSeconds,
    ...(sessionVersion !== null ? { ver: sessionVersion ?? 1 } : {}),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** Returns the payload for a valid, unexpired token, otherwise null. Never throws on bad input. */
export function verifySessionToken(
  token: string | null | undefined,
  secret: string = getSessionSecret(),
  nowMs: number = Date.now()
): SessionPayload | null {
  if (!token || typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const given = Buffer.from(signature);
  const expected = Buffer.from(sign(body, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp <= Math.floor(nowMs / 1000)) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
