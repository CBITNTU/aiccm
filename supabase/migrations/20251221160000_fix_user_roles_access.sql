-- Fix user_roles access: Ensure users can read their own roles
-- This migration ensures that the "Users can view own roles" policy exists
-- and that the has_role function works correctly with new role names

-- Step 1: Ensure "Users can view own roles" policy exists (this should already exist, but ensure it's correct)
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

DO $$ 
BEGIN
  CREATE POLICY "Users can view own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Step 2: Update has_role function (no backward compatibility needed after migration)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
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

-- Step 3: Create a helper function that checks for superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'superadmin'::app_role
  )
$$;

