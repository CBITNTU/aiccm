-- Fix race condition in job dequeuing by using atomic SELECT FOR UPDATE SKIP LOCKED
-- This ensures only one worker can claim a job at a time

-- Create function to atomically dequeue and claim a job
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
  -- First, try to get a batch job (prioritize batch jobs)
  SELECT * INTO claimed_job
  FROM public.processing_queue
  WHERE status = 'pending'
    AND batch_id IS NOT NULL
  ORDER BY priority DESC, scheduled_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED; -- Atomic claim: locks row, skips if already locked
  
  -- If no batch job found, get any pending job
  IF NOT FOUND THEN
    SELECT * INTO claimed_job
    FROM public.processing_queue
    WHERE status = 'pending'
    ORDER BY priority DESC, scheduled_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;
  
  -- If we found a job, mark it as processing and return it
  IF FOUND THEN
    UPDATE public.processing_queue
    SET 
      status = 'processing',
      started_at = now(),
      updated_at = now()
    WHERE processing_queue.id = claimed_job.id;
    
    -- Return the claimed job
    RETURN QUERY SELECT 
      claimed_job.id,
      claimed_job.job_type,
      claimed_job.entity_type,
      claimed_job.entity_id,
      claimed_job.company_id,
      claimed_job.tender_id,
      claimed_job.batch_id,
      'processing'::TEXT, -- Return updated status
      claimed_job.priority,
      claimed_job.attempts,
      claimed_job.max_attempts,
      claimed_job.error_message,
      claimed_job.result_data,
      claimed_job.scheduled_at,
      now(), -- Return updated started_at
      claimed_job.completed_at,
      claimed_job.created_at,
      now(), -- Return updated updated_at
      claimed_job.metadata;
  END IF;
  
  -- No job found, return empty result
  RETURN;
END;
$$;

-- Grant execute permission to service role (Supabase uses postgres role)
GRANT EXECUTE ON FUNCTION public.dequeue_job_atomic() TO postgres, anon, authenticated, service_role;
