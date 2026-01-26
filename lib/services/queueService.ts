import { createAdminClient } from "@/lib/api";

// Types for processing queue (will be updated after migration generates types)
type ProcessingQueue = {
  id: string;
  job_type: string;
  entity_type: string;
  entity_id: string;
  company_id: string | null;
  tender_id: string | null;
  batch_id: string | null; // Link to batch_jobs
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  result_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null; // For job-specific options
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProcessingQueueInsert = {
  job_type: string;
  entity_type: string;
  entity_id: string;
  company_id?: string | null;
  tender_id?: string | null;
  batch_id?: string | null; // Link to batch_jobs
  status?: string;
  priority?: number;
  attempts?: number;
  max_attempts?: number;
  error_message?: string | null;
  result_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null; // For job-specific options
  scheduled_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
};

type BatchJob = {
  id: string;
  batch_type: string;
  user_id: string | null;
  company_id: string | null;
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  status: string;
  created_at: string;
  updated_at: string;
};

type BatchJobInsert = {
  batch_type: string;
  user_id?: string | null;
  company_id?: string | null;
  total_jobs: number;
  completed_jobs?: number;
  failed_jobs?: number;
  status?: string;
};

export type JobType =
  | "tender_summary"
  | "tender_taxonomy"
  | "company_summary"
  | "company_taxonomy"
  | "company_ai_complete" // Combined summary + taxonomy in one call
  | "tender_matching";

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

const supabase = createAdminClient();

/**
 * Enqueue a single job
 */
export async function enqueueJob(options: EnqueueJobOptions): Promise<string> {
  const job: ProcessingQueueInsert = {
    job_type: options.jobType,
    entity_type: options.entityType,
    entity_id: options.entityId,
    company_id: options.companyId || null,
    tender_id: options.tenderId || null,
    status: "pending",
    priority: options.priority || 0,
    scheduled_at:
      options.scheduledAt?.toISOString() || new Date().toISOString(),
    metadata: options.metadata || null,
  };

  const { data, error } = await supabase
    .from("processing_queue" as any)
    .insert(job)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to enqueue job: ${error.message}`);
  }

  if (!data) {
    throw new Error("Failed to enqueue job: No data returned");
  }

  return (data as unknown as { id: string }).id;
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
  const batchJob: BatchJobInsert = {
    batch_type: batchType,
    user_id: userId || null,
    company_id: companyId || null,
    total_jobs: jobs.length,
    completed_jobs: 0,
    failed_jobs: 0,
    status: "processing",
  };

  const { data: batchData, error: batchError } = await supabase
    .from("batch_jobs" as any)
    .insert(batchJob)
    .select("id")
    .single();

  if (batchError) {
    throw new Error(`Failed to create batch job: ${batchError.message}`);
  }

  if (!batchData) {
    throw new Error("Failed to create batch job: No data returned");
  }

  const batchId = (batchData as unknown as { id: string }).id;

  // Enqueue all jobs with batch_id
  const jobInserts: ProcessingQueueInsert[] = jobs.map((job) => ({
    job_type: job.jobType,
    entity_type: job.entityType,
    entity_id: job.entityId,
    company_id: job.companyId || null,
    tender_id: job.tenderId || null,
    batch_id: batchId, // Link job to batch
    status: "pending",
    priority: job.priority || 0,
    scheduled_at: job.scheduledAt?.toISOString() || new Date().toISOString(),
  }));

  const { data: jobData, error: jobError } = await supabase
    .from("processing_queue" as any)
    .insert(jobInserts)
    .select("id");

  if (jobError) {
    throw new Error(`Failed to enqueue jobs: ${jobError.message}`);
  }

  if (!jobData) {
    throw new Error("Failed to enqueue jobs: No data returned");
  }

  return {
    batchId,
    jobIds: (jobData as unknown as { id: string }[]).map((j) => j.id),
  };
}

/**
 * Get next pending job from queue (ATOMIC - prevents race conditions)
 * Uses database function with SELECT FOR UPDATE SKIP LOCKED to ensure
 * only one worker can claim a job at a time, even with concurrent requests.
 * Prioritizes jobs with batch_id to ensure batch progress tracking works.
 */
export async function dequeueJob(): Promise<ProcessingQueue | null> {
  // Use atomic database function to claim a job
  // This prevents race conditions when multiple workers try to dequeue simultaneously
  const { data, error } = await (supabase.rpc as any)("dequeue_job_atomic");

  if (error) {
    // If function doesn't exist yet, fall back to old method (for backward compatibility)
    if (error.code === "42883" || error.message?.includes("function") || error.message?.includes("does not exist")) {
      console.warn("⚠️ dequeue_job_atomic() function not found, using fallback method (may have race conditions)");
      return dequeueJobFallback();
    }
    throw new Error(`Failed to dequeue job atomically: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return data[0] as unknown as ProcessingQueue;
}

/**
 * Fallback method for dequeuing (non-atomic, for backward compatibility)
 * Uses conditional UPDATE to prevent race conditions where multiple workers claim the same job.
 * @deprecated Use dequeueJob() which uses atomic database function
 */
async function dequeueJobFallback(): Promise<ProcessingQueue | null> {
  // First, try to get a job with batch_id (prioritize batch jobs)
  const { data: batchJob, error: batchError } = await supabase
    .from("processing_queue" as any)
    .select("*")
    .eq("status", "pending")
    .not("batch_id", "is", null)
    .order("priority", { ascending: false })
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (batchError && batchError.code !== "PGRST116") {
    throw new Error(`Failed to dequeue batch job: ${batchError.message}`);
  }

  if (batchJob) {
    // Atomically claim the job - only succeeds if status is still 'pending'
    const { data: claimed, error: claimError } = await supabase
      .from("processing_queue" as any)
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", (batchJob as any).id)
      .eq("status", "pending") // KEY: Only update if still pending
      .select()
      .maybeSingle();

    if (claimError || !claimed) {
      // Another worker claimed it, try again recursively
      console.log(`⚠️ Job ${(batchJob as any).id} was claimed by another worker, retrying...`);
      return dequeueJobFallback();
    }

    return claimed as unknown as ProcessingQueue;
  }

  // If no batch job found, get any pending job (for backward compatibility)
  const { data, error } = await supabase
    .from("processing_queue" as any)
    .select("*")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST116") {
      // No rows returned
      return null;
    }
    throw new Error(`Failed to dequeue job: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  // Atomically claim the job - only succeeds if status is still 'pending'
  const { data: claimed, error: claimError } = await supabase
    .from("processing_queue" as any)
    .update({
      status: "processing",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", (data as any).id)
    .eq("status", "pending") // KEY: Only update if still pending
    .select()
    .maybeSingle();

  if (claimError || !claimed) {
    // Another worker claimed it, try again recursively
    console.log(`⚠️ Job ${(data as any).id} was claimed by another worker, retrying...`);
    return dequeueJobFallback();
  }

  return claimed as unknown as ProcessingQueue;
}

/**
 * Mark job as processing
 */
export async function markJobProcessing(jobId: string): Promise<void> {
  const { error } = await supabase
    .from("processing_queue" as any)
    .update({
      status: "processing",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(`Failed to mark job as processing: ${error.message}`);
  }
}

/**
 * Mark job as completed
 */
export async function markJobCompleted(
  jobId: string,
  resultData?: unknown,
): Promise<void> {
  console.log(`✅ Marking job ${jobId} as completed`);

  const updateData: Partial<ProcessingQueue> = {
    status: "completed",
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (resultData) {
    updateData.result_data = resultData as Record<string, unknown>;
  }

  const { error } = await supabase
    .from("processing_queue" as any)
    .update(updateData)
    .eq("id", jobId);

  if (error) {
    console.error(`❌ Failed to mark job ${jobId} as completed:`, error);
    throw new Error(`Failed to mark job as completed: ${error.message}`);
  }

  console.log(`✅ Job ${jobId} marked as completed in database`);

  // Update batch job progress if this job is part of a batch
  await updateBatchProgress(jobId, "completed").catch((err) => {
    console.error(`❌ Failed to update batch progress for job ${jobId}:`, err);
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
  const maxAttempts = job.max_attempts || 3;

  if (shouldRetry && attempts < maxAttempts) {
    // Retry - mark as pending again with exponential backoff
    const backoffDelay = Math.min(1000 * Math.pow(2, attempts - 1), 60000); // Max 60s
    const scheduledAt = new Date(Date.now() + backoffDelay);

    const { error } = await supabase
      .from("processing_queue" as any)
      .update({
        status: "pending",
        attempts,
        error_message: errorMessage,
        scheduled_at: scheduledAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (error) {
      throw new Error(`Failed to retry job: ${error.message}`);
    }
  } else {
    // Max attempts reached - mark as failed
    const { error } = await supabase
      .from("processing_queue" as any)
      .update({
        status: "failed",
        attempts,
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (error) {
      throw new Error(`Failed to mark job as failed: ${error.message}`);
    }

    // Update batch job progress
    await updateBatchProgress(jobId, "failed");
  }
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string): Promise<ProcessingQueue | null> {
  // Explicitly select batch_id to ensure it's returned
  const { data, error } = await supabase
    .from("processing_queue" as any)
    .select(
      "id, job_type, entity_type, entity_id, company_id, tender_id, batch_id, status, priority, attempts, max_attempts, error_message, result_data, scheduled_at, started_at, completed_at, created_at, updated_at",
    )
    .eq("id", jobId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    console.error(`❌ Error getting job ${jobId}:`, error);
    throw new Error(`Failed to get job: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  // Log raw data to debug
  console.log(`🔍 Raw getJob data for ${jobId}:`, JSON.stringify(data));

  return (data as unknown as ProcessingQueue) || null;
}

/**
 * Get jobs by entity
 */
export async function getJobsByEntity(
  entityType: "tender" | "company",
  entityId: string,
): Promise<ProcessingQueue[]> {
  const { data, error } = await supabase
    .from("processing_queue" as any)
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to get jobs: ${error.message}`);
  }

  return (data || []) as unknown as ProcessingQueue[];
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
  const { data, error } = await supabase
    .from("processing_queue" as any)
    .select("status");

  if (error) {
    throw new Error(`Failed to get queue stats: ${error.message}`);
  }

  const stats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };

  ((data || []) as unknown as { status: string }[]).forEach((job) => {
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
  const { data, error } = await supabase
    .from("batch_jobs" as any)
    .select("*")
    .eq("id", batchId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Failed to get batch status: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const batch = data as unknown as BatchJob;
  return {
    id: batch.id,
    batchType: batch.batch_type,
    totalJobs: batch.total_jobs,
    completedJobs: batch.completed_jobs,
    failedJobs: batch.failed_jobs,
    companyId: batch.company_id,
    status: batch.status as "processing" | "completed" | "failed",
    createdAt: new Date(batch.created_at),
    updatedAt: new Date(batch.updated_at),
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
      `🔄 Updating batch progress for job ${jobId} (outcome: ${outcome})`,
    );

    // Get the job to find its batch_id
    const job = await getJob(jobId);

    if (!job) {
      console.warn(`⚠️ Job ${jobId} not found when updating batch progress`);
      return;
    }

    if (!job.batch_id) {
      console.log(
        `ℹ️ Job ${jobId} doesn't belong to a batch, skipping batch progress update`,
      );
      return;
    }

    const batchId = job.batch_id;
    console.log(`🔄 Job ${jobId} belongs to batch ${batchId}`);

    // Use atomic database function to increment counters (prevents race conditions)
    const { data, error } = await (supabase.rpc as any)("increment_batch_progress", {
      p_batch_id: batchId,
      p_outcome: outcome,
    });

    if (error) {
      // If function doesn't exist yet, fall back to old method (for backward compatibility)
      if (error.code === "42883" || error.message?.includes("function") || error.message?.includes("does not exist")) {
        console.warn("⚠️ increment_batch_progress() function not found, using fallback method (may have race conditions)");
        return updateBatchProgressFallback(jobId, outcome);
      }
      console.error(
        `❌ Failed to update batch progress atomically: ${error.message}`,
        error,
      );
      throw error;
    }

    if (!data || data.length === 0) {
      console.warn(`⚠️ Batch ${batchId} not found or update returned no data`);
      return;
    }

    const result = data[0] as {
      completed_jobs: number;
      failed_jobs: number;
      total_jobs: number;
      status: string;
    };

    console.log(
      `✅ Atomically updated batch ${batchId}: ${result.completed_jobs}/${result.total_jobs} completed, ${result.failed_jobs} failed, status: ${result.status}`,
    );

    // If batch is completed/failed, cancel all remaining jobs in this batch
    if (result.status === "completed" || result.status === "failed") {
      console.log(
        `🛑 Batch ${batchId} is ${result.status} - cancelling all remaining pending/processing jobs in this batch`,
      );
      const { error: cancelError, count: cancelledCount } = await supabase
        .from("processing_queue" as any)
        .delete()
        .eq("batch_id", batchId)
        .in("status", ["pending", "processing"]);

      if (cancelError) {
        console.error(
          `⚠️ Failed to cancel remaining jobs for batch ${batchId}:`,
          cancelError,
        );
      } else {
        console.log(
          `✅ Cancelled ${cancelledCount || 0} remaining jobs for batch ${batchId}`,
        );
      }
    }
  } catch (error) {
    console.error(`❌ Error in updateBatchProgress for job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Fallback method for updating batch progress (non-atomic, for backward compatibility)
 * @deprecated Use updateBatchProgress() which uses atomic database function
 */
async function updateBatchProgressFallback(
  jobId: string,
  outcome: "completed" | "failed",
): Promise<void> {
  const job = await getJob(jobId);
  if (!job || !job.batch_id) {
    return;
  }

  const batchId = job.batch_id;
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

  const { error } = await supabase
    .from("batch_jobs" as any)
    .update({
      completed_jobs: newCompleted,
      failed_jobs: newFailed,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  if (error) {
    throw error;
  }
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
  const { data, error } = await supabase
    .from("processing_queue" as any)
    .select("*")
    .eq("company_id", companyId)
    .eq("job_type", "tender_matching")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to get matching jobs: ${error.message}`);
  }

  const jobs = (data || []) as unknown as ProcessingQueue[];
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
