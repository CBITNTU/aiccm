-- Add is_active column to company_capabilities_ref table
-- This column indicates whether a capability is currently referenced by any tenders

ALTER TABLE public.company_capabilities_ref
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_company_capabilities_ref_is_active 
ON public.company_capabilities_ref(is_active);

-- Set all existing capabilities to active by default
UPDATE public.company_capabilities_ref
SET is_active = true
WHERE is_active IS NULL;

-- Add comment
COMMENT ON COLUMN public.company_capabilities_ref.is_active IS 
'Indicates whether this capability is currently referenced by any tenders. Capabilities without tenders should be hidden from selection.';
