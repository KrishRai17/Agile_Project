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
  { name: "KJU Main Gate 1", lat: 13.0583, lng: 77.6426, maxM: 80 },
  { name: "KJU Gate 2 (Sports Arena)", lat: 13.0628, lng: 77.6433, maxM: 90 },
  { name: "KJU PG & MBA Block", lat: 13.059, lng: 77.6428, maxM: 70 },
  { name: "KJU Admin Quadrangle", lat: 13.0579, lng: 77.6424, maxM: 70 },
  { name: "KJU Campus Bus Bay", lat: 13.0572, lng: 77.6418, maxM: 80 },
];

/** Flat-earth distance in metres; accurate enough at campus scale. */
export function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * 110540;
  const dLng = (lng2 - lng1) * 111320 * Math.cos((lat2 * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** Name of the campus gate/facility the point is at, or null. */
export function matchCampusSpot(lat: number, lng: number): string | null {
  for (const spot of KJU_SPOTS) {
    if (metersBetween(lat, lng, spot.lat, spot.lng) <= spot.maxM) return spot.name;
  }
  return null;
}

export function isOnCampus(lat: number, lng: number): boolean {
  return metersBetween(lat, lng, KJU_COORDS.lat, KJU_COORDS.lng) <= KJU_CAMPUS_RADIUS_M;
}
