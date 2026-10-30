import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/accounts";
import { clientIp, readJsonObject, tooManyRequests } from "@/lib/apiAuth";
import { KJU_COORDS, MANYATA_COORDS } from "@/lib/campus";
import { limiters } from "@/lib/limiters";
import { createOffer } from "@/lib/rideStore";
import {
  REMEMBER_ME_SECONDS,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
} from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role === "driver" || body.role === "rider" ? "driver" : "passenger";
    const university = typeof body.university === "string" ? body.university.trim() : undefined;
    const studentRollNumber =
      typeof body.studentRollNumber === "string" ? body.studentRollNumber.trim() : undefined;

    const rawVehicleType = typeof body.vehicleType === "string" ? body.vehicleType.trim() : "";
    const vehicleType: "Bike" | "Scooty" | "Car" =
      rawVehicleType === "Bike" || rawVehicleType === "Scooty" || rawVehicleType === "Car"
        ? rawVehicleType
        : "Bike";
    const vehicleModel =
      typeof body.vehicleModel === "string" && body.vehicleModel.trim()
        ? body.vehicleModel.trim().slice(0, 60)
        : vehicleType === "Bike"
          ? "Bajaj Pulsar 150"
          : vehicleType === "Scooty"
            ? "Honda Activa 6G"
            : "Maruti Swift Dzire";
    const vehicleNumber =
      typeof body.vehicleNumber === "string" && body.vehicleNumber.trim()
        ? body.vehicleNumber.trim().toUpperCase().slice(0, 20)
        : "KA 04 EK 7142";

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, university email, and password are required." },
        { status: 400 }
      );
    }

    const ip = clientIp(req.headers);
    const ipCheck = limiters.loginIp.check(ip);
    if (!ipCheck.allowed) {
      return tooManyRequests(ipCheck.retryAfterSec);
    }

    const result = registerUser({
      name,
      email,
      password,
      role,
      university,
      studentRollNumber,
      ...(role === "driver"
        ? {
          vehicleType,
          vehicleModel,
          vehicleNumber,
        }
        : {}),
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // If the student registered as a Rider (driver), automatically publish their initial campus ride offer
    // so they can immediately accept open student ride requests on /home.
    if (role === "driver") {
      createOffer({
        driverId: result.id,
        driverName: result.name,
        driverUniversity: result.university,
        driverRating: result.rating,
        vehicleModel,
        vehicleNumber,
        vehicleType,
        from: "Kristu Jayanti University",
        fromLat: KJU_COORDS.lat,
        fromLng: KJU_COORDS.lng,
        to: "Manyata Tech Park",
        toLat: MANYATA_COORDS.lat,
        toLng: MANYATA_COORDS.lng,
        departureTime: "Immediate",
        departureDate: "Today",
        seats: vehicleType === "Car" ? 3 : 1,
        farePerSeat: vehicleType === "Car" ? "65" : vehicleType === "Bike" ? "35" : "30",
      });
    }

    const rememberMe = body.rememberMe !== false;
    const token = createSessionToken(
      result.id,
      rememberMe ? REMEMBER_ME_SECONDS : SESSION_TTL_SECONDS
    );

    const isHttps =
      req.nextUrl.protocol === "https:" ||
      req.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";

    const response = NextResponse.json({ success: true, user: result }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && isHttps,
      sameSite: "lax",
      path: "/",
      ...(rememberMe ? { maxAge: REMEMBER_ME_SECONDS } : {}),
    });

    return response;
  } catch (error) {
    console.error("Auth register error:", error);
    return NextResponse.json(
      { error: "Internal server error during registration." },
      { status: 500 }
    );
  }
}
