import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError, isCompanyMember } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { virtualOrganizations, voMembers, tenders, companies } from "@/lib/db/schema/app";
import { eq, or } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      return apiResponse({ voProjects: [], pastProjects: [] });
    }

    // Fetch VO projects where company is lead or member
    const voProjectRows = await db
      .select({
        id: virtualOrganizations.id,
        name: virtualOrganizations.name,
        description: virtualOrganizations.description,
        status: virtualOrganizations.status,
        tenderTitle: tenders.title,
        tenderBuyer: tenders.buyer,
        tenderLocation: tenders.location,
        createdAt: virtualOrganizations.createdAt,
      })
      .from(virtualOrganizations)
      .leftJoin(tenders, eq(tenders.id, virtualOrganizations.targetTenderId))
      .leftJoin(voMembers, eq(voMembers.voId, virtualOrganizations.id))
      .where(
        or(
          eq(virtualOrganizations.leadCompanyId, companyId),
          eq(voMembers.companyId, companyId),
        ),
      );

    // Deduplicate by VO id
    const uniqueVOProjects = Array.from(
      new Map(voProjectRows.map((p) => [p.id, p])).values(),
    );

    // Fetch pastProjects from company record
    const companyRows = await db
      .select({ pastProjects: companies.pastProjects })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    let pastProjects: unknown[] = [];
    const raw = companyRows[0]?.pastProjects;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          pastProjects = parsed;
        }
      } catch {
        // Legacy plain text - wrap it as a single project
        if (raw.trim().length > 0) {
          pastProjects = [{ name: "Past Projects", description: raw, isLegacy: true }];
        }
      }
    }

    return apiResponse({ voProjects: uniqueVOProjects, pastProjects });
  } catch (error) {
    return handleApiError(error);
  }
}
