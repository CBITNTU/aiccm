import { NextRequest } from "next/server";
import { getAuthenticatedUser, apiResponse, apiError } from "@/lib/api";
import { getBatchStatus } from "@/lib/services/queueService";
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

    const batchStatus = await getBatchStatus(batchId);

    if (!batchStatus) {
      return apiError("Batch not found", 404);
    }

    // Verify user has access to this batch (check if it's their company)
    if (batchStatus.companyId) {
      const { createApiClient } = await import("@/lib/api");
      const supabase = await createApiClient();
      const { data: company } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", batchStatus.companyId)
        .single();

      if (!company || company.user_id !== user.id) {
        return apiError("Access denied", 403);
      }
    }

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
      batch_id: batchId,
      total_jobs: batchStatus.totalJobs,
      completed_jobs: batchStatus.completedJobs,
      failed_jobs: batchStatus.failedJobs,
      status: batchStatus.status,
      progress_percent: progressPercent,
      created_at: batchStatus.createdAt,
      updated_at: batchStatus.updatedAt,
    });
  } catch (error) {
    console.error("Error fetching matching progress:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
