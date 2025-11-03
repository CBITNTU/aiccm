-- Create virtual organizations table
CREATE TABLE public.virtual_organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  lead_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'disbanded')),
  target_tender_id UUID REFERENCES public.tenders(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create virtual organization members table
CREATE TABLE public.vo_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vo_id UUID REFERENCES public.virtual_organizations(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member', 'invited')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(vo_id, company_id)
);

-- Create partnership recommendations table
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

-- Create partnership messages table
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

-- Enable RLS
ALTER TABLE public.virtual_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vo_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partnership_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partnership_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for virtual_organizations
CREATE POLICY "Users can view VOs they're part of" ON public.virtual_organizations
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.vo_members vm 
    JOIN public.companies c ON vm.company_id = c.id 
    WHERE vm.vo_id = virtual_organizations.id 
    AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create VOs for their companies" ON public.virtual_organizations
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.companies 
    WHERE id = lead_company_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Lead companies can update VOs" ON public.virtual_organizations
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.companies 
    WHERE id = lead_company_id AND user_id = auth.uid()
  )
);

-- RLS Policies for vo_members
CREATE POLICY "Users can view VO members they're part of" ON public.vo_members
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.vo_members vm2 
    JOIN public.companies c ON vm2.company_id = c.id 
    WHERE vm2.vo_id = vo_members.vo_id 
    AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Lead companies can manage VO members" ON public.vo_members
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.virtual_organizations vo 
    JOIN public.companies c ON vo.lead_company_id = c.id 
    WHERE vo.id = vo_members.vo_id 
    AND c.user_id = auth.uid()
  )
);

-- RLS Policies for partnership_recommendations
CREATE POLICY "Users can view recommendations for their companies" ON public.partnership_recommendations
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.companies 
    WHERE (id = company_id OR id = recommended_company_id) 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can update recommendations for their companies" ON public.partnership_recommendations
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.companies 
    WHERE id = company_id AND user_id = auth.uid()
  )
);

-- RLS Policies for partnership_messages
CREATE POLICY "Users can view messages for their companies" ON public.partnership_messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.companies 
    WHERE (id = from_company_id OR id = to_company_id) 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can send messages from their companies" ON public.partnership_messages
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.companies 
    WHERE id = from_company_id AND user_id = auth.uid()
  )
);

-- Add triggers for updated_at
CREATE TRIGGER update_virtual_organizations_updated_at
BEFORE UPDATE ON public.virtual_organizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_partnership_recommendations_updated_at
BEFORE UPDATE ON public.partnership_recommendations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();