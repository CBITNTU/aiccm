-- Add operation_locations to companies (array of location strings, e.g. "United Kingdom", "England", "London")
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS operation_locations jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.companies.operation_locations IS 'Array of location strings where company operates (countries, regions, cities). Editable by user.';
