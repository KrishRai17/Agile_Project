import { NextRequest, NextResponse } from "next/server";
import { submitUserRating } from "@/lib/accounts";
import { readJsonObject, requireUser, tooManyRequests } from "@/lib/apiAuth";
import { limiters } from "@/lib/limiters";
import { cleanText } from "@/lib/validate";

/**
 * POST /api/rides/rate — Submits a 1–5 star post-ride rating and updates the target user's SQLite rating.
 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  const rateCheck = limiters.rating.check(auth.user.id);
  if (!rateCheck.allowed) {
    return tooManyRequests(rateCheck.retryAfterSec);
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const requestId = cleanText(body.requestId, 80) ?? "";
  const targetUserId = cleanText(body.targetUserId, 80) ?? "";
  const stars = typeof body.stars === "number" ? body.stars : Number(body.stars);
  const tags = Array.isArray(body.tags)
    ? body.tags
        .map((t) => cleanText(t, 40))
        .filter((t): t is string => t !== null)
        .slice(0, 6)
    : [];
  const comment = cleanText(body.comment, 300) ?? undefined;

  if (!requestId || !targetUserId) {
    return NextResponse.json({ error: "requestId and targetUserId are required." }, { status: 400 });
  }

  const result = submitUserRating({
    requestId,
    raterId: auth.user.id,
    targetUserId,
    stars,
    tags,
    comment,
  });

  if ("error" in result) {
    const status = result.error.includes("already rated")
      ? 409
      : result.error.includes("only rate") || result.error.includes("completed rides")
      ? 403
      : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    success: true,
    rating: result.rating,
    targetUser: result.targetUser,
  });
}


