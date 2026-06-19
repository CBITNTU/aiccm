import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  getUserCompanyIds,
} from "@/lib/api/validation";
import { getActiveMatchingBatchForCompany } from "@/lib/services/queueService";

/**
 * Server-authoritative "is a deep-research run active?" check. Returns the
 * company's currently-processing tender-matching batch (after reconciliation),
 * or null. The client hydrates from this on mount / company change / window
 * focus so the UI always reflects real server state — never a stale localStorage
 * flag or a client-side timer.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    const companyIds = await getUserCompanyIds(user.id);
    if (companyIds.length === 0) {
      return apiResponse({ batch: null });
    }

    // Honor an explicit companyId (multi-company users), but only if the user is
    // a member of it; otherwise fall back to their primary company.
    const requested = new URL(request.url).searchParams.get("companyId");
    const companyId =
      requested && companyIds.includes(requested) ? requested : companyIds[0];

    const batch = await getActiveMatchingBatchForCompany(companyId);

    if (!batch) {
      return apiResponse({ batch: null });
    }

    const totalProcessed = batch.completedJobs + batch.failedJobs;
    const progressPercent =
      batch.totalJobs > 0
        ? Math.round((totalProcessed / batch.totalJobs) * 100)
        : 0;

    return apiResponse({
      batch: {
        batchId: batch.id,
        totalJobs: batch.totalJobs,
        completedJobs: batch.completedJobs,
        failedJobs: batch.failedJobs,
        status: batch.status,
        progressPercent,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
