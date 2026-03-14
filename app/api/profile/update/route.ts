import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { logApiEvent } from "@/lib/services/eventLogger";
import { getProfileByUserId, updateProfileByUserId } from "@/lib/db/queries";
import { requireAuth } from "@/lib/api/validation";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    const body = await request.json();
    const { firstName, lastName, jobTitle, phone } = body;

    // Validate required fields
    if (!firstName?.trim() || !lastName?.trim() || !jobTitle?.trim()) {
      return NextResponse.json(
        { error: "First name, last name, and job title are required" },
        { status: 400 },
      );
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
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 },
      );
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

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    // Fetch the profile via Drizzle (local Postgres)
    const profile = await getProfileByUserId(user.id);

    if (!profile) {
      return NextResponse.json(
        { error: "Failed to fetch profile" },
        { status: 500 },
      );
    }

    return NextResponse.json({
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
    console.error("Profile fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
