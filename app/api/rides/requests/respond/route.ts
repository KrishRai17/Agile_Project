import { NextRequest, NextResponse } from "next/server";
import {
  respondToRequest,
  markDriverArrived,
  verifyRideOtp,
  completeRide,
  getDriverLocation,
  toDriverView,
} from "@/lib/rideStore";
import { readJsonObject, requireUser, tooManyRequests } from "@/lib/apiAuth";
import { limiters } from "@/lib/limiters";
import { cleanText, isValidLatLng } from "@/lib/validate";

// PATCH /api/rides/requests/respond
// body: { requestId, action: "accept" | "reject" | "arrive" | "verify_otp" | "complete", otp?: string, driverLat?: number, driverLng?: number, driverLocationName?: string }
// Only signed-in drivers can respond, and always as themselves (any driverId in the body is ignored).
export async function PATCH(req: NextRequest) {
  const auth = requireUser(req, "driver");
  if ("response" in auth) return auth.response;

  const rateCheck = limiters.rideRequests.check(auth.user.id);
  if (!rateCheck.allowed) {
    return tooManyRequests(rateCheck.retryAfterSec);
  }

  try {
    const body = await readJsonObject(req);
    const requestId = typeof body?.requestId === "string" ? body.requestId : "";
    const action = body?.action;

    if (!body || !requestId || !action) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    if (
      action !== "accept" &&
      action !== "reject" &&
      action !== "arrive" &&
      action !== "verify_otp" &&
      action !== "complete"
    ) {
      return NextResponse.json(
        { error: "action must be 'accept', 'reject', 'arrive', 'verify_otp', or 'complete'." },
        { status: 400 }
      );
    }

    const rawLat = Number(body.driverLat);
    const rawLng = Number(body.driverLng);
    const driverPosition =
      isValidLatLng(rawLat, rawLng)
        ? {
            lat: rawLat,
            lng: rawLng,
            name: cleanText(body.driverLocationName, 120) ?? undefined,
          }
        : undefined;

    const result =
      action === "arrive"
        ? markDriverArrived(requestId, auth.user.id)
        : action === "verify_otp"
        ? verifyRideOtp(requestId, auth.user.id, typeof body.otp === "string" ? body.otp : "")
        : action === "complete"
        ? completeRide(requestId, auth.user.id)
        : respondToRequest(requestId, auth.user.id, action, driverPosition);

    if ("error" in result) {
      const isLocked = "locked" in result && Boolean(result.locked);
      const status =
        result.error === "Not authorised."
          ? 403
          : isLocked
          ? 429
          : action === "verify_otp"
          ? 400
          : 409;
      return NextResponse.json(
        { error: result.error, ...(isLocked ? { locked: true } : {}) },
        { status }
      );
    }

    const driverLocation = getDriverLocation(auth.user.id);
    const driverView = toDriverView(result);
    return NextResponse.json({ request: driverView, driverLocation });
  } catch (err) {
    console.error("PATCH /api/rides/requests/respond error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
