import { NextRequest } from "next/server";
import { after } from "next/server";
import { apiResponse, apiError } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { logApiEvent } from "@/lib/services/eventLogger";
import { getProfileByUserId, updateProfileByUserId } from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    const body = await request.json();
    const { firstName, lastName, jobTitle, phone } = body;

    // Validate required fields
    if (!firstName?.trim() || !lastName?.trim() || !jobTitle?.trim()) {
      return apiError("First name, last name, and job title are required", 400);
    }

    // Update the profile via Drizzle (local Postgres)
    const updated = await updateProfileByUserId(user.id, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      jobTitle: jobTitle.trim(),
      phone: phone?.trim() || null,
    });

    if (!updated) {
      console.error("Profile update error: no rows updated");
      after(() =>
        logApiEvent(request, {
          actionType: "profile_updated",
          userId: user.id,
          userEmail: user.email || undefined,
          status: "error",
          errorMessage: "No rows updated",
        }).catch(() => {}),
      );
      return apiError("Failed to update profile", 500);
    }

    // Log successful profile update (non-blocking)
    after(() =>
      logApiEvent(request, {
        actionType: "profile_updated",
        userId: user.id,
        userEmail: user.email || undefined,
        details: {
          fieldsUpdated: { firstName, lastName, jobTitle, phone: !!phone },
        },
      }).catch(() => {}),
    );

    return apiResponse({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    // Fetch the profile via Drizzle (local Postgres)
    const profile = await getProfileByUserId(user.id);

    if (!profile) {
      return apiError("Failed to fetch profile", 500);
    }

    return apiResponse({
      success: true,
      profile: {
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        jobTitle: profile.jobTitle || "",
        phone: profile.phone || "",
        email: profile.email || user.email || "",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
