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
    const url = new URL(request.url);
    const companyId = url.searchParams.get("companyId");
    const bookmarked = url.searchParams.get("bookmarked");

    const supabase = createAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = supabase
      .from("matching_results")
      .select(
        `
        *,
        tenders (
          title,
          buyer,
          description,
          location,
          deadline,
          budget_min,
          budget_max
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (companyId) {
      const hasAccess = await isCompanyMember(user.id, companyId);
      if (!hasAccess) {
        throw new AuthError("No access to this company");
      }
      query = query.eq("company_id", companyId);
    }

    if (bookmarked === "true") {
      query = query.eq("is_bookmarked", true);
    }

    const { data, error } = await query;
    if (error) throw error;

    return apiResponse({ results: data || [] });
  } catch (error) {
    return handleApiError(error);
  }
}
