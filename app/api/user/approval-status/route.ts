import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const supabase = createAdminClient();

    // Get profile info
    const { data: profile } = await supabase
      .from("profiles")
      .select("approval_status, signup_type")
      .eq("user_id", user.id)
      .single();

    // Check for join request if applicable
    const { data: joinRequest } = await supabase
      .from("company_join_requests")
      .select("status, company_name_requested")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Check for owned company name
    let companyName: string | null = joinRequest?.company_name_requested || null;
    if (!companyName) {
      const { data: company } = await supabase
        .from("companies")
        .select("company_name")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      companyName = company?.company_name || null;
    }

    return apiResponse({
      approvalStatus: profile?.approval_status || "pending",
      signupType: profile?.signup_type || null,
      companyName,
      joinRequestStatus: joinRequest?.status || null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
