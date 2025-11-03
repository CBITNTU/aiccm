-- Create INSERT policy for tenders table to allow system/admin inserts
CREATE POLICY "System can insert tenders" 
ON public.tenders 
FOR INSERT 
WITH CHECK (true);

-- Also create UPDATE policy for tender status updates
CREATE POLICY "System can update tenders" 
ON public.tenders 
FOR UPDATE 
USING (true);