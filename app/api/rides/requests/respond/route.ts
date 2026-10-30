import { NextRequest, NextResponse } from "next/server";
import { respondToRequest, markDriverArrived, verifyRideOtp, getOffer } from "@/lib/rideStore";
import { readJsonObject, requireUser } from "@/lib/apiAuth";

// PATCH /api/rides/requests/respond
// body: { requestId, action: "accept" | "reject" | "arrive" | "verify_otp", otp?: string }
// Only signed-in drivers can respond, and always as themselves (any driverId in the body is ignored).
export async function PATCH(req: NextRequest) {
  const auth = requireUser(req, "driver");
  if ("response" in auth) return auth.response;

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
      action !== "verify_otp"
    ) {
      return NextResponse.json(
        { error: "action must be 'accept', 'reject', 'arrive', or 'verify_otp'." },
        { status: 400 }
      );
    }

    const result =
      action === "arrive"
        ? markDriverArrived(requestId, auth.user.id)
        : action === "verify_otp"
        ? verifyRideOtp(requestId, auth.user.id, typeof body.otp === "string" ? body.otp : "")
        : respondToRequest(requestId, auth.user.id, action);

    if ("error" in result) {
      const status =
        result.error === "Not authorised."
          ? 403
          : action === "verify_otp"
          ? 400
          : 409;
      return NextResponse.json({ error: result.error }, { status });
    }

    const offer = result.offerId ? getOffer(result.offerId) : undefined;
    // Strip the passenger's secret OTP from driver responses so the driver must get it from the passenger
    const driverView = { ...result, otp: undefined, offer };
    return NextResponse.json({ request: driverView });
  } catch (err) {
    console.error("PATCH /api/rides/requests/respond error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
