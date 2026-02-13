-- Migration: Allow approved team members to access company data via RLS
-- Previously, all RLS policies only checked companies.user_id = auth.uid() (owner only).
-- This migration adds an OR condition to also check company_members for approved membership.

-- Helper function: returns TRUE if auth.uid() is the company owner OR an approved team member.
CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = p_company_id AND user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
      AND status = 'approved'
  );
$$;

-- ============================================================
-- companies table: allow team members to SELECT their companies
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own companies" ON public.companies;
CREATE POLICY "Users can view their own companies"
  ON public.companies FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.company_members
      WHERE company_members.company_id = companies.id
        AND company_members.user_id = auth.uid()
        AND company_members.status = 'approved'
    )
  );

-- ============================================================
-- matching_results: allow team members SELECT, UPDATE, INSERT, DELETE
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own matching results" ON public.matching_results;
CREATE POLICY "Users can view their own matching results"
  ON public.matching_results FOR SELECT
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "Users can update their own matching results" ON public.matching_results;
CREATE POLICY "Users can update their own matching results"
  ON public.matching_results FOR UPDATE
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "Users can insert their own matching results" ON public.matching_results;
CREATE POLICY "Users can insert their own matching results"
  ON public.matching_results FOR INSERT
  WITH CHECK (public.is_company_member(company_id));

DROP POLICY IF EXISTS "Users can delete their own matching results" ON public.matching_results;
CREATE POLICY "Users can delete their own matching results"
  ON public.matching_results FOR DELETE
  USING (public.is_company_member(company_id));

-- ============================================================
-- company_capabilities: allow team members SELECT, UPDATE, INSERT, DELETE
-- ============================================================
DROP POLICY IF EXISTS "Company owners can view capabilities" ON public.company_capabilities;
CREATE POLICY "Company owners can view capabilities"
  ON public.company_capabilities FOR SELECT
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "Company owners can manage capabilities" ON public.company_capabilities;
CREATE POLICY "Company owners can manage capabilities"
  ON public.company_capabilities FOR ALL
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

-- ============================================================
-- company_taxonomies: allow team members to manage taxonomies
-- ============================================================
DROP POLICY IF EXISTS "Company owners can view taxonomies" ON public.company_taxonomies;
CREATE POLICY "Company members can view taxonomies"
  ON public.company_taxonomies FOR SELECT
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "Company owners can manage taxonomies" ON public.company_taxonomies;
CREATE POLICY "Company members can manage taxonomies"
  ON public.company_taxonomies FOR ALL
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

-- ============================================================
-- processing_queue: allow team members to view their company's jobs
-- ============================================================
DROP POLICY IF EXISTS "Users can view own company processing jobs" ON public.processing_queue;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'processing_queue'
  ) THEN
    CREATE POLICY "Users can view own company processing jobs"
      ON public.processing_queue FOR SELECT
      USING (public.is_company_member(company_id));
  END IF;
END $$;

-- ============================================================
-- batch_jobs: allow team members to view their company's batches
-- ============================================================
DROP POLICY IF EXISTS "Users can view own company batch jobs" ON public.batch_jobs;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'batch_jobs'
  ) THEN
    CREATE POLICY "Users can view own company batch jobs"
      ON public.batch_jobs FOR SELECT
      USING (
        company_id IS NULL
        OR public.is_company_member(company_id)
      );
  END IF;
END $$;
