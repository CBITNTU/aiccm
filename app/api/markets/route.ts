import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { markets } from "@/lib/db/schema/app";
import { asc } from "drizzle-orm";

export interface MarketNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const data = await db
      .select({
        id: markets.id,
        name: markets.name,
        parentId: markets.parentId,
        sortOrder: markets.sortOrder,
      })
      .from(markets)
      .orderBy(asc(markets.sortOrder), asc(markets.name));

    return apiResponse({ markets: data as MarketNode[] });
  } catch (error) {
    return handleApiError(error);
  }
}
