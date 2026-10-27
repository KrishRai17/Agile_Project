"use client";

import { useState, useRef, useCallback } from "react";
import { LocationItem } from "@/lib/mapData";

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address: {
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

export function useNominatimSearch() {
  const [results, setResults] = useState<LocationItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const search = useCallback((query: string) => {
    // Cancel any in-flight request
    if (controllerRef.current) controllerRef.current.abort();
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!query || query.trim().length < 3) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const params = new URLSearchParams({
          q: query,
          format: "json",
          addressdetails: "1",
          limit: "6",
          // Bias towards Bengaluru / Karnataka
          countrycodes: "in",
          viewbox: "77.3,12.6,78.0,13.4",
          bounded: "0",
        });

        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params.toString()}`,
          {
            headers: { "Accept-Language": "en" },
            signal: controller.signal,
          }
        );

        if (!res.ok) throw new Error("Nominatim error");

        const data: NominatimResult[] = await res.json();

        const mapped: LocationItem[] = data.map((item) => {
          const addr = item.address;
          const parts: string[] = [];

          if (addr.road) parts.push(addr.road);
          if (addr.suburb || addr.neighbourhood || addr.quarter)
            parts.push(addr.suburb || addr.neighbourhood || addr.quarter || "");
          if (addr.city || addr.town || addr.village || addr.municipality)
            parts.push(addr.city || addr.town || addr.village || addr.municipality || "");

          const shortName =
            parts.length > 0
              ? parts.slice(0, 2).join(", ")
              : item.display_name.split(",").slice(0, 2).join(",").trim();

          return {
            id: `nom_${item.place_id}`,
            name: shortName,
            address: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            category: "landmark",
          };
        });

        setResults(mapped);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 380); // 380ms debounce
  }, []);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (controllerRef.current) controllerRef.current.abort();
    setResults([]);
    setIsSearching(false);
  }, []);

  return { results, isSearching, search, clear };
}
