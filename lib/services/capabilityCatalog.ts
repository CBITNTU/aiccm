import { db } from "@/lib/db";
import { companyCapabilitiesRef } from "@/lib/db/schema/app";
import { asc } from "drizzle-orm";
import { localizedName, localizedCategory } from "@/lib/taxonomy/localizedName";

export type CapabilityCatalogRow = {
  id: string;
  name: string;
  category: string | null;
  isActive: boolean | null;
};

// The capabilities catalog is global (identical for all companies/tenders) and changes
// rarely, but it is large (~1200 rows). Several queue jobs and endpoints used to fetch
// the full table on every run, once per tender/company — a major DB egress cost. Cache
// it in-process with a short TTL so concurrent/repeat callers reuse one fetch. Admin
// edits self-heal within the TTL window (or call invalidateCapabilityCatalog()).
const TTL_MS = 10 * 60 * 1000;
let cache: { data: CapabilityCatalogRow[]; expiresAt: number } | null = null;

/** Full catalog (all rows), cached in-process. Callers filter (e.g. active-only) in memory. */
export async function getCapabilityCatalog(): Promise<CapabilityCatalogRow[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    const msLeft = cache.expiresAt - now;
    console.log(
      `[CapabilityCatalog] CACHE HIT — ${cache.data.length} rows, no DB read (TTL ${Math.round(msLeft / 1000)}s left)`,
    );
    return cache.data;
  }
  console.log("[CapabilityCatalog] CACHE MISS — fetching full catalog from DB...");
  const data = await db
    .select({
      id: companyCapabilitiesRef.id,
      name: localizedName(companyCapabilitiesRef.name, companyCapabilitiesRef.nameZh),
      category: localizedCategory(companyCapabilitiesRef.category, companyCapabilitiesRef.categoryZh),
      isActive: companyCapabilitiesRef.isActive,
    })
    .from(companyCapabilitiesRef)
    .orderBy(asc(companyCapabilitiesRef.category), asc(companyCapabilitiesRef.name));
  cache = { data, expiresAt: now + TTL_MS };
  console.log(
    `[CapabilityCatalog] DB FETCH complete — ${data.length} rows cached for ${Math.round(TTL_MS / 1000)}s`,
  );
  return data;
}

export function invalidateCapabilityCatalog(): void {
  if (cache) {
    console.log("[CapabilityCatalog] CACHE INVALIDATED — next read will hit the DB");
  }
  cache = null;
}
