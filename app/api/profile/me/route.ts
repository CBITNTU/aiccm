import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { getProfileByUserId } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    const profile = await getProfileByUserId(user.id);

    if (!profile) {
      throw new Error("Profile not found");
    }

    // Return shape matching what the frontend expects (snake_case keys)
    return apiResponse({
      approval_status: profile.approvalStatus,
      onboarding_completed_at: profile.onboardingCompletedAt?.toISOString() ?? null,
      first_name: profile.firstName,
      last_name: profile.lastName,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
