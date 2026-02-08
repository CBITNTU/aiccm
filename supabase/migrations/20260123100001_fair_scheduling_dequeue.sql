-- Fair scheduling: dequeue from the batch with fewest completed jobs first (round-robin across users).
CREATE OR REPLACE FUNCTION public.dequeue_job_atomic()
RETURNS TABLE (
  id UUID,
  job_type TEXT,
  entity_type TEXT,
  entity_id UUID,
  company_id UUID,
  tender_id UUID,
  batch_id UUID,
  status TEXT,
  priority INTEGER,
  attempts INTEGER,
  max_attempts INTEGER,
  error_message TEXT,
  result_data JSONB,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB
) 
LANGUAGE plpgsql
AS $$
DECLARE
  claimed_job RECORD;
BEGIN
  -- Prefer batch jobs: pick from the batch that has the fewest completed jobs (fair share).
  -- Then by priority and scheduled_at.
  SELECT pq.* INTO claimed_job
  FROM public.processing_queue pq
  LEFT JOIN public.batch_jobs bj ON bj.id = pq.batch_id
  WHERE pq.status = 'pending'
    AND pq.batch_id IS NOT NULL
  ORDER BY COALESCE(bj.completed_jobs, 0) ASC, pq.priority DESC, pq.scheduled_at ASC
  LIMIT 1
  FOR UPDATE OF pq SKIP LOCKED;
  
  IF NOT FOUND THEN
    -- No batch job: take any pending job
    SELECT * INTO claimed_job
    FROM public.processing_queue
    WHERE status = 'pending'
    ORDER BY priority DESC, scheduled_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;
  
  IF FOUND THEN
    UPDATE public.processing_queue
    SET status = 'processing', started_at = now(), updated_at = now()
    WHERE processing_queue.id = claimed_job.id;
    
    RETURN QUERY SELECT 
      claimed_job.id,
      claimed_job.job_type,
      claimed_job.entity_type,
      claimed_job.entity_id,
      claimed_job.company_id,
      claimed_job.tender_id,
      claimed_job.batch_id,
      'processing'::TEXT,
      claimed_job.priority,
      claimed_job.attempts,
      claimed_job.max_attempts,
      claimed_job.error_message,
      claimed_job.result_data,
      claimed_job.scheduled_at,
      now(),
      claimed_job.completed_at,
      claimed_job.created_at,
      now(),
      claimed_job.metadata;
  END IF;
  RETURN;
END;
$$;
