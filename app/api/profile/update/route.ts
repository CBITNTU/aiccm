import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logApiEvent } from "@/lib/services/eventLogger";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { firstName, lastName, jobTitle, phone } = body;

    // Validate required fields
    if (!firstName?.trim() || !lastName?.trim() || !jobTitle?.trim()) {
      return NextResponse.json(
        { error: "First name, last name, and job title are required" },
        { status: 400 }
      );
    }

    // Update the profile
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        job_title: jobTitle.trim(),
        phone: phone?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Profile update error:", updateError);
      await logApiEvent(request, {
        actionType: "profile_updated",
        userId: user.id,
        userEmail: user.email || undefined,
        status: "error",
        errorMessage: updateError.message,
      });
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    // Log successful profile update
    await logApiEvent(request, {
      actionType: "profile_updated",
      userId: user.id,
      userEmail: user.email || undefined,
      details: {
        fieldsUpdated: { firstName, lastName, jobTitle, phone: !!phone },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = await createClient();

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Fetch the profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("first_name, last_name, job_title, phone, email")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      return NextResponse.json(
        { error: "Failed to fetch profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: {
        firstName: profile?.first_name || "",
        lastName: profile?.last_name || "",
        jobTitle: profile?.job_title || "",
        phone: profile?.phone || "",
        email: profile?.email || user.email || "",
      },
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
