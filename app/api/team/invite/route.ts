import { NextRequest } from "next/server";
import { apiResponse, apiError, getAuthenticatedUser } from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import {
  sendEmail,
  getTeamInvitationEmailSubject,
  getTeamInvitationEmailHtml,
  getPlatformUrl,
} from "@/lib/email";
import {
  generateInviteToken,
  hashToken,
  getInviteExpiryDate,
  isExpired,
} from "@/lib/utils/invite-token";
import { createTeamInvitation } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { companyMembers, companies, profiles, teamInvitations } from "@/lib/db/schema/app";
import { eq, and, ilike, desc } from "drizzle-orm";

export interface CreateInvitationRequest {
  companyId: string;
  email: string;
}

export interface CreateInvitationResponse {
  success: boolean;
  message: string;
  invitationId?: string;
}

// POST - Create a new invitation
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(authError || "Unauthorized", 401);
    }

    const body: CreateInvitationRequest = await request.json();
    const { companyId, email } = body;

    if (!companyId || !email) {
      return apiError("Company ID and email are required", 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return apiError("Invalid email format", 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user is admin of this company
    const membershipResult = await db
      .select({ role: companyMembers.role, status: companyMembers.status })
      .from(companyMembers)
      .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, user.id)))
      .limit(1);

    const membership = membershipResult[0];
    if (!membership || membership.role !== "admin" || membership.status !== "approved") {
      return apiError("You are not an admin of this company", 403);
    }

    // Get company details
    const companyResult = await db
      .select({ id: companies.id, companyName: companies.companyName })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const company = companyResult[0];
    if (!company) {
      return apiError("Company not found", 404);
    }

    // Check if inviting self
    const inviterProfileResult = await db
      .select({ email: profiles.email, firstName: profiles.firstName, lastName: profiles.lastName })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    const inviterProfile = inviterProfileResult[0] ?? null;

    if (inviterProfile?.email?.toLowerCase() === normalizedEmail) {
      return apiError("You cannot invite yourself", 400);
    }

    // Check if email is already a member of this company
    const existingProfiles = await db
      .select({ userId: profiles.userId, email: profiles.email })
      .from(profiles)
      .where(ilike(profiles.email, normalizedEmail));

    if (existingProfiles.length > 0) {
      const existingUserId = existingProfiles[0].userId;

      const existingMembershipResult = await db
        .select({ id: companyMembers.id, status: companyMembers.status })
        .from(companyMembers)
        .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, existingUserId)))
        .limit(1);

      const existingMembership = existingMembershipResult[0];
      if (existingMembership) {
        if (existingMembership.status === "approved") {
          return apiError("This person is already a member of your company", 400);
        } else if (existingMembership.status === "pending") {
          return apiError("This person already has a pending membership", 400);
        }
      }
    }

    // Check if there's already a pending invitation for this email
    const existingInvitationResult = await db
      .select({
        id: teamInvitations.id,
        status: teamInvitations.status,
        expiresAt: teamInvitations.expiresAt,
      })
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.companyId, companyId),
          ilike(teamInvitations.email, normalizedEmail),
          eq(teamInvitations.status, "pending"),
        ),
      )
      .limit(1);

    const existingInvitation = existingInvitationResult[0];
    if (existingInvitation) {
      if (isExpired(existingInvitation.expiresAt.toISOString())) {
        await db
          .update(teamInvitations)
          .set({ status: "expired" })
          .where(eq(teamInvitations.id, existingInvitation.id));
      } else {
        return apiError("An invitation has already been sent to this email", 400);
      }
    }

    // Generate token
    const token = generateInviteToken();
    const tokenHash = hashToken(token);
    const expiresAt = getInviteExpiryDate(7);

    // Create invitation
    let invitation;
    try {
      invitation = await createTeamInvitation({
        companyId,
        email: normalizedEmail,
        tokenHash,
        invitedBy: user.id,
        status: "pending",
        expiresAt,
      });
    } catch (err) {
      console.error("Error creating invitation:", err);
      return apiError("Failed to create invitation", 500);
    }

    // Build invite link
    const inviteLink = getPlatformUrl(`/auth/invite?token=${token}`);

    const inviterName =
      `${inviterProfile?.firstName || ""} ${inviterProfile?.lastName || ""}`.trim() ||
      "Your colleague";

    // Send invitation email
    const emailData = {
      inviteeEmail: normalizedEmail,
      inviterName,
      companyName: company.companyName,
      inviteLink,
      expiresAt,
    };

    await sendEmail({
      to: normalizedEmail,
      subject: getTeamInvitationEmailSubject(emailData),
      html: getTeamInvitationEmailHtml(emailData),
    });

    await logApiEvent(request, {
      actionType: "company_member_invited",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "company",
      entityId: companyId,
      details: {
        invitationId: invitation.id,
        inviteeEmail: normalizedEmail,
        companyName: company.companyName,
      },
    });

    return apiResponse<CreateInvitationResponse>({
      success: true,
      message: `Invitation sent to ${normalizedEmail}`,
      invitationId: invitation.id,
    });
  } catch (error) {
    console.error("Create invitation error:", error);
    return apiError("Internal server error", 500);
  }
}

// GET - List invitations for a company
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(authError || "Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return apiError("Company ID is required", 400);
    }

    // Check if user is admin of this company
    const membershipResult = await db
      .select({ role: companyMembers.role, status: companyMembers.status })
      .from(companyMembers)
      .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, user.id)))
      .limit(1);

    const membership = membershipResult[0];
    if (!membership || membership.role !== "admin" || membership.status !== "approved") {
      return apiError("You are not an admin of this company", 403);
    }

    // Get invitations
    const invitations = await db
      .select({
        id: teamInvitations.id,
        email: teamInvitations.email,
        status: teamInvitations.status,
        expiresAt: teamInvitations.expiresAt,
        createdAt: teamInvitations.createdAt,
        invitedBy: teamInvitations.invitedBy,
      })
      .from(teamInvitations)
      .where(eq(teamInvitations.companyId, companyId))
      .orderBy(desc(teamInvitations.createdAt));

    // Mark expired invitations
    const now = new Date();
    const enrichedInvitations = invitations.map((inv) => {
      const expired = inv.expiresAt < now;
      return {
        ...inv,
        status: inv.status === "pending" && expired ? "expired" : inv.status,
      };
    });

    return apiResponse({ invitations: enrichedInvitations });
  } catch (error) {
    console.error("Get invitations error:", error);
    return apiError("Internal server error", 500);
  }
}

// DELETE - Cancel a pending invitation
export async function DELETE(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(authError || "Unauthorized", 401);
    }

    const body = await request.json();
    const { invitationId } = body;

    if (!invitationId) {
      return apiError("Invitation ID is required", 400);
    }

    // Get invitation
    const invitationResult = await db
      .select({
        id: teamInvitations.id,
        companyId: teamInvitations.companyId,
        status: teamInvitations.status,
      })
      .from(teamInvitations)
      .where(eq(teamInvitations.id, invitationId))
      .limit(1);

    const invitation = invitationResult[0];
    if (!invitation) {
      return apiError("Invitation not found", 404);
    }

    // Check if user is admin of this company
    const membershipResult = await db
      .select({ role: companyMembers.role, status: companyMembers.status })
      .from(companyMembers)
      .where(
        and(
          eq(companyMembers.companyId, invitation.companyId),
          eq(companyMembers.userId, user.id),
        ),
      )
      .limit(1);

    const membership = membershipResult[0];
    if (!membership || membership.role !== "admin" || membership.status !== "approved") {
      return apiError("You are not an admin of this company", 403);
    }

    // Can only cancel pending invitations
    if (invitation.status !== "pending") {
      return apiError(`Cannot cancel a ${invitation.status} invitation`, 400);
    }

    // Update invitation status
    await db
      .update(teamInvitations)
      .set({ status: "cancelled" })
      .where(eq(teamInvitations.id, invitationId));

    return apiResponse({ success: true, message: "Invitation cancelled" });
  } catch (error) {
    console.error("Cancel invitation error:", error);
    return apiError("Internal server error", 500);
  }
}
