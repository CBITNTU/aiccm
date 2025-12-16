-- Create profiles table for user data (idempotent)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles'
  ) THEN
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
  END IF;
END $$;

-- Create companies table (idempotent)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'companies'
  ) THEN
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
  END IF;
END $$;

-- Create tenders table (idempotent)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'tenders'
  ) THEN
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
  END IF;
END $$;

-- Create matching_results table (idempotent)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'matching_results'
  ) THEN
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
  END IF;
END $$;

-- Add admin role functionality (idempotent)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type 
    WHERE typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
END $$;

-- Create user_roles table (idempotent)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_roles'
  ) THEN
    CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
    );
  END IF;
END $$;

-- Create virtual organizations table with updated status options (idempotent)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'virtual_organizations'
  ) THEN
    CREATE TABLE public.virtual_organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  lead_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'disbanded', 'bin', 'archived')),
  target_tender_id UUID REFERENCES public.tenders(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );
  END IF;
END $$;

-- Create virtual organization members table (idempotent)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'vo_members'
  ) THEN
    CREATE TABLE public.vo_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vo_id UUID REFERENCES public.virtual_organizations(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member', 'invited')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(vo_id, company_id)
    );
  END IF;
END $$;

-- Create partnership recommendations table (idempotent)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'partnership_recommendations'
  ) THEN
    CREATE TABLE public.partnership_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  recommended_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  compatibility_score INTEGER NOT NULL DEFAULT 0,
  complementary_capabilities TEXT[],
  shared_locations TEXT[],
  recommended_for_tender_id UUID REFERENCES public.tenders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'accepted', 'declined')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, recommended_company_id)
    );
  END IF;
END $$;

-- Create partnership messages table (idempotent)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'partnership_messages'
  ) THEN
    CREATE TABLE public.partnership_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  to_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  tender_id UUID REFERENCES public.tenders(id) ON DELETE SET NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );
  END IF;
END $$;

-- Enable RLS on all tables (idempotent - ALTER TABLE is safe to run multiple times)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matching_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vo_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partnership_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partnership_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles (idempotent)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

DO $$ 
BEGIN
  CREATE POLICY "Users can view their own profile" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can update their own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can insert their own profile" 
  ON public.profiles FOR INSERT 
  WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for companies (idempotent)
DROP POLICY IF EXISTS "Users can view their own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can update their own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can insert their own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can delete their own companies" ON public.companies;

DO $$ 
BEGIN
  CREATE POLICY "Users can view their own companies" 
  ON public.companies FOR SELECT 
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can update their own companies" 
  ON public.companies FOR UPDATE 
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can insert their own companies" 
  ON public.companies FOR INSERT 
  WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can delete their own companies" 
  ON public.companies FOR DELETE 
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for tenders (public read) (idempotent)
DROP POLICY IF EXISTS "Tenders are viewable by everyone" ON public.tenders;

DO $$ 
BEGIN
  CREATE POLICY "Tenders are viewable by everyone" 
  ON public.tenders FOR SELECT 
  USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for matching_results (idempotent)
DROP POLICY IF EXISTS "Users can view their own matching results" ON public.matching_results;
DROP POLICY IF EXISTS "Users can update their own matching results" ON public.matching_results;
DROP POLICY IF EXISTS "Users can insert their own matching results" ON public.matching_results;

DO $$ 
BEGIN
  CREATE POLICY "Users can view their own matching results" 
  ON public.matching_results FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.companies 
    WHERE companies.id = matching_results.company_id 
    AND companies.user_id = auth.uid()
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can update their own matching results" 
  ON public.matching_results FOR UPDATE 
  USING (EXISTS (
    SELECT 1 FROM public.companies 
    WHERE companies.id = matching_results.company_id 
    AND companies.user_id = auth.uid()
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can insert their own matching results" 
  ON public.matching_results FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.companies 
    WHERE companies.id = matching_results.company_id 
    AND companies.user_id = auth.uid()
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Security definer function to check roles without RLS recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles (idempotent)
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

DO $$ 
BEGIN
  CREATE POLICY "Users can view own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can insert own roles"
  ON public.user_roles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admin policies
DO $$ 
BEGIN
  CREATE POLICY "Admins can view all roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Admins can manage all roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for virtual_organizations (idempotent)
DROP POLICY IF EXISTS "Users can view VOs they're part of" ON public.virtual_organizations;
DROP POLICY IF EXISTS "Users can create VOs for their companies" ON public.virtual_organizations;
DROP POLICY IF EXISTS "Lead companies can update VOs" ON public.virtual_organizations;

DO $$ 
BEGIN
  CREATE POLICY "Users can view VOs they're part of" ON public.virtual_organizations
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.vo_members vm 
    JOIN public.companies c ON vm.company_id = c.id 
    WHERE vm.vo_id = virtual_organizations.id 
    AND c.user_id = auth.uid()
  )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can create VOs for their companies" ON public.virtual_organizations
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.companies 
    WHERE id = lead_company_id AND user_id = auth.uid()
  )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Lead companies can update VOs" ON public.virtual_organizations
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.companies 
    WHERE id = lead_company_id AND user_id = auth.uid()
  )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for vo_members (idempotent)
DROP POLICY IF EXISTS "Users can view VO members they're part of" ON public.vo_members;
DROP POLICY IF EXISTS "Lead companies can manage VO members" ON public.vo_members;

DO $$ 
BEGIN
  CREATE POLICY "Users can view VO members they're part of" ON public.vo_members
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.vo_members vm2 
    JOIN public.companies c ON vm2.company_id = c.id 
    WHERE vm2.vo_id = vo_members.vo_id 
    AND c.user_id = auth.uid()
  )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Lead companies can manage VO members" ON public.vo_members
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.virtual_organizations vo 
    JOIN public.companies c ON vo.lead_company_id = c.id 
    WHERE vo.id = vo_members.vo_id 
    AND c.user_id = auth.uid()
  )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for partnership_recommendations (idempotent)
DROP POLICY IF EXISTS "Users can view recommendations for their companies" ON public.partnership_recommendations;
DROP POLICY IF EXISTS "Users can update recommendations for their companies" ON public.partnership_recommendations;

DO $$ 
BEGIN
  CREATE POLICY "Users can view recommendations for their companies" ON public.partnership_recommendations
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.companies 
    WHERE (id = company_id OR id = recommended_company_id) 
    AND user_id = auth.uid()
  )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can update recommendations for their companies" ON public.partnership_recommendations
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.companies 
    WHERE id = company_id AND user_id = auth.uid()
  )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for partnership_messages (idempotent)
DROP POLICY IF EXISTS "Users can view messages for their companies" ON public.partnership_messages;
DROP POLICY IF EXISTS "Users can send messages from their companies" ON public.partnership_messages;

DO $$ 
BEGIN
  CREATE POLICY "Users can view messages for their companies" ON public.partnership_messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.companies 
    WHERE (id = from_company_id OR id = to_company_id) 
    AND user_id = auth.uid()
  )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can send messages from their companies" ON public.partnership_messages
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.companies 
    WHERE id = from_company_id AND user_id = auth.uid()
  )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create function to update timestamps (idempotent - CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates (idempotent)
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_companies_updated_at ON public.companies;
DROP TRIGGER IF EXISTS update_tenders_updated_at ON public.tenders;
DROP TRIGGER IF EXISTS update_matching_results_updated_at ON public.matching_results;
DROP TRIGGER IF EXISTS update_virtual_organizations_updated_at ON public.virtual_organizations;
DROP TRIGGER IF EXISTS update_partnership_recommendations_updated_at ON public.partnership_recommendations;

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

CREATE TRIGGER update_virtual_organizations_updated_at
BEFORE UPDATE ON public.virtual_organizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_partnership_recommendations_updated_at
BEFORE UPDATE ON public.partnership_recommendations
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

-- Create trigger for automatic profile creation (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Insert sample tenders (idempotent - only insert if they don't exist)
INSERT INTO public.tenders (reference_number, title, buyer, cpv_codes, description, budget_min, budget_max, location, deadline, status) 
SELECT 
  v.reference_number, 
  v.title, 
  v.buyer, 
  v.cpv_codes, 
  v.description, 
  v.budget_min, 
  v.budget_max, 
  v.location, 
  v.deadline::timestamp with time zone, 
  v.status
FROM (VALUES
('TND-2024-001'::TEXT, 'Nottingham City Centre Infrastructure Upgrade'::TEXT, 'Nottingham City Council'::TEXT, 
 ARRAY['45200000-9', '45233000-9']::TEXT[], 
 'Major infrastructure improvements including road resurfacing, utility upgrades, and street furniture installation across the city centre.'::TEXT, 
 2500000::BIGINT, 4000000::BIGINT, 'Nottingham, East Midlands'::TEXT, '2024-12-15'::TEXT, 'open'::TEXT),

('TND-2024-002'::TEXT, 'Leicester Sports Complex Construction'::TEXT, 'Leicester City Council'::TEXT, 
 ARRAY['45210000-2', '45262000-8']::TEXT[], 
 'Design and build of new multi-purpose sports complex including swimming facilities, gymnasium, and community spaces.'::TEXT, 
 8000000::BIGINT, 12000000::BIGINT, 'Leicester, East Midlands'::TEXT, '2024-12-28'::TEXT, 'closing_soon'::TEXT),

('TND-2024-003'::TEXT, 'Derby Housing Development - Phase 2'::TEXT, 'Derby City Council'::TEXT, 
 ARRAY['45210000-2']::TEXT[], 
 'Construction of 120 affordable housing units with associated infrastructure and landscaping.'::TEXT, 
 15000000::BIGINT, 20000000::BIGINT, 'Derby, East Midlands'::TEXT, '2025-01-20'::TEXT, 'framework'::TEXT),

('TND-2024-004'::TEXT, 'Lincoln Hospital Expansion'::TEXT, 'NHS Foundation Trust'::TEXT, 
 ARRAY['45210000-2', '45310000-3']::TEXT[], 
 'Extension and refurbishment of existing hospital facilities including new emergency wing and upgraded medical equipment installation.'::TEXT, 
 25000000::BIGINT, 35000000::BIGINT, 'Lincoln, East Midlands'::TEXT, '2025-02-10'::TEXT, 'open'::TEXT),

('TND-2024-005'::TEXT, 'Mansfield School Building Programme'::TEXT, 'Nottinghamshire County Council'::TEXT, 
 ARRAY['45210000-2', '45400000-1']::TEXT[], 
 'New build primary school facility with modern teaching spaces, sports hall, and energy-efficient systems.'::TEXT, 
 5000000::BIGINT, 7500000::BIGINT, 'Mansfield, East Midlands'::TEXT, '2024-12-30'::TEXT, 'closing_soon'::TEXT)
) AS v(reference_number, title, buyer, cpv_codes, description, budget_min, budget_max, location, deadline, status)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenders WHERE reference_number = v.reference_number
);