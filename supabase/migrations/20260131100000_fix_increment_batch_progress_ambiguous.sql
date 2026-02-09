-- Fix ambiguous column reference: completed_jobs/failed_jobs could refer to
-- RETURNS TABLE columns or batch_jobs columns. Qualify with table name.
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
  UPDATE public.batch_jobs bj
  SET
    completed_jobs = CASE 
      WHEN p_outcome = 'completed' THEN bj.completed_jobs + 1 
      ELSE bj.completed_jobs 
    END,
    failed_jobs = CASE 
      WHEN p_outcome = 'failed' THEN bj.failed_jobs + 1 
      ELSE bj.failed_jobs 
    END,
    updated_at = now()
  WHERE bj.id = p_batch_id
  RETURNING 
    bj.completed_jobs,
    bj.failed_jobs,
    bj.total_jobs
  INTO v_new_completed, v_new_failed, v_total;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF (v_new_completed + v_new_failed) >= v_total THEN
    IF v_new_failed = v_total THEN
      v_status := 'failed';
    ELSE
      v_status := 'completed';
    END IF;
    UPDATE public.batch_jobs bj2
    SET status = v_status
    WHERE bj2.id = p_batch_id;
  ELSE
    v_status := 'processing';
  END IF;

  RETURN QUERY SELECT v_new_completed, v_new_failed, v_total, v_status;
END;
$$;
