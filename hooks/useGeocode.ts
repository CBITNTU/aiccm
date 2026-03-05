"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";

interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

interface UseGeocodeReturn {
  geocode: (query: string) => Promise<GeocodeResult | null>;
  coords: GeocodeResult | null;
  isGeocoding: boolean;
  /** null = still checking, true = API key configured, false = no API key */
  isEnabled: boolean | null;
}

export function useGeocode(): UseGeocodeReturn {
  const [coords, setCoords] = useState<GeocodeResult | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const cache = useRef(new Map<string, GeocodeResult | null>());
  const checkedRef = useRef(false);

  // Check if geocoding is enabled on mount (no-op call with empty query)
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    api.geocode("").then((data) => setIsEnabled(data.enabled)).catch(() => {});
  }, []);

  const geocode = useCallback(
    async (query: string): Promise<GeocodeResult | null> => {
      const trimmed = query.trim();
      if (!trimmed) {
        setCoords(null);
        return null;
      }

      const key = trimmed.toLowerCase();
      if (cache.current.has(key)) {
        const cached = cache.current.get(key) ?? null;
        setCoords(cached);
        return cached;
      }

      setIsGeocoding(true);
      try {
        const data = await api.geocode(trimmed);
        setIsEnabled(data.enabled);

        if (!data.enabled) {
          setCoords(null);
          return null;
        }

        const result = data.result ?? null;
        cache.current.set(key, result);
        setCoords(result);
        return result;
      } catch {
        setCoords(null);
        return null;
      } finally {
        setIsGeocoding(false);
      }
    },
    [],
  );

  return { geocode, coords, isGeocoding, isEnabled };
}
