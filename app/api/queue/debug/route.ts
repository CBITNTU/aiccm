/* eslint-disable @typescript-eslint/no-explicit-any -- batch_jobs/processing_queue not in generated Supabase types */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createApiClient } from "@/lib/api";
import { getBatchStatus } from "@/lib/services/queueService";
import { logApiEvent } from "@/lib/services/eventLogger";

/**
 * Debug endpoint to check queue and batch status
 * GET /api/queue/debug?batchId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    let userId: string | undefined;
    try {
      const supabaseAuth = await createApiClient();
      const {
        data: { user },
      } = await supabaseAuth.auth.getUser();
      userId = user?.id;
    } catch {
      // Optional auth
    }

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batchId");

    const adminSupabase = createAdminClient();

    if (batchId) {
      // Get batch status
      const batch = await getBatchStatus(batchId);

      // Get jobs in this batch
      const { data: jobs, error: jobsError } = await adminSupabase
        .from("processing_queue" as any)
        .select("id, job_type, status, batch_id, created_at, completed_at")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: false })
        .limit(20);

      // Count jobs by status
      const { data: allJobs } = await adminSupabase
        .from("processing_queue" as any)
        .select("status")
        .eq("batch_id", batchId);

      const statusCounts = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      };

      (allJobs || []).forEach((job: unknown) => {
        const j = job as { status: string };
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
        recentJobs: jobs || [],
        errors: jobsError ? [jobsError.message] : [],
      });
    }

    // Get all batches
    const { data: batches, error: batchesError } = await adminSupabase
      .from("batch_jobs" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    // Get queue stats
    const { data: queueStats, error: queueError } = await adminSupabase
      .from("processing_queue" as any)
      .select("status, batch_id");

    const queueCounts = {
      total: queueStats?.length || 0,
      withBatch: (queueStats || []).filter(
        (j: unknown) => (j as { batch_id: string | null }).batch_id,
      ).length,
      withoutBatch: (queueStats || []).filter(
        (j: unknown) => !(j as { batch_id: string | null }).batch_id,
      ).length,
      byStatus: {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      },
    };

    (queueStats || []).forEach((job: unknown) => {
      const j = job as { status: string };
      if (j.status === "pending") queueCounts.byStatus.pending++;
      else if (j.status === "processing") queueCounts.byStatus.processing++;
      else if (j.status === "completed") queueCounts.byStatus.completed++;
      else if (j.status === "failed") queueCounts.byStatus.failed++;
    });

    await logApiEvent(request, {
      actionType: "queue_debug_viewed",
      userId: userId || undefined,
      details: {
        batch_count: (batches || []).length,
        queue_total: queueCounts.total,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      batches: batches || [],
      queueStats: queueCounts,
      errors: [batchesError?.message, queueError?.message].filter(Boolean),
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
