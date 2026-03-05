import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { geocodeLocation, isGeocodingEnabled } from "@/lib/geocode";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    if (!isGeocodingEnabled()) {
      return apiResponse({ enabled: false, result: null });
    }

    const q = new URL(request.url).searchParams.get("q")?.trim();
    if (!q) {
      return apiResponse({ enabled: true, result: null });
    }

    const result = await geocodeLocation(q);
    return apiResponse({ enabled: true, result });
  } catch (error) {
    return handleApiError(error);
  }
}
