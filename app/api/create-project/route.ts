import { NextRequest } from "next/server";
import { after } from "next/server";
import {
  getAuthenticatedUser,
  createAdminClient,
  apiResponse,
  apiError,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import { isCompanyMember } from "@/lib/api/validation";

interface ProjectRequest {
  name: string;
  description?: string;
  target_tender_id?: string | null;
  company_id: string;
}

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      console.error("Auth error:", authError);
      return apiError("Unauthorized", 401);
    }

    const { name, description, target_tender_id, company_id } =
      (await request.json()) as ProjectRequest;

    // Validate and sanitize project name
    const trimmedName = name?.trim();
    if (!trimmedName || trimmedName.length === 0) {
      return apiError("Project name is required", 400);
    }
    if (trimmedName.length > 200) {
      return apiError("Project name must be 200 characters or less", 400);
    }

    console.log("Creating project:", { name: trimmedName, company_id, user_id: user.id });

    // Use admin client to bypass RLS
    const supabaseAdmin = createAdminClient();

    // Verify user is owner or approved team member
    const hasAccess = await isCompanyMember(user.id, company_id);
    if (!hasAccess) {
      return apiError("Company not found or unauthorized", 403);
    }

    // Create project using admin client (bypasses RLS)
    const { data: project, error: projectError } = await supabaseAdmin
      .from("virtual_organizations")
      .insert({
        name: trimmedName,
        description: description || "",
        lead_company_id: company_id,
        target_tender_id: target_tender_id || null,
        status: "draft",
      })
      .select()
      .single();

    if (projectError) {
      console.error("Project creation error:", projectError);
      return apiError("Failed to create project", 500);
    }

    console.log("Project created successfully:", project.id);

    // Add lead company as a team member
    const { error: memberError } = await supabaseAdmin
      .from("vo_members")
      .insert({
        vo_id: project.id,
        company_id: company_id,
        role: "lead",
      });

    if (memberError) {
      console.error("Error adding lead company as member:", memberError);
      // Project was created but lead member insert failed — clean up
      await supabaseAdmin
        .from("virtual_organizations")
        .delete()
        .eq("id", project.id);
      return apiError("Failed to create project", 500);
    }

    after(() =>
      logApiEvent(request, {
        actionType: "project_created",
        userId: user.id,
        userEmail: user.email || undefined,
        entityType: "project",
        entityId: project.id,
        details: {
          projectName: trimmedName,
          companyId: company_id,
          targetTenderId: target_tender_id,
        },
      }).catch(() => {}),
    );

    return apiResponse({ project });
  } catch (error) {
    console.error("Unexpected error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    after(() =>
      logApiEvent(request, {
        actionType: "project_created",
        userId: undefined,
        status: "error",
        errorMessage: message,
      }).catch(() => {}),
    );

    return apiError("An unexpected error occurred", 500);
  }
}
