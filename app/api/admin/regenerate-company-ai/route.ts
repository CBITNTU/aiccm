/* eslint-disable @typescript-eslint/no-explicit-any -- profiles, capabilities, queue tables have extended columns */
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

    const { companyIds } = await request
      .json()
      .catch(() => ({}));

    const adminSupabase = createAdminClient();

    // Cancel/delete previous company AI regeneration jobs
    console.log("🗑️ Cancelling previous company AI regeneration jobs...");

    // Find and cancel ALL pending/processing company AI jobs (including already dequeued ones)
    // Delete by batch_type to catch all related jobs
    const { data: oldBatches } = await adminSupabase
      .from("batch_jobs" as any)
      .select("id")
      .eq("batch_type", "company_ai_regeneration")
      .in("status", ["pending", "processing"]);

    const oldBatchIds = (oldBatches || []).map((b: any) => b.id);

    if (oldBatchIds.length > 0) {
      // Delete all jobs from old batches
      const { error: cancelJobsError } = await adminSupabase
        .from("processing_queue" as any)
        .delete()
        .in("batch_id", oldBatchIds);

      if (cancelJobsError) {
        console.error("⚠️ Failed to cancel existing jobs:", cancelJobsError);
      } else {
        console.log(`✅ Cancelled jobs from ${oldBatchIds.length} old batches`);
      }
    }

    // Also delete any orphaned jobs (jobs without batch_id or with old batch_ids)
    const { error: cancelOrphanedError } = await adminSupabase
      .from("processing_queue" as any)
      .delete()
      .in("job_type", [
        "company_summary",
        "company_taxonomy",
        "company_ai_complete",
      ])
      .in("status", ["pending", "processing"]);

    if (cancelOrphanedError) {
      console.error("⚠️ Failed to cancel orphaned jobs:", cancelOrphanedError);
    }

    // Also cancel/update related batch jobs with status "processing" or "pending"
    const { error: cancelBatchesError, count: cancelledBatchesCount } =
      await adminSupabase
        .from("batch_jobs" as any)
        .update({ status: "failed" })
        .eq("batch_type", "company_ai_regeneration")
        .in("status", ["pending", "processing"]);

    if (cancelBatchesError) {
      console.error(
        "⚠️ Failed to cancel existing batches:",
        cancelBatchesError,
      );
      // Don't fail the request, just log
    } else {
      console.log(
        `✅ Cancelled ${cancelledBatchesCount || 0} previous batch jobs`,
      );
    }

    // Do NOT reset/delete capabilities here. The taxonomy is the CSV seed (competency_taxonomy_seed).
    // Use Admin "Reset List" to restore from seed; this action only regenerates company AI (summary + taxonomy assignment).

    // If no company IDs provided, get all companies (with pagination to handle 5000+ companies)
    let companiesToProcess: string[] = [];

    if (companyIds && Array.isArray(companyIds) && companyIds.length > 0) {
      companiesToProcess = companyIds;
    } else {
      // Fetch ALL companies with pagination (no limit)
      const allCompanyIds: string[] = [];
      let page = 0;
      const pageSize = 1000; // Supabase max
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data: companiesPage, error } = await adminSupabase
          .from("companies" as any)
          .select("id")
          .range(from, to);

        if (error) {
          throw new Error(`Failed to fetch companies: ${error.message}`);
        }

        if (!companiesPage || companiesPage.length === 0) {
          hasMore = false;
        } else {
          const pageIds = (
            (companiesPage || []) as unknown as { id: string }[]
          ).map((c) => c.id);
          allCompanyIds.push(...pageIds);

          // Stop if we got less than a full page (no more companies)
          if (companiesPage.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        }
      }

      companiesToProcess = allCompanyIds;
      console.log(
        `📊 Fetched ${companiesToProcess.length} companies total (no limit)`,
      );
    }

    // Queue jobs for each company
    // Use combined job type (company_ai_complete) which generates both summary and taxonomy in ONE API call
    // This is 2x faster and more efficient than separate calls
    const jobs = companiesToProcess.map((companyId) => ({
      jobType: "company_ai_complete" as const,
      entityType: "company" as const,
      entityId: companyId,
      priority: 5,
      metadata: { fullRegeneration: true }, // Always use full regeneration
    }));

    const { batchId } = await enqueueBatch(
      jobs,
      "company_ai_regeneration",
      user.id,
    );

    // Trigger worker to start processing continuously (fire and forget)
    const baseUrl = getBaseUrl();

    console.log(`🚀 Triggering queue worker at ${baseUrl}/api/queue/worker`);
    fetch(`${baseUrl}/api/queue/worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchSize: 30,
        continuous: true,
        concurrency: 5, // Lower concurrency to avoid rate limits and "no response" from the model
      }),
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
      actionType: "admin_company_ai_regenerated" as any,
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
