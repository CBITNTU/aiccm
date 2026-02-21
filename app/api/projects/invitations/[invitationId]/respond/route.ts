import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
  ValidationError,
} from "@/lib/api/validation";
import { logApiEvent } from "@/lib/services/eventLogger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { invitationId } = await params;
    const supabase = createAdminClient();

    const body = await request.json();
    const { action, message } = body;

    if (!action || !["accept", "reject"].includes(action)) {
      throw new ValidationError("action must be 'accept' or 'reject'");
    }

    // Fetch the invitation
    const { data: memberRow, error: memberError } = await supabase
      .from("vo_members")
      .select("*")
      .eq("id", invitationId)
      .single();

    if (memberError || !memberRow) {
      throw new ValidationError("Invitation not found");
    }

    const member = memberRow as typeof memberRow & {
      invitation_status: string | null;
    };

    if (member.invitation_status !== "sent") {
      throw new ValidationError(
        `Invitation has already been ${member.invitation_status || "pending"}`,
      );
    }

    // Verify user belongs to the invited company
    const hasAccess = await isCompanyMember(user.id, member.company_id);
    if (!hasAccess) {
      throw new AuthError("You do not have access to this company");
    }

    // Update the invitation
    const now = new Date().toISOString();

    if (action === "accept") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await supabase
        .from("vo_members")
        .update({
          role: "member",
          invitation_status: "accepted",
          invitation_responded_at: now,
          invitation_message: message || null,
          joined_at: now,
        } as any)
        .eq("id", invitationId);

      if (updateError) throw updateError;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await supabase
        .from("vo_members")
        .update({
          invitation_status: "rejected",
          invitation_responded_at: now,
          invitation_message: message || null,
        } as any)
        .eq("id", invitationId);

      if (updateError) throw updateError;
    }

    await logApiEvent(request, {
      actionType:
        action === "accept"
          ? "project_member_joined"
          : "project_member_invited",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "vo_member",
      entityId: invitationId,
      details: { vo_id: member.vo_id, company_id: member.company_id },
    }).catch(() => {});

    return apiResponse({
      success: true,
      action,
      projectId: member.vo_id,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
