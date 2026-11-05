import { NextRequest, NextResponse } from "next/server";
import { adjustWalletBalance } from "@/lib/accounts";
import { readJsonObject, requireUser, tooManyRequests } from "@/lib/apiAuth";
import { limiters } from "@/lib/limiters";
import { hasValidCashierSecret } from "@/lib/cashierAuth";

/**
 * POST /api/wallet — HopOn Wallet top-up endpoint.
 *
 * Standalone `{ action: "pay" }` has been removed because ride fares are transferred atomically
 * inside `completeRide` when the driver completes a trip at dropoff.
 *
 * Supported actions:
 * - `cash_topup`: Cash top-up authorized exclusively with campus cashier secret (`HOPON_CASHIER_SECRET`).
 * - `topup`: Demo self-top-up (only when `HOPON_ALLOW_DEMO_TOPUP=true` and `NODE_ENV !== "production"`,
 *   or when authorized with `HOPON_CASHIER_SECRET`).
 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  const rateCheck = limiters.wallet.check(auth.user.id);
  if (!rateCheck.allowed) {
    return tooManyRequests(rateCheck.retryAfterSec);
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const action =
    body.action === "topup" ? "topup" : body.action === "cash_topup" ? "cash_topup" : "";
  if (!action) {
    return NextResponse.json(
      {
        error:
          "action must be 'topup' or 'cash_topup'. Ride fares are settled automatically on ride completion.",
      },
      { status: 400 }
    );
  }

  const amount = typeof body.amount === "number" ? Math.round(body.amount) : Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) {
    return NextResponse.json(
      { error: "Amount must be between ₹1 and ₹5,000." },
      { status: 400 }
    );
  }

  const isCashierAuthorized = hasValidCashierSecret(req, body.cashierSecret);

  if (action === "cash_topup") {
    if (!isCashierAuthorized) {
      return NextResponse.json(
        { error: "Cash top-ups must be confirmed with the campus cashier secret." },
        { status: 403 }
      );
    }

    const targetUserId =
      typeof body.passengerId === "string" && body.passengerId.trim()
        ? body.passengerId.trim()
        : typeof body.userId === "string" && body.userId.trim()
        ? body.userId.trim()
        : auth.user.id;

    const updated = adjustWalletBalance(targetUserId, amount, "cashier_topup", { actorId: "cashier" });
    if ("error" in updated) {
      return NextResponse.json({ error: updated.error }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      walletBalance: updated.walletBalance,
      user: updated,
    });
  }

  // action === "topup"
  const demoTopupAllowed =
    process.env.HOPON_ALLOW_DEMO_TOPUP === "true" && process.env.NODE_ENV !== "production";
  if (!demoTopupAllowed && !isCashierAuthorized) {
    return NextResponse.json(
      { error: "Wallet top-ups require campus cashier verification (demo top-up is disabled)." },
      { status: 403 }
    );
  }

  const targetUserId =
    isCashierAuthorized && typeof body.userId === "string" && body.userId.trim()
      ? body.userId.trim()
      : auth.user.id;

  const updated = adjustWalletBalance(
    targetUserId,
    amount,
    isCashierAuthorized ? "cashier_topup" : "demo_topup",
    { actorId: isCashierAuthorized ? "cashier" : auth.user.id }
  );
  if ("error" in updated) {
    return NextResponse.json({ error: updated.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    walletBalance: updated.walletBalance,
    user: updated,
  });
}
