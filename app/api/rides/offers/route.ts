import { NextRequest, NextResponse } from "next/server";
import { listActiveOffers, createOffer, countActiveOffersForDriver } from "@/lib/rideStore";
import { readJsonObject, requireUser } from "@/lib/apiAuth";
import { isDemoUserId, isDemoEmail, getUserById } from "@/lib/accounts";
import { KJU_COORDS, MANYATA_COORDS } from "@/lib/campus";
import {
  cleanText,
  cleanVehicleNumber,
  parseFare,
  parseSeats,
  parseVehicleType,
  resolveCoords,
} from "@/lib/validate";

const MAX_ACTIVE_OFFERS_PER_DRIVER = 5;

// Any signed-in student can browse active offers.
// Returns real student driver offers (demo accounts and test offers excluded unless ?include_demo=true).
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const { searchParams } = new URL(req.url);
  const includeDemo = searchParams.get("include_demo") === "true";
  let active = listActiveOffers();
  if (!includeDemo) {
    active = active.filter((o) => {
      if (String(o.id).startsWith("offer_seed_")) return false;
      if (isDemoUserId(o.driverId)) return false;
      const driver = getUserById(o.driverId);
      if (driver && isDemoEmail(driver.email)) return false;
      return true;
    });
  }
  return NextResponse.json({ offers: active });
}

// Only verified drivers can post offers. The driver's identity, name, university and rating come from the
// session, never from the request body.
export async function POST(req: NextRequest) {
  const auth = requireUser(req, "driver");
  if ("response" in auth) return auth.response;
  const { user } = auth;

  if (!user.studentIdVerified) {
    return NextResponse.json(
      { error: "Please verify your university student ID before offering rides." },
      { status: 403 }
    );
  }

  try {
    const body = await readJsonObject(req);
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const from = cleanText(body.from, 120);
    const to = cleanText(body.to, 120);
    if (!from || !to) {
      return NextResponse.json({ error: "Starting point and destination are required." }, { status: 400 });
    }

    const vehicleType = body.vehicleType === undefined ? "Car" : parseVehicleType(body.vehicleType);
    if (!vehicleType) {
      return NextResponse.json({ error: "Vehicle type must be Car, Bike or Scooty." }, { status: 400 });
    }

    const seats = parseSeats(body.seats, vehicleType);
    if (seats === null) {
      return NextResponse.json(
        { error: vehicleType === "Car" ? "Seats must be a whole number from 1 to 6." : "Bikes and scooties can offer 1 seat." },
        { status: 400 }
      );
    }

    const farePerSeat = parseFare(body.farePerSeat);
    if (farePerSeat === null) {
      return NextResponse.json({ error: "Fare per seat must be a number from 0 to 2000." }, { status: 400 });
    }

    const fromCoords = resolveCoords(body.fromLat, body.fromLng, KJU_COORDS);
    const toCoords = resolveCoords(body.toLat, body.toLng, MANYATA_COORDS);
    if (!fromCoords || !toCoords) {
      return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
    }

    const vehicleModel = cleanText(body.vehicleModel, 60);
    const vehicleNumber = cleanVehicleNumber(body.vehicleNumber);
    if (!vehicleModel || !vehicleNumber) {
      return NextResponse.json(
        { error: "Valid vehicle model and registration plate number are required." },
        { status: 400 }
      );
    }

    if (countActiveOffersForDriver(user.id) >= MAX_ACTIVE_OFFERS_PER_DRIVER) {
      return NextResponse.json(
        { error: `You already have ${MAX_ACTIVE_OFFERS_PER_DRIVER} active rides. Wait for some to fill up first.` },
        { status: 409 }
      );
    }

    const offer = createOffer({
      driverId: user.id,
      driverName: user.name,
      driverUniversity: user.university,
      driverRating: user.rating,
      vehicleModel,
      vehicleNumber,
      vehicleType,
      from,
      fromLat: fromCoords.lat,
      fromLng: fromCoords.lng,
      to,
      toLat: toCoords.lat,
      toLng: toCoords.lng,
      departureTime: cleanText(body.departureTime, 20) ?? "Now",
      departureDate: cleanText(body.departureDate, 20) ?? "Today",
      seats,
      farePerSeat,
    });

    return NextResponse.json({ offer }, { status: 201 });
  } catch (err) {
    console.error("POST /api/rides/offers error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
