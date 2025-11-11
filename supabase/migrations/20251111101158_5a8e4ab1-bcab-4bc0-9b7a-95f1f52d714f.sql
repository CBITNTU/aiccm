-- Create taxonomies table with 3-level hierarchy
CREATE TABLE public.taxonomies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  parent_id uuid REFERENCES public.taxonomies(id) ON DELETE CASCADE,
  level integer NOT NULL CHECK (level IN (1, 2, 3)),
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for faster parent lookups
CREATE INDEX idx_taxonomies_parent_id ON public.taxonomies(parent_id);
CREATE INDEX idx_taxonomies_level ON public.taxonomies(level);

-- Enable RLS
ALTER TABLE public.taxonomies ENABLE ROW LEVEL SECURITY;

-- Everyone can view taxonomies
CREATE POLICY "Taxonomies are viewable by everyone"
  ON public.taxonomies
  FOR SELECT
  USING (true);

-- Create company_taxonomies junction table
CREATE TABLE public.company_taxonomies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  taxonomy_id uuid NOT NULL REFERENCES public.taxonomies(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(company_id, taxonomy_id)
);

-- Create indexes
CREATE INDEX idx_company_taxonomies_company_id ON public.company_taxonomies(company_id);
CREATE INDEX idx_company_taxonomies_taxonomy_id ON public.company_taxonomies(taxonomy_id);

-- Enable RLS
ALTER TABLE public.company_taxonomies ENABLE ROW LEVEL SECURITY;

-- Users can view all company taxonomies
CREATE POLICY "Company taxonomies are viewable by everyone"
  ON public.company_taxonomies
  FOR SELECT
  USING (true);

-- Users can manage their own company taxonomies
CREATE POLICY "Users can insert their own company taxonomies"
  ON public.company_taxonomies
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.companies
      WHERE companies.id = company_taxonomies.company_id
        AND companies.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own company taxonomies"
  ON public.company_taxonomies
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.companies
      WHERE companies.id = company_taxonomies.company_id
        AND companies.user_id = auth.uid()
    )
  );

-- Create tender_taxonomies junction table
CREATE TABLE public.tender_taxonomies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  taxonomy_id uuid NOT NULL REFERENCES public.taxonomies(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tender_id, taxonomy_id)
);

-- Create indexes
CREATE INDEX idx_tender_taxonomies_tender_id ON public.tender_taxonomies(tender_id);
CREATE INDEX idx_tender_taxonomies_taxonomy_id ON public.tender_taxonomies(taxonomy_id);

-- Enable RLS
ALTER TABLE public.tender_taxonomies ENABLE ROW LEVEL SECURITY;

-- Everyone can view tender taxonomies
CREATE POLICY "Tender taxonomies are viewable by everyone"
  ON public.tender_taxonomies
  FOR SELECT
  USING (true);

-- Seed some example taxonomy data
-- Level 1: Main Categories
INSERT INTO public.taxonomies (name, level, description) VALUES
  ('Construction & Infrastructure', 1, 'Building, civil engineering, and infrastructure projects'),
  ('IT & Digital Services', 1, 'Software, hardware, and digital transformation'),
  ('Consulting & Professional Services', 1, 'Advisory, management, and professional services'),
  ('Healthcare & Life Sciences', 1, 'Medical, pharmaceutical, and healthcare services'),
  ('Education & Training', 1, 'Educational services and training programs');

-- Level 2: Sub-categories for Construction
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT 
  name,
  (SELECT id FROM public.taxonomies WHERE name = 'Construction & Infrastructure' AND level = 1),
  2,
  description
FROM (VALUES
  ('Building & Architecture', 'Commercial and residential building projects'),
  ('Civil Engineering', 'Roads, bridges, and infrastructure'),
  ('Facilities Management', 'Building maintenance and management'),
  ('Environmental & Sustainability', 'Green building and environmental projects')
) AS subcats(name, description);

-- Level 2: Sub-categories for IT
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT 
  name,
  (SELECT id FROM public.taxonomies WHERE name = 'IT & Digital Services' AND level = 1),
  2,
  description
FROM (VALUES
  ('Software Development', 'Custom software and applications'),
  ('Cloud & Infrastructure', 'Cloud services and IT infrastructure'),
  ('Cybersecurity', 'Security services and solutions'),
  ('Data & Analytics', 'Data management and analytics')
) AS subcats(name, description);

-- Level 2: Sub-categories for Consulting
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT 
  name,
  (SELECT id FROM public.taxonomies WHERE name = 'Consulting & Professional Services' AND level = 1),
  2,
  description
FROM (VALUES
  ('Management Consulting', 'Strategy and operations consulting'),
  ('Financial Services', 'Accounting, audit, and financial advisory'),
  ('Legal Services', 'Legal advice and representation'),
  ('HR & Recruitment', 'Human resources and talent acquisition')
) AS subcats(name, description);

-- Level 3: Specific areas for Building
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT 
  name,
  (SELECT id FROM public.taxonomies WHERE name = 'Building & Architecture' AND level = 2),
  3,
  description
FROM (VALUES
  ('Residential Construction', 'Houses, apartments, and residential buildings'),
  ('Commercial Construction', 'Offices, retail, and commercial spaces'),
  ('Industrial Construction', 'Factories, warehouses, and industrial facilities'),
  ('Renovation & Refurbishment', 'Building renovation and modernization')
) AS specific(name, description);

-- Level 3: Specific areas for Software Development
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT 
  name,
  (SELECT id FROM public.taxonomies WHERE name = 'Software Development' AND level = 2),
  3,
  description
FROM (VALUES
  ('Web Applications', 'Web-based software and portals'),
  ('Mobile Applications', 'iOS and Android apps'),
  ('Enterprise Software', 'ERP, CRM, and enterprise systems'),
  ('AI & Machine Learning', 'Artificial intelligence and ML solutions')
) AS specific(name, description);

-- Level 3: Specific areas for Management Consulting
INSERT INTO public.taxonomies (name, parent_id, level, description)
SELECT 
  name,
  (SELECT id FROM public.taxonomies WHERE name = 'Management Consulting' AND level = 2),
  3,
  description
FROM (VALUES
  ('Strategy Development', 'Business strategy and planning'),
  ('Process Optimization', 'Operational efficiency improvements'),
  ('Change Management', 'Organizational change programs'),
  ('Digital Transformation', 'Digital strategy and implementation')
) AS specific(name, description);