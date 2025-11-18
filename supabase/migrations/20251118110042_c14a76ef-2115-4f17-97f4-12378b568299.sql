-- Add address field to companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS address TEXT;