import { NextRequest, NextResponse } from "next/server";
import { submitUserRating } from "@/lib/accounts";
import { readJsonObject, requireUser } from "@/lib/apiAuth";

/**
 * POST /api/rides/rate — Submits a 1–5 star post-ride rating and updates the target user's SQLite rating.
 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
  const stars = typeof body.stars === "number" ? body.stars : Number(body.stars);
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === "string")
    : [];
  const comment = typeof body.comment === "string" ? body.comment : undefined;

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
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    rating: result.rating,
    targetUser: result.targetUser,
  });
}

