-- Add policy to allow all authenticated users to view companies in directory
-- This enables the public company directory feature
-- Sensitive contact info (email, phone, website) is excluded in application queries

CREATE POLICY "Authenticated users can view all companies in directory"
ON public.companies
FOR SELECT
TO authenticated
USING (true);

-- Note: The existing "Users can view their own companies" policy remains active
-- and allows users to access their own companies with full details including contact info