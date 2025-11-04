-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Users can view VO members they're part of" ON public.vo_members;

-- Create a security definer function to check if user is part of a VO
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

-- Recreate the policy using the security definer function
CREATE POLICY "Users can view VO members they're part of" 
ON public.vo_members 
FOR SELECT 
USING (public.user_is_vo_member(auth.uid(), vo_id));