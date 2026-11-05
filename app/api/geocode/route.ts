import { NextRequest, NextResponse } from "next/server";
import type { LocationItem } from "@/lib/mapData";
import { requireUser, tooManyRequests } from "@/lib/apiAuth";
import { limiters } from "@/lib/limiters";
import { createTtlCache } from "@/lib/ttlCache";

interface NominatimRawItem {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    quarter?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
  };
}

const MAX_QUERY_LENGTH = 120;
const CACHE_TTL_MS = 10 * 60 * 1000;

// Bounded in-memory cache for recent geocoding queries (expired entries are evicted automatically)
const cache = createTtlCache<LocationItem[]>(500);

async function searchPhoton(q: string): Promise<LocationItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3200);
  try {
    const params = new URLSearchParams({
      q: q.toLowerCase().includes("bengaluru") || q.toLowerCase().includes("bangalore") ? q : `${q}, Bengaluru`,
      lat: "13.0583",
      lon: "77.6426",
      limit: "6",
      lang: "en",
    });
    const res = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "HopOn-Campus-Rides/1.0 (student@hopon.demo; Kristu Jayanti University Pilot)",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    return features
      .map((f: { properties?: Record<string, unknown>; geometry?: { coordinates?: number[] } }, idx: number) => {
        const coords = f.geometry?.coordinates;
        const props = f.properties || {};
        if (!Array.isArray(coords) || coords.length < 2) return null;
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const name = String(props.name || props.street || props.district || q).trim();
        const address = [
          props.name,
          props.housenumber ? `#${props.housenumber}` : undefined,
          props.street,
          props.district || props.suburb,
          props.city || "Bengaluru",
          props.postcode,
        ]
          .filter(Boolean)
          .join(", ");
        return {
          id: `pho_${props.osm_id ?? idx}_${lat.toFixed(5)}`,
          name,
          address: address || `${name}, Bengaluru`,
          lat,
          lng,
          category: "landmark" as const,
        };
      })
      .filter((x: LocationItem | null): x is LocationItem => x !== null);
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").replace(/\s+/g, " ").trim();

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }
  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "Search text is too long." }, { status: 400 });
  }

  const userLimit = limiters.geocode.check(`search:${auth.user.id}`);
  if (!userLimit.allowed) return tooManyRequests(userLimit.retryAfterSec, { results: [] });

  const cacheKey = q.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached) {
    return NextResponse.json({ results: cached });
  }

  // Nominatim's usage policy allows roughly one request per second, so cap upstream calls globally.
  const upstream = limiters.nominatim.check("nominatim");
  if (!upstream.allowed) {
    const photonFallback = await searchPhoton(q);
    if (photonFallback.length > 0) {
      cache.set(cacheKey, photonFallback, CACHE_TTL_MS);
    }
    return NextResponse.json({ results: photonFallback });
  }

  try {
    const params = new URLSearchParams({
      q,
      format: "json",
      addressdetails: "1",
      extratags: "1",
      limit: "6",
      countrycodes: "in",
      viewbox: "77.3,12.6,78.0,13.4",
      bounded: "0",
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "HopOn-Campus-Rides/1.0 (student@hopon.demo; Kristu Jayanti University Pilot)",
        "Accept-Language": "en",
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const photonFallback = await searchPhoton(q);
      return NextResponse.json({ results: photonFallback });
    }

    const rawData: NominatimRawItem[] = await res.json();

    const mapped: LocationItem[] = rawData.map((item) => {
      const addr = item.address || {};
      const parts: string[] = [];

      if (addr.road) parts.push(addr.road);
      if (addr.suburb || addr.neighbourhood || addr.quarter) {
        parts.push(addr.suburb || addr.neighbourhood || addr.quarter || "");
      }
      if (addr.city || addr.town || addr.village || addr.municipality) {
        parts.push(addr.city || addr.town || addr.village || addr.municipality || "");
      }

      // Prioritize primary POI / venue name from display_name or address details
      const primaryPoi = item.display_name ? item.display_name.split(",")[0].trim() : "";
      const secondaryArea = parts.slice(0, 2).join(", ");

      const name =
        primaryPoi && secondaryArea && !primaryPoi.toLowerCase().includes(secondaryArea.toLowerCase())
          ? `${primaryPoi}, ${secondaryArea}`
          : primaryPoi || secondaryArea || item.display_name;

      return {
        id: `nom_${item.place_id}`,
        name,
        address: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        category: "landmark",
      };
    });

    if (mapped.length === 0) {
      const photonResults = await searchPhoton(q);
      if (photonResults.length > 0) {
        cache.set(cacheKey, photonResults, CACHE_TTL_MS);
        return NextResponse.json({ results: photonResults });
      }
    }

    cache.set(cacheKey, mapped, CACHE_TTL_MS);

    return NextResponse.json({ results: mapped });
  } catch (error) {
    console.error("Geocoding error:", error);
    const photonFallback = await searchPhoton(q);
    return NextResponse.json({ results: photonFallback });
  }
}
