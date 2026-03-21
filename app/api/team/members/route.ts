import { NextRequest } from "next/server";
import { apiResponse, apiError, getAuthenticatedUser } from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { userRoles, companyMembers, profiles } from "@/lib/db/schema/app";
import { eq, and, count } from "drizzle-orm";

export interface RemoveMemberRequest {
  memberId: string;
  companyId: string;
}

export interface RemoveMemberResponse {
  success: boolean;
  message: string;
}

// DELETE - Remove a team member
export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(authError || "Unauthorized", 401);
    }

    const body: RemoveMemberRequest = await request.json();
    const { memberId, companyId } = body;

    if (!memberId || !companyId) {
      return apiError("Member ID and Company ID are required", 400);
    }

    // Check if user is SME owner
    const userRoleResult = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(and(eq(userRoles.userId, user.id), eq(userRoles.role, "sme-owner")))
      .limit(1);

    if (!userRoleResult[0]) {
      return apiError("Only SME owners can remove team members", 403);
    }

    // Check if user is admin of this company
    const membershipResult = await db
      .select({ role: companyMembers.role, status: companyMembers.status })
      .from(companyMembers)
      .where(
        and(
          eq(companyMembers.companyId, companyId),
          eq(companyMembers.userId, user.id),
        ),
      )
      .limit(1);

    const membership = membershipResult[0];
    if (!membership || membership.role !== "admin" || membership.status !== "approved") {
      return apiError("You are not an admin of this company", 403);
    }

    // Get the member to be removed
    const memberResult = await db
      .select({
        id: companyMembers.id,
        userId: companyMembers.userId,
        role: companyMembers.role,
        status: companyMembers.status,
      })
      .from(companyMembers)
      .where(
        and(
          eq(companyMembers.id, memberId),
          eq(companyMembers.companyId, companyId),
        ),
      )
      .limit(1);

    const memberToRemove = memberResult[0];
    if (!memberToRemove) {
      return apiError("Member not found", 404);
    }

    // Cannot remove yourself
    if (memberToRemove.userId === user.id) {
      return apiError("You cannot remove yourself from the company", 400);
    }

    // Check if this would leave the company without admins
    if (memberToRemove.role === "admin") {
      const adminCountResult = await db
        .select({ count: count() })
        .from(companyMembers)
        .where(
          and(
            eq(companyMembers.companyId, companyId),
            eq(companyMembers.role, "admin"),
            eq(companyMembers.status, "approved"),
          ),
        );

      if (adminCountResult[0] && adminCountResult[0].count <= 1) {
        return apiError(
          "Cannot remove the only admin. Promote another member to admin first.",
          400,
        );
      }
    }

    // Delete the member
    await db.delete(companyMembers).where(eq(companyMembers.id, memberId));

    // Also clear invited_to_company_id if set
    await db
      .update(profiles)
      .set({ invitedToCompanyId: null })
      .where(
        and(
          eq(profiles.userId, memberToRemove.userId),
          eq(profiles.invitedToCompanyId, companyId),
        ),
      );

    await logApiEvent(request, {
      actionType: "company_member_removed",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "company",
      entityId: companyId,
      details: { member_id: memberId },
    }).catch(() => {});

    return apiResponse<RemoveMemberResponse>({
      success: true,
      message: "Member removed successfully",
    });
  } catch (error) {
    console.error("Remove member error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
