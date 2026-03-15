import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";

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

    const supabase = createAdminClient();

    const { data: companyMarkets, error } = await supabase
      .from("company_markets")
      .select("markets(id, name, parent_id, sort_order)")
      .eq("company_id", companyId);

    if (error) throw error;

    const markets = (companyMarkets || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cm: any) => cm.markets)
      .filter(Boolean);

    return apiResponse({ markets });
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

    const supabase = createAdminClient();
    const body = await request.json();
    const { marketIds } = body as { marketIds: string[] };

    const { data: current } = await supabase
      .from("company_markets")
      .select("market_id")
      .eq("company_id", companyId);

    const currentIds = new Set((current || []).map((c) => c.market_id));
    const newIds = new Set(marketIds);

    const toRemove = [...currentIds].filter((id) => !newIds.has(id));
    const toAdd = [...newIds].filter((id) => !currentIds.has(id));

    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("company_markets")
        .delete()
        .eq("company_id", companyId)
        .in("market_id", toRemove);
      if (error) throw error;
    }

    if (toAdd.length > 0) {
      const inserts = toAdd.map((marketId) => ({
        company_id: companyId,
        market_id: marketId,
      }));
      const { error } = await supabase
        .from("company_markets")
        .insert(inserts);
      if (error) throw error;
    }

    const { data: updated } = await supabase
      .from("company_markets")
      .select("markets(id, name, parent_id, sort_order)")
      .eq("company_id", companyId);

    const markets = (updated || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cm: any) => cm.markets)
      .filter(Boolean);

    return apiResponse({ markets });
  } catch (error) {
    return handleApiError(error);
  }
}
