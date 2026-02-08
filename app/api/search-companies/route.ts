import { NextRequest } from "next/server";
import {
  createAdminClient,
  createApiClient,
  apiResponse,
  apiError,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";

export interface CompanySearchResult {
  id: string;
  company_name: string;
  has_admin: boolean;
}

export async function GET(request: NextRequest) {
  try {
    let userId: string | undefined;
    try {
      const supabaseAuth = await createApiClient();
      const {
        data: { user },
      } = await supabaseAuth.auth.getUser();
      userId = user?.id;
    } catch {
      // Optional auth
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    // Require at least 2 characters for search
    if (!query || query.length < 2) {
      return apiResponse({ companies: [] });
    }

    const supabase = createAdminClient();

    // Search for companies by name (case-insensitive)
    // Only show active companies (hide pending_review companies from regular users)
    const { data: companies, error } = await supabase
      .from("companies")
      .select("id, company_name")
      .ilike("company_name", `%${query}%`)
      .eq("status", "active")
      .order("company_name")
      .limit(10);

    if (error) {
      console.error("Error searching companies:", error);
      return apiError("Failed to search companies", 500);
    }

    // Check which companies have an admin (someone with role='admin' in company_members)
    const companiesWithAdminStatus: CompanySearchResult[] = await Promise.all(
      (companies || []).map(async (company) => {
        const { data: members } = await supabase
          .from("company_members")
          .select("id")
          .eq("company_id", company.id)
          .eq("role", "admin")
          .eq("status", "approved")
          .limit(1);

        return {
          id: company.id,
          company_name: company.company_name,
          has_admin: (members?.length || 0) > 0,
        };
      }),
    );

    await logApiEvent(request, {
      actionType: "company_searched",
      userId: userId || undefined,
      details: { query, count: companiesWithAdminStatus.length },
    }).catch(() => {});

    return apiResponse({ companies: companiesWithAdminStatus });
  } catch (error) {
    console.error("Error in company search:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
