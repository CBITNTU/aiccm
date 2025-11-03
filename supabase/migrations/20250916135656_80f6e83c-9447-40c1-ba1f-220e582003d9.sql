-- Add admin role for current user (replace with actual user ID if needed)
INSERT INTO user_roles (user_id, role) 
VALUES (auth.uid(), 'admin'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;

-- Add RLS policy to allow admins to delete any company
CREATE POLICY "Admins can delete any company" 
ON public.companies 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));