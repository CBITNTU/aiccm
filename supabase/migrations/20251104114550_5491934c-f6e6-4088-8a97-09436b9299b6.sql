-- Add missing columns to companies table for onboarding
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS compliance_data jsonb,
ADD COLUMN IF NOT EXISTS system_extracted jsonb,
ADD COLUMN IF NOT EXISTS human_verified jsonb,
ADD COLUMN IF NOT EXISTS consent_data_fetch boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS contact_person text;