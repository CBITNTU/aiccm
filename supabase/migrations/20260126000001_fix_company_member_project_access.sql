-- Fix: Allow company members (not just owners) to see and create projects
-- This migration updates RLS policies to include approved company members
-- in addition to company owners

-- ============================================================================
-- STEP 1: Create user_can_access_company function
-- Returns true if user is owner OR approved member of the company
-- ============================================================================

CREATE OR REPLACE FUNCTION public.user_can_access_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM companies WHERE id = _company_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = _company_id
      AND user_id = _user_id
      AND status = 'approved'
  )
$$;

-- ============================================================================
-- STEP 2: Update user_is_vo_member to use user_can_access_company
-- Previously only checked company ownership, now includes company members
-- ============================================================================

CREATE OR REPLACE FUNCTION public.user_is_vo_member(_user_id uuid, _vo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM vo_members vm
    WHERE vm.vo_id = _vo_id
      AND public.user_can_access_company(_user_id, vm.company_id)
  )
$$;

-- ============================================================================
-- STEP 3: Update SELECT policy on virtual_organizations
-- Allow company members (not just owners) to view projects for their company
-- ============================================================================

DROP POLICY IF EXISTS "Project owners can view their projects" ON public.virtual_organizations;

CREATE POLICY "Project owners can view their projects"
ON public.virtual_organizations
FOR SELECT
USING (
  project_owner_id = auth.uid()
  OR
  -- User can access the lead company (owner OR approved member)
  public.user_can_access_company(auth.uid(), lead_company_id)
  OR
  -- User is a member of a company in the VO
  public.user_is_vo_member(auth.uid(), id)
);

-- ============================================================================
-- STEP 4: Update INSERT policy on virtual_organizations
-- Allow all approved company members to create projects (not just owners)
-- ============================================================================

DROP POLICY IF EXISTS "Project owners can create projects" ON public.virtual_organizations;
DROP POLICY IF EXISTS "Company members can create projects" ON public.virtual_organizations;

CREATE POLICY "Company members can create projects"
ON public.virtual_organizations
FOR INSERT
WITH CHECK (
  project_owner_id = auth.uid()
  AND
  public.user_can_access_company(auth.uid(), lead_company_id)
);

-- ============================================================================
-- STEP 5: Update UPDATE policy on virtual_organizations
-- Allow all approved company members to update projects
-- ============================================================================

DROP POLICY IF EXISTS "Project owners can update their projects" ON public.virtual_organizations;
DROP POLICY IF EXISTS "Company members can update projects" ON public.virtual_organizations;

CREATE POLICY "Company members can update projects"
ON public.virtual_organizations
FOR UPDATE
USING (
  project_owner_id = auth.uid()
  OR
  public.user_can_access_company(auth.uid(), lead_company_id)
)
WITH CHECK (
  project_owner_id = auth.uid()
  OR
  public.user_can_access_company(auth.uid(), lead_company_id)
);

-- ============================================================================
-- STEP 6: Update DELETE policy on virtual_organizations
-- Allow project owners AND company admins to delete projects
-- ============================================================================

DROP POLICY IF EXISTS "Project owners can delete their projects" ON public.virtual_organizations;

CREATE POLICY "Project owners can delete their projects"
ON public.virtual_organizations
FOR DELETE
USING (
  project_owner_id = auth.uid()
  OR
  public.is_company_admin(auth.uid(), lead_company_id)
);

-- ============================================================================
-- STEP 7: Update vo_members management policy
-- Allow company admins to manage VO members (not just owners)
-- ============================================================================

DROP POLICY IF EXISTS "Lead companies can manage VO members" ON public.vo_members;

CREATE POLICY "Lead companies can manage VO members"
ON public.vo_members
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.virtual_organizations vo
    WHERE vo.id = vo_members.vo_id
    AND (
      public.user_owns_company(auth.uid(), vo.lead_company_id)
      OR
      public.is_company_admin(auth.uid(), vo.lead_company_id)
    )
  )
);
