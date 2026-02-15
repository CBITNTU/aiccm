import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const supabase = createAdminClient();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    let query = supabase
      .from("tenders")
      .select(
        "id, title, buyer, deadline, status, location, budget_min, budget_max, description, reference_number",
      )
      .in("status", ["open", "closing_soon"])
      .order("deadline", { ascending: true })
      .limit(100);

    if (search?.trim()) {
      query = query.or(
        `title.ilike.%${search}%,buyer.ilike.%${search}%,description.ilike.%${search}%`,
      );
    }

    const { data, error } = await query;

    if (error) throw error;

    return apiResponse({ tenders: data || [] });
  } catch (error) {
    return handleApiError(error);
  }
}
