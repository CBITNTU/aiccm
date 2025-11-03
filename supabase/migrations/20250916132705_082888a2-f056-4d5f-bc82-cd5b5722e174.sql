-- Make user_id nullable for system companies
ALTER TABLE public.companies ALTER COLUMN user_id DROP NOT NULL;

-- Add a field to identify system companies
ALTER TABLE public.companies ADD COLUMN is_system_company boolean DEFAULT false;

-- Update RLS policies to allow viewing system companies
DROP POLICY "Users can view their own companies" ON public.companies;

CREATE POLICY "Users can view their own companies and system companies" 
ON public.companies 
FOR SELECT 
USING (auth.uid() = user_id OR is_system_company = true);

-- Update insert policy to allow system companies (admins only for system companies)
DROP POLICY "Users can insert their own companies" ON public.companies;

CREATE POLICY "Users can insert their own companies" 
ON public.companies 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND is_system_company = false);

CREATE POLICY "System can insert system companies"
ON public.companies
FOR INSERT 
WITH CHECK (user_id IS NULL AND is_system_company = true);