-- Scope an evidence note to the dimensions it actually vouches for.
--
-- `scoreTenderMatch` treats a present evidence note as direct company data,
-- which lifts both the missing-data zero and the 30% indirect-data penalty. It
-- previously did that for capability, experience AND certification at once, so a
-- note about (say) a framework agreement also vouched for certifications the
-- company had never listed — and certification carries 50% of the overall score.
--
-- NULL / empty means the note informs the model but lifts no gate, which is the
-- safe default for every row written before this migration.
ALTER TABLE "curated_matches"
  ADD COLUMN IF NOT EXISTS "evidence_dimensions" text[];
--> statement-breakpoint

-- The tender FK cascades on delete; Postgres does not index FK children
-- automatically, so a tender delete would otherwise seq-scan this table.
CREATE INDEX IF NOT EXISTS "curated_matches_tender_idx"
  ON "curated_matches" ("tender_id");
