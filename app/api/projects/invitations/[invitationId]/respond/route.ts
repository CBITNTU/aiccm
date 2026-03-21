import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
  ValidationError,
} from "@/lib/api/validation";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { voMembers } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { invitationId } = await params;

    const body = await request.json();
    const { action, message } = body;

    if (!action || !["accept", "reject"].includes(action)) {
      throw new ValidationError("action must be 'accept' or 'reject'");
    }

    // Fetch the invitation
    const memberRows = await db
      .select()
      .from(voMembers)
      .where(eq(voMembers.id, invitationId))
      .limit(1);

    const member = memberRows[0];
    if (!member) {
      throw new ValidationError("Invitation not found");
    }

    if (member.invitationStatus !== "sent") {
      throw new ValidationError(
        `Invitation has already been ${member.invitationStatus || "pending"}`,
      );
    }

    // Verify user belongs to the invited company
    const hasAccess = await isCompanyMember(user.id, member.companyId);
    if (!hasAccess) {
      throw new AuthError("You do not have access to this company");
    }

    // Update the invitation
    const now = new Date();

    if (action === "accept") {
      await db
        .update(voMembers)
        .set({
          role: "member",
          invitationStatus: "accepted",
          invitationRespondedAt: now,
          invitationMessage: message || null,
          joinedAt: now,
        })
        .where(eq(voMembers.id, invitationId));
    } else {
      await db
        .update(voMembers)
        .set({
          invitationStatus: "rejected",
          invitationRespondedAt: now,
          invitationMessage: message || null,
        })
        .where(eq(voMembers.id, invitationId));
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
      details: { vo_id: member.voId, company_id: member.companyId },
    }).catch(() => {});

    return apiResponse({
      success: true,
      action,
      projectId: member.voId,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
