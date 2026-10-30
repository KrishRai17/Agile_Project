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
}

const routeCache = createTtlCache<RouteResponse>(500);

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

  const cacheKey = parsedPoints.map((p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join("->");
  const cached = routeCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  // Calculate realistic multi-leg fallback route
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
  };

  // Cap calls to the public OSRM demo server across all users; fall back to the estimate if exhausted.
  if (limiters.osrm.check("osrm").allowed) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      const osrmCoords = parsedPoints.map((p) => `${p[0]},${p[1]}`).join(";");
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${osrmCoords}?overview=full&geometries=geojson`;

      const res = await fetch(osrmUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "HopOn-Campus-Rides/1.0 (student@hopon.demo; KJU Bengaluru)",
        },
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const route = data?.routes?.[0];
        if (route?.geometry?.coordinates && route.distance > 0) {
          const legs: RouteLeg[] = (route.legs || []).map((leg: { distance: number; duration: number }) => ({
            distanceKm: Math.round((leg.distance / 1000) * 10) / 10,
            durationMin: Math.max(1, Math.round(leg.duration / 60)),
          }));

          const routeData: RouteResponse = {
            distanceKm: Math.round((route.distance / 1000) * 10) / 10,
            durationMin: Math.max(2, Math.round(route.duration / 60)),
            coordinates: route.geometry.coordinates as [number, number][],
            legs: legs.length > 0 ? legs : fallbackLegs,
          };
          routeCache.set(cacheKey, routeData, 15 * 60 * 1000);
          return NextResponse.json(routeData);
        }
      }
    } catch (error) {
      console.warn("OSRM routing unavailable, using fallback geometry:", error);
    }
  }

  // Cache and return high-fidelity fallback if OSRM timed out
  routeCache.set(cacheKey, fallbackData, 5 * 60 * 1000);
  return NextResponse.json(fallbackData);
}
