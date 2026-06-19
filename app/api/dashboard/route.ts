import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  getUserCompanyIds,
  handleApiError,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { tenders, matchingResults, virtualOrganizations } from "@/lib/db/schema/app";
import { inArray, count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    // Get user's company IDs
    const companyIds = await getUserCompanyIds(user.id);

    // Fetch total tenders count
    const tendersCountResult = await db.select({ count: count() }).from(tenders);
    const totalTenders = tendersCountResult[0]?.count || 0;

    // Count matching results for user's companies
    let matchingResultsCount = 0;

    if (companyIds.length > 0) {
      const countResult = await db
        .select({ count: count() })
        .from(matchingResults)
        .where(inArray(matchingResults.companyId, companyIds));
      matchingResultsCount = countResult[0]?.count || 0;
    }

    // Fetch projects count
    let projectsCount = 0;
    if (companyIds.length > 0) {
      const projectsResult = await db
        .select({ count: count() })
        .from(virtualOrganizations)
        .where(inArray(virtualOrganizations.leadCompanyId, companyIds));
      projectsCount = projectsResult[0]?.count || 0;
    }

    return apiResponse({
      stats: {
        totalTenders,
        matchingResults: matchingResultsCount,
        companies: companyIds.length,
        projects: projectsCount,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
