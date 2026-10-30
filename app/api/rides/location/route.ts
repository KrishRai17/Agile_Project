import { NextRequest, NextResponse } from "next/server";
import { canViewDriverLocation, getDriverLocation, updateDriverLocation } from "@/lib/rideStore";
import { readJsonObject, requireUser } from "@/lib/apiAuth";
import { isValidLatLng, parseOptionalNumber } from "@/lib/validate";

// GET /api/rides/location?driverId=xxx (or ?userId=xxx)
// Allowed for the user themself, a passenger whose request that driver has accepted,
// or the driver who accepted that passenger's request.
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const targetId = searchParams.get("userId") || searchParams.get("driverId");

  if (!targetId) {
    return NextResponse.json({ error: "Missing driverId or userId parameter." }, { status: 400 });
  }

  if (!canViewDriverLocation(auth.user.id, targetId)) {
    return NextResponse.json(
      { error: "You can only track a rider or passenger in your active accepted ride." },
      { status: 403 }
    );
  }

  const location = getDriverLocation(targetId);
  return NextResponse.json({ location: location ?? null });
}

// POST /api/rides/location
// Body: { lat, lng, heading?, speed? } — recorded for the signed-in user (driver or passenger)
// so both rider and passenger can share real-time GPS movement during an active ride.
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  try {
    const body = await readJsonObject(req);
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const { lat, lng } = body;
    if (!isValidLatLng(lat, lng)) {
      return NextResponse.json({ error: "Missing or invalid coordinates (lat, lng)." }, { status: 400 });
    }

    const heading = parseOptionalNumber(body.heading, 0, 360);
    const speed = parseOptionalNumber(body.speed, 0, 400);
    if (heading === null || speed === null) {
      return NextResponse.json({ error: "Invalid heading or speed." }, { status: 400 });
    }

    const location = updateDriverLocation(auth.user.id, lat as number, lng as number, heading, speed);
    return NextResponse.json({ location });
  } catch (error) {
    console.error("POST /api/rides/location error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
