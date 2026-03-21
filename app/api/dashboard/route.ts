import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  getUserCompanyIds,
  handleApiError,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies, tenders, matchingResults, virtualOrganizations } from "@/lib/db/schema/app";
import { eq, inArray, desc, count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    // Get user's company IDs
    const companyIds = await getUserCompanyIds(user.id);

    // Fetch companies
    let companiesData: (typeof companies.$inferSelect)[] = [];
    if (companyIds.length > 0) {
      companiesData = await db
        .select()
        .from(companies)
        .where(inArray(companies.id, companyIds))
        .orderBy(desc(companies.createdAt));
    }

    // Fetch total tenders count
    const tendersCountResult = await db.select({ count: count() }).from(tenders);
    const totalTenders = tendersCountResult[0]?.count || 0;

    // Fetch matching results for user's companies
    let recentMatches: Record<string, unknown>[] = [];
    let matchingResultsCount = 0;

    if (companyIds.length > 0) {
      // Count total matching results
      const countResult = await db
        .select({ count: count() })
        .from(matchingResults)
        .where(inArray(matchingResults.companyId, companyIds));
      matchingResultsCount = countResult[0]?.count || 0;

      // Fetch recent matches with joined data
      const matchData = await db
        .select({
          match: matchingResults,
          tenderTitle: tenders.title,
          tenderBuyer: tenders.buyer,
          tenderDeadline: tenders.deadline,
          tenderDescription: tenders.description,
          tenderLocation: tenders.location,
          tenderBudgetMin: tenders.budgetMin,
          tenderBudgetMax: tenders.budgetMax,
          companyName: companies.companyName,
        })
        .from(matchingResults)
        .innerJoin(tenders, eq(matchingResults.tenderId, tenders.id))
        .innerJoin(companies, eq(matchingResults.companyId, companies.id))
        .where(inArray(matchingResults.companyId, companyIds))
        .orderBy(desc(matchingResults.createdAt))
        .limit(5);

      recentMatches = matchData.map((row) => ({
        ...row.match,
        tenders: {
          title: row.tenderTitle,
          buyer: row.tenderBuyer,
          deadline: row.tenderDeadline,
          description: row.tenderDescription,
          location: row.tenderLocation,
          budgetMin: row.tenderBudgetMin,
          budgetMax: row.tenderBudgetMax,
        },
        companies: {
          companyName: row.companyName,
        },
      }));
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
      companies: companiesData,
      stats: {
        totalTenders,
        matchingResults: matchingResultsCount,
        companies: companiesData.length,
        projects: projectsCount,
      },
      recentMatches,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
