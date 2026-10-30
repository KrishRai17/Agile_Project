import { NextRequest, NextResponse } from "next/server";
import { createRequest, cancelRequest, listRequestsForDriver, listRequestsForPassenger, getOffer } from "@/lib/rideStore";
import { readJsonObject, requireUser } from "@/lib/apiAuth";
import { KJU_COORDS, MANYATA_COORDS } from "@/lib/campus";
import { cleanText, resolveCoords } from "@/lib/validate";

// GET /api/rides/requests?driverId=xxx  — driver inbox (must be you, and you must be a driver)
// GET /api/rides/requests?passengerId=xxx — your own requests
// The ids in the query string are kept for compatibility but must match the signed-in user.
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { searchParams } = new URL(req.url);
  const driverId = searchParams.get("driverId");
  const passengerId = searchParams.get("passengerId");

  if (driverId) {
    if (driverId !== user.id || user.role !== "driver") {
      return NextResponse.json({ error: "You can only view your own driver inbox." }, { status: 403 });
    }
    const requests = listRequestsForDriver(user.id).map((r) => ({
      ...r,
      otp: undefined,
      offer: r.offerId ? getOffer(r.offerId) : undefined,
    }));
    return NextResponse.json({ requests });
  }
  if (passengerId) {
    if (passengerId !== user.id) {
      return NextResponse.json({ error: "You can only view your own requests." }, { status: 403 });
    }
    const requests = listRequestsForPassenger(user.id).map((r) => ({
      ...r,
      offer: r.offerId ? getOffer(r.offerId) : undefined,
    }));
    return NextResponse.json({ requests });
  }
  return NextResponse.json({ error: "Provide driverId or passengerId." }, { status: 400 });
}

// PATCH /api/rides/requests  body: { requestId, action: "cancel" } — cancels YOUR request
export async function PATCH(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  try {
    const body = await readJsonObject(req);
    const requestId = typeof body?.requestId === "string" ? body.requestId : "";
    if (!body || !requestId || body.action !== "cancel") {
      return NextResponse.json({ error: "Provide requestId and action 'cancel'." }, { status: 400 });
    }
    const result = cancelRequest(requestId, auth.user.id);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.error === "Not authorised." ? 403 : 409 });
    }
    return NextResponse.json({ request: result });
  } catch (err) {
    console.error("PATCH /api/rides/requests error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

// POST /api/rides/requests — passenger identity, name and rating come from the session
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const body = await readJsonObject(req);
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const pickup = cleanText(body.pickup, 150);
    const dropoff = cleanText(body.dropoff, 150);
    if (!pickup || !dropoff) {
      return NextResponse.json({ error: "Pickup and dropoff are required." }, { status: 400 });
    }

    const pickupCoords = resolveCoords(body.pickupLat, body.pickupLng, KJU_COORDS);
    const dropoffCoords = resolveCoords(body.dropoffLat, body.dropoffLng, MANYATA_COORDS);
    if (!pickupCoords || !dropoffCoords) {
      return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
    }

    // offerId is optional: without it the request is open and any driver can accept it
    const offerId = typeof body.offerId === "string" && body.offerId.length <= 64 ? body.offerId : undefined;

    const result = createRequest({
      offerId,
      passengerId: user.id,
      passengerName: user.name,
      passengerRating: user.rating,
      pickup,
      pickupLat: pickupCoords.lat,
      pickupLng: pickupCoords.lng,
      dropoff,
      dropoffLat: dropoffCoords.lat,
      dropoffLng: dropoffCoords.lng,
      note: cleanText(body.note, 200) ?? undefined,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({ request: result }, { status: 201 });
  } catch (err) {
    console.error("POST /api/rides/requests error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
