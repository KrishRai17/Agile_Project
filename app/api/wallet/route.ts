import { NextRequest, NextResponse } from "next/server";
import { adjustWalletBalance } from "@/lib/accounts";
import { readJsonObject, requireUser } from "@/lib/apiAuth";

/**
 * POST /api/wallet — Top up or pay ride fare using HopOn Wallet balance in SQLite.
 * Body: { action: "topup" | "pay", amount: number }
 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const action = body.action === "pay" ? "pay" : "topup";
  const amount = typeof body.amount === "number" ? Math.round(body.amount) : Number(body.amount);

  if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) {
    return NextResponse.json(
      { error: "Amount must be between ₹1 and ₹5,000." },
      { status: 400 }
    );
  }

  const delta = action === "pay" ? -amount : amount;
  const updated = adjustWalletBalance(auth.user.id, delta);

  if ("error" in updated) {
    return NextResponse.json({ error: updated.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    walletBalance: updated.walletBalance,
    user: updated,
  });
}

