import { NextRequest } from "next/server";
import { getAuthenticatedUser, apiResponse, apiError } from "@/lib/api";
import { getBatchStatus } from "@/lib/services/queueService";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { batchJobs, processingQueue } from "@/lib/db/schema/app";
import { eq, and, inArray } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError("Unauthorized", 401);
    }

    const body = await request.json().catch(() => ({}));
    const batchId = body.batchId;

    if (!batchId) {
      return apiError("Batch ID is required", 400);
    }

    const batchStatus = await getBatchStatus(batchId);

    if (!batchStatus) {
      return apiError("Batch not found", 404);
    }

    // Verify user has access to this batch (owner or team member)
    if (batchStatus.companyId) {
      const { isCompanyMember } = await import("@/lib/api/validation");
      const hasAccess = await isCompanyMember(user.id, batchStatus.companyId);
      if (!hasAccess) {
        return apiError("Access denied", 403);
      }
    }

    // Only allow cancelling if batch is still processing
    if (batchStatus.status !== "processing") {
      return apiError(`Batch is already ${batchStatus.status}`, 400);
    }

    // Mark batch as failed (cancelled)
    await db
      .update(batchJobs)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(batchJobs.id, batchId));

    // Cancel all pending/processing jobs in this batch
    const cancelResult = await db
      .update(processingQueue)
      .set({
        status: "failed",
        errorMessage: "Cancelled by user",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(processingQueue.batchId, batchId),
          inArray(processingQueue.status, ["pending", "processing"]),
        ),
      )
      .returning({ id: processingQueue.id });

    const cancelledCount = cancelResult.length;
    console.log(`✅ Cancelled ${cancelledCount} jobs for batch ${batchId}`);

    await logApiEvent(request, {
      actionType: "matching_cancelled",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "batch_job",
      entityId: batchId,
      details: { cancelled_jobs: cancelledCount },
    }).catch(() => {});

    return apiResponse({
      message: "Matching cancelled successfully",
      batchId: batchId,
      cancelledJobs: cancelledCount,
    });
  } catch (error) {
    console.error("Error cancelling matching:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
