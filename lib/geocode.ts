const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

export function isGeocodingEnabled(): boolean {
  return !!GOOGLE_MAPS_API_KEY;
}

export async function geocodeLocation(
  query: string,
): Promise<GeocodeResult | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

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

/**
 * Haversine distance between two points in miles.
 * Returns null if any coordinate is missing.
 */
export function haversineDistanceMiles(
  lat1: number | null,
  lon1: number | null,
  lat2: number | null,
  lon2: number | null,
): number | null {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;

  const R = 3959;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
