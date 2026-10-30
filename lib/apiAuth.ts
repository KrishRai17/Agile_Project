/**
 * Helpers shared by API route handlers: session lookup, role checks, JSON parsing and 429 responses.
 */
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { getUserById } from "@/lib/accounts";
import type { User } from "@/lib/auth";

export { clientIp } from "@/lib/rateLimit";

/** The signed-in user for this request, or null. Identity always comes from the signed cookie. */
export function getSessionUser(req: NextRequest): User | null {
  const payload = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  return getUserById(payload.uid);
}

export type AuthResult = { user: User } | { response: NextResponse };

/**
 * Usage:
 *   const auth = requireUser(req, "driver");
 *   if ("response" in auth) return auth.response;
 *   const { user } = auth;
 */
export function requireUser(req: NextRequest, role?: "driver" | "passenger"): AuthResult {
  const user = getSessionUser(req);
  if (!user) {
    return { response: NextResponse.json({ error: "Please sign in to continue." }, { status: 401 }) };
  }
  if (role && user.role !== role) {
    return {
      response: NextResponse.json(
        { error: role === "driver" ? "Only student drivers can do this." : "Only riders can do this." },
        { status: 403 }
      ),
    };
  }
  return { user };
}

export function tooManyRequests(retryAfterSec: number, body: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly.", ...body },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

/** Parses the request body as a JSON object; null if it is missing, malformed or not an object. */
export async function readJsonObject(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
