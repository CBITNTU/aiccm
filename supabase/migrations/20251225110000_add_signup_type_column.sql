-- ============================================================================
-- Add signup_type column to profiles
-- This tracks how the user signed up: individual, new-company, join-company, invited
-- ============================================================================

-- Add signup_type column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS signup_type TEXT CHECK (signup_type IN ('individual', 'new-company', 'join-company', 'invited'));

-- Create index for faster lookups by signup type
CREATE INDEX IF NOT EXISTS idx_profiles_signup_type ON public.profiles(signup_type);
