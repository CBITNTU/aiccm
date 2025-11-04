-- Simplify the SELECT policy to avoid complex checks
DROP POLICY IF EXISTS "Users can view VOs they're part of" ON public.virtual_organizations;

CREATE POLICY "Users can view VOs they're part of" 
ON public.virtual_organizations 
FOR SELECT 
USING (
  -- User owns the lead company
  public.user_owns_company(auth.uid(), lead_company_id)
  OR
  -- User is a member (checked via security definer to avoid recursion)
  public.user_is_vo_member(auth.uid(), id)
);