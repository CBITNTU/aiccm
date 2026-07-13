-- Bilingual reference taxonomies: add a Simplified-Chinese name column alongside
-- the existing English `name` on the markets / standards / competency ref tables.
-- Columns are nullable so this is safe on the live UK DB (English keeps flowing
-- from `name`); the CN deployment surfaces `name_zh` via lib/taxonomy/localizedName.
-- The two competency tables also get `category_zh` (the L1 domain grouping label).
-- Values are populated by the regenerated seeds (drizzle/seed/010–030).

ALTER TABLE "markets"
  ADD COLUMN IF NOT EXISTS "name_zh" text;
--> statement-breakpoint

ALTER TABLE "standards_ref"
  ADD COLUMN IF NOT EXISTS "name_zh" text;
--> statement-breakpoint

ALTER TABLE "competency_taxonomy_seed"
  ADD COLUMN IF NOT EXISTS "name_zh" text,
  ADD COLUMN IF NOT EXISTS "category_zh" text;
--> statement-breakpoint

ALTER TABLE "company_capabilities_ref"
  ADD COLUMN IF NOT EXISTS "name_zh" text,
  ADD COLUMN IF NOT EXISTS "category_zh" text;
