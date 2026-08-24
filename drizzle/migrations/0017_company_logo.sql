-- Company logos: uploaded by the company, or auto-discovered from its website.
--
-- `logo_url` always points at our own blob store — we mirror the bytes rather
-- than hotlink the origin, so the URL cannot rot, cannot be swapped for
-- something else by the origin, and leaks no viewer traffic to third parties.
-- Blob pathnames are content-hashed, so a URL is immutable and safe to cache
-- for a year; replacing a logo mints a new URL and deletes the old object.
--
-- `logo_source` gates overwrites: automatic discovery never clobbers 'upload'.
-- `logo_discovery_attempted_at` is stamped on every discovery run including
-- failures, so companies whose sites have no usable logo are not re-crawled by
-- every bulk regeneration.
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "logo_url" text,
  ADD COLUMN IF NOT EXISTS "logo_source" text,
  ADD COLUMN IF NOT EXISTS "logo_updated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "logo_discovery_attempted_at" timestamp with time zone;
--> statement-breakpoint

-- Only three writers ever set this column; a bad value would silently break the
-- "never overwrite a manual upload" rule in companyLogoService.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_logo_source_check'
  ) THEN
    ALTER TABLE "companies"
      ADD CONSTRAINT "companies_logo_source_check"
      CHECK ("logo_source" IS NULL OR "logo_source" IN ('upload', 'website', 'admin'));
  END IF;
END $$;
--> statement-breakpoint

-- The backfill and the queue enqueuer both ask "which companies have a website
-- but no logo and have never been tried?". Partial index keeps that a cheap
-- index scan instead of a seq scan over the whole table.
CREATE INDEX IF NOT EXISTS "companies_logo_pending_idx"
  ON "companies" ("logo_discovery_attempted_at")
  WHERE "logo_url" IS NULL AND "website_url" IS NOT NULL;
