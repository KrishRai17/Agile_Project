import { NextRequest, NextResponse } from "next/server";
import { readJsonObject, requireUser } from "@/lib/apiAuth";
import { updateUserPaymentSettings } from "@/lib/accounts";

// Returns the signed-in user from the signed session cookie (the source of truth for the UI).
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ user: auth.user }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  try {
    const body = await readJsonObject(req);
    if (
      !body ||
      (body.upiId === undefined && body.upiQrImage === undefined && body.avatarUrl === undefined)
    ) {
      return NextResponse.json(
        { error: "Provide upiId, upiQrImage, or avatarUrl." },
        { status: 400 }
      );
    }
    const result = updateUserPaymentSettings(auth.user.id, {
      ...(body.upiId !== undefined
        ? { upiId: body.upiId === null ? null : String(body.upiId) }
        : {}),
      ...(body.upiQrImage !== undefined
        ? { upiQrImage: body.upiQrImage === null ? null : String(body.upiQrImage) }
        : {}),
      ...(body.avatarUrl !== undefined
        ? { avatarUrl: body.avatarUrl === null ? null : String(body.avatarUrl) }
        : {}),
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, user: result });
  } catch {
    return NextResponse.json({ error: "Could not update payment settings." }, { status: 500 });
  }
}
