import { NextRequest } from "next/server";
import { after } from "next/server";
import { apiResponse, apiError, getAuthenticatedUser } from "@/lib/api";
import { sanitizeLikeParam } from "@/lib/api/validation";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { companies, companyMembers } from "@/lib/db/schema/app";
import { eq, and, ilike, asc } from "drizzle-orm";

export interface CompanySearchResult {
  id: string;
  company_name: string;
  has_admin: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const userId = user?.id;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    const safeQuery = sanitizeLikeParam(query || "");
    if (safeQuery.length < 2) {
      return apiResponse({ companies: [] });
    }

    const companyResults = await db
      .select({ id: companies.id, companyName: companies.companyName })
      .from(companies)
      .where(
        and(
          ilike(companies.companyName, `%${safeQuery}%`),
          eq(companies.status, "active"),
        ),
      )
      .orderBy(asc(companies.companyName))
      .limit(10);

    const companiesWithAdminStatus: CompanySearchResult[] = await Promise.all(
      companyResults.map(async (company) => {
        const adminCheck = await db
          .select({ id: companyMembers.id })
          .from(companyMembers)
          .where(
            and(
              eq(companyMembers.companyId, company.id),
              eq(companyMembers.role, "admin"),
              eq(companyMembers.status, "approved"),
            ),
          )
          .limit(1);

        return {
          id: company.id,
          company_name: company.companyName,
          has_admin: adminCheck.length > 0,
        };
      }),
    );

    after(() =>
      logApiEvent(request, {
        actionType: "company_searched",
        userId: userId || undefined,
        details: { query: safeQuery, count: companiesWithAdminStatus.length },
      }).catch(() => {}),
    );

    return apiResponse({ companies: companiesWithAdminStatus });
  } catch (error) {
    console.error("Error in company search:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
