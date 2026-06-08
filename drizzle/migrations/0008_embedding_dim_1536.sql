-- Resize embedding columns for OpenAI text-embedding-3-small (1536 dims).
-- Clears existing vectors — run `npm run embed:backfill` after migrate.

DROP INDEX IF EXISTS "tenders_embedding_hnsw_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "companies_embedding_hnsw_idx";
--> statement-breakpoint

UPDATE "companies"
SET
  "embedding" = NULL,
  "embedding_generated_at" = NULL,
  "embedding_source_hash" = NULL
WHERE "embedding" IS NOT NULL;
--> statement-breakpoint

UPDATE "tenders"
SET
  "embedding" = NULL,
  "embedding_generated_at" = NULL,
  "embedding_source_hash" = NULL
WHERE "embedding" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "companies"
  ALTER COLUMN "embedding" TYPE vector(1536);
--> statement-breakpoint

ALTER TABLE "tenders"
  ALTER COLUMN "embedding" TYPE vector(1536);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tenders_embedding_hnsw_idx"
  ON "tenders"
  USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "companies_embedding_hnsw_idx"
  ON "companies"
  USING hnsw ("embedding" vector_cosine_ops);
