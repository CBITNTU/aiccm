ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

COMMENT ON COLUMN public.companies.latitude IS 'Geocoded latitude from address/postcode via Google Maps';
COMMENT ON COLUMN public.companies.longitude IS 'Geocoded longitude from address/postcode via Google Maps';
