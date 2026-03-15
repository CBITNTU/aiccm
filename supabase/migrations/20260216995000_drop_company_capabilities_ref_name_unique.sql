-- Allow duplicate names in company_capabilities_ref so the same capability name
-- can appear in different branches of the tree (e.g. "Publishing" under different domains).

ALTER TABLE public.company_capabilities_ref
DROP CONSTRAINT IF EXISTS company_capabilities_ref_name_key;
