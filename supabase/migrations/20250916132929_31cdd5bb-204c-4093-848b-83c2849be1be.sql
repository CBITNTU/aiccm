-- Make user_id nullable for system companies (idempotent)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'companies' 
    AND column_name = 'user_id'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.companies ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;

-- Update RLS policies to allow viewing system companies (idempotent)
-- Drop old policy if it exists
DROP POLICY IF EXISTS "Users can view their own companies" ON public.companies;

-- Drop new policy if it exists (from previous migration)
DROP POLICY IF EXISTS "Users can view their own companies and system companies" ON public.companies;

-- Create the new policy (with exception handling for idempotency)
DO $$ 
BEGIN
  CREATE POLICY "Users can view their own companies and system companies" 
  ON public.companies 
  FOR SELECT 
  USING (auth.uid() = user_id OR is_system_company = true);
EXCEPTION
  WHEN duplicate_object THEN
    -- Policy already exists, ignore
    NULL;
END $$;

-- Update insert policy to allow system companies (idempotent)
-- Drop old insert policy if it exists
DROP POLICY IF EXISTS "Users can insert their own companies" ON public.companies;

-- Drop system insert policy if it exists (from previous migration)
DROP POLICY IF EXISTS "System can insert system companies" ON public.companies;

-- Create user insert policy (with exception handling for idempotency)
DO $$ 
BEGIN
  CREATE POLICY "Users can insert their own companies" 
  ON public.companies 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id AND is_system_company = false);
EXCEPTION
  WHEN duplicate_object THEN
    -- Policy already exists, ignore
    NULL;
END $$;

-- Create system insert policy (with exception handling for idempotency)
DO $$ 
BEGIN
  CREATE POLICY "System can insert system companies"
  ON public.companies
  FOR INSERT 
  WITH CHECK (user_id IS NULL AND is_system_company = true);
EXCEPTION
  WHEN duplicate_object THEN
    -- Policy already exists, ignore
    NULL;
END $$;