-- Add column to store AI analysis results
ALTER TABLE public.companies 
ADD COLUMN ai_analysis jsonb;