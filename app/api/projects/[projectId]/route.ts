import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  getUserCompanyIds,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { projectId } = await params;
    const supabase = createAdminClient();

    // Fetch project with tender
    const { data: project, error: projectError } = await supabase
      .from("virtual_organizations")
      .select(
        `
        *,
        tenders:target_tender_id (*)
      `,
      )
      .eq("id", projectId)
      .single();

    if (projectError) throw projectError;
    if (!project) throw new AuthError("Project not found");

    // Check if user is owner (member of lead company)
    const isOwner = await isCompanyMember(user.id, project.lead_company_id);

    // If not owner, check if user's company is a member with sent/accepted status
    if (!isOwner) {
      const userCompanyIds = await getUserCompanyIds(user.id);

      const { data: membership } = await supabase
        .from("vo_members")
        .select("id")
        .eq("vo_id", projectId)
        .in("company_id", userCompanyIds)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .in("invitation_status" as any, ["sent", "accepted"])
        .limit(1);

      if (!membership || membership.length === 0) {
        throw new AuthError("No access to this project");
      }
    }

    // Fetch team members
    const { data: members, error: membersError } = await supabase
      .from("vo_members")
      .select(
        `
        *,
        companies:company_id (*)
      `,
      )
      .eq("vo_id", projectId);

    if (membersError) throw membersError;

    // Fetch tender match result if applicable
    let tenderMatchResult = null;
    if (project.lead_company_id && project.target_tender_id) {
      const { data: matchRow } = await supabase
        .from("matching_results")
        .select(
          "id, overall_score, capability_score, experience_score, location_score, certification_score, match_reasons, ai_analysis",
        )
        .eq("company_id", project.lead_company_id)
        .eq("tender_id", project.target_tender_id)
        .maybeSingle();

      if (matchRow) {
        tenderMatchResult = matchRow;
      }
    }

    return apiResponse({
      project,
      teamMembers: members || [],
      tenderMatchResult,
      isOwner,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { projectId } = await params;
    const supabase = createAdminClient();

    // Verify ownership
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

    // Whitelist allowed fields
    const allowedFields = [
      "status",
      "name",
      "description",
      "target_tender_id",
      "gap_analysis",
      "team_analysis",
      "recommended_partners",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    const { data, error } = await supabase
      .from("virtual_organizations")
      .update(updates)
      .eq("id", projectId)
      .select()
      .single();

    if (error) throw error;

    return apiResponse({ project: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { projectId } = await params;
    const supabase = createAdminClient();

    // Verify ownership
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

    // Delete members first
    await supabase.from("vo_members").delete().eq("vo_id", projectId);

    // Delete project
    const { error } = await supabase
      .from("virtual_organizations")
      .delete()
      .eq("id", projectId);

    if (error) throw error;

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
