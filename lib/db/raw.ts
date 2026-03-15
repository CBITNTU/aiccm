import { sql } from "drizzle-orm";
import { db } from "./index";
import { demoMatchingResults } from "./schema";

/**
 * PostGIS-based nearby companies search.
 * Replaces the Supabase RPC `nearby_companies()`.
 */
export async function nearbyCompanies(params: {
  userLat: number;
  userLng: number;
  radiusMiles?: number | null;
  searchText?: string | null;
  companyIds?: string[] | null;
  pageNum?: number;
  pageSize?: number;
}) {
  const {
    userLat,
    userLng,
    radiusMiles = null,
    searchText = null,
    companyIds = null,
    pageNum = 1,
    pageSize = 25,
  } = params;

  const result = await db.execute(
    sql`SELECT * FROM nearby_companies(
      ${userLat}::double precision,
      ${userLng}::double precision,
      ${radiusMiles}::double precision,
      ${searchText}::text,
      ${companyIds ? sql`${companyIds}::uuid[]` : sql`NULL::uuid[]`},
      ${pageNum}::integer,
      ${pageSize}::integer
    )`,
  );

  return result.rows as Array<{
    id: string;
    company_name: string;
    description: string | null;
    key_capabilities: string | null;
    postcode: string | null;
    certifications: string | null;
    equipment: string | null;
    past_projects: string | null;
    is_system_company: boolean;
    status: string | null;
    market_position: string | null;
    safety_rating: string | null;
    digital_maturity: string | null;
    ai_competencies: unknown;
    ai_capabilities: unknown;
    ai_analysis: unknown;
    latitude: number | null;
    longitude: number | null;
    created_at: string;
    updated_at: string;
    user_id: string | null;
    address: string | null;
    companies_house_number: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    website_url: string | null;
    distance_miles: number | null;
    total_count: number;
  }>;
}

/**
 * Truncate demo matching results table.
 * Replaces the Supabase RPC `truncate_demo_matching_results()`.
 */
export async function truncateDemoMatchingResults() {
  await db.delete(demoMatchingResults);
}

/**
 * Atomically dequeue a job from the processing queue.
 * Replaces the Supabase RPC `dequeue_job_atomic()`.
 * Uses SELECT FOR UPDATE SKIP LOCKED for concurrency safety.
 */
export async function dequeueJobAtomic() {
  const result = await db.execute(sql`
    WITH next_job AS (
      SELECT id FROM processing_queue
      WHERE status = 'pending'
        AND (scheduled_at IS NULL OR scheduled_at <= NOW())
      ORDER BY
        (CASE WHEN batch_id IS NOT NULL THEN 0 ELSE 1 END),
        priority DESC,
        scheduled_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE processing_queue
    SET status = 'processing', started_at = NOW(), updated_at = NOW()
    FROM next_job
    WHERE processing_queue.id = next_job.id
    RETURNING processing_queue.*
  `);
  if (!result.rows || result.rows.length === 0) {
    return null;
  }
  return result.rows[0] as {
    id: string;
    job_type: string;
    entity_type: string;
    entity_id: string;
    company_id: string | null;
    tender_id: string | null;
    batch_id: string | null;
    status: string;
    priority: number;
    attempts: number;
    max_attempts: number;
    error_message: string | null;
    result_data: unknown;
    scheduled_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
    metadata: unknown;
  };
}

/**
 * Atomically increment batch progress counters.
 * Replaces the Supabase RPC `increment_batch_progress()`.
 */
export async function incrementBatchProgress(
  batchId: string,
  outcome: "completed" | "failed",
) {
  const result = await db.execute(
    sql`UPDATE batch_jobs
SET
  completed_jobs = completed_jobs + (CASE WHEN ${outcome} = 'completed' THEN 1 ELSE 0 END),
  failed_jobs    = failed_jobs    + (CASE WHEN ${outcome} = 'failed'    THEN 1 ELSE 0 END),
  status = CASE
    WHEN (completed_jobs + failed_jobs + 1) >= total_jobs
    THEN CASE WHEN ${outcome} = 'failed' AND (failed_jobs + 1) = total_jobs THEN 'failed' ELSE 'completed' END
    ELSE 'processing'
  END,
  updated_at = NOW()
WHERE id = ${batchId}::uuid
RETURNING completed_jobs, failed_jobs, total_jobs, status`,
  );
  if (!result.rows || result.rows.length === 0) {
    return null;
  }
  return result.rows[0] as {
    completed_jobs: number;
    failed_jobs: number;
    total_jobs: number;
    status: string;
  };
}
