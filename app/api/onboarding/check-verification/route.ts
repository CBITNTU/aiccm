import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/api";
import { requireAuth } from "@/lib/api/validation";
import { updateProfileByUserId } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { user as authUsersTable } from "@/lib/db/schema/auth";
import { eq } from "drizzle-orm";
import { ONBOARDING_STEPS } from "@/lib/onboarding";
import { logApiEvent } from "@/lib/services/eventLogger";

/**
 * GET /api/onboarding/check-verification
 *
 * Checks if the current user's email is verified via Better Auth.
 * If verified, updates their onboarding step to PROFILE_INFO via Drizzle.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const authUser = await db
      .select({
        emailVerified: authUsersTable.emailVerified,
      })
      .from(authUsersTable)
      .where(eq(authUsersTable.id, user.id))
      .limit(1);
    const isVerified = !!authUser[0]?.emailVerified;

    // If verified, update onboarding step to PROFILE_INFO (if still on EMAIL_VERIFICATION)
    if (isVerified) {
      await updateProfileByUserId(user.id, {
        onboardingStep: ONBOARDING_STEPS.PROFILE_INFO,
      });
    }

    await logApiEvent(request, {
      actionType: "onboarding_verification_checked",
      userId: user.id,
      userEmail: user.email,
      details: { verified: isVerified },
    }).catch(() => {});

    return apiResponse({
      verified: isVerified,
      email: user.email,
      nextStep: isVerified
        ? ONBOARDING_STEPS.PROFILE_INFO
        : ONBOARDING_STEPS.EMAIL_VERIFICATION,
    });
  } catch (error) {
    console.error("Check verification error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
