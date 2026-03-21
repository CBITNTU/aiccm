import { NextRequest } from "next/server";
import {
  apiResponse,
  apiError,
  checkSuperadminRole,
} from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { ONBOARDING_STEPS, ONBOARDING_STEP_NAMES } from "@/lib/onboarding";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import {
  profiles,
  companies,
  companyJoinRequests,
  userRoles,
} from "@/lib/db/schema/app";
import { desc, eq } from "drizzle-orm";

/**
 * GET /api/admin/onboarding
 *
 * Returns all users with their onboarding status and collected data.
 * Only accessible by superadmins.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    // Check if user is superadmin
    const isSuperadmin = await checkSuperadminRole(user.id);
    if (!isSuperadmin) {
      return apiError("Superadmin access required", 403);
    }

    // Get all profiles with onboarding data
    const allProfiles = await db
      .select({
        userId: profiles.userId,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        email: profiles.email,
        jobTitle: profiles.jobTitle,
        onboardingStep: profiles.onboardingStep,
        onboardingCompletedAt: profiles.onboardingCompletedAt,
        accountType: profiles.accountType,
        signupType: profiles.signupType,
        approvalStatus: profiles.approvalStatus,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .orderBy(desc(profiles.createdAt));

    // Get auth users to check email verification status
    // Note: Better Auth doesn't have a direct equivalent for listing all users with verification status.
    // We use the user table from the auth schema instead.
    const { user: authUserTable } = await import("@/lib/db/schema/auth");
    const authUsers = await db.select().from(authUserTable);

    // Create a map of user_id to email verification status
    const emailVerificationMap = new Map<
      string,
      { email: string; verified: boolean; verifiedAt: string | null }
    >();
    for (const authUser of authUsers) {
      emailVerificationMap.set(authUser.id, {
        email: authUser.email || "",
        verified: !!authUser.emailVerified,
        verifiedAt: authUser.emailVerified ? new Date().toISOString() : null,
      });
    }

    // Get companies for users who created them
    const allCompanies = await db
      .select({
        id: companies.id,
        companyName: companies.companyName,
        userId: companies.userId,
        status: companies.status,
      })
      .from(companies);

    const companiesMap = new Map<
      string,
      { id: string; name: string; status: string }
    >();
    for (const company of allCompanies) {
      if (company.userId) {
        companiesMap.set(company.userId, {
          id: company.id,
          name: company.companyName,
          status: company.status || "unknown",
        });
      }
    }

    // Get join requests for users who requested to join
    const allJoinRequests = await db
      .select({
        userId: companyJoinRequests.userId,
        companyId: companyJoinRequests.companyId,
        companyNameRequested: companyJoinRequests.companyNameRequested,
        status: companyJoinRequests.status,
      })
      .from(companyJoinRequests)
      .orderBy(desc(companyJoinRequests.createdAt));

    const joinRequestsMap = new Map<
      string,
      { companyId: string; companyName: string; status: string }
    >();
    for (const req of allJoinRequests) {
      // Only keep the most recent request per user
      if (!joinRequestsMap.has(req.userId)) {
        joinRequestsMap.set(req.userId, {
          companyId: req.companyId,
          companyName: req.companyNameRequested,
          status: req.status,
        });
      }
    }

    // Build the response with enriched data
    const usersWithOnboarding = allProfiles.map((profile) => {
      const authInfo = emailVerificationMap.get(profile.userId);
      const company = companiesMap.get(profile.userId);
      const joinRequest = joinRequestsMap.get(profile.userId);
      const currentStep =
        profile.onboardingStep || ONBOARDING_STEPS.EMAIL_VERIFICATION;

      return {
        userId: profile.userId,
        email: authInfo?.email || profile.email || "Unknown",
        firstName: profile.firstName,
        lastName: profile.lastName,
        jobTitle: profile.jobTitle,
        createdAt: profile.createdAt,

        // Onboarding status
        onboarding: {
          currentStep,
          currentStepName:
            ONBOARDING_STEP_NAMES[
              currentStep as keyof typeof ONBOARDING_STEP_NAMES
            ] || "Unknown",
          completedAt: profile.onboardingCompletedAt,
          isComplete: !!profile.onboardingCompletedAt,
        },

        // Step 1: Email verification
        emailVerification: {
          verified: authInfo?.verified || false,
          verifiedAt: authInfo?.verifiedAt,
        },

        // Step 2: Profile info
        profileInfo: {
          completed: !!(
            profile.firstName &&
            profile.lastName &&
            profile.jobTitle
          ),
          firstName: profile.firstName,
          lastName: profile.lastName,
          jobTitle: profile.jobTitle,
        },

        // Step 3: Account type
        accountType: {
          selected: !!profile.accountType,
          type: profile.accountType,
        },

        // Step 4: Company info (if business)
        companyInfo:
          profile.accountType === "business"
            ? {
                signupType: profile.signupType,
                company: company
                  ? {
                      id: company.id,
                      name: company.name,
                      status: company.status,
                    }
                  : null,
                joinRequest: joinRequest
                  ? {
                      companyId: joinRequest.companyId,
                      companyName: joinRequest.companyName,
                      status: joinRequest.status,
                    }
                  : null,
              }
            : null,

        // Approval status
        approvalStatus: profile.approvalStatus || "pending",
      };
    });

    // Calculate summary stats
    const stats = {
      total: usersWithOnboarding.length,
      byStep: {
        emailVerification: usersWithOnboarding.filter(
          (u) => u.onboarding.currentStep === ONBOARDING_STEPS.EMAIL_VERIFICATION,
        ).length,
        profileInfo: usersWithOnboarding.filter(
          (u) => u.onboarding.currentStep === ONBOARDING_STEPS.PROFILE_INFO,
        ).length,
        accountType: usersWithOnboarding.filter(
          (u) => u.onboarding.currentStep === ONBOARDING_STEPS.ACCOUNT_TYPE,
        ).length,
        companyInfo: usersWithOnboarding.filter(
          (u) => u.onboarding.currentStep === ONBOARDING_STEPS.COMPANY_INFO,
        ).length,
        complete: usersWithOnboarding.filter(
          (u) => u.onboarding.currentStep === ONBOARDING_STEPS.COMPLETE,
        ).length,
      },
      completed: usersWithOnboarding.filter(
        (u) => u.onboarding.isComplete,
      ).length,
      pendingApproval: usersWithOnboarding.filter(
        (u) => u.onboarding.isComplete && u.approvalStatus === "pending",
      ).length,
      approved: usersWithOnboarding.filter(
        (u) => u.approvalStatus === "approved",
      ).length,
    };

    await logApiEvent(request, {
      actionType: "admin_onboarding",
      userId: user.id,
      userEmail: user.email || undefined,
      details: { user_count: usersWithOnboarding.length },
    }).catch(() => {});

    return apiResponse({
      users: usersWithOnboarding,
      stats,
      stepNames: ONBOARDING_STEP_NAMES,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
