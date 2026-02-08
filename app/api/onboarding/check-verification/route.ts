import { NextRequest } from "next/server";
import {
  createApiClient,
  createAdminClient,
  apiResponse,
  apiError,
} from "@/lib/api";
import { ONBOARDING_STEPS } from "@/lib/onboarding";
import { logApiEvent } from "@/lib/services/eventLogger";

/**
 * GET /api/onboarding/check-verification
 *
 * Checks if the current user's email is verified.
 * If verified, updates their onboarding step to PROFILE_INFO.
 *
 * Returns:
 * - verified: boolean - whether email is verified
 * - email: string - the user's email address (for display)
 * - nextStep: number - the next onboarding step
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createApiClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return apiError("Unauthorized", 401);
    }

    const isVerified = !!user.email_confirmed_at;

    // If verified, update onboarding step to PROFILE_INFO (if still on EMAIL_VERIFICATION)
    if (isVerified) {
      const adminClient = createAdminClient();

      // Only update if currently on EMAIL_VERIFICATION step
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adminClient.from("profiles") as any)
        .update({ onboarding_step: ONBOARDING_STEPS.PROFILE_INFO })
        .eq("user_id", user.id)
        .eq("onboarding_step", ONBOARDING_STEPS.EMAIL_VERIFICATION);
    }

    await logApiEvent(request, {
      actionType: "onboarding_verification_checked",
      userId: user.id,
      userEmail: user.email || undefined,
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
