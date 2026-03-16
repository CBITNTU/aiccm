-- Markets: hierarchical tree for company markets
CREATE TABLE IF NOT EXISTS public.markets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.markets(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_markets_parent_id ON public.markets(parent_id);

-- Company-Market junction
CREATE TABLE IF NOT EXISTS public.company_markets (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, market_id)
);

CREATE INDEX IF NOT EXISTS idx_company_markets_company_id ON public.company_markets(company_id);
CREATE INDEX IF NOT EXISTS idx_company_markets_market_id ON public.company_markets(market_id);

-- Standards ref: hierarchical tree for standards/certifications
CREATE TABLE IF NOT EXISTS public.standards_ref (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.standards_ref(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_standards_ref_parent_id ON public.standards_ref(parent_id);

-- Company-Standards junction
CREATE TABLE IF NOT EXISTS public.company_standards (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  standard_id UUID NOT NULL REFERENCES public.standards_ref(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, standard_id)
);

CREATE INDEX IF NOT EXISTS idx_company_standards_company_id ON public.company_standards(company_id);
CREATE INDEX IF NOT EXISTS idx_company_standards_standard_id ON public.company_standards(standard_id);

-- RLS: markets (public read; superadmin write)
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Markets are viewable by everyone"
  ON public.markets FOR SELECT USING (true);

CREATE POLICY "Superadmins can manage markets"
  ON public.markets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'superadmin'
    )
  );

-- RLS: company_markets (public read; company member write)
ALTER TABLE public.company_markets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company markets are viewable by everyone"
  ON public.company_markets FOR SELECT USING (true);

CREATE POLICY "Company members can insert company markets"
  ON public.company_markets FOR INSERT
  WITH CHECK (
    public.is_company_member(company_id)
  );

CREATE POLICY "Company members can delete company markets"
  ON public.company_markets FOR DELETE
  USING (
    public.is_company_member(company_id)
  );

-- RLS: standards_ref (public read; superadmin write)
ALTER TABLE public.standards_ref ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Standards ref are viewable by everyone"
  ON public.standards_ref FOR SELECT USING (true);

CREATE POLICY "Superadmins can manage standards ref"
  ON public.standards_ref FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'superadmin'
    )
  );

-- RLS: company_standards (public read; company member write)
ALTER TABLE public.company_standards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company standards are viewable by everyone"
  ON public.company_standards FOR SELECT USING (true);

CREATE POLICY "Company members can insert company standards"
  ON public.company_standards FOR INSERT
  WITH CHECK (
    public.is_company_member(company_id)
  );

CREATE POLICY "Company members can delete company standards"
  ON public.company_standards FOR DELETE
  USING (
    public.is_company_member(company_id)
  );
