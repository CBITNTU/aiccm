-- Assign admin role to the admin user (only if user exists)
-- Note: This user ID is from a specific environment. 
-- For local development, assign admin role manually via SQL or create a user first.
DO $$ 
DECLARE
  admin_user_id UUID := '001023d7-8e7e-4b23-9cca-daa3d1ed8f2c';
  user_exists BOOLEAN;
BEGIN
  -- Check if the user exists in auth.users
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE id = admin_user_id
  ) INTO user_exists;
  
  -- Only insert if user exists
  IF user_exists THEN
    INSERT INTO user_roles (user_id, role) 
    VALUES (admin_user_id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;