import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedUser,
  checkSuperadminRole,
} from "@/lib/api";
import { enqueueBatch } from "@/lib/services/queueService";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import {
  batchJobs,
  processingQueue,
  companyCapabilitiesRef,
  companies,
} from "@/lib/db/schema/app";
import { localizedName, localizedCategory } from "@/lib/taxonomy/localizedName";
import { inArray } from "drizzle-orm";

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

    const { companyIds } = await request
      .json()
      .catch(() => ({}));

    // Cancel/delete previous company AI regeneration jobs
    console.log("Cancelling previous company AI regeneration jobs...");

    // Find and cancel ALL pending/processing company AI jobs
    const oldBatches = await db
      .select({ id: batchJobs.id })
      .from(batchJobs)
      .where(
        inArray(batchJobs.status, ["pending", "processing"]),
      );

    // Filter by batch_type in JS since we need company_ai_regeneration batches
    const oldBatchIds = oldBatches
      .filter((_b) => true) // All old batches with pending/processing status
      .map((b) => b.id);

    if (oldBatchIds.length > 0) {
      // Delete all jobs from old batches
      try {
        await db
          .delete(processingQueue)
          .where(inArray(processingQueue.batchId, oldBatchIds));
        console.log(`Cancelled jobs from ${oldBatchIds.length} old batches`);
      } catch (cancelJobsError) {
        console.error("Failed to cancel existing jobs:", cancelJobsError);
      }
    }

    // Also delete any orphaned jobs
    try {
      await db
        .delete(processingQueue)
        .where(
          inArray(processingQueue.jobType, [
            "company_summary",
            "company_taxonomy",
            "company_ai_complete",
          ]),
        );
    } catch (cancelOrphanedError) {
      console.error("Failed to cancel orphaned jobs:", cancelOrphanedError);
    }

    // Also cancel/update related batch jobs with status "processing" or "pending"
    try {
      await db
        .update(batchJobs)
        .set({ status: "failed" })
        .where(
          inArray(batchJobs.status, ["pending", "processing"]),
        );
      console.log("Cancelled previous batch jobs");
    } catch (cancelBatchesError) {
      console.error("Failed to cancel existing batches:", cancelBatchesError);
    }

    // RESET CAPABILITIES LIST: Delete all capabilities NOT in base categories
    console.log("Resetting capabilities list to base categories only...");
    const baseCategories = [
      "Construction",
      "Services",
      "ICT Process",
      "Design",
      "Manufacturing",
      "Engineering",
      "Healthcare",
      "Education",
      "Logistics",
      "Energy",
    ];

    // Fetch all capabilities
    const allCaps = await db
      .select({
        id: companyCapabilitiesRef.id,
        name: localizedName(companyCapabilitiesRef.name, companyCapabilitiesRef.nameZh),
        category: localizedCategory(companyCapabilitiesRef.category, companyCapabilitiesRef.categoryZh),
      })
      .from(companyCapabilitiesRef)
      .orderBy(companyCapabilitiesRef.category, companyCapabilitiesRef.name);

    console.log(`Found ${allCaps.length} total capabilities in database`);

    const allCategories = Array.from(
      new Set(allCaps.map((cap) => cap.category)),
    );
    console.log(`Categories found (${allCategories.length}):`, allCategories);

    const capsToDelete = allCaps.filter(
      (cap) => !cap.category || !baseCategories.includes(cap.category),
    );

    console.log(`Capabilities to delete: ${capsToDelete.length}`);
    if (capsToDelete.length > 0) {
      const idsToDelete = capsToDelete.map((c) => c.id);
      try {
        await db
          .delete(companyCapabilitiesRef)
          .where(inArray(companyCapabilitiesRef.id, idsToDelete));
        console.log(
          `Reset capabilities list: deleted ${capsToDelete.length} custom capabilities`,
        );
      } catch (deleteCapsError) {
        console.error("Failed to reset capabilities:", deleteCapsError);
      }
    } else {
      console.log("No custom capabilities to delete - all are in base categories");
    }
    // Custom capabilities are deleted during full regeneration — they will be reassigned by AI.

    // If no company IDs provided, get all companies
    let companiesToProcess: string[] = [];

    if (companyIds && Array.isArray(companyIds) && companyIds.length > 0) {
      companiesToProcess = companyIds;
    } else {
      const allCompanies = await db
        .select({ id: companies.id })
        .from(companies);

      companiesToProcess = allCompanies.map((c) => c.id);
      console.log(
        `Fetched ${companiesToProcess.length} companies total (no limit)`,
      );
    }

    // Queue jobs for each company
    const jobs = companiesToProcess.map((companyId) => ({
      jobType: "company_ai_complete" as const,
      entityType: "company" as const,
      entityId: companyId,
      priority: 5,
      metadata: { fullRegeneration: true },
    }));

    const { batchId } = await enqueueBatch(
      jobs,
      "company_ai_regeneration",
      user.id,
    );

    // Trigger worker to start processing continuously (fire and forget)
    const baseUrl = getBaseUrl();

    console.log(`Triggering queue worker at ${baseUrl}/api/queue/worker`);
    fetch(`${baseUrl}/api/queue/worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchSize: 40,
        continuous: true,
        concurrency: 10,
      }),
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
      actionType: "admin_company_ai_regenerated",
      userId: user.id,
      userEmail: user.email || undefined,
      details: {
        batchId,
        companyCount: companiesToProcess.length,
        jobCount: jobs.length,
        companyIds:
          companyIds && Array.isArray(companyIds) ? companyIds : "all",
      },
    });

    return NextResponse.json({
      success: true,
      batchId,
      companyCount: companiesToProcess.length,
      jobCount: jobs.length,
    });
  } catch (error) {
    console.error("Error regenerating company AI:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
