import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("tenders")
      .select("id, title, buyer, deadline")
      .in("status", ["open", "closing_soon"])
      .order("deadline", { ascending: true })
      .limit(50);

    if (error) throw error;

    return apiResponse({ tenders: data || [] });
  } catch (error) {
    return handleApiError(error);
  }
}
