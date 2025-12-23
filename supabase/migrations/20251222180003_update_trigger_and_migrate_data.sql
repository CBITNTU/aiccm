-- ============================================================================
-- Update handle_new_user trigger and migrate existing data
-- This migration:
-- 1. Updates handle_new_user() to set pending status and individual role
-- 2. Migrates existing users (approve them, create company_members entries)
-- ============================================================================

-- ============================================================================
-- PART 1: Update handle_new_user() trigger
-- New users will:
-- - Have approval_status = 'pending' (requires superadmin approval)
-- - Be assigned 'individual' role by default (upgraded on company association)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile with pending approval status
  INSERT INTO public.profiles (
    user_id,
    email,
    first_name,
    last_name,
    job_title,
    approval_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.raw_user_meta_data ->> 'job_title',
    'pending'
  );

  -- Assign default 'individual' role
  -- This will be upgraded to sme-owner or sme-member based on signup flow
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'individual'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- PART 2: Migrate existing users
-- All existing users should be approved and have company_members entries
-- ============================================================================

-- 2.1: Approve all existing users who don't have an explicit status
-- (The default was 'approved' so this is a safety measure)
UPDATE public.profiles
SET
  approval_status = 'approved',
  approved_at = COALESCE(approved_at, created_at)
WHERE approval_status = 'approved'
AND approved_at IS NULL;

-- 2.2: Migrate existing company owners to company_members table
-- Each company owner becomes an admin in company_members
INSERT INTO public.company_members (
  company_id,
  user_id,
  role,
  status,
  approved_at,
  created_at,
  updated_at
)
SELECT
  c.id AS company_id,
  c.user_id AS user_id,
  'admin' AS role,
  'approved' AS status,
  c.created_at AS approved_at,
  c.created_at AS created_at,
  c.updated_at AS updated_at
FROM public.companies c
WHERE c.user_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.company_members cm
  WHERE cm.company_id = c.id
  AND cm.user_id = c.user_id
)
ON CONFLICT (company_id, user_id) DO NOTHING;

-- 2.3: Ensure all company owners have sme-owner role
-- (They should already have it from previous migration, but let's be safe)
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT c.user_id, 'sme-owner'::app_role
FROM public.companies c
WHERE c.user_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = c.user_id
  AND ur.role = 'sme-owner'::app_role
)
ON CONFLICT (user_id, role) DO NOTHING;

-- 2.4: Users without companies should have 'individual' role
-- First, add 'individual' role to users who don't have any company
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'individual'::app_role
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.companies c WHERE c.user_id = p.user_id
)
AND NOT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.user_id
  AND ur.role = 'individual'::app_role
)
ON CONFLICT (user_id, role) DO NOTHING;
