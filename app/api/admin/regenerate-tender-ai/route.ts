import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedUser,
  checkSuperadminRole,
} from "@/lib/api";
import { enqueueBatch } from "@/lib/services/queueService";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { batchJobs, processingQueue, tenders } from "@/lib/db/schema/app";
import { gte } from "drizzle-orm";

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

    // Clear all existing jobs and batches from the queue before starting new regeneration
    console.log("Clearing all existing jobs and batches from processing queue...");

    // Delete all jobs
    try {
      await db
        .delete(processingQueue)
        .where(gte(processingQueue.createdAt, new Date("1970-01-01")));
      console.log("Cleared existing jobs from processing queue");
    } catch (deleteJobsError) {
      console.error("Failed to clear existing jobs:", deleteJobsError);
      throw new Error(
        `Failed to clear existing jobs: ${deleteJobsError instanceof Error ? deleteJobsError.message : "Unknown error"}`,
      );
    }

    // Also clear old batch records
    try {
      await db
        .delete(batchJobs)
        .where(gte(batchJobs.createdAt, new Date("1970-01-01")));
      console.log("Cleared existing batch records");
    } catch (deleteBatchesError) {
      console.error("Failed to clear existing batches:", deleteBatchesError);
    }

    // If no tender IDs provided, get all tenders
    let tendersToProcess: string[] = [];

    if (tenderIds && Array.isArray(tenderIds) && tenderIds.length > 0) {
      tendersToProcess = tenderIds;
    } else {
      const allTenders = await db
        .select({ id: tenders.id })
        .from(tenders);

      tendersToProcess = allTenders.map((t) => t.id);
    }

    // Queue one combined AI job per tender (summary + taxonomy in one call)
    const jobs = tendersToProcess.map((tenderId) => ({
      jobType: "tender_ai_complete" as const,
      entityType: "tender" as const,
      entityId: tenderId,
      priority: 5,
    }));

    const { batchId } = await enqueueBatch(
      jobs,
      "tender_ai_regeneration",
      user.id,
    );

    // Trigger worker to start processing continuously (fire and forget)
    const baseUrl = getBaseUrl();

    console.log(`Triggering queue worker at ${baseUrl}/api/queue/worker`);
    fetch(`${baseUrl}/api/queue/worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchSize: 10, continuous: true }),
    })
      .then((res) => {
        console.log(`Queue worker triggered, status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        console.log(`Queue worker response:`, data);
      })
      .catch((err) => {
        console.error("Failed to trigger queue worker:", err);
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
