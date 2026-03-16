-- Add parent_id to company_capabilities_ref for tree (Level 1 / 2 / 3) from competency taxonomy CSV.
-- Existing rows keep category; new seeded rows use parent_id. UI can show both as tree.

ALTER TABLE public.company_capabilities_ref
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.company_capabilities_ref(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_company_capabilities_ref_parent_id
ON public.company_capabilities_ref(parent_id);
