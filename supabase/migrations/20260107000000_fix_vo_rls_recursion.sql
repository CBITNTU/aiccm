-- Fix infinite recursion in virtual_organizations RLS policy
-- The SELECT policy was directly querying vo_members which caused recursion
-- Replace it with security definer functions that bypass RLS

-- Drop the problematic policy
DROP POLICY IF EXISTS "Project owners can view their projects" ON public.virtual_organizations;

-- Ensure security definer functions exist (idempotent)
CREATE OR REPLACE FUNCTION public.user_owns_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM companies
    WHERE id = _company_id
      AND user_id = _user_id
  )
$$;

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
    JOIN companies c ON c.id = vm.company_id
    WHERE vm.vo_id = _vo_id
      AND c.user_id = _user_id
  )
$$;

-- Recreate the SELECT policy using security definer functions to avoid recursion
CREATE POLICY "Project owners can view their projects"
ON public.virtual_organizations
FOR SELECT
USING (
  project_owner_id = auth.uid()
  OR
  -- User owns the lead company (using security definer to avoid recursion)
  public.user_owns_company(auth.uid(), lead_company_id)
  OR
  -- User is a member (using security definer to avoid recursion)
  public.user_is_vo_member(auth.uid(), id)
);
