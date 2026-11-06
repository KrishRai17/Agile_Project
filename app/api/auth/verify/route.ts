import { NextRequest, NextResponse } from "next/server";
import {
  createEmailVerificationToken,
  getDriverVehicleInfo,
  verifyEmailToken,
} from "@/lib/accounts";
import { sendVerificationEmail } from "@/lib/mailer";
import { clientIp, readJsonObject, requireUser, tooManyRequests } from "@/lib/apiAuth";
import { KJU_COORDS, MANYATA_COORDS } from "@/lib/campus";
import { limiters } from "@/lib/limiters";
import { countActiveOffersForDriver, createOffer, emitRideEvent } from "@/lib/rideStore";

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers);
    if (ip !== "unknown") {
      const check = limiters.loginIp.check(ip);
      if (!check.allowed) {
        return tooManyRequests(check.retryAfterSec);
      }
    }

    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    if (body.action === "resend") {
      const auth = requireUser(req);
      if ("response" in auth) return auth.response;
      if (auth.user.studentIdVerified) {
        return NextResponse.json({
          success: true,
          alreadyVerified: true,
          user: auth.user,
        });
      }

      // Enforce verifyResend rate limit per user ID and per email (max 3/hr)
      const userCheck = limiters.verifyResend.check(`user:${auth.user.id}`);
      if (!userCheck.allowed) {
        return tooManyRequests(userCheck.retryAfterSec);
      }
      const emailCheck = limiters.verifyResend.check(`email:${auth.user.email.toLowerCase()}`);
      if (!emailCheck.allowed) {
        return tooManyRequests(emailCheck.retryAfterSec);
      }

      const issued = createEmailVerificationToken(auth.user.id);
      if ("error" in issued) {
        return NextResponse.json({ error: issued.error }, { status: 400 });
      }
      const sendRes = await sendVerificationEmail(auth.user.email, issued.token, auth.user.name);
      if (!sendRes.success) {
        return NextResponse.json(
          { error: "Unable to send verification email. Please try again later." },
          { status: 503 }
        );
      }
      return NextResponse.json({
        success: true,
        expiresAt: issued.expiresAt,
        ...(process.env.NODE_ENV !== "production" ? { verificationToken: issued.token } : {}),
      });
    }

    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      return NextResponse.json(
        { error: "Verification token is required." },
        { status: 400 }
      );
    }

    const result = verifyEmailToken(token);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // If the verified student registered as a driver or both, publish their initial campus offer once verified
    if (
      (result.user.role === "driver" || result.user.role === "both") &&
      countActiveOffersForDriver(result.user.id) === 0
    ) {
      const vehicleInfo = getDriverVehicleInfo(result.user.id);
      if (vehicleInfo) {
        createOffer({
          driverId: result.user.id,
          driverName: result.user.name,
          driverUniversity: result.user.university,
          driverRating: result.user.rating,
          vehicleModel: vehicleInfo.vehicleModel,
          vehicleNumber: vehicleInfo.vehicleNumber,
          vehicleType: vehicleInfo.vehicleType,
          from: "Kristu Jayanti University",
          fromLat: KJU_COORDS.lat,
          fromLng: KJU_COORDS.lng,
          to: "Manyata Tech Park",
          toLat: MANYATA_COORDS.lat,
          toLng: MANYATA_COORDS.lng,
          departureTime: "Immediate",
          departureDate: "Today",
          seats: vehicleInfo.vehicleType === "Car" ? 3 : 1,
          farePerSeat:
            vehicleInfo.vehicleType === "Car"
              ? "65"
              : vehicleInfo.vehicleType === "Bike"
                ? "35"
                : "30",
        });
        emitRideEvent("offers:changed", { userId: result.user.id });
      }
    }

    return NextResponse.json({ success: true, user: result.user });
  } catch (error) {
    console.error("Auth verify error:", error);
    return NextResponse.json(
      { error: "Internal server error during email verification." },
      { status: 500 }
    );
  }
}

