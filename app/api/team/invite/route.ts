import { NextRequest } from "next/server";
import {
  createAdminClient,
  apiResponse,
  apiError,
  getAuthenticatedUser,
} from "@/lib/api";
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
    // Check authentication
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(authError || "Unauthorized", 401);
    }

    const body: CreateInvitationRequest = await request.json();
    const { companyId, email } = body;

    if (!companyId || !email) {
      return apiError("Company ID and email are required", 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return apiError("Invalid email format", 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    const supabase = createAdminClient();

    // Check if user is SME owner
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "sme-owner")
      .single();

    if (!userRole) {
      return apiError("Only SME owners can invite team members", 403);
    }

    // Check if user is admin of this company
    const { data: membership } = await supabase
      .from("company_members")
      .select("role, status")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .single();

    if (
      !membership ||
      membership.role !== "admin" ||
      membership.status !== "approved"
    ) {
      return apiError("You are not an admin of this company", 403);
    }

    // Get company details
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, company_name")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return apiError("Company not found", 404);
    }

    // Check if inviting self
    const { data: inviterProfile } = await supabase
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("user_id", user.id)
      .single();

    if (inviterProfile?.email?.toLowerCase() === normalizedEmail) {
      return apiError("You cannot invite yourself", 400);
    }

    // Check if email is already a member of this company
    const { data: existingProfiles } = await supabase
      .from("profiles")
      .select("user_id, email")
      .ilike("email", normalizedEmail);

    if (existingProfiles && existingProfiles.length > 0) {
      const existingUserId = existingProfiles[0].user_id;

      // Check if already a member
      const { data: existingMembership } = await supabase
        .from("company_members")
        .select("id, status")
        .eq("company_id", companyId)
        .eq("user_id", existingUserId)
        .single();

      if (existingMembership) {
        if (existingMembership.status === "approved") {
          return apiError(
            "This person is already a member of your company",
            400,
          );
        } else if (existingMembership.status === "pending") {
          return apiError("This person already has a pending membership", 400);
        }
      }
    }

    // Check if there's already a pending invitation for this email
    const { data: existingInvitation } = await supabase
      .from("team_invitations")
      .select("id, status, expires_at")
      .eq("company_id", companyId)
      .ilike("email", normalizedEmail)
      .eq("status", "pending")
      .single();

    if (existingInvitation) {
      // Check if expired, if so we can update it
      if (isExpired(existingInvitation.expires_at)) {
        // Mark as expired and continue to create a new one
        await supabase
          .from("team_invitations")
          .update({ status: "expired" })
          .eq("id", existingInvitation.id);
      } else {
        return apiError(
          "An invitation has already been sent to this email",
          400,
        );
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

    // Get inviter name
    const inviterName =
      `${inviterProfile?.first_name || ""} ${inviterProfile?.last_name || ""}`.trim() ||
      "Your colleague";

    // Send invitation email
    const emailData = {
      inviteeEmail: normalizedEmail,
      inviterName,
      companyName: company.company_name,
      inviteLink,
      expiresAt,
    };

    await sendEmail({
      to: normalizedEmail,
      subject: getTeamInvitationEmailSubject(emailData),
      html: getTeamInvitationEmailHtml(emailData),
    });

    // Log invitation event
    await logApiEvent(request, {
      actionType: "company_member_invited",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "company",
      entityId: companyId,
      details: {
        invitationId: invitation.id,
        inviteeEmail: normalizedEmail,
        companyName: company.company_name,
      },
    });

    return apiResponse<CreateInvitationResponse>({
      success: true,
      message: `Invitation sent to ${normalizedEmail}`,
      invitationId: invitation.id,
    });
  } catch (error) {
    console.error("Create invitation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}

// GET - List invitations for a company
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(authError || "Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return apiError("Company ID is required", 400);
    }

    const supabase = createAdminClient();

    // Check if user is SME owner
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "sme-owner")
      .single();

    if (!userRole) {
      return apiError("Only SME owners can view invitations", 403);
    }

    // Check if user is admin of this company
    const { data: membership } = await supabase
      .from("company_members")
      .select("role, status")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .single();

    if (
      !membership ||
      membership.role !== "admin" ||
      membership.status !== "approved"
    ) {
      return apiError("You are not an admin of this company", 403);
    }

    // Get invitations
    const { data: invitations, error: invitationsError } = await supabase
      .from("team_invitations")
      .select(
        `
        id,
        email,
        status,
        expires_at,
        created_at,
        invited_by
      `,
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (invitationsError) {
      console.error("Error fetching invitations:", invitationsError);
      return apiError("Failed to fetch invitations", 500);
    }

    // Mark expired invitations
    const now = new Date();
    const enrichedInvitations = (invitations || []).map((inv) => {
      const expired = new Date(inv.expires_at) < now;
      return {
        ...inv,
        status: inv.status === "pending" && expired ? "expired" : inv.status,
      };
    });

    return apiResponse({ invitations: enrichedInvitations });
  } catch (error) {
    console.error("Get invitations error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}

// DELETE - Cancel a pending invitation
export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(authError || "Unauthorized", 401);
    }

    const body = await request.json();
    const { invitationId } = body;

    if (!invitationId) {
      return apiError("Invitation ID is required", 400);
    }

    const supabase = createAdminClient();

    // Get invitation
    const { data: invitation, error: inviteError } = await supabase
      .from("team_invitations")
      .select("id, company_id, status")
      .eq("id", invitationId)
      .single();

    if (inviteError || !invitation) {
      return apiError("Invitation not found", 404);
    }

    // Check if user is SME owner
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "sme-owner")
      .single();

    if (!userRole) {
      return apiError("Only SME owners can cancel invitations", 403);
    }

    // Check if user is admin of this company
    const { data: membership } = await supabase
      .from("company_members")
      .select("role, status")
      .eq("company_id", invitation.company_id)
      .eq("user_id", user.id)
      .single();

    if (
      !membership ||
      membership.role !== "admin" ||
      membership.status !== "approved"
    ) {
      return apiError("You are not an admin of this company", 403);
    }

    // Can only cancel pending invitations
    if (invitation.status !== "pending") {
      return apiError(`Cannot cancel a ${invitation.status} invitation`, 400);
    }

    // Update invitation status
    const { error: updateError } = await supabase
      .from("team_invitations")
      .update({ status: "cancelled" })
      .eq("id", invitationId);

    if (updateError) {
      console.error("Error cancelling invitation:", updateError);
      return apiError("Failed to cancel invitation", 500);
    }

    return apiResponse({ success: true, message: "Invitation cancelled" });
  } catch (error) {
    console.error("Cancel invitation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
