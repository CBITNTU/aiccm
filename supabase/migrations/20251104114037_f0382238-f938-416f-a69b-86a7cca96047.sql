-- Add missing columns to companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS is_system_company boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_analysis jsonb,
ADD COLUMN IF NOT EXISTS financial_data jsonb;