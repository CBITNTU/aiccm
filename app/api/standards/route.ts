import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError, isCompanyMember } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companyMarkets, markets, standardsRef } from "@/lib/db/schema/app";
import { localizedName } from "@/lib/taxonomy/localizedName";
import { asc, eq, inArray } from "drizzle-orm";

export interface StandardNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  relevant?: boolean;
}

/** Normalise for industry/market name matching (lowercase, trim). */
function norm(s: string): string {
  return (s || "").toLowerCase().trim();
}

/** True if industry (from standards) is considered related to market name. */
function industryMatchesMarket(industryNorm: string, marketNorm: string): boolean {
  if (!industryNorm || !marketNorm) return false;
  if (industryNorm === marketNorm) return true;
  if (industryNorm.includes(marketNorm) || marketNorm.includes(industryNorm)) return true;
  return false;
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId") ?? undefined;

    let marketNamesNorm: string[] = [];
    if (companyId) {
      const hasAccess = await isCompanyMember(user.id, companyId);
      if (!hasAccess) {
        return apiResponse({ standards: [] });
      }

      // Get company's market IDs
      const cmRows = await db
        .select({ marketId: companyMarkets.marketId })
        .from(companyMarkets)
        .where(eq(companyMarkets.companyId, companyId));

      const marketIds = cmRows.map((m) => m.marketId);
      if (marketIds.length > 0) {
        // Fetch those markets
        const marketRows = await db
          .select({ id: markets.id, name: localizedName(markets.name, markets.nameZh), parentId: markets.parentId })
          .from(markets)
          .where(inArray(markets.id, marketIds));

        // Also fetch parent markets
        const parentIds = marketRows
          .map((m) => m.parentId)
          .filter((id): id is string => !!id);
        const allIds = [...new Set([...marketIds, ...parentIds])];

        const allMarketRows = await db
          .select({ id: markets.id, name: localizedName(markets.name, markets.nameZh), parentId: markets.parentId })
          .from(markets)
          .where(inArray(markets.id, allIds));

        const byId = new Map(allMarketRows.map((m) => [m.id, m]));
        const names = new Set<string>();
        for (const m of marketRows) {
          const row = byId.get(m.id);
          if (row) names.add(row.name);
          if (m.parentId) {
            const parent = byId.get(m.parentId);
            if (parent) names.add(parent.name);
          }
        }
        marketNamesNorm = Array.from(names).map((n) => norm(n));
      }
    }

    // Fetch all standards
    const allStandards = await db
      .select({
        id: standardsRef.id,
        name: localizedName(standardsRef.name, standardsRef.nameZh),
        parentId: standardsRef.parentId,
        sortOrder: standardsRef.sortOrder,
      })
      .from(standardsRef)
      .orderBy(asc(standardsRef.sortOrder), asc(standardsRef.name));

    const list = allStandards as StandardNode[];

    // Mark standards as relevant based on market matching (but always return all)
    if (marketNamesNorm.length === 0) {
      return apiResponse({ standards: list });
    }

    const byId = new Map<string, StandardNode>();
    list.forEach((n) => byId.set(n.id, n));
    const relevantIds = new Set<string>();
    list.forEach((s) => {
      if (!s.parentId) {
        const industryNorm = norm(s.name);
        const match = marketNamesNorm.some((mn) => industryMatchesMarket(industryNorm, mn));
        if (match) relevantIds.add(s.id);
      } else {
        const parent = byId.get(s.parentId);
        if (parent) {
          const industryNorm = norm(parent.name);
          const match = marketNamesNorm.some((mn) => industryMatchesMarket(industryNorm, mn));
          if (match) {
            relevantIds.add(parent.id);
            relevantIds.add(s.id);
          }
        }
      }
    });
    const result = list.map((s) => ({ ...s, relevant: relevantIds.has(s.id) }));
    return apiResponse({ standards: result });
  } catch (error) {
    return handleApiError(error);
  }
}
