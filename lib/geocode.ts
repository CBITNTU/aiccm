import { getActiveProfile } from "@/lib/deployment";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

/** Whether the active deployment uses Google geocoding (disabled e.g. in China). */
function googleEnabled(): boolean {
  return getActiveProfile().geocodingProvider === "google";
}

export function isGeocodingEnabled(): boolean {
  return googleEnabled() && !!GOOGLE_MAPS_API_KEY;
}

export async function geocodeLocation(
  query: string,
): Promise<GeocodeResult | null> {
  if (!googleEnabled() || !GOOGLE_MAPS_API_KEY) return null;

  const trimmed = query.trim();
  if (!trimmed) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", trimmed);
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    console.warn(`[Geocode] Google Maps API error: ${response.status}`);
    return null;
  }

  const data = await response.json();

  if (data.status !== "OK" || !data.results?.length) {
    if (data.status !== "ZERO_RESULTS") {
      console.warn(`[Geocode] Google Maps status: ${data.status}`, data.error_message);
    }
    return null;
  }

  const result = data.results[0];
  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    displayName: result.formatted_address,
  };
}

/**
 * Build the best geocoding query from company fields.
 * Prefers address, falls back to postcode.
 */
export function buildCompanyGeoQuery(
  address: string | null | undefined,
  postcode: string | null | undefined,
): string | null {
  if (address?.trim()) return address.trim();
  if (postcode?.trim()) return postcode.trim();
  return null;
}

