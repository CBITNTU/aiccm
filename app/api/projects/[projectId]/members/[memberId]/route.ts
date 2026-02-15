import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; memberId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { projectId, memberId } = await params;
    const supabase = createAdminClient();

    // Verify project ownership
    const { data: project } = await supabase
      .from("virtual_organizations")
      .select("lead_company_id")
      .eq("id", projectId)
      .single();

    if (!project) throw new AuthError("Project not found");

    const hasAccess = await isCompanyMember(user.id, project.lead_company_id);
    if (!hasAccess) {
      throw new AuthError("No access to this project");
    }

    const { error } = await supabase
      .from("vo_members")
      .delete()
      .eq("id", memberId);

    if (error) throw error;

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
