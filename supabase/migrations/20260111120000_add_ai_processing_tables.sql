-- Add AI summary and taxonomy fields to tenders
ALTER TABLE public.tenders ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE public.tenders ADD COLUMN IF NOT EXISTS ai_capability_taxonomy JSONB; -- Array of capability IDs
ALTER TABLE public.tenders ADD COLUMN IF NOT EXISTS taxonomy_generated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.tenders ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMP WITH TIME ZONE;

-- Add AI summary and taxonomy fields to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS ai_capability_taxonomy JSONB; -- Array of capability IDs
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS taxonomy_generated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMP WITH TIME ZONE;

-- Track content hash to detect meaningful changes (for companies only, since tenders aren't editable)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_companies_content_hash ON public.companies(content_hash);

-- Queue system table
CREATE TABLE IF NOT EXISTS public.processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL, -- 'tender_summary', 'tender_taxonomy', 'company_summary', 'company_taxonomy', 'tender_matching'
  entity_type TEXT NOT NULL, -- 'tender' or 'company'
  entity_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE, -- For matching jobs
  tender_id UUID REFERENCES public.tenders(id) ON DELETE CASCADE, -- For matching jobs
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  priority INTEGER DEFAULT 0, -- Higher = more urgent
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  result_data JSONB, -- Store results when job completes (e.g., scores, summaries)
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processing_queue_status ON public.processing_queue(status, priority DESC, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_processing_queue_entity ON public.processing_queue(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_processing_queue_job_type ON public.processing_queue(job_type, status);
CREATE INDEX IF NOT EXISTS idx_processing_queue_company ON public.processing_queue(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_processing_queue_tender ON public.processing_queue(tender_id) WHERE tender_id IS NOT NULL;

-- Track batch jobs (for progress tracking)
CREATE TABLE IF NOT EXISTS public.batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_type TEXT NOT NULL, -- 'tender_ai_regeneration', 'company_matching'
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Who triggered it
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE, -- For matching batches
  total_jobs INTEGER NOT NULL,
  completed_jobs INTEGER DEFAULT 0,
  failed_jobs INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'completed', 'failed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_user ON public.batch_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON public.batch_jobs(status);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_company ON public.batch_jobs(company_id) WHERE company_id IS NOT NULL;

-- Sync state table (for tracking last runs)
CREATE TABLE IF NOT EXISTS public.sync_state (
  key TEXT PRIMARY KEY,
  last_run_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB
);

-- Enable RLS on new tables
ALTER TABLE public.processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies for processing_queue
-- Users can view their own jobs (matching jobs for their companies)
CREATE POLICY "Users can view their own processing jobs"
  ON public.processing_queue
  FOR SELECT
  USING (
    company_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.companies
      WHERE companies.id = processing_queue.company_id
        AND companies.user_id = auth.uid()
    )
  );

-- Superadmins can view all jobs
CREATE POLICY "Superadmins can view all processing jobs"
  ON public.processing_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'superadmin'
    )
  );

-- System can insert/update jobs (via service role)
-- Note: In production, jobs should be inserted via service role, not through RLS
-- This policy allows service role to manage jobs
CREATE POLICY "Service role can manage processing jobs"
  ON public.processing_queue
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS Policies for batch_jobs
-- Users can view their own batch jobs
CREATE POLICY "Users can view their own batch jobs"
  ON public.batch_jobs
  FOR SELECT
  USING (
    user_id = auth.uid() OR
    (company_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.companies
      WHERE companies.id = batch_jobs.company_id
        AND companies.user_id = auth.uid()
    ))
  );

-- Superadmins can view all batch jobs
CREATE POLICY "Superadmins can view all batch jobs"
  ON public.batch_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'superadmin'
    )
  );

-- Service role can manage batch jobs
CREATE POLICY "Service role can manage batch jobs"
  ON public.batch_jobs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS Policies for sync_state
-- Superadmins can view sync state
CREATE POLICY "Superadmins can view sync state"
  ON public.sync_state
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'superadmin'
    )
  );

-- Service role can manage sync state
CREATE POLICY "Service role can manage sync state"
  ON public.sync_state
  FOR ALL
  USING (true)
  WITH CHECK (true);
