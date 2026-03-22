import { NextRequest } from "next/server";
import { after } from "next/server";
import {
  getAuthenticatedUser,
  apiResponse,
  apiError,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import { isCompanyMember } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { virtualOrganizations, voMembers, companies } from "@/lib/db/schema/app";
import { eq, and, ne, count } from "drizzle-orm";
import { getPlatformVerificationSettings } from "@/lib/platformVerificationSettings";

interface ProjectRequest {
  name: string;
  description?: string;
  targetTenderId?: string | null;
  companyId: string;
}

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      console.error("Auth error:", authError);
      return apiError("Unauthorized", 401);
    }

    const body = (await request.json()) as ProjectRequest;
    const name = body.name;
    const description = body.description;
    const target_tender_id = body.targetTenderId;
    const company_id = body.companyId ?? "";

    // Validate and sanitize project name
    const trimmedName = name?.trim();
    if (!trimmedName || trimmedName.length === 0) {
      return apiError("Project name is required", 400);
    }
    if (trimmedName.length > 200) {
      return apiError("Project name must be 200 characters or less", 400);
    }

    console.log("Creating project:", { name: trimmedName, company_id, user_id: user.id });

    // Verify user is owner or approved team member
    const hasAccess = await isCompanyMember(user.id, company_id);
    if (!hasAccess) {
      return apiError("Company not found or unauthorized", 403);
    }

    // Enforce project limit based on verification status
    const company = await db
      .select({ verificationStatus: companies.verificationStatus })
      .from(companies)
      .where(eq(companies.id, company_id))
      .then((rows) => rows[0]);

    if (company) {
      const settings = await getPlatformVerificationSettings();
      const isVerified = company.verificationStatus === "verified";
      const limit = isVerified ? settings.verifiedProjectLimit : settings.unverifiedProjectLimit;

      const [{ value: projectCount }] = await db
        .select({ value: count() })
        .from(virtualOrganizations)
        .where(
          and(
            eq(virtualOrganizations.leadCompanyId, company_id),
            ne(virtualOrganizations.status, "archived"),
          ),
        );

      if (projectCount >= limit) {
        const message = isVerified
          ? `Verified companies can create up to ${limit} active projects. Please archive existing projects to create new ones.`
          : `Unverified companies can create up to ${limit} active project(s). Get your company verified to unlock more projects.`;
        return apiError(message, 403);
      }
    }

    // Create project
    const projectRows = await db
      .insert(virtualOrganizations)
      .values({
        name: trimmedName,
        description: description || "",
        leadCompanyId: company_id,
        targetTenderId: target_tender_id || null,
        status: "draft",
        projectOwnerId: user.id,
      })
      .returning();

    const project = projectRows[0];
    if (!project) {
      console.error("Project creation error: no rows returned");
      return apiError("Failed to create project", 500);
    }

    console.log("Project created successfully:", project.id);

    // Add lead company as a team member
    try {
      await db.insert(voMembers).values({
        voId: project.id,
        companyId: company_id,
        role: "lead",
      });
    } catch (memberError) {
      console.error("Error adding lead company as member:", memberError);
      // Project was created but lead member insert failed -- clean up
      await db
        .delete(virtualOrganizations)
        .where(eq(virtualOrganizations.id, project.id));
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
