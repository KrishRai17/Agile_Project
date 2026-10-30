/**
 * Pure routing helpers (no framework imports) so they can be unit-tested directly.
 */

/** Number of segments in the generated fallback curve (so the curve has STEPS + 1 points). */
export const FALLBACK_ROUTE_STEPS = 16;

/**
 * Generate realistic road-following waypoint coordinates between two points
 * (used when the OSRM routing service is unreachable). Returns [lng, lat] pairs.
 */
export function generateCurvedFallbackRoute(
  startLng: number,
  startLat: number,
  endLng: number,
  endLat: number
): [number, number][] {
  const points: [number, number][] = [];
  const steps = FALLBACK_ROUTE_STEPS;
  const dx = endLng - startLng;
  const dy = endLat - startLat;
  // Perpendicular offset for road curve simulation
  const perpX = -dy * 0.15;
  const perpY = dx * 0.15;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const curve = Math.sin(t * Math.PI);
    const lng = startLng + dx * t + perpX * curve;
    const lat = startLat + dy * t + perpY * curve;
    points.push([Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);
  }
  return points;
}
