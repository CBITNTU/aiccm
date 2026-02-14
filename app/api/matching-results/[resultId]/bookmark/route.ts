import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ resultId: string }> },
) {
  try {
    await requireAuth(request);
    const { resultId } = await params;
    const supabase = createAdminClient();

    const body = await request.json();
    const { is_bookmarked } = body as { is_bookmarked: boolean };

    const { data, error } = await supabase
      .from("matching_results")
      .update({ is_bookmarked })
      .eq("id", resultId)
      .select("id, is_bookmarked")
      .single();

    if (error) throw error;

    return apiResponse({ result: data });
  } catch (error) {
    return handleApiError(error);
  }
}
