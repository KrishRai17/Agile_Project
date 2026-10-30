import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/accounts";
import { clientIp, readJsonObject, tooManyRequests } from "@/lib/apiAuth";
import { limiters } from "@/lib/limiters";
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

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }
    if (email.length > 254 || password.length > 200) {
      return NextResponse.json({ error: "Invalid university email or password." }, { status: 401 });
    }

    // Throttle guessing: per IP + email, and loosely per IP.
    const ip = clientIp(req.headers);
    const accountKey = `${ip}|${email}`;
    const ipCheck = limiters.loginIp.check(ip);
    const accountCheck = limiters.loginAccount.check(accountKey);
    if (!ipCheck.allowed || !accountCheck.allowed) {
      return tooManyRequests(Math.max(ipCheck.retryAfterSec, accountCheck.retryAfterSec));
    }

    const user = authenticate(email, password);
    if (!user) {
      return NextResponse.json({ error: "Invalid university email or password." }, { status: 401 });
    }

    limiters.loginAccount.reset(accountKey);

    const rememberMe = body.rememberMe === true;
    const token = createSessionToken(user.id, rememberMe ? REMEMBER_ME_SECONDS : SESSION_TTL_SECONDS);

    const isHttps =
      req.nextUrl.protocol === "https:" ||
      req.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";

    const response = NextResponse.json({ success: true, user });
    // "Remember me" -> persistent cookie; otherwise a session cookie that ends with the browser session.
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && isHttps,
      sameSite: "lax",
      path: "/",
      ...(rememberMe ? { maxAge: REMEMBER_ME_SECONDS } : {}),
    });
    return response;
  } catch (error) {
    console.error("Auth login error:", error);
    return NextResponse.json(
      { error: "Internal server error during authentication." },
      { status: 500 }
    );
  }
}
