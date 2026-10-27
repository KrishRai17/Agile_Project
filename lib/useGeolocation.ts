"use client";

import { useState, useCallback } from "react";

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
}

async function reverseGeocode(lat: number, lng: number): Promise<{ displayName: string; shortName: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      {
        headers: {
          "Accept-Language": "en",
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error("Nominatim request failed");

    const data = await res.json();

    // Build a short human-readable name
    const addr = data.address || {};
    const parts: string[] = [];

    if (addr.road || addr.pedestrian || addr.path) {
      parts.push(addr.road || addr.pedestrian || addr.path);
    }
    if (addr.suburb || addr.neighbourhood || addr.quarter) {
      parts.push(addr.suburb || addr.neighbourhood || addr.quarter);
    }
    if (addr.city || addr.town || addr.village || addr.municipality) {
      parts.push(addr.city || addr.town || addr.village || addr.municipality);
    }

    const displayName = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const shortName = parts.length > 0 ? parts.slice(0, 2).join(", ") : displayName.split(",").slice(0, 2).join(",").trim();

    return { displayName, shortName };
  } catch {
    // Fallback to coordinate string immediately
    return {
      displayName: `Current Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      shortName: `My Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    };
  }
}

export function useGeolocation() {
  const [status, setStatus] = useState<GeolocationStatus>("idle");
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(async (): Promise<GeoLocation | null> => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      setError("Geolocation is not supported by your browser.");
      return null;
    }

    setStatus("requesting");
    setError(null);

    const getPosition = (highAccuracy: boolean, timeoutMs: number): Promise<GeolocationPosition> => {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: highAccuracy,
          timeout: timeoutMs,
          maximumAge: 30000,
        });
      });
    };

    try {
      let position: GeolocationPosition;
      try {
        // Try high accuracy with 3.5s timeout first
        position = await getPosition(true, 3500);
      } catch (firstErr: any) {
        // If permission was denied, do not retry
        if (firstErr?.code === 1) throw firstErr;
        // Otherwise fallback to network/low accuracy (reliable on desktop browsers)
        position = await getPosition(false, 6000);
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
      };

      setLocation(loc);
      return loc;
    } catch (err: any) {
      if (err?.code === 1) {
        setStatus("denied");
        setError("Location permission denied. Please allow location in your browser.");
      } else if (err?.code === 2) {
        setStatus("error");
        setError("Location unavailable. Make sure GPS or network location is turned on.");
      } else if (err?.code === 3) {
        setStatus("error");
        setError("Location request timed out. Please try clicking again.");
      } else {
        setStatus("error");
        setError("Could not determine your location. Please try again.");
      }
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setLocation(null);
    setError(null);
  }, []);

  return { status, location, error, requestLocation, reset };
}
