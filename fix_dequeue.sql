-- Fix the ambiguous column reference in dequeue_job_atomic
-- Run this in your Supabase SQL Editor

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
  -- Use table alias to avoid ambiguity with return columns
  SELECT 
    pq.id,
    pq.job_type,
    pq.entity_type,
    pq.entity_id,
    pq.company_id,
    pq.tender_id,
    pq.batch_id,
    pq.status,
    pq.priority,
    pq.attempts,
    pq.max_attempts,
    pq.error_message,
    pq.result_data,
    pq.scheduled_at,
    pq.started_at,
    pq.completed_at,
    pq.created_at,
    pq.updated_at,
    pq.metadata
  INTO claimed_job
  FROM public.processing_queue pq
  WHERE pq.status = 'pending'
    AND pq.batch_id IS NOT NULL
  ORDER BY pq.priority DESC, pq.scheduled_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  -- If no batch job found, get any pending job
  IF NOT FOUND THEN
    SELECT 
      pq.id,
      pq.job_type,
      pq.entity_type,
      pq.entity_id,
      pq.company_id,
      pq.tender_id,
      pq.batch_id,
      pq.status,
      pq.priority,
      pq.attempts,
      pq.max_attempts,
      pq.error_message,
      pq.result_data,
      pq.scheduled_at,
      pq.started_at,
      pq.completed_at,
      pq.created_at,
      pq.updated_at,
      pq.metadata
    INTO claimed_job
    FROM public.processing_queue pq
    WHERE pq.status = 'pending'
    ORDER BY pq.priority DESC, pq.scheduled_at ASC
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
    
    -- Return the claimed job with updated status
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
