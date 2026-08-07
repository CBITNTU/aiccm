import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  getUserCompanyIds,
  AuthError,
} from "@/lib/api/validation";
import { getCompanyAccess } from "@/lib/api/companyAccess";
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

    // An explicit companyId is always honored or refused — never quietly
    // rewritten to another company. Falling back to the caller's own company
    // would show an admin their own batch under someone else's account.
    const requested = new URL(request.url).searchParams.get("companyId");

    let companyId: string;
    if (requested) {
      const { hasAccess } = await getCompanyAccess(user.id, requested);
      if (!hasAccess) {
        throw new AuthError("No access to this company");
      }
      companyId = requested;
    } else {
      const companyIds = await getUserCompanyIds(user.id);
      if (companyIds.length === 0) {
        return apiResponse({ batch: null });
      }
      companyId = companyIds[0];
    }

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
