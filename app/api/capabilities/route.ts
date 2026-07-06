import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companyCapabilitiesRef } from "@/lib/db/schema/app";
import { localizedName } from "@/lib/taxonomy/localizedName";
import { inArray } from "drizzle-orm";
import { getCapabilityCatalog } from "@/lib/services/capabilityCatalog";

type CapabilityRef = { id: string; name: string; category: string | null };

// The reference taxonomy is global (identical for all users) and changes rarely.
// The shared catalog accessor caches the full list in-process with a short TTL so
// concurrent/repeat requests don't each hit the DB. This endpoint returns the
// active-only subset; the browser also caches via Cache-Control, and clients
// dedupe via React Query.
async function getAllCapabilities(): Promise<CapabilityRef[]> {
  const data = await getCapabilityCatalog();
  return data
    .filter((c) => c.isActive)
    .map(({ id, name, category }) => ({ id, name, category }));
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // Targeted lookup: ?ids=a,b,c returns only those rows (id, name) so callers
    // that just need to resolve a handful of names don't pull the full list.
    const idsParam = request.nextUrl.searchParams.get("ids");
    if (idsParam !== null) {
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) {
        return apiResponse({ capabilities: [] });
      }
      const data = await db
        .select({
          id: companyCapabilitiesRef.id,
          name: localizedName(companyCapabilitiesRef.name, companyCapabilitiesRef.nameZh),
        })
        .from(companyCapabilitiesRef)
        .where(inArray(companyCapabilitiesRef.id, ids));
      return apiResponse({ capabilities: data });
    }

    const data = await getAllCapabilities();

    return apiResponse(
      { capabilities: data },
      200,
      { "Cache-Control": "private, max-age=600" },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
