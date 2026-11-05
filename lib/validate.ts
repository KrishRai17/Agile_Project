/**
 * Input validation helpers for API routes. Pure functions, no framework imports.
 */

export const MAX_ROUTE_POINTS = 10;
export const MAX_FARE = 2000;

export const VEHICLE_TYPES = ["Bike", "Car", "Scooty"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Parses "lng,lat". Returns null for anything malformed or out of range. */
export function parseLngLat(pair: string): [number, number] | null {
  const parts = pair.split(",");
  if (parts.length !== 2 || parts[0].trim() === "" || parts[1].trim() === "") return null;
  const lng = Number(parts[0]);
  const lat = Number(parts[1]);
  return isValidLatLng(lat, lng) ? [lng, lat] : null;
}

/** Parses "lng,lat;lng,lat;...". Returns null if any pair is invalid or there are too many. */
export function parseLngLatList(raw: string, max: number = MAX_ROUTE_POINTS): [number, number][] | null {
  const pairs = raw.split(";").filter((p) => p.trim() !== "");
  if (pairs.length === 0 || pairs.length > max) return null;
  const out: [number, number][] = [];
  for (const pair of pairs) {
    const parsed = parseLngLat(pair);
    if (!parsed) return null;
    out.push(parsed);
  }
  return out;
}

/** Trims, collapses whitespace, strips control characters and caps the length. Null if empty/not a string. */
export function cleanText(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen).trim() : cleaned;
}

export function parseVehicleType(value: unknown): VehicleType | null {
  return typeof value === "string" && (VEHICLE_TYPES as readonly string[]).includes(value)
    ? (value as VehicleType)
    : null;
}

/** Validates a vehicle registration plate (e.g. "KA 04 EK 7142" or "KA04EK7142"). */
export function cleanVehicleNumber(value: unknown): string | null {
  const cleaned = cleanText(value, 20);
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  return /^[A-Z]{2}[\s-]?\d{1,2}[\s-]?[A-Z]{1,3}[\s-]?\d{3,4}$/.test(upper) ? upper : null;
}

/** Cars can seat up to 6 passengers; bikes and scooties carry one pillion rider. */
export function maxSeatsFor(type: VehicleType): number {
  return type === "Car" ? 6 : 1;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseSeats(value: unknown, type: VehicleType): number | null {
  const n = toNumber(value);
  if (n === null || !Number.isInteger(n)) return null;
  return n >= 1 && n <= maxSeatsFor(type) ? n : null;
}

/** Whole-rupee fare between 0 and MAX_FARE, returned as a string (the store keeps fares as strings). */
export function parseFare(value: unknown): string | null {
  const n = toNumber(value);
  if (n === null || n < 0 || n > MAX_FARE) return null;
  return String(Math.round(n));
}

/**
 * Optional coordinates: both missing -> fallback, both valid -> as given, anything else -> null (reject).
 */
export function resolveCoords(
  lat: unknown,
  lng: unknown,
  fallback: { lat: number; lng: number }
): { lat: number; lng: number } | null {
  if (lat === undefined && lng === undefined) return fallback;
  return isValidLatLng(lat, lng) ? { lat: lat as number, lng: lng as number } : null;
}

/** Optional finite number within [min, max]: undefined stays undefined, invalid -> null. */
export function parseOptionalNumber(value: unknown, min: number, max: number): number | undefined | null {
  if (value === undefined || value === null) return undefined;
  const n = toNumber(value);
  return n !== null && n >= min && n <= max ? n : null;
}
