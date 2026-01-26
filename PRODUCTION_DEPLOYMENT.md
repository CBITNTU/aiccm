# Production Deployment Guide - Queue & Matching Fixes

## Issues Fixed

1. **Race conditions in concurrent job processing** - Multiple workers could claim the same job
2. **Batch progress not updating** - Concurrent updates caused ambiguous column errors
3. **UI showing 0% progress** - UI tracked stale batch IDs that didn't match active batches
4. **Jobs not stopping when cancelled** - Cancel button only cleared UI state, not actual jobs
5. **Stuck jobs** - Jobs that failed in processing state weren't auto-recovered

## Database Migrations

Run these SQL migrations in your **production Supabase** SQL Editor:

### 1. Fix Atomic Job Dequeuing
```sql
-- File: fix_dequeue.sql
CREATE OR REPLACE FUNCTION public.dequeue_job_atomic()
RETURNS TABLE (
  id UUID, job_type TEXT, entity_type TEXT, entity_id UUID,
  company_id UUID, tender_id UUID, batch_id UUID, status TEXT,
  priority INTEGER, attempts INTEGER, max_attempts INTEGER,
  error_message TEXT, result_data JSONB, scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, metadata JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  claimed_job RECORD;
BEGIN
  -- Try batch jobs first
  SELECT
    pq.id, pq.job_type, pq.entity_type, pq.entity_id, pq.company_id, pq.tender_id, pq.batch_id,
    pq.status, pq.priority, pq.attempts, pq.max_attempts, pq.error_message, pq.result_data,
    pq.scheduled_at, pq.started_at, pq.completed_at, pq.created_at, pq.updated_at, pq.metadata
  INTO claimed_job
  FROM public.processing_queue pq
  WHERE pq.status = 'pending' AND pq.batch_id IS NOT NULL
  ORDER BY pq.priority DESC, pq.scheduled_at ASC
  LIMIT 1 FOR UPDATE SKIP LOCKED;
  
  IF NOT FOUND THEN
    -- Try non-batch jobs
    SELECT
      pq.id, pq.job_type, pq.entity_type, pq.entity_id, pq.company_id, pq.tender_id, pq.batch_id,
      pq.status, pq.priority, pq.attempts, pq.max_attempts, pq.error_message, pq.result_data,
      pq.scheduled_at, pq.started_at, pq.completed_at, pq.created_at, pq.updated_at, pq.metadata
    INTO claimed_job
    FROM public.processing_queue pq
    WHERE pq.status = 'pending' AND pq.batch_id IS NULL
    ORDER BY pq.priority DESC, pq.scheduled_at ASC
    LIMIT 1 FOR UPDATE SKIP LOCKED;
  END IF;
  
  IF FOUND THEN
    UPDATE public.processing_queue 
    SET status = 'processing', started_at = now(), updated_at = now() 
    WHERE processing_queue.id = claimed_job.id;
    
    RETURN QUERY SELECT 
      claimed_job.id, claimed_job.job_type, claimed_job.entity_type, claimed_job.entity_id,
      claimed_job.company_id, claimed_job.tender_id, claimed_job.batch_id, 'processing'::TEXT,
      claimed_job.priority, claimed_job.attempts, claimed_job.max_attempts,
      claimed_job.error_message, claimed_job.result_data, claimed_job.scheduled_at,
      now(), claimed_job.completed_at, claimed_job.created_at, now(), claimed_job.metadata;
  END IF;
  
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dequeue_job_atomic() TO postgres, anon, authenticated, service_role;
```

### 2. Fix Atomic Batch Progress Updates
```sql
-- File: fix_increment_batch.sql
CREATE OR REPLACE FUNCTION public.increment_batch_progress(p_batch_id UUID, p_outcome TEXT)
RETURNS TABLE (completed_jobs INTEGER, failed_jobs INTEGER, total_jobs INTEGER, status TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_completed INTEGER;
  v_new_failed INTEGER;
  v_total INTEGER;
  v_status TEXT;
BEGIN
  UPDATE public.batch_jobs
  SET
    completed_jobs = CASE WHEN p_outcome = 'completed' THEN batch_jobs.completed_jobs + 1 ELSE batch_jobs.completed_jobs END,
    failed_jobs = CASE WHEN p_outcome = 'failed' THEN batch_jobs.failed_jobs + 1 ELSE batch_jobs.failed_jobs END,
    updated_at = now()
  WHERE batch_jobs.id = p_batch_id
  RETURNING batch_jobs.completed_jobs, batch_jobs.failed_jobs, batch_jobs.total_jobs
  INTO v_new_completed, v_new_failed, v_total;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch % not found', p_batch_id;
  END IF;
  
  IF (v_new_completed + v_new_failed) >= v_total THEN
    IF v_new_failed > 0 THEN
      v_status := 'failed';
    ELSE
      v_status := 'completed';
    END IF;
  ELSE
    v_status := 'processing';
  END IF;
  
  IF v_status != 'processing' THEN
    UPDATE public.batch_jobs SET status = v_status WHERE batch_jobs.id = p_batch_id;
  END IF;
  
  RETURN QUERY SELECT v_new_completed, v_new_failed, v_total, v_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_batch_progress(UUID, TEXT) TO postgres, anon, authenticated, service_role;
```

### 3. Add 'matching_started' Event Type
```sql
-- Add matching_started to valid event types
ALTER TABLE events DROP CONSTRAINT IF EXISTS valid_action_type;

ALTER TABLE events ADD CONSTRAINT valid_action_type 
CHECK (action_type IN (
  'login',
  'logout',
  'signup',
  'password_reset',
  'company_created',
  'company_updated',
  'company_deleted',
  'tender_viewed',
  'tender_matched',
  'matching_started',  -- NEW
  'user_approved',
  'user_rejected',
  'error'
));
```

## Environment Variables

### Vercel (Production)
In your Vercel dashboard, add:

```env
CRON_SECRET=<generate-random-secret>
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

Generate secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Local (.env.local)
```env
CRON_SECRET=local-dev-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Vercel Cron Configuration

Already configured in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/queue/cron",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

This runs every 5 minutes to:
- Reset stuck jobs (processing > 10 minutes)
- Trigger worker if pending jobs exist
- Clean up old completed/failed jobs (> 7 days)

## Deployment Steps

1. **Apply Database Migrations**
   - Go to Supabase SQL Editor (production)
   - Run all 3 SQL scripts above
   - Verify no errors

2. **Set Environment Variables**
   - Vercel Dashboard → Settings → Environment Variables
   - Add `CRON_SECRET` and `NEXT_PUBLIC_APP_URL`
   - Redeploy to apply

3. **Deploy Code**
   ```bash
   git add .
   git commit -m "fix: concurrent queue processing and UI sync issues"
   git push origin main
   ```

4. **Verify Deployment**
   - Check Vercel deployment logs
   - Test tender matching with a company
   - Monitor progress bar updates
   - Check browser console for logs
   - Verify cron job runs (Vercel → Deployments → Cron Jobs)

## Testing Checklist

- [ ] Start tender matching - progress bar shows 1-100%
- [ ] Refresh page during matching - progress persists
- [ ] Click "Clear & Restart" - batch cancels and UI clears
- [ ] Multiple concurrent users - no race conditions
- [ ] Worker processes jobs without errors
- [ ] Batch progress updates correctly
- [ ] Jobs complete successfully
- [ ] Stuck jobs auto-recover after 10 minutes
- [ ] Cancel button stops new jobs from processing

## Monitoring

### Console Logs Enabled in Production
All console logs are kept in production for debugging (configured in `next.config.ts`).

### Key Logs to Watch
**Job Lifecycle:**
- `🔄 Matching: CompanyName → TenderTitle` - Job started
- `📞 Calling OpenAI API...` - AI request sent
- `✅ Got AI response (X chars)` - AI response received
- `✅ Match complete: Company → Tender (Score: X%)` - Job completed

**Queue Progress:**
- `✅ Atomically updated batch X: Y/Z completed` - Progress updates working
- `✅ Dequeued job` - Jobs being claimed correctly

**Batch Management:**
- `⚠️ Company X already has active batch Y` - Duplicate prevention working
- `🛑 Attempting to cancel batch` - Cancellation triggered
- `⚠️ Batch stuck at 0 progress` - Stale batch detection

**Worker Status:**
- `🔄 Queue worker started: batchSize=50, continuous=true, concurrency=15`
- `✅ Cleared batch X from all state` - Cleanup working

Check these endpoints:
- `/api/queue/worker` - Background job processing
- `/api/queue/cron` - Maintenance tasks  
- `/api/match-tenders/progress?batchId=XXX` - Progress tracking

## Rollback Plan

If issues occur:

1. **Disable Cron Job** (temporarily)
   - Vercel Dashboard → Settings → Cron Jobs → Disable

2. **Revert Database Functions**
   ```sql
   -- Fallback to simple non-atomic functions
   DROP FUNCTION IF EXISTS public.dequeue_job_atomic();
   DROP FUNCTION IF EXISTS public.increment_batch_progress(UUID, TEXT);
   ```

3. **Clear Stuck State**
   ```sql
   UPDATE processing_queue SET status = 'failed' WHERE status = 'processing';
   UPDATE batch_jobs SET status = 'failed' WHERE status = 'processing';
   ```

## Support

If issues persist:
- Check Supabase logs for database errors
- Check Vercel logs for application errors
- Check browser console for UI errors
- Run SQL query to check queue state:
  ```sql
  SELECT batch_id, status, COUNT(*) 
  FROM processing_queue 
  GROUP BY batch_id, status 
  ORDER BY batch_id;
  ```
