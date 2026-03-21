import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/api";
import { requireAuth, handleApiError, getUserCompanyIds } from "@/lib/api/validation";
import { getMatchingJobsForCompany } from "@/lib/services/queueService";
import { logApiEvent } from "@/lib/services/eventLogger";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    // Get user's companies (owned + team memberships)
    const companyIds = await getUserCompanyIds(user.id);

    if (companyIds.length === 0) {
      return apiError("Company not found for user", 404);
    }

    const companyId = companyIds[0];

    // Get matching jobs status
    const jobs = await getMatchingJobsForCompany(companyId);

    // Calculate estimated time remaining (rough estimate: 5 seconds per job)
    const estimatedSeconds = jobs.processing * 5 + jobs.pending * 5;

    await logApiEvent(request, {
      actionType: "matching_result_viewed",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "company",
      entityId: companyId,
      details: { total: jobs.total, completed: jobs.completed },
    }).catch(() => {});

    return apiResponse({
      success: true,
      total: jobs.total,
      completed: jobs.completed,
      processing: jobs.processing,
      pending: jobs.pending,
      failed: jobs.failed,
      estimatedSeconds,
      results: jobs.results
        .filter((j) => j.status === "completed")
        .map((j) => ({
          tenderId: j.tenderId,
          score: j.resultData as unknown as { overallScore?: number },
          completedAt: j.completedAt,
        })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
