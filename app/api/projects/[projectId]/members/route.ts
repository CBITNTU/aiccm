import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { projectId } = await params;
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

    const body = await request.json();
    const { companyId } = body as { companyId: string };

    const { data, error } = await supabase
      .from("vo_members")
      .insert({
        vo_id: projectId,
        company_id: companyId,
        role: "invited",
      })
      .select(
        `
        *,
        companies:company_id (*)
      `,
      )
      .single();

    if (error) throw error;

    return apiResponse({ member: data });
  } catch (error) {
    return handleApiError(error);
  }
}
