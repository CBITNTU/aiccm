-- Update nearby_companies to support is_approved filter and include is_approved in output.
CREATE OR REPLACE FUNCTION nearby_companies(
  user_lat double precision,
  user_lng double precision,
  radius_miles double precision DEFAULT NULL,
  search_text text DEFAULT NULL,
  company_ids uuid[] DEFAULT NULL,
  page_num integer DEFAULT 1,
  page_size integer DEFAULT 25,
  approved_only boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  company_name text,
  description text,
  key_capabilities text,
  postcode text,
  certifications text,
  equipment text,
  past_projects text,
  is_system_company boolean,
  is_approved boolean,
  status text,
  market_position text,
  safety_rating text,
  digital_maturity text,
  ai_competencies jsonb,
  ai_capabilities jsonb,
  ai_analysis jsonb,
  latitude double precision,
  longitude double precision,
  created_at timestamptz,
  updated_at timestamptz,
  user_id uuid,
  address text,
  companies_house_number text,
  contact_email text,
  contact_phone text,
  website_url text,
  distance_miles double precision,
  total_count bigint
) AS $$
DECLARE
  user_point geography;
  radius_meters double precision;
BEGIN
  user_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;
  radius_meters := CASE WHEN radius_miles IS NOT NULL THEN radius_miles * 1609.34 ELSE NULL END;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      c.id, c.company_name, c.description, c.key_capabilities, c.postcode,
      c.certifications, c.equipment, c.past_projects, c.is_system_company,
      c.is_approved,
      c.status, c.market_position, c.safety_rating, c.digital_maturity,
      c.ai_competencies, c.ai_capabilities, c.ai_analysis,
      c.latitude, c.longitude,
      c.created_at, c.updated_at, c.user_id,
      c.address, c.companies_house_number, c.contact_email, c.contact_phone,
      c.website_url,
      ROUND((ST_Distance(c.geog, user_point) / 1609.34)::numeric, 1)::double precision AS dist_miles
    FROM public.companies c
    WHERE c.status = 'active'
      AND c.geog IS NOT NULL
      AND (radius_meters IS NULL OR ST_DWithin(c.geog, user_point, radius_meters))
      AND (company_ids IS NULL OR c.id = ANY(company_ids))
      AND (NOT approved_only OR c.is_approved = true)
      AND (
        search_text IS NULL
        OR c.company_name ILIKE '%' || search_text || '%'
        OR c.description ILIKE '%' || search_text || '%'
      )
  )
  SELECT
    f.id, f.company_name, f.description, f.key_capabilities, f.postcode,
    f.certifications, f.equipment, f.past_projects, f.is_system_company,
    f.is_approved,
    f.status, f.market_position, f.safety_rating, f.digital_maturity,
    f.ai_competencies, f.ai_capabilities, f.ai_analysis,
    f.latitude, f.longitude,
    f.created_at, f.updated_at, f.user_id,
    f.address, f.companies_house_number, f.contact_email, f.contact_phone,
    f.website_url,
    f.dist_miles,
    count(*) OVER() AS total_count
  FROM filtered f
  ORDER BY f.dist_miles ASC
  LIMIT page_size OFFSET (page_num - 1) * page_size;
END;
$$ LANGUAGE plpgsql STABLE;
