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
  { params }: { params: Promise<{ tenderId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { tenderId } = await params;
    const url = new URL(request.url);
    const companyId = url.searchParams.get("companyId");

    if (!companyId) {
      return apiResponse({ error: "companyId is required" }, 400);
    }

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("matching_results")
      .select(
        "id, overall_score, capability_score, experience_score, location_score, certification_score, match_reasons, improvement_suggestions, ai_analysis",
      )
      .eq("tender_id", tenderId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) throw error;

    return apiResponse({ match: data });
  } catch (error) {
    return handleApiError(error);
  }
}
