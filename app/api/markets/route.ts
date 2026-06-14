import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { markets } from "@/lib/db/schema/app";
import { asc, inArray } from "drizzle-orm";

export interface MarketNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

// The reference taxonomy is global and changes rarely. Cache the full list
// in-process with a short TTL so concurrent/repeat requests don't each hit the DB.
const FULL_LIST_TTL_MS = 10 * 60 * 1000;
let cachedAll: { data: MarketNode[]; expiresAt: number } | null = null;

async function getAllMarkets(now: number): Promise<MarketNode[]> {
  if (cachedAll && cachedAll.expiresAt > now) return cachedAll.data;
  const data = (await db
    .select({
      id: markets.id,
      name: markets.name,
      parentId: markets.parentId,
      sortOrder: markets.sortOrder,
    })
    .from(markets)
    .orderBy(asc(markets.sortOrder), asc(markets.name))) as MarketNode[];
  cachedAll = { data, expiresAt: now + FULL_LIST_TTL_MS };
  return data;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // Targeted lookup: ?ids=a,b,c returns only those rows (id, name).
    const idsParam = request.nextUrl.searchParams.get("ids");
    if (idsParam !== null) {
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) {
        return apiResponse({ markets: [] });
      }
      const data = await db
        .select({ id: markets.id, name: markets.name })
        .from(markets)
        .where(inArray(markets.id, ids));
      return apiResponse({ markets: data });
    }

    const data = await getAllMarkets(Date.now());

    return apiResponse(
      { markets: data },
      200,
      { "Cache-Control": "private, max-age=600" },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
