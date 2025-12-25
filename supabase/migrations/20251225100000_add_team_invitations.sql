-- ============================================================================
-- Add Team Invitations Feature
-- This migration adds:
-- 1. team_invitations table for tracking email invitations
-- 2. invited_to_company_id column on profiles for tracking invited users
-- 3. RLS policies for the new table
-- ============================================================================

-- ============================================================================
-- PART 1: Create team_invitations table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.team_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_team_invitations_token_hash ON public.team_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_team_invitations_company_id ON public.team_invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON public.team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON public.team_invitations(status);

-- Create updated_at trigger
DROP TRIGGER IF EXISTS update_team_invitations_updated_at ON public.team_invitations;
CREATE TRIGGER update_team_invitations_updated_at
  BEFORE UPDATE ON public.team_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- PART 2: Add invited_to_company_id column to profiles
-- ============================================================================

-- Add column to track which company an invited user should join upon approval
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS invited_to_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- ============================================================================
-- PART 3: RLS Policies for team_invitations
-- ============================================================================

-- SME owners can view invitations for companies they are admin of
DROP POLICY IF EXISTS "SME owners can view their company invitations" ON public.team_invitations;
CREATE POLICY "SME owners can view their company invitations"
ON public.team_invitations
FOR SELECT
TO authenticated
USING (
  public.is_sme_owner(auth.uid())
  AND public.is_company_admin(auth.uid(), company_id)
);

-- SME owners can insert invitations for companies they are admin of
DROP POLICY IF EXISTS "SME owners can create invitations" ON public.team_invitations;
CREATE POLICY "SME owners can create invitations"
ON public.team_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_sme_owner(auth.uid())
  AND public.is_company_admin(auth.uid(), company_id)
  AND auth.uid() = invited_by
);

-- SME owners can update invitations for companies they are admin of (for cancel)
DROP POLICY IF EXISTS "SME owners can update invitations" ON public.team_invitations;
CREATE POLICY "SME owners can update invitations"
ON public.team_invitations
FOR UPDATE
TO authenticated
USING (
  public.is_sme_owner(auth.uid())
  AND public.is_company_admin(auth.uid(), company_id)
);

-- Superadmins can view all invitations
DROP POLICY IF EXISTS "Superadmins can view all invitations" ON public.team_invitations;
CREATE POLICY "Superadmins can view all invitations"
ON public.team_invitations
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'::app_role));

-- Superadmins can manage all invitations
DROP POLICY IF EXISTS "Superadmins can manage all invitations" ON public.team_invitations;
CREATE POLICY "Superadmins can manage all invitations"
ON public.team_invitations
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'::app_role));
