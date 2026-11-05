import { NextRequest, NextResponse } from "next/server";
import { readJsonObject, requireUser, tooManyRequests } from "@/lib/apiAuth";
import { limiters } from "@/lib/limiters";
import { listRideMessages, sendRideMessage } from "@/lib/rideStore";

/**
 * GET /api/rides/messages?requestId=xxx — Returns chat messages for an active/accepted ride.
 */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  const requestId = req.nextUrl.searchParams.get("requestId")?.trim();
  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId parameter." }, { status: 400 });
  }

  const messages = listRideMessages(requestId, auth.user.id);
  if ("error" in messages) {
    return NextResponse.json({ error: messages.error }, { status: 403 });
  }

  return NextResponse.json({ messages });
}

/**
 * POST /api/rides/messages — Sends a chat message or quick reply in an active ride.
 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  const rateCheck = limiters.chat.check(auth.user.id);
  if (!rateCheck.allowed) {
    return tooManyRequests(rateCheck.retryAfterSec);
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!requestId || !text) {
    return NextResponse.json({ error: "requestId and text are required." }, { status: 400 });
  }

  const result = sendRideMessage({
    requestId,
    senderId: auth.user.id,
    senderName: auth.user.name,
    senderRole: auth.user.role === "driver" ? "driver" : "passenger",
    text,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ message: result }, { status: 201 });
}

