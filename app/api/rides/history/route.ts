import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { listTripHistoryForUser } from "@/lib/rideStore";

/**
 * GET /api/rides/history — Returns completed and cancelled rides for the signed-in user
 * from the persistent SQLite `trip_history` table.
 */
export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  const history = listTripHistoryForUser(auth.user.id);
  return NextResponse.json({ history });
}
