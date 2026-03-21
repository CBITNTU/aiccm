import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { virtualOrganizations, voMembers } from "@/lib/db/schema/app";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; memberId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { projectId, memberId } = await params;

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

    // Prevent deleting the lead company
    const memberRows = await db
      .select({ role: voMembers.role })
      .from(voMembers)
      .where(and(eq(voMembers.id, memberId), eq(voMembers.voId, projectId)))
      .limit(1);

    const member = memberRows[0];
    if (!member) throw new AuthError("Member not found in this project");
    if (member.role === "lead") {
      throw new AuthError("Cannot remove the lead company from the project");
    }

    await db
      .delete(voMembers)
      .where(and(eq(voMembers.id, memberId), eq(voMembers.voId, projectId)));

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
