-- ============================================================================
-- Add Onboarding Tracking
-- This migration:
-- 1. Adds onboarding_step, onboarding_completed_at, account_type to profiles
-- 2. Updates handle_new_user() to initialize onboarding_step
-- 3. Migrates existing users (mark their onboarding as complete)
-- ============================================================================

-- ============================================================================
-- PART 1: Add onboarding tracking columns to profiles
-- ============================================================================

-- Add onboarding_step column (1-5, where 5 is complete)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 1;

-- Add onboarding_completed_at column
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP WITH TIME ZONE;

-- Add account_type column (individual or business)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS account_type TEXT CHECK (account_type IN ('individual', 'business'));

-- Create index for faster lookups by onboarding step
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_step ON public.profiles(onboarding_step);

-- ============================================================================
-- PART 2: Update handle_new_user() trigger
-- New users will:
-- - Have approval_status = 'pending'
-- - Have onboarding_step = 1 (start at email verification)
-- - Be assigned 'individual' role by default
-- - NOT have first_name, last_name, job_title yet (collected during onboarding)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile with pending approval status and onboarding step 1
  INSERT INTO public.profiles (
    user_id,
    email,
    first_name,
    last_name,
    job_title,
    approval_status,
    onboarding_step
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.raw_user_meta_data ->> 'job_title',
    'pending',
    1  -- Start at step 1 (email verification)
  );

  -- Assign default 'individual' role
  -- This will be upgraded to sme-owner or sme-member based on onboarding flow
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'individual'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- PART 3: Migrate existing users
-- All existing approved users should have onboarding marked as complete
-- All existing pending users with profile data should also be complete
-- ============================================================================

-- 3.1: Mark approved users as onboarding complete
UPDATE public.profiles
SET
  onboarding_completed_at = COALESCE(approved_at, created_at),
  onboarding_step = 5
WHERE approval_status = 'approved'
AND onboarding_completed_at IS NULL;

-- 3.2: Mark pending users who already have profile data as onboarding complete
-- (These are users who signed up before this migration with the old flow)
UPDATE public.profiles
SET
  onboarding_step = 5,
  onboarding_completed_at = created_at
WHERE approval_status = 'pending'
AND first_name IS NOT NULL
AND last_name IS NOT NULL
AND onboarding_completed_at IS NULL;

-- 3.3: Set account_type based on existing signup_type for users who have it
UPDATE public.profiles
SET account_type = CASE
  WHEN signup_type IN ('new-company', 'join-company', 'invited') THEN 'business'
  WHEN signup_type = 'individual' THEN 'individual'
  ELSE NULL
END
WHERE account_type IS NULL
AND signup_type IS NOT NULL;

-- 3.4: Set account_type based on company ownership/membership for remaining users
UPDATE public.profiles p
SET account_type = 'business'
WHERE p.account_type IS NULL
AND (
  EXISTS (SELECT 1 FROM public.companies c WHERE c.user_id = p.user_id)
  OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = p.user_id)
);

-- Set remaining users as individual
UPDATE public.profiles
SET account_type = 'individual'
WHERE account_type IS NULL
AND onboarding_completed_at IS NOT NULL;
