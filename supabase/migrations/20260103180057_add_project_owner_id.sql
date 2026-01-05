-- Add project_owner_id to virtual_organizations table
-- This tracks the user who created the project (project owner)
-- Only project owners can view and modify their projects

ALTER TABLE public.virtual_organizations
ADD COLUMN IF NOT EXISTS project_owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_virtual_organizations_project_owner_id 
ON public.virtual_organizations(project_owner_id);

-- Update existing projects to set project_owner_id based on lead_company_id
-- This ensures existing projects have an owner
UPDATE public.virtual_organizations vo
SET project_owner_id = c.user_id
FROM public.companies c
WHERE vo.lead_company_id = c.id
  AND vo.project_owner_id IS NULL;

-- Update RLS policies to use project_owner_id
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view VOs they're part of" ON public.virtual_organizations;
DROP POLICY IF EXISTS "Users can create VOs for their companies" ON public.virtual_organizations;
DROP POLICY IF EXISTS "Lead companies can update VOs" ON public.virtual_organizations;

-- New policy: Project owners can view their projects
CREATE POLICY "Project owners can view their projects"
ON public.virtual_organizations
FOR SELECT
USING (
  project_owner_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM public.vo_members vm 
    JOIN public.companies c ON vm.company_id = c.id 
    WHERE vm.vo_id = virtual_organizations.id 
    AND c.user_id = auth.uid()
  )
);

-- New policy: Project owners can create projects
CREATE POLICY "Project owners can create projects"
ON public.virtual_organizations
FOR INSERT
WITH CHECK (
  project_owner_id = auth.uid()
  AND
  EXISTS (
    SELECT 1 FROM public.companies 
    WHERE id = lead_company_id AND user_id = auth.uid()
  )
);

-- New policy: Project owners can update their projects
CREATE POLICY "Project owners can update their projects"
ON public.virtual_organizations
FOR UPDATE
USING (
  project_owner_id = auth.uid()
)
WITH CHECK (
  project_owner_id = auth.uid()
);

-- New policy: Project owners can delete their projects
CREATE POLICY "Project owners can delete their projects"
ON public.virtual_organizations
FOR DELETE
USING (
  project_owner_id = auth.uid()
);

-- Create a function to automatically set project_owner_id on insert
CREATE OR REPLACE FUNCTION public.set_project_owner_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If project_owner_id is not set, set it to the current user
  IF NEW.project_owner_id IS NULL THEN
    NEW.project_owner_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to automatically set project_owner_id
DROP TRIGGER IF EXISTS trigger_set_project_owner_id ON public.virtual_organizations;
CREATE TRIGGER trigger_set_project_owner_id
  BEFORE INSERT ON public.virtual_organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_project_owner_id();

