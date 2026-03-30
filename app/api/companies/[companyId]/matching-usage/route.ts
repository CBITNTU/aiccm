import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { isCompanyMember } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";
import { getPlatformMatchingSettings } from "@/lib/platformMatchingSettings";
import { getMatchingRunsThisMonth, getEffectiveMatchingLimit, getNextMonthStart } from "@/lib/matchingUsage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      return apiResponse({ error: "Company not found or access denied" }, 404);
    }

    const companyResult = await db
      .select({
        verificationStatus: companies.verificationStatus,
        matchingRunsLimit: companies.matchingRunsLimit,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!companyResult[0]) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    const company = companyResult[0];
    const [settings, used] = await Promise.all([
      getPlatformMatchingSettings(),
      getMatchingRunsThisMonth(companyId),
    ]);

    const limit = getEffectiveMatchingLimit(company, settings);
    const remaining = Math.max(0, limit - used);
    const resetsAt = getNextMonthStart().toISOString();

    return apiResponse({ used, limit, remaining, resetsAt });
  } catch (error) {
    return handleApiError(error);
  }
}
