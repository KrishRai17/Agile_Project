import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// The session cookie is httpOnly, so only the server can remove it. The client calls this on sign-out.
export async function POST(req: NextRequest) {
  const isHttps =
    req.nextUrl.protocol === "https:" ||
    req.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
