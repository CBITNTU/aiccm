import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";

export interface MarketNode {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("markets")
      .select("id, name, parent_id, sort_order")
      .order("sort_order")
      .order("name");

    if (error) throw error;

    return apiResponse({ markets: (data || []) as MarketNode[] });
  } catch (error) {
    return handleApiError(error);
  }
}
