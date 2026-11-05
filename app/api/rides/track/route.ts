import { NextRequest, NextResponse } from "next/server";
import { clientIp, readJsonObject, requireUser, tooManyRequests } from "@/lib/apiAuth";
import { limiters } from "@/lib/limiters";
import {
  createTrackingToken,
  getPublicRideTracking,
  revokeTrackingToken,
} from "@/lib/rideStore";

/**
 * GET /api/rides/track?token=xxx — Returns a minimal public read-only live tracking snapshot
 * for shared campus ride links (`/track/[token]`). Never exposes OTP, passenger full name, or vehicle plate.
 * Rate-limited per client IP and backed by an O(1) shareToken -> requestId index.
 * Remains valid for 10 minutes after ride completion ("Trip Completed") and stops working immediately
 * once cancelled/rejected or older than 24 hours.
 */
export async function GET(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get("token")?.trim() ||
    req.nextUrl.searchParams.get("requestId")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing tracking token." }, { status: 400 });
  }

  const ip = clientIp(req.headers);
  const trackKey = ip !== "unknown" ? ip : `token:${token}`;
  const rateCheck = limiters.publicTrack.check(trackKey);
  if (!rateCheck.allowed) {
    return tooManyRequests(rateCheck.retryAfterSec);
  }

  const tracking = getPublicRideTracking(token);
  if (!tracking) {
    return NextResponse.json({ error: "Ride tracking link expired or not found." }, { status: 404 });
  }

  return NextResponse.json({ tracking });
}

/**
 * POST /api/rides/track — Generates a random share token for a ride request.
 * Only the passenger of that request can generate it.
 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(req);
  const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
  if (!requestId) {
    return NextResponse.json({ error: "requestId is required." }, { status: 400 });
  }

  const result = createTrackingToken(requestId, auth.user.id);
  if ("error" in result) {
    const status = result.error.includes("Only the passenger") ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ token: result.token });
}

/**
 * DELETE /api/rides/track — Revokes the share token for a ride request.
 * Only the passenger of that request can revoke it.
 */
export async function DELETE(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(req);
  const requestId =
    (typeof body?.requestId === "string" ? body.requestId.trim() : "") ||
    req.nextUrl.searchParams.get("requestId")?.trim() ||
    "";
  if (!requestId) {
    return NextResponse.json({ error: "requestId is required." }, { status: 400 });
  }

  const result = revokeTrackingToken(requestId, auth.user.id);
  if ("error" in result) {
    const status = result.error.includes("Only the passenger") ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}


