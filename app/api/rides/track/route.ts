import { NextRequest, NextResponse } from "next/server";
import { getPublicRideTracking } from "@/lib/rideStore";

/**
 * GET /api/rides/track?requestId=xxx — Returns a public read-only live tracking snapshot
 * for shared campus ride links (`/track/[requestId]`). Never exposes the passenger's 4-digit OTP.
 */
export async function GET(req: NextRequest) {
  const requestId = req.nextUrl.searchParams.get("requestId")?.trim();
  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId parameter." }, { status: 400 });
  }

  const tracking = getPublicRideTracking(requestId);
  if (!tracking) {
    return NextResponse.json({ error: "Ride not found." }, { status: 404 });
  }

  return NextResponse.json({ tracking });
}

