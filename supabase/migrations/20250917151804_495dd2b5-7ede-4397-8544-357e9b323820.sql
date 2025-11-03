-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Everyone can view active companies" ON public.companies;

-- Create a new policy that allows everyone to view only non-sensitive company information
CREATE POLICY "Public can view basic company info" ON public.companies
FOR SELECT 
USING (
  status = 'active'
  AND (
    -- Allow access to basic fields only for non-owners
    auth.uid() != user_id OR auth.uid() IS NULL
  )
);

-- Create a policy that allows company owners to view their own complete company data
CREATE POLICY "Users can view their own companies completely" ON public.companies
FOR SELECT 
USING (auth.uid() = user_id);

-- Note: We need to handle field-level security in the application layer since PostgreSQL RLS 
-- doesn't support column-level restrictions directly. We'll modify the queries to only 
-- select appropriate fields based on ownership.