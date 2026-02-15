import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("taxonomies")
      .select("*")
      .order("level", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    return apiResponse({ taxonomies: data || [] });
  } catch (error) {
    return handleApiError(error);
  }
}
