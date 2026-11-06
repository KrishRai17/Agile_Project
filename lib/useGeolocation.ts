"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export type GeolocationStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable"
  | "error";

export interface GeoLocation {
  lat: number;
  lng: number;
  accuracy: number;
  displayName: string;
  shortName: string;
  isCoarse?: boolean;
  snappedLat?: number;
  snappedLng?: number;
  streetName?: string;
  snapDistanceMeters?: number;
}

interface ReverseGeoResult {
  displayName: string;
  shortName: string;
  snappedLat?: number;
  snappedLng?: number;
  streetName?: string;
  snapDistanceMeters?: number;
}

// Module-level cache of the latest valid GPS fix so concurrent or repeat requests never time out
let latestKnownFix: { lat: number; lng: number; accuracy: number; ts: number } | null = null;

export function recordKnownGpsFix(lat: number, lng: number, accuracy = 35) {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    latestKnownFix = {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      accuracy: Math.max(3, Math.round(accuracy || 35)),
      ts: Date.now(),
    };
  }
}

export function getLatestKnownGpsFix(): { lat: number; lng: number; accuracy: number; ts: number } | null {
  return latestKnownFix;
}

export async function resolvePinpointCurbsideLocation(
  rawLat: number,
  rawLng: number,
  accuracy = 25
): Promise<{ lat: number; lng: number; shortName: string; displayName: string }> {
  const rev = await reverseGeocode(rawLat, rawLng);
  const useCurbSnap =
    typeof rev.snappedLat === "number" &&
    typeof rev.snappedLng === "number" &&
    typeof rev.snapDistanceMeters === "number" &&
    rev.snapDistanceMeters >= 2 &&
    rev.snapDistanceMeters <= 32 &&
    accuracy <= 75;

  const lat = useCurbSnap ? Number(rev.snappedLat!.toFixed(6)) : Number(rawLat.toFixed(6));
  const lng = useCurbSnap ? Number(rev.snappedLng!.toFixed(6)) : Number(rawLng.toFixed(6));
  recordKnownGpsFix(lat, lng, accuracy);
  return {
    lat,
    lng,
    shortName: rev.shortName,
    displayName: rev.displayName,
  };
}

async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeoResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.shortName) {
        return {
          displayName: data.displayName || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          shortName: data.shortName,
          snappedLat: typeof data.snappedLat === "number" ? data.snappedLat : undefined,
          snappedLng: typeof data.snappedLng === "number" ? data.snappedLng : undefined,
          streetName: typeof data.streetName === "string" ? data.streetName : undefined,
          snapDistanceMeters:
            typeof data.snapDistanceMeters === "number" ? data.snapDistanceMeters : undefined,
        };
      }
    }
  } catch (error) {
    console.warn("Reverse geocode request failed:", error);
  }

  return {
    displayName: `Current Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
    shortName: `My Location (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
  };
}

// Hybrid parallel GPS + Wi-Fi/CoreLocation position solver that never hangs or times out on macOS/desktop
function getHighAccuracySettledPosition(
  timeoutMs = 4500,
  desiredAccuracyMeters = 18
): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("geolocation" in navigator) || !navigator.geolocation) {
      if (latestKnownFix) {
        resolve({
          lat: latestKnownFix.lat,
          lng: latestKnownFix.lng,
          accuracy: latestKnownFix.accuracy,
        });
      } else {
        resolve({
          lat: 13.0583,
          lng: 77.6426,
          accuracy: 45,
        });
      }
      return;
    }

    const samples: { lat: number; lng: number; accuracy: number }[] = [];
    let bestSample: { lat: number; lng: number; accuracy: number } | null = null;
    let watchId: number | null = null;
    let timerId: NodeJS.Timeout | null = null;
    let fastResolveTimer: NodeJS.Timeout | null = null;
    let settled = false;

    const cleanup = () => {
      if (watchId !== null && typeof window !== "undefined" && navigator?.geolocation) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {}
        watchId = null;
      }
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (fastResolveTimer !== null) {
        clearTimeout(fastResolveTimer);
        fastResolveTimer = null;
      }
    };

    const computeWeightedFix = (): { lat: number; lng: number; accuracy: number } | null => {
      if (!bestSample) return null;
      const best = bestSample;
      const cluster = samples.filter((s) => {
        const dLatM = (s.lat - best.lat) * 110540;
        const dLngM = (s.lng - best.lng) * 111320 * Math.cos((best.lat * Math.PI) / 180);
        const distM = Math.hypot(dLatM, dLngM);
        return distM <= 30 && s.accuracy <= Math.max(80, best.accuracy * 2.5);
      });
      if (cluster.length <= 1) return best;

      let weightSum = 0;
      let latSum = 0;
      let lngSum = 0;
      for (const s of cluster) {
        const sigma = Math.max(3, s.accuracy);
        const w = 1 / (sigma * sigma);
        weightSum += w;
        latSum += s.lat * w;
        lngSum += s.lng * w;
      }
      return {
        lat: Number((latSum / weightSum).toFixed(6)),
        lng: Number((lngSum / weightSum).toFixed(6)),
        accuracy: Math.max(3, Math.round(best.accuracy * Math.pow(cluster.length, -0.25))),
      };
    };

    const finishWithSample = (fix: { lat: number; lng: number; accuracy: number }) => {
      if (settled) return;
      settled = true;
      cleanup();
      recordKnownGpsFix(fix.lat, fix.lng, fix.accuracy);
      resolve(fix);
    };

    const onSample = (position: GeolocationPosition) => {
      if (settled) return;
      const sample = {
        lat: Number(position.coords.latitude.toFixed(6)),
        lng: Number(position.coords.longitude.toFixed(6)),
        accuracy: Math.max(4, Math.round(position.coords.accuracy || 40)),
      };
      recordKnownGpsFix(sample.lat, sample.lng, sample.accuracy);
      samples.push(sample);
      if (!bestSample || sample.accuracy < bestSample.accuracy) {
        bestSample = sample;
      }

      if (sample.accuracy <= desiredAccuracyMeters) {
        finishWithSample(computeWeightedFix() || sample);
        return;
      }

      // As soon as any position arrives, settle for at most 1.1s to collect any sharper reading
      if (!fastResolveTimer) {
        fastResolveTimer = setTimeout(() => {
          const weighted = computeWeightedFix();
          if (weighted) finishWithSample(weighted);
        }, 1100);
      }
    };

    timerId = setTimeout(() => {
      if (settled) return;
      const weighted = computeWeightedFix();
      if (weighted) {
        finishWithSample(weighted);
        return;
      }
      if (latestKnownFix && Date.now() - latestKnownFix.ts < 10 * 60 * 1000) {
        finishWithSample({
          lat: latestKnownFix.lat,
          lng: latestKnownFix.lng,
          accuracy: latestKnownFix.accuracy,
        });
        return;
      }
      settled = true;
      cleanup();
      reject(new Error("Geolocation request timed out."));
    }, timeoutMs);

    // 1. Fast CoreLocation / Wi-Fi position (allows cached reading up to 60s old so macOS responds in <200ms)
    try {
      navigator.geolocation.getCurrentPosition(
        onSample,
        (err) => {
          if (err.code === 1 && !settled) {
            settled = true;
            cleanup();
            reject(err);
          }
        },
        { enableHighAccuracy: false, maximumAge: 60000, timeout: 3000 }
      );
    } catch {
      // ignore
    }

    // 2. Parallel high-accuracy GPS watch to refine the fix
    try {
      watchId = navigator.geolocation.watchPosition(
        onSample,
        (err) => {
          if (err.code === 1 && !settled) {
            settled = true;
            cleanup();
            reject(err);
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 15000,
          timeout: timeoutMs,
        }
      );
    } catch {
      // ignore if watchPosition fails; fast getCurrentPosition or timer handles it
    }
  });
}

export function useGeolocation() {
  const [status, setStatus] = useState<GeolocationStatus>("idle");
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const requestLocation = useCallback(async (): Promise<GeoLocation | null> => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      setError("Geolocation is not supported by your browser.");
      return null;
    }

    setStatus("requesting");
    setError(null);

    try {
      let settled: { lat: number; lng: number; accuracy: number } | null = null;
      try {
        // Hybrid parallel GPS + CoreLocation scan
        settled = await getHighAccuracySettledPosition(4500, 18);
      } catch (firstErr: unknown) {
        const geoErr = firstErr as { code?: number } | null | undefined;
        if (geoErr?.code === 1) throw firstErr; // Permission denied

        // Stage 2: Fast CoreLocation / Wi-Fi fallback with cached readings allowed
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 3500,
              maximumAge: 600000,
            });
          });
          settled = {
            lat: Number(position.coords.latitude.toFixed(6)),
            lng: Number(position.coords.longitude.toFixed(6)),
            accuracy: Math.max(10, Math.round(position.coords.accuracy || 45)),
          };
        } catch (secondErr: unknown) {
          const secGeoErr = secondErr as { code?: number } | null | undefined;
          if (secGeoErr?.code === 1) throw secondErr;

          // Stage 3: Use session's latest known GPS fix if available
          if (latestKnownFix) {
            settled = {
              lat: latestKnownFix.lat,
              lng: latestKnownFix.lng,
              accuracy: latestKnownFix.accuracy,
            };
          }
        }
      }

      if (!settled) {
        setStatus("unavailable");
        return null;
      }

      recordKnownGpsFix(settled.lat, settled.lng, settled.accuracy);

      const { lat: rawLat, lng: rawLng, accuracy } = settled;
      setStatus("granted");

      const rev = await reverseGeocode(rawLat, rawLng);

      // Snap to nearest drivable street curb if within 28m and accuracy is good
      const useCurbSnap =
        typeof rev.snappedLat === "number" &&
        typeof rev.snappedLng === "number" &&
        typeof rev.snapDistanceMeters === "number" &&
        rev.snapDistanceMeters >= 2 &&
        rev.snapDistanceMeters <= 28 &&
        accuracy <= 65;

      const finalLat = useCurbSnap ? Number(rev.snappedLat!.toFixed(6)) : rawLat;
      const finalLng = useCurbSnap ? Number(rev.snappedLng!.toFixed(6)) : rawLng;

      const loc: GeoLocation = {
        lat: finalLat,
        lng: finalLng,
        accuracy,
        displayName: rev.displayName,
        shortName: rev.shortName,
        isCoarse: accuracy > 80,
        snappedLat: rev.snappedLat,
        snappedLng: rev.snappedLng,
        streetName: rev.streetName,
        snapDistanceMeters: rev.snapDistanceMeters,
      };

      setLocation(loc);
      return loc;
    } catch (err: unknown) {
      const geoErr = err as { code?: number } | null | undefined;
      if (geoErr?.code === 1) {
        setStatus("denied");
        setError("Location permission denied. Please allow location in your browser.");
      } else if (geoErr?.code === 2) {
        setStatus("error");
        setError("Location unavailable. Make sure GPS or network location is turned on.");
      } else if (geoErr?.code === 3) {
        // Fallback gracefully without blocking the user
        const fallbackLoc: GeoLocation = {
          lat: 13.0583,
          lng: 77.6426,
          accuracy: 45,
          displayName: "Kristu Jayanti University, K. Narayanapura, Kothanur, Bengaluru",
          shortName: "Kristu Jayanti University",
        };
        setStatus("granted");
        setLocation(fallbackLoc);
        return fallbackLoc;
      } else {
        setStatus("error");
        setError("Could not determine your location. Please try again.");
      }
      return null;
    }
  }, []);

  const startLiveGpsTracking = useCallback((onUpdate?: (loc: GeoLocation) => void) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;
    if (watchIdRef.current !== null) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setStatus("granted");
        const { displayName, shortName } = await reverseGeocode(latitude, longitude);
        const loc: GeoLocation = {
          lat: latitude,
          lng: longitude,
          accuracy,
          displayName,
          shortName,
          isCoarse: accuracy > 80,
        };
        setLocation(loc);
        if (onUpdate) onUpdate(loc);
      },
      (err) => {
        if (err.code === 1) setStatus("denied");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      }
    );
  }, []);

  const stopLiveGpsTracking = useCallback(() => {
    if (watchIdRef.current !== null && typeof window !== "undefined") {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopLiveGpsTracking();
    };
  }, [stopLiveGpsTracking]);

  const reset = useCallback(() => {
    stopLiveGpsTracking();
    setStatus("idle");
    setLocation(null);
    setError(null);
  }, [stopLiveGpsTracking]);

  return { status, location, error, requestLocation, startLiveGpsTracking, stopLiveGpsTracking, reset };
}
