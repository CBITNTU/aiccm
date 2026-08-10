import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { getCompanyAccess } from "@/lib/api/companyAccess";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";
import { getPlatformAnalysisSettings } from "@/lib/platformAnalysisSettings";
import { getAnalysisRunsThisMonth, getEffectiveAnalysisLimit, getNextMonthStart } from "@/lib/analysisUsage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    const { hasAccess } = await getCompanyAccess(user.id, companyId);
    if (!hasAccess) {
      return apiResponse({ error: "Company not found or access denied" }, 404);
    }

    const companyResult = await db
      .select({
        verificationStatus: companies.verificationStatus,
        analysisRunsLimit: companies.analysisRunsLimit,
        usageResetAt: companies.usageResetAt,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!companyResult[0]) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    const company = companyResult[0];
    const [settings, used] = await Promise.all([
      getPlatformAnalysisSettings(),
      getAnalysisRunsThisMonth(companyId, company.usageResetAt),
    ]);

    const limit = getEffectiveAnalysisLimit(company, settings);
    const remaining = Math.max(0, limit - used);
    const resetsAt = getNextMonthStart().toISOString();

    return apiResponse({ used, limit, remaining, resetsAt });
  } catch (error) {
    return handleApiError(error);
  }
}
