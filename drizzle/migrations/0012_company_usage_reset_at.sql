-- Superadmin usage reset marker. When set, a company's monthly matching/analysis
-- run counts are measured from the later of this instant or the calendar month
-- start, letting an admin reset usage without deleting audit rows.

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "usage_reset_at" timestamp with time zone;
