import { NextRequest } from "next/server";
import {
  createAdminClient,
  apiResponse,
  apiError,
  getAuthenticatedUser,
} from "@/lib/api";

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

    const supabase = createAdminClient();

    // Check if user is SME owner
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "sme-owner")
      .single();

    if (!userRole) {
      return apiError("Only SME owners can remove team members", 403);
    }

    // Check if user is admin of this company
    const { data: membership } = await supabase
      .from("company_members")
      .select("role, status")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .single();

    if (!membership || membership.role !== "admin" || membership.status !== "approved") {
      return apiError("You are not an admin of this company", 403);
    }

    // Get the member to be removed
    const { data: memberToRemove, error: memberError } = await supabase
      .from("company_members")
      .select("id, user_id, role, status")
      .eq("id", memberId)
      .eq("company_id", companyId)
      .single();

    if (memberError || !memberToRemove) {
      return apiError("Member not found", 404);
    }

    // Cannot remove yourself
    if (memberToRemove.user_id === user.id) {
      return apiError("You cannot remove yourself from the company", 400);
    }

    // Check if this would leave the company without admins
    if (memberToRemove.role === "admin") {
      const { data: adminCount } = await supabase
        .from("company_members")
        .select("id", { count: "exact" })
        .eq("company_id", companyId)
        .eq("role", "admin")
        .eq("status", "approved");

      if (adminCount && adminCount.length <= 1) {
        return apiError("Cannot remove the only admin. Promote another member to admin first.", 400);
      }
    }

    // Delete the member
    const { error: deleteError } = await supabase
      .from("company_members")
      .delete()
      .eq("id", memberId);

    if (deleteError) {
      console.error("Error removing member:", deleteError);
      return apiError("Failed to remove member", 500);
    }

    // Also clear invited_to_company_id if set
    await supabase
      .from("profiles")
      .update({ invited_to_company_id: null })
      .eq("user_id", memberToRemove.user_id)
      .eq("invited_to_company_id", companyId);

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
