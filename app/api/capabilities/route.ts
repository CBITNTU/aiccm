import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("company_capabilities_ref")
      .select("id, name, category")
      .eq("is_active", true)
      .order("category")
      .order("name");

    if (error) throw error;

    return apiResponse({ capabilities: data || [] });
  } catch (error) {
    return handleApiError(error);
  }
}
