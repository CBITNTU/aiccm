-- Read-only seed table for the competency taxonomy (from CSV).
-- Populated only by migrations. Reset copies from here into company_capabilities_ref.
-- Admin edits company_capabilities_ref; this table is never edited by the app.

CREATE TABLE IF NOT EXISTS public.competency_taxonomy_seed (
  id UUID NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  parent_id UUID NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_competency_taxonomy_seed_parent_id
  ON public.competency_taxonomy_seed(parent_id);

COMMENT ON TABLE public.competency_taxonomy_seed IS
  'Canonical competency taxonomy from CSV. Populated by migration. Reset copies this into company_capabilities_ref.';
