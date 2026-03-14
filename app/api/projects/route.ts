import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import {
  virtualOrganizations,
  voMembers,
  tenders,
} from "@/lib/db/schema/app";
import { eq, inArray, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const status = searchParams.get("status") || "active";

    if (!companyId) {
      throw new AuthError("companyId is required");
    }

    // Verify user has access to this company
    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    const statusesToQuery =
      status === "active" ? ["draft", "active"] : [status];

    // 1. Owned projects (where company is the lead)
    const ownedProjectRows = await db
      .select({
        project: virtualOrganizations,
        tenderData: {
          id: tenders.id,
          title: tenders.title,
          buyer: tenders.buyer,
          deadline: tenders.deadline,
        },
      })
      .from(virtualOrganizations)
      .leftJoin(tenders, eq(virtualOrganizations.targetTenderId, tenders.id))
      .where(
        eq(virtualOrganizations.leadCompanyId, companyId),
      )
      .orderBy(desc(virtualOrganizations.createdAt));

    // Filter by status in JS (since we need IN clause combined with other conditions)
    const ownedProjects = ownedProjectRows
      .filter((row) => statusesToQuery.includes(row.project.status))
      .map((row) => ({
        ...row.project,
        tenders: row.tenderData?.id ? row.tenderData : null,
        userRole: "owner" as const,
      }));

    // 2. Member projects (where company is an accepted member, not lead)
    const memberRows = await db
      .select({
        voId: voMembers.voId,
        member: voMembers,
      })
      .from(voMembers)
      .where(eq(voMembers.companyId, companyId));

    // Filter to accepted, non-lead members
    const acceptedMemberVoIds = memberRows
      .filter(
        (row) =>
          row.member.invitationStatus === "accepted" &&
          row.member.role !== "lead",
      )
      .map((row) => row.voId);

    const memberProjects: Array<Record<string, unknown> & { userRole: "member" }> = [];

    if (acceptedMemberVoIds.length > 0) {
      const voRows = await db
        .select({
          project: virtualOrganizations,
          tenderData: {
            id: tenders.id,
            title: tenders.title,
            buyer: tenders.buyer,
            deadline: tenders.deadline,
          },
        })
        .from(virtualOrganizations)
        .leftJoin(tenders, eq(virtualOrganizations.targetTenderId, tenders.id))
        .where(inArray(virtualOrganizations.id, acceptedMemberVoIds));

      for (const row of voRows) {
        if (!statusesToQuery.includes(row.project.status)) continue;
        memberProjects.push({
          ...row.project,
          tenders: row.tenderData?.id ? row.tenderData : null,
          userRole: "member" as const,
        });
      }
    }

    // Merge, avoiding duplicates
    const seenIds = new Set(ownedProjects.map((p) => p.id));
    const merged: Array<Record<string, unknown>> = [...ownedProjects];
    for (const mp of memberProjects) {
      if (!seenIds.has(mp.id as string)) {
        merged.push(mp);
        seenIds.add(mp.id as string);
      }
    }

    return apiResponse({ projects: merged });
  } catch (error) {
    return handleApiError(error);
  }
}
