import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies, companyMembers, companyJoinRequests } from "@/lib/db/schema/app";
import { eq, and, inArray, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    // Fetch owned companies
    const ownedCompanies = await db
      .select()
      .from(companies)
      .where(eq(companies.userId, user.id))
      .orderBy(desc(companies.createdAt));

    const ownedIds = new Set(ownedCompanies.map((c) => c.id));

    // Fetch approved memberships
    const memberships = await db
      .select({ companyId: companyMembers.companyId })
      .from(companyMembers)
      .where(
        and(
          eq(companyMembers.userId, user.id),
          eq(companyMembers.status, "approved"),
        ),
      );

    // Fetch member companies (excluding owned)
    let memberCompanies: (typeof companies.$inferSelect)[] = [];
    const memberCompanyIds = memberships
      .map((m) => m.companyId)
      .filter((id) => !ownedIds.has(id));

    if (memberCompanyIds.length > 0) {
      memberCompanies = await db
        .select()
        .from(companies)
        .where(inArray(companies.id, memberCompanyIds));
    }

    // Fetch pending join requests with company data
    const pendingJoinRequests = await db
      .select({
        companyId: companyJoinRequests.companyId,
        status: companyJoinRequests.status,
        company: companies,
      })
      .from(companyJoinRequests)
      .innerJoin(companies, eq(companyJoinRequests.companyId, companies.id))
      .where(
        and(
          eq(companyJoinRequests.userId, user.id),
          inArray(companyJoinRequests.status, ["pending", "approved_by_admin"]),
        ),
      );

    const memberIds = new Set(memberCompanies.map((c) => c.id));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingCompanies: any[] = [];
    for (const req of pendingJoinRequests) {
      if (
        req.company &&
        !ownedIds.has(req.company.id) &&
        !memberIds.has(req.company.id)
      ) {
        pendingCompanies.push({
          ...req.company,
          membershipStatus: "pending_join",
          joinRequestStatus: req.status,
        });
      }
    }

    // Combine with membership status
    const allCompanies = [
      ...ownedCompanies.map((c) => ({
        ...c,
        membershipStatus: "owner" as const,
      })),
      ...memberCompanies.map((c) => ({
        ...c,
        membershipStatus: "member" as const,
      })),
      ...pendingCompanies,
    ];

    return apiResponse({ companies: allCompanies });
  } catch (error) {
    return handleApiError(error);
  }
}
