import { createApiClient, createAdminClient, apiResponse, apiError } from "@/lib/api";
import { ONBOARDING_STEPS, ONBOARDING_STEP_NAMES } from "@/lib/onboarding";

/**
 * GET /api/admin/onboarding
 *
 * Returns all users with their onboarding status and collected data.
 * Only accessible by superadmins.
 */
export async function GET() {
  try {
    const supabase = await createApiClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return apiError("Unauthorized", 401);
    }

    // Check if user is superadmin
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "superadmin")
      .single();

    if (!userRole) {
      return apiError("Superadmin access required", 403);
    }

    const adminClient = createAdminClient();

    // Get all profiles with onboarding data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profiles, error: profilesError } = await (adminClient.from("profiles") as any)
      .select(`
        user_id,
        first_name,
        last_name,
        email,
        job_title,
        onboarding_step,
        onboarding_completed_at,
        account_type,
        signup_type,
        approval_status,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      return apiError("Failed to fetch profiles", 500);
    }

    // Get auth users to check email verification status
    const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers();

    if (authError) {
      console.error("Error fetching auth users:", authError);
      return apiError("Failed to fetch auth users", 500);
    }

    // Create a map of user_id to email verification status
    const emailVerificationMap = new Map<string, { email: string; verified: boolean; verifiedAt: string | null }>();
    for (const authUser of authUsers.users) {
      emailVerificationMap.set(authUser.id, {
        email: authUser.email || "",
        verified: !!authUser.email_confirmed_at,
        verifiedAt: authUser.email_confirmed_at || null,
      });
    }

    // Get companies for users who created them
    const { data: companies } = await adminClient
      .from("companies")
      .select("id, company_name, user_id, status");

    const companiesMap = new Map<string, { id: string; name: string; status: string }>();
    for (const company of companies || []) {
      if (company.user_id) {
        companiesMap.set(company.user_id, {
          id: company.id,
          name: company.company_name,
          status: company.status || "unknown",
        });
      }
    }

    // Get join requests for users who requested to join
    const { data: joinRequests } = await adminClient
      .from("company_join_requests")
      .select("user_id, company_id, company_name_requested, status")
      .order("created_at", { ascending: false });

    const joinRequestsMap = new Map<string, { companyId: string; companyName: string; status: string }>();
    for (const request of joinRequests || []) {
      // Only keep the most recent request per user
      if (!joinRequestsMap.has(request.user_id)) {
        joinRequestsMap.set(request.user_id, {
          companyId: request.company_id,
          companyName: request.company_name_requested,
          status: request.status,
        });
      }
    }

    // Build the response with enriched data
    const usersWithOnboarding = profiles.map((profile: {
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      job_title: string | null;
      onboarding_step: number | null;
      onboarding_completed_at: string | null;
      account_type: string | null;
      signup_type: string | null;
      approval_status: string | null;
      created_at: string;
    }) => {
      const authInfo = emailVerificationMap.get(profile.user_id);
      const company = companiesMap.get(profile.user_id);
      const joinRequest = joinRequestsMap.get(profile.user_id);
      const currentStep = profile.onboarding_step || ONBOARDING_STEPS.EMAIL_VERIFICATION;

      return {
        userId: profile.user_id,
        email: authInfo?.email || profile.email || "Unknown",
        firstName: profile.first_name,
        lastName: profile.last_name,
        jobTitle: profile.job_title,
        createdAt: profile.created_at,

        // Onboarding status
        onboarding: {
          currentStep,
          currentStepName: ONBOARDING_STEP_NAMES[currentStep as keyof typeof ONBOARDING_STEP_NAMES] || "Unknown",
          completedAt: profile.onboarding_completed_at,
          isComplete: !!profile.onboarding_completed_at,
        },

        // Step 1: Email verification
        emailVerification: {
          verified: authInfo?.verified || false,
          verifiedAt: authInfo?.verifiedAt,
        },

        // Step 2: Profile info
        profileInfo: {
          completed: !!(profile.first_name && profile.last_name && profile.job_title),
          firstName: profile.first_name,
          lastName: profile.last_name,
          jobTitle: profile.job_title,
        },

        // Step 3: Account type
        accountType: {
          selected: !!profile.account_type,
          type: profile.account_type,
        },

        // Step 4: Company info (if business)
        companyInfo: profile.account_type === "business" ? {
          signupType: profile.signup_type,
          company: company ? {
            id: company.id,
            name: company.name,
            status: company.status,
          } : null,
          joinRequest: joinRequest ? {
            companyId: joinRequest.companyId,
            companyName: joinRequest.companyName,
            status: joinRequest.status,
          } : null,
        } : null,

        // Approval status
        approvalStatus: profile.approval_status || "pending",
      };
    });

    // Calculate summary stats
    const stats = {
      total: usersWithOnboarding.length,
      byStep: {
        emailVerification: usersWithOnboarding.filter((u: { onboarding: { currentStep: number } }) => u.onboarding.currentStep === ONBOARDING_STEPS.EMAIL_VERIFICATION).length,
        profileInfo: usersWithOnboarding.filter((u: { onboarding: { currentStep: number } }) => u.onboarding.currentStep === ONBOARDING_STEPS.PROFILE_INFO).length,
        accountType: usersWithOnboarding.filter((u: { onboarding: { currentStep: number } }) => u.onboarding.currentStep === ONBOARDING_STEPS.ACCOUNT_TYPE).length,
        companyInfo: usersWithOnboarding.filter((u: { onboarding: { currentStep: number } }) => u.onboarding.currentStep === ONBOARDING_STEPS.COMPANY_INFO).length,
        complete: usersWithOnboarding.filter((u: { onboarding: { currentStep: number } }) => u.onboarding.currentStep === ONBOARDING_STEPS.COMPLETE).length,
      },
      completed: usersWithOnboarding.filter((u: { onboarding: { isComplete: boolean } }) => u.onboarding.isComplete).length,
      pendingApproval: usersWithOnboarding.filter((u: { onboarding: { isComplete: boolean }; approvalStatus: string }) => u.onboarding.isComplete && u.approvalStatus === "pending").length,
      approved: usersWithOnboarding.filter((u: { approvalStatus: string }) => u.approvalStatus === "approved").length,
    };

    return apiResponse({
      users: usersWithOnboarding,
      stats,
      stepNames: ONBOARDING_STEP_NAMES,
    });
  } catch (error) {
    console.error("Admin onboarding error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
