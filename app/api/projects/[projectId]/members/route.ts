import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { virtualOrganizations, voMembers, companies } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { projectId } = await params;

    // Verify project ownership
    const projectRows = await db
      .select({ leadCompanyId: virtualOrganizations.leadCompanyId })
      .from(virtualOrganizations)
      .where(eq(virtualOrganizations.id, projectId))
      .limit(1);

    const project = projectRows[0];
    if (!project) throw new AuthError("Project not found");

    const hasAccess = await isCompanyMember(user.id, project.leadCompanyId);
    if (!hasAccess) {
      throw new AuthError("No access to this project");
    }

    const body = await request.json();
    const { companyId } = body as { companyId: string };

    if (!companyId || typeof companyId !== "string") {
      throw new AuthError("companyId is required");
    }

    // Verify the company exists
    const companyRows = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!companyRows[0]) {
      throw new AuthError("Company not found");
    }

    // Insert new member
    const insertedRows = await db
      .insert(voMembers)
      .values({
        voId: projectId,
        companyId: companyId,
        role: "invited",
      })
      .returning();

    const inserted = insertedRows[0];

    // Fetch company data to return with the member
    const companyData = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const member = {
      ...inserted,
      companies: companyData[0] || null,
    };

    return apiResponse({ member });
  } catch (error) {
    return handleApiError(error);
  }
}
