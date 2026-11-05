import { NextRequest, NextResponse } from "next/server";
import { requireUser, tooManyRequests } from "@/lib/apiAuth";
import { isOnCampus, matchCampusSpot } from "@/lib/campus";
import { limiters } from "@/lib/limiters";
import { createTtlCache } from "@/lib/ttlCache";
import { isValidLatLng } from "@/lib/validate";

interface ReverseGeoResponse {
  displayName: string;
  shortName: string;
  snappedLat?: number;
  snappedLng?: number;
  streetName?: string;
  snapDistanceMeters?: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const reverseCache = createTtlCache<ReverseGeoResponse>(1000);

async function fetchNearestRoadSnap(
  lat: number,
  lng: number
): Promise<{ snappedLat: number; snappedLng: number; streetName?: string; snapDistanceMeters: number } | null> {
  const endpoints = [
    `https://routing.openstreetmap.de/routed-car/nearest/v1/driving/${lng},${lat}?number=1`,
    `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}?number=1`,
  ];
  for (const url of endpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2200);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "HopOn-Campus-Rides/1.0 (student@hopon.demo; Kristu Jayanti University Pilot)",
        },
      });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const data = await res.json();
      const wp = data?.waypoints?.[0];
      if (wp && Array.isArray(wp.location) && wp.location.length === 2) {
        const snappedLng = Number(wp.location[0]);
        const snappedLat = Number(wp.location[1]);
        const snapDistanceMeters = typeof wp.distance === "number" ? Math.round(wp.distance) : 0;
        const streetName = typeof wp.name === "string" && wp.name.trim() ? wp.name.trim() : undefined;
        if (Number.isFinite(snappedLat) && Number.isFinite(snappedLng)) {
          return { snappedLat, snappedLng, streetName, snapDistanceMeters };
        }
      }
    } catch {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function fetchPhotonReverse(
  lat: number,
  lng: number
): Promise<{ shortName: string; displayName: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "HopOn-Campus-Rides/1.0 (student@hopon.demo; Kristu Jayanti University Pilot)",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const props = data?.features?.[0]?.properties;
    if (!props) return null;

    const poi = props.name || "";
    const houseNo = props.housenumber ? `#${props.housenumber}` : "";
    const street = [houseNo, props.street].filter(Boolean).join(" ");
    const district = props.district || props.locality || props.suburb || "";
    const city = props.city || "Bengaluru";

    const primary = [poi, street].filter(Boolean).join(", ") || district;
    const shortName = [primary, district && !primary.includes(district) ? district : ""]
      .filter(Boolean)
      .join(", ");
    if (!shortName) return null;

    const displayName = [poi, street, district, city, props.postcode, "Karnataka, India"]
      .filter(Boolean)
      .join(", ");
    return { shortName, displayName };
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

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

  const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const cached = reverseCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const snapPromise = fetchNearestRoadSnap(lat, lng);

  // Pinpoint naming for Kristu Jayanti University campus gates and facilities
  const matchedSpot = matchCampusSpot(lat, lng);
  if (matchedSpot) {
    const snap = await snapPromise;
    const campusResult: ReverseGeoResponse = {
      shortName: matchedSpot,
      displayName: `${matchedSpot}, Kristu Jayanti University, K. Narayanapura, Bengaluru, Karnataka 560077`,
      ...(snap && snap.snapDistanceMeters <= 45 ? snap : {}),
    };
    reverseCache.set(cacheKey, campusResult, CACHE_TTL_MS);
    return NextResponse.json(campusResult);
  }

  // Nominatim's usage policy allows roughly one request per second, so cap upstream calls globally.
  const upstream = limiters.nominatim.check("nominatim");
  if (upstream.allowed) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&zoom=18&format=json&addressdetails=1&extratags=1&namedetails=1`;
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
        const snap = await snapPromise;

        // Priority for shortName: Building / Amenity / POI > House Number + Road > Suburb
        const buildingOrPoi =
          data.name ||
          addr.building ||
          addr.amenity ||
          addr.shop ||
          addr.office ||
          addr.tourism ||
          addr.leisure ||
          (data.display_name ? data.display_name.split(",")[0].trim() : "");
        const houseNo = addr.house_number ? `#${addr.house_number}` : "";
        const road =
          addr.road ||
          addr.pedestrian ||
          addr.footway ||
          addr.path ||
          snap?.streetName ||
          "";
        const streetPart = [houseNo, road].filter(Boolean).join(" ");
        const area =
          addr.neighbourhood ||
          addr.suburb ||
          addr.quarter ||
          addr.residential ||
          addr.village ||
          "";

        let shortName = buildingOrPoi;
        if (!shortName || shortName === road) {
          shortName = [streetPart, area].filter(Boolean).join(", ");
        } else {
          const extras: string[] = [];
          if (streetPart && !shortName.toLowerCase().includes(road.toLowerCase())) {
            extras.push(streetPart);
          }
          if (area && !shortName.toLowerCase().includes(area.toLowerCase())) {
            extras.push(area);
          }
          if (extras.length > 0) {
            shortName = `${shortName} (${extras.slice(0, 2).join(", ")})`;
          }
        }

        if (isOnCampus(lat, lng) && !shortName.toLowerCase().includes("kristu")) {
          shortName = `Kristu Jayanti Campus · ${shortName || "K. Narayanapura"}`;
        }

        if (!shortName) {
          shortName = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }

        const displayName = data.display_name || `${shortName}, Bengaluru`;

        const result: ReverseGeoResponse = {
          displayName,
          shortName,
          ...(snap && snap.snapDistanceMeters <= 45 ? snap : {}),
        };

        reverseCache.set(cacheKey, result, CACHE_TTL_MS);
        return NextResponse.json(result);
      }
    } catch (error) {
      console.warn("Nominatim reverse geocode failed, trying Photon backup:", error);
    }
  }

  // Try Photon high-precision reverse geocoding backup + OSRM road snap
  const [photon, snap] = await Promise.all([fetchPhotonReverse(lat, lng), snapPromise]);
  if (photon) {
    const result: ReverseGeoResponse = {
      shortName: photon.shortName,
      displayName: photon.displayName,
      ...(snap && snap.snapDistanceMeters <= 45 ? snap : {}),
    };
    reverseCache.set(cacheKey, result, CACHE_TTL_MS);
    return NextResponse.json(result);
  }

  const fallbackShort = snap?.streetName
    ? `${snap.streetName} (${lat.toFixed(5)}, ${lng.toFixed(5)})`
    : `Pinpoint (${lat.toFixed(5)}, ${lng.toFixed(5)})`;

  const fallback: ReverseGeoResponse = {
    displayName: `Exact Pickup Spot (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
    shortName: fallbackShort,
    ...(snap && snap.snapDistanceMeters <= 45 ? snap : {}),
  };

  return NextResponse.json(fallback);
}
