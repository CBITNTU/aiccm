export function parseOperationLocations(
  raw: unknown,
  address?: string | null,
  postcode?: string | null,
  suggestFn?: (address: string | null | undefined, postcode: string | null | undefined) => string[],
): string[] {
  let locations: string[] = [];
  try {
    if (raw && Array.isArray(raw)) {
      locations = raw as string[];
    }
  } catch {
    locations = [];
  }

  if (locations.length === 0 && suggestFn) {
    const suggested = suggestFn(address, postcode);
    if (suggested.length > 0) locations = suggested;
  }

  return locations;
}
