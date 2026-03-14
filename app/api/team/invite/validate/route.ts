import { NextRequest } from "next/server";
import { apiResponse, getAuthenticatedUser } from "@/lib/api";
import { sanitizeHexToken, hashToken, isExpired } from "@/lib/utils/invite-token";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { teamInvitations, companies, profiles } from "@/lib/db/schema/app";
import { eq, ilike } from "drizzle-orm";

export interface ValidateInvitationRequest {
  token: string;
}

export interface ValidateInvitationResponse {
  valid: boolean;
  email?: string;
  companyName?: string;
  companyId?: string;
  inviterName?: string;
  expiresAt?: string;
  isExistingUser?: boolean;
  error?: string;
}

// POST - Validate an invitation token
export async function POST(request: NextRequest) {
  try {
    const body: ValidateInvitationRequest = await request.json();
    const { token } = body;

    if (!token) {
      return apiResponse<ValidateInvitationResponse>({
        valid: false,
        error: "Token is required",
      });
    }

    const safeToken = sanitizeHexToken(token);
    if (!safeToken) {
      return apiResponse<ValidateInvitationResponse>({
        valid: false,
        error: "Invalid invitation link",
      });
    }

    const tokenHash = hashToken(safeToken);

    // Find invitation by token hash
    const invitationResult = await db
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

    const invitation = invitationResult[0];
    if (!invitation) {
      return apiResponse<ValidateInvitationResponse>({
        valid: false,
        error: "Invalid invitation link",
      });
    }

    // Check if invitation is pending
    if (invitation.status !== "pending") {
      let errorMessage = "This invitation is no longer valid";
      if (invitation.status === "accepted") {
        errorMessage = "This invitation has already been used";
      } else if (invitation.status === "cancelled") {
        errorMessage = "This invitation has been cancelled";
      } else if (invitation.status === "expired") {
        errorMessage = "This invitation has expired";
      }

      return apiResponse<ValidateInvitationResponse>({
        valid: false,
        error: errorMessage,
      });
    }

    // Check if expired
    if (isExpired(invitation.expiresAt.toISOString())) {
      // Mark as expired in the database
      await db
        .update(teamInvitations)
        .set({ status: "expired" })
        .where(eq(teamInvitations.id, invitation.id));

      return apiResponse<ValidateInvitationResponse>({
        valid: false,
        error:
          "This invitation has expired. Please request a new invitation from your company admin.",
      });
    }

    // Get company details
    const companyResult = await db
      .select({ id: companies.id, companyName: companies.companyName })
      .from(companies)
      .where(eq(companies.id, invitation.companyId))
      .limit(1);

    const company = companyResult[0] ?? null;

    // Get inviter details
    const inviterResult = await db
      .select({ firstName: profiles.firstName, lastName: profiles.lastName })
      .from(profiles)
      .where(eq(profiles.userId, invitation.invitedBy))
      .limit(1);

    const inviterProfile = inviterResult[0] ?? null;
    const inviterName =
      `${inviterProfile?.firstName || ""} ${inviterProfile?.lastName || ""}`.trim() ||
      "Your colleague";

    // Check if user already exists
    const existingProfiles = await db
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(ilike(profiles.email, invitation.email));

    const isExistingUser = existingProfiles.length > 0;

    const { user } = await getAuthenticatedUser(request);
    const userId = user?.id;

    await logApiEvent(request, {
      actionType: "profile_viewed",
      userId: userId || undefined,
      entityType: "team_invitation",
      entityId: invitation.id,
      details: {
        company_id: invitation.companyId,
        is_existing_user: isExistingUser,
      },
    }).catch(() => {});

    return apiResponse<ValidateInvitationResponse>({
      valid: true,
      email: invitation.email,
      companyName: company?.companyName || "Unknown Company",
      companyId: invitation.companyId,
      inviterName,
      expiresAt: invitation.expiresAt.toISOString(),
      isExistingUser,
    });
  } catch (error) {
    console.error("Validate invitation error:", error);
    return apiResponse<ValidateInvitationResponse>({
      valid: false,
      error: "An error occurred while validating the invitation",
    });
  }
}
