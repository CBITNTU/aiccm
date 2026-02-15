import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const supabase = createAdminClient();

    // Fetch owned companies
    const { data: ownedCompanies, error: ownedError } = await supabase
      .from("companies")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (ownedError) throw ownedError;

    const ownedIds = new Set((ownedCompanies || []).map((c) => c.id));

    // Fetch approved memberships
    const { data: memberships } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "approved");

    // Fetch member companies (excluding owned)
    let memberCompanies: typeof ownedCompanies = [];
    if (memberships && memberships.length > 0) {
      const memberCompanyIds = memberships
        .map((m) => m.company_id)
        .filter((id) => !ownedIds.has(id));

      if (memberCompanyIds.length > 0) {
        const { data } = await supabase
          .from("companies")
          .select("*")
          .in("id", memberCompanyIds);
        memberCompanies = data || [];
      }
    }

    // Fetch pending join requests
    const { data: pendingJoinRequests } = await supabase
      .from("company_join_requests")
      .select("company_id, status, companies(*)")
      .eq("user_id", user.id)
      .in("status", ["pending", "approved_by_admin"]);

    const memberIds = new Set((memberCompanies || []).map((c) => c.id));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingCompanies: any[] = [];
    if (pendingJoinRequests) {
      for (const request of pendingJoinRequests) {
        const companyData = request.companies;
        if (
          companyData &&
          !ownedIds.has((companyData as { id: string }).id) &&
          !memberIds.has((companyData as { id: string }).id)
        ) {
          pendingCompanies.push({
            ...companyData,
            membershipStatus: "pending_join",
            joinRequestStatus: request.status,
          });
        }
      }
    }

    // Combine with membership status
    const companies = [
      ...(ownedCompanies || []).map((c) => ({
        ...c,
        membershipStatus: "owner" as const,
      })),
      ...(memberCompanies || []).map((c) => ({
        ...c,
        membershipStatus: "member" as const,
      })),
      ...pendingCompanies,
    ];

    return apiResponse({ companies });
  } catch (error) {
    return handleApiError(error);
  }
}
