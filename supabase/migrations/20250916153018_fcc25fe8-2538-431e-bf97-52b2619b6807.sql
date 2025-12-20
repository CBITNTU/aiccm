-- Allow users to delete their own matching results (idempotent)
-- Drop policy if it exists (from previous migration)
DROP POLICY IF EXISTS "Users can delete their own matching results" ON public.matching_results;

-- Create the policy (with exception handling for idempotency)
DO $$ 
BEGIN
  CREATE POLICY "Users can delete their own matching results"
  ON public.matching_results
  FOR DELETE
  USING (EXISTS (
    SELECT 1
    FROM companies
    WHERE ((companies.id = matching_results.company_id) AND (companies.user_id = auth.uid()))
  ));
EXCEPTION
  WHEN duplicate_object THEN
    -- Policy already exists, ignore
    NULL;
END $$;;