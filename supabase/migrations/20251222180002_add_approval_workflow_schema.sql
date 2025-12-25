-- ============================================================================
-- Add Approval Workflow Schema
-- This migration adds:
-- 1. Approval status columns to profiles table
-- 2. company_members table for many-to-many user-company relationships
-- 3. company_join_requests table for tracking join requests
-- 4. RLS policies for the new tables
-- 5. Helper functions for role checking
-- ============================================================================

-- ============================================================================
-- PART 1: Add approval status columns to profiles table
-- ============================================================================

-- Add approval_status column with default 'approved' for existing users
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Add approval metadata columns
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ============================================================================
-- PART 2: Create company_members table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- Enable RLS
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_company_members_company_id ON public.company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user_id ON public.company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_status ON public.company_members(status);

-- ============================================================================
-- PART 3: Create company_join_requests table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_join_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  company_name_requested TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved_by_admin', 'approved', 'rejected')),
  admin_approved_at TIMESTAMP WITH TIME ZONE,
  admin_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  superadmin_approved_at TIMESTAMP WITH TIME ZONE,
  superadmin_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id)
);

-- Enable RLS
ALTER TABLE public.company_join_requests ENABLE ROW LEVEL SECURITY;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_company_join_requests_user_id ON public.company_join_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_company_join_requests_company_id ON public.company_join_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_company_join_requests_status ON public.company_join_requests(status);

-- ============================================================================
-- PART 4: Create updated_at triggers for new tables
-- ============================================================================

DROP TRIGGER IF EXISTS update_company_members_updated_at ON public.company_members;
CREATE TRIGGER update_company_members_updated_at
  BEFORE UPDATE ON public.company_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_company_join_requests_updated_at ON public.company_join_requests;
CREATE TRIGGER update_company_join_requests_updated_at
  BEFORE UPDATE ON public.company_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- PART 5: Helper functions
-- ============================================================================

-- Check if user is admin of a specific company via company_members table
CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = _user_id
    AND company_id = _company_id
    AND role = 'admin'
    AND status = 'approved'
  )
$$;

-- Check if user has sme-owner role
CREATE OR REPLACE FUNCTION public.is_sme_owner(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND role = 'sme-owner'::app_role
  )
$$;

-- Check if user is approved (profiles.approval_status = 'approved')
CREATE OR REPLACE FUNCTION public.is_user_approved(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
    AND approval_status = 'approved'
  )
$$;

-- Get user's primary role (highest priority role)
-- Priority: superadmin > sme-owner > sme-member > individual
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::TEXT FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY
    CASE role::TEXT
      WHEN 'superadmin' THEN 1
      WHEN 'sme-owner' THEN 2
      WHEN 'sme-member' THEN 3
      WHEN 'individual' THEN 4
      ELSE 5
    END
  LIMIT 1
$$;

-- ============================================================================
-- PART 6: RLS Policies for company_members
-- ============================================================================

-- Users can view their own memberships
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.company_members;
CREATE POLICY "Users can view their own memberships"
ON public.company_members
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Company admins can view all company memberships
DROP POLICY IF EXISTS "Company admins can view all company memberships" ON public.company_members;
CREATE POLICY "Company admins can view all company memberships"
ON public.company_members
FOR SELECT
TO authenticated
USING (
  public.is_company_admin(auth.uid(), company_id)
);

-- Company admins can insert memberships for their company
DROP POLICY IF EXISTS "Company admins can insert memberships" ON public.company_members;
CREATE POLICY "Company admins can insert memberships"
ON public.company_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_company_admin(auth.uid(), company_id)
);

-- Company admins can update memberships for their company
DROP POLICY IF EXISTS "Company admins can update memberships" ON public.company_members;
CREATE POLICY "Company admins can update memberships"
ON public.company_members
FOR UPDATE
TO authenticated
USING (
  public.is_company_admin(auth.uid(), company_id)
);

-- Company admins can delete memberships for their company
DROP POLICY IF EXISTS "Company admins can delete memberships" ON public.company_members;
CREATE POLICY "Company admins can delete memberships"
ON public.company_members
FOR DELETE
TO authenticated
USING (
  public.is_company_admin(auth.uid(), company_id)
);

-- Superadmins can view all memberships
DROP POLICY IF EXISTS "Superadmins can view all memberships" ON public.company_members;
CREATE POLICY "Superadmins can view all memberships"
ON public.company_members
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'::app_role));

-- Superadmins can manage all memberships
DROP POLICY IF EXISTS "Superadmins can manage all memberships" ON public.company_members;
CREATE POLICY "Superadmins can manage all memberships"
ON public.company_members
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'::app_role));

-- ============================================================================
-- PART 7: RLS Policies for company_join_requests
-- ============================================================================

-- Users can view their own join requests
DROP POLICY IF EXISTS "Users can view their own join requests" ON public.company_join_requests;
CREATE POLICY "Users can view their own join requests"
ON public.company_join_requests
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own join requests
DROP POLICY IF EXISTS "Users can insert their own join requests" ON public.company_join_requests;
CREATE POLICY "Users can insert their own join requests"
ON public.company_join_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Company admins can view join requests for their company
DROP POLICY IF EXISTS "Company admins can view join requests" ON public.company_join_requests;
CREATE POLICY "Company admins can view join requests"
ON public.company_join_requests
FOR SELECT
TO authenticated
USING (
  public.is_company_admin(auth.uid(), company_id)
);

-- Company admins can update join requests for their company (to approve/reject)
DROP POLICY IF EXISTS "Company admins can update join requests" ON public.company_join_requests;
CREATE POLICY "Company admins can update join requests"
ON public.company_join_requests
FOR UPDATE
TO authenticated
USING (
  public.is_company_admin(auth.uid(), company_id)
);

-- Superadmins can view all join requests
DROP POLICY IF EXISTS "Superadmins can view all join requests" ON public.company_join_requests;
CREATE POLICY "Superadmins can view all join requests"
ON public.company_join_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'::app_role));

-- Superadmins can manage all join requests
DROP POLICY IF EXISTS "Superadmins can manage all join requests" ON public.company_join_requests;
CREATE POLICY "Superadmins can manage all join requests"
ON public.company_join_requests
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'::app_role));

-- ============================================================================
-- PART 8: Add RLS policies for superadmins to view all profiles
-- ============================================================================

DROP POLICY IF EXISTS "Superadmins can view all profiles" ON public.profiles;
CREATE POLICY "Superadmins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Superadmins can update all profiles" ON public.profiles;
CREATE POLICY "Superadmins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'::app_role));
