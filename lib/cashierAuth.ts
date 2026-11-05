import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";

export const MIN_CASHIER_SECRET_LENGTH = 16;

export function isCashierSecretConfigured(): boolean {
  const configured = process.env.HOPON_CASHIER_SECRET?.trim() ?? "";
  return configured.length >= MIN_CASHIER_SECRET_LENGTH;
}

export function hasValidCashierSecret(req: NextRequest, bodySecret?: unknown): boolean {
  const configured = process.env.HOPON_CASHIER_SECRET?.trim() ?? "";
  if (configured.length < MIN_CASHIER_SECRET_LENGTH) return false;
  const candidate =
    req.headers.get("x-cashier-secret")?.trim() ||
    (typeof bodySecret === "string" ? bodySecret.trim() : "");
  if (!candidate) return false;
  const a = createHash("sha256").update(configured).digest();
  const b = createHash("sha256").update(candidate).digest();
  return timingSafeEqual(a, b);
}

