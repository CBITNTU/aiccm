import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companyMarkets, markets } from "@/lib/db/schema/app";
import { eq, and, inArray } from "drizzle-orm";

async function getCompanyMarketsData(companyId: string) {
  return db
    .select({
      id: markets.id,
      name: markets.name,
      parent_id: markets.parentId,
      sort_order: markets.sortOrder,
    })
    .from(companyMarkets)
    .innerJoin(markets, eq(companyMarkets.marketId, markets.id))
    .where(eq(companyMarkets.companyId, companyId));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    const data = await getCompanyMarketsData(companyId);
    return apiResponse({ markets: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    const body = await request.json();
    const { marketIds } = body as { marketIds: string[] };

    const current = await db
      .select({ marketId: companyMarkets.marketId })
      .from(companyMarkets)
      .where(eq(companyMarkets.companyId, companyId));

    const currentIds = new Set(current.map((c) => c.marketId));
    const newIds = new Set(marketIds);

    const toRemove = [...currentIds].filter((id) => !newIds.has(id));
    const toAdd = [...newIds].filter((id) => !currentIds.has(id));

    if (toRemove.length > 0) {
      await db
        .delete(companyMarkets)
        .where(
          and(
            eq(companyMarkets.companyId, companyId),
            inArray(companyMarkets.marketId, toRemove),
          ),
        );
    }

    if (toAdd.length > 0) {
      await db.insert(companyMarkets).values(
        toAdd.map((marketId) => ({
          companyId,
          marketId,
        })),
      );
    }

    const data = await getCompanyMarketsData(companyId);
    return apiResponse({ markets: data });
  } catch (error) {
    return handleApiError(error);
  }
}
