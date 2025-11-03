-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Personal info
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT
);

-- Create companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Basic company info
  company_name TEXT NOT NULL,
  companies_house_number TEXT,
  website_url TEXT,
  postcode TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  description TEXT,
  
  -- Capabilities
  key_capabilities TEXT,
  certifications TEXT,
  equipment TEXT,
  past_projects TEXT,
  
  -- AI Analysis results
  ai_competencies JSONB,
  ai_capabilities JSONB,
  ai_strengths JSONB,
  ai_certifications JSONB,
  ai_recommendations JSONB,
  digital_maturity TEXT,
  safety_rating TEXT,
  market_position TEXT,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'pending_review'))
);

-- Create tenders table
CREATE TABLE public.tenders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Basic tender info
  reference_number TEXT UNIQUE,
  title TEXT NOT NULL,
  buyer TEXT NOT NULL,
  cpv_codes TEXT[],
  description TEXT,
  
  -- Budget
  budget_min BIGINT,
  budget_max BIGINT,
  
  -- Location and timing
  location TEXT,
  deadline TIMESTAMP WITH TIME ZONE,
  publication_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Status
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closing_soon', 'framework', 'closed', 'awarded')),
  
  -- Additional info
  contact_info JSONB,
  documents JSONB,
  requirements JSONB
);

-- Create matching_results table
CREATE TABLE public.matching_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tender_id UUID NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  
  -- Matching scores
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  capability_score INTEGER CHECK (capability_score >= 0 AND capability_score <= 100),
  experience_score INTEGER CHECK (experience_score >= 0 AND experience_score <= 100),
  location_score INTEGER CHECK (location_score >= 0 AND location_score <= 100),
  certification_score INTEGER CHECK (certification_score >= 0 AND certification_score <= 100),
  
  -- AI analysis
  ai_analysis JSONB,
  match_reasons TEXT[],
  improvement_suggestions TEXT[],
  
  -- User actions
  is_bookmarked BOOLEAN DEFAULT FALSE,
  is_applied BOOLEAN DEFAULT FALSE,
  application_date TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(company_id, tender_id)
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matching_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for companies
CREATE POLICY "Users can view their own companies" 
ON public.companies FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own companies" 
ON public.companies FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own companies" 
ON public.companies FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own companies" 
ON public.companies FOR DELETE 
USING (auth.uid() = user_id);

-- RLS Policies for tenders (public read)
CREATE POLICY "Tenders are viewable by everyone" 
ON public.tenders FOR SELECT 
USING (true);

-- RLS Policies for matching_results
CREATE POLICY "Users can view their own matching results" 
ON public.matching_results FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.companies 
  WHERE companies.id = matching_results.company_id 
  AND companies.user_id = auth.uid()
));

CREATE POLICY "Users can update their own matching results" 
ON public.matching_results FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.companies 
  WHERE companies.id = matching_results.company_id 
  AND companies.user_id = auth.uid()
));

CREATE POLICY "Users can insert their own matching results" 
ON public.matching_results FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.companies 
  WHERE companies.id = matching_results.company_id 
  AND companies.user_id = auth.uid()
));

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenders_updated_at
  BEFORE UPDATE ON public.tenders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_matching_results_updated_at
  BEFORE UPDATE ON public.matching_results
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name'
  );
  RETURN NEW;
END;
$$;

-- Create trigger for automatic profile creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Insert sample tenders
INSERT INTO public.tenders (reference_number, title, buyer, cpv_codes, description, budget_min, budget_max, location, deadline, status) VALUES
('TND-2024-001', 'Nottingham City Centre Infrastructure Upgrade', 'Nottingham City Council', 
 ARRAY['45200000-9', '45233000-9'], 
 'Major infrastructure improvements including road resurfacing, utility upgrades, and street furniture installation across the city centre.', 
 2500000, 4000000, 'Nottingham, East Midlands', '2024-12-15', 'open'),

('TND-2024-002', 'Leicester Sports Complex Construction', 'Leicester City Council', 
 ARRAY['45210000-2', '45262000-8'], 
 'Design and build of new multi-purpose sports complex including swimming facilities, gymnasium, and community spaces.', 
 8000000, 12000000, 'Leicester, East Midlands', '2024-12-28', 'closing_soon'),

('TND-2024-003', 'Derby Housing Development - Phase 2', 'Derby City Council', 
 ARRAY['45210000-2'], 
 'Construction of 120 affordable housing units with associated infrastructure and landscaping.', 
 15000000, 20000000, 'Derby, East Midlands', '2025-01-20', 'framework'),

('TND-2024-004', 'Lincoln Hospital Expansion', 'NHS Foundation Trust', 
 ARRAY['45210000-2', '45310000-3'], 
 'Extension and refurbishment of existing hospital facilities including new emergency wing and upgraded medical equipment installation.', 
 25000000, 35000000, 'Lincoln, East Midlands', '2025-02-10', 'open'),

('TND-2024-005', 'Mansfield School Building Programme', 'Nottinghamshire County Council', 
 ARRAY['45210000-2', '45400000-1'], 
 'New build primary school facility with modern teaching spaces, sports hall, and energy-efficient systems.', 
 5000000, 7500000, 'Mansfield, East Midlands', '2024-12-30', 'closing_soon');