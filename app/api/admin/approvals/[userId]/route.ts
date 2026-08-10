import { NextRequest } from "next/server";
import { apiResponse, apiError, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { profiles, companies, userRoles, companyMembers } from "@/lib/db/schema/app";
import { eq, desc, inArray } from "drizzle-orm";
import { ONBOARDING_STEP_NAMES, isValidStep } from "@/lib/onboarding";

/**
 * Detail payload for the pre-approval console at /admin/approvals/[userId].
 *
 * The approvals list only carries the six basic contact fields; this route
 * resolves everything the console needs to act on the account — the profile,
 * the company to curate, and whether an admin already prepared it.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    if (!(await checkSuperadminRole(user.id))) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    const { userId } = await params;

    const profile = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!profile) {
      return apiError("User not found", 404);
    }

    const roleRow = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    // Companies the user owns, plus any they hold a membership on. A pending
    // signup normally has exactly one, but invited/join flows can differ.
    const owned = await db
      .select({
        id: companies.id,
        companyName: companies.companyName,
        status: companies.status,
        verificationStatus: companies.verificationStatus,
        adminPreparedAt: companies.adminPreparedAt,
        adminPreparedBy: companies.adminPreparedBy,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .where(eq(companies.userId, userId))
      .orderBy(desc(companies.createdAt));

    const membershipRows = await db
      .select({ companyId: companyMembers.companyId })
      .from(companyMembers)
      .where(eq(companyMembers.userId, userId));

    const ownedIds = new Set(owned.map((c) => c.id));
    const extraIds = membershipRows
      .map((m) => m.companyId)
      .filter((id): id is string => !!id && !ownedIds.has(id));

    const memberCompanies = extraIds.length
      ? await db
          .select({
            id: companies.id,
            companyName: companies.companyName,
            status: companies.status,
            verificationStatus: companies.verificationStatus,
            adminPreparedAt: companies.adminPreparedAt,
            adminPreparedBy: companies.adminPreparedBy,
            createdAt: companies.createdAt,
          })
          .from(companies)
          .where(inArray(companies.id, extraIds))
      : [];

    const allCompanies = [...owned, ...memberCompanies];

    // The company to curate: the one awaiting review, else the first owned.
    const primaryCompany =
      allCompanies.find((c) => c.status === "pending_review") ??
      allCompanies[0] ??
      null;

    const invitedCompany = profile.invitedToCompanyId
      ? await db
          .select({ id: companies.id, companyName: companies.companyName })
          .from(companies)
          .where(eq(companies.id, profile.invitedToCompanyId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : null;

    const onboardingStep = profile.onboardingStep ?? 1;

    return apiResponse({
      user: {
        userId: profile.userId,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        jobTitle: profile.jobTitle,
        approvalStatus: profile.approvalStatus,
        signupType: profile.signupType ?? "individual",
        rejectionReason: profile.rejectionReason,
        createdAt: profile.createdAt,
        role: roleRow?.role ?? "individual",
        invitedToCompany: invitedCompany,
        onboarding: {
          currentStep: onboardingStep,
          currentStepName: isValidStep(onboardingStep)
            ? ONBOARDING_STEP_NAMES[onboardingStep]
            : "",
          completedAt: profile.onboardingCompletedAt,
          isComplete: !!profile.onboardingCompletedAt,
        },
      },
      companies: allCompanies,
      primaryCompanyId: primaryCompany?.id ?? null,
      adminPrepared: primaryCompany?.adminPreparedAt
        ? {
            at: primaryCompany.adminPreparedAt,
            by: primaryCompany.adminPreparedBy,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Clear the admin-prepared marker so approval runs the automatic AI prefill
 * again — the escape hatch when an admin wants to discard their curation.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    if (!(await checkSuperadminRole(user.id))) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    const { userId } = await params;
    await db
      .update(companies)
      .set({ adminPreparedAt: null, adminPreparedBy: null })
      .where(eq(companies.userId, userId));

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
