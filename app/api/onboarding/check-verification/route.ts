import { createApiClient, createAdminClient, apiResponse, apiError } from "@/lib/api";

/**
 * GET /api/onboarding/check-verification
 *
 * Checks if the current user's email is verified.
 * If verified, updates their onboarding step to 2 (profile info).
 *
 * Returns:
 * - verified: boolean - whether email is verified
 * - email: string - the user's email address (for display)
 * - nextStep: number - the next onboarding step (2 if verified, 1 if not)
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

    const isVerified = !!user.email_confirmed_at;

    // If verified, update onboarding step to 2 (if still on step 1)
    if (isVerified) {
      const adminClient = createAdminClient();

      // Only update if currently on step 1
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adminClient.from("profiles") as any)
        .update({ onboarding_step: 2 })
        .eq("user_id", user.id)
        .eq("onboarding_step", 1);
    }

    return apiResponse({
      verified: isVerified,
      email: user.email,
      nextStep: isVerified ? 2 : 1,
    });
  } catch (error) {
    console.error("Check verification error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
