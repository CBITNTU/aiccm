import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, checkSuperadminRole } from "@/lib/api";
import {
  dequeueJob,
  markJobCompleted,
  markJobFailed,
  resetJobToPending,
  resetStaleProcessingJobs,
  getQueueStats,
  getBatchStatus,
  type JobType,
} from "@/lib/services/queueService";
import {
  generateTenderSummary,
  generateTenderCapabilityTaxonomy,
  generateTenderSummaryAndTaxonomy,
} from "@/lib/services/tenderAIService";
import {
  generateCompanySummary,
  generateCompanyCapabilityTaxonomy,
} from "@/lib/services/companyAIService";
import { scoreTenderMatch } from "@/lib/services/tenderMatchingService";
import { logEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { batchJobs } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

/**
 * Validate that the request is from an authenticated admin or an internal
 * self-trigger (identified by the X-Queue-Secret header).
 */
async function authorizeWorker(request: NextRequest): Promise<boolean> {
  // Allow internal self-triggers via secret header
  const queueSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-queue-secret");
  if (queueSecret && headerSecret === queueSecret) {
    return true;
  }

  // Allow authenticated superadmins
  const { user } = await getAuthenticatedUser(request);
  if (user) {
    return checkSuperadminRole(user.id);
  }

  return false;
}

async function processJob(job: {
  id: string;
  jobType: JobType;
  entityId: string;
  companyId?: string | null;
  tenderId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  switch (job.jobType) {
    case "tender_summary":
      const summary = await generateTenderSummary(job.entityId);
      return { success: true, summary };

    case "tender_taxonomy":
      const taxonomy = await generateTenderCapabilityTaxonomy(job.entityId);
      return { success: true, taxonomy };

    case "tender_ai_complete":
      const { summary: tenderSummary, taxonomy: tenderTaxonomy } =
        await generateTenderSummaryAndTaxonomy(job.entityId);
      return {
        success: true,
        summary: tenderSummary,
        taxonomy: tenderTaxonomy,
      };

    case "company_summary":
      // If taxonomy job exists for same company, prefer combined processing
      // For now, keep separate for backward compatibility
      const companySummary = await generateCompanySummary(job.entityId);
      return { success: true, summary: companySummary };

    case "company_taxonomy":
      // Check if we should use combined generation (when both summary and taxonomy are queued)
      // For now, use separate for backward compatibility
      const fullRegeneration = job.metadata?.fullRegeneration === true;
      const companyTaxonomy = await generateCompanyCapabilityTaxonomy(
        job.entityId,
        fullRegeneration,
      );
      return { success: true, taxonomy: companyTaxonomy };

    case "company_ai_complete":
      // Split into 2 requests: taxonomy first, then summary. Keeps each prompt smaller and more reliable.
      const fullRegen = job.metadata?.fullRegeneration === true;
      // TODO [MERGE]: HEAD used separate calls:
      // const companyTaxonomyIds = await generateCompanyCapabilityTaxonomy(job.entityId, fullRegen);
      // const companySummaryText = await generateCompanySummary(job.entityId);
      const { summary: combinedSummary, taxonomy: combinedTaxonomy } =
        await generateCompanySummaryAndTaxonomy(job.entityId, fullRegen);
      return {
        success: true,
        summary: combinedSummary,
        taxonomy: combinedTaxonomy,
      };

    case "tender_matching": {
      if (!job.companyId || !job.tenderId) {
        throw new Error("Company ID and Tender ID required for matching");
      }
      const meta = (job.metadata ?? {}) as {
        demo?: boolean;
        model?: "gpt-5-nano";
        batchLabel?: string;
        reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
      };
      const score = await scoreTenderMatch(job.companyId, job.tenderId, {
        demo: meta.demo,
        model: meta.model,
        batchLabel: meta.batchLabel,
        reasoningEffort: meta.reasoningEffort,
      });
      return { success: true, score };
    }

    default:
      throw new Error(`Unknown job type: ${job.jobType}`);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authorized = await authorizeWorker(request);
    if (!authorized) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const {
      batchSize = 20, // Increased for higher throughput (was 10)
      maxDurationMs = 50000, // Stop before Vercel's 60s timeout (50s to be safe)
      selfTrigger = true, // Self-trigger to continue processing
      concurrency = 10, // Higher concurrency when using Gemini (was 5)
    } = await request.json().catch(() => ({}));

    console.log(
      `🔄 Queue worker started: batchSize=${batchSize}, maxDurationMs=${maxDurationMs}, selfTrigger=${selfTrigger}, concurrency=${concurrency}`,
    );

    // Recover jobs stuck in "processing" from a previous worker run (e.g. timeout/crash)
    const recovered = await resetStaleProcessingJobs().catch((err) => {
      console.warn("⚠️ resetStaleProcessingJobs failed:", err);
      return 0;
    });
    if (recovered > 0) {
      console.log(`🔄 Recovered ${recovered} stale job(s) to pending`);
    }

    const processed: string[] = [];
    const errors: Array<{ jobId: string; error: string }> = [];
    let hasMoreJobs = false;

    // Process jobs until we run out of time or jobs
    while (Date.now() - startTime < maxDurationMs) {
      // First, collect a batch of jobs
      const jobsToProcess: Array<{
        id: string;
        jobType: string;
        entityId: string;
        companyId: string | null;
        tenderId: string | null;
        batchId: string | null;
        metadata: Record<string, unknown> | null;
      }> = [];

      for (let i = 0; i < batchSize; i++) {
        // Check time before dequeuing each job
        if (Date.now() - startTime >= maxDurationMs - 5000) {
          hasMoreJobs = true;
          break;
        }

        const job = await dequeueJob();
        if (!job) break;

        // CRITICAL: Check if batch is already completed BEFORE adding to queue
        // This prevents dequeuing jobs from completed batches
        if (job.batchId) {
          const batchStatus = await getBatchStatus(job.batchId);
          if (batchStatus) {
            // Check if batch is already complete
            if (
              batchStatus.status === "completed" ||
              batchStatus.status === "failed"
            ) {
              console.log(
                `Skipping job ${job.id} - batch ${job.batchId} is already ${batchStatus.status} (${batchStatus.completedJobs + batchStatus.failedJobs}/${batchStatus.totalJobs})`,
              );
              // Mark job as failed/cancelled and delete it
              await markJobFailed(
                job.id,
                `Batch ${job.batchId} is already ${batchStatus.status}`,
              );
              continue;
            }

            // Also check if batch has already reached its job limit
            const totalProcessed =
              batchStatus.completedJobs + batchStatus.failedJobs;
            if (totalProcessed >= batchStatus.totalJobs) {
              console.log(
                `Skipping job ${job.id} - batch ${job.batchId} has reached its limit (${totalProcessed}/${batchStatus.totalJobs})`,
              );
              // Mark batch as completed if not already
              if (batchStatus.status === "processing") {
                await db
                  .update(batchJobs)
                  .set({
                    status: "completed",
                    updatedAt: new Date(),
                  })
                  .where(eq(batchJobs.id, job.batchId));
              }
              // Mark job as failed/cancelled
              await markJobFailed(
                job.id,
                `Batch ${job.batchId} has reached its job limit`,
              );
              continue;
            }
          }
        }

        jobsToProcess.push({
          id: job.id,
          jobType: job.jobType,
          entityId: job.entityId,
          companyId: job.companyId,
          tenderId: job.tenderId,
          batchId: job.batchId,
          metadata: (job.metadata as Record<string, unknown> | null) || null,
        });
      }

      if (jobsToProcess.length === 0) {
        // No more jobs
        break;
      }

      console.log(
        `📦 Dequeued ${jobsToProcess.length} jobs for parallel processing (elapsed: ${Date.now() - startTime}ms)`,
      );

      // Process jobs in parallel with controlled concurrency
      const processJobWithErrorHandling = async (
        job: (typeof jobsToProcess)[0],
      ) => {
        try {
          // Check if job has a batchId and if that batch is already completed
          // This prevents processing jobs from old/completed batches
          if (job.batchId) {
            const batchStatus = await getBatchStatus(job.batchId);
            if (
              batchStatus &&
              (batchStatus.status === "completed" ||
                batchStatus.status === "failed")
            ) {
              console.log(
                `Skipping job ${job.id} - batch ${job.batchId} is already ${batchStatus.status}`,
              );
              // Mark job as cancelled
              await markJobFailed(
                job.id,
                `Batch ${job.batchId} is already ${batchStatus.status}`,
              );
              return { jobId: job.id, success: false, skipped: true };
            }
          }

          console.log(`Processing job ${job.id} (${job.jobType})`);

          // Note: Job is already marked as 'processing' by dequeueJob() atomic function
          // No need to call markJobProcessing() again

          // Process the job
          const result = await processJob({
            id: job.id,
            jobType: job.jobType as JobType,
            entityId: job.entityId,
            companyId: job.companyId,
            tenderId: job.tenderId,
            metadata: job.metadata || null,
          });

          // Mark as completed
          await markJobCompleted(job.id, result);
          processed.push(job.id);

          // Log job completion (fire and forget)
          logEvent({
            actionType: "queue_job_completed",
            entityType: job.jobType.includes("tender")
              ? "tender"
              : job.jobType.includes("company")
                ? "company"
                : undefined,
            entityId: job.entityId,
            details: {
              jobId: job.id,
              jobType: job.jobType,
            },
          }).catch(() => {}); // Don't fail if logging fails

          return { jobId: job.id, success: true };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          console.error(`Error processing job ${job.id}:`, errorMessage);
          try {
            await markJobFailed(job.id, errorMessage);
          } catch (markError) {
            console.error(
              `Failed to mark job ${job.id} as failed:`,
              markError,
            );
          }
          errors.push({ jobId: job.id, error: errorMessage });
          return { jobId: job.id, success: false, error: errorMessage };
        }
      };

      // Process jobs with controlled concurrency using Promise.all with chunks
      const chunks: Array<typeof jobsToProcess> = [];
      for (let i = 0; i < jobsToProcess.length; i += concurrency) {
        chunks.push(jobsToProcess.slice(i, i + concurrency));
      }

      for (const chunk of chunks) {
        // Check time before processing each chunk
        if (Date.now() - startTime >= maxDurationMs - 5000) {
          console.log(
            `⏱️ Time limit approaching, stopping before chunk (elapsed: ${Date.now() - startTime}ms)`,
          );
          hasMoreJobs = true;
          // Return unprocessed jobs to pending so they are not stuck in "processing"
          const processedIds = new Set(processed);
          const errorIds = new Set(errors.map((e) => e.jobId));
          const unprocessed = jobsToProcess.filter(
            (j) => !processedIds.has(j.id) && !errorIds.has(j.id),
          );
          for (const job of unprocessed) {
            try {
              await resetJobToPending(job.id);
              console.log(
                `🔄 Returned job ${job.id} to pending (time limit before processing)`,
              );
            } catch (err) {
              console.error(
                `❌ Failed to return job ${job.id} to pending:`,
                err,
              );
            }
          }
          break;
        }
        await Promise.all(chunk.map(processJobWithErrorHandling));
      }

      console.log(
        `✅ Batch complete: ${jobsToProcess.length} jobs processed (${processed.length} succeeded, ${errors.length} failed, elapsed: ${Date.now() - startTime}ms)`,
      );

      // Check if we're running out of time
      if (Date.now() - startTime >= maxDurationMs - 10000) {
        console.log(`⏱️ Approaching time limit, will check for more jobs`);
        hasMoreJobs = true;
        break;
      }
    }

    const stats = await getQueueStats();
    console.log(`📊 Queue stats:`, stats);

    // Check if there are more pending jobs
    if (stats.pending > 0 || stats.processing > 0) {
      hasMoreJobs = true;
    }

    // Self-trigger 2 parallel workers when more jobs remain (fair scheduling + throughput)
    if (selfTrigger && hasMoreJobs) {
      const workerUrl = `${process.env.PLATFORM_URL || "http://localhost:3000"}/api/queue/worker`;
      const payload = {
        batchSize,
        maxDurationMs,
        selfTrigger: true,
        concurrency,
      };
      console.log(
        `🔄 Triggering 2 parallel workers (${stats.pending} pending, ${stats.processing} processing)`,
      );
      const triggerHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (process.env.CRON_SECRET) {
        triggerHeaders["x-queue-secret"] = process.env.CRON_SECRET;
      }
      [1, 2].forEach(() => {
        fetch(workerUrl, {
          method: "POST",
          headers: triggerHeaders,
          body: JSON.stringify(payload),
        }).catch((err) => {
          console.error("❌ Worker trigger failed (cron will recover):", err);
        });
      });
    }

    return NextResponse.json({
      success: true,
      processed: processed.length,
      errorCount: errors.length,
      processedIds: processed,
      errorDetails: errors,
      queueStats: stats,
      elapsedMs: Date.now() - startTime,
      selfTriggered: selfTrigger && hasMoreJobs,
    });
  } catch (error) {
    console.error("Queue worker error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        elapsedMs: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}

// GET endpoint to check queue stats (admin only)
export async function GET(request: NextRequest) {
  try {
    const authorized = await authorizeWorker(request);
    if (!authorized) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    const stats = await getQueueStats();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error("Failed to get queue stats:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
