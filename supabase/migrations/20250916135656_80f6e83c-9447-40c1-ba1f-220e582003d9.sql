-- Add admin role for current user (only if authenticated user exists)
-- Note: This will only work if run in a context with an authenticated user
-- For local development, assign admin role manually via SQL or use migration 20250916135854
DO $$ 
DECLARE
  current_user_id UUID;
BEGIN
  -- Get current user ID (will be NULL in migration context)
  current_user_id := auth.uid();
  
  -- Only insert if we have a valid user ID
  IF current_user_id IS NOT NULL THEN
    INSERT INTO user_roles (user_id, role) 
    VALUES (current_user_id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

-- Add RLS policy to allow admins to delete any company (idempotent)
DROP POLICY IF EXISTS "Admins can delete any company" ON public.companies;

DO $$ 
BEGIN
  CREATE POLICY "Admins can delete any company" 
  ON public.companies 
  FOR DELETE 
  USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION
  WHEN duplicate_object THEN
    -- Policy already exists, ignore
    NULL;
END $$;