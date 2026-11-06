import { NextRequest, NextResponse } from "next/server";
import {
  createEmailVerificationToken,
  getDriverVehicleInfo,
  getUserByEmail,
  getUserSessionVersion,
  verifyEmailToken,
} from "@/lib/accounts";
import { sendVerificationEmail } from "@/lib/mailer";
import { clientIp, readJsonObject, requireUser, tooManyRequests } from "@/lib/apiAuth";
import { KJU_COORDS, MANYATA_COORDS } from "@/lib/campus";
import { limiters } from "@/lib/limiters";
import { countActiveOffersForDriver, createOffer, emitRideEvent } from "@/lib/rideStore";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken } from "@/lib/session";

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
      let targetUser = null;
      if (typeof body.email === "string" && body.email.trim()) {
        targetUser = getUserByEmail(body.email.trim().toLowerCase());
      } else {
        const auth = requireUser(req);
        if (!("response" in auth)) {
          targetUser = auth.user;
        }
      }
      if (!targetUser) {
        return NextResponse.json({ error: "Account not found or session expired." }, { status: 404 });
      }
      if (targetUser.studentIdVerified) {
        return NextResponse.json({
          success: true,
          alreadyVerified: true,
          user: targetUser,
        });
      }

      // Enforce verifyResend rate limit per user ID and per email (max 3/hr)
      const userCheck = limiters.verifyResend.check(`user:${targetUser.id}`);
      if (!userCheck.allowed) {
        return tooManyRequests(userCheck.retryAfterSec);
      }
      const emailCheck = limiters.verifyResend.check(`email:${targetUser.email.toLowerCase()}`);
      if (!emailCheck.allowed) {
        return tooManyRequests(emailCheck.retryAfterSec);
      }

      const issued = createEmailVerificationToken(targetUser.id);
      if ("error" in issued) {
        return NextResponse.json({ error: issued.error }, { status: 400 });
      }
      const sendRes = await sendVerificationEmail(targetUser.email, issued.token, targetUser.name);
      if (!sendRes.success) {
        return NextResponse.json(
          { error: "Unable to send verification email. Please try again later." },
          { status: 503 }
        );
      }
      const isLocalHost = ["localhost", "127.0.0.1"].includes(req.nextUrl.hostname);

      return NextResponse.json({
        success: true,
        expiresAt: issued.expiresAt,
        ...(isLocalHost ? { verificationToken: issued.token } : {}),
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

    const sessionVer = getUserSessionVersion(result.user.id);
    const sessionToken = createSessionToken(
      result.user.id,
      SESSION_TTL_SECONDS,
      undefined,
      Date.now(),
      sessionVer
    );
    const isHttps =
      req.nextUrl.protocol === "https:" ||
      req.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";

    const response = NextResponse.json({ success: true, user: result.user });
    response.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && isHttps,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("Auth verify error:", error);
    return NextResponse.json(
      { error: "Internal server error during email verification." },
      { status: 500 }
    );
  }
}

