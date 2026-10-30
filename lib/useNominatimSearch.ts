"use client";

import { useState, useRef, useCallback } from "react";
import { LocationItem } from "@/lib/mapData";

export function useNominatimSearch() {
  const [results, setResults] = useState<LocationItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const search = useCallback((query: string) => {
    // Cancel any in-flight request
    if (controllerRef.current) controllerRef.current.abort();
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!query || query.trim().length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });

        if (!res.ok) throw new Error("Geocoding failed");

        const data = await res.json();
        setResults(data.results || []);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce
  }, []);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (controllerRef.current) controllerRef.current.abort();
    setResults([]);
    setIsSearching(false);
  }, []);

  return { results, isSearching, search, clear };
}
