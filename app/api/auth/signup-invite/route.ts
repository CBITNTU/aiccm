import { NextRequest } from "next/server";
import {
  createAdminClient,
  apiResponse,
  apiError,
  getAuthenticatedUser,
} from "@/lib/api";
import {
  sendEmail,
  getAdminNotificationEmailSubject,
  getAdminNotificationEmailHtml,
  getPlatformUrl,
} from "@/lib/email";
import { sanitizeHexToken, hashToken, isExpired } from "@/lib/utils/invite-token";
import { logApiEvent } from "@/lib/services/eventLogger";

export interface SignupInviteRequest {
  token: string;
  password: string;
}

export interface SignupInviteResponse {
  success: boolean;
  message: string;
  requiresApproval: boolean;
}

export interface AcceptInviteRequest {
  token: string;
}

export interface AcceptInviteResponse {
  success: boolean;
  message: string;
  requiresApproval: boolean;
}

// POST - Complete signup for invited user (new users)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, password } = body as SignupInviteRequest;

    // Validate required fields
    if (!token || !password) {
      return apiError("Missing required fields", 400);
    }

    const safeToken = sanitizeHexToken(token);
    if (!safeToken) {
      return apiError("Invalid invitation link", 400);
    }

    // Prevent bcrypt DoS and null-byte attacks
    if (password.length < 6) {
      return apiError("Password must be at least 6 characters", 400);
    }
    if (password.length > 128) {
      return apiError("Password must be between 6 and 128 characters", 400);
    }
    if (password.includes("\0")) {
      return apiError("Invalid password", 400);
    }

    const tokenHash = hashToken(safeToken);
    const supabase = createAdminClient();

    // Find and validate invitation
    const { data: invitation, error: inviteError } = await supabase
      .from("team_invitations")
      .select(
        `
        id,
        email,
        company_id,
        invited_by,
        status,
        expires_at
      `,
      )
      .eq("token_hash", tokenHash)
      .single();

    if (inviteError || !invitation) {
      return apiError("Invalid invitation link", 400);
    }

    if (invitation.status !== "pending") {
      return apiError("This invitation is no longer valid", 400);
    }

    if (isExpired(invitation.expires_at)) {
      await supabase
        .from("team_invitations")
        .update({ status: "expired" })
        .eq("id", invitation.id);
      return apiError("This invitation has expired", 400);
    }

    // Check if email already exists
    const { data: existingProfiles } = await supabase
      .from("profiles")
      .select("user_id")
      .ilike("email", invitation.email);

    if (existingProfiles && existingProfiles.length > 0) {
      return apiError(
        "An account with this email already exists. Please use the 'Accept Invitation' option instead.",
        400,
      );
    }

    // Get company details
    const { data: company } = await supabase
      .from("companies")
      .select("id, company_name")
      .eq("id", invitation.company_id)
      .single();

    if (!company) {
      return apiError("Company not found", 404);
    }

    // Create auth user with Supabase Admin API
    // We use generateLink to create the user but won't send verification email
    // because being invited means the email is already verified
    const { data: linkData, error: authError } =
      await supabase.auth.admin.generateLink({
        type: "signup",
        email: invitation.email,
        password,
        options: {
          redirectTo: getPlatformUrl("/auth/callback"),
        },
      });

    if (authError) {
      console.error("Auth user creation error:", authError);
      if (authError.message.includes("already been registered")) {
        return apiError(
          "An account with this email already exists. Please use the 'Accept Invitation' option instead.",
          400,
        );
      }
      return apiError(authError.message, 400);
    }

    if (!linkData?.user) {
      return apiError("Failed to create user", 500);
    }

    const userId = linkData.user.id;

    // Immediately confirm email (since they used invite link)
    const { error: confirmError } = await supabase.auth.admin.updateUserById(
      userId,
      { email_confirm: true },
    );

    if (confirmError) {
      console.error("Failed to confirm email:", confirmError);
      // Continue anyway - not critical
    }

    // Update profile with invited_to_company_id, signup_type, and onboarding_step
    // The database trigger creates the profile, so we need to update it
    // Wait a moment to ensure trigger has completed
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("Updating profile for invited user:", {
      userId,
      email: invitation.email,
      company_id: invitation.company_id,
    });

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .update({
        signup_type: "invited",
        invited_to_company_id: invitation.company_id,
        onboarding_step: 2, // Start at PROFILE_INFO step (skip email verification)
      })
      .eq("user_id", userId)
      .select();

    console.log("Profile update result:", { profileData, profileError });

    if (profileError) {
      console.error("Failed to update profile:", profileError);
    }

    // Verify the update worked
    if (!profileData || profileData.length === 0) {
      console.error(
        "Profile update returned no data - profile may not exist yet",
      );
      // Try one more time after a longer delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const { data: retryData, error: retryError } = await supabase
        .from("profiles")
        .update({
          signup_type: "invited",
          invited_to_company_id: invitation.company_id,
          onboarding_step: 2, // Start at PROFILE_INFO step (skip email verification)
        })
        .eq("user_id", userId)
        .select();
      console.log("Profile update retry result:", { retryData, retryError });
    }

    // Assign sme-member role
    await supabase.from("user_roles").upsert(
      {
        user_id: userId,
        role: "sme-member",
      },
      {
        onConflict: "user_id,role",
      },
    );

    // Remove individual role if exists
    await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "individual");

    // Create pending company_members entry (will be approved by superadmin)
    await supabase.from("company_members").insert({
      company_id: invitation.company_id,
      user_id: userId,
      role: "member",
      status: "pending",
      invited_by: invitation.invited_by,
    });

    // Mark invitation as accepted
    await supabase
      .from("team_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_by: userId,
      })
      .eq("id", invitation.id);

    // Notify superadmins about new invited user signup
    // Note: Name and job title will be collected during onboarding
    const { data: superadmins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "superadmin");

    if (superadmins && superadmins.length > 0) {
      const superadminUserIds = superadmins.map((s) => s.user_id);
      const { data: superadminProfiles } = await supabase
        .from("profiles")
        .select("email")
        .in("user_id", superadminUserIds);

      const adminEmails = (superadminProfiles || [])
        .map((p) => p.email)
        .filter(Boolean) as string[];

      if (adminEmails.length > 0) {
        const adminNotificationData = {
          userName: invitation.email, // Name will be collected during onboarding
          userEmail: invitation.email,
          signupType: "invited" as const,
          companyName: company.company_name,
        };

        await sendEmail({
          to: adminEmails,
          subject: getAdminNotificationEmailSubject(adminNotificationData),
          html: getAdminNotificationEmailHtml(adminNotificationData),
        });
      }
    }

    await logApiEvent(request, {
      actionType: "user_signup_invite",
      userId,
      userEmail: invitation.email,
      entityType: "company",
      entityId: invitation.company_id,
      details: { company_name: company.company_name },
    }).catch(() => {});

    return apiResponse<SignupInviteResponse>({
      success: true,
      message: `Your account has been created. You will be able to access ${company.company_name} once approved by the platform administrator.`,
      requiresApproval: true,
    });
  } catch (error) {
    console.error("Signup invite error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}

// PUT - Accept invitation for existing user
export async function PUT(request: NextRequest) {
  try {
    // Check authentication - existing user must be logged in
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(authError || "Unauthorized. Please log in first.", 401);
    }

    const body: AcceptInviteRequest = await request.json();
    const { token } = body;

    if (!token) {
      return apiError("Token is required", 400);
    }

    const safeToken = sanitizeHexToken(token);
    if (!safeToken) {
      return apiError("Invalid invitation link", 400);
    }

    const tokenHash = hashToken(safeToken);
    const supabase = createAdminClient();

    // Find and validate invitation
    const { data: invitation, error: inviteError } = await supabase
      .from("team_invitations")
      .select(
        `
        id,
        email,
        company_id,
        invited_by,
        status,
        expires_at
      `,
      )
      .eq("token_hash", tokenHash)
      .single();

    if (inviteError || !invitation) {
      return apiError("Invalid invitation link", 400);
    }

    if (invitation.status !== "pending") {
      return apiError("This invitation is no longer valid", 400);
    }

    if (isExpired(invitation.expires_at)) {
      await supabase
        .from("team_invitations")
        .update({ status: "expired" })
        .eq("id", invitation.id);
      return apiError("This invitation has expired", 400);
    }

    // Get user's email
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("user_id", user.id)
      .single();

    // Verify the invitation is for this user's email
    if (profile?.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return apiError(
        "This invitation was sent to a different email address. Please use the correct account.",
        403,
      );
    }

    // Get company details
    const { data: company } = await supabase
      .from("companies")
      .select("id, company_name")
      .eq("id", invitation.company_id)
      .single();

    if (!company) {
      return apiError("Company not found", 404);
    }

    // Check if already a member
    const { data: existingMembership } = await supabase
      .from("company_members")
      .select("id, status")
      .eq("company_id", invitation.company_id)
      .eq("user_id", user.id)
      .single();

    if (existingMembership) {
      if (existingMembership.status === "approved") {
        return apiError("You are already a member of this company", 400);
      } else if (existingMembership.status === "pending") {
        return apiError(
          "You already have a pending membership for this company",
          400,
        );
      }
    }

    // Create pending company_members entry
    await supabase.from("company_members").insert({
      company_id: invitation.company_id,
      user_id: user.id,
      role: "member",
      status: "pending",
      invited_by: invitation.invited_by,
    });

    // Update profile to track invited company and show confirmation step
    // Set onboarding_step to 4 (COMPANY_INFO) to show the invited company confirmation
    // Set signup_type to "invited" so onboarding knows to show confirmation flow
    await supabase
      .from("profiles")
      .update({
        invited_to_company_id: invitation.company_id,
        signup_type: "invited",
        onboarding_step: 4, // Show confirmation step
        onboarding_completed_at: null, // Reset so onboarding flow is triggered
      })
      .eq("user_id", user.id);

    // Mark invitation as accepted
    await supabase
      .from("team_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_by: user.id,
      })
      .eq("id", invitation.id);

    // Get user's name for notification
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("first_name, last_name, job_title")
      .eq("user_id", user.id)
      .single();

    const userName =
      `${userProfile?.first_name || ""} ${userProfile?.last_name || ""}`.trim() ||
      "User";

    // Notify superadmins about existing user accepting invitation
    const { data: superadmins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "superadmin");

    if (superadmins && superadmins.length > 0) {
      const superadminUserIds = superadmins.map((s) => s.user_id);
      const { data: superadminProfiles } = await supabase
        .from("profiles")
        .select("email")
        .in("user_id", superadminUserIds);

      const adminEmails = (superadminProfiles || [])
        .map((p) => p.email)
        .filter(Boolean) as string[];

      if (adminEmails.length > 0) {
        const adminNotificationData = {
          userName,
          userEmail: invitation.email,
          signupType: "invited" as const,
          companyName: company.company_name,
          jobTitle: userProfile?.job_title || undefined,
        };

        await sendEmail({
          to: adminEmails,
          subject: `[Pending] ${userName} accepted invitation to join ${company.company_name}`,
          html: getAdminNotificationEmailHtml(adminNotificationData),
        });
      }
    }

    await logApiEvent(request, {
      actionType: "user_signup_invite",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "company",
      entityId: invitation.company_id,
      details: { company_name: company.company_name, existing_user: true },
    }).catch(() => {});

    return apiResponse<AcceptInviteResponse>({
      success: true,
      message: `You have accepted the invitation to join ${company.company_name}. Awaiting platform administrator approval.`,
      requiresApproval: true,
    });
  } catch (error) {
    console.error("Accept invite error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
