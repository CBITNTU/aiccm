-- Drop the previous policies that might be conflicting
DROP POLICY IF EXISTS "Public can view basic company info" ON public.companies;
DROP POLICY IF EXISTS "Users can view their own companies completely" ON public.companies;

-- Create a single comprehensive policy that allows viewing active companies
-- Field-level security will be handled in the application layer
CREATE POLICY "Everyone can view active companies" ON public.companies
FOR SELECT 
USING (status = 'active');