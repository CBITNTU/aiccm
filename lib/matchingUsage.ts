import { db } from "@/lib/db";
import { batchJobs } from "@/lib/db/schema/app";
import { and, eq, gte, count } from "drizzle-orm";
import type { PlatformMatchingSettings } from "@/lib/platformMatchingSettings";

type CompanyForLimit = {
  matchingRunsLimit?: number | null;
  verificationStatus?: string | null;
};

/**
 * Returns the start of the current calendar month in UTC as a Date.
 */
export function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Returns the start of the next calendar month in UTC as a Date.
 */
export function getNextMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Counts how many matching batches the company has started in the current calendar month.
 * Uses the batch_jobs table as the audit trail — no separate counter needed.
 */
export async function getMatchingRunsThisMonth(companyId: string): Promise<number> {
  const monthStart = getMonthStart();
  const result = await db
    .select({ count: count() })
    .from(batchJobs)
    .where(
      and(
        eq(batchJobs.companyId, companyId),
        eq(batchJobs.batchType, "tender_matching"),
        gte(batchJobs.createdAt, monthStart),
      ),
    );
  return result[0]?.count ?? 0;
}

/**
 * Returns the effective matching runs limit for a company.
 * Per-company override takes precedence over the platform default.
 */
export function getEffectiveMatchingLimit(
  company: CompanyForLimit,
  settings: PlatformMatchingSettings,
): number {
  if (company.matchingRunsLimit != null) {
    return company.matchingRunsLimit;
  }
  const isVerified = company.verificationStatus === "verified";
  return isVerified
    ? settings.verifiedMatchingRunsPerMonth
    : settings.unverifiedMatchingRunsPerMonth;
}
