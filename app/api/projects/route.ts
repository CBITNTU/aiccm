import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const supabase = createAdminClient();

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const status = searchParams.get("status") || "active";

    if (!companyId) {
      throw new AuthError("companyId is required");
    }

    // Verify user has access to this company
    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    const statusesToQuery =
      status === "active" ? ["draft", "active"] : [status];

    const { data, error } = await supabase
      .from("virtual_organizations")
      .select(
        `
        *,
        tenders:target_tender_id (
          id,
          title,
          buyer,
          deadline
        )
      `,
      )
      .eq("lead_company_id", companyId)
      .in("status", statusesToQuery)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return apiResponse({ projects: data || [] });
  } catch (error) {
    return handleApiError(error);
  }
}
