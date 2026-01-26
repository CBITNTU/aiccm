-- Fix race condition in batch progress updates by using atomic SQL increments
-- This ensures concurrent job completions are all counted correctly

-- Create function to atomically increment batch progress
CREATE OR REPLACE FUNCTION public.increment_batch_progress(
  p_batch_id UUID,
  p_outcome TEXT -- 'completed' or 'failed'
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
  v_completed INTEGER;
  v_failed INTEGER;
  v_total INTEGER;
  v_new_completed INTEGER;
  v_new_failed INTEGER;
  v_status TEXT;
BEGIN
  -- Atomically increment counters using SQL arithmetic (prevents race conditions)
  UPDATE public.batch_jobs
  SET
    completed_jobs = CASE 
      WHEN p_outcome = 'completed' THEN completed_jobs + 1 
      ELSE completed_jobs 
    END,
    failed_jobs = CASE 
      WHEN p_outcome = 'failed' THEN failed_jobs + 1 
      ELSE failed_jobs 
    END,
    updated_at = now()
  WHERE id = p_batch_id
  RETURNING 
    completed_jobs,
    failed_jobs,
    total_jobs
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
    WHERE id = p_batch_id;
  ELSE
    v_status := 'processing';
  END IF;

  -- Return the updated values
  RETURN QUERY SELECT v_new_completed, v_new_failed, v_total, v_status;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.increment_batch_progress(UUID, TEXT) TO postgres, anon, authenticated, service_role;
