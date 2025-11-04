-- Drop the problematic SELECT policy on virtual_organizations
DROP POLICY IF EXISTS "Users can view VOs they're part of" ON public.virtual_organizations;

-- Create a security definer function to check if user can view a VO
-- (either as lead company owner or as a member company owner)
CREATE OR REPLACE FUNCTION public.user_can_view_vo(_user_id uuid, _vo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- User owns the lead company
    SELECT 1
    FROM virtual_organizations vo
    JOIN companies c ON c.id = vo.lead_company_id
    WHERE vo.id = _vo_id
      AND c.user_id = _user_id
  ) OR EXISTS (
    -- User owns a member company
    SELECT 1
    FROM vo_members vm
    JOIN companies c ON c.id = vm.company_id
    WHERE vm.vo_id = _vo_id
      AND c.user_id = _user_id
  )
$$;

-- Recreate the SELECT policy using the security definer function
CREATE POLICY "Users can view VOs they're part of" 
ON public.virtual_organizations 
FOR SELECT 
USING (public.user_can_view_vo(auth.uid(), id));