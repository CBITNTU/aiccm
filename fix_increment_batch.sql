-- Fix the ambiguous column reference in increment_batch_progress
-- Run this in your Supabase SQL Editor

CREATE OR REPLACE FUNCTION public.increment_batch_progress(
  p_batch_id UUID,
  p_outcome TEXT
)
RETURNS TABLE (
  completed_jobs INTEGER,
  failed_jobs INTEGER,
  total_jobs INTEGER,
  status TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_completed INTEGER;
  v_new_failed INTEGER;
  v_total INTEGER;
  v_status TEXT;
BEGIN
  -- Atomically increment counters using SQL arithmetic (prevents race conditions)
  UPDATE public.batch_jobs
  SET
    completed_jobs = CASE 
      WHEN p_outcome = 'completed' THEN batch_jobs.completed_jobs + 1 
      ELSE batch_jobs.completed_jobs 
    END,
    failed_jobs = CASE 
      WHEN p_outcome = 'failed' THEN batch_jobs.failed_jobs + 1 
      ELSE batch_jobs.failed_jobs 
    END,
    updated_at = now()
  WHERE batch_jobs.id = p_batch_id
  RETURNING 
    batch_jobs.completed_jobs,
    batch_jobs.failed_jobs,
    batch_jobs.total_jobs
  INTO v_new_completed, v_new_failed, v_total;

  -- If no row was updated, batch doesn't exist
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Determine status based on new counts
  IF (v_new_completed + v_new_failed) >= v_total THEN
    -- All jobs are done
    IF v_new_failed = v_total THEN
      v_status := 'failed';
    ELSE
      v_status := 'completed';
    END IF;
    
    -- Update status atomically
    UPDATE public.batch_jobs
    SET status = v_status
    WHERE batch_jobs.id = p_batch_id;
  ELSE
    v_status := 'processing';
  END IF;

  -- Return the updated values
  RETURN QUERY SELECT v_new_completed, v_new_failed, v_total, v_status;
END;
$$;
