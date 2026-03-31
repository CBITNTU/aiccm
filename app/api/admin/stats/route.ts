import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { checkSuperadminRole } from "@/lib/api";
import { db } from "@/lib/db";
import { profiles, companies, tenders, companyJoinRequests, companyVerificationRequests, competencyChangeRequests } from "@/lib/db/schema/app";
import { eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isSuperadmin = await checkSuperadminRole(user.id);
    if (!isSuperadmin) {
      return apiResponse({ error: "Forbidden" }, 403);
    }

    const [
      totalCompaniesResult,
      totalUsersResult,
      activeTendersResult,
      pendingUserApprovalsResult,
      pendingJoinRequestsResult,
      pendingVerificationsResult,
      pendingCompetencyRequestsResult,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(companies)
        .where(eq(companies.isSystemCompany, false)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(profiles),
      db
        .select({ count: sql<number>`count(*)` })
        .from(tenders)
        .where(eq(tenders.status, "open")),
      db
        .select({ count: sql<number>`count(*)` })
        .from(profiles)
        .where(eq(profiles.approvalStatus, "pending")),
      db
        .select({ count: sql<number>`count(*)` })
        .from(companyJoinRequests)
        .where(eq(companyJoinRequests.status, "pending")),
      db
        .select({ count: sql<number>`count(*)` })
        .from(companyVerificationRequests)
        .where(eq(companyVerificationRequests.status, "pending")),
      db
        .select({ count: sql<number>`count(*)` })
        .from(competencyChangeRequests)
        .where(eq(competencyChangeRequests.status, "pending")),
    ]);

    const totalCompanies = Number(totalCompaniesResult[0]?.count ?? 0);
    const totalUsers = Number(totalUsersResult[0]?.count ?? 0);
    const activeTenders = Number(activeTendersResult[0]?.count ?? 0);
    const pendingUserApprovals = Number(pendingUserApprovalsResult[0]?.count ?? 0);
    const pendingJoinRequests = Number(pendingJoinRequestsResult[0]?.count ?? 0);
    const pendingVerifications = Number(pendingVerificationsResult[0]?.count ?? 0);
    const pendingCompetencyRequests = Number(pendingCompetencyRequestsResult[0]?.count ?? 0);

    return apiResponse({
      totalCompanies,
      totalUsers,
      activeTenders,
      pendingUserApprovals,
      pendingJoinRequests,
      pendingVerifications,
      pendingCompetencyRequests,
      pendingApprovalsTotal: pendingUserApprovals + pendingJoinRequests,
      pendingVerificationTotal: pendingVerifications + pendingCompetencyRequests,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
