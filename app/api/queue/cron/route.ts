/* eslint-disable @typescript-eslint/no-explicit-any -- processing_queue, batch_jobs not in generated types */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/api";

/**
 * Cron endpoint to maintain queue health:
 * 1. Reset stuck jobs (processing for > 10 minutes) back to pending
 * 2. Trigger worker to process pending jobs
 *
 * Configure in vercel.json to run every 5 minutes.
 * See vercel.json for cron schedule configuration.
 */

const STUCK_JOB_TIMEOUT_MINUTES = 10;

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret in production to prevent unauthorized calls
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // In production, require authorization
    if (process.env.NODE_ENV === "production" && cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = createAdminClient();
    const results: {
      stuckJobsReset: number;
      workerTriggered: boolean;
      pendingJobs: number;
      processingJobs: number;
    } = {
      stuckJobsReset: 0,
      workerTriggered: false,
      pendingJobs: 0,
      processingJobs: 0,
    };

    // 1. Find and reset stuck jobs (processing for > STUCK_JOB_TIMEOUT_MINUTES)
    const stuckThreshold = new Date(
      Date.now() - STUCK_JOB_TIMEOUT_MINUTES * 60 * 1000,
    ).toISOString();

    const { data: stuckJobs, error: stuckError } = await supabase
      .from("processing_queue" as any)
      .update({
        status: "pending",
        started_at: null,
        updated_at: new Date().toISOString(),
        error_message: `Reset by cron: was stuck in processing for > ${STUCK_JOB_TIMEOUT_MINUTES} minutes`,
      })
      .eq("status", "processing")
      .lt("started_at", stuckThreshold)
      .select("id");

    if (stuckError) {
      console.error("Error resetting stuck jobs:", stuckError);
    } else {
      results.stuckJobsReset = stuckJobs?.length || 0;
      if (results.stuckJobsReset > 0) {
        console.log(`🔄 Reset ${results.stuckJobsReset} stuck jobs`);
      }
    }

    // 2. Check queue stats
    const { data: stats } = await supabase
      .from("processing_queue" as any)
      .select("status");

    if (stats) {
      results.pendingJobs = stats.filter(
        (j: any) => j.status === "pending",
      ).length;
      results.processingJobs = stats.filter(
        (j: any) => j.status === "processing",
      ).length;
    }

    // 3. Trigger worker if there are pending jobs
    if (results.pendingJobs > 0) {
      const baseUrl = process.env.PLATFORM_URL
        ? process.env.PLATFORM_URL
        : "http://localhost:3000";

      try {
        const workerResponse = await fetch(`${baseUrl}/api/queue/worker`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batchSize: 50,
            continuous: true,
            concurrency: 15,
          }),
        });

        results.workerTriggered = workerResponse.ok;

        if (!workerResponse.ok) {
          console.error("Worker trigger failed:", await workerResponse.text());
        } else {
          console.log(
            `✅ Triggered worker for ${results.pendingJobs} pending jobs`,
          );
        }
      } catch (fetchError) {
        console.error("Failed to trigger worker:", fetchError);
        results.workerTriggered = false;
      }
    }

    // 4. Clean up old completed/failed jobs (older than 7 days)
    const cleanupThreshold = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error: cleanupError, count: cleanedUp } = await supabase
      .from("processing_queue" as any)
      .delete()
      .in("status", ["completed", "failed"])
      .lt("completed_at", cleanupThreshold);

    if (cleanupError) {
      console.error("Error cleaning up old jobs:", cleanupError);
    } else if (cleanedUp && cleanedUp > 0) {
      console.log(`🧹 Cleaned up ${cleanedUp} old completed/failed jobs`);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...results,
      message:
        results.stuckJobsReset > 0
          ? `Reset ${results.stuckJobsReset} stuck jobs`
          : results.pendingJobs > 0
            ? `Processing ${results.pendingJobs} pending jobs`
            : "Queue is healthy",
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
