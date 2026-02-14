-- Enable RLS and add superadmin policies for platform_settings and demo_matching_results

-- platform_settings
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage platform_settings"
  ON public.platform_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'::app_role));

-- demo_matching_results
ALTER TABLE public.demo_matching_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage demo_matching_results"
  ON public.demo_matching_results
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'::app_role));
