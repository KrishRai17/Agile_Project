import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";

// Returns the signed-in user from the signed session cookie (the source of truth for the UI).
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ user: auth.user }, { headers: { "Cache-Control": "no-store" } });
}
