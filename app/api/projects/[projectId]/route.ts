import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  getUserCompanyIds,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import {
  virtualOrganizations,
  voMembers,
  tenders,
  companies,
  matchingResults,
} from "@/lib/db/schema/app";
import { companyColumnsNoEmbedding, tenderColumnsNoEmbedding } from "@/lib/db/columns";
import {
  applyCuration,
  applyCurationToAnalysis,
  getCurationOverlay,
} from "@/lib/services/curatedMatches";
import { eq, and, inArray } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { projectId } = await params;

    // Fetch project with tender
    const projectRows = await db
      .select({
        project: virtualOrganizations,
        tenderData: tenderColumnsNoEmbedding,
      })
      .from(virtualOrganizations)
      .leftJoin(tenders, eq(virtualOrganizations.targetTenderId, tenders.id))
      .where(eq(virtualOrganizations.id, projectId))
      .limit(1);

    const row = projectRows[0];
    if (!row) throw new AuthError("Project not found");

    const project = {
      ...row.project,
      tenders: row.tenderData,
    };

    // Check if user is owner (member of lead company)
    const isOwner = await isCompanyMember(user.id, project.leadCompanyId);

    // If not owner, check if user's company is a member with sent/accepted status
    if (!isOwner) {
      const userCompanyIds = await getUserCompanyIds(user.id);

      if (userCompanyIds.length === 0) {
        throw new AuthError("No access to this project");
      }

      // Check for invitation_status in sent/accepted
      const membershipCheck = await db
        .select({ id: voMembers.id, invitationStatus: voMembers.invitationStatus })
        .from(voMembers)
        .where(
          and(
            eq(voMembers.voId, projectId),
            inArray(voMembers.companyId, userCompanyIds),
          ),
        );

      const hasAccess = membershipCheck.some(
        (m) => m.invitationStatus === "sent" || m.invitationStatus === "accepted",
      );

      if (!hasAccess) {
        throw new AuthError("No access to this project");
      }
    }

    // Fetch team members with company data
    const membersData = await db
      .select({
        member: voMembers,
        company: companyColumnsNoEmbedding,
      })
      .from(voMembers)
      .leftJoin(companies, eq(voMembers.companyId, companies.id))
      .where(eq(voMembers.voId, projectId));

    const members = membersData.map((m) => ({
      ...m.member,
      companies: m.company,
    }));

    // Fetch tender match result if applicable
    let tenderMatchResult = null;
    if (project.leadCompanyId && project.targetTenderId) {
      const matchRows = await db
        .select({
          id: matchingResults.id,
          overallScore: matchingResults.overallScore,
          capabilityScore: matchingResults.capabilityScore,
          experienceScore: matchingResults.experienceScore,
          locationScore: matchingResults.locationScore,
          certificationScore: matchingResults.certificationScore,
          matchReasons: matchingResults.matchReasons,
          aiAnalysis: matchingResults.aiAnalysis,
        })
        .from(matchingResults)
        .where(
          and(
            eq(matchingResults.companyId, project.leadCompanyId),
            eq(matchingResults.tenderId, project.targetTenderId),
          ),
        )
        .limit(1);

      if (matchRows[0]) {
        // GapAnalysisPanel renders this as "Match score" for the same
        // company/tender pair the feed already showed. Any read surface that
        // exposes a score has to go through the curation overlay or the two
        // disagree — see lib/services/curatedMatches.ts.
        const overlay = await getCurationOverlay(project.leadCompanyId);
        const curation = overlay.get(project.targetTenderId);
        const realScore = matchRows[0].overallScore ?? 0;
        const curated = applyCuration(
          {
            score: realScore,
            capabilityScore: matchRows[0].capabilityScore,
            experienceScore: matchRows[0].experienceScore,
            locationScore: matchRows[0].locationScore,
            certificationScore: matchRows[0].certificationScore,
            matchReasons: matchRows[0].matchReasons,
          },
          curation,
        );
        tenderMatchResult = {
          ...matchRows[0],
          overallScore: curated.score,
          capabilityScore: curated.capabilityScore ?? null,
          experienceScore: curated.experienceScore ?? null,
          locationScore: curated.locationScore ?? null,
          certificationScore: curated.certificationScore ?? null,
          matchReasons: curated.matchReasons ?? null,
          aiAnalysis: applyCurationToAnalysis(
            matchRows[0].aiAnalysis,
            curation,
            realScore,
          ),
        };
      }
    }

    return apiResponse({
      project,
      teamMembers: members,
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

    // Verify ownership
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

    // Whitelist allowed fields and map to Drizzle camelCase
    const fieldMap: Record<string, keyof typeof virtualOrganizations.$inferInsert> = {
      status: "status",
      name: "name",
      description: "description",
      targetTenderId: "targetTenderId",
      gapAnalysis: "gapAnalysis",
      teamAnalysis: "teamAnalysis",
      recommendedPartners: "recommendedPartners",
      // Legacy snake_case support
      target_tender_id: "targetTenderId",
      gap_analysis: "gapAnalysis",
      team_analysis: "teamAnalysis",
      recommended_partners: "recommendedPartners",
    };

    // Validate status if provided
    if ("status" in body) {
      const validStatuses = ["draft", "active", "completed", "archived"];
      if (!validStatuses.includes(body.status)) {
        throw new AuthError("Invalid project status");
      }
    }

    const updates: Partial<typeof virtualOrganizations.$inferInsert> = {};
    for (const [bodyKey, dbKey] of Object.entries(fieldMap)) {
      if (bodyKey in body) {
        (updates as Record<string, unknown>)[dbKey as string] = body[bodyKey];
      }
    }

    updates.updatedAt = new Date();

    const result = await db
      .update(virtualOrganizations)
      .set(updates)
      .where(eq(virtualOrganizations.id, projectId))
      .returning();

    return apiResponse({ project: result[0] });
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

    // Verify ownership
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

    // Delete members first (cascade should handle this, but be explicit)
    await db.delete(voMembers).where(eq(voMembers.voId, projectId));

    // Delete project
    await db
      .delete(virtualOrganizations)
      .where(eq(virtualOrganizations.id, projectId));

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
