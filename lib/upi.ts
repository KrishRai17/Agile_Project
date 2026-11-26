import { cleanUpiId } from "@/lib/validate";

export interface BuildUpiUriOptions {
  vpa: string;
  payeeName: string;
  amountRupees: number;
  note?: string;
  requestId?: string;
}

/** Formats integer rupee amount into two decimals (e.g., 75 -> "75.00"). */
export function formatUpiAmount(amountRupees: number): string {
  if (typeof amountRupees !== "number" || !Number.isFinite(amountRupees) || amountRupees <= 0) {
    throw new Error("Invalid UPI amount: must be positive finite number.");
  }
  const intVal = Math.round(amountRupees);
  return `${intVal}.00`;
}

/** Builds default safe note: "HopOn ride <last 6 chars of request id>". */
export function buildUpiNote(requestId?: string): string {
  if (!requestId) return "HopOn ride";
  const trimmed = requestId.trim();
  const last6 = trimmed.length >= 6 ? trimmed.slice(-6) : trimmed;
  return `HopOn ride ${last6}`;
}

/**
 * Builds a valid UPI deep-link URI (upi://pay?...).
 * Pure function, no I/O. Uses encodeURIComponent on every value.
 * Amount is strictly formatted as an integer with two decimals (e.g. 75.00).
 * Payee name is capped at 40 characters.
 * The note must never include the passenger's name or any location.
 */
export function buildUpiUri(options: BuildUpiUriOptions): string {
  const vpa = cleanUpiId(options.vpa);
  if (!vpa) {
    throw new Error(`Invalid UPI VPA: ${options.vpa}`);
  }

  const rawName = (options.payeeName ?? "").trim().slice(0, 40);
  const payeeName = rawName || "HopOn Driver";

  const amountStr = formatUpiAmount(options.amountRupees);

  // Note defaults to "HopOn ride <last 6 chars of request id>"
  const note = options.note ?? buildUpiNote(options.requestId);

  const pa = encodeURIComponent(vpa);
  const pn = encodeURIComponent(payeeName);
  const am = encodeURIComponent(amountStr);
  const cu = encodeURIComponent("INR");
  const tn = encodeURIComponent(note);

  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tn=${tn}`;
}

/**
 * Masks a UPI ID for display on UI (e.g. rahul@okaxis -> ra***@okaxis).
 * Returns "unavailable" if VPA is missing or malformed.
 */
export function maskUpiId(vpa: unknown): string {
  const clean = cleanUpiId(vpa);
  if (!clean) return "unavailable";
  const atIdx = clean.indexOf("@");
  if (atIdx <= 0) return "unavailable";
  const handle = clean.slice(0, atIdx);
  const bank = clean.slice(atIdx + 1);
  const prefix = handle.length <= 2 ? handle : handle.slice(0, 2);
  return `${prefix}***@${bank}`;
}
