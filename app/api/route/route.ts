import { NextRequest, NextResponse } from "next/server";
import { haversineKm } from "@/lib/mapData";
import { generateCurvedFallbackRoute } from "@/lib/routeUtils";
import { requireUser, tooManyRequests } from "@/lib/apiAuth";
import { limiters } from "@/lib/limiters";
import { createTtlCache } from "@/lib/ttlCache";
import { MAX_ROUTE_POINTS, parseLngLat, parseLngLatList } from "@/lib/validate";

export interface RouteLeg {
  distanceKm: number;
  durationMin: number;
}

export interface RouteResponse {
  distanceKm: number;
  durationMin: number;
  coordinates: [number, number][];
  legs?: RouteLeg[];
  isFallback?: boolean;
}

const routeCache = createTtlCache<RouteResponse>(500);

const OSRM_ENDPOINTS = [
  "https://routing.openstreetmap.de/routed-car/route/v1/driving",
  "https://router.project-osrm.org/route/v1/driving",
];

async function fetchOsrmRoute(
  parsedPoints: [number, number][],
  fallbackLegs: RouteLeg[]
): Promise<RouteResponse | null> {
  const osrmCoords = parsedPoints.map((p) => `${p[0]},${p[1]}`).join(";");

  for (const baseUrl of OSRM_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const url = `${baseUrl}/${osrmCoords}?overview=full&geometries=geojson&steps=false`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "HopOn-Campus-Rides/1.0 (student@hopon.demo; KJU Bengaluru)",
        },
      });
      clearTimeout(timeout);

      if (!res.ok) continue;
      const data = await res.json();
      const route = data?.routes?.[0];
      if (route?.geometry?.coordinates && route.distance > 0) {
        const coords = route.geometry.coordinates as [number, number][];
        const legs: RouteLeg[] = (route.legs || []).map(
          (leg: { distance: number; duration: number }) => ({
            distanceKm: Math.round((leg.distance / 1000) * 10) / 10,
            durationMin: Math.max(1, Math.round(leg.duration / 60)),
          })
        );

        return {
          distanceKm: Math.round((route.distance / 1000) * 10) / 10,
          durationMin: Math.max(1, Math.round(route.duration / 60)),
          coordinates: coords,
          legs: legs.length > 0 ? legs : fallbackLegs,
          isFallback: false,
        };
      }
    } catch {
      clearTimeout(timeout);
      // Try next OSRM endpoint
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const pointsParam = searchParams.get("points"); // "lng1,lat1;lng2,lat2;..."
  const startParam = searchParams.get("start");   // "lng,lat"
  const endParam = searchParams.get("end");       // "lng,lat"
  const waypointsParam = searchParams.get("waypoints"); // optional "lng,lat;..."

  let parsedPoints: [number, number][] | null = null;

  if (pointsParam) {
    parsedPoints = parseLngLatList(pointsParam, MAX_ROUTE_POINTS);
  } else if (startParam && endParam) {
    const start = parseLngLat(startParam);
    const end = parseLngLat(endParam);
    const waypoints = waypointsParam ? parseLngLatList(waypointsParam, MAX_ROUTE_POINTS - 2) : [];
    if (start && end && waypoints) {
      parsedPoints = [start, ...waypoints, end];
    }
  }

  if (!parsedPoints || parsedPoints.length < 2) {
    return NextResponse.json(
      {
        error: `Provide 2-${MAX_ROUTE_POINTS} valid "lng,lat" coordinates via 'points', or 'start' and 'end'.`,
      },
      { status: 400 }
    );
  }

  const userLimit = limiters.route.check(`route:${auth.user.id}`);
  if (!userLimit.allowed) return tooManyRequests(userLimit.retryAfterSec);

  const cacheKey = parsedPoints.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join("->");
  const cached = routeCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  // Calculate multi-leg fallback route only if live OSRM road routing servers are unreachable
  const fallbackCoords: [number, number][] = [];
  const fallbackLegs: RouteLeg[] = [];
  let totalEstimatedDistKm = 0;
  let totalEstimatedDurationMin = 0;

  for (let i = 0; i < parsedPoints.length - 1; i++) {
    const p1 = parsedPoints[i];
    const p2 = parsedPoints[i + 1];
    const straightDist = haversineKm(p1[1], p1[0], p2[1], p2[0]);
    const legDist = Math.max(0.6, Math.round(straightDist * 1.35 * 10) / 10);
    const legDur = Math.max(2, Math.round((legDist / 24) * 60));
    totalEstimatedDistKm += legDist;
    totalEstimatedDurationMin += legDur;
    fallbackLegs.push({ distanceKm: legDist, durationMin: legDur });

    const legCurve = generateCurvedFallbackRoute(p1[0], p1[1], p2[0], p2[1]);
    if (i === 0) {
      fallbackCoords.push(...legCurve);
    } else {
      fallbackCoords.push(...legCurve.slice(1));
    }
  }

  const fallbackData: RouteResponse = {
    distanceKm: Math.round(totalEstimatedDistKm * 10) / 10,
    durationMin: totalEstimatedDurationMin,
    coordinates: fallbackCoords,
    legs: fallbackLegs,
    isFallback: true,
  };

  if (limiters.osrm.check("osrm").allowed) {
    const osrmRoute = await fetchOsrmRoute(parsedPoints, fallbackLegs);
    if (osrmRoute) {
      routeCache.set(cacheKey, osrmRoute, 15 * 60 * 1000);
      return NextResponse.json(osrmRoute);
    }
  }

  return NextResponse.json(fallbackData);
}
