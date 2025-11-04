-- Drop the INSERT policy that's causing issues
DROP POLICY IF EXISTS "Users can create VOs for their companies" ON public.virtual_organizations;

-- Create a security definer function to check if user owns a company
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

-- Recreate the INSERT policy using the security definer function
CREATE POLICY "Users can create VOs for their companies" 
ON public.virtual_organizations 
FOR INSERT 
WITH CHECK (public.user_owns_company(auth.uid(), lead_company_id));

-- Also update the UPDATE policy to use the same function
DROP POLICY IF EXISTS "Lead companies can update VOs" ON public.virtual_organizations;

CREATE POLICY "Lead companies can update VOs" 
ON public.virtual_organizations 
FOR UPDATE 
USING (public.user_owns_company(auth.uid(), lead_company_id));