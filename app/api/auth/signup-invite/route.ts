import { NextRequest } from "next/server";
import {
  createAdminClient,
  apiResponse,
  apiError,
  getAuthenticatedUser,
} from "@/lib/api";
import { auth } from "@/lib/auth";
import {
  createProfile,
  createUserRole,
  updateProfileByUserId,
  createCompanyMember,
  acceptTeamInvitation,
} from "@/lib/db/queries";
import {
  sendEmail,
  getAdminNotificationEmailSubject,
  getAdminNotificationEmailHtml,
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

    if (!token || !password) {
      return apiError("Missing required fields", 400);
    }

    const safeToken = sanitizeHexToken(token);
    if (!safeToken) {
      return apiError("Invalid invitation link", 400);
    }

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
    // Use Supabase admin client for data queries (team_invitations, companies, etc.)
    const supabase = createAdminClient();

    // Find and validate invitation
    const { data: invitation, error: inviteError } = await supabase
      .from("team_invitations")
      .select(`id, email, company_id, invited_by, status, expires_at`)
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

    // Check if email already exists in profiles
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

    // Create auth user via Better Auth
    const result = await auth.api.signUpEmail({
      body: {
        email: invitation.email,
        password,
        name: invitation.email.split("@")[0],
      },
    });

    if (!result?.user) {
      return apiError("Failed to create user", 500);
    }

    const userId = result.user.id;

    // Create profile via Drizzle with invited-specific settings
    await createProfile(userId, invitation.email);
    await updateProfileByUserId(userId, {
      signupType: "invited",
      invitedToCompanyId: invitation.company_id,
      onboardingStep: 2, // Start at PROFILE_INFO step (skip email verification)
    });

    // Assign sme-member role
    await createUserRole(userId, "sme-member");

    // Create pending company_members entry (will be approved by superadmin)
    await createCompanyMember({
      companyId: invitation.company_id,
      userId,
      role: "member",
      status: "pending",
      invitedBy: invitation.invited_by,
    });

    // Mark invitation as accepted
    await acceptTeamInvitation(invitation.id, userId);

    // Notify superadmins about new invited user signup
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
          userName: invitation.email,
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

    if (message.includes("already") || message.includes("exists")) {
      return apiError(
        "An account with this email already exists. Please use the 'Accept Invitation' option instead.",
        400,
      );
    }

    return apiError(message, 500);
  }
}

// PUT - Accept invitation for existing user
export async function PUT(request: NextRequest) {
  try {
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
      .select(`id, email, company_id, invited_by, status, expires_at`)
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

    // Get user's email from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("user_id", user.id)
      .single();

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
    await createCompanyMember({
      companyId: invitation.company_id,
      userId: user.id,
      role: "member",
      status: "pending",
      invitedBy: invitation.invited_by,
    });

    // Update profile via drizzle
    await updateProfileByUserId(user.id, {
      invitedToCompanyId: invitation.company_id,
      signupType: "invited",
      onboardingStep: 4,
      onboardingCompletedAt: null,
    });

    // Mark invitation as accepted
    await acceptTeamInvitation(invitation.id, user.id);

    // Get user's name for notification
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("first_name, last_name, job_title")
      .eq("user_id", user.id)
      .single();

    const userName =
      `${userProfile?.first_name || ""} ${userProfile?.last_name || ""}`.trim() ||
      "User";

    // Notify superadmins
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
