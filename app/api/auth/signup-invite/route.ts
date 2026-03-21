import { NextRequest } from "next/server";
import {
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
import { db } from "@/lib/db";
import {
  teamInvitations,
  profiles,
  companies,
  companyMembers,
  userRoles,
} from "@/lib/db/schema/app";
import { eq, and, inArray } from "drizzle-orm";

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

    // Find and validate invitation
    const invitationRows = await db
      .select({
        id: teamInvitations.id,
        email: teamInvitations.email,
        companyId: teamInvitations.companyId,
        invitedBy: teamInvitations.invitedBy,
        status: teamInvitations.status,
        expiresAt: teamInvitations.expiresAt,
      })
      .from(teamInvitations)
      .where(eq(teamInvitations.tokenHash, tokenHash))
      .limit(1);

    const invitation = invitationRows[0];
    if (!invitation) {
      return apiError("Invalid invitation link", 400);
    }

    if (invitation.status !== "pending") {
      return apiError("This invitation is no longer valid", 400);
    }

    if (isExpired(invitation.expiresAt)) {
      await db
        .update(teamInvitations)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(teamInvitations.id, invitation.id));
      return apiError("This invitation has expired", 400);
    }

    // Check if email already exists in profiles
    const existingProfileRows = await db
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(eq(profiles.email, invitation.email))
      .limit(1);

    if (existingProfileRows.length > 0) {
      return apiError(
        "An account with this email already exists. Please use the 'Accept Invitation' option instead.",
        400,
      );
    }

    // Get company details
    const companyRows = await db
      .select({ id: companies.id, companyName: companies.companyName })
      .from(companies)
      .where(eq(companies.id, invitation.companyId))
      .limit(1);

    const company = companyRows[0];
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
      invitedToCompanyId: invitation.companyId,
      onboardingStep: 2, // Start at PROFILE_INFO step (skip email verification)
    });

    // Assign sme-member role
    await createUserRole(userId, "sme-member");

    // Create pending company_members entry (will be approved by superadmin)
    await createCompanyMember({
      companyId: invitation.companyId,
      userId,
      role: "member",
      status: "pending",
      invitedBy: invitation.invitedBy,
    });

    // Mark invitation as accepted
    await acceptTeamInvitation(invitation.id, userId);

    // Notify superadmins about new invited user signup
    const superadminRows = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.role, "superadmin"));

    if (superadminRows.length > 0) {
      const superadminUserIds = superadminRows.map((s) => s.userId);
      const superadminProfiles = await db
        .select({ email: profiles.email })
        .from(profiles)
        .where(inArray(profiles.userId, superadminUserIds));

      const adminEmails = superadminProfiles
        .map((p) => p.email)
        .filter(Boolean) as string[];

      if (adminEmails.length > 0) {
        const adminNotificationData = {
          userName: invitation.email,
          userEmail: invitation.email,
          signupType: "invited" as const,
          companyName: company.companyName,
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
      entityId: invitation.companyId,
      details: { company_name: company.companyName },
    }).catch(() => {});

    return apiResponse<SignupInviteResponse>({
      success: true,
      message: `Your account has been created. You will be able to access ${company.companyName} once approved by the platform administrator.`,
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

    // Find and validate invitation
    const invitationRows = await db
      .select({
        id: teamInvitations.id,
        email: teamInvitations.email,
        companyId: teamInvitations.companyId,
        invitedBy: teamInvitations.invitedBy,
        status: teamInvitations.status,
        expiresAt: teamInvitations.expiresAt,
      })
      .from(teamInvitations)
      .where(eq(teamInvitations.tokenHash, tokenHash))
      .limit(1);

    const invitation = invitationRows[0];
    if (!invitation) {
      return apiError("Invalid invitation link", 400);
    }

    if (invitation.status !== "pending") {
      return apiError("This invitation is no longer valid", 400);
    }

    if (isExpired(invitation.expiresAt)) {
      await db
        .update(teamInvitations)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(teamInvitations.id, invitation.id));
      return apiError("This invitation has expired", 400);
    }

    // Get user's email from profile
    const profileRows = await db
      .select({ email: profiles.email })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    const profileData = profileRows[0];
    if (profileData?.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return apiError(
        "This invitation was sent to a different email address. Please use the correct account.",
        403,
      );
    }

    // Get company details
    const companyRows = await db
      .select({ id: companies.id, companyName: companies.companyName })
      .from(companies)
      .where(eq(companies.id, invitation.companyId))
      .limit(1);

    const company = companyRows[0];
    if (!company) {
      return apiError("Company not found", 404);
    }

    // Check if already a member
    const existingMembershipRows = await db
      .select({ id: companyMembers.id, status: companyMembers.status })
      .from(companyMembers)
      .where(
        and(
          eq(companyMembers.companyId, invitation.companyId),
          eq(companyMembers.userId, user.id),
        ),
      )
      .limit(1);

    const existingMembership = existingMembershipRows[0];
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
      companyId: invitation.companyId,
      userId: user.id,
      role: "member",
      status: "pending",
      invitedBy: invitation.invitedBy,
    });

    // Update profile via drizzle
    await updateProfileByUserId(user.id, {
      invitedToCompanyId: invitation.companyId,
      signupType: "invited",
      onboardingStep: 4,
      onboardingCompletedAt: null,
    });

    // Mark invitation as accepted
    await acceptTeamInvitation(invitation.id, user.id);

    // Get user's name for notification
    const userProfileRows = await db
      .select({ firstName: profiles.firstName, lastName: profiles.lastName, jobTitle: profiles.jobTitle })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    const userProfile = userProfileRows[0];
    const userName =
      `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim() ||
      "User";

    // Notify superadmins
    const superadminRows = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.role, "superadmin"));

    if (superadminRows.length > 0) {
      const superadminUserIds = superadminRows.map((s) => s.userId);
      const superadminProfiles = await db
        .select({ email: profiles.email })
        .from(profiles)
        .where(inArray(profiles.userId, superadminUserIds));

      const adminEmails = superadminProfiles
        .map((p) => p.email)
        .filter(Boolean) as string[];

      if (adminEmails.length > 0) {
        const adminNotificationData = {
          userName,
          userEmail: invitation.email,
          signupType: "invited" as const,
          companyName: company.companyName,
          jobTitle: userProfile?.jobTitle || undefined,
        };

        await sendEmail({
          to: adminEmails,
          subject: `[Pending] ${userName} accepted invitation to join ${company.companyName}`,
          html: getAdminNotificationEmailHtml(adminNotificationData),
        });
      }
    }

    await logApiEvent(request, {
      actionType: "user_signup_invite",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "company",
      entityId: invitation.companyId,
      details: { company_name: company.companyName, existing_user: true },
    }).catch(() => {});

    return apiResponse<AcceptInviteResponse>({
      success: true,
      message: `You have accepted the invitation to join ${company.companyName}. Awaiting platform administrator approval.`,
      requiresApproval: true,
    });
  } catch (error) {
    console.error("Accept invite error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
