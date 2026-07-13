import { db } from "@/lib/db";
import { batchJobs } from "@/lib/db/schema/app";
import { and, eq, gte, count, notInArray } from "drizzle-orm";
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
 * Returns the instant from which usage should be counted: the later of the
 * calendar month start and an optional superadmin reset marker.
 */
export function getUsageWindowStart(usageResetAt?: Date | null): Date {
  const monthStart = getMonthStart();
  if (usageResetAt && usageResetAt > monthStart) return usageResetAt;
  return monthStart;
}

/**
 * Counts how many matching batches the company has started in the current usage
 * window. Uses the batch_jobs table as the audit trail — no separate counter needed.
 * A superadmin reset (usageResetAt) narrows the window without deleting rows.
 *
 * Failed and cancelled runs are NOT counted: a run the user didn't actually get
 * value from (e.g. every job errored, or the user cancelled) should not burn the
 * monthly quota. Only in-progress and completed runs count.
 */
export async function getMatchingRunsThisMonth(
  companyId: string,
  usageResetAt?: Date | null,
): Promise<number> {
  const windowStart = getUsageWindowStart(usageResetAt);
  const result = await db
    .select({ count: count() })
    .from(batchJobs)
    .where(
      and(
        eq(batchJobs.companyId, companyId),
        eq(batchJobs.batchType, "tender_matching"),
        gte(batchJobs.createdAt, windowStart),
        notInArray(batchJobs.status, ["failed", "cancelled"]),
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
