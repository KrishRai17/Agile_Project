import { NextRequest, NextResponse } from "next/server";
import { requireUser, tooManyRequests } from "@/lib/apiAuth";
import { isOnCampus, matchCampusSpot } from "@/lib/campus";
import { limiters } from "@/lib/limiters";
import { createTtlCache } from "@/lib/ttlCache";
import { isValidLatLng } from "@/lib/validate";

interface ReverseGeoResponse {
  displayName: string;
  shortName: string;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const reverseCache = createTtlCache<ReverseGeoResponse>(1000);

export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const latStr = searchParams.get("lat");
  const lngStr = searchParams.get("lng") || searchParams.get("lon");

  if (!latStr || !lngStr) {
    return NextResponse.json({ error: "Missing lat or lng parameters." }, { status: 400 });
  }

  const lat = Number(latStr);
  const lng = Number(lngStr);

  if (!isValidLatLng(lat, lng)) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
  }

  const userLimit = limiters.geocode.check(`reverse:${auth.user.id}`);
  if (!userLimit.allowed) return tooManyRequests(userLimit.retryAfterSec);

  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = reverseCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  // Nominatim's usage policy allows roughly one request per second, so cap upstream calls globally.
  const upstream = limiters.nominatim.check("nominatim");
  if (upstream.allowed) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "HopOn-Campus-Rides/1.0 (student@hopon.demo; Kristu Jayanti University Pilot)",
          "Accept-Language": "en",
        },
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};

        // Priority for shortName: Named POI > Road > Suburb > City
        const poiName = data.name || (data.display_name ? data.display_name.split(",")[0].trim() : "");
        const road = addr.road || addr.pedestrian || addr.path || "";
        const area = addr.suburb || addr.neighbourhood || addr.quarter || addr.residential || "";

        let shortName = poiName;
        if (!shortName || shortName === road) {
          shortName = [road, area].filter(Boolean).join(", ");
        } else if (area && !shortName.toLowerCase().includes(area.toLowerCase())) {
          shortName = `${shortName}, ${area}`;
        }

        // Pinpoint naming for Kristu Jayanti University campus gates and facilities
        const matchedSpot = matchCampusSpot(lat, lng);

        if (matchedSpot) {
          shortName = matchedSpot;
        } else if (isOnCampus(lat, lng) && !shortName.toLowerCase().includes("kristu")) {
          shortName = `Kristu Jayanti Campus (${shortName || "K. Narayanapura"})`;
        }

        if (!shortName) {
          shortName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }

        const displayName = matchedSpot
          ? `${matchedSpot}, Kristu Jayanti University, K. Narayanapura, Bengaluru, Karnataka 560077, India`
          : (data.display_name || `${shortName}, Bengaluru`);

        const result: ReverseGeoResponse = { displayName, shortName };

        reverseCache.set(cacheKey, result, CACHE_TTL_MS);
        return NextResponse.json(result);
      }
    } catch (error) {
      console.warn("Reverse geocode failed, using coordinates:", error);
    }
  }

  const fallback: ReverseGeoResponse = {
    displayName: `Location near (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    shortName: `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
  };

  return NextResponse.json(fallback);
}
