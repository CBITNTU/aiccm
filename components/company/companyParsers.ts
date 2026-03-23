export interface Certification {
  name: string;
  issuer?: string;
  validUntil?: string;
}

export interface PastProject {
  name: string;
  description?: string;
  value?: string;
  year?: string;
}

export function parseCertifications(raw: string | null | undefined): Certification[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    if (typeof raw === "string") {
      return raw
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((name) => ({ name }));
    }
    return [];
  }
}

export function parsePastProjects(raw: string | null | undefined): PastProject[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    if (typeof raw === "string") {
      return raw
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((description) => ({
          name: description.substring(0, 50) + (description.length > 50 ? "..." : ""),
          description,
        }));
    }
    return [];
  }
}

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
