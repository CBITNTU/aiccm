import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ resultId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { resultId } = await params;
    const supabase = createAdminClient();

    // Verify ownership
    const { data: result } = await supabase
      .from("matching_results")
      .select("company_id, companies!inner(user_id)")
      .eq("id", resultId)
      .single();

    if (
      !result ||
      (result.companies as unknown as { user_id: string })?.user_id !== user.id
    ) {
      throw new AuthError("No access to this matching result");
    }

    const { error } = await supabase
      .from("matching_results")
      .delete()
      .eq("id", resultId);

    if (error) throw error;

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
