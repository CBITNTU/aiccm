-- Assign admin role to the admin user
INSERT INTO user_roles (user_id, role) 
VALUES ('001023d7-8e7e-4b23-9cca-daa3d1ed8f2c', 'admin'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;