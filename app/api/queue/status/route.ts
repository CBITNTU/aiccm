import { NextRequest } from "next/server";
import { getAuthenticatedUser, checkSuperadminRole, apiResponse, apiError } from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { processingQueue, batchJobs } from "@/lib/db/schema/app";
import { eq, desc } from "drizzle-orm";

async function requireAdmin(request: NextRequest) {
  const { user } = await getAuthenticatedUser(request);
  if (!user) {
    return null;
  }
  const isAdmin = await checkSuperadminRole(user.id);
  return isAdmin ? user : null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return apiError("Unauthorized", 401);
    }

    // Get job counts by status
    const [allJobs, activeBatches, recentJobs] = await Promise.all([
      db.select({ status: processingQueue.status }).from(processingQueue),
      db
        .select({
          id: batchJobs.id,
          companyId: batchJobs.companyId,
          status: batchJobs.status,
          totalJobs: batchJobs.totalJobs,
          completedJobs: batchJobs.completedJobs,
          failedJobs: batchJobs.failedJobs,
          createdAt: batchJobs.createdAt,
          updatedAt: batchJobs.updatedAt,
        })
        .from(batchJobs)
        .where(eq(batchJobs.status, "processing"))
        .orderBy(desc(batchJobs.createdAt))
        .limit(10),
      db
        .select({
          id: processingQueue.id,
          jobType: processingQueue.jobType,
          status: processingQueue.status,
          batchId: processingQueue.batchId,
          createdAt: processingQueue.createdAt,
          startedAt: processingQueue.startedAt,
          completedAt: processingQueue.completedAt,
          errorMessage: processingQueue.errorMessage,
        })
        .from(processingQueue)
        .orderBy(desc(processingQueue.updatedAt))
        .limit(50),
    ]);

    const pendingCount = allJobs.filter((j) => j.status === "pending").length;
    const processingCount = allJobs.filter((j) => j.status === "processing").length;

    // Get environment info for debugging
    const envInfo = {
      PLATFORM_URL: process.env.PLATFORM_URL || "NOT SET",
      VERCEL_URL: process.env.VERCEL_URL || "NOT SET",
      NODE_ENV: process.env.NODE_ENV,
      hasCronSecret: !!process.env.CRON_SECRET,
    };

    await logApiEvent(request, {
      actionType: "queue_status_viewed",
      userId: user.id,
      details: {
        pending: pendingCount,
        processing: processingCount,
      },
    }).catch(() => {});

    return apiResponse({
      timestamp: new Date().toISOString(),
      environment: envInfo,
      queue: {
        pending: pendingCount,
        processing: processingCount,
      },
      active_batches: activeBatches,
      recent_jobs: recentJobs,
    });
  } catch (error) {
    console.error("Error fetching queue status:", error);
    return apiError(
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}

// POST to manually trigger the worker
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return apiError("Unauthorized", 401);
    }

    // Check if there are pending jobs
    const pendingJobs = await db
      .select({ id: processingQueue.id })
      .from(processingQueue)
      .where(eq(processingQueue.status, "pending"));

    const pendingCount = pendingJobs.length;

    if (pendingCount === 0) {
      return apiResponse({
        message: "No pending jobs to process",
        pending: 0,
        triggered: false,
      });
    }

    // Determine the base URL
    const baseUrl = process.env.PLATFORM_URL || "http://localhost:3000";

    console.log(`🚀 Manually triggering worker at ${baseUrl}/api/queue/worker`);
    console.log(`📊 Pending jobs: ${pendingCount}`);

    // Trigger the worker with secret header for internal auth
    const triggerHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.CRON_SECRET) {
      triggerHeaders["x-queue-secret"] = process.env.CRON_SECRET;
    }

    const workerResponse = await fetch(`${baseUrl}/api/queue/worker`, {
      method: "POST",
      headers: triggerHeaders,
      body: JSON.stringify({
        batchSize: 50,
        continuous: true,
        concurrency: 10,
      }),
    });

    let workerResult = null;
    try {
      workerResult = await workerResponse.json();
    } catch {
      workerResult = { error: "Failed to parse response" };
    }

    await logApiEvent(request, {
      actionType: "queue_status_viewed",
      userId: user.id,
      details: {
        pending: pendingCount,
        triggered: true,
        workerStatus: workerResponse.status,
      },
    }).catch(() => {});

    return apiResponse({
      message: workerResponse.ok
        ? "Worker triggered successfully"
        : "Worker trigger failed",
      pending: pendingCount,
      triggered: true,
      workerUrl: `${baseUrl}/api/queue/worker`,
      workerStatus: workerResponse.status,
      workerResult,
    });
  } catch (error) {
    console.error("Error triggering worker:", error);
    return apiError(
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}
