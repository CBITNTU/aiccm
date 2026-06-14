import { db } from "@/lib/db";
import { processingQueue, batchJobs } from "@/lib/db/schema/app";
import { dequeueJobAtomic, incrementBatchProgress } from "@/lib/db/raw";
import { eq, and, inArray, desc, asc, lt, isNotNull } from "drizzle-orm";

// Drizzle-inferred types (camelCase)
type ProcessingQueue = typeof processingQueue.$inferSelect;

export type JobType =
  | "tender_summary"
  | "tender_taxonomy"
  | "tender_ai_complete" // Combined tender summary + taxonomy in one call
  | "company_summary"
  | "company_taxonomy"
  | "company_ai_complete" // Combined summary + taxonomy in one call
  | "tender_matching"
  | "compute_embedding"; // Local pgvector embedding of a company or tender

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface EnqueueJobOptions {
  jobType: JobType;
  entityType: "tender" | "company";
  entityId: string;
  companyId?: string; // For matching jobs
  tenderId?: string; // For matching jobs
  priority?: number;
  scheduledAt?: Date;
  metadata?: Record<string, unknown>; // For job-specific options (e.g., fullRegeneration)
}

export interface BatchStatus {
  id: string;
  batchType: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  companyId: string | null;
  status: "processing" | "completed" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Map a snake_case row from raw SQL (dequeueJobAtomic) to camelCase ProcessingQueue shape.
 */
function mapRawToProcessingQueue(
  raw: Record<string, unknown>,
): ProcessingQueue {
  return {
    id: raw.id as string,
    jobType: raw.job_type as string,
    entityType: raw.entity_type as string,
    entityId: raw.entity_id as string,
    companyId: (raw.company_id as string | null) ?? null,
    tenderId: (raw.tender_id as string | null) ?? null,
    batchId: (raw.batch_id as string | null) ?? null,
    status: raw.status as string,
    priority: (raw.priority as number | null) ?? 0,
    attempts: (raw.attempts as number | null) ?? 0,
    maxAttempts: (raw.max_attempts as number | null) ?? 3,
    errorMessage: (raw.error_message as string | null) ?? null,
    resultData: (raw.result_data as Record<string, unknown> | null) ?? null,
    metadata: (raw.metadata as Record<string, unknown> | null) ?? null,
    scheduledAt: raw.scheduled_at ? new Date(raw.scheduled_at as string) : null,
    startedAt: raw.started_at ? new Date(raw.started_at as string) : null,
    completedAt: raw.completed_at ? new Date(raw.completed_at as string) : null,
    createdAt: raw.created_at ? new Date(raw.created_at as string) : null,
    updatedAt: raw.updated_at ? new Date(raw.updated_at as string) : null,
  };
}

/**
 * Enqueue a single job
 */
export async function enqueueJob(options: EnqueueJobOptions): Promise<string> {
  const now = new Date();

  const result = await db
    .insert(processingQueue)
    .values({
      jobType: options.jobType,
      entityType: options.entityType,
      entityId: options.entityId,
      companyId: options.companyId || null,
      tenderId: options.tenderId || null,
      status: "pending",
      priority: options.priority || 0,
      scheduledAt: options.scheduledAt || now,
      metadata: options.metadata || null,
    })
    .returning({ id: processingQueue.id });

  if (!result[0]) {
    throw new Error("Failed to enqueue job: No data returned");
  }

  triggerWorkerIfDev();

  return result[0].id;
}

/**
 * Enqueue multiple jobs and create a batch tracking record
 */
export async function enqueueBatch(
  jobs: EnqueueJobOptions[],
  batchType: string,
  userId?: string,
  companyId?: string,
): Promise<{ batchId: string; jobIds: string[] }> {
  // Create batch job record first
  const batchResult = await db
    .insert(batchJobs)
    .values({
      batchType,
      userId: userId || null,
      companyId: companyId || null,
      totalJobs: jobs.length,
      completedJobs: 0,
      failedJobs: 0,
      status: "processing",
    })
    .returning({ id: batchJobs.id });

  if (!batchResult[0]) {
    throw new Error("Failed to create batch job: No data returned");
  }

  const batchId = batchResult[0].id;
  const now = new Date();

  // Enqueue all jobs with batchId and optional metadata
  const jobInserts = jobs.map((job) => ({
    jobType: job.jobType,
    entityType: job.entityType,
    entityId: job.entityId,
    companyId: job.companyId || null,
    tenderId: job.tenderId || null,
    batchId,
    status: "pending",
    priority: job.priority || 0,
    scheduledAt: job.scheduledAt || now,
    metadata: job.metadata ?? null,
  }));

  const jobResult = await db
    .insert(processingQueue)
    .values(jobInserts)
    .returning({ id: processingQueue.id });

  if (!jobResult.length) {
    throw new Error("Failed to enqueue jobs: No data returned");
  }

  triggerWorkerIfDev();

  return {
    batchId,
    jobIds: jobResult.map((j) => j.id),
  };
}

/**
 * Clear all pending and processing jobs that belong to demo batches.
 * Call before starting a new demo run so only the new batch is processed (avoids mixing OpenAI and Gemini calls).
 * We reset any "processing" demo jobs to "pending" first, then delete all pending demo jobs, so workers
 * that had already claimed jobs from a previous run don't continue processing them.
 */
export async function clearPendingDemoJobs(): Promise<number> {
  const demoBatches = await db
    .select({ id: batchJobs.id })
    .from(batchJobs)
    .where(eq(batchJobs.batchType, "demo"));

  const batchIds = demoBatches.map((b) => b.id);
  if (batchIds.length === 0) return 0;

  // Delete all demo jobs that are pending or processing so no worker continues with an old model.
  // (Processing = already claimed by a worker; we remove them so only the new run's jobs exist.)
  const deleted = await db
    .delete(processingQueue)
    .where(
      and(
        inArray(processingQueue.batchId, batchIds),
        inArray(processingQueue.status, ["pending", "processing"]),
      ),
    )
    .returning({ id: processingQueue.id });

  return deleted.length;
}

/**
 * Get next pending job from queue (ATOMIC - prevents race conditions)
 * Uses database function with SELECT FOR UPDATE SKIP LOCKED to ensure
 * only one worker can claim a job at a time, even with concurrent requests.
 * Prioritizes jobs with batch_id to ensure batch progress tracking works.
 */
export async function dequeueJob(): Promise<ProcessingQueue | null> {
  // Use inline atomic SQL (CTE + FOR UPDATE SKIP LOCKED) to claim a job
  const data = await dequeueJobAtomic();

  if (!data) {
    return null;
  }

  // dequeueJobAtomic returns snake_case from raw SQL, map to camelCase
  return mapRawToProcessingQueue(data as unknown as Record<string, unknown>);
}

/**
 * Fallback method for dequeuing (non-atomic, for backward compatibility)
 * Uses conditional UPDATE to prevent race conditions where multiple workers claim the same job.
 * @deprecated Use dequeueJob() which uses atomic database function
 */
async function _dequeueJobFallback(): Promise<ProcessingQueue | null> {
  const now = new Date();

  // First, try to get a job with batchId (prioritize batch jobs)
  const batchJobRows = await db
    .select()
    .from(processingQueue)
    .where(
      and(
        eq(processingQueue.status, "pending"),
        isNotNull(processingQueue.batchId),
      ),
    )
    .orderBy(desc(processingQueue.priority), asc(processingQueue.scheduledAt))
    .limit(1);

  if (batchJobRows[0]) {
    // Atomically claim the job - only succeeds if status is still 'pending'
    const claimed = await db
      .update(processingQueue)
      .set({
        status: "processing",
        startedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(processingQueue.id, batchJobRows[0].id),
          eq(processingQueue.status, "pending"), // KEY: Only update if still pending
        ),
      )
      .returning();

    if (!claimed[0]) {
      // Another worker claimed it, try again recursively
      console.log(
        `Job ${batchJobRows[0].id} was claimed by another worker, retrying...`,
      );
      return _dequeueJobFallback();
    }

    return claimed[0];
  }

  // If no batch job found, get any pending job (for backward compatibility)
  const pendingRows = await db
    .select()
    .from(processingQueue)
    .where(eq(processingQueue.status, "pending"))
    .orderBy(desc(processingQueue.priority), asc(processingQueue.scheduledAt))
    .limit(1);

  if (!pendingRows[0]) {
    return null;
  }

  // Atomically claim the job - only succeeds if status is still 'pending'
  const claimed = await db
    .update(processingQueue)
    .set({
      status: "processing",
      startedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(processingQueue.id, pendingRows[0].id),
        eq(processingQueue.status, "pending"), // KEY: Only update if still pending
      ),
    )
    .returning();

  if (!claimed[0]) {
    // Another worker claimed it, try again recursively
    console.log(
      `Job ${pendingRows[0].id} was claimed by another worker, retrying...`,
    );
    return _dequeueJobFallback();
  }

  return claimed[0];
}

/**
 * Mark job as processing
 */
export async function markJobProcessing(jobId: string): Promise<void> {
  const now = new Date();
  await db
    .update(processingQueue)
    .set({
      status: "processing",
      startedAt: now,
      updatedAt: now,
    })
    .where(eq(processingQueue.id, jobId));
}

/**
 * Reset job back to pending (e.g. when worker hits time limit before processing it).
 * Use so the job can be picked up by another worker instead of staying stuck in "processing".
 */
export async function resetJobToPending(jobId: string): Promise<void> {
  await db
    .update(processingQueue)
    .set({
      status: "pending",
      startedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(processingQueue.id, jobId));
}

/** Default stale threshold: jobs in "processing" longer than this are considered stuck (ms). */
const STALE_PROCESSING_MS = 15 * 60 * 1000;

/**
 * Reset jobs stuck in "processing" (e.g. worker timed out or crashed) back to "pending"
 * so they can be retried. Call at worker startup to recover from previous runs.
 */
export async function resetStaleProcessingJobs(): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);

  const stale = await db
    .select({ id: processingQueue.id })
    .from(processingQueue)
    .where(
      and(
        eq(processingQueue.status, "processing"),
        lt(processingQueue.startedAt, staleBefore),
      ),
    );

  if (!stale.length) {
    return 0;
  }

  const ids = stale.map((r) => r.id);

  await db
    .update(processingQueue)
    .set({
      status: "pending",
      startedAt: null,
      updatedAt: new Date(),
    })
    .where(inArray(processingQueue.id, ids));

  return ids.length;
}

/**
 * Mark job as completed
 */
export async function markJobCompleted(
  jobId: string,
  resultData?: unknown,
): Promise<void> {
  console.log(`Marking job ${jobId} as completed`);

  const now = new Date();
  const updateData: Partial<typeof processingQueue.$inferInsert> = {
    status: "completed",
    completedAt: now,
    updatedAt: now,
  };

  if (resultData) {
    updateData.resultData = resultData as Record<string, unknown>;
  }

  await db
    .update(processingQueue)
    .set(updateData)
    .where(eq(processingQueue.id, jobId));

  console.log(`Job ${jobId} marked as completed in database`);

  // Update batch job progress if this job is part of a batch
  await updateBatchProgress(jobId, "completed").catch((err) => {
    console.error(`Failed to update batch progress for job ${jobId}:`, err);
    // Don't throw - we don't want to fail the job completion if batch update fails
  });
}

/**
 * Mark job as failed
 */
export async function markJobFailed(
  jobId: string,
  errorMessage: string,
  shouldRetry = true,
): Promise<void> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const attempts = (job.attempts || 0) + 1;
  const maxAttempts = job.maxAttempts || 3;

  if (shouldRetry && attempts < maxAttempts) {
    // Retry - mark as pending again with exponential backoff
    const backoffDelay = Math.min(1000 * Math.pow(2, attempts - 1), 60000); // Max 60s
    const scheduledAt = new Date(Date.now() + backoffDelay);

    await db
      .update(processingQueue)
      .set({
        status: "pending",
        attempts,
        errorMessage,
        scheduledAt,
        updatedAt: new Date(),
      })
      .where(eq(processingQueue.id, jobId));
  } else {
    // Max attempts reached - mark as failed
    const now = new Date();
    await db
      .update(processingQueue)
      .set({
        status: "failed",
        attempts,
        errorMessage,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(processingQueue.id, jobId));

    // Update batch job progress
    await updateBatchProgress(jobId, "failed");
  }
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string): Promise<ProcessingQueue | null> {
  const result = await db
    .select()
    .from(processingQueue)
    .where(eq(processingQueue.id, jobId))
    .limit(1);

  if (!result[0]) {
    return null;
  }

  console.log(`Raw getJob data for ${jobId}:`, JSON.stringify(result[0]));

  return result[0];
}

/**
 * Get jobs by entity
 */
export async function getJobsByEntity(
  entityType: "tender" | "company",
  entityId: string,
): Promise<ProcessingQueue[]> {
  return db
    .select()
    .from(processingQueue)
    .where(
      and(
        eq(processingQueue.entityType, entityType),
        eq(processingQueue.entityId, entityId),
      ),
    )
    .orderBy(desc(processingQueue.createdAt));
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const rows = await db
    .select({ status: processingQueue.status })
    .from(processingQueue);

  const stats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };

  rows.forEach((job) => {
    if (job.status === "pending") stats.pending++;
    else if (job.status === "processing") stats.processing++;
    else if (job.status === "completed") stats.completed++;
    else if (job.status === "failed") stats.failed++;
  });

  return stats;
}

/**
 * Get batch job status
 */
export async function getBatchStatus(
  batchId: string,
): Promise<BatchStatus | null> {
  const result = await db
    .select()
    .from(batchJobs)
    .where(eq(batchJobs.id, batchId))
    .limit(1);

  if (!result[0]) {
    return null;
  }

  const batch = result[0];
  return {
    id: batch.id,
    batchType: batch.batchType,
    totalJobs: batch.totalJobs,
    completedJobs: batch.completedJobs ?? 0,
    failedJobs: batch.failedJobs ?? 0,
    companyId: batch.companyId,
    status: batch.status as "processing" | "completed" | "failed",
    createdAt: batch.createdAt ? new Date(batch.createdAt) : new Date(),
    updatedAt: batch.updatedAt ? new Date(batch.updatedAt) : new Date(),
  };
}

/**
 * Update batch job progress (internal helper)
 * Uses atomic database function to prevent race conditions when multiple jobs complete simultaneously
 */
async function updateBatchProgress(
  jobId: string,
  outcome: "completed" | "failed",
): Promise<void> {
  try {
    console.log(
      `Updating batch progress for job ${jobId} (outcome: ${outcome})`,
    );

    // Get the job to find its batchId
    const job = await getJob(jobId);

    if (!job) {
      console.warn(`Job ${jobId} not found when updating batch progress`);
      return;
    }

    if (!job.batchId) {
      console.log(
        `Job ${jobId} doesn't belong to a batch, skipping batch progress update`,
      );
      return;
    }

    const batchId = job.batchId;
    console.log(`Job ${jobId} belongs to batch ${batchId}`);

    // Use inline atomic SQL to increment counters (prevents race conditions)
    const result = await incrementBatchProgress(batchId, outcome);

    if (!result) {
      console.warn(`Batch ${batchId} not found or update returned no data`);
      return;
    }

    console.log(
      `Atomically updated batch ${batchId}: ${result.completedJobs}/${result.totalJobs} completed, ${result.failedJobs} failed, status: ${result.status}`,
    );

    // If batch is completed/failed, cancel all remaining jobs in this batch
    if (result.status === "completed" || result.status === "failed") {
      console.log(
        `Batch ${batchId} is ${result.status} - cancelling all remaining pending/processing jobs in this batch`,
      );
      const cancelled = await db
        .delete(processingQueue)
        .where(
          and(
            eq(processingQueue.batchId, batchId),
            inArray(processingQueue.status, ["pending", "processing"]),
          ),
        )
        .returning({ id: processingQueue.id });

      console.log(
        `Cancelled ${cancelled.length} remaining jobs for batch ${batchId}`,
      );
    }
  } catch (error) {
    console.error(`Error in updateBatchProgress for job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Fallback method for updating batch progress (non-atomic, for backward compatibility)
 * @deprecated Use updateBatchProgress() which uses atomic database function
 */
async function _updateBatchProgressFallback(
  jobId: string,
  outcome: "completed" | "failed",
): Promise<void> {
  const job = await getJob(jobId);
  if (!job || !job.batchId) {
    return;
  }

  const batchId = job.batchId;
  const batch = await getBatchStatus(batchId);
  if (!batch) {
    return;
  }

  // Calculate new values (non-atomic - may have race conditions)
  const newCompleted =
    outcome === "completed" ? batch.completedJobs + 1 : batch.completedJobs;
  const newFailed =
    outcome === "failed" ? batch.failedJobs + 1 : batch.failedJobs;
  const totalProcessed = newCompleted + newFailed;

  let newStatus: "processing" | "completed" | "failed";
  if (totalProcessed >= batch.totalJobs) {
    newStatus = newFailed === batch.totalJobs ? "failed" : "completed";
  } else {
    newStatus = "processing";
  }

  await db
    .update(batchJobs)
    .set({
      completedJobs: newCompleted,
      failedJobs: newFailed,
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(batchJobs.id, batchId));
}

/**
 * Get jobs for a company (for matching progress tracking)
 */
export async function getMatchingJobsForCompany(companyId: string): Promise<{
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  results: ProcessingQueue[];
}> {
  const jobs = await db
    .select()
    .from(processingQueue)
    .where(
      and(
        eq(processingQueue.companyId, companyId),
        eq(processingQueue.jobType, "tender_matching"),
      ),
    )
    .orderBy(desc(processingQueue.createdAt));

  const stats = {
    total: jobs.length,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    results: jobs,
  };

  jobs.forEach((job) => {
    if (job.status === "pending") stats.pending++;
    else if (job.status === "processing") stats.processing++;
    else if (job.status === "completed") stats.completed++;
    else if (job.status === "failed") stats.failed++;
  });

  return stats;
}

/**
 * In development, trigger the dev queue poller immediately so jobs are
 * picked up without waiting for the next poll interval.
 * Uses dynamic import to avoid circular dependencies.
 */
function triggerWorkerIfDev() {
  if (process.env.NODE_ENV !== "development") return;
  import("@/lib/services/devQueuePoller")
    .then(({ triggerPoll }) => triggerPoll())
    .catch(() => {
      // Poller may not be initialized yet during startup — ignore
    });
}
