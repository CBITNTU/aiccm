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

    // RESET CAPABILITIES LIST: Delete all capabilities NOT in base categories
    // This happens FIRST before queuing jobs, so the list resets immediately
    // Using VERY BROAD, SIMPLE categories only - keep it minimal!
    console.log("🔄 Resetting capabilities list to base categories only...");
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

    // Delete all capabilities NOT in base categories
    // First get all capabilities, then delete ones not in base categories
    console.log(
      "📋 Fetching all capabilities to check what needs to be deleted...",
    );
    const { data: allCaps, error: fetchError } = await adminSupabase
      .from("company_capabilities_ref" as any)
      .select("id, name, category")
      .order("category")
      .order("name");

    if (fetchError) {
      console.error("⚠️ Failed to fetch capabilities for reset:", fetchError);
      // Continue anyway
    } else if (allCaps && Array.isArray(allCaps)) {
      console.log(`📊 Found ${allCaps.length} total capabilities in database`);

      // Log all categories found
      const allCategories = Array.from(
        new Set(allCaps.map((cap: any) => cap.category)),
      );
      console.log(
        `📂 Categories found (${allCategories.length}):`,
        allCategories,
      );

      const capsToDelete = allCaps
        .filter((cap: any) => !baseCategories.includes(cap.category))
        .map((cap: any) => ({
          id: cap.id,
          name: cap.name,
          category: cap.category,
        }));

      console.log(`🗑️ Capabilities to delete: ${capsToDelete.length}`);
      if (capsToDelete.length > 0) {
        console.log(
          "🗑️ Deleting capabilities:",
          capsToDelete.map((c) => `${c.name} (${c.category})`).slice(0, 10),
        );
        if (capsToDelete.length > 10) {
          console.log(`   ... and ${capsToDelete.length - 10} more`);
        }

        const idsToDelete = capsToDelete.map((c) => c.id);
        const { error: deleteCapsError, count } = await adminSupabase
          .from("company_capabilities_ref" as any)
          .delete()
          .in("id", idsToDelete);

        if (deleteCapsError) {
          console.error("⚠️ Failed to reset capabilities:", deleteCapsError);
          // Don't fail - continue with regeneration
        } else {
          console.log(
            `✅ Reset capabilities list: deleted ${count || capsToDelete.length} custom capabilities`,
          );

          // Verify deletion by fetching again
          const { data: remainingCaps } = await adminSupabase
            .from("company_capabilities_ref" as any)
            .select("id, name, category")
            .order("category");

          if (remainingCaps) {
            const remainingCategories = Array.from(
              new Set(remainingCaps.map((cap: any) => cap.category)),
            );
            console.log(
              `✅ After reset: ${remainingCaps.length} capabilities remaining`,
            );
            console.log(
              `✅ Remaining categories (${remainingCategories.length}):`,
              remainingCategories,
            );
          }
        }
      } else {
        console.log(
          "✅ No custom capabilities to delete - all are in base categories",
        );
      }
    } else {
      console.log("⚠️ No capabilities found or invalid data structure");
    }

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
        batchSize: 50, // Increased batch size for faster processing
        continuous: true,
        concurrency: 15, // Process 15 jobs in parallel (higher concurrency)
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
