-- Drop the existing check constraint
ALTER TABLE public.virtual_organizations 
DROP CONSTRAINT IF EXISTS virtual_organizations_status_check;

-- Add the new check constraint with additional status values
ALTER TABLE public.virtual_organizations
ADD CONSTRAINT virtual_organizations_status_check 
CHECK (status IN ('draft', 'active', 'completed', 'disbanded', 'bin', 'archived'));