import { NextRequest } from "next/server";
import { getAuthenticatedUser, apiResponse, apiError } from "@/lib/api";
import { getCompanyAccess } from "@/lib/api/companyAccess";
import { getBatchStatus, reconcileBatch } from "@/lib/services/queueService";
import { logApiEvent } from "@/lib/services/eventLogger";

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError("Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batchId");

    if (!batchId) {
      return apiError("Batch ID is required", 400);
    }

    const existing = await getBatchStatus(batchId);

    if (!existing) {
      return apiError("Batch not found", 404);
    }

    // Verify the caller can see this batch: owner, team member, or a superadmin
    // preparing the account. The trigger route lets a superadmin start a run on
    // a company they don't belong to, so the same rule has to apply here or the
    // progress poll 403s on a batch the caller just created.
    if (existing.companyId) {
      const { hasAccess } = await getCompanyAccess(user.id, existing.companyId);
      if (!hasAccess) {
        return apiError("Access denied", 403);
      }
    }

    // Reconcile a possibly-drifted batch: if it's still "processing" but no live
    // queue jobs remain, the server resolves it to a terminal state. The client
    // relies on this instead of guessing the job is dead.
    const batchStatus = (await reconcileBatch(batchId)) ?? existing;

    // Calculate progress percentage (handle edge cases)
    const totalProcessed = batchStatus.completedJobs + batchStatus.failedJobs;
    const progressPercent =
      batchStatus.totalJobs > 0
        ? Math.round((totalProcessed / batchStatus.totalJobs) * 100)
        : 0;

    await logApiEvent(request, {
      actionType: "matching_result_viewed",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "batch_job",
      entityId: batchId,
      details: {
        progress_percent: progressPercent,
        total_jobs: batchStatus.totalJobs,
      },
    }).catch(() => {});

    return apiResponse({
      batchId: batchId,
      totalJobs: batchStatus.totalJobs,
      completedJobs: batchStatus.completedJobs,
      failedJobs: batchStatus.failedJobs,
      status: batchStatus.status,
      progressPercent: progressPercent,
      createdAt: batchStatus.createdAt,
      updatedAt: batchStatus.updatedAt,
    });
  } catch (error) {
    console.error("Error fetching matching progress:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
