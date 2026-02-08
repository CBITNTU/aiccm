import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  createAdminClient,
  apiResponse,
  apiError,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";

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

    console.log("Creating project:", { name, company_id, user_id: user.id });

    // Use admin client to bypass RLS
    const supabaseAdmin = createAdminClient();

    // Verify user owns the company
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("*")
      .eq("id", company_id)
      .eq("user_id", user.id)
      .single();

    if (companyError || !company) {
      console.error("Company verification failed:", companyError);
      return apiError("Company not found or unauthorized", 403);
    }

    // Create project using admin client (bypasses RLS)
    const { data: project, error: projectError } = await supabaseAdmin
      .from("virtual_organizations")
      .insert({
        name: name,
        description: description || "",
        lead_company_id: company_id,
        target_tender_id: target_tender_id || null,
        status: "draft",
      })
      .select()
      .single();

    if (projectError) {
      console.error("Project creation error:", projectError);
      return apiError(projectError.message, 500);
    }

    console.log("Project created successfully:", project.id);

    // Log project creation
    await logApiEvent(request, {
      actionType: "project_created",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "project",
      entityId: project.id,
      details: {
        projectName: name,
        companyId: company_id,
        targetTenderId: target_tender_id,
      },
    });

    return apiResponse({ project });
  } catch (error) {
    console.error("Unexpected error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    // Log error
    await logApiEvent(request, {
      actionType: "project_created",
      userId: undefined,
      status: "error",
      errorMessage: message,
    }).catch(() => {}); // Don't fail if logging fails

    return apiError(message, 500);
  }
}
