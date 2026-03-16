import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { requireAuth, handleApiError, isCompanyMember } from "@/lib/api/validation";

export interface StandardNode {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
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
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId") ?? undefined;

    let marketNamesNorm: string[] = [];
    if (companyId) {
      const hasAccess = await isCompanyMember(user.id, companyId);
      if (!hasAccess) {
        return apiResponse({ standards: [] });
      }
      const { data: companyMarkets } = await supabase
        .from("company_markets")
        .select("market_id")
        .eq("company_id", companyId);
      const marketIds = (companyMarkets || []).map((m: { market_id: string }) => m.market_id);
      if (marketIds.length > 0) {
        const { data: markets } = await supabase
          .from("markets")
          .select("id, name, parent_id")
          .in("id", marketIds);
        const idsToFetch = new Set<string>(marketIds);
        (markets || []).forEach((m: { parent_id: string | null }) => {
          if (m.parent_id) idsToFetch.add(m.parent_id);
        });
        const { data: allMarkets } = await supabase
          .from("markets")
          .select("id, name, parent_id")
          .in("id", Array.from(idsToFetch));
        const byId = new Map<string | null, { name: string; parent_id: string | null }>();
        (allMarkets || []).forEach((m: { id: string; name: string; parent_id: string | null }) => byId.set(m.id, { name: m.name, parent_id: m.parent_id }));
        const names = new Set<string>();
        (markets || []).forEach((m: { id: string; name: string; parent_id: string | null }) => {
          const row = byId.get(m.id);
          if (row) names.add(row.name);
          if (m.parent_id) {
            const parent = byId.get(m.parent_id);
            if (parent) names.add(parent.name);
          }
        });
        marketNamesNorm = Array.from(names).map((n) => norm(n));
      }
    }

    const { data: allStandards, error } = await supabase
      .from("standards_ref")
      .select("id, name, parent_id, sort_order")
      .order("sort_order")
      .order("name");

    if (error) throw error;

    const list = (allStandards || []) as StandardNode[];
    if (marketNamesNorm.length === 0) {
      return apiResponse({ standards: list });
    }

    const byId = new Map<string, StandardNode>();
    list.forEach((n) => byId.set(n.id, n));
    const allowedIds = new Set<string>();
    list.forEach((s) => {
      if (!s.parent_id) {
        const industryNorm = norm(s.name);
        const match = marketNamesNorm.some((mn) => industryMatchesMarket(industryNorm, mn));
        if (match) allowedIds.add(s.id);
      } else {
        const parent = byId.get(s.parent_id);
        if (parent) {
          const industryNorm = norm(parent.name);
          const match = marketNamesNorm.some((mn) => industryMatchesMarket(industryNorm, mn));
          if (match) {
            allowedIds.add(parent.id);
            allowedIds.add(s.id);
          }
        }
      }
    });
    const filtered = list.filter((s) => allowedIds.has(s.id));
    return apiResponse({ standards: filtered });
  } catch (error) {
    return handleApiError(error);
  }
}
