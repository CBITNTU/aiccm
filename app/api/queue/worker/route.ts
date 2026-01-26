import { NextRequest, NextResponse } from "next/server";
import {
  dequeueJob,
  markJobCompleted,
  markJobFailed,
  getQueueStats,
  getBatchStatus,
  type JobType,
} from "@/lib/services/queueService";
import {
  generateTenderSummary,
  generateTenderCapabilityTaxonomy,
} from "@/lib/services/tenderAIService";
import {
  generateCompanySummary,
  generateCompanyCapabilityTaxonomy,
  generateCompanySummaryAndTaxonomy,
} from "@/lib/services/companyAIService";
import { scoreTenderMatch } from "@/lib/services/tenderMatchingService";
import { logEvent } from "@/lib/services/eventLogger";
import { createAdminClient } from "@/lib/api";

async function processJob(job: {
  id: string;
  job_type: JobType;
  entity_id: string;
  company_id?: string | null;
  tender_id?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  switch (job.job_type) {
    case "tender_summary":
      const summary = await generateTenderSummary(job.entity_id);
      return { success: true, summary };

    case "tender_taxonomy":
      const taxonomy = await generateTenderCapabilityTaxonomy(job.entity_id);
      return { success: true, taxonomy };

    case "company_summary":
      // If taxonomy job exists for same company, prefer combined processing
      // For now, keep separate for backward compatibility
      const companySummary = await generateCompanySummary(job.entity_id);
      return { success: true, summary: companySummary };

    case "company_taxonomy":
      // Check if we should use combined generation (when both summary and taxonomy are queued)
      // For now, use separate for backward compatibility
      const fullRegeneration = job.metadata?.fullRegeneration === true;
      const companyTaxonomy = await generateCompanyCapabilityTaxonomy(
        job.entity_id,
        fullRegeneration,
      );
      return { success: true, taxonomy: companyTaxonomy };

    case "company_ai_complete": // New combined job type
      const fullRegen = job.metadata?.fullRegeneration === true;
      const { summary: combinedSummary, taxonomy: combinedTaxonomy } =
        await generateCompanySummaryAndTaxonomy(job.entity_id, fullRegen);
      return {
        success: true,
        summary: combinedSummary,
        taxonomy: combinedTaxonomy,
      };

    case "tender_matching":
      if (!job.company_id || !job.tender_id) {
        throw new Error("Company ID and Tender ID required for matching");
      }
      const score = await scoreTenderMatch(job.company_id, job.tender_id);
      return { success: true, score };

    default:
      throw new Error(`Unknown job type: ${job.job_type}`);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const {
      batchSize = 10, // Small batch for quick processing
      maxDurationMs = 50000, // Stop before Vercel's 60s timeout (50s to be safe)
      selfTrigger = true, // Self-trigger to continue processing
      concurrency = 5, // Lower concurrency for reliability
    } = await request.json().catch(() => ({}));

    console.log(
      `🔄 Queue worker started: batchSize=${batchSize}, maxDurationMs=${maxDurationMs}, selfTrigger=${selfTrigger}, concurrency=${concurrency}`,
    );

    const processed: string[] = [];
    const errors: Array<{ jobId: string; error: string }> = [];
    let hasMoreJobs = false;

    // Process jobs until we run out of time or jobs
    while (Date.now() - startTime < maxDurationMs) {
      // First, collect a batch of jobs
      const jobsToProcess: Array<{
        id: string;
        job_type: string;
        entity_id: string;
        company_id: string | null;
        tender_id: string | null;
        batch_id: string | null;
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
        if (job.batch_id) {
          const batchStatus = await getBatchStatus(job.batch_id);
          if (batchStatus) {
            // Check if batch is already complete
            if (
              batchStatus.status === "completed" ||
              batchStatus.status === "failed"
            ) {
              console.log(
                `🛑 Skipping job ${job.id} - batch ${job.batch_id} is already ${batchStatus.status} (${batchStatus.completedJobs + batchStatus.failedJobs}/${batchStatus.totalJobs})`,
              );
              // Mark job as failed/cancelled and delete it
              await markJobFailed(
                job.id,
                `Batch ${job.batch_id} is already ${batchStatus.status}`,
              );
              continue;
            }

            // Also check if batch has already reached its job limit
            const totalProcessed =
              batchStatus.completedJobs + batchStatus.failedJobs;
            if (totalProcessed >= batchStatus.totalJobs) {
              console.log(
                `🛑 Skipping job ${job.id} - batch ${job.batch_id} has reached its limit (${totalProcessed}/${batchStatus.totalJobs})`,
              );
              // Mark batch as completed if not already
              if (batchStatus.status === "processing") {
                const adminSupabase = createAdminClient();
                await adminSupabase
                  .from("batch_jobs" as any)
                  .update({
                    status: "completed",
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", job.batch_id);
              }
              // Mark job as failed/cancelled
              await markJobFailed(
                job.id,
                `Batch ${job.batch_id} has reached its job limit`,
              );
              continue;
            }
          }
        }

        jobsToProcess.push({
          id: job.id,
          job_type: job.job_type,
          entity_id: job.entity_id,
          company_id: job.company_id,
          tender_id: job.tender_id,
          batch_id: job.batch_id,
          metadata: job.metadata || null,
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
          // Check if job has a batch_id and if that batch is already completed
          // This prevents processing jobs from old/completed batches
          if (job.batch_id) {
            const batchStatus = await getBatchStatus(job.batch_id);
            if (
              batchStatus &&
              (batchStatus.status === "completed" ||
                batchStatus.status === "failed")
            ) {
              console.log(
                `⏭️ Skipping job ${job.id} - batch ${job.batch_id} is already ${batchStatus.status}`,
              );
              // Mark job as cancelled
              await markJobFailed(
                job.id,
                `Batch ${job.batch_id} is already ${batchStatus.status}`,
              );
              return { jobId: job.id, success: false, skipped: true };
            }
          }

          console.log(`🔄 Processing job ${job.id} (${job.job_type})`);

          // Note: Job is already marked as 'processing' by dequeueJob() atomic function
          // No need to call markJobProcessing() again

          // Process the job
          const result = await processJob({
            id: job.id,
            job_type: job.job_type as JobType,
            entity_id: job.entity_id,
            company_id: job.company_id,
            tender_id: job.tender_id,
            metadata: job.metadata || null,
          });

          // Mark as completed
          await markJobCompleted(job.id, result);
          processed.push(job.id);

          // Log job completion (fire and forget)
          logEvent({
            actionType: "queue_job_completed",
            entityType: job.job_type.includes("tender")
              ? "tender"
              : job.job_type.includes("company")
                ? "company"
                : undefined,
            entityId: job.entity_id,
            details: {
              jobId: job.id,
              jobType: job.job_type,
            },
          }).catch(() => {}); // Don't fail if logging fails

          return { jobId: job.id, success: true };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          console.error(`❌ Error processing job ${job.id}:`, errorMessage);
          try {
            await markJobFailed(job.id, errorMessage);
          } catch (markError) {
            console.error(
              `❌ Failed to mark job ${job.id} as failed:`,
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

    // Self-trigger next worker if there are more jobs to process
    if (selfTrigger && hasMoreJobs) {
      const workerUrl = `${process.env.PLATFORM_URL || "http://localhost:3000"}/api/queue/worker`;
      console.log(
        `🔄 Self-triggering next worker (${stats.pending} pending, ${stats.processing} processing)`,
      );

      // Fire-and-forget trigger - cron is backup if this fails
      fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchSize,
          maxDurationMs,
          selfTrigger: true,
          concurrency,
        }),
      }).catch((err) => {
        console.error("❌ Self-trigger failed (cron will recover):", err);
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

// GET endpoint to check queue stats
export async function GET() {
  try {
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
