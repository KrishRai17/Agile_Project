/**
 * Kristu Jayanti University (KJU) campus constants and helpers. Pure functions, no framework imports.
 * Single source of truth for coordinates that used to be hardcoded in several routes and components.
 */

export const KJU_COORDS = { lat: 13.0583, lng: 77.6426 };
export const MANYATA_COORDS = { lat: 13.0458, lng: 77.6206 };

/** Anything within this many metres of KJU's centre counts as "on campus". */
export const KJU_CAMPUS_RADIUS_M = 350;

export interface CampusSpot {
  name: string;
  lat: number;
  lng: number;
  /** Match radius in metres. */
  maxM: number;
}

export const KJU_SPOTS: CampusSpot[] = [
  { name: "KJU Main Gate 1", lat: 13.0583, lng: 77.6426, maxM: 55 },
  { name: "KJU Gate 2 (Sports Arena)", lat: 13.0628, lng: 77.6433, maxM: 80 },
  { name: "KJU Gate 3 (Back & Hostel Gate)", lat: 13.05964, lng: 77.64415, maxM: 65 },
  { name: "KJU PG & MBA Block", lat: 13.059, lng: 77.6428, maxM: 55 },
  { name: "KJU Admin Quadrangle", lat: 13.0579, lng: 77.6424, maxM: 55 },
  { name: "KJU Chavara Square & Cafeteria", lat: 13.05815, lng: 77.64305, maxM: 50 },
  { name: "KJU Law & Humanities Block", lat: 13.05865, lng: 77.64195, maxM: 55 },
  { name: "KJU Campus Bus Bay", lat: 13.0572, lng: 77.6418, maxM: 70 },
];

/** Flat-earth distance in metres; accurate enough at campus scale. */
export function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * 110540;
  const dLng = (lng2 - lng1) * 111320 * Math.cos((lat2 * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** Haversine distance in kilometres across geographic coordinates. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Find the closest campus spot within its radius (or a custom max radius). */
export function findNearestCampusSpot(
  lat: number,
  lng: number,
  customMaxMeters?: number
): { spot: CampusSpot; distanceMeters: number } | null {
  let best: { spot: CampusSpot; distanceMeters: number } | null = null;
  for (const spot of KJU_SPOTS) {
    const dist = metersBetween(lat, lng, spot.lat, spot.lng);
    const limit = customMaxMeters ?? spot.maxM;
    if (dist <= limit && (!best || dist < best.distanceMeters)) {
      best = { spot, distanceMeters: Math.round(dist) };
    }
  }
  return best;
}

/** Name of the campus gate/facility the point is at, or null. */
export function matchCampusSpot(lat: number, lng: number): string | null {
  const nearest = findNearestCampusSpot(lat, lng);
  return nearest ? nearest.spot.name : null;
}

export function isOnCampus(lat: number, lng: number): boolean {
  return metersBetween(lat, lng, KJU_COORDS.lat, KJU_COORDS.lng) <= KJU_CAMPUS_RADIUS_M;
}
