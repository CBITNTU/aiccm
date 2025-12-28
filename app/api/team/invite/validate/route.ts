import { NextRequest } from "next/server";
import { createAdminClient, apiResponse, apiError } from "@/lib/api";
import { hashToken, isExpired } from "@/lib/utils/invite-token";

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

    const tokenHash = hashToken(token);
    const supabase = createAdminClient();

    // Find invitation by token hash
    const { data: invitation, error: inviteError } = await supabase
      .from("team_invitations")
      .select(`
        id,
        email,
        company_id,
        invited_by,
        status,
        expires_at
      `)
      .eq("token_hash", tokenHash)
      .single();

    if (inviteError || !invitation) {
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
    if (isExpired(invitation.expires_at)) {
      // Mark as expired in the database
      await supabase
        .from("team_invitations")
        .update({ status: "expired" })
        .eq("id", invitation.id);

      return apiResponse<ValidateInvitationResponse>({
        valid: false,
        error: "This invitation has expired. Please request a new invitation from your company admin.",
      });
    }

    // Get company details
    const { data: company } = await supabase
      .from("companies")
      .select("id, company_name")
      .eq("id", invitation.company_id)
      .single();

    // Get inviter details
    const { data: inviterProfile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("user_id", invitation.invited_by)
      .single();

    const inviterName = `${inviterProfile?.first_name || ""} ${inviterProfile?.last_name || ""}`.trim() || "Your colleague";

    // Check if user already exists
    const { data: existingProfiles } = await supabase
      .from("profiles")
      .select("user_id")
      .ilike("email", invitation.email);

    const isExistingUser = !!(existingProfiles && existingProfiles.length > 0);

    return apiResponse<ValidateInvitationResponse>({
      valid: true,
      email: invitation.email,
      companyName: company?.company_name || "Unknown Company",
      companyId: invitation.company_id,
      inviterName,
      expiresAt: invitation.expires_at,
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
