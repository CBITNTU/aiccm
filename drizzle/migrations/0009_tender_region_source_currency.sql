-- Multi-region support: tag each tender with the deployment region, the source
-- adapter that produced it, and the currency captured at ingest.
-- Backfill existing rows as UK / GBP (the only deployment that has run so far).

ALTER TABLE "tenders"
  ADD COLUMN IF NOT EXISTS "currency" text,
  ADD COLUMN IF NOT EXISTS "region" text,
  ADD COLUMN IF NOT EXISTS "source" text;
--> statement-breakpoint

-- Backfill region for all legacy rows (single-region history).
UPDATE "tenders" SET "region" = 'uk' WHERE "region" IS NULL;
--> statement-breakpoint

-- Infer source from the existing TED portal URL; everything else is Find a Tender.
UPDATE "tenders"
SET "source" = 'ted'
WHERE "source" IS NULL
  AND "documents" ->> 'specification_url' LIKE 'http%://ted.europa.eu/%';
--> statement-breakpoint

UPDATE "tenders" SET "source" = 'find_tender' WHERE "source" IS NULL;
--> statement-breakpoint

-- TED notices are quoted in EUR; Find a Tender in GBP.
UPDATE "tenders"
SET "currency" = CASE WHEN "source" = 'ted' THEN 'EUR' ELSE 'GBP' END
WHERE "currency" IS NULL;
