import {
  dequeueJob,
  markJobCompleted,
  markJobFailed,
  resetStaleProcessingJobs,
  getBatchStatus,
  type JobType,
} from "@/lib/services/queueService";
import { processJob } from "@/lib/services/jobProcessor";
import { db } from "@/lib/db";
import { batchJobs } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

const POLL_INTERVAL_MS = 5_000;
const JOBS_PER_CYCLE = 5;

let isProcessing = false;

declare global {
   
  var __devQueueInterval: ReturnType<typeof setInterval> | undefined;
}

async function pollAndProcess() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // Recover stale jobs on each cycle
    const recovered = await resetStaleProcessingJobs().catch(() => 0);
    if (recovered > 0) {
      console.log(`[Dev Queue] Recovered ${recovered} stale job(s)`);
    }

    let processedCount = 0;

    for (let i = 0; i < JOBS_PER_CYCLE; i++) {
      const job = await dequeueJob();
      if (!job) break;

      // Check batch status before processing (same logic as worker route)
      if (job.batchId) {
        const batchStatus = await getBatchStatus(job.batchId);
        if (batchStatus) {
          if (batchStatus.status === "completed" || batchStatus.status === "failed") {
            console.log(
              `[Dev Queue] Skipping job ${job.id} - batch ${job.batchId} is already ${batchStatus.status}`,
            );
            await markJobFailed(job.id, `Batch ${job.batchId} is already ${batchStatus.status}`);
            continue;
          }

          const totalProcessed = batchStatus.completedJobs + batchStatus.failedJobs;
          if (totalProcessed >= batchStatus.totalJobs) {
            console.log(
              `[Dev Queue] Skipping job ${job.id} - batch ${job.batchId} has reached its limit`,
            );
            if (batchStatus.status === "processing") {
              await db
                .update(batchJobs)
                .set({ status: "completed", updatedAt: new Date() })
                .where(eq(batchJobs.id, job.batchId));
            }
            await markJobFailed(job.id, `Batch ${job.batchId} has reached its job limit`);
            continue;
          }
        }
      }

      try {
        console.log(`[Dev Queue] Processing job ${job.id} (${job.jobType})`);
        const result = await processJob({
          id: job.id,
          jobType: job.jobType as JobType,
          entityId: job.entityId,
          companyId: job.companyId,
          tenderId: job.tenderId,
          metadata: (job.metadata as Record<string, unknown> | null) || null,
        });
        await markJobCompleted(job.id, result);
        processedCount++;
        console.log(`[Dev Queue] Job ${job.id} completed`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`[Dev Queue] Job ${job.id} failed:`, errorMessage);
        try {
          await markJobFailed(job.id, errorMessage);
        } catch (markError) {
          console.error(`[Dev Queue] Failed to mark job ${job.id} as failed:`, markError);
        }
      }
    }

    if (processedCount > 0) {
      console.log(`[Dev Queue] Processed ${processedCount} job(s)`);
    }
  } catch (error) {
    console.error("[Dev Queue] Poll cycle error:", error);
  } finally {
    isProcessing = false;
  }
}

export function startDevQueuePoller() {
  // Prevent duplicate pollers during HMR
  if (globalThis.__devQueueInterval) {
    clearInterval(globalThis.__devQueueInterval);
  }

  console.log(
    `[Dev Queue] Starting local queue poller (every ${POLL_INTERVAL_MS / 1000}s)`,
  );

  globalThis.__devQueueInterval = setInterval(pollAndProcess, POLL_INTERVAL_MS);

  // Run once immediately
  pollAndProcess();
}

/**
 * Trigger an immediate poll cycle (called after enqueue in dev mode).
 */
export function triggerPoll() {
  // Small delay to let the enqueue transaction commit
  setTimeout(pollAndProcess, 100);
}
