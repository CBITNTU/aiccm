-- Demo matching results table for admin test mode.
-- Truncated on each "Run demo"; "Add user to queue" appends with different batch_label.
CREATE TABLE IF NOT EXISTS public.demo_matching_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  batch_label TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tender_id UUID NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  model_used TEXT NOT NULL,

  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  capability_score INTEGER CHECK (capability_score >= 0 AND capability_score <= 100),
  experience_score INTEGER CHECK (experience_score >= 0 AND experience_score <= 100),
  location_score INTEGER CHECK (location_score >= 0 AND location_score <= 100),
  certification_score INTEGER CHECK (certification_score >= 0 AND certification_score <= 100),

  match_reasons TEXT[],
  improvement_suggestions TEXT[],
  ai_analysis JSONB
);

CREATE INDEX IF NOT EXISTS idx_demo_matching_results_batch_label ON public.demo_matching_results (batch_label);
CREATE INDEX IF NOT EXISTS idx_demo_matching_results_created_at ON public.demo_matching_results (created_at);

COMMENT ON TABLE public.demo_matching_results IS 'Admin test mode: matching results per run. Truncate on Run demo; append on Add user to queue.';

-- RPC for admin to truncate demo results (used by demo-sync/run).
CREATE OR REPLACE FUNCTION public.truncate_demo_matching_results()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  TRUNCATE public.demo_matching_results;
$$;

GRANT EXECUTE ON FUNCTION public.truncate_demo_matching_results() TO service_role;
