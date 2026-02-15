import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  getUserCompanyIds,
  handleApiError,
} from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const supabase = createAdminClient();

    // Get user's company IDs
    const companyIds = await getUserCompanyIds(user.id);

    // Fetch companies
    let companies: Record<string, unknown>[] = [];
    if (companyIds.length > 0) {
      const { data } = await supabase
        .from("companies")
        .select("*")
        .in("id", companyIds)
        .order("created_at", { ascending: false });
      companies = data || [];
    }

    // Fetch total tenders count
    const { count: totalTenders } = await supabase
      .from("tenders")
      .select("*", { count: "exact", head: true });

    // Fetch matching results count for user's companies
    let matchingResultsCount = 0;

    if (companyIds.length > 0) {
      const { count } = await supabase
        .from("matching_results")
        .select("*", { count: "exact", head: true })
        .in("company_id", companyIds);

      matchingResultsCount = count || 0;
    }

    // Fetch projects count
    let projectsCount = 0;
    if (companyIds.length > 0) {
      const { data: projects } = await supabase
        .from("virtual_organizations")
        .select("id")
        .in("lead_company_id", companyIds);
      projectsCount = projects?.length || 0;
    }

    return apiResponse({
      companies,
      stats: {
        totalTenders: totalTenders || 0,
        matchingResults: matchingResultsCount,
        companies: companies.length,
        projects: projectsCount,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
