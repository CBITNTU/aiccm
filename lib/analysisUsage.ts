import { db } from "@/lib/db";
import { events } from "@/lib/db/schema/app";
import { and, eq, gte, count, sql, ne, or, isNull } from "drizzle-orm";
import { getUsageWindowStart } from "@/lib/matchingUsage";
import type { PlatformAnalysisSettings } from "@/lib/platformAnalysisSettings";

type CompanyForLimit = {
  analysisRunsLimit?: number | null;
  verificationStatus?: string | null;
};

/**
 * Counts how many AI analysis runs the company has used in the current calendar month.
 * Uses the events table where actionType='company_updated' and details->>'analysisType'='comprehensive'.
 *
 * Runs a superadmin started on the company's behalf are tagged
 * `details.initiatedBy = 'admin'` and excluded — preparing an account before
 * approving it must not spend the user's monthly allowance.
 */
export async function getAnalysisRunsThisMonth(
  companyId: string,
  usageResetAt?: Date | null,
): Promise<number> {
  const windowStart = getUsageWindowStart(usageResetAt);
  const result = await db
    .select({ count: count() })
    .from(events)
    .where(
      and(
        eq(events.entityId, companyId),
        eq(events.actionType, "company_updated"),
        sql`${events.details}->>'analysisType' = 'comprehensive'`,
        or(
          isNull(sql`${events.details}->>'initiatedBy'`),
          ne(sql`${events.details}->>'initiatedBy'`, "admin"),
        ),
        gte(events.createdAt, windowStart),
      ),
    );
  return result[0]?.count ?? 0;
}

/**
 * Returns the effective analysis runs limit for a company.
 * Per-company override takes precedence over the platform default.
 */
export function getEffectiveAnalysisLimit(
  company: CompanyForLimit,
  settings: PlatformAnalysisSettings,
): number {
  if (company.analysisRunsLimit != null) {
    return company.analysisRunsLimit;
  }
  const isVerified = company.verificationStatus === "verified";
  return isVerified
    ? settings.verifiedAnalysisRunsPerMonth
    : settings.unverifiedAnalysisRunsPerMonth;
}

export { getNextMonthStart } from "@/lib/matchingUsage";
