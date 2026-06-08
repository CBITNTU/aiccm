import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companyCapabilitiesRef } from "@/lib/db/schema/app";
import { eq, asc, inArray } from "drizzle-orm";

type CapabilityRef = { id: string; name: string; category: string | null };

// The reference taxonomy is global (identical for all users) and changes rarely.
// Cache the full list in-process with a short TTL so concurrent/repeat requests
// don't each hit the DB. Admin edits self-heal within the TTL window; the browser
// also caches via Cache-Control, and clients dedupe via React Query.
const FULL_LIST_TTL_MS = 10 * 60 * 1000;
let cachedAll: { data: CapabilityRef[]; expiresAt: number } | null = null;

async function getAllCapabilities(now: number): Promise<CapabilityRef[]> {
  if (cachedAll && cachedAll.expiresAt > now) return cachedAll.data;
  const data = await db
    .select({
      id: companyCapabilitiesRef.id,
      name: companyCapabilitiesRef.name,
      category: companyCapabilitiesRef.category,
    })
    .from(companyCapabilitiesRef)
    .where(eq(companyCapabilitiesRef.isActive, true))
    .orderBy(asc(companyCapabilitiesRef.category), asc(companyCapabilitiesRef.name));
  cachedAll = { data, expiresAt: now + FULL_LIST_TTL_MS };
  return data;
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
          name: companyCapabilitiesRef.name,
        })
        .from(companyCapabilitiesRef)
        .where(inArray(companyCapabilitiesRef.id, ids));
      return apiResponse({ capabilities: data });
    }

    const data = await getAllCapabilities(Date.now());

    return apiResponse(
      { capabilities: data },
      200,
      { "Cache-Control": "private, max-age=600" },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
