import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api";
import { getBatchStatus } from "@/lib/services/queueService";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { processingQueue, batchJobs } from "@/lib/db/schema/app";
import { eq, desc } from "drizzle-orm";

/**
 * Debug endpoint to check queue and batch status
 * GET /api/queue/debug?batchId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    let userId: string | undefined;
    try {
      const { user } = await getAuthenticatedUser(request);
      userId = user?.id;
    } catch {
      // Optional auth
    }

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batchId");

    if (batchId) {
      // Get batch status
      const batch = await getBatchStatus(batchId);

      // Get jobs in this batch
      const jobs = await db
        .select({
          id: processingQueue.id,
          jobType: processingQueue.jobType,
          status: processingQueue.status,
          batchId: processingQueue.batchId,
          createdAt: processingQueue.createdAt,
          completedAt: processingQueue.completedAt,
        })
        .from(processingQueue)
        .where(eq(processingQueue.batchId, batchId))
        .orderBy(desc(processingQueue.createdAt))
        .limit(20);

      // Count jobs by status
      const allJobs = await db
        .select({ status: processingQueue.status })
        .from(processingQueue)
        .where(eq(processingQueue.batchId, batchId));

      const statusCounts = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      };

      allJobs.forEach((j) => {
        if (j.status === "pending") statusCounts.pending++;
        else if (j.status === "processing") statusCounts.processing++;
        else if (j.status === "completed") statusCounts.completed++;
        else if (j.status === "failed") statusCounts.failed++;
      });

      await logApiEvent(request, {
        actionType: "queue_debug_viewed",
        userId: userId || undefined,
        entityType: "batch_job",
        entityId: batchId,
        details: { jobCounts: statusCounts },
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        batch,
        jobCounts: statusCounts,
        recentJobs: jobs,
        errors: [],
      });
    }

    // Get all batches
    const batches = await db
      .select()
      .from(batchJobs)
      .orderBy(desc(batchJobs.createdAt))
      .limit(10);

    // Get queue stats
    const queueStats = await db
      .select({ status: processingQueue.status, batchId: processingQueue.batchId })
      .from(processingQueue);

    const queueCounts = {
      total: queueStats.length,
      withBatch: queueStats.filter((j) => j.batchId).length,
      withoutBatch: queueStats.filter((j) => !j.batchId).length,
      byStatus: {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      },
    };

    queueStats.forEach((j) => {
      if (j.status === "pending") queueCounts.byStatus.pending++;
      else if (j.status === "processing") queueCounts.byStatus.processing++;
      else if (j.status === "completed") queueCounts.byStatus.completed++;
      else if (j.status === "failed") queueCounts.byStatus.failed++;
    });

    await logApiEvent(request, {
      actionType: "queue_debug_viewed",
      userId: userId || undefined,
      details: {
        batch_count: batches.length,
        queue_total: queueCounts.total,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      batches,
      queueStats: queueCounts,
      errors: [],
    });
  } catch (error) {
    console.error("Debug endpoint error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
