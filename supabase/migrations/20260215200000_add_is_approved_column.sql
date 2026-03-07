-- Add is_approved flag for UKCCM-verified / platform-approved companies.
-- Orthogonal to the existing "status" column (active/pending_review/etc.).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_companies_is_approved ON public.companies (is_approved) WHERE is_approved = true;
