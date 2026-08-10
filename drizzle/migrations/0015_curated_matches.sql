-- Superadmin-curated match overrides, layered on top of the computed feed at
-- read time. Kept out of `matching_results` on purpose: `scoreTenderMatch`
-- treats any row there as an AI cache hit and a forced re-run upserts over it,
-- so admin-authored scores stored there would poison the model cache and then be
-- silently destroyed. A separate table also lets curation target a tender that
-- has no match row at all.

CREATE TABLE IF NOT EXISTS "curated_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "company_id" uuid NOT NULL,
  "tender_id" uuid NOT NULL,
  -- draft | published | archived. Only `published` affects a user-facing read.
  "status" text DEFAULT 'draft' NOT NULL,
  -- Display floor, 1-100. NULL means "pin only, don't touch the score".
  "curated_score" integer,
  "pinned" boolean DEFAULT false NOT NULL,
  "pin_rank" integer,
  -- Back-solved breakdown, frozen at publish so the list card and the detail
  -- page can never disagree. NULL when evidence mode produced real numbers.
  "curated_capability_score" integer,
  "curated_experience_score" integer,
  "curated_location_score" integer,
  "curated_certification_score" integer,
  "curated_match_reasons" text[],
  "curated_summary" text,
  -- Private context fed into the deep-research prompt on an evidence re-run.
  "evidence_note" text,
  -- Admin-only justification. Never leaves /api/admin/**.
  "internal_note" text,
  -- Defaults to the tender's deadline; a lapsed curation stops applying.
  "expires_at" timestamp with time zone,
  "created_by" uuid,
  "updated_by" uuid,
  "published_at" timestamp with time zone
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'curated_matches_company_id_tender_id_unique'
  ) THEN
    ALTER TABLE "curated_matches"
      ADD CONSTRAINT "curated_matches_company_id_tender_id_unique"
      UNIQUE ("company_id", "tender_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'curated_matches_company_id_companies_id_fk'
  ) THEN
    ALTER TABLE "curated_matches"
      ADD CONSTRAINT "curated_matches_company_id_companies_id_fk"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'curated_matches_tender_id_tenders_id_fk'
  ) THEN
    ALTER TABLE "curated_matches"
      ADD CONSTRAINT "curated_matches_tender_id_tenders_id_fk"
      FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'curated_matches_created_by_user_id_fk'
  ) THEN
    ALTER TABLE "curated_matches"
      ADD CONSTRAINT "curated_matches_created_by_user_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'curated_matches_updated_by_user_id_fk'
  ) THEN
    ALTER TABLE "curated_matches"
      ADD CONSTRAINT "curated_matches_updated_by_user_id_fk"
      FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "curated_matches_company_status_idx"
  ON "curated_matches" ("company_id", "status");
--> statement-breakpoint

-- The unified feed sorts a company's deep matches by score. The curated
-- overlay's LEFT JOIN makes the absence of this index more expensive.
CREATE INDEX IF NOT EXISTS "matching_results_company_score_idx"
  ON "matching_results" ("company_id", "overall_score");
