-- Quick script to assign admin role to your user
-- Replace 'your-email@example.com' with your actual email

-- First, see all users
SELECT id, email, created_at 
FROM auth.users 
ORDER BY created_at DESC;

-- Then assign admin role (uncomment and replace email)
-- INSERT INTO public.user_roles (user_id, role) 
-- SELECT id, 'admin'::app_role
-- FROM auth.users
-- WHERE email = 'your-email@example.com'
-- ON CONFLICT (user_id, role) DO NOTHING;

-- Verify the role was assigned
-- SELECT ur.*, u.email 
-- FROM public.user_roles ur
-- JOIN auth.users u ON ur.user_id = u.id
-- WHERE u.email = 'your-email@example.com';
