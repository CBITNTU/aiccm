-- Convert tender budgets from minor units (pence) to major units (whole currency).
-- Data-only migration (no schema change).
--
-- The TED and Find-a-Tender ingest adapters previously multiplied source amounts by
-- 100 ("minor units"), but every human-facing surface treated the value as major
-- units, so budgets displayed 100x too large. We now store major units everywhere.
--
-- IMPORTANT: this migration must ship together with the ingest/embedding code change
-- so existing rows are converted exactly once. New rows already write major units
-- after deploy; running this before the new code is live would double-count them.

UPDATE public.tenders
SET budget_min = ROUND(budget_min / 100.0),
    budget_max = ROUND(budget_max / 100.0)
WHERE budget_min IS NOT NULL OR budget_max IS NOT NULL;
