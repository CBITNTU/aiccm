import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedUser,
  checkSuperadminRole,
  createAdminClient,
} from "@/lib/api";
import { enqueueBatch } from "@/lib/services/queueService";
import { logApiEvent } from "@/lib/services/eventLogger";

// Helper to get base URL
function getBaseUrl(): string {
  if (process.env.PLATFORM_URL) {
    return process.env.PLATFORM_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Check if user is superadmin
    const isSuperadmin = await checkSuperadminRole(user.id);
    if (!isSuperadmin) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Superadmin access required" },
        { status: 403 },
      );
    }

    const { tenderIds } = await request.json().catch(() => ({}));

    const adminSupabase = createAdminClient();

    // Clear all existing jobs and batches from the queue before starting new regeneration
    console.log(
      "🗑️ Clearing all existing jobs and batches from processing queue...",
    );

    // Delete all jobs using a condition that matches all rows
    // Using 'gte' (greater than or equal) with empty string ensures we match all UUIDs
    const { error: deleteJobsError, count: jobsDeleted } = await adminSupabase
      .from("processing_queue" as any)
      .delete()
      .gte("created_at", "1970-01-01"); // Match all rows (all dates are after 1970)

    if (deleteJobsError) {
      console.error("⚠️ Failed to clear existing jobs:", deleteJobsError);
      throw new Error(
        `Failed to clear existing jobs: ${deleteJobsError.message}`,
      );
    } else {
      console.log(
        `✅ Cleared ${jobsDeleted || "all"} existing jobs from processing queue`,
      );
    }

    // Also clear old batch records
    const { error: deleteBatchesError, count: batchesDeleted } =
      await adminSupabase
        .from("batch_jobs" as any)
        .delete()
        .gte("created_at", "1970-01-01"); // Match all rows

    if (deleteBatchesError) {
      console.error("⚠️ Failed to clear existing batches:", deleteBatchesError);
      // Don't fail the request for batches, just log
    } else {
      console.log(
        `✅ Cleared ${batchesDeleted || "all"} existing batch records`,
      );
    }

    // If no tender IDs provided, get all tenders
    let tendersToProcess: string[] = [];

    if (tenderIds && Array.isArray(tenderIds) && tenderIds.length > 0) {
      tendersToProcess = tenderIds;
    } else {
      const { data: allTenders, error } = await adminSupabase
        .from("tenders" as any)
        .select("id");

      if (error) {
        throw new Error(`Failed to fetch tenders: ${error.message}`);
      }

      tendersToProcess = (
        (allTenders || []) as unknown as { id: string }[]
      ).map((t) => t.id);
    }

    // Queue summary and taxonomy jobs for each tender
    const jobs = tendersToProcess.flatMap((tenderId) => [
      {
        jobType: "tender_summary" as const,
        entityType: "tender" as const,
        entityId: tenderId,
        priority: 5,
      },
      {
        jobType: "tender_taxonomy" as const,
        entityType: "tender" as const,
        entityId: tenderId,
        priority: 5,
      },
    ]);

    const { batchId } = await enqueueBatch(
      jobs,
      "tender_ai_regeneration",
      user.id,
    );

    // Trigger worker to start processing continuously (fire and forget)
    // This will process jobs in batches until the queue is empty
    const baseUrl = getBaseUrl();

    console.log(`🚀 Triggering queue worker at ${baseUrl}/api/queue/worker`);
    fetch(`${baseUrl}/api/queue/worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchSize: 10, continuous: true }),
    })
      .then((res) => {
        console.log(`✅ Queue worker triggered, status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        console.log(`📊 Queue worker response:`, data);
      })
      .catch((err) => {
        console.error("❌ Failed to trigger queue worker:", err);
        // Don't fail the request if worker trigger fails
      });

    // Log admin action
    await logApiEvent(request, {
      actionType: "admin_tender_ai_regenerated",
      userId: user.id,
      userEmail: user.email || undefined,
      details: {
        batchId,
        tenderCount: tendersToProcess.length,
        jobCount: jobs.length,
        tenderIds: tenderIds && Array.isArray(tenderIds) ? tenderIds : "all",
      },
    });

    return NextResponse.json({
      success: true,
      batchId,
      tenderCount: tendersToProcess.length,
      jobCount: jobs.length,
    });
  } catch (error) {
    console.error("Error regenerating tender AI:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
