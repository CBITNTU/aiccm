-- Allow users to delete their own matching results
CREATE POLICY "Users can delete their own matching results" 
ON public.matching_results 
FOR DELETE 
USING (EXISTS ( 
  SELECT 1
  FROM companies
  WHERE ((companies.id = matching_results.company_id) AND (companies.user_id = auth.uid()))
));