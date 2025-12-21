-- Step 2: Migrate existing data from old role names to new ones
-- This runs after the enum values are added in the previous migration

-- Migrate data: delete old and insert new
DO $$
DECLARE
  rec RECORD;
  new_role_text TEXT;
BEGIN
  -- Loop through all user roles
  FOR rec IN 
    SELECT user_id, role::text as old_role, created_at
    FROM public.user_roles
  LOOP
    -- Determine new role name
    IF rec.old_role = 'admin' THEN
      new_role_text := 'superadmin';
    ELSIF rec.old_role = 'user' THEN
      new_role_text := 'sme-owner';
    ELSE
      new_role_text := rec.old_role; -- Keep as-is for any other values
    END IF;
    
    -- Only update if role name changed
    IF new_role_text != rec.old_role THEN
      -- Delete old role entry
      DELETE FROM public.user_roles 
      WHERE user_id = rec.user_id AND role::text = rec.old_role;
      
      -- Insert new role entry
      INSERT INTO public.user_roles (user_id, role, created_at)
      VALUES (rec.user_id, new_role_text::app_role, rec.created_at)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Step 3: Update the default role in user_roles table
ALTER TABLE public.user_roles 
ALTER COLUMN role SET DEFAULT 'sme-owner'::app_role;

-- Step 4: Update the handle_new_user function to use 'sme-owner'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, email, first_name, last_name, job_title)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.raw_user_meta_data ->> 'job_title'
  );
  
  -- Assign default 'sme-owner' role automatically
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'sme-owner'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Step 5: Update RLS policies - drop old ones first
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all companies" ON public.companies;
DROP POLICY IF EXISTS "Admins can delete any company" ON public.companies;
DROP POLICY IF EXISTS "Admins can insert taxonomies" ON public.taxonomies;
DROP POLICY IF EXISTS "Admins can update taxonomies" ON public.taxonomies;
DROP POLICY IF EXISTS "Admins can delete taxonomies" ON public.taxonomies;

-- Recreate policies with 'superadmin'
DO $$ 
BEGIN
  CREATE POLICY "Superadmins can view all roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Superadmins can manage all roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Superadmins can view all companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Superadmins can delete any company"
  ON public.companies
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Superadmins can insert taxonomies"
  ON public.taxonomies
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Superadmins can update taxonomies"
  ON public.taxonomies
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Superadmins can delete taxonomies"
  ON public.taxonomies
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

