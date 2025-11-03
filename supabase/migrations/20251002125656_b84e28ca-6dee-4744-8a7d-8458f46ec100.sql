-- Add fields to support confidence scores, evidence URLs, and verification flags
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS system_extracted jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS human_verified jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS financial_data jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS compliance_data jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS consent_data_fetch boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS contact_person text;

COMMENT ON COLUMN public.companies.system_extracted IS 'Auto-extracted data with confidence scores and evidence URLs';
COMMENT ON COLUMN public.companies.human_verified IS 'User verification flags for each field';
COMMENT ON COLUMN public.companies.financial_data IS 'Financial snapshot from Endole/Companies House';
COMMENT ON COLUMN public.companies.compliance_data IS 'Compliance information from Companies House';
COMMENT ON COLUMN public.companies.consent_data_fetch IS 'User consent to fetch public data';
COMMENT ON COLUMN public.companies.contact_person IS 'Primary contact person name';