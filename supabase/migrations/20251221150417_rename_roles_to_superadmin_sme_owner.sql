-- Migration to rename roles: 'admin' -> 'superadmin', 'user' -> 'sme-owner'
-- This migration updates the enum type and migrates all existing data

-- Step 1: Add new enum values to app_role
DO $$ 
BEGIN
  -- Add 'superadmin' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'superadmin' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'superadmin';
  END IF;

  -- Add 'sme-owner' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'sme-owner' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'sme-owner';
  END IF;
END $$;

-- Step 2: Migrate existing data
-- Update all 'admin' roles to 'superadmin'
UPDATE public.user_roles
SET role = 'superadmin'::app_role
WHERE role = 'admin'::app_role;

-- Update all 'user' roles to 'sme-owner'
UPDATE public.user_roles
SET role = 'sme-owner'::app_role
WHERE role = 'user'::app_role;

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

-- Step 5: Update has_role function calls in RLS policies
-- Note: We'll update policies that reference 'admin' to use 'superadmin'
-- First, drop existing policies that reference 'admin'
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
  -- User roles policies
  CREATE POLICY "Superadmins can view all roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::app_role));

  CREATE POLICY "Superadmins can manage all roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Companies policies (if they exist)
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

-- Taxonomy policies (if they exist)
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

-- Step 6: Update any other functions or triggers that reference 'admin'
-- Check for any other references in the codebase and update them

-- Note: The old enum values ('admin', 'user') will remain in the enum type
-- but should not be used going forward. They can be removed in a future migration
-- if needed, but keeping them allows for rollback if necessary.

