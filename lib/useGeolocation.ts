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
}

async function reverseGeocode(lat: number, lng: number): Promise<{ displayName: string; shortName: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.shortName) {
        return {
          displayName: data.displayName || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          shortName: data.shortName,
        };
      }
    }
  } catch (error) {
    console.warn("Reverse geocode request failed:", error);
  }

  return {
    displayName: `Current Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    shortName: `My Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
  };
}

// Settles multi-sample GPS / Wi-Fi readings to get the lowest error radius
function getHighAccuracySettledPosition(
  timeoutMs = 7000,
  desiredAccuracyMeters = 35
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let bestPosition: GeolocationPosition | null = null;
    let watchId: number | null = null;
    let timerId: NodeJS.Timeout | null = null;
    let fastResolveTimer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
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

    timerId = setTimeout(() => {
      cleanup();
      if (bestPosition) {
        resolve(bestPosition);
      } else {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          { enableHighAccuracy: true, timeout: 4000, maximumAge: 0 }
        );
      }
    }, timeoutMs);

    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
            bestPosition = position;
          }

          // If pinpoint accuracy reached (e.g. <= 35m), resolve immediately
          if (position.coords.accuracy <= desiredAccuracyMeters) {
            cleanup();
            resolve(position);
            return;
          }

          // If we received any high accuracy fix, settle for up to 1.5s then resolve with best
          if (!fastResolveTimer) {
            fastResolveTimer = setTimeout(() => {
              cleanup();
              if (bestPosition) resolve(bestPosition);
            }, 1800);
          }
        },
        (err) => {
          if (err.code === 1) {
            cleanup();
            reject(err);
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: timeoutMs,
        }
      );
    } catch {
      cleanup();
      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
      );
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
      let position: GeolocationPosition;
      try {
        // High accuracy hardware GPS scan
        position = await getHighAccuracySettledPosition(7000, 35);
      } catch (firstErr: unknown) {
        const geoErr = firstErr as { code?: number } | null | undefined;
        if (geoErr?.code === 1) throw firstErr; // Permission denied

        // Fallback to one-shot hardware GPS
        position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 6000,
            maximumAge: 0,
          });
        });
      }

      const { latitude, longitude, accuracy } = position.coords;
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
        setStatus("error");
        setError("Location request timed out. Please try clicking again.");
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
